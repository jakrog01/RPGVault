// Prompt 35: the repository is releasable. Every place that names the version agrees, the changelog
// describes the release, the archive the workflow builds carries the shipped layer and no private
// file, and a vault on the previous release upgrades to it over the network and ends clean.
import { execFile } from "node:child_process"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { assert, run, test } from "./support.mjs"
import { archiveEntries, cli, releaseBody, releaseHost, repository, zipArchive } from "../support/release.mjs"

const exec = promisify(execFile)
const read = file => readFile(path.join(repository, file), "utf8")
const json = async file => JSON.parse(await read(file))
const version = (await read("_system/VERSION")).trim()
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const numeric = value => value.split(".").map(Number)
const newer = (left, right) => {
  const [a, b] = [numeric(left), numeric(right)]
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference > 0
  }
  return false
}

/** The files a fresh checkout of HEAD holds — exactly what the release workflow packages. */
const tracked = (await exec("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: repository })).stdout.split("\n").filter(Boolean)

test("the shipped version is a version, and agrees with the release tags", async () => {
  assert.match(version, /^\d+(\.\d+)*$/, `_system/VERSION is a version: ${version}`)
  const tags = (await exec("git", ["tag", "--sort=v:refname"], { cwd: repository })).stdout.split("\n").filter(Boolean)
  assert.ok(tags.length, "the repository has at least one release tag")
  // On a tagged commit — which is what the release workflow builds — the two must be the same
  // version. Elsewhere the shipped version may only ever run ahead of the newest tag.
  const here = (await exec("git", ["tag", "--points-at", "HEAD"], { cwd: repository })).stdout.split("\n").filter(Boolean)
  for (const tag of here) assert.equal(version, tag.replace(/^v/, ""), `the tag ${tag} on this commit names the shipped version`)
  const newest = tags.at(-1).replace(/^v/, "")
  assert.equal(newer(newest, version), false, `_system/VERSION ${version} is not older than the newest tag ${newest}`)
})

test("every file that names the version agrees with the shipped one", async () => {
  assert.equal((await json("package.json")).version, version, "package.json")
  assert.equal((await json("_system/plugin/package.json")).version, version, "_system/plugin/package.json")
  assert.equal((await json("_system/obsidian/plugins/table-tools/manifest.json")).version, version, "the shipped plugin manifest")
  assert.equal((await json(".obsidian/plugins/table-tools/manifest.json")).version, version, "the installed plugin manifest")
  assert.equal((await json(".rpgvault/state.json")).installedVersion, version, ".rpgvault/state.json")
})

test("the changelog describes this release and leaves nothing unreleased", async () => {
  const changelog = await read("CHANGELOG.md")
  const heading = `## ${version}`
  assert.ok(changelog.includes(heading), `CHANGELOG.md has a ${heading} section`)
  const section = changelog.slice(changelog.indexOf(heading) + heading.length).split(/\n## /)[0]
  const entries = section.split("\n").filter(line => line.trim().startsWith("-"))
  assert.ok(entries.length >= 3, `the section lists what changed, found ${entries.length} entries`)
  const unreleased = changelog.match(/## Unreleased([\s\S]*?)(\n## |$)/)
  assert.equal(unreleased?.[1].split("\n").filter(line => line.trim().startsWith("-")).length ?? 0, 0, "nothing is left under Unreleased")
  assert.ok(section.includes("update --latest"), "the section names the network update this release adds")
})

test("the workflow packages the asset the manifest asks the updater to download", async () => {
  const workflow = await read(".github/workflows/release.yml")
  const asset = (await json("_system/manifest.json")).release.asset
  assert.ok(workflow.includes(asset), `the workflow builds ${asset}`)
  assert.ok(workflow.includes("npm test"), "the workflow runs the test suite before packaging")
  assert.ok(/tags:\s*\['v\*'\]/.test(workflow), "the workflow triggers on a v tag")
})

test("the packaged archive carries the shipped layer and no private file", async () => {
  for (const file of ["_system/VERSION", "_system/bin/rpgvault.mjs", "_system/plugin/main.js", "docs/README.md", "Home.md", "README.md", "CHANGELOG.md", ".github/workflows/release.yml", ".obsidian/plugins/table-tools/main.js"]) {
    assert.ok(tracked.includes(file), `the archive carries ${file}`)
  }
  for (const file of tracked) {
    assert.equal(file.startsWith(".rpgvault/backups/"), false, `no backup is packaged: ${file}`)
    assert.equal(file.includes("node_modules/"), false, `no dependency tree is packaged: ${file}`)
    assert.notEqual(file, ".obsidian/plugins/table-tools/data.json", "no plugin settings are packaged")
    assert.notEqual(file, ".obsidian/workspace.json", "no workspace layout is packaged")
  }
})

/** A vault checked out at the newest release tag, initialised, with one note of the owner's own. */
async function previousRelease(prefix) {
  const tags = (await exec("git", ["tag", "--sort=v:refname"], { cwd: repository })).stdout.split("\n").filter(Boolean)
  const vault = await mkdtemp(path.join(os.tmpdir(), prefix))
  await exec("git", ["archive", tags.at(-1), "|", "tar", "-x", "-C", vault], { cwd: repository, shell: "/bin/bash" })
  await exec("node", [path.join(vault, "_system/bin/rpgvault.mjs"), "init"], { cwd: vault })
  await writeFile(path.join(vault, "Campaigns/Mine.md"), "my campaign\n")
  return { vault, previous: tags.at(-1) }
}

test("a vault on the previous release installs this one from the packaged archive and ends clean", async () => {
  const { vault, previous } = await previousRelease("rpgvault-release35-offline-")
  const archive = path.join(await mkdtemp(path.join(os.tmpdir(), "rpgvault-release35-asset-")), "RPGVault.zip")
  await writeFile(archive, zipArchive(await archiveEntries(repository)))
  const result = await cli(vault, ["update", "--from", archive])
  assert.equal(result.code, 0, `the upgrade from ${previous} succeeds; stdout: ${result.stdout}\nstderr: ${result.stderr}`)
  // The 1.0.0 CLI discards what finalisation printed, so the vault itself is the evidence here.
  assert.equal((await readFile(path.join(vault, "_system/VERSION"), "utf8")).trim(), version, "the shipped layer is the new version")
  assert.equal(JSON.parse(await readFile(path.join(vault, ".rpgvault/state.json"), "utf8")).installedVersion, version, "the state records the new version")
  const doctor = await cli(vault, ["doctor"])
  assert.equal(doctor.code, 0, `the upgraded vault is clean; stdout: ${doctor.stdout}\nstderr: ${doctor.stderr}`)
  assert.ok(doctor.stdout.includes(`RPGVault doctor: clean (${version})`), `doctor confirms ${version}: ${doctor.stdout}`)
  assert.equal(await readFile(path.join(vault, "Campaigns/Mine.md"), "utf8"), "my campaign\n", "the owner's material survives")
  assert.equal((await readdir(path.join(vault, ".rpgvault/backups"))).length, 1, "a backup was written")
  await cleanup(vault, path.dirname(archive))
}, 300000)

test("a vault on this release takes the next one over the network, with the wider shipped layer", async () => {
  const { vault } = await previousRelease("rpgvault-release35-network-")
  const entries = await archiveEntries(repository)
  const archive = path.join(await mkdtemp(path.join(os.tmpdir(), "rpgvault-release35-bootstrap-")), "RPGVault.zip")
  await writeFile(archive, zipArchive(entries))
  assert.equal((await cli(vault, ["update", "--from", archive])).code, 0, "the vault is first brought onto this release")

  const next = `${version}.1`
  const served = await releaseHost({ asset: zipArchive(entries.map(entry => {
    if (entry.name === "_system/VERSION") return { name: entry.name, data: `${next}\n` }
    if (entry.name === "docs/CLI.md") return { name: entry.name, data: "# CLI reference\n\nthe next release\n" }
    return entry
  })) })
  const answer = await releaseHost({ release: releaseBody(`v${next}`, served.downloadUrl) })
  const check = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: answer.base })
  assert.equal(check.code, 0, `the check works on this release; stderr: ${check.stderr}`)
  assert.ok(check.stdout.includes(`update available: ${next} (installed ${version})`), `it sees the next release: ${check.stdout}`)
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: answer.base })
  assert.equal(result.code, 0, `the network upgrade succeeds; stdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.ok(result.stdout.includes(`RPGVault doctor: clean (${next})`), `it ends clean on ${next}: ${result.stdout}`)
  assert.ok((await readFile(path.join(vault, "docs/CLI.md"), "utf8")).includes("the next release"), "the wider shipped layer arrives from this release onward")
  assert.equal(await readFile(path.join(vault, "Campaigns/Mine.md"), "utf8"), "my campaign\n", "the owner's material survives")
  await served.close()
  await answer.close()
  await cleanup(vault, path.dirname(archive))
}, 600000)

await run("acceptance 35 release")
