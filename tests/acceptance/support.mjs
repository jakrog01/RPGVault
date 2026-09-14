// Shared harness for locked acceptance tests. Every test drives the built bundle through the
// Obsidian mock, gets a fresh environment, and fails fast on a hard timeout.
import assert from "node:assert/strict"
import { createEnvironment, sseResponse } from "../support/obsidian.mjs"

export { assert, sseResponse }

export const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function within(milliseconds, promise, label) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${milliseconds} ms: ${label}`)), milliseconds)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function until(condition, milliseconds, label) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (await condition()) return
    await sleep(5)
  }
  throw new Error(`condition not met within ${milliseconds} ms: ${label}`)
}

/**
 * Environment with a GM run in campaign Glass (system dnd5e) and party Watch.
 * Adds file stats, a layout-ready queue, and read and write counters.
 */
export function createVault({ adapterFiles } = {}) {
  const env = createEnvironment()
  if (adapterFiles) for (const [key, value] of adapterFiles) env.adapterFiles.set(key, value)
  let clock = 1_000_000
  const addFile = env.addFile
  env.addFile = (filePath, content = "", frontmatter = null) => {
    const file = addFile(filePath, content, frontmatter)
    file.stat = { ctime: clock, mtime: clock++, size: content.length }
    return file
  }
  env.editFile = (filePath, content, frontmatter) => {
    const entry = env.files.get(filePath)
    entry.content = content
    if (frontmatter !== undefined) entry.frontmatter = frontmatter
    entry.file.stat = { ctime: entry.file.stat?.ctime ?? clock, mtime: clock++, size: content.length }
    env.emit("changed", entry.file, content, { frontmatter: entry.frontmatter ?? undefined })
    return entry.file
  }
  env.reads = []
  const cachedRead = env.app.vault.cachedRead
  env.app.vault.cachedRead = async file => { env.reads.push(file.path); return cachedRead(file) }
  env.app.vault.read = env.app.vault.cachedRead
  env.writes = []
  const write = env.app.vault.adapter.write
  env.app.vault.adapter.write = async (filePath, value) => { env.writes.push(filePath); return write(filePath, value) }
  env.binaryWrites = []
  env.app.vault.adapter.writeBinary = async (filePath, data) => {
    env.binaryWrites.push(filePath)
    env.adapterFiles.set(filePath, data instanceof ArrayBuffer ? data.slice(0) : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  }
  env.app.vault.adapter.readBinary = async filePath => {
    if (!env.adapterFiles.has(filePath)) throw new Error("missing")
    const value = env.adapterFiles.get(filePath)
    return value instanceof ArrayBuffer ? value.slice(0) : new TextEncoder().encode(String(value)).buffer
  }
  // Minimal frontmatter reader for notes the plugin creates: flat `key: value` lines, optional quotes.
  const parseFrontmatter = content => {
    const match = String(content).match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    const fields = {}
    for (const line of match[1].split("\n")) {
      const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
      if (pair) fields[pair[1]] = pair[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
    }
    return fields
  }
  env.created = []
  env.app.vault.create = async (filePath, content) => {
    if (env.files.has(filePath)) throw new Error("File already exists.")
    const file = env.addFile(filePath, content, parseFrontmatter(content))
    env.created.push(filePath)
    env.emit("create", file)
    env.emit("changed", file, content, { frontmatter: env.files.get(filePath).frontmatter ?? undefined })
    return file
  }
  env.folders = new Set()
  env.app.vault.createFolder = async folderPath => { env.folders.add(folderPath) }
  env.app.vault.adapter.list = async folderPath => {
    const prefix = `${folderPath.replace(/\/$/, "")}/`
    const all = [...env.adapterFiles.keys(), ...env.files.keys()].filter(key => key.startsWith(prefix))
    const folders = [...new Set(all.map(key => key.slice(prefix.length)).filter(rest => rest.includes("/")).map(rest => prefix + rest.split("/")[0]))]
    const filesInFolder = all.filter(key => !key.slice(prefix.length).includes("/"))
    return { files: filesInFolder, folders }
  }
  env.app.fileManager = {
    processFrontMatter: async (file, update) => {
      const entry = env.files.get(file.path)
      entry.frontmatter = entry.frontmatter ?? {}
      update(entry.frontmatter)
      env.emit("modify", entry.file)
      env.emit("changed", entry.file, entry.content, { frontmatter: entry.frontmatter })
    },
  }
  env.mainLeaves = []
  env.workspace.getLeaf = () => {
    const leaf = { app: env.app, type: null, view: null, async setViewState(state) { this.type = state.type; this.view = env.workspace.plugin.viewFactories.get(state.type)(this); env.leaves.push(this); await this.view.onOpen() } }
    env.mainLeaves.push(leaf)
    return leaf
  }
  env.layout = []
  env.workspace.onLayoutReady = callback => { env.layout.push(callback) }

  env.addFile("Active.md", "", { run: "[[Runs/Harbor/Run]]" })
  env.addFile("Runs/Harbor/Run.md", "# Harbor run", { type: "run", role: "gm", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Harbor/State.md", "State: the gate is open.")
  env.addFile("Campaigns/Glass/Campaign.md", "Campaign: Glassgate.", { type: "campaign", system: "dnd5e" })
  env.addFile("Parties/Watch/Party.md", "", { type: "party" })
  return env
}

export async function boot(env) {
  const TableTools = env.load()
  const plugin = new TableTools(env.app, { id: "table-tools" })
  env.workspace.plugin = plugin
  await within(2000, plugin.onload(), "plugin.onload()")
  return plugin
}

/** What Obsidian does after plugins load: layout becomes ready, then metadata resolves. */
export function startObsidian(env) {
  for (const callback of env.layout.splice(0)) callback()
  env.emit("resolved")
}

export async function idle(plugin, milliseconds = 5000) {
  assert.equal(typeof plugin.index?.whenIdle, "function", "contract: plugin.index.whenIdle() exists")
  await within(milliseconds, plugin.index.whenIdle(), "plugin.index.whenIdle()")
}

export async function unload(plugin) {
  await within(3000, Promise.resolve(plugin.onunload?.()), "plugin.onunload()")
}

export const paths = hits => hits.map(hit => hit.chunk.path)

export async function openAssistant(env, plugin) {
  await plugin.openView("tt-assistant")
  return env.leaves.find(leaf => leaf.type === "tt-assistant").view
}

export const candidate = parts => ({ candidates: [{ content: { role: "model", parts } }] })

export const posts = env => env.requests.filter(request => request.method === "POST").map(request => JSON.parse(request.body))

const registered = []
export const test = (name, body, timeout = 15000) => registered.push({ name, body, timeout })

export async function run(title) {
  let failed = 0
  for (const { name, body, timeout } of registered) {
    try {
      await within(timeout, Promise.resolve().then(body), name)
      console.log(`  ok    ${name}`)
    } catch (error) {
      failed++
      const message = String(error?.message ?? error).split("\n").slice(0, 6).join("\n        ")
      console.log(`  FAIL  ${name}\n        ${message}`)
    }
  }
  console.log(`${title}: ${registered.length - failed}/${registered.length} passed`)
  process.exit(failed ? 1 : 0)
}
