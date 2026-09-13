// Prompt 13: corrections found while reviewing prompt 12's index.
import { assert, boot, createVault, idle, openAssistant, paths, run, sleep, startObsidian, test, unload } from "./support.mjs"

const npc = index => `Campaigns/Glass/Npcs/N${index}.md`

test("whenIdle waits for a debounced update whose file read is slow", async () => {
  const env = createVault()
  env.addFile(npc(1), "# About\nOldtextkappa here.", { type: "npc" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const read = env.app.vault.cachedRead
  env.app.vault.cachedRead = async file => { await sleep(150); return read(file) }
  env.app.vault.read = env.app.vault.cachedRead
  env.editFile(npc(1), "# About\nNewtextlambda here.", { type: "npc" })
  await idle(plugin)
  assert.equal(paths(plugin.index.search("newtextlambda"))[0], npc(1), "whenIdle resolved before the edit was indexed")
  await unload(plugin)
})

test("an open assistant view does not slow initial indexing of 5000 notes", async () => {
  const env = createVault()
  for (let index = 0; index < 5000; index++) env.addFile(npc(index), `# About\nToken${index} lives by the harbor.\n\n# Motives\nWants lanterns.`, { type: "npc" })
  const plugin = await boot(env)
  await openAssistant(env, plugin)
  const started = Date.now()
  startObsidian(env)
  await idle(plugin, 20000)
  const elapsed = Date.now() - started
  assert.ok(elapsed < 3000, `initial indexing with the view open took ${elapsed} ms (about 300 ms without the view)`)
  await unload(plugin)
}, 30000)

test("the rebuild command re-reads every note from scratch", async () => {
  const env = createVault()
  for (let index = 0; index < 20; index++) env.addFile(npc(index), `# About\nToken${index}.`, { type: "npc" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const before = env.reads.length
  const command = plugin.commands.find(entry => entry.id === "assistant-rebuild-index")
  await command.callback()
  await sleep(20)
  await idle(plugin)
  const reread = env.reads.slice(before).filter(item => item.startsWith("Campaigns/Glass/Npcs/"))
  assert.equal(new Set(reread).size, 20, `re-read ${new Set(reread).size} of 20 notes`)
  assert.equal(paths(plugin.index.search("token7"))[0], npc(7))
  await unload(plugin)
})

await run("13-index-corrections")
