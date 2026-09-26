// Prompt 27: `update --check` asks the configured release host whether a newer release exists,
// reports it, records the answer in state, and writes nothing else — including when it fails.
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { cli, cloneVault, releaseBody, releaseHost, snapshot } from "../support/release.mjs"

const state = async vault => JSON.parse(await readFile(path.join(vault, ".rpgvault/state.json"), "utf8"))
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const backups = async vault => readdir(path.join(vault, ".rpgvault/backups")).catch(() => [])
const missing = async item => stat(item).then(() => false, () => true)

test("a newer release is reported with both versions and the command that installs it", async () => {
  const vault = await cloneVault("rpgvault-check27-newer-")
  const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
  assert.equal(result.code, 0, `--check succeeds; stderr: ${result.stderr}`)
  assert.ok(result.stdout.includes("update available: 1.1.0 (installed 1.0.0)"), `stdout names both versions: ${result.stdout}`)
  assert.ok(result.stdout.includes("update --latest"), `stdout names the install command: ${result.stdout}`)
  assert.ok(host.requests.some(url => url.includes("/repos/jakrog01/RPGVault/releases/latest")), `the manifest repo is queried: ${host.requests.join(", ")}`)
  assert.equal(host.requests.some(url => url.includes("/download/")), false, "--check downloads nothing")
  await host.close()
  await cleanup(vault)
})

test("the check records the answer in state and leaves the other state fields alone", async () => {
  const vault = await cloneVault("rpgvault-check27-state-")
  const before = await state(vault)
  const host = await releaseHost({ release: releaseBody("v1.2.3", "http://127.0.0.1:1/download/RPGVault.zip") })
  const started = Date.now()
  assert.equal((await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })).code, 0, "--check succeeds")
  const after = await state(vault)
  assert.equal(after.updateCheck.latestVersion, "1.2.3", "state records the latest version without the tag prefix")
  assert.equal(after.updateCheck.repo, "jakrog01/RPGVault", "state records the repository it asked")
  const checkedAt = Date.parse(after.updateCheck.checkedAt)
  assert.ok(Number.isFinite(checkedAt), `checkedAt is a date: ${after.updateCheck.checkedAt}`)
  assert.ok(checkedAt >= started - 60000 && checkedAt <= Date.now() + 60000, `checkedAt is the time of the check: ${after.updateCheck.checkedAt}`)
  assert.equal(after.installedVersion, before.installedVersion, "installedVersion is untouched")
  assert.equal(after.installId, before.installId, "installId is untouched")
  assert.deepEqual(after.appliedMigrations, before.appliedMigrations, "appliedMigrations is untouched")
  await host.close()
  await cleanup(vault)
})

test("an up-to-date vault says so, and an older release is not offered as an update", async () => {
  for (const tag of ["v1.0.0", "v0.9.9"]) {
    const vault = await cloneVault("rpgvault-check27-current-")
    const host = await releaseHost({ release: releaseBody(tag, "http://127.0.0.1:1/download/RPGVault.zip") })
    const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
    assert.equal(result.code, 0, `--check succeeds for ${tag}; stderr: ${result.stderr}`)
    assert.ok(result.stdout.includes("up to date (1.0.0)"), `${tag} reports up to date: ${result.stdout}`)
    assert.equal(result.stdout.includes("update available"), false, `${tag} offers no update: ${result.stdout}`)
    await host.close()
    await cleanup(vault)
  }
})

