// Prompt 24: an unreadable community-plugins.json is reported by doctor and repaired by update, never a crash.
import { execFile } from "node:child_process"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, run, test } from "./support.mjs"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const skipped = item => item.includes(`${path.sep}.git`) || item.includes(`${path.sep}node_modules`)
const templatePlugins = JSON.parse(await readFile(path.join(repository, "_system/obsidian/community-plugins.json"), "utf8"))
const invalid = { "an object": "{}\n", "not JSON": "not json\n", "a list with a non-string": `${JSON.stringify([...templatePlugins, "dataview", 7])}\n` }

function cli(vault, ...args) {
  return new Promise(resolve => execFile("node", [path.join(vault, "_system/bin/rpgvault.mjs"), ...args], { cwd: vault, timeout: 120000 },
    (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, output: `${stdout}${stderr}` })))
}

async function copy(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  await cp(repository, directory, { recursive: true, filter: item => !skipped(item) })
  return directory
}

for (const [label, content] of Object.entries(invalid)) {
  test(`doctor reports ${label} in community-plugins.json as a violation naming the file`, async () => {
    const vault = await copy("rpgvault-list24-")
    await writeFile(path.join(vault, ".obsidian/community-plugins.json"), content)
    const result = await cli(vault, "doctor")
    assert.notEqual(result.code, 0, result.output)
    assert.ok(result.output.includes("violation"), `reported as a doctor violation, not a crash: ${result.output}`)
    assert.ok(result.output.includes(".obsidian/community-plugins.json"), result.output)
    await rm(vault, { recursive: true, force: true })
  }, 60000)
}

test("update replaces an unreadable plugin list with the template list, keeping valid local ids, and finishes clean", async () => {
  for (const [label, content] of Object.entries(invalid)) {
    const vault = await copy("rpgvault-list24-")
    const from = await copy("rpgvault-list24-source-")
    await writeFile(path.join(vault, ".obsidian/community-plugins.json"), content)
    const result = await cli(vault, "update", "--from", from)
    assert.equal(result.code, 0, `${label}: ${result.output}`)
    assert.ok(result.output.includes("community-plugins.json"), `${label}: update says it repaired the list: ${result.output}`)
    const enabled = JSON.parse(await readFile(path.join(vault, ".obsidian/community-plugins.json"), "utf8"))
    assert.ok(Array.isArray(enabled) && enabled.every(id => typeof id === "string"), `${label}: ${JSON.stringify(enabled)}`)
    for (const id of templatePlugins) assert.ok(enabled.includes(id), `${label}: ${id} enabled: ${JSON.stringify(enabled)}`)
    if (label === "a list with a non-string") assert.ok(enabled.includes("dataview"), `valid local id kept: ${JSON.stringify(enabled)}`)
    assert.ok(result.output.includes("doctor: clean"), `${label}: update ran doctor to the end: ${result.output}`)
    await rm(vault, { recursive: true, force: true }); await rm(from, { recursive: true, force: true })
  }
}, 170000)

await run("24-plugin-list-invalid")
