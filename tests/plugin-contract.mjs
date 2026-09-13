import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "_system/plugin/src")
const files = await readdir(source)
const contents = await Promise.all(files.filter(file => file.endsWith(".ts")).map(async file => [file, await readFile(path.join(source, file), "utf8")]))
for (const [file, content] of [...contents, ["main.js", await readFile(path.join(root, "_system/plugin/main.js"), "utf8")]]) assert.equal(/\b(?:prompt|alert|confirm)\s*\(/.test(content), false, `${file} uses an unsupported browser dialog`)
console.log("plugin contract gate: clean")
