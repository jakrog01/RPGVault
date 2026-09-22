// Prompt 23: a vault may enable its own community plugins, themes and snippets; doctor and update respect them.
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, run, test } from "./support.mjs"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const skipped = item => item.includes(`${path.sep}.git`) || item.includes(`${path.sep}node_modules`)
const templatePlugins = JSON.parse(await readFile(path.join(repository, "_system/obsidian/community-plugins.json"), "utf8"))
const extras = ["obsidian-style-settings", "dataview"]

function cli(vault, ...args) {
  return new Promise(resolve => execFile("node", [path.join(vault, "_system/bin/rpgvault.mjs"), ...args], { cwd: vault, timeout: 120000 },
    (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, output: `${stdout}${stderr}` })))
}

async function vaultWithLocalLook(plugins) {
  const vault = await mkdtemp(path.join(os.tmpdir(), "rpgvault-local23-"))
  await cp(repository, vault, { recursive: true, filter: item => !skipped(item) })
  await writeFile(path.join(vault, ".obsidian/community-plugins.json"), JSON.stringify(plugins, null, 2))
  for (const id of extras) {
    await mkdir(path.join(vault, ".obsidian/plugins", id), { recursive: true })
    await writeFile(path.join(vault, ".obsidian/plugins", id, "main.js"), `// ${id}\n`)
    await writeFile(path.join(vault, ".obsidian/plugins", id, "data.json"), `{"local":"${id}"}\n`)
  }
  await mkdir(path.join(vault, ".obsidian/themes/Local Theme"), { recursive: true })
  await writeFile(path.join(vault, ".obsidian/themes/Local Theme/theme.css"), "body{}\n")
  await mkdir(path.join(vault, ".obsidian/snippets"), { recursive: true })
  await writeFile(path.join(vault, ".obsidian/snippets/local.css"), ".local{}\n")
  await writeFile(path.join(vault, ".obsidian/appearance.json"), '{"cssTheme":"Local Theme","enabledCssSnippets":["local"]}\n')
  return vault
}

async function source() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rpgvault-local23-source-"))
  await cp(repository, directory, { recursive: true, filter: item => !skipped(item) })
  return directory
}

const readJson = async file => JSON.parse(await readFile(file, "utf8"))

test("doctor accepts community plugins the vault added itself", async () => {
  const vault = await vaultWithLocalLook([...templatePlugins, ...extras])
  const result = await cli(vault, "doctor")
  assert.equal(result.code, 0, result.output)
  assert.ok(result.output.includes("clean"), result.output)
  await rm(vault, { recursive: true, force: true })
}, 60000)

test("doctor still fails when a template plugin is not enabled, naming it", async () => {
  const missing = templatePlugins[templatePlugins.length - 1]
  const vault = await vaultWithLocalLook([...templatePlugins.filter(id => id !== missing), ...extras])
  const result = await cli(vault, "doctor")
  assert.notEqual(result.code, 0, result.output)
  assert.ok(result.output.includes("community-plugins.json") && result.output.includes(missing), result.output)
  await rm(vault, { recursive: true, force: true })
}, 60000)

test("update keeps local plugins enabled and leaves their files, themes, snippets and appearance alone", async () => {
  const vault = await vaultWithLocalLook([...templatePlugins, ...extras])
  const from = await source()
  const result = await cli(vault, "update", "--from", from)
  assert.equal(result.code, 0, result.output)
  const enabled = await readJson(path.join(vault, ".obsidian/community-plugins.json"))
  for (const id of [...templatePlugins, ...extras]) assert.ok(enabled.includes(id), `${id} enabled after update: ${JSON.stringify(enabled)}`)
  assert.equal(new Set(enabled).size, enabled.length, `no duplicates: ${JSON.stringify(enabled)}`)
  for (const id of extras) {
    assert.equal(await readFile(path.join(vault, ".obsidian/plugins", id, "main.js"), "utf8"), `// ${id}\n`)
    assert.equal(await readFile(path.join(vault, ".obsidian/plugins", id, "data.json"), "utf8"), `{"local":"${id}"}\n`)
  }
  assert.equal(await readFile(path.join(vault, ".obsidian/themes/Local Theme/theme.css"), "utf8"), "body{}\n")
  assert.equal(await readFile(path.join(vault, ".obsidian/snippets/local.css"), "utf8"), ".local{}\n")
  assert.deepEqual(await readJson(path.join(vault, ".obsidian/appearance.json")), { cssTheme: "Local Theme", enabledCssSnippets: ["local"] })
  assert.equal((await cli(vault, "doctor")).code, 0, "doctor clean after update")
  await rm(vault, { recursive: true, force: true }); await rm(from, { recursive: true, force: true })
}, 150000)

test("update re-enables a template plugin the vault had dropped, keeping local ones", async () => {
  const dropped = templatePlugins[0]
  const vault = await vaultWithLocalLook([...templatePlugins.filter(id => id !== dropped), ...extras])
  const from = await source()
  const result = await cli(vault, "update", "--from", from)
  assert.equal(result.code, 0, result.output)
  const enabled = await readJson(path.join(vault, ".obsidian/community-plugins.json"))
  assert.ok(enabled.includes(dropped), `${dropped} re-enabled: ${JSON.stringify(enabled)}`)
  for (const id of extras) assert.ok(enabled.includes(id), `${id} kept: ${JSON.stringify(enabled)}`)
  await rm(vault, { recursive: true, force: true }); await rm(from, { recursive: true, force: true })
}, 150000)

await run("23-local-plugins")
