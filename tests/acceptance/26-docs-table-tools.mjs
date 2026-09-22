// Prompt 26: the manual documents every Table Tools command, setting, tracker label and assistant tool.
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, run, test } from "./support.mjs"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const read = file => readFile(path.join(repository, file), "utf8")
const exists = file => stat(path.join(repository, file)).then(() => true, () => false)
const pages = { tools: "docs/TABLE-TOOLS.md", settings: "docs/SETTINGS.md", home: "docs/HOME.md", assistant: "docs/ASSISTANT.md" }

const main = await read("_system/plugin/src/main.ts")
const types = await read("_system/plugin/src/types.ts")
const toolSource = await read("_system/plugin/src/tools.ts")
const stringSource = await read("_system/plugin/src/strings.ts")
const strings = Object.fromEntries([...stringSource.matchAll(/^ {2}(\w+): "((?:[^"\\]|\\.)*)",$/gm)].map(([, key, value]) => [key, value.replace(/\\"/g, '"')]))
const defaults = [...types.slice(types.indexOf("export const DEFAULTS")).matchAll(/^ {2}(\w+): (true|false|-?\d+(?:\.\d+)?|"[^"]*"),$/gm)].map(([, key, value]) => [key, value.replace(/^"|"$/g, "")])
const settingsKeys = [...types.slice(types.indexOf("export const DEFAULTS")).matchAll(/^ {2}(\w+):/gm)].map(([, key]) => key)
const labelled = prefix => Object.entries(strings).filter(([key]) => key.startsWith(prefix)).map(([, value]) => value)

test("the Table Tools pages exist and each has one title", async () => {
  for (const page of Object.values(pages)) {
    assert.ok(await exists(page), `${page} exists`)
    assert.equal((await read(page)).split("\n").filter(line => line.startsWith("# ")).length, 1, `${page} has exactly one H1`)
  }
  const index = await read("docs/README.md")
  for (const page of Object.values(pages)) assert.ok(index.includes(path.relative("docs", page)), `docs/README.md links ${page}`)
})

test("every command and ribbon is documented with its id and its label", async () => {
  const body = await read(pages.tools)
  const commands = [...main.matchAll(/addCommand\(\{\s*id: "([a-z-]+)",\s*name: s\.(\w+)/g)]
  const ribbons = [...main.matchAll(/addRibbonIcon\("[a-z-]+", s\.(\w+)/g)]
  assert.ok(commands.length >= 8, `found the commands in the source: ${commands.length}`)
  assert.ok(ribbons.length >= 3, `found the ribbons in the source: ${ribbons.length}`)
  for (const [, id, key] of commands) {
    assert.ok(body.includes(id), `${pages.tools} documents the command id ${id}`)
    assert.ok(body.includes(strings[key]), `${pages.tools} documents the command label "${strings[key]}"`)
  }
  for (const [, key] of ribbons) assert.ok(body.includes(strings[key]), `${pages.tools} documents the ribbon "${strings[key]}"`)
})

test("every setting is documented with its default value", async () => {
  const body = await read(pages.settings)
  assert.ok(settingsKeys.length >= 20, `found the settings in the source: ${settingsKeys.length}`)
  for (const key of settingsKeys) assert.ok(body.includes(key), `${pages.settings} documents the setting ${key}`)
  for (const [key, value] of defaults) {
    const lines = body.split("\n").filter(line => line.includes(key))
    const expected = value === "" ? "empty" : value
    assert.ok(lines.some(line => line.includes(expected)), `${pages.settings} gives the default ${value === "" ? "(empty)" : value} for ${key}`)
  }
  for (const key of ["settingsAssistantHeading", "settingsHomeHeading", "settingsCombatHeading"]) {
    assert.ok(body.includes(strings[key]), `${pages.settings} uses the settings section "${strings[key]}"`)
  }
})

test("the combat tracker page explains its toolbar, columns and difficulty levels", async () => {
  const body = await read(pages.tools)
  for (const label of [...labelled("toolbar"), ...labelled("column"), ...labelled("difficulty")]) {
    if (label.includes("{")) continue
    assert.ok(body.includes(label), `${pages.tools} explains "${label}"`)
  }
})

test("the home page explains every home control and message", async () => {
  const body = await read(pages.home)
  for (const label of labelled("home")) {
    if (label.includes("{")) continue
    assert.ok(body.includes(label), `${pages.home} explains "${label}"`)
  }
})

test("the assistant page lists every tool and shipped skill", async () => {
  const body = await read(pages.assistant)
  const tools = [...new Set([...toolSource.matchAll(/name: "([a-z_]+)"/g)].map(match => match[1]))]
  assert.ok(tools.length >= 9, `found the assistant tools in the source: ${tools.length}`)
  for (const tool of tools) assert.ok(body.includes(tool), `${pages.assistant} documents the tool ${tool}`)
  for (const file of await readdir(path.join(repository, "_system/assistant/skills"))) {
    const name = (await read(`_system/assistant/skills/${file}`)).match(/^name:\s*(\S+)/m)[1]
    assert.ok(body.includes(name), `${pages.assistant} lists the shipped skill ${name}`)
  }
  for (const provider of ["none", "ollama", "gemini"]) assert.ok(body.includes(provider), `${pages.assistant} covers the embedding provider ${provider}`)
})

await run("26-docs-table-tools")
