// Prompt 16: optional embeddings from a local Ollama model or Gemini, persisted vectors, and hybrid ranking.
import { assert, boot, createVault, idle, openAssistant, paths, run, sleep, startObsidian, test, unload, within } from "./support.mjs"

// Deterministic fake embedding: one dimension per concept group, so meaning can match without shared words.
const GROUPS = [
  ["harbor", "sea", "captain", "master", "ship", "docks", "sailor"],
  ["forge", "fire", "smith", "anvil", "ember"],
  ["lantern", "light", "oil", "glow"],
  ["poison", "venom", "toxin"],
]
const embed = text => {
  const words = String(text).toLowerCase().match(/[a-z]+/g) ?? []
  return [...GROUPS.map(group => words.filter(word => group.includes(word)).length), 0.01, 0.01, 0.01, 0.01]
}

const isEmbedding = url => /\/api\/embed\b|:batchEmbedContents|:embedContent/.test(String(url))

/** Routes both fetch and requestUrl embedding calls to one fake server and records them. */
function fakeEmbeddingServer(env, { fail = () => false } = {}) {
  const calls = []
  const handle = (url, body) => {
    const payload = typeof body === "string" ? JSON.parse(body) : body
    calls.push({ url: String(url), payload })
    const failure = fail(calls.length, url)
    if (failure) return failure
    if (/\/api\/embed\b/.test(String(url))) return { status: 200, json: { embeddings: [].concat(payload.input).map(embed) } }
    const requests = payload.requests ?? [payload]
    return { status: 200, json: { embeddings: requests.map(request => ({ values: embed(request.content.parts.map(part => part.text).join(" ")) })) } }
  }
  const previousFetch = env.network.fetch
  env.network.fetch = async (url, options) => {
    if (!isEmbedding(url)) return previousFetch?.(url, options)
    const result = handle(url, options?.body)
    if (result === "offline") throw new TypeError("Failed to fetch")
    return { ok: result.status < 400, status: result.status, json: async () => result.json, body: null }
  }
  const previousRequest = env.network.requestUrl
  env.network.requestUrl = async options => {
    if (!isEmbedding(options.url)) return previousRequest(options)
    const result = handle(options.url, options.body)
    if (result === "offline") throw new Error("net::ERR_CONNECTION_REFUSED")
    return { status: result.status, json: result.json, text: JSON.stringify(result.json) }
  }
  return calls
}

function semanticVault() {
  const env = createVault()
  env.addFile("Campaigns/Glass/Npcs/Erin.md", "# Erin\nErin is the harbor master of Glassgate.", { type: "npc" })
  env.addFile("Campaigns/Glass/Npcs/Tom.md", "# Tom\nTom works the forge as a smith.", { type: "npc" })
  env.addFile("Campaigns/Ember/Campaign.md", "Campaign: Ember.", { type: "campaign", system: "dnd5e" })
  env.addFile("Campaigns/Ember/Npcs/Vera.md", "# Vera\nVera is a sailor and ship captain.", { type: "npc" })
  return env
}

async function waitEmbedded(plugin, milliseconds = 8000) {
  assert.equal(typeof plugin.index.whenEmbedded, "function", "contract: plugin.index.whenEmbedded() exists")
  await within(milliseconds, plugin.index.whenEmbedded(), "plugin.index.whenEmbedded()")
}

async function withProvider(env, provider, extra = {}) {
  const plugin = await boot(env)
  Object.assign(plugin.settings, { apiKey: "AIzaTEST", embeddingProvider: provider }, extra)
  assert.equal(typeof plugin.applyEmbeddingSettings, "function", "contract: plugin.applyEmbeddingSettings() exists")
  await plugin.applyEmbeddingSettings()
  startObsidian(env)
  await idle(plugin)
  return plugin
}

test("the default provider is none and the whole flow sends no embedding requests", async () => {
  const env = semanticVault()
  const plugin = await boot(env)
  assert.equal(plugin.settings.embeddingProvider, "none")
  startObsidian(env)
  await idle(plugin)
  plugin.index.search("sea captain")
  await sleep(100)
  assert.deepEqual(env.requests.filter(request => isEmbedding(request.url)), [])
  await unload(plugin)
})

test("Ollama embeds documents and queries with EmbeddingGemma prefixes in batches", async () => {
  const env = semanticVault()
  const calls = fakeEmbeddingServer(env)
  const plugin = await withProvider(env, "ollama")
  await waitEmbedded(plugin)
  assert.equal(plugin.settings.ollamaUrl, "http://127.0.0.1:11434")
  assert.equal(plugin.settings.ollamaModel, "embeddinggemma")
  const documents = calls.filter(call => call.url === "http://127.0.0.1:11434/api/embed")
  assert.ok(documents.length >= 1, "document batches sent to /api/embed")
  for (const call of documents) {
    assert.equal(call.payload.model, "embeddinggemma")
    assert.ok(Array.isArray(call.payload.input) && call.payload.input.length <= 32)
  }
  assert.ok(documents.flatMap(call => call.payload.input).some(input => input.startsWith("title: Erin | text: ")), "document prefix uses the note title")
  const before = calls.length
  await plugin.index.hybridSearch("sea captain")
  assert.ok(calls.length > before, "query embedding requested")
  assert.ok([].concat(calls.at(-1).payload.input)[0].startsWith("task: search result | query: "))
  await unload(plugin)
})