test("a newer minor with a two-digit segment is compared as a version, not as text", async () => {
  const vault = await cloneVault("rpgvault-check27-semver-")
  await writeFile(path.join(vault, "_system/VERSION"), "1.9.0\n")
  const host = await releaseHost({ release: releaseBody("v1.10.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
  assert.equal(result.code, 0, `--check succeeds; stderr: ${result.stderr}`)
  assert.ok(result.stdout.includes("update available: 1.10.0 (installed 1.9.0)"), `1.10.0 beats 1.9.0: ${result.stdout}`)
  await host.close()
  await cleanup(vault)
})

test("`_local/release.json` redirects the check to a fork", async () => {
  const vault = await cloneVault("rpgvault-check27-fork-")
  await writeFile(path.join(vault, "_local/release.json"), JSON.stringify({ repo: "someone/Fork" }))
  const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
  assert.equal(result.code, 0, `--check succeeds; stderr: ${result.stderr}`)
  assert.ok(host.requests.some(url => url.includes("/repos/someone/Fork/releases/latest")), `the fork is queried: ${host.requests.join(", ")}`)
  assert.equal(host.requests.some(url => url.includes("jakrog01")), false, `the shipped repo is not queried: ${host.requests.join(", ")}`)
  assert.equal((await state(vault)).updateCheck.repo, "someone/Fork", "state records the fork")
  await host.close()
  await cleanup(vault)
})

test("an unreachable host fails with a named error and changes nothing", async () => {
  const vault = await cloneVault("rpgvault-check27-offline-")
  const before = await snapshot(vault)
  const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: "http://127.0.0.1:1" })
  assert.notEqual(result.code, 0, `an unreachable host fails; stdout: ${result.stdout}`)
  assert.ok(result.stderr.includes("rpgvault: "), `the failure uses the CLI prefix: ${result.stderr}`)
  assert.ok(/check/i.test(result.stderr), `the failure names the check: ${result.stderr}`)
  assert.equal(result.stderr.includes("--from"), false, `the failure is about the check, not usage: ${result.stderr}`)
  assert.equal(await snapshot(vault), before, "a failed check writes nothing")
  assert.deepEqual(await backups(vault), [], "a failed check creates no backup")
  await cleanup(vault)
})

test("a missing release, an error status and an unreadable body each fail without writing", async () => {
  const cases = [
    { name: "no release", options: { release: null } },
    { name: "rate limit", options: { status: 403, body: JSON.stringify({ message: "API rate limit exceeded" }) } },
    { name: "unreadable body", options: { status: 200, body: "<html>not json</html>" } },
    { name: "no tag", options: { status: 200, body: JSON.stringify({ assets: [] }) } },
  ]
  for (const item of cases) {
    const vault = await cloneVault("rpgvault-check27-broken-")
    const before = await snapshot(vault)
    const host = await releaseHost(item.options)
    const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
    assert.notEqual(result.code, 0, `${item.name} fails; stdout: ${result.stdout}`)
    assert.ok(result.stderr.includes("rpgvault: "), `${item.name} uses the CLI prefix: ${result.stderr}`)
    assert.equal(result.stderr.includes("--from"), false, `${item.name} fails on the check, not on usage: ${result.stderr}`)
    assert.ok(/check/i.test(result.stderr), `${item.name} names the check: ${result.stderr}`)
    assert.equal(await snapshot(vault), before, `${item.name} writes nothing`)
    await host.close()
    await cleanup(vault)
  }
})

test("the check never replaces the shipped layer and keeps the offline path untouched", async () => {
  const vault = await cloneVault("rpgvault-check27-guards-")
  const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  assert.equal((await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })).code, 0, "--check succeeds")
  assert.equal((await readFile(path.join(vault, "_system/VERSION"), "utf8")).trim(), "1.0.0", "--check leaves the installed version in place")
  assert.deepEqual(await backups(vault), [], "--check creates no backup")
  assert.ok(await missing(path.join(vault, ".rpgvault/cache")), "--check downloads nothing into the cache")
  const bare = await cli(vault, ["update"], { RPGVAULT_RELEASE_API: host.base })
  assert.notEqual(bare.code, 0, `bare update still fails; stdout: ${bare.stdout}`)
  assert.ok(bare.stderr.includes("--from"), `bare update still names --from: ${bare.stderr}`)
  await host.close()
  await cleanup(vault)
})

await run("acceptance 27 update check")
