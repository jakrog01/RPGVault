import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath } from "node:url"

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hashes = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-vocabulary.sha256"), "utf8")).trim().split("\n"))
const digest = value => createHash("sha256").update(value).digest("hex")
const inspect = (name, value) => { if (/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b]/.test(value) || value.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).some(token => hashes.has(digest(token.toLowerCase())))) throw new Error(`${name}: language violation`) }
if ((await exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: root })).stdout.trim() === "true") throw new Error("history gate requires a complete clone")
for (const ref of (await exec("git", ["for-each-ref", "--format=%(refname:short)"], { cwd: root })).stdout.trim().split("\n").filter(Boolean)) inspect(`ref ${ref}`, ref)
const messages = (await exec("git", ["log", "--all", "--format=%B"], { cwd: root })).stdout
inspect("commit messages", messages)
const objects = (await exec("git", ["rev-list", "--objects", "--all"], { cwd: root })).stdout.trim().split("\n")
for (const record of objects) { const [object, ...name] = record.split(" "); const file = name.join(" "); if (file.includes("obsidian/plugins/templater-obsidian/") || file.includes("obsidian/plugins/calendarium/") || file.endsWith("package-lock.json")) continue; const type = (await exec("git", ["cat-file", "-t", object], { cwd: root })).stdout.trim(); if (type === "blob") inspect(file || object, (await exec("git", ["cat-file", "-p", object], { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout); }
console.log("history language gate: clean")
