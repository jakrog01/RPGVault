import assert from "node:assert/strict"
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const vault = await mkdtemp(path.join(os.tmpdir(), "rpgvault-adopt-target-"))
const imported = await mkdtemp(path.join(os.tmpdir(), "rpgvault-adopt-source-"))
await cp(source, vault, { recursive: true, filter: item => !item.includes(`${path.sep}.git`) })
const fixture = new Map([["Old Campaigns/Example/Campaign.md", "campaign\n"], ["Old Parties/Example/Party.md", "party\n"], ["Old Runs/Example/Run.md", "run\n"], ["Rules/dnd5e/Creatures/Wisp.md", "creature\n"], ["Assets/map.txt", "asset\n"], [".obsidian/plugins/old-table/data.json", '{"token":"fake-key-012345","activeFile":"Old/Current.md"}\n'], [".obsidian/plugins/calendarium/data.json", '{"calendars":[{"name":"Example"}]}\n']])
for (const [relative, content] of fixture) { const item = path.join(imported, relative); await mkdir(path.dirname(item), { recursive: true }); await writeFile(item, content) }
const map = path.join(imported, "map.json")
await writeFile(map, JSON.stringify({ folders: [{ from: "Old Campaigns", to: "Campaigns" }, { from: "Old Parties", to: "Parties" }, { from: "Old Runs", to: "Runs" }, { from: "Rules/*/Creatures", to: "Library/Mechanics/*/Bestiary" }, { from: "Assets", to: "Library/Assets" }], pluginData: [{ from: ".obsidian/plugins/old-table/data.json", to: "table-tools", keys: { token: "apiKey", activeFile: "activePointerPath" }, rewrites: { activePointerPath: { "Old/Current.md": "Active.md" } } }], calendar: { from: ".obsidian/plugins/calendarium/data.json", to: ".obsidian/plugins/calendarium/data.json" } }))
const result = await exec("node", [path.join(vault, "_system/bin/rpgvault.mjs"), "adopt", imported, "--map", map], { cwd: vault })
assert.equal(result.stdout.includes("fake-key-012345"), false)
assert.equal(await readFile(path.join(vault, "Campaigns/Example/Campaign.md"), "utf8"), "campaign\n")
assert.equal(await readFile(path.join(vault, "Library/Mechanics/dnd5e/Bestiary/Wisp.md"), "utf8"), "creature\n")
assert.equal(JSON.parse(await readFile(path.join(vault, ".obsidian/plugins/table-tools/data.json"), "utf8")).apiKey, "fake-key-012345")
assert.equal(JSON.parse(await readFile(path.join(vault, ".obsidian/plugins/calendarium/data.json"), "utf8")).calendars[0].name, "Example")
await rm(vault, { recursive: true }); await rm(imported, { recursive: true })
