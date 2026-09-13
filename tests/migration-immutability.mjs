import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tags = (await exec("git", ["tag", "--merged", "HEAD"], { cwd: root })).stdout.trim().split("\n").filter(Boolean)
for (const tag of tags) {
  const files = (await exec("git", ["ls-tree", "-r", "--name-only", tag, "_system/migrations"], { cwd: root })).stdout.trim().split("\n").filter(Boolean)
  for (const file of files) {
    const before = await exec("git", ["show", `${tag}:${file}`], { cwd: root })
    const after = await exec("git", ["show", `HEAD:${file}`], { cwd: root })
    assert.equal(after.stdout, before.stdout, `${file} changed after ${tag}`)
  }
}
console.log("migration immutability gate: clean")
