// A small, faithful-enough Obsidian API mock for driving the built Table Tools bundle.
// Every text that would reach the screen (element text, titles, placeholders, labels,
// notices, setting names, command names, suggestion items, note appends) is recorded.
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export function createEnvironment() {
  const rendered = []
  const notices = []
  const record = value => { if (value !== undefined && value !== null && value !== "") rendered.push(String(value)) }

  class MockElement {
    constructor(tag = "div", parent = null) {
      this.tag = tag
      this.parent = parent
      this.children = []
      this.ownText = ""
      this.classes = new Set()
      this.attributes = {}
      this.style = {}
      this.listeners = {}
      this.settings = []
      this.value = ""
      this.checked = false
      this.scrollTop = 0
      this.scrollHeight = 0
      this.onclick = null
      this.onchange = null
      this.onkeydown = null
    }
    applyOptions(options) {
      if (typeof options === "string") { options.split(/\s+/).filter(Boolean).forEach(name => this.classes.add(name)); return this }
      if (!options) return this
      if (options.cls) options.cls.split(/\s+/).filter(Boolean).forEach(name => this.classes.add(name))
      if (options.text !== undefined) { this.ownText = String(options.text); record(options.text) }
      if (options.type !== undefined) this.type = options.type
      if (options.value !== undefined) this.value = String(options.value)
      if (options.href !== undefined) this.attributes.href = options.href
      for (const [name, value] of Object.entries(options.attr ?? {})) {
        this.attributes[name] = String(value)
        if (["title", "placeholder", "aria-label"].includes(name)) record(value)
      }
      return this
    }
    createEl(tag, options) { const child = new MockElement(tag, this).applyOptions(options); this.children.push(child); return child }
    createDiv(options) { return this.createEl("div", options) }
    createSpan(options) { return this.createEl("span", options) }
    setText(text) { this.children = []; this.ownText = String(text); record(text) }
    appendText(text) { const node = new MockElement("#text", this); node.ownText = String(text); record(text); this.children.push(node) }
    empty() { this.children = []; this.ownText = ""; this.settings = [] }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
    addClass(name) { this.classes.add(name) }
    removeClass(name) { this.classes.delete(name) }
    toggleClass(name, force) { if (force ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name) }
    hasClass(name) { return this.classes.has(name) }
    focus() { this.focused = true }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener) }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join("") }
    closest(selector) {
      const tags = selector.split(",").map(value => value.trim())
      for (let node = this; node; node = node.parent) if (tags.includes(node.tag)) return node
      return null
    }
    all(predicate, found = []) { for (const child of this.children) { if (predicate(child)) found.push(child); child.all(predicate, found) } return found }
    querySelector(selector) { const name = selector.replace(/^\./, ""); return this.all(element => element.classes.has(name))[0] ?? null }
    click(event = {}) {
      const payload = { target: event.target ?? this, stopPropagation() {}, preventDefault() {}, ...event }
      for (const listener of this.listeners.click ?? []) listener(payload)
      return this.onclick?.(payload)
    }
  }

  const byLabel = (element, label) => element.all(child =>
    child.attributes["aria-label"] === label || child.attributes.title === label || (child.tag === "button" && child.textContent === label))
  const byClass = (element, name) => element.all(child => child.classes.has(name))
  const byText = (element, text) => element.all(child => child.ownText === text)

  class TFile {
    constructor(filePath) {
      this.path = filePath
      this.basename = filePath.split("/").pop().replace(/\.[^.]+$/, "")
      this.extension = filePath.split(".").pop()
      this.parent = { path: filePath.split("/").slice(0, -1).join("/") }
    }
  }

  const modals = []
  class Modal {
    constructor(app) { this.app = app; this.contentEl = new MockElement("div") }
    open() { modals.push(this); return this.onOpen?.() }
    close() { this.onClose?.(); const index = modals.indexOf(this); if (index >= 0) modals.splice(index, 1) }
  }
  class FuzzySuggestModal extends Modal {
    setPlaceholder(text) { this.placeholder = text; record(text) }
    open() { modals.push(this); this.items = this.getItems(); this.items.forEach(item => record(this.getItemText(item))) }
    choose(predicate) { const item = this.items.find(predicate); this.close(); return this.onChooseItem(item) }
  }

  class Component {
    constructor() { this.inputEl = new MockElement("input"); this.changeHandlers = [] }
    setValue(value) { this.value = value; if (typeof value === "string") record(value); return this }
    getValue() { return this.value }
    setPlaceholder(text) { record(text); return this }
    onChange(handler) { this.changeHandlers.push(handler); return this }
    change(value) { this.value = value; for (const handler of this.changeHandlers) handler(value); return this }
    setLimits() { return this }
    setDynamicTooltip() { return this }
    addOption(value, label) { (this.options ??= {})[value] = label; record(label); return this }
    addOptions(options) { for (const [value, label] of Object.entries(options)) this.addOption(value, label); return this }
    setButtonText(text) { this.text = text; record(text); return this }
    setCta() { return this }
    setWarning() { this.warning = true; return this }
    setIcon() { return this }
    setTooltip(text) { this.tooltip = text; record(text); return this }
    onClick(handler) { this.clickHandler = handler; return this }
    click() { return this.clickHandler?.() }
  }
  class Setting {
    constructor(container) {
      this.container = container
      this.settingEl = container.createDiv("setting-item")
      this.controlEl = this.settingEl.createDiv("setting-item-control")
      this.components = []
      container.settings.push(this)
    }
    setName(name) { this.name = name; record(name); return this }
    setDesc(description) { this.description = description; record(description); return this }
    setHeading() { this.heading = true; return this }
    add(kind, callback) { const component = new Component(); component.kind = kind; this.components.push(component); callback(component); return this }
    addText(callback) { return this.add("text", callback) }
    addTextArea(callback) { return this.add("textarea", callback) }
    addSlider(callback) { return this.add("slider", callback) }
    addToggle(callback) { return this.add("toggle", callback) }
    addDropdown(callback) { return this.add("dropdown", callback) }
    addButton(callback) { return this.add("button", callback) }
    addExtraButton(callback) { return this.add("extra", callback) }
  }
  const settingByName = (container, name) => container.settings.find(setting => setting.name === name)
  const buttonComponent = (container, text) => container.settings.flatMap(setting => setting.components).find(component => component.kind === "button" && component.text === text)

  class Notice { constructor(message) { notices.push(String(message)); record(message) } }
  class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = new MockElement("div") } }
  class MarkdownView {}
  class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = new MockElement("div") } }

  const storage = { data: null }
  class Plugin {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; this.viewFactories = new Map(); this.commands = []; this.ribbons = []; this.settingTabs = [] }
    async loadData() { return storage.data ? JSON.parse(JSON.stringify(storage.data)) : null }
    async saveData(data) { storage.data = JSON.parse(JSON.stringify(data)) }
    registerView(type, factory) { this.viewFactories.set(type, factory) }
    registerEvent() {}
    addRibbonIcon(icon, title, callback) { record(title); this.ribbons.push({ icon, title, callback }) }
    addCommand(command) { record(command.name); this.commands.push(command) }
    addSettingTab(tab) { this.settingTabs.push(tab) }
  }

  // Vault
  const files = new Map()
  const addFile = (filePath, content = "", frontmatter = null) => { files.set(filePath, { file: new TFile(filePath), content, frontmatter }); return files.get(filePath).file }
  const adapterFiles = new Map()
  const listeners = new Map()
  const on = (event, callback) => { const entries = listeners.get(event) ?? []; entries.push(callback); listeners.set(event, entries); return { event, callback } }
  const emit = (event, ...args) => { for (const callback of listeners.get(event) ?? []) callback(...args) }
  const appended = []
  const opened = []
  const leaves = []
  const workspace = {
    activeFile: null,
    activeView: null,
    plugin: null,
    getLeavesOfType: type => leaves.filter(leaf => leaf.type === type),
    getRightLeaf: () => {
      const leaf = { app, type: null, view: null, async setViewState(state) { this.type = state.type; this.view = workspace.plugin.viewFactories.get(state.type)(this); leaves.push(this); await this.view.onOpen() } }
      return leaf
    },
    revealLeaf: () => {},
    getActiveFile: () => workspace.activeFile,
    getActiveViewOfType: () => workspace.activeView,
    openLinkText: async target => { opened.push(target) },
  }
  const app = {
    vault: {
      configDir: ".obsidian",
      getMarkdownFiles: () => [...files.values()].filter(entry => entry.file.extension === "md").map(entry => entry.file),
      getAbstractFileByPath: filePath => files.get(filePath)?.file ?? null,
      cachedRead: async file => files.get(file.path)?.content ?? "",
      append: async (file, text) => { files.get(file.path).content += text; appended.push(text); record(text) },
      adapter: { read: async filePath => { if (!adapterFiles.has(filePath)) throw new Error("missing"); return adapterFiles.get(filePath) }, write: async (filePath, value) => adapterFiles.set(filePath, value), mkdir: async () => {} },
      on,
    },
    metadataCache: {
      getFileCache: file => ({ frontmatter: files.get(file.path)?.frontmatter ?? undefined }),
      getFirstLinkpathDest: link => {
        const clean = String(link).replace(/\.md$/, "")
        return files.get(`${clean}.md`)?.file ?? [...files.values()].find(entry => entry.file.basename === clean)?.file ?? null
      },
      on,
    },
    workspace,
    setting: { open() { this.opened = true } },
  }

  // Network
  const requests = []
  const network = { requestUrl: async () => ({ status: 200, json: {} }), fetch: null }
  const requestUrl = async options => { requests.push(options); return network.requestUrl(options) }

  const clipboard = []
  const obsidian = {
    Plugin, ItemView, Modal, FuzzySuggestModal, PluginSettingTab, Setting, Notice, TFile, MarkdownView,
    MarkdownRenderer: { render: async (_app, markdown, element) => { element.appendText(markdown) } },
    requestUrl,
    parseYaml: text => JSON.parse(text),
    setIcon: () => {},
  }

  const load = () => {
    const require = createRequire(import.meta.url)
    const moduleApi = require("node:module")
    const originalLoad = moduleApi._load
    moduleApi._load = (request, parent, isMain) => request === "obsidian" ? obsidian : originalLoad(request, parent, isMain)
    const bundle = path.join(root, "_system/plugin/main.js")
    delete require.cache[require.resolve(bundle)]
    try { return require(bundle).default } finally { moduleApi._load = originalLoad }
  }

  globalThis.fetch = (...args) => { requests.push({ url: args[0], ...args[1] }); return network.fetch(...args) }
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async text => { clipboard.push(text); record(text) } } }, configurable: true })

  return {
    app, workspace, files, addFile, adapterFiles, appended, opened, leaves, modals, notices, rendered, requests, network, clipboard, storage, emit,
    MockElement, TFile, MarkdownView, load, byLabel, byClass, byText, settingByName, buttonComponent, record,
  }
}

/** Server-sent-event response built from JSON payloads. */
export function sseResponse(payloads, { signal, hold = false } = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const payload of payloads) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      if (!hold) { controller.close(); return }
      signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })))
    },
  })
  return { ok: true, status: 200, body: stream, json: async () => ({}) }
}
