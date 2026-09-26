// Prompt 28: the network update gives up on a silent host, refuses a tag that is not a version
// instead of quietly calling the vault current, names every archive and configuration failure,
// and leaves nothing behind after a preview.
import { readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { archiveEntries, cli, cloneVault, hangingHost, releaseBody, releaseHost, repository, snapshot, zipArchive } from "../support/release.mjs"

const shipped = await archiveEntries(path.join(repository, "_system"), "_system/")
const release = (version, entries = shipped) => zipArchive(entries.map(entry => entry.name === "_system/VERSION" ? { name: entry.name, data: `${version}\n` } : entry))
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const state = async vault => JSON.parse(await readFile(path.join(vault, ".rpgvault/state.json"), "utf8"))
const cache = async vault => readdir(path.join(vault, ".rpgvault/cache")).catch(() => [])
const short = { RPGVAULT_RELEASE_TIMEOUT: "1000" }

test("a host that accepts the connection and never answers makes the check give up", async () => {
  const vault = await cloneVault("rpgvault-robust28-hang-")
  const host = await hangingHost()
  const started = Date.now()
  const result = await cli(vault, ["update", "--check"], { ...short, RPGVAULT_RELEASE_API: host.base }, 30000)
  const elapsed = Date.now() - started
  assert.notEqual(result.code, 0, `the check gives up; stdout: ${result.stdout}`)
  assert.ok(/timed out|timeout/i.test(result.stderr), `the failure names the timeout: ${result.stderr}`)
  assert.ok(elapsed < 20000, `the check gives up quickly, took ${elapsed} ms`)
  assert.equal((await state(vault)).updateCheck, undefined, "a timed-out check records nothing")
  await host.close()
  await cleanup(vault)
}, 40000)

test("a download that never answers makes the install give up without touching the vault", async () => {
  const vault = await cloneVault("rpgvault-robust28-hangdownload-")
  const before = await snapshot(vault)
  const host = await hangingHost()
  const answer = await releaseHost({ release: releaseBody("v1.1.0", host.downloadUrl) })
  const started = Date.now()
  const result = await cli(vault, ["update", "--latest"], { ...short, RPGVAULT_RELEASE_API: answer.base }, 30000)
  const elapsed = Date.now() - started
  assert.notEqual(result.code, 0, `the download gives up; stdout: ${result.stdout}`)
  assert.ok(/timed out|timeout/i.test(result.stderr), `the failure names the timeout: ${result.stderr}`)
  assert.ok(elapsed < 20000, `the download gives up quickly, took ${elapsed} ms`)
  assert.equal(await snapshot(vault), before, "the vault is unchanged")
  await host.close()
  await answer.close()
  await cleanup(vault)
}, 40000)

test("a tag that is not a version is refused instead of being read as up to date", async () => {
  for (const tag of ["release-2", "latest", "v1.2.x", "v1.1.0-rc.1"]) {
    const vault = await cloneVault("rpgvault-robust28-tag-")
    const before = await snapshot(vault)
    const host = await releaseHost({ release: releaseBody(tag, "http://127.0.0.1:1/download/RPGVault.zip") })
    const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
    assert.notEqual(result.code, 0, `${tag} is refused; stdout: ${result.stdout}`)
    assert.ok(result.stderr.includes(tag.replace(/^v/, "")), `the failure quotes the tag: ${result.stderr}`)
    assert.equal(result.stdout.includes("up to date"), false, `${tag} is not reported as up to date: ${result.stdout}`)
    assert.equal(await snapshot(vault), before, `${tag} records nothing`)
    await host.close()
    await cleanup(vault)
  }
})

test("a plain numeric tag of any depth is still accepted", async () => {
  for (const [tag, expected] of [["v2026.01", "2026.01"], ["1.2", "1.2"], ["v1.0.0.1", "1.0.0.1"]]) {
    const vault = await cloneVault("rpgvault-robust28-numeric-")
    const host = await releaseHost({ release: releaseBody(tag, "http://127.0.0.1:1/download/RPGVault.zip") })
    const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
    assert.equal(result.code, 0, `${tag} is accepted; stderr: ${result.stderr}`)
    assert.ok(result.stdout.includes(`update available: ${expected} (installed 1.0.0)`), `${tag} is offered: ${result.stdout}`)
    assert.equal((await state(vault)).updateCheck.latestVersion, expected, `${tag} is recorded as ${expected}`)
    await host.close()
    await cleanup(vault)
  }
})

test("an archive whose shipped layer has no VERSION is refused by name, without a temporary path", async () => {
  const vault = await cloneVault("rpgvault-robust28-noversion-")
  const before = await snapshot(vault)
  const served = await releaseHost({ asset: zipArchive(shipped.filter(entry => entry.name !== "_system/VERSION")) })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", served.downloadUrl) })
  const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: answer.base })
  assert.notEqual(result.code, 0, `the archive is refused; stdout: ${result.stdout}`)
  assert.ok(result.stderr.includes("_system/VERSION"), `the failure names the missing file: ${result.stderr}`)
  assert.equal(/ENOENT|\/tmp\//.test(result.stderr), false, `the failure is a named refusal, not a raw file error: ${result.stderr}`)
  assert.equal(await snapshot(vault), before, "the vault is unchanged")
  await served.close()
  await answer.close()
  await cleanup(vault)
}, 60000)

test("`--check` refuses `--from` the way `--latest` already does", async () => {
  const vault = await cloneVault("rpgvault-robust28-flags-")
  const before = await snapshot(vault)
  const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  const result = await cli(vault, ["update", "--check", "--from", repository], { RPGVAULT_RELEASE_API: host.base })
  assert.notEqual(result.code, 0, `the two are refused together; stdout: ${result.stdout}`)
  assert.ok(result.stderr.includes("--from") && result.stderr.includes("--check"), `the failure names both flags: ${result.stderr}`)
  assert.equal(await snapshot(vault), before, "the refused run records nothing")
  await host.close()
  await cleanup(vault)
})

test("a vault with no release source says so instead of blaming the host", async () => {
  const vault = await cloneVault("rpgvault-robust28-unconfigured-")
  const manifestPath = path.join(vault, "_system/manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  delete manifest.release
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  for (const args of [["update", "--check"], ["update", "--latest"]]) {
    const result = await cli(vault, args, { RPGVAULT_RELEASE_API: "" })
    assert.notEqual(result.code, 0, `${args.join(" ")} fails; stdout: ${result.stdout}`)
    assert.ok(/not configured|no release source/i.test(result.stderr), `${args.join(" ")} names the missing configuration: ${result.stderr}`)
    assert.equal(/could not reach/i.test(result.stderr), false, `${args.join(" ")} does not blame the host: ${result.stderr}`)
  }
  await cleanup(vault)
})

test("a preview keeps no downloaded archive", async () => {
  const vault = await cloneVault("rpgvault-robust28-dry-")
  const served = await releaseHost({ asset: release("1.1.0") })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", served.downloadUrl) })
  const result = await cli(vault, ["update", "--latest", "--dry-run"], { RPGVAULT_RELEASE_API: answer.base })
  assert.equal(result.code, 0, `the preview succeeds; stderr: ${result.stderr}`)
  assert.ok(result.stdout.includes("would replace _system from "), `it still previews: ${result.stdout}`)
  assert.deepEqual(await cache(vault), [], "the preview leaves no archive in the cache")
  assert.equal((await readFile(path.join(vault, "_system/VERSION"), "utf8")).trim(), "1.0.0", "the preview replaces nothing")
  await served.close()
  await answer.close()
  await cleanup(vault)
}, 60000)

await run("acceptance 28 update robustness")
