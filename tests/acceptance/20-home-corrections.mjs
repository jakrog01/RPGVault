// Prompt 20: the home view stays cheap and consistent: no re-index on switching, no rebuilds for unrelated notes,
// no duplicated cards from overlapping refreshes, full template frontmatter, and localised counts.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, boot, createVault, idle, run, sleep, startObsidian, test, unload, until } from "./support.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const find = (element, predicate, found = []) => {
  if (predicate(element)) found.push(element)
  for (const child of element.children ?? []) find(child, predicate, found)
  return found
}
const byClass = (element, name) => find(element, node => node.classes?.has(name))
const format = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match)

function homeVault() {
  const env = createVault()
  for (const id of ["generic", "dnd5e", "coc7e"]) env.adapterFiles.set(`_system/systems/${id}/package.json`, readFileSync(path.join(root, `_system/systems/${id}/package.json`), "utf8"))
  for (const name of ["campaign", "party", "run"]) env.adapterFiles.set(`_system/templates/${name}.md`, readFileSync(path.join(root, `_system/templates/${name}.md`), "utf8"))
  env.files.get("Parties/Watch/Party.md").content = "# Watch\n\n## Members\n\n- Kestrel\n- Dorian"
  return env
}

async function openHome(env) {
  const plugin = await boot(env)
  plugin.settings.openHomeOnStartup = false
  startObsidian(env)
  await idle(plugin, 20000)
  await plugin.commands.find(entry => entry.id === "open-home").callback()
  await until(() => env.leaves.some(leaf => leaf.type === "tt-home"), 2000, "home view")
  return { plugin, view: env.leaves.find(leaf => leaf.type === "tt-home").view }
}

test("switching the active run does not re-read the vault", async () => {
  const env = homeVault()
  for (let index = 0; index < 300; index++) env.addFile(`Campaigns/Glass/Lore/L${index}.md`, `# L${index}\nText ${index}.`, { type: "lore" })
  env.addFile("Runs/Other/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Other/State.md", "", { type: "state" })
  const { plugin } = await openHome(env)
  const before = env.reads.length
  await plugin.setActiveRun("Runs/Other/Run.md")
  await sleep(100)
  await idle(plugin, 20000)
  const lore = env.reads.slice(before).filter(item => item.includes("/Lore/"))
  assert.equal(lore.length, 0, `re-read ${lore.length} unrelated notes after switching`)
  assert.equal(plugin.index.scope().role, "player")
  await unload(plugin)
})

test("editing a note that the home view does not show does not rebuild the view", async () => {
  const env = homeVault()
  env.addFile("Campaigns/Glass/Lore/Diary.md", "# Diary\nfirst", { type: "lore" })
  const { plugin, view } = await openHome(env)
  await sleep(300)
  const marker = view.contentEl.children[0]
  assert.ok(marker, "home view rendered")
  for (let index = 0; index < 20; index++) {
    env.editFile("Campaigns/Glass/Lore/Diary.md", `# Diary\nline ${index}`, { type: "lore" })
    await sleep(40)
  }
  await sleep(500)
  assert.ok(view.contentEl.children.includes(marker), "the home view was rebuilt for an unrelated note")
  const runFile = env.files.get("Runs/Harbor/Run.md")
  runFile.frontmatter = { ...runFile.frontmatter, role: "player" }
  env.emit("changed", runFile.file, runFile.content, { frontmatter: runFile.frontmatter })
  await until(() => !view.contentEl.children.includes(marker), 2000, "a relevant change still refreshes the view")
  await unload(plugin)
})

test("overlapping refreshes never duplicate cards", async () => {
  const env = homeVault()
  const read = env.app.vault.adapter.read
  env.app.vault.adapter.read = async filePath => {
    if (String(filePath).includes("package.json")) await sleep(20 + Math.floor(Math.random() * 60))
    return read(filePath)
  }
  const { plugin, view } = await openHome(env)
  await Promise.all([view.render(), view.render(), view.render()])
  await sleep(400)
  assert.equal(byClass(view.contentEl, "tt-home-active").length, 1)
  assert.equal(byClass(view.contentEl, "tt-home-campaign").length, 1)
  assert.equal(byClass(view.contentEl, "tt-home-party").length, 1)
  const button = find(view.contentEl, node => node.attributes?.["aria-label"] === plugin.strings.homeNewCampaign)[0]
  await button.click()
  await until(() => env.modals.length > 0, 2000, "campaign form")
  const modal = env.modals.at(-1)
  env.settingByName(modal.contentEl, plugin.strings.homeFieldName).components[0].change("Sunken Crown")
  await env.buttonComponent(modal.contentEl, plugin.strings.homeCreate).click()
  await until(() => env.files.has("Campaigns/Sunken Crown/Campaign.md"), 2000, "created")
  await sleep(600)
  const cards = byClass(view.contentEl, "tt-home-campaign").map(element => element.attributes["data-path"])
  assert.deepEqual(cards.sort(), ["Campaigns/Glass/Campaign.md", "Campaigns/Sunken Crown/Campaign.md"])
  await unload(plugin)
})

test("template frontmatter with lists and nested values survives creation", async () => {
  const env = homeVault()
  env.adapterFiles.set("_local/templates/party.md", ["---", "type: party", "tags:", "  - table", "  - weekly", "schedule:", "  day: friday", "  time: \"19:00\"", "---", "", "# <% tp.file.title %>", ""].join("\n"))
  const { plugin, view } = await openHome(env)
  find(view.contentEl, node => node.attributes?.["aria-label"] === plugin.strings.homeNewParty)[0].click()
  await until(() => env.modals.length > 0, 2000, "party form")
  const modal = env.modals.at(-1)
  env.settingByName(modal.contentEl, plugin.strings.homeFieldName).components[0].change("Owls")
  await env.buttonComponent(modal.contentEl, plugin.strings.homeCreate).click()
  await until(() => env.files.has("Parties/Owls/Party.md"), 2000, "created")
  const content = env.files.get("Parties/Owls/Party.md").content
  for (const line of ["type: party", "tags:", "  - table", "  - weekly", "schedule:", "  day: friday", "  time: \"19:00\"", "# Owls"]) assert.ok(content.split("\n").includes(line), `missing line ${JSON.stringify(line)} in:\n${content}`)
  await unload(plugin)
})

test("run and member counts use localised templates", async () => {
  const env = homeVault()
  const { plugin, view } = await openHome(env)
  for (const key of ["homeRunCount", "homePartyMembers"]) assert.equal(typeof plugin.strings[key], "string", `contract: string key ${key}`)
  const campaign = byClass(view.contentEl, "tt-home-campaign")[0]
  assert.ok(campaign.textContent.includes(format(plugin.strings.homeRunCount, { count: 1 })), campaign.textContent)
  const party = byClass(view.contentEl, "tt-home-party")[0]
  assert.ok(party.textContent.includes(format(plugin.strings.homePartyMembers, { count: 2 })), party.textContent)
  await unload(plugin)
})

await run("20-home-corrections")
