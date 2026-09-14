// Drives the built Table Tools bundle through its user interface and asserts on the
// resulting state. Expected texts are always taken from plugin.strings, so the same
// scenario runs with the English strings and with a marker override.
import assert from "node:assert/strict"
import { createEnvironment, sseResponse } from "./obsidian.mjs"

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => key in values ? String(values[key]) : match)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
async function until(condition, message) {
  for (let attempt = 0; attempt < 400; attempt++) { if (condition()) return; await tick() }
  throw new Error(`Timed out waiting for: ${message}`)
}
async function withRandom(value, action) {
  const original = Math.random
  Math.random = () => value
  try { return await action() } finally { Math.random = original }
}

const goblin = {
  name: "Goblin", size: "Small", type: "humanoid", subtype: "goblinoid", alignment: "neutral evil",
  ac: 15, ac_class: "leather armor, shield", hp: 7, hit_dice: "2d6", speed: "30 ft.",
  stats: [8, 14, 10, 10, 8, 8], saves: [{ dexterity: 4 }], skillsaves: [{ stealth: 6 }],
  damage_vulnerabilities: "radiant", damage_resistances: "cold", damage_immunities: "poison", condition_immunities: "charmed",
  senses: "darkvision 60 ft.", languages: "Common, Goblin", cr: "1/4",
  traits: [{ name: "Nimble Escape", desc: "Disengage or Hide as a bonus action." }],
  actions: [{ name: "Scimitar", desc: "Melee weapon attack: +4 to hit, reach 5 ft. Hit: 1d6+2 slashing damage." }],
  bonus_actions: [{ name: "Scurry", desc: "Moves 10 feet." }],
  reactions: [{ name: "Duck", desc: "Adds 2 to AC." }],
  legendary_actions: [{ name: "Shriek", desc: "Allies within 30 feet gain 1d4 temporary hit points." }],
  lair_actions: [{ name: "Collapse", desc: "Rubble falls: 2d6 bludgeoning damage." }],
  homebrew_notes: [{ name: "Table note", desc: "Flees when alone." }],
}

