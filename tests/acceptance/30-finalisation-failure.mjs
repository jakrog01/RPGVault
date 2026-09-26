// Prompt 30: when finalisation fails after the shipped layer is already replaced, the update says
// what happened in the vault owner's terms — the violations themselves, the fact that `_system` was
// replaced, and where the backup is — instead of a raw child-process failure.
import { mkdir, readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { archiveEntries, cli, cloneVault, releaseBody, releaseHost, repository, zipArchive } from "../support/release.mjs"

const shipped = await archiveEntries(path.join(repository, "_system"), "_system/")
const release = version => zipArchive(shipped.map(entry => entry.name === "_system/VERSION" ? { name: entry.name, data: `${version}\n` } : entry))
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const installed = async vault => (await readFile(path.join(vault, "_system/VERSION"), "utf8")).trim()
const backups = async vault => readdir(path.join(vault, ".rpgvault/backups")).catch(() => [])
const both = result => `${result.stdout}\n${result.stderr}`

/** A vault an adopted install can look like: one folder the manifest does not declare. */
async function vaultWithViolation(prefix) {
  const vault = await cloneVault(prefix)
  await mkdir(path.join(vault, "Campaign Library"), { recursive: true })
  return vault
}

test("a failed finalisation reports the violations, the replacement and the backup", async () => {
  const vault = await vaultWithViolation("rpgvault-final30-latest-")
  const served = await releaseHost({ asset: release("1.1.0") })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", served.downloadUrl) })
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: answer.base })
  const output = both(result)
  assert.notEqual(result.code, 0, `the update reports failure; stdout: ${result.stdout}`)
  assert.ok(output.includes("undeclared root: Campaign Library"), `the doctor violation is forwarded: ${output}`)
  assert.ok(/violation\(s\)/.test(output), `the doctor summary line is forwarded: ${output}`)
  assert.equal(/Command failed/.test(output), false, `no raw child-process failure is shown: ${output}`)
  assert.equal(/node \/[^\s]*rpgvault\.mjs/.test(output), false, `no internal command line is shown: ${output}`)
  assert.ok(/replaced/i.test(output), `the output says the shipped layer was replaced: ${output}`)
  const saved = await backups(vault)
  assert.equal(saved.length, 1, `a backup was written: ${saved.join(", ")}`)
  assert.ok(output.includes(saved[0]), `the output names the backup directory: ${output}`)
  assert.equal(await installed(vault), "1.1.0", "the shipped layer really was replaced")
  await served.close()
  await answer.close()
  await cleanup(vault)
}, 120000)

test("the offline path reports a failed finalisation the same way", async () => {
  const vault = await vaultWithViolation("rpgvault-final30-from-")
  const result = await cli(vault, ["update", "--from", repository])
  const output = both(result)
  assert.notEqual(result.code, 0, `the update reports failure; stdout: ${result.stdout}`)
  assert.ok(output.includes("undeclared root: Campaign Library"), `the doctor violation is forwarded: ${output}`)
  assert.equal(/Command failed/.test(output), false, `no raw child-process failure is shown: ${output}`)
  assert.equal(/node \/[^\s]*rpgvault\.mjs/.test(output), false, `no internal command line is shown: ${output}`)
  assert.ok(/replaced/i.test(output), `the output says the shipped layer was replaced: ${output}`)
  assert.equal((await backups(vault)).length, 1, "a backup was written")
  await cleanup(vault)
}, 120000)

test("a clean vault still ends with the clean doctor line and a zero exit", async () => {
  const vault = await cloneVault("rpgvault-final30-clean-")
  const served = await releaseHost({ asset: release("1.1.0") })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", served.downloadUrl) })
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: answer.base })
  assert.equal(result.code, 0, `the update succeeds; stderr: ${result.stderr}`)
  assert.ok(result.stdout.includes("RPGVault doctor: clean (1.1.0)"), `the clean line is forwarded: ${result.stdout}`)
  assert.equal(/replaced/i.test(result.stdout) && /violation/.test(result.stdout), false, `a clean update reports no failure: ${result.stdout}`)
  assert.equal(await installed(vault), "1.1.0", "the new version is installed")
  await served.close()
  await answer.close()
  await cleanup(vault)
}, 120000)

await run("acceptance 30 finalisation failure")
