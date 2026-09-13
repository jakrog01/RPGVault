import assert from "node:assert/strict"
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const clone = await mkdtemp(path.join(os.tmpdir(), "rpgvault-contract-"))
await cp(source, clone, { recursive: true, filter: item => !item.includes(`${path.sep}.git`) && !item.includes(`${path.sep}.rpgvault${path.sep}backups`) })
const cli = path.join(clone, "_system/bin/rpgvault.mjs")
const run = (...args) => exec("node", [cli, ...args], { cwd: clone })
const snapshot = async directory => new Map((await exec("find", [directory, "-type", "f", "-print0"])).stdout.split("\0").filter(Boolean).sort().map(async item => [path.relative(directory, item), await readFile(item)]))

await run("init")
await run("doctor")
const before = await snapshot(clone)
await run("demo", "install")
await run("demo", "remove")
assert.deepEqual([...before], [...await snapshot(clone)])
const references = path.join(clone, "Library/Mechanics/generic/Spells")
await mkdir(references, { recursive: true })
await Promise.all(Array.from({ length: 800 }, (_, index) => writeFile(path.join(references, `Reference-${index}.md`), `---\ntype: spell\n---\n\n# Reference ${index}\n`)))
const started = performance.now()
await run("doctor")
assert.ok(performance.now() - started < 5000)
const incoming = await mkdtemp(path.join(os.tmpdir(), "rpgvault-incoming-"))
await cp(clone, path.join(incoming, "RPGVault"), { recursive: true })
await writeFile(path.join(incoming, "RPGVault/_system/VERSION"), "1.0.1-test\n")
const target = await mkdtemp(path.join(os.tmpdir(), "rpgvault-upgrade-"))
await cp(clone, target, { recursive: true })
await mkdir(path.join(target, "_local/templates"), { recursive: true })
await writeFile(path.join(target, "_local/templates/campaign.md"), "local override\n")
await mkdir(path.join(target, "Campaigns/User"), { recursive: true })
await writeFile(path.join(target, "Campaigns/User/Campaign.md"), "user content\n")
await exec("node", [path.join(target, "_system/bin/rpgvault.mjs"), "update", "--from", path.join(incoming, "RPGVault")], { cwd: target })
assert.equal(await readFile(path.join(target, "_local/templates/campaign.md"), "utf8"), "local override\n")
assert.equal(await readFile(path.join(target, "Campaigns/User/Campaign.md"), "utf8"), "user content\n")
await exec("node", [path.join(target, "_system/bin/rpgvault.mjs"), "doctor"], { cwd: target })
await rm(clone, { recursive: true }); await rm(incoming, { recursive: true }); await rm(target, { recursive: true })
