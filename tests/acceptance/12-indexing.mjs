// Prompt 12: the assistant index is incremental, non-blocking, persistent, and never serves stale scope or flags.
import { assert, boot, createVault, idle, openAssistant, paths, run, sleep, startObsidian, test, unload, until, within } from "./support.mjs"

const NOTES = 1500
const npc = index => `Campaigns/Glass/Npcs/N${index}.md`
const body = index => `# About\nToken${index}alpha lives by the harbor.\n\n# Motives\nWants lanterns.\n\n# Secrets\nHides a key.`

function largeVault(options) {
  const env = createVault(options)
  for (let index = 0; index < NOTES; index++) env.addFile(npc(index), body(index), { type: "npc" })
  return env
}

const readsOf = (env, since) => env.reads.slice(since)

test("onload does not wait for indexing", async () => {
  const env = largeVault()
  const started = Date.now()
  const plugin = await boot(env)
  assert.ok(Date.now() - started < 500, `onload took ${Date.now() - started} ms`)
  assert.ok(env.reads.length < NOTES / 10, `onload read ${env.reads.length} notes before resolving`)
  await unload(plugin)
})

test("initial indexing reads each note once and makes every note searchable", async () => {
  const env = largeVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 8000)
  const npcReads = env.reads.filter(item => item.startsWith("Campaigns/Glass/Npcs/"))
  assert.equal(npcReads.length, NOTES, `read ${npcReads.length} npc notes`)
  for (const index of [0, 749, NOTES - 1]) assert.equal(paths(plugin.index.search(`token${index}alpha`))[0], npc(index))
  await unload(plugin)
})

test("metadata resolved events after startup do not trigger re-reading", async () => {
  const env = largeVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 8000)
  const before = env.reads.length
  for (let count = 0; count < 10; count++) env.emit("resolved")
  await sleep(50)
  await idle(plugin)
  assert.deepEqual(readsOf(env, before), [])
  await unload(plugin)
})

test("editing one note re-reads only that note and updates results", async () => {
  const env = largeVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 8000)
  const before = env.reads.length
  env.editFile(npc(10), "# About\nBrightquillsigma replaced the old text.", { type: "npc" })
  await idle(plugin)
  assert.deepEqual(readsOf(env, before), [npc(10)])
  assert.ok(!paths(plugin.index.search("token10alpha", undefined, 1000)).includes(npc(10)), "old text no longer matches the edited note")
  assert.equal(paths(plugin.index.search("brightquillsigma"))[0], npc(10))
  await unload(plugin)
})

test("indexing 1500 notes and one edit write the cache at most twice", async () => {
  const env = largeVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 8000)
  env.editFile(npc(3), "# About\nChanged.", { type: "npc" })
  await idle(plugin)
  await unload(plugin)
  const cacheWrites = env.writes.filter(item => item.startsWith(".rpgvault/cache/"))
  assert.ok(cacheWrites.length >= 1, "the cache is written by unload at the latest")
  assert.ok(cacheWrites.length <= 4, `cache written ${cacheWrites.length} times (temp and final count separately)`)
})

test("a frontmatter-only change to gm-only hides the note from a player run", async () => {
  const env = createVault()
  env.addFile("Runs/Harbor-Player/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Harbor-Player/State.md", "")
  env.files.get("Active.md").frontmatter.run = "[[Runs/Harbor-Player/Run]]"
  env.addFile("Parties/Watch/Ledger.md", "The moonlit ledger is under the floor.", { type: "item" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("moonlit ledger")), ["Parties/Watch/Ledger.md"])
  env.editFile("Parties/Watch/Ledger.md", "The moonlit ledger is under the floor.", { type: "item", "gm-only": true })
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("moonlit ledger")), [])
  await unload(plugin)
})

test("a frontmatter-only change to assistant: exclude removes the note from a GM run", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Rumour.md", "The copper bell rings at dawn.", { type: "lore" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.equal(paths(plugin.index.search("copper bell")).length, 1)
  env.editFile("Campaigns/Glass/Rumour.md", "The copper bell rings at dawn.", { type: "lore", assistant: "exclude" })
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("copper bell")), [])
  await unload(plugin)
})

test("switching the active run without an event changes the scope on the next query", async () => {
  const env = createVault()
  env.addFile("Campaigns/Ember/Campaign.md", "Campaign: Ember.", { type: "campaign", system: "dnd5e" })
  env.addFile("Campaigns/Ember/Forge.md", "The obsidian forge never cools.", { type: "location" })
  env.addFile("Campaigns/Glass/Docks.md", "The tarred docks creak.", { type: "location" })
  env.addFile("Runs/Ember/Run.md", "", { type: "run", role: "gm", campaign: "[[Campaigns/Ember/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Ember/State.md", "")
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("forge never cools")), [])
  assert.equal(paths(plugin.index.search("tarred docks")).length, 1)
  env.files.get("Active.md").frontmatter.run = "[[Runs/Ember/Run]]"
  assert.deepEqual(paths(plugin.index.search("forge never cools")), ["Campaigns/Ember/Forge.md"])
  assert.deepEqual(paths(plugin.index.search("tarred docks")), [])
  await unload(plugin)
})

