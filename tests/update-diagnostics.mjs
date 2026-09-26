// Gate: the network update refuses a vault or a release payload it cannot work with by name,
// never by leaking a raw file error or a JavaScript type error at the vault owner.
import assert from "node:assert/strict"
import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { cli, cloneVault, releaseHost, repository } from "./support/release.mjs"

// The malformed releases must always look newer than the shipped version, or the check short
// circuits on "up to date" and never reaches the payload these cases are about.
const installed = (await readFile(path.join(repository, "_system/VERSION"), "utf8")).trim()
const newerTag = `v${installed.replace(/(\d+)$/, (digits) => String(Number(digits) + 1))}`

const cleanup = item => rm(item, { recursive: true, force: true })
const failures = []
const check = (name, condition, detail) => { if (!condition) failures.push(`${name}: ${detail}`) }

{
  const vault = await cloneVault("rpgvault-diagnostics-nostate-")
  await rm(path.join(vault, ".rpgvault"), { recursive: true, force: true })
  const host = await releaseHost({ release: { tag_name: newerTag, assets: [] } })
  const result = await cli(vault, ["update", "--check"], { RPGVAULT_RELEASE_API: host.base })
  check("a vault without .rpgvault still reports the release", result.code === 0, `exit ${result.code}, stderr: ${result.stderr}`)
  check("a vault without .rpgvault leaks no file error", !/ENOENT/.test(result.stderr), result.stderr)
  check("a vault without .rpgvault leaks no absolute path", !new RegExp(vault).test(result.stderr), result.stderr)
  await host.close()
  await cleanup(vault)
}

{
  for (const [name, assets] of [["an object", {}], ["a string", "RPGVault.zip"], ["a list of non-objects", [null, 7]]]) {
    const vault = await cloneVault("rpgvault-diagnostics-assets-")
    const host = await releaseHost({ release: { tag_name: newerTag, assets } })
    const result = await cli(vault, ["update", "--latest"], { RPGVAULT_RELEASE_API: host.base })
    check(`assets as ${name} is refused`, result.code !== 0, `exit ${result.code}, stdout: ${result.stdout}`)
    check(`assets as ${name} is refused by name`, /release/.test(result.stderr) && !/is not a function|undefined|Cannot read/.test(result.stderr), result.stderr)
    await host.close()
    await cleanup(vault)
  }
}

if (failures.length) {
  console.error(`update diagnostics gate found ${failures.length} problem(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
assert.equal(failures.length, 0)
console.log("update diagnostics gate: clean")
