// Prompt 19: the Table Tools home view shows the active run, lists campaigns, runs, and parties, and switches the active run.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, boot, createVault, idle, run, sleep, startObsidian, test, unload, until } from "./support.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const HOME = "tt-home"

function tableVault() {
  const env = createVault()
  for (const id of ["generic", "dnd5e", "coc7e"]) env.adapterFiles.set(`_system/systems/${id}/package.json`, readFileSync(path.join(root, `_system/systems/${id}/package.json`), "utf8"))
  env.files.get("Runs/Harbor/Run.md").frontmatter.role = "gm"
  env.files.get("Parties/Watch/Party.md").content = "# Watch\n\n## Members\n\n- Kestrel\n- Dorian"
  env.addFile("Runs/Harbor/World Day.md", "# World Day\n\nDay 14, the Month of Rain.", { type: "world-day" })
  env.addFile("Campaigns/Ember/Campaign.md", "Campaign: Ember.", { type: "campaign", system: "coc7e" })
  env.addFile("Parties/Lanterns/Party.md", "# Lanterns", { type: "party" })
  env.addFile("Runs/Ember Night/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Ember/Campaign]]", party: "[[Parties/Lanterns/Party]]" })
  env.addFile("Runs/Ember Night/State.md", "", { type: "state" })
  return env
}

const find = (element, predicate, found = []) => {
  if (predicate(element)) found.push(element)
  for (const child of element.children ?? []) find(child, predicate, found)
  return found
}
const byClass = (element, name) => find(element, node => node.classes?.has(name))
const text = element => element.textContent

async function openHome(env, plugin) {
  const command = plugin.commands.find(entry => entry.id === "open-home")
  assert.ok(command, "contract: command open-home")
  await command.callback()
  await until(() => env.leaves.some(leaf => leaf.type === HOME), 2000, "home view opened")
  return env.leaves.find(leaf => leaf.type === HOME).view
}

test("the home view opens in the main area at startup by default and is available from a ribbon icon", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  assert.equal(plugin.settings.openHomeOnStartup, true)
  assert.ok(plugin.ribbons.some(ribbon => ribbon.title === plugin.strings.ribbonHome), "contract: ribbon titled strings.ribbonHome")
  startObsidian(env)
  await until(() => env.mainLeaves.some(leaf => leaf.type === HOME), 2000, "home opened in a main-area leaf at startup")
  await unload(plugin)
})

test("with openHomeOnStartup off the home view does not open by itself", async () => {
  const env = tableVault()
  const TableTools = env.load()
  const plugin = new TableTools(env.app, { id: "table-tools" })
  env.workspace.plugin = plugin
  await plugin.saveData({ settings: { openHomeOnStartup: false } })
  await plugin.onload()
  startObsidian(env)
  await sleep(200)
  assert.equal(env.leaves.some(leaf => leaf.type === HOME), false)
  await unload(plugin)
})

test("the active run card shows run, role, campaign, system, party, and world day", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  plugin.settings.openHomeOnStartup = false
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  const cards = byClass(view.contentEl, "tt-home-active")
  assert.equal(cards.length, 1, "one .tt-home-active card")
  const card = text(cards[0])
  for (const fragment of ["Harbor", "Glass", "Dungeons & Dragons 5e", "Watch", "Day 14, the Month of Rain."]) assert.ok(card.includes(fragment), `card lacks ${fragment}: ${card}`)
  assert.ok(card.includes(plugin.strings.homeRoleGm), "contract: role label strings.homeRoleGm")
  await unload(plugin)
})