test("queries do not resolve the run context per chunk", async () => {
  const env = largeVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 8000)
  let calls = 0
  const original = plugin.currentContext.bind(plugin)
  plugin.currentContext = () => { calls++; return original() }
  for (let count = 0; count < 20; count++) plugin.index.search("harbor lanterns")
  assert.ok(calls <= 20, `currentContext called ${calls} times for 20 queries`)
  await unload(plugin)
})

test("rename and delete update results", async () => {
  const env = createVault()
  const file = env.addFile("Campaigns/Glass/Old.md", "The silver compass points north.", { type: "item" })
  env.addFile("Campaigns/Glass/Gone.md", "The broken hourglass leaks sand.", { type: "item" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const entry = env.files.get("Campaigns/Glass/Old.md")
  env.files.delete("Campaigns/Glass/Old.md")
  const renamed = env.addFile("Campaigns/Glass/New.md", entry.content, entry.frontmatter)
  env.emit("rename", renamed, file.path)
  const gone = env.files.get("Campaigns/Glass/Gone.md").file
  env.files.delete("Campaigns/Glass/Gone.md")
  env.emit("delete", gone)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("silver compass")), ["Campaigns/Glass/New.md"])
  assert.deepEqual(paths(plugin.index.search("broken hourglass")), [])
  await unload(plugin)
})

test("a restart reuses the cache: unchanged notes are not re-read, removed notes are dropped, changed notes are fresh", async () => {
  const first = createVault()
  for (let index = 0; index < 50; index++) first.addFile(npc(index), body(index), { type: "npc" })
  const plugin = await boot(first)
  startObsidian(first)
  await idle(plugin)
  await unload(plugin)
  assert.ok([...first.adapterFiles.keys()].some(key => key.startsWith(".rpgvault/cache/")), "unload persists the cache")

  const second = createVault({ adapterFiles: first.adapterFiles })
  for (let index = 0; index < 50; index++) {
    if (index === 7) continue
    const original = first.files.get(npc(index))
    const file = second.addFile(npc(index), original.content, original.frontmatter)
    file.stat = { ...original.file.stat }
  }
  second.files.get(npc(8)).content = "# About\nNewtokenomega arrived."
  second.files.get(npc(8)).file.stat = { ctime: 1, mtime: 99_999_999, size: 30 }
  const restarted = await boot(second)
  startObsidian(second)
  await idle(restarted)
  const npcReads = second.reads.filter(item => item.startsWith("Campaigns/Glass/Npcs/"))
  assert.deepEqual(npcReads, [npc(8)], `re-read ${npcReads.length} notes`)
  const everything = paths(restarted.index.search("token7alpha token8alpha harbor", undefined, 1000))
  assert.ok(!everything.includes(npc(7)), "a note deleted while closed is dropped")
  assert.ok(!paths(restarted.index.search("token8alpha", undefined, 1000)).includes(npc(8)), "a note changed while closed has no stale text")
  assert.equal(paths(restarted.index.search("newtokenomega"))[0], npc(8))
  const ids = restarted.index.search("harbor", undefined, 1000).map(hit => hit.chunk.id)
  assert.equal(ids.length, new Set(ids).size, "no duplicate chunks after restoring the cache")
  await unload(restarted)
})

test("the assistant status line updates by itself when indexing finishes", async () => {
  const env = createVault()
  for (let index = 0; index < 30; index++) env.addFile(npc(index), body(index), { type: "npc" })
  const plugin = await boot(env)
  const view = await openAssistant(env, plugin)
  startObsidian(env)
  await idle(plugin)
  const statusText = () => {
    const status = []
    const find = element => { if (element.classes?.has("tt-as-status")) status.push(element); element.children?.forEach(find) }
    find(view.contentEl)
    const text = element => `${element.ownText ?? ""}${(element.children ?? []).map(text).join("")}`
    return status.map(text).join(" ")
  }
  assert.equal(typeof plugin.index.stats, "function", "contract: plugin.index.stats() exists")
  const stats = plugin.index.stats()
  assert.ok(stats.notes >= 30 && stats.chunks >= 90 && stats.pending === 0, `stats were ${JSON.stringify(stats)}`)
  const expected = plugin.strings.assistantIndexed.replace(/\{(\w+)\}/g, (_match, key) => String(stats[key]))
  await until(() => statusText().includes(expected), 3000, `status shows ${JSON.stringify(expected)}, was ${JSON.stringify(statusText())}`)
  await unload(plugin)
})

await run("12-indexing")
