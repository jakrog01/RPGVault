import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hashes = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-vocabulary.sha256"), "utf8")).trim().split("\n"))
const excluded = item => item === "package-lock.json" || item.includes("obsidian/plugins/templater-obsidian/") || item.includes("obsidian/plugins/calendarium/")
const tokenise = value => value.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(token => token.toLowerCase())
const digest = value => createHash("sha256").update(value).digest("hex")
const inspect = (name, value) => {
  if (/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b]/.test(value)) throw new Error(`${name}: non-English character`)
  if (tokenise(value).some(token => hashes.has(digest(token)))) throw new Error(`${name}: forbidden vocabulary`)
}
const tracked = (await exec("git", ["ls-files"], { cwd: root })).stdout.trim().split("\n").filter(item => item && !excluded(item))
for (const file of tracked) inspect(file, `${file}\n${await readFile(path.join(root, file), "utf8")}`)
console.log(`language gate: clean (${tracked.length} files)`)
