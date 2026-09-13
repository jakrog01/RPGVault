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
