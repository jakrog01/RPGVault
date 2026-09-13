import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runInvalidOverride, runScenario } from "./support/plugin-scenario.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "_system/plugin/src")
const files = await readdir(source)
const contents = await Promise.all(files.filter(file => file.endsWith(".ts")).map(async file => [file, await readFile(path.join(source, file), "utf8")]))

// Obsidian runs on Electron, where browser dialogs are unsupported or silently return nothing.
for (const [file, content] of [...contents, ["main.js", await readFile(path.join(root, "_system/plugin/main.js"), "utf8")]]) assert.equal(/\b(?:prompt|alert|confirm)\s*\(/.test(content), false, `${file} uses an unsupported browser dialog`)

// Every string must be rendered, not merely referenced. The scenario runs with an override in
// which every value carries a unique marker; the recorder captures all text that reaches the
// screen, a notice, a setting, a command, a suggestion, or a note.
const strings = await readFile(path.join(source, "strings.ts"), "utf8")
const table = strings.slice(strings.indexOf("export const englishStrings"), strings.indexOf("};"))
const entries = [...table.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*("(?:[^"\\]|\\.)*"),?$/gm)].map(match => [match[1], JSON.parse(match[2])])
assert.ok(entries.length > 200, `expected the full string table, found ${entries.length} entries`)
const marker = key => `@@${key}@@`
const override = Object.fromEntries(entries.map(([key, value]) => [key, `${marker(key)} ${value}`]))
const { env } = await runScenario({ override })
const rendered = env.rendered.join("\n")

// The unreadable-override notice cannot carry a marker: the override that would supply it is broken.
const invalid = await runInvalidOverride()
const english = Object.fromEntries(entries)
assert.ok(invalid.env.notices.includes(english.stringsOverrideInvalid), "an unreadable override falls back to English with a notice")
assert.equal(invalid.plugin.strings.combatTitle, english.combatTitle)

const unrendered = entries.map(([key]) => key).filter(key => key !== "stringsOverrideInvalid" && !rendered.includes(marker(key)))
assert.deepEqual(unrendered, [], `string keys never rendered: ${unrendered.join(", ")}`)
console.log(`plugin contract gate: clean (${entries.length} strings rendered)`)
