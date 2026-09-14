// Prompt 19: creating campaigns, parties, and runs from the home view, rendered from the layered templates.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, boot, createVault, idle, run, startObsidian, test, unload, until } from "./support.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

function creationVault() {
  const env = createVault()
  for (const id of ["generic", "dnd5e", "coc7e"]) env.adapterFiles.set(`_system/systems/${id}/package.json`, readFileSync(path.join(root, `_system/systems/${id}/package.json`), "utf8"))
  for (const name of ["campaign", "party", "run"]) env.adapterFiles.set(`_system/templates/${name}.md`, readFileSync(path.join(root, `_system/templates/${name}.md`), "utf8"))
  return env
}

const find = (element, predicate, found = []) => {
  if (predicate(element)) found.push(element)
  for (const child of element.children ?? []) find(child, predicate, found)
  return found
}

async function ready(env) {
  const plugin = await boot(env)
  plugin.settings.openHomeOnStartup = false
  startObsidian(env)
  await idle(plugin)
  const command = plugin.commands.find(entry => entry.id === "open-home")
  assert.ok(command, "contract: command open-home")
  await command.callback()
  await until(() => env.leaves.some(leaf => leaf.type === "tt-home"), 2000, "home view")
  const view = env.leaves.find(leaf => leaf.type === "tt-home").view
  return { plugin, view }
}

/** Clicks a home button by aria-label and returns the modal it opened. */
async function openForm(env, view, label) {
  const button = find(view.contentEl, node => node.attributes?.["aria-label"] === label)[0]
  assert.ok(button, `button ${label}`)
  const before = env.modals.length
  await button.click()
  await until(() => env.modals.length > before, 2000, `modal for ${label}`)
  return env.modals.at(-1)
}

const setting = (env, modal, name) => {
  const found = env.settingByName(modal.contentEl, name)
  assert.ok(found, `setting ${name}`)
  return found.components[0]
}

async function submit(env, plugin, modal) {
  const button = env.buttonComponent(modal.contentEl, plugin.strings.homeCreate)
  assert.ok(button, "contract: submit button strings.homeCreate")
  await button.click()
}

test("a new campaign is created with its system and rendered title", async () => {
  const env = creationVault()
  const { plugin, view } = await ready(env)
  const modal = await openForm(env, view, plugin.strings.homeNewCampaign)
  const system = setting(env, modal, plugin.strings.homeFieldSystem)
  assert.deepEqual(Object.keys(system.options ?? {}).sort(), ["coc7e", "dnd5e", "generic"], "systems offered from the system packages")
  assert.ok(Object.values(system.options).includes("Call of Cthulhu 7e"), "system names shown")
  setting(env, modal, plugin.strings.homeFieldName).change("Sunken Crown")
  system.change("coc7e")
  await submit(env, plugin, modal)
  await until(() => env.files.has("Campaigns/Sunken Crown/Campaign.md"), 2000, "campaign created")
  const entry = env.files.get("Campaigns/Sunken Crown/Campaign.md")
  assert.equal(entry.frontmatter.type, "campaign")
  assert.equal(entry.frontmatter.system, "coc7e")
  assert.ok(entry.content.includes("# Sunken Crown"), "title rendered from the template")
  assert.ok(entry.content.includes("## Factions"), "template body kept")
  assert.ok(!entry.content.includes("<%"), "no Templater syntax left for Templater to execute")
  await until(() => find(view.contentEl, node => node.classes?.has("tt-home-campaign") && node.attributes["data-path"] === "Campaigns/Sunken Crown/Campaign.md").length === 1, 2000, "listed")
  await unload(plugin)
})

test("a local template overrides the shipped one", async () => {
  const env = creationVault()
  env.adapterFiles.set("_local/templates/party.md", "---\ntype: party\n---\n\n# <% tp.file.title %>\n\n## Table notes\n")
  const { plugin, view } = await ready(env)
  const modal = await openForm(env, view, plugin.strings.homeNewParty)
  setting(env, modal, plugin.strings.homeFieldName).change("Night Owls")
  await submit(env, plugin, modal)
  await until(() => env.files.has("Parties/Night Owls/Party.md"), 2000, "party created")
  const entry = env.files.get("Parties/Night Owls/Party.md")
  assert.equal(entry.frontmatter.type, "party")
  assert.ok(entry.content.includes("# Night Owls") && entry.content.includes("## Table notes"), entry.content)
  await unload(plugin)
})