export async function runScenario({ override } = {}) {
  const env = createEnvironment()
  const { app, addFile, workspace, byLabel, byClass, byText, settingByName, buttonComponent, notices, modals, requests } = env

  addFile("Active.md", "", { run: "[[Runs/Harbor/Run]]" })
  addFile("Runs/Harbor/Run.md", "# Harbor run", { type: "run", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  addFile("Runs/Harbor/State.md", "State: the gate is open.")
  addFile("Runs/Harbor/World Day.md", "---\ndate: 1\n---\nFirst of the month, full moon.")
  addFile("Campaigns/Glass/Campaign.md", "Campaign: Glassgate.", { type: "campaign", system: "dnd5e" })
  const docks = addFile("Campaigns/Glass/Docks.md", "The docks smell of tar.")
  addFile("Parties/Watch/Party.md", "", { type: "party" })
  const ariaFile = addFile("Parties/Watch/Aria.md", "Aria keeps watch.", { ac: 16, hp: 24, init_mod: 3, level: 3 })
  addFile("Parties/Watch/Borin.md", "", { ac: 18, hp: 30, init_mod: 0, level: 3 })
  const goblinFile = addFile("Library/Mechanics/dnd5e/Bestiary/Goblin.md", "```statblock\n" + JSON.stringify(goblin) + "\n```", { type: "creature", cr: "1/4" })
  addFile("Library/Mechanics/dnd5e/Bestiary/Broken.md", "```statblock\nnot: [valid\n```", { type: "creature" })
  addFile("_system/templates/campaign.md", "template")
  env.adapterFiles.set(".obsidian/plugins/initiative-tracker/data.json", JSON.stringify({ players: [{ name: "Cora", ac: 13, hp: 18, modifier: 1, level: 2 }] }))
  if (override) addFile("_local/plugins/table-tools/strings.json", JSON.stringify(override))
  if (override) env.adapterFiles.set("_local/assistant/scope.json", "{")

  const TableTools = env.load()
  const plugin = new TableTools(app, { id: "table-tools" })
  workspace.plugin = plugin
  await plugin.onload()
  const s = plugin.strings
  if (override) assert.equal(s.combatTitle, override.combatTitle, "the local string override is applied")
  const command = name => plugin.commands.find(entry => entry.name === name)
  const participant = name => plugin.combat.participants.find(entry => entry.name === name)

  // ---------- Settings ----------
  const tab = plugin.settingTabs[0]
  tab.display()
  const settingsEl = tab.containerEl
  for (const name of [s.settingsAssistantHeading, s.settingsApiKey, s.settingsModel, s.settingsTemperature, s.settingsSystemPrompt, s.settingsContextLimit,
    s.settingsActivePointer, s.settingsCampaignOverride, s.settingsWorldDayOverride, s.settingsCombatHeading, s.settingsBestiaryOverride,
    s.settingsPartyOverride, s.settingsHomeHeading, s.settingsOpenHomeOnStartup, s.settingsAverageHitPoints, s.settingsGroupInitiative,
    s.settingsAttackBonusPhrases]) assert.ok(settingByName(settingsEl, name), `setting ${name}`)
  await buttonComponent(settingsEl, s.settingsFetchModels).click()
  assert.ok(notices.includes(s.settingsNeedApiKey))
  settingByName(settingsEl, s.settingsApiKey).components[0].change(" AIzaTEST ")
  assert.equal(plugin.settings.apiKey, "AIzaTEST")
  env.network.requestUrl = async () => ({ status: 200, json: { models: [
    { name: "models/gemini-9-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-9-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
  ] } })
  await buttonComponent(settingsEl, s.settingsFetchModels).click()
  assert.deepEqual(plugin.settings.models, ["gemini-9-flash", "gemini-9-flash-lite"])
  assert.equal(plugin.settings.model, "gemini-9-flash")
  assert.ok(notices.includes(fill(s.settingsModelCount, { count: 2 })))
  env.network.requestUrl = async () => ({ status: 200, json: { models: [] } })
  await buttonComponent(settingsEl, s.settingsFetchModels).click()
  assert.ok(notices.includes(s.settingsModelListEmpty))
  env.network.requestUrl = async () => ({ status: 403, json: { error: { message: "denied" } } })
  await buttonComponent(settingsEl, s.settingsFetchModels).click()
  assert.ok(notices.includes(s.errorForbidden))
  settingByName(settingsEl, s.settingsTemperature).components[0].change(0.3)
  settingByName(settingsEl, s.settingsContextLimit).components[0].change("abc")
  settingByName(settingsEl, s.settingsAverageHitPoints).components[0].change(true)
  settingByName(settingsEl, s.settingsGroupInitiative).components[0].change(true)
  assert.equal(plugin.settings.temperature, 0.3)
  assert.equal(plugin.settings.maxContext, 24000)
  assert.equal(env.storage.data.settings.temperature, 0.3, "settings are persisted")
  await buttonComponent(settingsEl, s.settingsEmbeddingTest).click()
  assert.ok(notices.includes(fill(s.settingsEmbeddingTestSuccess, { dimensions: 0 })))

  // ---------- Commands without a selection ----------
  await command(s.commandAskSelection).editorCallback({ getSelection: () => "" })
  assert.ok(notices.includes(s.selectTextFirst))

  // ---------- Combat view ----------
  command(s.commandOpenCombat).callback()
  await until(() => env.leaves.some(leaf => leaf.type === "tt-combat"), "combat view")
  const combatView = env.leaves.find(leaf => leaf.type === "tt-combat").view
  env.record(combatView.getDisplayText())
  const view = () => combatView.contentEl
  const rowFor = name => byClass(view(), "tt-row").find(row => byClass(row, "tt-name-text").some(element => element.textContent === name))
  assert.equal(byText(view(), s.emptyCombat).length, 1)
  assert.equal(byText(view(), s.emptyCombatHint).length, 1)

  // Players from the party folder, Initiative Tracker, and manual entry.
  await byLabel(view(), s.toolbarPlayers)[0].click()
  const addPlayers = modals.at(-1)
  settingByName(addPlayers.contentEl, "Cora").components[0].change(true)
  settingByName(addPlayers.contentEl, s.nameLabel).components[0].change("Dara")
  assert.ok(env.rendered.includes(fill(s.playerSummary, { ac: 16, hp: 24, modifier: "+3", level: 3 })))
  await buttonComponent(addPlayers.contentEl, s.addSelected).click()
  assert.ok(!modals.includes(addPlayers))
  assert.deepEqual(plugin.combat.participants.map(entry => entry.name), ["Aria", "Borin", "Cora", "Dara"])
  assert.deepEqual(
    (({ ac, hp, hpMax, modifier, level, source }) => ({ ac, hp, hpMax, modifier, level, source }))(participant("Aria")),
    { ac: 16, hp: 24, hpMax: 24, modifier: 3, level: 3, source: "Parties/Watch/Aria.md" })
  assert.deepEqual((({ ac, hp, modifier, level }) => ({ ac, hp, modifier, level }))(participant("Dara")), { ac: 14, hp: 30, modifier: 2, level: 3 })
  assert.equal(participant("Cora").level, 2)
  assert.equal(plugin.tracker.addPlayer({ name: "Aria", ac: 1, hp: 1, modifier: 0, level: 1 }), false)
  assert.ok(notices.includes(fill(s.playerAlreadyInCombat, { name: "Aria" })))

  // Start rolls initiative for everyone without one.
  await withRandom(0.5, () => byLabel(view(), s.toolbarStart)[0].click())
  assert.ok(notices.includes(fill(s.initiativeRolledFor, { names: "Aria, Borin, Cora, Dara" })))
  assert.deepEqual(plugin.combat.participants.map(entry => entry.initiative), [14, 11, 12, 13])
  assert.equal(plugin.combat.active, true)
  assert.equal(plugin.combat.round, 1)
  assert.ok(plugin.combat.log.includes(fill(s.logRound, { round: 1 })))
  assert.ok(plugin.combat.log.includes(s.logInitiative))

  // Creatures through the bestiary picker and the quantity modal.
  await byLabel(view(), s.toolbarEnemy)[0].click()
  let picker = modals.at(-1)
  assert.deepEqual(picker.items.map(file => file.basename), ["Broken", "Goblin"])
  assert.ok(env.rendered.includes(fill(s.creatureOption, { name: "Goblin", cr: "1/4" })))
  picker.choose(file => file.basename === "Goblin")
  let quantity = modals.at(-1)
  assert.equal(quantity.contentEl.children[0].textContent, "Goblin")
  settingByName(quantity.contentEl, s.quantity).components[0].change(3)
  settingByName(quantity.contentEl, s.sharedInitiativeForGroup).components[0].change(true)
  await withRandom(0.25, () => buttonComponent(quantity.contentEl, s.add).click())
  const goblins = () => plugin.combat.participants.filter(entry => entry.group === "Goblin")
  assert.deepEqual(goblins().map(entry => entry.name), ["Goblin 1", "Goblin 2", "Goblin 3"])
  assert.deepEqual(goblins().map(entry => entry.initiative), [8, 8, 8], "a shared group rolls initiative once")
  assert.deepEqual(goblins().map(entry => [entry.hp, entry.ac, entry.xp, entry.cr, entry.modifier]), Array(3).fill([7, 15, 50, "1/4", 2]))
  assert.ok(plugin.combat.log.includes(fill(s.logAdded, { name: "Goblin", quantity: 3 })))
  await byLabel(view(), s.toolbarEnemy)[0].click()
  picker = modals.at(-1)
  picker.choose(file => file.basename === "Broken")
  quantity = modals.at(-1)
  await buttonComponent(quantity.contentEl, s.add).click()
  assert.ok(notices.includes(fill(s.invalidStatblock, { path: "Library/Mechanics/dnd5e/Bestiary/Broken.md" })))
  assert.deepEqual((({ hp, ac, xp }) => ({ hp, ac, xp }))(participant("Broken")), { hp: 10, ac: 10, xp: 0 })

  // Encounter difficulty: levels 3, 3, 2, 3 against 150 XP from four enemies (x2).
  let difficulty = byClass(view(), "tt-difficulty")[0]
  assert.ok(difficulty.hasClass("tt-difficulty-easy"))
  assert.equal(byClass(difficulty, "tt-difficulty-level")[0].textContent, s.difficultyEasy)
  assert.ok(difficulty.textContent.includes(fill(s.difficultyDetail, { xp: 150, adjusted: 300, players: 4, thresholds: "275 / 550 / 825 / 1400" })))
  const originalXp = goblins().map(entry => entry.xp)
  for (const [xp, level, label] of [[0, "trivial", s.difficultyTrivial], [300, "medium", s.difficultyMedium], [450, "hard", s.difficultyHard], [700, "deadly", s.difficultyDeadly]]) {
    goblins().forEach((entry, index) => { entry.xp = index === 0 ? xp : 0 })
    plugin.refreshViews()
    difficulty = byClass(view(), "tt-difficulty")[0]
    assert.ok(difficulty.hasClass(`tt-difficulty-${level}`), level)
    assert.equal(byClass(difficulty, "tt-difficulty-level")[0].textContent, label)
  }
  goblins().forEach((entry, index) => { entry.xp = originalXp[index] })
  plugin.refreshViews()

  // Initiative for everyone, groups sharing one roll.
  await withRandom(0.9, () => byLabel(view(), s.toolbarInitiative)[0].click())
  assert.deepEqual(plugin.combat.participants.map(entry => [entry.name, entry.initiative]), [
    ["Aria", 22], ["Borin", 19], ["Cora", 20], ["Dara", 21], ["Goblin 1", 21], ["Goblin 2", 21], ["Goblin 3", 21], ["Broken", 19]])
  assert.equal(plugin.combat.turn, 0)

  // Row input: temporary hit points, damage, healing, invalid input, dying.
  const enter = (name, value, shiftKey = false) => {
    const input = byClass(rowFor(name), "tt-input-damage")[0]
    input.value = value
    input.onkeydown({ key: "Enter", shiftKey, preventDefault() {} })
  }
  const aria = participant("Aria")
  enter("Aria", "t5")
  assert.equal(aria.temporaryHp, 5)
  assert.ok(plugin.combat.log.includes(fill(s.logTemporary, { name: "Aria", amount: 5 })))
  assert.ok(byClass(rowFor("Aria"), "tt-chip-temporary").some(element => element.textContent === "+5"))
  enter("Aria", "12")
  assert.deepEqual([aria.temporaryHp, aria.hp], [0, 17], "temporary hit points absorb damage first")
  assert.ok(plugin.combat.log.includes(fill(s.logDamage, { name: "Aria", amount: 12, hp: 17, max: 24 })))
  enter("Aria", "+30")
  assert.equal(aria.hp, 24, "healing is capped at maximum")
  assert.ok(plugin.combat.log.includes(fill(s.logHealing, { name: "Aria", amount: 30, hp: 24, max: 24 })))
  enter("Aria", "t8")
  enter("Aria", "t4")
  assert.equal(aria.temporaryHp, 8, "temporary hit points keep the higher value")
  const logLength = plugin.combat.log.length
  enter("Aria", "abc")
  assert.equal(plugin.combat.log.length, logLength)
  assert.ok(notices.includes(s.invalidAmount))
  enter("Aria", "40")
  assert.deepEqual([aria.temporaryHp, aria.hp], [0, 0])
  assert.ok(aria.conditions.includes("dying"))
  assert.ok(plugin.combat.log.includes(fill(s.logFalls, { name: "Aria" })))
  assert.ok(byClass(rowFor("Aria"), "tt-chip-condition").some(element => element.textContent === s.conditionDying))
  enter("Aria", "5", true)
  assert.equal(aria.hp, 5, "Shift+Enter heals")
  assert.equal(aria.conditions.includes("dying"), false, "healing removes dying")
  enter("Goblin 2", "7")
  assert.equal(participant("Goblin 2").hp, 0)
  assert.equal(participant("Goblin 2").conditions.includes("dying"), false, "enemies do not gain dying")
  assert.ok(rowFor("Goblin 2").hasClass("tt-defeated"))

  // Turn order skips defeated enemies; rounds advance and rewind.
  const order = () => plugin.combat.participants.slice().sort((left, right) => (right.initiative - left.initiative) || (left.kind === right.kind ? right.modifier - left.modifier : left.kind === "player" ? -1 : 1))
  assert.deepEqual(order().map(entry => entry.name), ["Aria", "Dara", "Goblin 1", "Goblin 2", "Goblin 3", "Cora", "Borin", "Broken"])
  const selectedName = () => plugin.combat.participants.find(entry => entry.id === plugin.combat.selected)?.name
  byLabel(view(), s.toolbarNext)[0].click()
  assert.equal(selectedName(), "Dara")
  byLabel(view(), s.toolbarNext)[0].click()
  assert.equal(selectedName(), "Goblin 1")
  byLabel(view(), s.toolbarNext)[0].click()
  assert.equal(selectedName(), "Goblin 3", "a defeated enemy is skipped")
  assert.ok(rowFor("Goblin 3").hasClass("tt-current"))
  for (let step = 0; step < 4; step++) byLabel(view(), s.toolbarNext)[0].click()
  assert.equal(selectedName(), "Aria")
  assert.equal(plugin.combat.round, 2)
  assert.ok(plugin.combat.log.includes(fill(s.logRound, { round: 2 })))
  byLabel(view(), s.toolbarPrevious)[0].click()
  assert.equal(selectedName(), "Broken")
  assert.equal(plugin.combat.round, 1)
  command(s.commandNextTurn).callback()
  assert.equal(selectedName(), "Aria")
  command(s.commandPreviousTurn).callback()
  assert.equal(selectedName(), "Broken")

  // Conditions modal: toggle two on, one off.
  byLabel(rowFor("Aria"), s.addCondition)[0].click()
  const conditions = modals.at(-1)
  assert.ok(conditions.contentEl.children[0].textContent === fill(s.conditionsTitle, { name: "Aria" }))
  assert.equal(byText(conditions.contentEl, s.conditionPoisoned)[0].attributes.title, s.conditionPoisonedDescription)
  byText(conditions.contentEl, s.conditionPoisoned)[0].click()
  byText(conditions.contentEl, s.conditionProne)[0].click()
  byText(conditions.contentEl, s.conditionProne)[0].click()
  assert.deepEqual(aria.conditions, [], "conditions change only when the modal is confirmed")
  buttonComponent(conditions.contentEl, s.done).click()
  assert.deepEqual(aria.conditions, ["poisoned"])
  const chip = byClass(rowFor("Aria"), "tt-chip-condition")[0]
  assert.equal(chip.textContent, s.conditionPoisoned)
  assert.equal(chip.attributes.title, fill(s.conditionChipTitle, { description: s.conditionPoisonedDescription }))
  chip.click()
  assert.deepEqual(aria.conditions, [])

  // Edit modal: changes apply only on save.
  byLabel(rowFor("Borin"), s.editParticipant)[0].click()
  let edit = modals.at(-1)
  settingByName(edit.contentEl, s.nameLabel).components[0].change("Nobody")
  edit.close()
  assert.equal(participant("Borin").name, "Borin")
  byLabel(rowFor("Aria"), s.editParticipant)[0].click()
  edit = modals.at(-1)
  assert.deepEqual(Object.values(settingByName(edit.contentEl, s.editKind).components[0].options), [s.kindPlayer, s.kindEnemy, s.kindAlly])
  settingByName(edit.contentEl, s.nameLabel).components[0].change("Aria the Bold")
  settingByName(edit.contentEl, s.cardAc).components[0].change("17")
  settingByName(edit.contentEl, s.editMaximumHp).components[0].change("20")
  settingByName(edit.contentEl, s.editInitiativeModifier).components[0].change("4")
  settingByName(edit.contentEl, s.editLevel).components[0].change("4")
  settingByName(edit.contentEl, s.editNote).components[0].change("Watch the gate")
  assert.equal(settingByName(edit.contentEl, s.editNote).description, s.editNoteHint)
  buttonComponent(edit.contentEl, s.save).click()
  assert.deepEqual((({ name, ac, hpMax, hp, modifier, level, note }) => ({ name, ac, hpMax, hp, modifier, level, note }))(aria),
    { name: "Aria the Bold", ac: 17, hpMax: 20, hp: 5, modifier: 4, level: 4, note: "Watch the gate" })
  assert.ok(byClass(rowFor("Aria the Bold"), "tt-note").some(element => element.textContent === "Watch the gate"))
  assert.ok(byClass(rowFor("Aria the Bold"), "tt-chip").some(element => element.textContent === fill(s.chipLevel, { level: 4 })))

  // Hidden toggle and initiative input.
  byLabel(rowFor("Aria the Bold"), s.visibleToPlayers)[0].click()
  assert.equal(aria.hidden, true)
  assert.ok(rowFor("Aria the Bold").hasClass("tt-hidden"))
  byLabel(rowFor("Aria the Bold"), s.hiddenFromPlayers)[0].click()
  assert.equal(aria.hidden, false)
  const initiativeInput = byClass(rowFor("Aria the Bold"), "tt-input-initiative")[0]
  assert.equal(initiativeInput.attributes.title, fill(s.modifierTitle, { modifier: "+4" }))
  initiativeInput.value = "5"
  initiativeInput.onchange()
  assert.equal(aria.initiative, 5)
  byClass(rowFor("Aria the Bold"), "tt-input-initiative")[0].value = ""
  byClass(rowFor("Aria the Bold"), "tt-input-initiative")[0].onchange()
  assert.equal(aria.initiative, null)
  assert.equal(env.storage.data.combat.participants.find(entry => entry.name === "Aria the Bold").note, "Watch the gate", "combat state is persisted")

  // Cards: statblock with clickable dice, a note without a statblock, a manual participant.
  assert.equal(byText(view(), s.selectRowHint).length, 0)
  plugin.combat.selected = undefined
  plugin.refreshViews()
  assert.equal(byText(view(), s.selectRowHint).length, 1)
  rowFor("Goblin 1").click()
  let card = byClass(view(), "tt-card")[0]
  for (const label of [s.cardAc, s.cardHp, s.cardSpeed]) assert.ok(byClass(card, "tt-key").some(element => element.textContent === label), label)
  for (const label of [s.abilityStrength, s.abilityDexterity, s.abilityConstitution, s.abilityIntelligence, s.abilityWisdom, s.abilityCharisma]) assert.equal(byText(card, label).length, 1, label)
  for (const label of [s.lineSaves, s.lineSkills, s.lineVulnerabilities, s.lineResistances, s.lineImmunities, s.lineConditionImmunities, s.lineSenses, s.lineLanguages, s.lineChallenge]) assert.ok(byClass(card, "tt-line-label").some(element => element.textContent === label + " "), label)
  for (const title of [s.sectionTraits, s.sectionActions, s.sectionBonusActions, s.sectionReactions, s.sectionLegendaryActions, s.sectionLairActions, s.sectionHomebrew]) assert.equal(byText(card, title).length, 1, title)
  assert.ok(card.textContent.includes(fill(s.challengeValue, { cr: "1/4", xp: 50 })))
  const dice = () => byClass(byClass(view(), "tt-card")[0], "tt-die")
  assert.ok(dice().some(element => element.textContent === "+4"), "attack bonus followed by a configured phrase is clickable")
  assert.ok(dice().some(element => element.textContent === "1d6+2"))
  await withRandom(0.999, () => dice().find(element => element.textContent === "+4").click())
  assert.ok(notices.some(text => text.includes(s.rollCritical) && text.includes("20")))
  await withRandom(0, () => dice().find(element => element.textContent === "+4").click())
  assert.ok(notices.some(text => text.includes(s.rollNaturalOne)))
  await withRandom(0.5, () => dice().find(element => element.textContent === "1d6+2").click())
  assert.ok(plugin.combat.log.some(entry => entry === fill(s.logRoll, { name: "Goblin 1", roll: "1d6+2 \u2192 **6** [4+2]" })))
  assert.ok(byClass(view(), "tt-log")[0].all(element => element.tag === "b" && element.textContent === "6").length > 0, "bold log text is rendered without HTML")
  await withRandom(0.5, () => byClass(byClass(view(), "tt-card")[0], "tt-ability-modifier")[0].click())
  assert.ok(plugin.combat.log.some(entry => entry.startsWith(fill(s.logRoll, { name: "Goblin 1", roll: "-1" }))))
  byText(byClass(view(), "tt-card")[0], s.cardNoteLink)[0].click()
  rowFor("Borin").click()
  card = byClass(view(), "tt-card")[0]
  assert.equal(byText(card, s.noStatblock).length, 1)
  byText(card, s.openNote)[0].click()
  assert.deepEqual(env.opened, ["Library/Mechanics/dnd5e/Bestiary/Goblin.md", "Parties/Watch/Borin.md"])
  rowFor("Dara").click()
  assert.equal(byText(byClass(view(), "tt-card")[0], s.manualParticipant).length, 1)

  // Remove a participant.
  byLabel(rowFor("Broken"), s.removeParticipant)[0].click()
  assert.equal(participant("Broken"), undefined)
  assert.ok(plugin.combat.log.includes(fill(s.logRemoved, { name: "Broken" })))

  // Encounter sets: save, list, load, delete, missing notes.
  byLabel(view(), s.encounterSetsTitle)[0].click()
  let sets = modals.at(-1)
  assert.equal(byText(sets.contentEl, s.encounterSetsHint).length, 1)
  assert.equal(byText(sets.contentEl, s.noEncounterSets).length, 1)
  assert.equal(byText(sets.contentEl, s.saveCurrentEnemies).length, 1)
  assert.equal(settingByName(sets.contentEl, s.nameLabel).components[0].value, s.defaultCombatName)
  settingByName(sets.contentEl, s.nameLabel).components[0].change("")
  settingByName(sets.contentEl, s.descriptionLabel).components[0].change("At the docks")
  buttonComponent(sets.contentEl, s.saveEncounterSet).click()
  assert.ok(notices.includes(s.encounterSetSaved))
  assert.deepEqual(plugin.encounterSets, [{ name: s.defaultSetName, description: "At the docks", members: [{ source: goblinFile.path, name: "Goblin", quantity: 3, group: true }] }])
  byLabel(view(), s.encounterSetsTitle)[0].click()
  sets = modals.at(-1)
  const saved = settingByName(sets.contentEl, s.defaultSetName)
  assert.equal(saved.description, fill(s.memberSummary, { name: "Goblin", quantity: 3 }) + " \u2014 At the docks")
  await buttonComponent(sets.contentEl, s.load).click()
  assert.deepEqual(goblins().map(entry => entry.name), ["Goblin 1", "Goblin 2", "Goblin 3", "Goblin 4", "Goblin 5", "Goblin 6"])
  byLabel(view(), s.encounterSetsTitle)[0].click()
  sets = modals.at(-1)
  const trash = settingByName(sets.contentEl, s.defaultSetName).components.find(component => component.kind === "extra")
  assert.equal(trash.tooltip, s.deleteEncounterSet)
  trash.click()
  assert.deepEqual(plugin.encounterSets, [])
  assert.equal(byText(sets.contentEl, s.noEncounterSets).length, 1)
  sets.close()
  await plugin.tracker.loadEncounterSet({ name: "Lost", description: "", members: [{ source: "Missing/Ghost.md", name: "Ghost", quantity: 1, group: false }] })
  assert.ok(notices.includes(fill(s.noteMissing, { path: "Missing/Ghost.md" })))

  // Export to the active note, or to the clipboard without one.
  workspace.activeFile = docks
  byLabel(view(), s.exportToNote)[0].click()
  await until(() => env.appended.length === 1, "export append")
  const exported = env.appended[0]
  assert.ok(exported.includes(fill(s.exportHeading, { name: plugin.combat.name, round: plugin.combat.round })))
  assert.ok(exported.includes(s.exportColumns))
  assert.ok(exported.includes("[[Goblin\\|Goblin 1]]"))
  assert.ok(exported.includes(fill(s.exportDifficulty, { level: plugin.tracker.difficultyLabel(plugin.tracker.difficulty().level), xp: plugin.tracker.difficulty().xp })))
  assert.ok(notices.includes(fill(s.exportSaved, { note: "Docks" })))
  workspace.activeFile = null
  byLabel(view(), s.exportToNote)[0].click()
  await until(() => env.clipboard.length === 1, "export clipboard")
  assert.ok(notices.includes(s.exportCopied))

  // Clearing asks for confirmation when participants exist.
  byLabel(view(), s.newCombat)[0].click()
  let confirm = modals.at(-1)
  assert.equal(byText(confirm.contentEl, s.confirmClear).length, 1)
  buttonComponent(confirm.contentEl, s.cancel).click()
  assert.ok(plugin.combat.participants.length > 0)
  byLabel(view(), s.newCombat)[0].click()
  confirm = modals.at(-1)
  buttonComponent(confirm.contentEl, s.confirmClearAction).click()
  assert.equal(plugin.combat.participants.length, 0)
  assert.equal(plugin.combat.name, s.defaultCombatName)
  assert.equal(byText(view(), s.emptyCombat).length, 1)
  plugin.tracker.addPlayer({ name: "Eve", ac: 12, hp: 9, modifier: 1, level: 1 })
  command(s.commandRollInitiative).callback()
  assert.equal(typeof participant("Eve").initiative, "number")
  command(s.commandClearCombat).callback()
  assert.equal(plugin.combat.participants.length, 0)
  plugin.tracker.addPlayer({ name: "Eve", ac: 12, hp: 9, modifier: 1, level: 1 })

  // ---------- Assistant ----------
  plugin.settings.apiKey = ""
  command(s.commandOpenAssistant).callback()
  await until(() => env.leaves.some(leaf => leaf.type === "tt-assistant"), "assistant view")
  const assistant = env.leaves.find(leaf => leaf.type === "tt-assistant").view
  env.record(assistant.getDisplayText())
  const panel = () => assistant.contentEl
  const reindex = plugin.index.rebuild(true)
  assistant.render()
  await reindex
  assert.equal(byText(panel(), s.assistantNeedsKey).length, 1)
  await assistant.send("Hello")
  assert.ok(notices.includes(s.noApiKey))
  plugin.settings.apiKey = "AIzaTEST"
  byLabel(panel(), s.newConversation)[0].click()
  assert.equal(byText(panel(), s.assistantReady).length, 1)
  assert.equal(byText(panel(), s.assistantContextHint).length, 1)
  byClass(panel(), "tt-chip-model")[0].click()
  assert.equal(app.setting.opened, true)
  const toggle = label => byClass(panel(), "tt-as-toggle").find(element => element.textContent === label)
  for (const [label, title] of [[s.contextRun, s.contextRunTitle], [s.contextWorldDay, s.contextWorldDayTitle], [s.contextNote, s.contextNoteTitle], [s.contextCombat, s.contextCombatTitle]]) assert.equal(toggle(label).attributes.title, title)
  const combatToggle = toggle(s.contextCombat).children.find(element => element.tag === "input")
  combatToggle.checked = false
  combatToggle.onchange()
  assert.equal(plugin.settings.includeCombat, false)
  combatToggle.checked = true
  combatToggle.onchange()
  assert.equal(plugin.settings.includeCombat, true)

  byLabel(panel(), s.attachNoteTitle)[0].click()
  let notePicker = modals.at(-1)
  assert.ok(!notePicker.items.some(file => file.path.startsWith("_system/")), "shipped files are not offered")
  notePicker.choose(file => file.path === docks.path)
  assert.deepEqual(assistant.attachments, [docks.path])
  const removeChip = byLabel(panel(), s.removeAttachment)[0]
  removeChip.click()
  assert.deepEqual(assistant.attachments, [])
  byLabel(panel(), s.attachNoteTitle)[0].click()
  notePicker = modals.at(-1)
  notePicker.choose(file => file.path === docks.path)
  workspace.activeFile = ariaFile

  const text = parts => ({ candidates: [{ content: { parts: parts.map(value => ({ text: value })) } }] })
  env.network.fetch = async () => sseResponse([text(["Hello "]), text(["there."])])
  const lastQuestion = () => JSON.parse(requests.filter(request => request.method === "POST").at(-1).body)
  const input = () => byClass(panel(), "tt-as-input")[0]
  input().value = "What now?"
  input().onkeydown({ key: "Enter", shiftKey: true, preventDefault() {} })
  assert.equal(assistant.history.length, 0, "Shift+Enter does not send")
  input().onkeydown({ key: "Enter", shiftKey: false, preventDefault() {} })
  await until(() => !assistant.busy && assistant.history.length === 2, "first answer")
  const sent = lastQuestion()
  const question = sent.contents.at(-1).parts[0].text
  for (const fragment of ["<context>", "## Run context", "Campaign: Glassgate.", "# Harbor run", "State: the gate is open.", "## World day", "First of the month, full moon.",
    "## Combat state", "Eve (player)", `## Note: ${docks.path}`, "The docks smell of tar.", `## Active note: ${ariaFile.path}`, "Aria keeps watch.", "GM question: What now?"]) assert.ok(question.includes(fragment), fragment)
  assert.equal(question.includes("date: 1"), false, "world-day frontmatter is stripped")
  assert.equal(sent.system_instruction.parts[0].text, plugin.settings.systemPrompt)
  env.record(sent.system_instruction.parts[1].text)
  assert.equal(sent.system_instruction.parts[1].text, s.assistantRetrievalInstructions)
  assert.equal(sent.generationConfig.temperature, 0.3)
  assert.equal(assistant.history[1].text, "Hello there.")
  assert.ok(byClass(panel(), "tt-as-model").some(element => element.textContent.includes("Hello there.")))

  // Context truncation.
  plugin.settings.maxContext = 40
  const truncated = await assistant.buildContext()
  assert.ok(truncated.endsWith("[context truncated]"))
  plugin.settings.maxContext = 24000

  // Quick prompts: five send immediately, two wait for the GM to complete them.
  const quick = [[s.quickSceneLabel, s.quickScenePrompt], [s.quickNpcLabel, s.quickNpcPrompt], [s.quickPasserbyLabel, s.quickPasserbyPrompt],
    [s.quickConsequencesLabel, s.quickConsequencesPrompt], [s.quickSummaryLabel, s.quickSummaryPrompt], [s.quickNamesLabel, s.quickNamesPrompt], [s.quickMechanicsLabel, s.quickMechanicsPrompt]]
  for (const [label, prompt] of quick) {
    const button = byClass(panel(), "tt-as-quick-button").find(element => element.textContent === label)
    assert.equal(button.attributes.title, prompt)
    const before = assistant.history.length
    button.click()
    if (prompt.endsWith("\n\n")) {
      assert.equal(input().value, prompt)
      assert.equal(assistant.history.length, before)
    } else {
      await until(() => !assistant.busy && assistant.history.length === before + 2, label)
      assert.ok(lastQuestion().contents.at(-1).parts[0].text.endsWith(`GM question: ${prompt.trim()}`), label)
    }
  }
  input().value = ""

  // Message actions: copy, insert, regenerate.
  const lastAction = title => byLabel(panel(), title).at(-1)
  await lastAction(s.copy).click()
  assert.ok(env.clipboard.includes(assistant.history.at(-1).text))
  assert.ok(notices.includes(s.copied))
  workspace.activeView = null
  lastAction(s.insertIntoNote).click()
  assert.ok(notices.includes(s.openNoteInEditor))
  const inserted = []
  workspace.activeView = { editor: { replaceSelection: value => inserted.push(value) } }
  lastAction(s.insertIntoNote).click()
  assert.deepEqual(inserted, [assistant.history.at(-1).text + "\n"])
  assert.ok(notices.includes(s.inserted))
  const historyLength = assistant.history.length
  const regeneratedQuestion = assistant.history.at(-2).text
  lastAction(s.regenerate).click()
  await until(() => !assistant.busy && assistant.history.length === historyLength, "regenerate")
  assert.equal(assistant.history.at(-2).text, regeneratedQuestion)

  // Stopping a request keeps the partial answer.
  env.network.fetch = async (_url, options) => sseResponse([text(["Partial"])], { signal: options.signal, hold: true })
  void assistant.send("Tell me everything")
  await until(() => byClass(panel(), "tt-as-stop").length === 1, "stop button")
  assert.ok(byClass(panel(), "tt-as-status")[0].textContent.includes(s.writing))
  assert.equal(byClass(panel(), "tt-as-stop")[0].textContent, s.stop)
  byClass(panel(), "tt-as-stop")[0].click()
  await until(() => !assistant.busy, "stopped")
  assert.ok(assistant.history.at(-1).text.startsWith("Partial"))
  assert.ok(assistant.history.at(-1).text.includes(s.stopped))

  // Gemini errors and fallbacks.
  const answerFor = async (question, fetchImplementation) => {
    env.network.fetch = fetchImplementation
    await assistant.send(question)
    return assistant.history.at(-1).text
  }
  const failure = (status, payload) => async () => ({ ok: false, status, body: null, json: async () => { if (payload === undefined) throw new Error("no json"); return payload } })
  assert.ok((await answerFor("Model?", failure(404, { error: { message: "no such model" } }))).includes(fill(s.errorModelMissing, { message: "no such model" })))
  assert.ok((await answerFor("Key?", failure(400, { error: { message: "API key not valid" } }))).includes(s.errorInvalidKey))
  assert.ok((await answerFor("Busy?", failure(429, { error: { message: "slow down" } }))).includes(s.errorRateLimit))
  assert.ok((await answerFor("Broken?", failure(500))).includes(fill(s.errorGeneric, { status: 500, message: s.errorUnknown })))
  assert.ok((await answerFor("Denied?", async () => sseResponse([{ error: { code: 403, message: "nope" } }]))).includes(s.errorForbidden))
  assert.ok((await answerFor("Blocked?", async () => sseResponse([{ promptFeedback: { blockReason: "SAFETY" } }]))).includes(fill(s.responseBlocked, { reason: "SAFETY" })))
  env.network.requestUrl = async () => ({ status: 200, json: text(["Fallback answer"]) })
  assert.equal(await answerFor("Offline?", async () => { throw new TypeError("blocked") }), "Fallback answer")

  // Asking about a selection opens the assistant and sends the text.
  env.network.fetch = async () => sseResponse([text(["The captain is Erin."])])
  await command(s.commandAskSelection).editorCallback({ getSelection: () => "Who is the captain?" })
  assert.equal(assistant.history.at(-2).text, "Who is the captain?")
  assert.equal(assistant.history.at(-1).text, "The captain is Erin.")
  byLabel(panel(), s.newConversation)[0].click()
  assert.deepEqual([assistant.history.length, assistant.attachments.length], [0, 0])

  let toolRound = 0
  plugin.settings.maxToolSteps = 1
  env.network.fetch = async () => sseResponse([toolRound++ === 0
    ? { candidates: [{ content: { parts: [{ functionCall: { name: "get_combat_state", args: {} } }] } }] }
    : text(["Tool answer."])])
  await assistant.send("Use a tool")
  assert.ok(assistant.history.at(-1).toolTrace?.length)
  assert.ok(byText(panel(), s.assistantToolTrace).length)

  toolRound = 0
  env.network.fetch = async () => sseResponse([toolRound++ === 0
    ? { candidates: [{ content: { parts: [{ functionCall: { name: "search_vault", args: { query: "docks" } } }] } }] }
    : text(["Source answer."])])
  await assistant.send("Find the docks")
  assert.ok(assistant.history.at(-1).sources?.includes(docks.path))
  assert.ok(byClass(panel(), "tt-as-source").some(element => element.attributes["data-path"] === docks.path))

  const invalidSkill = addFile("_local/assistant/skills/invalid.md", ["---", "name: invalid", "---", "Missing description."].join("\n"), { name: "invalid" })
  env.emit("changed", invalidSkill)
  await until(() => notices.some(notice => notice.includes(invalidSkill.path)), "invalid assistant skill")
  assert.ok(notices.some(notice => notice.includes(fill(s.assistantSkillInvalid, { paths: invalidSkill.path }))))

  // Embedding status, failure fallback, and the settings test each render their localised text.
  plugin.index.embeddingRunning = true
  assistant.renderIndexStatus()
  plugin.index.embeddingRunning = false
  env.network.requestUrl = async () => { throw new Error("embedding offline") }
  plugin.settings.embeddingProvider = "ollama"
  await plugin.applyEmbeddingSettings()
  await plugin.index.whenEmbedded()
  assert.ok(notices.includes(s.assistantEmbeddingUnavailable))
  await buttonComponent(settingsEl, s.settingsEmbeddingTest).click()
  assert.ok(notices.some(notice => notice.includes("embedding offline")))

  for (const ribbon of plugin.ribbons) await ribbon.callback()
  await command(s.commandOpenHome).callback()
  const home = env.leaves.find(leaf => leaf.type === "tt-home").view
  addFile("Runs/Player/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  addFile("Runs/Loose/Run.md", "", { type: "run", role: "gm", party: "[[Parties/Watch/Party]]" })
  await home.render()
  for (const filePath of ["Runs/Harbor/Run.md", "Runs/Player/Run.md", "Runs/Loose/Run.md", "Campaigns/Glass/Campaign.md", "Parties/Watch/Party.md"]) env.files.delete(filePath)
  await home.render()
  addFile("Runs/Harbor/Run.md", "# Harbor run", { type: "run", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  addFile("Runs/Harbor/State.md", "State: the gate is open.")
  addFile("Campaigns/Glass/Campaign.md", "Campaign: Glassgate.", { type: "campaign", system: "dnd5e" })
  addFile("Parties/Watch/Party.md", "", { type: "party" })
  await home.render()
  await byLabel(home.contentEl, s.homeNewCampaign)[0].click()
  let homeModal = modals.at(-1)
  await buttonComponent(homeModal.contentEl, s.homeCreate).click()
  assert.ok(notices.includes(s.homeInvalidName))
  homeModal.close()
  await byLabel(home.contentEl, s.homeNewCampaign)[0].click()
  homeModal = modals.at(-1)
  settingByName(homeModal.contentEl, s.homeFieldName).components[0].change("Glass")
  await buttonComponent(homeModal.contentEl, s.homeCreate).click()
  assert.ok(notices.includes(s.homeExists))
  homeModal.close()
  await byLabel(home.contentEl, s.homeNewParty)[0].click()
  modals.at(-1).close()
  await byLabel(home.contentEl, s.homeNewRun)[0].click()
  homeModal = modals.at(-1)
  settingByName(homeModal.contentEl, s.homeFieldName).components[0].change("No party")
  await buttonComponent(homeModal.contentEl, s.homeCreate).click()
  assert.ok(notices.includes(s.homeRunNeedsCampaignParty))
  homeModal.close()
  return { env, plugin }
}

/** Loads the plugin with an unreadable string override and returns the notices it raised. */
export async function runInvalidOverride() {
  const env = createEnvironment()
  env.addFile("_local/plugins/table-tools/strings.json", "{ not json")
  const TableTools = env.load()
  const plugin = new TableTools(env.app, { id: "table-tools" })
  env.workspace.plugin = plugin
  await plugin.onload()
  return { env, plugin }
}
