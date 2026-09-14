// Prompt 17: compact binary vectors, recovery after a provider outage, and no vectors for deleted notes.
import { assert, boot, createVault, idle, paths, run, sleep, startObsidian, test, unload, within } from "./support.mjs"

const DIMENSIONS = 768
const vector = text => {
  const values = new Array(DIMENSIONS).fill(0.001)
  for (const word of String(text).toLowerCase().match(/[a-z]+/g) ?? []) values[[...word].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % DIMENSIONS] += 1
  return values
}

function ollama(env, state) {
  env.network.requestUrl = async options => {
    if (!/\/api\/embed\b/.test(String(options.url))) return { status: 200, json: {} }
    if (state.down) throw new Error("net::ERR_CONNECTION_REFUSED")
    const inputs = [].concat(JSON.parse(options.body).input)
    state.inputs.push(...inputs)
    return { status: 200, json: { embeddings: inputs.map(vector) } }
  }
}

async function start(env, state) {
  ollama(env, state)
  const plugin = await boot(env)
  plugin.settings.embeddingProvider = "ollama"
  await plugin.applyEmbeddingSettings()
  startObsidian(env)
  await idle(plugin)
  await within(20000, plugin.index.whenEmbedded(), "whenEmbedded")
  return plugin
}

test("vectors.bin stores raw Float32 data, not text", async () => {
  const env = createVault()
  const state = { inputs: [] }
  for (let index = 0; index < 300; index++) env.addFile(`Campaigns/Glass/Lore/L${index}.md`, `# Lore ${index}\nThe harbor lantern ${index} glows.`, { type: "lore" })
  const plugin = await start(env, state)
  await unload(plugin)
  const binary = env.adapterFiles.get(".rpgvault/cache/assistant/vectors.bin")
  assert.ok(binary instanceof ArrayBuffer, "vectors.bin written through writeBinary")
  const vectors = state.inputs.length
  const raw = vectors * DIMENSIONS * 4
  assert.ok(binary.byteLength <= raw + 64 * 1024, `vectors.bin is ${binary.byteLength} bytes for ${vectors} vectors (raw Float32 ${raw})`)
  assert.notEqual(new Uint8Array(binary)[0], "{".charCodeAt(0), "vectors.bin starts like JSON")
  const manifest = JSON.parse(env.adapterFiles.get(".rpgvault/cache/assistant/manifest.json"))
  assert.ok(JSON.stringify(manifest).length < raw / 2, "the manifest must not carry the vectors")
})

test("after an outage, the next index change resumes embedding", async () => {
  const env = createVault()
  const state = { inputs: [], down: true }
  env.addFile("Campaigns/Glass/Npcs/Erin.md", "# Erin\nErin is the harbor master.", { type: "npc" })
  const plugin = await start(env, state)
  assert.equal(state.inputs.length, 0)
  state.down = false
  env.editFile("Campaigns/Glass/Npcs/Erin.md", "# Erin\nErin is the harbor master of Glassgate.", { type: "npc" })
  await idle(plugin)
  await sleep(50)
  await within(10000, plugin.index.whenEmbedded(), "whenEmbedded after recovery")
  assert.ok(state.inputs.some(input => input.includes("Glassgate")), "no embedding requests after the provider came back")
  await unload(plugin)
})

test("deleting notes removes their vectors from memory and from the persisted cache", async () => {
  const env = createVault()
  const state = { inputs: [] }
  for (let index = 0; index < 40; index++) env.addFile(`Campaigns/Glass/Lore/L${index}.md`, `# Lore ${index}\nText ${index}.`, { type: "lore" })
  const plugin = await start(env, state)
  for (let index = 0; index < 40; index++) {
    const file = env.files.get(`Campaigns/Glass/Lore/L${index}.md`).file
    env.files.delete(file.path)
    env.emit("delete", file)
  }
  await idle(plugin)
  assert.deepEqual(paths(await plugin.index.hybridSearch("lore text", undefined, 100)).filter(path => path.includes("/Lore/")), [])
  await unload(plugin)
  const manifest = JSON.stringify(JSON.parse(env.adapterFiles.get(".rpgvault/cache/assistant/manifest.json")))
  assert.ok(!manifest.includes("/Lore/L"), "deleted notes are still referenced by the persisted cache")
  const binary = env.adapterFiles.get(".rpgvault/cache/assistant/vectors.bin")
  const remaining = state.inputs.length - 40
  assert.ok(!binary || binary.byteLength <= Math.max(0, remaining) * DIMENSIONS * 4 + 64 * 1024, `vectors.bin still ${binary?.byteLength} bytes`)
})

await run("17-corrections")
