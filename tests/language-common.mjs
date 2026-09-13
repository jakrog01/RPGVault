import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hashes = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-vocabulary.sha256"), "utf8")).trim().split("\n"))
// Whole Polish words that no stem can cover without matching English, with their inflected forms.
// Matched as complete tokens against 16-character hash prefixes to keep the fixture small.
const words = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-words.sha256"), "utf8")).trim().split("\n"))
// Letter trigrams that occur in Polish but in no English dictionary word or inflection.
const trigrams = new Set((await readFile(path.join(root, "tests/fixtures/forbidden-trigrams.sha256"), "utf8")).trim().split("\n"))
const digest = value => createHash("sha256").update(value).digest("hex")
// Lockfiles hold base64 integrity hashes, which are random text rather than language.
export const excluded = item => item === "package-lock.json" || item.endsWith("/package-lock.json") || item.includes("obsidian/plugins/templater-obsidian/") || item.includes("obsidian/plugins/calendarium/")
export const tokens = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(token => token.toLowerCase())
export const languageViolation = value => /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b]/.test(value) || tokens(value).some(token => (token.length >= 3 && words.has(digest(token).slice(0, 16))) || Array.from({ length: Math.max(0, token.length - 3) }, (_, index) => token.slice(0, index + 4)).some(prefix => hashes.has(digest(prefix))) || (token.length >= 5 && Array.from({ length: token.length - 2 }, (_, index) => token.slice(index, index + 3)).some(trigram => trigrams.has(digest(trigram)))))
