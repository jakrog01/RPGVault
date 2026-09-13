import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { excluded, languageViolation } from "./language-common.mjs"

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const inspect = (name, value) => { if (languageViolation(value)) throw new Error(`${name}: language violation`) }
if ((await exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: root })).stdout.trim() === "true") throw new Error("history gate requires a complete clone")
for (const ref of (await exec("git", ["for-each-ref", "--format=%(refname:short)"], { cwd: root })).stdout.trim().split("\n").filter(Boolean)) inspect(`ref ${ref}`, ref)
const messages = (await exec("git", ["log", "--all", "--format=%B"], { cwd: root })).stdout
inspect("commit messages", messages)
const objects = (await exec("git", ["rev-list", "--objects", "--all"], { cwd: root })).stdout.trim().split("\n")
for (const record of objects) { const [object, ...name] = record.split(" "); const file = name.join(" "); if (excluded(file)) continue; const type = (await exec("git", ["cat-file", "-t", object], { cwd: root })).stdout.trim(); if (type === "blob") inspect(file || object, (await exec("git", ["cat-file", "-p", object], { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout); }
console.log("history language gate: clean")