test("a new run creates Run, State, and World Day notes, links campaign and party, and becomes active", async () => {
  const env = creationVault()
  const { plugin, view } = await ready(env)
  const modal = await openForm(env, view, plugin.strings.homeNewRun)
  setting(env, modal, plugin.strings.homeFieldName).change("Glass Friday")
  const role = setting(env, modal, plugin.strings.homeFieldRole)
  assert.deepEqual(Object.keys(role.options ?? {}).sort(), ["gm", "player"])
  role.change("gm")
  const campaign = setting(env, modal, plugin.strings.homeFieldCampaign)
  assert.ok(Object.keys(campaign.options ?? {}).includes("Campaigns/Glass/Campaign.md"))
  campaign.change("Campaigns/Glass/Campaign.md")
  const party = setting(env, modal, plugin.strings.homeFieldParty)
  party.change("Parties/Watch/Party.md")
  assert.equal(setting(env, modal, plugin.strings.homeFieldMakeActive).value, true, "make active defaults to on")
  await submit(env, plugin, modal)
  await until(() => env.files.has("Runs/Glass Friday/Run.md"), 2000, "run created")
  const runNote = env.files.get("Runs/Glass Friday/Run.md")
  assert.equal(runNote.frontmatter.type, "run")
  assert.equal(runNote.frontmatter.role, "gm")
  assert.equal(runNote.frontmatter.campaign, "[[Campaigns/Glass/Campaign]]")
  assert.equal(runNote.frontmatter.party, "[[Parties/Watch/Party]]")
  assert.ok(runNote.content.includes("# Glass Friday") && runNote.content.includes("![[Runs/Glass Friday/World Day]]"), runNote.content)
  assert.ok(!runNote.content.includes("<%"))
  assert.equal(env.files.get("Runs/Glass Friday/State.md")?.frontmatter?.type, "state")
  assert.equal(env.files.get("Runs/Glass Friday/State.md").frontmatter.run, "[[Runs/Glass Friday/Run]]")
  assert.equal(env.files.get("Runs/Glass Friday/World Day.md")?.frontmatter?.type, "world-day")
  await until(() => String(env.files.get("Active.md").frontmatter.run) === "[[Runs/Glass Friday/Run]]", 2000, "new run active")
  assert.equal(plugin.currentContext()?.run.path, "Runs/Glass Friday/Run.md")
  await unload(plugin)
})

test("invalid or duplicate names and a run without campaign or party create nothing and explain why", async () => {
  const env = creationVault()
  const { plugin, view } = await ready(env)
  const before = env.created.length
  for (const [label, name, key] of [
    [plugin.strings.homeNewCampaign, "Bad/Name", "homeInvalidName"],
    [plugin.strings.homeNewCampaign, "   ", "homeInvalidName"],
    [plugin.strings.homeNewCampaign, "Glass", "homeExists"],
    [plugin.strings.homeNewParty, "Watch", "homeExists"],
  ]) {
    assert.equal(typeof plugin.strings[key], "string", `contract: string key ${key}`)
    const modal = await openForm(env, view, label)
    setting(env, modal, plugin.strings.homeFieldName).change(name)
    await submit(env, plugin, modal)
    await until(() => env.notices.includes(plugin.strings[key]), 2000, `notice ${key} for ${JSON.stringify(name)}`)
    modal.close()
  }
  const runModal = await openForm(env, view, plugin.strings.homeNewRun)
  setting(env, runModal, plugin.strings.homeFieldName).change("Lonely Run")
  setting(env, runModal, plugin.strings.homeFieldCampaign).change("")
  await submit(env, plugin, runModal)
  assert.equal(typeof plugin.strings.homeRunNeedsCampaignParty, "string", "contract: string key homeRunNeedsCampaignParty")
  await until(() => env.notices.includes(plugin.strings.homeRunNeedsCampaignParty), 2000, "run validation notice")
  assert.equal(env.created.length, before, `created ${JSON.stringify(env.created.slice(before))}`)
  await unload(plugin)
})

await run("19-create")
