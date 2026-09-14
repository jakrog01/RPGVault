// Prompt 18: one embedding-unavailable notice per outage, however many saves or questions happen during it.
import { assert, boot, createVault, idle, run, sleep, startObsidian, test, unload, within } from "./support.mjs"

const vector = text => {
  const values = new Array(16).fill(0.01)
  for (const word of String(text).toLowerCase().match(/[a-z]+/g) ?? []) values[[...word].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 16] += 1
  return values
}

async function setUp() {
  const env = createVault()
  const state = { down: true, requests: 0 }
  env.addFile("Campaigns/Glass/Npcs/Erin.md", "# Erin\nHarbor master.", { type: "npc" })
  env.network.requestUrl = async options => {
    if (!/\/api\/embed\b/.test(String(options.url))) return { status: 200, json: {} }
    state.requests++
    if (state.down) throw new Error("net::ERR_CONNECTION_REFUSED")
    return { status: 200, json: { embeddings: [].concat(JSON.parse(options.body).input).map(vector) } }
  }
  const plugin = await boot(env)
  plugin.settings.embeddingProvider = "ollama"
  await plugin.applyEmbeddingSettings()
  startObsidian(env)
  await idle(plugin)
  await within(5000, plugin.index.whenEmbedded(), "whenEmbedded")
  const notices = () => env.notices.filter(notice => notice === plugin.strings.assistantEmbeddingUnavailable).length
  const save = async text => {
    env.editFile("Campaigns/Glass/Npcs/Erin.md", `# Erin\n${text}`, { type: "npc" })
    await idle(plugin)
    await sleep(30)
    await within(5000, plugin.index.whenEmbedded(), "whenEmbedded")
  }
  return { env, plugin, state, notices, save }
}

test("saves and questions during one continuing outage show a single notice", async () => {
  const { plugin, notices, save } = await setUp()
  assert.equal(notices(), 1, "the outage is reported at startup")
  for (let index = 0; index < 5; index++) await save(`Harbor master edit ${index}.`)
  for (let index = 0; index < 3; index++) await plugin.index.hybridSearch("harbor")
  assert.equal(notices(), 1, `notices during one outage: ${notices()}`)
  await unload(plugin)
})

test("a new outage after a recovery is reported again, once", async () => {
  const { plugin, state, notices, save } = await setUp()
  state.down = false
  await save("Harbor master recovered.")
  assert.ok(state.requests >= 2, "embedding resumed after recovery")
  state.down = true
  await save("Harbor master second outage.")
  await save("Harbor master second outage again.")
  await plugin.index.hybridSearch("harbor")
  assert.equal(notices(), 2, `notices after two outages: ${notices()}`)
  await unload(plugin)
})

await run("18-outage-notice")
