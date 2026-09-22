// Prompt 25: the manual covers the CLI and every doctor violation, and its links resolve.
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, run, test } from "./support.mjs"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const read = file => readFile(path.join(repository, file), "utf8")
const exists = file => stat(path.join(repository, file)).then(() => true, () => false)
const required = ["docs/README.md", "docs/GETTING-STARTED.md", "docs/CONCEPTS.md", "docs/CLI.md", "docs/TROUBLESHOOTING.md"]
const cli = await read("_system/bin/rpgvault.mjs")

const markdownFiles = async (directory = "docs") => {
  const found = []
  for (const entry of await readdir(path.join(repository, directory), { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await markdownFiles(`${directory}/${entry.name}`))
    else if (entry.name.endsWith(".md")) found.push(`${directory}/${entry.name}`)
  }
  return found
}

const links = text => [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]).filter(target => !/^(https?:|#|mailto:)/.test(target))

test("the manual has an index and the pages it needs", async () => {
  for (const file of required) assert.ok(await exists(file), `${file} exists`)
  const index = await read("docs/README.md")
  for (const file of await markdownFiles()) {
    if (file === "docs/README.md") continue
    assert.ok(index.includes(path.relative("docs", file)), `docs/README.md links ${file}`)
  }
  assert.ok((await read("README.md")).includes("docs/README.md"), "the root README points at the manual")
})

test("every page is substantial and has one title", async () => {
  for (const file of required) {
    const body = await read(file)
    const titles = body.split("\n").filter(line => line.startsWith("# "))
    assert.equal(titles.length, 1, `${file} has exactly one H1, found ${titles.length}`)
    const content = body.split("\n").filter(line => line.trim()).length
    assert.ok(content >= 30, `${file} has at least 30 non-empty lines, found ${content}`)
    assert.equal(/\bTODO\b|\bTBD\b|lorem ipsum/i.test(body), false, `${file} has no placeholder text`)
  }
})

test("relative links in the manual and the root README resolve", async () => {
  for (const file of ["README.md", ...await markdownFiles()]) {
    for (const target of links(await read(file))) {
      const resolved = path.join(path.dirname(file), target.split("#")[0])
      assert.ok(await exists(resolved), `${file} links to ${target}, which resolves to ${resolved}`)
    }
  }
})

test("docs/CLI.md documents every command, subcommand and flag the CLI accepts", async () => {
  const body = await read("docs/CLI.md")
  const commands = [...cli.matchAll(/command === '([a-z-]+)'/g)].map(match => match[1])
  const subcommands = [...cli.matchAll(/subcommand === '([a-z-]+)'/g)].map(match => match[1])
  const flags = [...cli.matchAll(/'(--[a-z-]+)'/g)].map(match => match[1])
  assert.ok(commands.length >= 6, `found the CLI commands in the source: ${commands.join(", ")}`)
  for (const name of new Set([...commands, ...subcommands, ...flags])) assert.ok(body.includes(name), `docs/CLI.md documents ${name}`)
  assert.ok(body.includes("node _system/bin/rpgvault.mjs"), "docs/CLI.md shows how the CLI is invoked")
})

test("every command example in the manual uses the shipped CLI path", async () => {
  for (const file of ["README.md", ...await markdownFiles()]) {
    const body = await read(file)
    for (const [, line] of body.matchAll(/^(.*rpgvault\.mjs.*)$/gm)) {
      if (!/rpgvault\.mjs/.test(line)) continue
      assert.ok(/_system\/bin\/rpgvault\.mjs/.test(line), `${file}: ${line.trim()}`)
    }
  }
})

test("docs/TROUBLESHOOTING.md explains every doctor violation the CLI can report", async () => {
  const body = await read("docs/TROUBLESHOOTING.md")
  const messages = [...cli.matchAll(/failures\.push\(`?'?([^`'$]+)/g)].map(match => match[1].replace(/[:\s]+$/, "").trim()).filter(Boolean)
  assert.ok(messages.length >= 15, `found the doctor messages in the source: ${messages.length}`)
  for (const message of new Set(messages)) assert.ok(body.includes(message), `docs/TROUBLESHOOTING.md explains "${message}"`)
  assert.ok(body.includes("doctor: clean"), "docs/TROUBLESHOOTING.md shows what a clean run looks like")
})

await run("25-docs-manual")