test("hybrid search finds a note by meaning within the scope, without shared words", async () => {
  const env = semanticVault()
  fakeEmbeddingServer(env)
  const plugin = await withProvider(env, "ollama")
  await waitEmbedded(plugin)
  assert.equal(typeof plugin.index.hybridSearch, "function", "contract: plugin.index.hybridSearch(query, scope?, limit?) exists")
  const hits = await plugin.index.hybridSearch("sea captain")
  assert.equal(paths(hits)[0], "Campaigns/Glass/Npcs/Erin.md", `hybrid results ${JSON.stringify(paths(hits))}`)
  assert.ok(!paths(hits).includes("Campaigns/Ember/Npcs/Vera.md"), "a vector hit outside the scope was returned")
  assert.deepEqual(paths(plugin.index.search("sea captain")).filter(path => path.includes("Erin")), [], "precondition: no lexical match")
  const view = await openAssistant(env, plugin)
  const context = await view.buildContext("sea captain")
  assert.ok(context.slice(context.indexOf("## Retrieved")).includes("[[Campaigns/Glass/Npcs/Erin.md"), "## Retrieved does not use hybrid search")
  await unload(plugin)
})

test("Gemini embeddings use batchEmbedContents with task types and dimensions, and retry after 429", async () => {
  const env = semanticVault()
  const calls = fakeEmbeddingServer(env, { fail: count => count === 1 ? { status: 429, json: { error: { code: 429, message: "slow down" } } } : false })
  const plugin = await withProvider(env, "gemini")
  await waitEmbedded(plugin, 12000)
  assert.equal(plugin.settings.geminiEmbeddingModel, "gemini-embedding-001")
  assert.equal(plugin.settings.embeddingDimensions, 768)
  const batches = calls.filter(call => call.url.includes("models/gemini-embedding-001:batchEmbedContents"))
  assert.ok(batches.length >= 2, "the 429 batch is retried")
  for (const request of batches.flatMap(call => call.payload.requests)) {
    assert.equal(request.taskType, "RETRIEVAL_DOCUMENT")
    assert.equal(request.outputDimensionality, 768)
  }
  assert.equal(paths(await plugin.index.hybridSearch("sea captain"))[0], "Campaigns/Glass/Npcs/Erin.md")
  assert.ok(calls.some(call => JSON.stringify(call.payload).includes("RETRIEVAL_QUERY")), "query uses RETRIEVAL_QUERY")
  await unload(plugin)
}, 20000)

test("an unreachable Ollama falls back to lexical search with one localised notice", async () => {
  const env = semanticVault()
  for (let index = 0; index < 80; index++) env.addFile(`Campaigns/Glass/Lore/L${index}.md`, `# Lore ${index}\nThe lantern glow ${index}.`, { type: "lore" })
  fakeEmbeddingServer(env, { fail: () => "offline" })
  const plugin = await withProvider(env, "ollama")
  await waitEmbedded(plugin)
  assert.equal(typeof plugin.strings.assistantEmbeddingUnavailable, "string", "contract: string key assistantEmbeddingUnavailable")
  const hits = await plugin.index.hybridSearch("harbor master")
  assert.equal(paths(hits)[0], "Campaigns/Glass/Npcs/Erin.md", "lexical results still returned")
  assert.equal(env.notices.filter(notice => notice === plugin.strings.assistantEmbeddingUnavailable).length, 1, `notices ${JSON.stringify(env.notices)}`)
  await unload(plugin)
})

test("vectors persist across restarts, and a model change re-embeds without re-reading notes", async () => {
  const first = semanticVault()
  const firstCalls = fakeEmbeddingServer(first)
  const plugin = await withProvider(first, "ollama")
  await waitEmbedded(plugin)
  await unload(plugin)
  assert.ok(first.binaryWrites.includes(".rpgvault/cache/assistant/vectors.bin"), `binary writes ${JSON.stringify(first.binaryWrites)}`)
  const embeddedInputs = firstCalls.flatMap(call => [].concat(call.payload.input)).length
  assert.ok(embeddedInputs >= 3)

  const second = semanticVault()
  for (const [key, value] of first.adapterFiles) second.adapterFiles.set(key, value)
  for (const [filePath, entry] of first.files) if (second.files.has(filePath)) second.files.get(filePath).file.stat = { ...entry.file.stat }
  const secondCalls = fakeEmbeddingServer(second)
  const restarted = await withProvider(second, "ollama")
  await waitEmbedded(restarted)
  assert.equal(secondCalls.length, 0, `unchanged chunks re-embedded: ${secondCalls.length} requests`)
  const readsBefore = second.reads.length
  restarted.settings.ollamaModel = "qwen3-embedding:0.6b"
  await restarted.applyEmbeddingSettings()
  await waitEmbedded(restarted)
  assert.ok(secondCalls.some(call => call.payload.model === "qwen3-embedding:0.6b"), "documents re-embedded with the new model")
  assert.deepEqual(second.reads.slice(readsBefore), [], "notes were re-read after a model change")
  await unload(restarted)
})

test("the settings tab renders the embedding provider settings", async () => {
  const env = createVault()
  const plugin = await boot(env)
  const tab = plugin.settingTabs[0]
  tab.display()
  for (const key of ["settingsEmbeddingProvider", "settingsOllamaUrl", "settingsOllamaModel", "settingsEmbeddingTest"]) {
    assert.equal(typeof plugin.strings[key], "string", `contract: string key ${key}`)
    assert.ok(env.settingByName(tab.containerEl, plugin.strings[key]), `setting ${key} rendered`)
  }
  await unload(plugin)
})

await run("16-embeddings")
