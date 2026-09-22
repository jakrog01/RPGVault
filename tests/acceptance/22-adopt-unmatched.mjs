// Prompt 22: adopt refuses a map whose sources are missing, names them, and writes nothing.
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, run, test } from "./support.mjs"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const skipped = item => item.includes(`${path.sep}.git`) || item.includes(`${path.sep}node_modules`)

async function setup(files) {
  const vault = await mkdtemp(path.join(os.tmpdir(), "rpgvault-adopt22-target-"))
  const source = await mkdtemp(path.join(os.tmpdir(), "rpgvault-adopt22-source-"))
  await cp(repository, vault, { recursive: true, filter: item => !skipped(item) })
  for (const [relative, content] of Object.entries(files)) {
    const item = path.join(source, relative)
    await mkdir(path.dirname(item), { recursive: true })
    await writeFile(item, content)
  }
  return { vault, source }
}

function adopt(vault, source, map) {
  return new Promise(async resolve => {
    const mapPath = path.join(os.tmpdir(), `rpgvault-adopt22-map-${process.pid}-${Date.now()}.json`)
    await writeFile(mapPath, JSON.stringify(map))
    execFile("node", [path.join(vault, "_system/bin/rpgvault.mjs"), "adopt", source, "--map", mapPath], { cwd: vault, timeout: 60000 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr })
    })
  })
}

async function snapshot(root) {
  const lines = []
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name)
      if (skipped(item)) continue
      if (entry.isDirectory()) await walk(item)
      else lines.push(`${path.relative(root, item)} ${createHash("sha1").update(await readFile(item)).digest("hex")}`)
    }
  }
  await walk(root)
  return lines.sort().join("\n")
}

const exists = async item => readFile(item).then(() => true, () => false)
const cleanup = async (...directories) => { for (const directory of directories) await rm(directory, { recursive: true, force: true }) }

test("a source wrapped in one folder fails, names the missing folders, suggests the inner folder, and writes nothing", async () => {
  const { vault, source } = await setup({ "Legacy/Campaign Library/Glass/Campaign.md": "campaign\n", "Legacy/Runs/Glass/Run.md": "run\n" })
  const before = await snapshot(vault)
  const result = await adopt(vault, source, { folders: [{ from: "Campaign Library", to: "Campaigns" }, { from: "Runs", to: "Runs" }] })
  assert.notEqual(result.code, 0, `adopt must fail; stdout: ${result.stdout}`)
  assert.ok(result.stderr.includes("Campaign Library") && result.stderr.includes("Runs"), `stderr names each missing source: ${result.stderr}`)
  assert.ok(result.stderr.includes(path.join(source, "Legacy")), `stderr suggests the wrapped folder: ${result.stderr}`)
  assert.equal(await snapshot(vault), before, "the target vault is unchanged")
  await cleanup(vault, source)
}, 90000)

test("one missing folder among matching ones fails before anything is copied", async () => {
  const { vault, source } = await setup({ "Old Campaigns/Glass/Campaign.md": "campaign\n" })
  const before = await snapshot(vault)
  const result = await adopt(vault, source, { folders: [{ from: "Old Campaigns", to: "Campaigns" }, { from: "Old Parties", to: "Parties" }] })
  assert.notEqual(result.code, 0, `adopt must fail; stdout: ${result.stdout}`)
  assert.ok(result.stderr.includes("Old Parties"), `stderr names the missing source: ${result.stderr}`)
  assert.equal(result.stderr.includes("Old Campaigns"), false, `stderr does not name the matching source: ${result.stderr}`)
  assert.equal(await exists(path.join(vault, "Campaigns/Glass/Campaign.md")), false, "nothing is copied")
  assert.equal(await snapshot(vault), before, "the target vault is unchanged")
  await cleanup(vault, source)
}, 90000)

test("missing plugin data or calendar sources fail like missing folders", async () => {
  const { vault, source } = await setup({ "Old Campaigns/Glass/Campaign.md": "campaign\n" })
  const before = await snapshot(vault)
  const plugin = await adopt(vault, source, { folders: [{ from: "Old Campaigns", to: "Campaigns" }], pluginData: [{ from: ".obsidian/plugins/old-table/data.json", to: "table-tools", keys: { token: "apiKey" } }] })
  assert.notEqual(plugin.code, 0, `adopt must fail on missing plugin data; stdout: ${plugin.stdout}`)
  assert.ok(plugin.stderr.includes(".obsidian/plugins/old-table/data.json"), `stderr names the plugin data source: ${plugin.stderr}`)
  const calendar = await adopt(vault, source, { folders: [{ from: "Old Campaigns", to: "Campaigns" }], calendar: { from: ".obsidian/plugins/calendarium/data.json", to: ".obsidian/plugins/calendarium/data.json" } })
  assert.notEqual(calendar.code, 0, `adopt must fail on a missing calendar; stdout: ${calendar.stdout}`)
  assert.ok(calendar.stderr.includes(".obsidian/plugins/calendarium/data.json"), `stderr names the calendar source: ${calendar.stderr}`)
  assert.equal(await snapshot(vault), before, "the target vault is unchanged")
  await cleanup(vault, source)
}, 120000)

test("entries marked optional may be missing and are listed as skipped", async () => {
  const { vault, source } = await setup({ "Old Campaigns/Glass/Campaign.md": "campaign\n" })
  const result = await adopt(vault, source, {
    folders: [{ from: "Old Campaigns", to: "Campaigns" }, { from: "Old Assets", to: "Library/Assets", optional: true }],
    pluginData: [{ from: ".obsidian/plugins/old-table/data.json", to: "table-tools", keys: { token: "apiKey" }, optional: true }],
    calendar: { from: ".obsidian/plugins/calendarium/data.json", to: ".obsidian/plugins/calendarium/data.json", optional: true }
  })
  assert.equal(result.code, 0, `adopt succeeds; stderr: ${result.stderr}`)
  assert.equal(await readFile(path.join(vault, "Campaigns/Glass/Campaign.md"), "utf8"), "campaign\n")
  const report = JSON.parse(result.stdout.split("\n").find(line => line.startsWith("{")))
  assert.deepEqual([...report.skipped].sort(), [".obsidian/plugins/calendarium/data.json", ".obsidian/plugins/old-table/data.json", "Old Assets"])
  await cleanup(vault, source)
}, 90000)

await run("22-adopt-unmatched")
