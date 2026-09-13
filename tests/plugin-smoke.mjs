import assert from "node:assert/strict"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

class Element {
  empty() {}
  addClass() {}
  createDiv() { return new Element() }
  createEl() { return new Element() }
  createSpan() { return new Element() }
  appendText() {}
  setText() {}
  toggleClass() {}
  inputEl = { type: "", style: {} }
  value = ""
  checked = false
  onclick = () => {}
  onchange = () => {}
}
class TFile { constructor(path = "_local/plugins/table-tools/strings.json") { this.path = path; this.basename = path.split("/").at(-1).replace(/\.json$/, ""); this.parent = null } }
class Plugin { constructor(app) { this.app = app; this.commands = []; this.views = new Map() } async loadData() { return {} } async saveData() {} registerView(type, factory) { this.views.set(type, factory) } addRibbonIcon() {} addCommand(command) { this.commands.push(command) } addSettingTab() {} }
class ItemView { constructor(leaf) { this.app = leaf.app; this.contentEl = new Element() } }
class Modal { constructor(app) { this.app = app; this.contentEl = new Element() } open() {} close() {} }
class FuzzySuggestModal extends Modal {}
class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = new Element() } }
class Setting { setName() { return this } setDesc() { return this } setHeading() { return this } addText(callback) { callback(new Control()); return this } addTextArea(callback) { callback(new Control()); return this } addDropdown(callback) { callback(new Control()); return this } addButton(callback) { callback(new Control()); return this } addSlider(callback) { callback(new Control()); return this } addToggle(callback) { callback(new Control()); return this } }
class Control { inputEl = { type: "", style: {} }; setValue() { return this } setPlaceholder() { return this } onChange() { return this } addOption() { return this } setLimits() { return this } setButtonText() { return this } onClick() { return this } }
const notices = []
class Notice { constructor(message) { notices.push(message) } }

const require = createRequire(import.meta.url)
const moduleApi = require("node:module")
const originalLoad = moduleApi._load
moduleApi._load = (request, parent, main) => request === "obsidian" ? { Plugin, ItemView, Modal, FuzzySuggestModal, PluginSettingTab, Setting, Notice, TFile, MarkdownRenderer: { render: async () => {} }, requestUrl: async () => ({ status: 200, json: {} }), parseYaml: () => ({}), setIcon: () => {} } : originalLoad(request, parent, main)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const app = {
  vault: { getAbstractFileByPath: value => value === "_local/plugins/table-tools/strings.json" ? new TFile() : null, cachedRead: async () => '{"combat":"Encounter"}', getMarkdownFiles: () => [] },
  metadataCache: { getFileCache: () => ({}), getFirstLinkpathDest: () => null },
  workspace: { getLeavesOfType: () => [], getRightLeaf: () => ({ setViewState: async () => {}, app }), revealLeaf: () => {}, getActiveFile: () => null }
}
const pluginModule = require(path.join(root, "_system/plugin/main.js"))
const plugin = new pluginModule.default(app)
await plugin.onload()
assert.equal(plugin.strings.combat, "Encounter")
for (const factory of plugin.views.values()) { const view = factory({ app }); await view.onOpen(); }
for (const command of plugin.commands) { if (command.callback) command.callback(); if (command.editorCallback) await command.editorCallback({ getSelection: () => "" }); }
const combat = plugin.views.get("tt-combat")({ app })
const player = { id: "player", name: "Hero", kind: "player", initiative: 10, modifier: 0, ac: 15, hpMax: 20, hp: 20, temporaryHp: 5, conditions: [], note: "", hidden: false }
plugin.combat.participants = [player]
combat.applyRowInput(player, "12")
assert.equal(player.temporaryHp, 0)
assert.equal(player.hp, 13)
combat.applyRowInput(player, "+30")
assert.equal(player.hp, 20)
combat.applyRowInput(player, "t8")
combat.applyRowInput(player, "t4")
assert.equal(player.temporaryHp, 8)
const entries = plugin.combat.log.length
combat.applyRowInput(player, "abc")
assert.equal(plugin.combat.log.length, entries)
assert.ok(notices.length > 0)
combat.applyRowInput(player, "28")
assert.equal(player.hp, 0)
assert.ok(player.conditions.includes(plugin.strings.conditionDying))
combat.applyRowInput(player, "+1")
assert.equal(player.hp, 1)
assert.equal(player.conditions.includes(plugin.strings.conditionDying), false)
combat.setNote(player, "Watch the gate")
combat.setHidden(player, true)
assert.equal(player.note, "Watch the gate")
assert.equal(player.hidden, true)
assert.ok(plugin.combat.log.length > entries)
console.log("plugin smoke gate: clean")
