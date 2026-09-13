import assert from "node:assert/strict"
import { createEnvironment } from "./support/obsidian.mjs"

// Loads the built bundle with a local string override, opens every view, runs every command,
// and exercises the combat row rules on a player.
const env = createEnvironment()
env.addFile("_local/plugins/table-tools/strings.json", JSON.stringify({ combatTitle: "Encounter" }))
const TableTools = env.load()
const plugin = new TableTools(env.app, { id: "table-tools" })
env.workspace.plugin = plugin
await plugin.onload()
assert.equal(plugin.strings.combatTitle, "Encounter")
for (const [type, factory] of plugin.viewFactories) { const leaf = { app: env.app, type }; leaf.view = factory(leaf); await leaf.view.onOpen() }
for (const command of plugin.commands) {
  if (command.callback) await command.callback()
  if (command.editorCallback) await command.editorCallback({ getSelection: () => "" })
}

const tracker = plugin.tracker
const player = { id: "player", name: "Hero", kind: "player", initiative: 10, modifier: 0, ac: 15, hpMax: 20, hp: 20, temporaryHp: 5, conditions: [], note: "", hidden: false }
plugin.combat.participants = [player]
tracker.applyRowInput(player, "12")
assert.equal(player.temporaryHp, 0)
assert.equal(player.hp, 13)
tracker.applyRowInput(player, "+30")
assert.equal(player.hp, 20)
tracker.applyRowInput(player, "t8")
tracker.applyRowInput(player, "t4")
assert.equal(player.temporaryHp, 8)
const entries = plugin.combat.log.length
tracker.applyRowInput(player, "abc")
assert.equal(plugin.combat.log.length, entries)
assert.ok(env.notices.length > 0)
tracker.applyRowInput(player, "28")
assert.equal(player.hp, 0)
assert.ok(player.conditions.includes("dying"))
tracker.applyRowInput(player, "+1")
assert.equal(player.hp, 1)
assert.equal(player.conditions.includes("dying"), false)
tracker.update(player, { note: "Watch the gate" })
tracker.setHidden(player, true)
assert.equal(player.note, "Watch the gate")
assert.equal(player.hidden, true)
assert.ok(plugin.combat.log.length > entries)
console.log("plugin smoke gate: clean")