test("runs are listed per campaign with the active one marked, and campaigns and parties are listed", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  const runs = byClass(view.contentEl, "tt-home-run")
  assert.deepEqual(runs.map(element => element.attributes["data-path"]).sort(), ["Runs/Ember Night/Run.md", "Runs/Harbor/Run.md"])
  const active = runs.filter(element => element.classes.has("tt-active")).map(element => element.attributes["data-path"])
  assert.deepEqual(active, ["Runs/Harbor/Run.md"])
  const player = runs.find(element => element.attributes["data-path"] === "Runs/Ember Night/Run.md")
  assert.ok(text(player).includes(plugin.strings.homeRolePlayer))
  const campaigns = byClass(view.contentEl, "tt-home-campaign").map(element => element.attributes["data-path"]).sort()
  assert.deepEqual(campaigns, ["Campaigns/Ember/Campaign.md", "Campaigns/Glass/Campaign.md"])
  const parties = byClass(view.contentEl, "tt-home-party").map(element => element.attributes["data-path"]).sort()
  assert.deepEqual(parties, ["Parties/Lanterns/Party.md", "Parties/Watch/Party.md"])
  await unload(plugin)
})

test("making a run active rewrites the pointer, moves the assistant scope, and re-renders the home view", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  const player = byClass(view.contentEl, "tt-home-run").find(element => element.attributes["data-path"] === "Runs/Ember Night/Run.md")
  const button = find(player, node => node.attributes?.["aria-label"] === plugin.strings.homeMakeActive)[0]
  assert.ok(button, "contract: make-active button labelled strings.homeMakeActive")
  await button.click()
  await until(() => String(env.files.get("Active.md").frontmatter.run) === "[[Runs/Ember Night/Run]]", 2000, "pointer rewritten")
  assert.equal(plugin.index.scope().role, "player")
  assert.equal(plugin.index.scope().campaignFolder, "Campaigns/Ember")
  await until(() => byClass(view.contentEl, "tt-home-run").find(element => element.classes.has("tt-active"))?.attributes["data-path"] === "Runs/Ember Night/Run.md", 2000, "home re-rendered")
  assert.ok(text(byClass(view.contentEl, "tt-home-active")[0]).includes("Ember Night"))
  await unload(plugin)
})

test("setActiveRun creates a missing pointer note", async () => {
  const env = tableVault()
  env.files.delete("Active.md")
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.equal(typeof plugin.setActiveRun, "function", "contract: plugin.setActiveRun(runPath)")
  await plugin.setActiveRun("Runs/Harbor/Run.md")
  assert.ok(env.files.has("Active.md"), "Active.md created")
  assert.equal(String(env.files.get("Active.md").frontmatter.run), "[[Runs/Harbor/Run]]")
  assert.ok(plugin.currentContext(), "the new pointer resolves")
  await unload(plugin)
})

test("open buttons open the run, campaign, and party notes", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  const card = byClass(view.contentEl, "tt-home-active")[0]
  for (const [label, target] of [[plugin.strings.homeOpenRun, "Runs/Harbor/Run"], [plugin.strings.homeOpenCampaign, "Campaigns/Glass/Campaign"], [plugin.strings.homeOpenParty, "Parties/Watch/Party"]]) {
    const button = find(card, node => node.attributes?.["aria-label"] === label)[0]
    assert.ok(button, `button ${label}`)
    await button.click()
    assert.ok(env.opened.some(opened => String(opened).replace(/\.md$/, "") === target), `opened ${JSON.stringify(env.opened)}`)
  }
  await unload(plugin)
})

test("a new run note appears in the home view without reopening it", async () => {
  const env = tableVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  const file = env.addFile("Runs/Glass Second/Run.md", "", { type: "run", role: "gm", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.emit("create", file)
  env.emit("changed", file, "", { frontmatter: env.files.get(file.path).frontmatter })
  await until(() => byClass(view.contentEl, "tt-home-run").some(element => element.attributes["data-path"] === "Runs/Glass Second/Run.md"), 2000, "new run listed")
  await unload(plugin)
})

test("an empty vault shows the empty state", async () => {
  const env = createVault()
  for (const filePath of ["Runs/Harbor/Run.md", "Runs/Harbor/State.md", "Campaigns/Glass/Campaign.md", "Parties/Watch/Party.md"]) env.files.delete(filePath)
  env.files.get("Active.md").frontmatter.run = ""
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openHome(env, plugin)
  assert.ok(text(view.contentEl).includes(plugin.strings.homeEmpty), "contract: strings.homeEmpty rendered")
  assert.equal(byClass(view.contentEl, "tt-home-active").length, 0)
  await unload(plugin)
})

await run("19-home")
