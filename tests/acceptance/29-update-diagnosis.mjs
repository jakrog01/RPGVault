// Prompt 29: an update that gives up says why in the reader's terms — a deadline reached while the
// answer was still arriving is a timeout, not a malformed answer, and a release source that cannot
// work is a configuration fault, not an unreachable host.
import { createServer } from "node:http"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { archiveEntries, cli, cloneVault, releaseBody, releaseHost, repository, snapshot, zipArchive } from "../support/release.mjs"

const shipped = await archiveEntries(path.join(repository, "_system"), "_system/")
const archive = zipArchive(shipped.map(entry => entry.name === "_system/VERSION" ? { name: entry.name, data: "1.1.0\n" } : entry))
const cleanup = async (...items) => { for (const item of items) await rm(item, { recursive: true, force: true }) }
const state = async vault => JSON.parse(await readFile(path.join(vault, ".rpgvault/state.json"), "utf8"))
const localRelease = (vault, value) => writeFile(path.join(vault, "_local/release.json"), JSON.stringify(value))
const short = { RPGVAULT_RELEASE_TIMEOUT: "2000" }

/** A host that sends headers and a first chunk, then never finishes the body. */
async function stallingHost(handler) {
  const sockets = []
  const server = createServer(handler)
  server.on("connection", socket => sockets.push(socket))
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, downloadUrl: `${base}/download/RPGVault.zip`, close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve) }) }
}

test("a lookup cut off while the answer arrives is reported as a timeout", async () => {
  const vault = await cloneVault("rpgvault-diagnosis29-checkstall-")
  const host = await stallingHost((request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.write('{"tag_')
  })
  const started = Date.now()
  const result = await cli(vault, ["update", "--check"], { ...short, RPGVAULT_RELEASE_API: host.base }, 30000)
  assert.notEqual(result.code, 0, `the check gives up; stdout: ${result.stdout}`)
  assert.ok(/timed out/i.test(result.stderr), `the failure names the timeout: ${result.stderr}`)
  assert.equal(/unreadable JSON/i.test(result.stderr), false, `a stalled answer is not called malformed: ${result.stderr}`)
  assert.ok(Date.now() - started < 20000, "the check gives up quickly")
  assert.equal((await state(vault)).updateCheck, undefined, "nothing is recorded")
  await host.close()
  await cleanup(vault)
}, 40000)

test("a download cut off while the archive arrives is reported as a timeout", async () => {
  const vault = await cloneVault("rpgvault-diagnosis29-downloadstall-")
  const before = await snapshot(vault)
  const host = await stallingHost((request, response) => {
    response.writeHead(200, { "content-type": "application/zip", "content-length": String(archive.length) })
    response.write(archive.subarray(0, 1024))
  })
  const answer = await releaseHost({ release: releaseBody("v1.1.0", host.downloadUrl) })
  const started = Date.now()
  const result = await cli(vault, ["update", "--latest"], { ...short, RPGVAULT_RELEASE_API: answer.base }, 30000)
  assert.notEqual(result.code, 0, `the download gives up; stdout: ${result.stdout}`)
  assert.ok(/timed out/i.test(result.stderr), `the failure names the timeout: ${result.stderr}`)
  assert.equal(/could not read|could not download/i.test(result.stderr), false, `a stalled body is not called unreadable: ${result.stderr}`)
  assert.ok(Date.now() - started < 20000, "the download gives up quickly")
  assert.equal(await snapshot(vault), before, "the vault is unchanged")
  await host.close()
  await answer.close()
  await cleanup(vault)
}, 40000)

test("an API base that cannot be a release host is a configuration fault", async () => {
  for (const api of ["not a url", "ftp://example.invalid", "/repos"]) {
    const vault = await cloneVault("rpgvault-diagnosis29-api-")
    await localRelease(vault, { api })
    const before = await snapshot(vault)
    const result = await cli(vault, ["update", "--check"], { ...short, RPGVAULT_RELEASE_API: "" }, 30000)
    assert.notEqual(result.code, 0, `${api} is refused; stdout: ${result.stdout}`)
    assert.ok(/release source/i.test(result.stderr), `${api} names the release source: ${result.stderr}`)
    assert.ok(result.stderr.includes(api), `${api} is quoted in the failure: ${result.stderr}`)
    assert.equal(/could not reach|host returned/i.test(result.stderr), false, `${api} does not blame the host: ${result.stderr}`)
    assert.equal(await snapshot(vault), before, `${api} records nothing`)
    await cleanup(vault)
  }
}, 60000)

test("a repository that is not owner and name is a configuration fault, and nothing is asked of the host", async () => {
  for (const repo of ["Fork", "someone/Fork/extra", "someone /Fork"]) {
    const vault = await cloneVault("rpgvault-diagnosis29-repo-")
    await localRelease(vault, { repo })
    const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
    const result = await cli(vault, ["update", "--check"], { ...short, RPGVAULT_RELEASE_API: host.base }, 30000)
    assert.notEqual(result.code, 0, `${repo} is refused; stdout: ${result.stdout}`)
    assert.ok(/release source/i.test(result.stderr), `${repo} names the release source: ${result.stderr}`)
    assert.ok(result.stderr.includes(repo), `${repo} is quoted in the failure: ${result.stderr}`)
    assert.deepEqual(host.requests, [], `${repo} is refused before any request: ${host.requests.join(", ")}`)
    await host.close()
    await cleanup(vault)
  }
}, 60000)

test("a usable release source still works from the shipped manifest and from a fork", async () => {
  const vault = await cloneVault("rpgvault-diagnosis29-guard-")
  const host = await releaseHost({ release: releaseBody("v1.1.0", "http://127.0.0.1:1/download/RPGVault.zip") })
  const shippedResult = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
  assert.equal(shippedResult.code, 0, `the shipped source works; stderr: ${shippedResult.stderr}`)
  assert.ok(shippedResult.stdout.includes("update available: 1.1.0 (installed 1.0.0)"), `it reports the release: ${shippedResult.stdout}`)
  await localRelease(vault, { repo: "someone/Fork", api: host.base })
  const forkResult = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: "" })
  assert.equal(forkResult.code, 0, `a fork with an explicit api works; stderr: ${forkResult.stderr}`)
  assert.ok(host.requests.some(url => url.includes("/repos/someone/Fork/releases/latest")), `the fork is queried: ${host.requests.join(", ")}`)
  assert.equal((await state(vault)).updateCheck.repo, "someone/Fork", "the fork is recorded")
  await host.close()
  await cleanup(vault)
})

await run("acceptance 29 update diagnosis")
