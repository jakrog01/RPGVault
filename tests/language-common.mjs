import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hashes = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-vocabulary.sha256"), "utf8")).trim().split("\n"))
const digest = value => createHash("sha256").update(value).digest("hex")
export const excluded = item => item === "package-lock.json" || item.includes("obsidian/plugins/templater-obsidian/") || item.includes("obsidian/plugins/calendarium/")
export const tokens = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(token => token.toLowerCase())
export const languageViolation = value => /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b]/.test(value) || tokens(value).some(token => Array.from({ length: Math.max(0, token.length - 3) }, (_, index) => token.slice(0, index + 4)).some(prefix => hashes.has(digest(prefix))))
