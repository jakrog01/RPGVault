// Prompt 21: cards disappear when their note is deleted or stops being a run, even if metadata was not ready at plugin load.
import { assert, boot, createVault, idle, run, sleep, startObsidian, test, unload, until } from "./support.mjs"

const find = (element, predicate, found = []) => {
  if (predicate(element)) found.push(element)
  for (const child of element.children ?? []) find(child, predicate, found)
  return found
}
const cards = (view, name) => find(view.contentEl, node => node.classes?.has(name)).map(node => node.attributes["data-path"]).sort()

/** Boots with the metadata cache empty until after onload, as on a cold Obsidian start. */
async function coldHome(env) {
  let ready = false
  const getFileCache = env.app.metadataCache.getFileCache
  env.app.metadataCache.getFileCache = file => ready ? getFileCache(file) : null
  const plugin = await boot(env)
  plugin.settings.openHomeOnStartup = false
  ready = true
  startObsidian(env)
  await idle(plugin)
  await plugin.commands.find(entry => entry.id === "open-home").callback()
  await until(() => env.leaves.some(leaf => leaf.type === "tt-home"), 2000, "home view")
  const view = env.leaves.find(leaf => leaf.type === "tt-home").view
  await sleep(300)
  return { plugin, view }
}

function tableVault() {
  const env = createVault()
  env.addFile("Runs/Old/Run.md", "", { type: "run", role: "gm", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Campaigns/Ember/Campaign.md", "Campaign: Ember.", { type: "campaign", system: "generic" })
  return env
}

test("deleting a run or a campaign removes its card after a cold start", async () => {
  const env = tableVault()
  const { plugin, view } = await coldHome(env)
  assert.ok(cards(view, "tt-home-run").includes("Runs/Old/Run.md"))
  assert.ok(cards(view, "tt-home-campaign").includes("Campaigns/Ember/Campaign.md"))
  for (const filePath of ["Runs/Old/Run.md", "Campaigns/Ember/Campaign.md"]) {
    const entry = env.files.get(filePath)
    env.files.delete(filePath)
    env.emit("delete", entry.file)
  }
  await until(() => !cards(view, "tt-home-run").includes("Runs/Old/Run.md"), 2000, "deleted run card removed")
  await until(() => !cards(view, "tt-home-campaign").includes("Campaigns/Ember/Campaign.md"), 2000, "deleted campaign card removed")
  await unload(plugin)
})

test("a note that stops being a run leaves the run list", async () => {
  const env = tableVault()
  const { plugin, view } = await coldHome(env)
  env.editFile("Runs/Old/Run.md", "Just a note now.", { type: "lore" })
  await until(() => !cards(view, "tt-home-run").includes("Runs/Old/Run.md"), 2000, "former run card removed")
  await unload(plugin)
})

await run("21-home-stale-cards")
