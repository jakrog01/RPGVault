// Prompt 32: the shipped-layer report describes what actually happened. An entry the release left
// unchanged is not called replaced and points at no backup, and a preview reads as a plan.
import { readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { archiveEntries, cli, cloneVault, releaseBody, releaseHost, repository, zipArchive } from "../support/release.mjs"

const wholeRelease = await archiveEntries(repository)
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const lines = result => result.stdout.split("\n").map(line => line.trim()).filter(Boolean)
const entryLine = (result, name) => lines(result).find(line => new RegExp(`(^|\\s)${name}(\\s|$|:|\\()`).test(line)) ?? ""

function release(version, changes = {}) {
  const entries = []
  for (const entry of wholeRelease) {
    if (entry.name in changes) {
      if (changes[entry.name] === null) continue
      entries.push({ name: entry.name, data: changes[entry.name] })
      continue
    }
    entries.push(entry.name === "_system/VERSION" ? { name: entry.name, data: `${version}\n` } : entry)
  }
  for (const [name, data] of Object.entries(changes)) {
    if (data !== null && !wholeRelease.some(entry => entry.name === name)) entries.push({ name, data })
  }
  return zipArchive(entries)
}

async function serve(archive) {
  const served = await releaseHost({ asset: archive })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", served.downloadUrl) })
  return { answer, close: async () => { await served.close(); await answer.close() } }
}

test("an entry the release leaves unchanged is not reported as replaced", async () => {
  const vault = await cloneVault("rpgvault-report32-unchanged-")
  const host = await serve(release("1.1.0", { "docs/CLI.md": "# CLI reference\n\nupstream edit\n" }))
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: host.answer.base })
  assert.equal(result.code, 0, `the update succeeds; stdout: ${result.stdout}\nstderr: ${result.stderr}`)
  for (const name of ["Home.md", "README.md", "CHANGELOG.md"]) {
    const line = entryLine(result, name)
    assert.ok(line, `${name} has a report line: ${result.stdout}`)
    assert.equal(/^replaced /.test(line), false, `${name} was not replaced and must not say so: ${line}`)
    assert.equal(/backup/.test(line), false, `${name} points at no backup: ${line}`)
    assert.ok(/unchanged/i.test(line), `${name} says it is unchanged: ${line}`)
  }
  const docs = entryLine(result, "docs")
  assert.ok(/^replaced docs \(1 written, 0 removed\)/.test(docs), `docs reports the one file that changed: ${docs}`)
  assert.ok(/backup/.test(docs), `docs names the backup: ${docs}`)
  await host.close()
  await cleanup(vault)
}, 180000)

test("an update that changes nothing in the shipped layer says so and writes no shipped backup", async () => {
  const vault = await cloneVault("rpgvault-report32-none-")
  const host = await serve(release("1.1.0"))
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: host.answer.base })
  assert.equal(result.code, 0, `the update succeeds; stdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.equal(lines(result).some(line => /^replaced /.test(line)), false, `nothing is reported as replaced: ${result.stdout}`)
  assert.equal(lines(result).some(line => /file:/.test(line)), false, `no file is named: ${result.stdout}`)
  const saved = await readdir(path.join(vault, ".rpgvault/backups"))
  assert.equal(saved.length, 1, `the shipped layer backup is still written: ${saved.join(", ")}`)
  const backup = path.join(vault, ".rpgvault/backups", saved[0])
  assert.deepEqual((await readdir(backup)).sort(), ["_system"], `only _system is backed up when nothing else changed: ${(await readdir(backup)).join(", ")}`)
  assert.ok(result.stdout.includes("RPGVault doctor: clean (1.1.0)"), `the update still ends clean: ${result.stdout}`)
  await host.close()
  await cleanup(vault)
}, 180000)

test("a preview reads as a plan, in grammatical English", async () => {
  const vault = await cloneVault("rpgvault-report32-preview-")
  await writeFile(path.join(vault, "docs/MY-NOTES.md"), "# mine\n")
  const host = await serve(release("1.1.0", { "Home.md": "---\ntype: home\n---\n\n# RPGVault\n\nnew shipped home\n" }))
  const result = await cli(vault, ["update", "--latest", "--dry-run"], { RPGVAULT_RELEASE_API: host.answer.base })
  assert.equal(result.code, 0, `the preview succeeds; stderr: ${result.stderr}`)
  assert.equal(/would replaced|would removed|would kept/.test(result.stdout), false, `the preview is grammatical: ${result.stdout}`)
  assert.ok(/would replace Home\.md/.test(result.stdout), `the preview names the file it would replace: ${result.stdout}`)
  assert.ok(/would remove[^d].*MY-NOTES\.md/.test(result.stdout), `the preview names the file it would remove: ${result.stdout}`)
  assert.equal(await readFile(path.join(vault, "docs/MY-NOTES.md"), "utf8"), "# mine\n", "the preview removes nothing")
  await host.close()
  await cleanup(vault)
}, 180000)

test("a group the release does not provide is still reported as kept", async () => {
  const vault = await cloneVault("rpgvault-report32-kept-")
  const trimmed = {}
  for (const entry of wholeRelease) if (entry.name.startsWith(".github/")) trimmed[entry.name] = null
  const host = await serve(release("1.1.0", trimmed))
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: host.answer.base })
  assert.equal(result.code, 0, `the update succeeds; stderr: ${result.stderr}`)
  assert.ok(/kept \.github/.test(result.stdout), `the missing group is reported as kept: ${result.stdout}`)
  assert.ok(await readFile(path.join(vault, ".github/workflows/release.yml"), "utf8"), "the vault keeps its own copy")
  await host.close()
  await cleanup(vault)
}, 180000)

await run("acceptance 32 shipped layer report")
