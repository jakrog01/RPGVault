import assert from "node:assert/strict"
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
if ((await exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: root })).stdout.trim() === "true") throw new Error("upgrade gate requires a complete clone")
const tags = (await exec("git", ["tag", "--merged", "HEAD", "--sort=v:refname"], { cwd: root })).stdout.trim().split("\n").filter(Boolean)
const latest = tags.at(-1)
const previous = tags.filter(tag => tag !== latest)
if (!previous.length) console.log("no earlier release tag exists; running self-upgrade")
for (const tag of previous.length ? previous : ["HEAD"]) {
  const source = await mkdtemp(path.join(os.tmpdir(), "rpgvault-upgrade-source-"))
  const target = await mkdtemp(path.join(os.tmpdir(), "rpgvault-upgrade-target-"))
  await exec("git", ["archive", tag, "|", "tar", "-x", "-C", source], { cwd: root, shell: "/bin/bash" })
  const oldCli = path.join(source, "_system/bin/rpgvault.mjs")
  await exec("node", [oldCli, "init"], { cwd: source })
  await mkdir(path.join(source, "Campaigns/User"), { recursive: true })
  await mkdir(path.join(source, "_local/templates"), { recursive: true })
  await mkdir(path.join(source, ".obsidian/plugins/table-tools"), { recursive: true })
  await writeFile(path.join(source, "Campaigns/User/Campaign.md"), "user content\n")
  await writeFile(path.join(source, "_local/templates/campaign.md"), "local override\n")
  await writeFile(path.join(source, "Active.md"), "---\nrun: [[Runs/User/Run]]\n---\n")
  await writeFile(path.join(source, ".obsidian/plugins/table-tools/data.json"), '{"apiKey":"fake-key-012345"}\n')
  await cp(source, target, { recursive: true })
  const result = await exec("node", [path.join(target, "_system/bin/rpgvault.mjs"), "update", "--from", root], { cwd: target })
  assert.equal(`${result.stdout}${result.stderr}`.includes("fake-key-012345"), false)
  assert.equal(await readFile(path.join(target, "Campaigns/User/Campaign.md"), "utf8"), "user content\n")
  assert.equal(await readFile(path.join(target, "_local/templates/campaign.md"), "utf8"), "local override\n")
  await exec("node", [path.join(target, "_system/bin/rpgvault.mjs"), "doctor"], { cwd: target })
  await rm(source, { recursive: true }); await rm(target, { recursive: true })
}
