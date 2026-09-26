// Prompt 36: the manual is one coherent set of pages with one page per question, and it builds and
// publishes as a site. The tests read the MkDocs configuration and the workflows as text, so they
// need neither Python nor the network.
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { assert, run, test } from "./support.mjs"
import { repository } from "../support/release.mjs"

const read = file => readFile(path.join(repository, file), "utf8")
const exists = file => stat(path.join(repository, file)).then(() => true, () => false)
const CONFIG = ".github/mkdocs.yml"

const pages = async (directory = "docs") => {
  const found = []
  for (const entry of await readdir(path.join(repository, directory), { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await pages(`${directory}/${entry.name}`))
    else if (entry.name.endsWith(".md")) found.push(`${directory}/${entry.name}`)
  }
  return found.sort()
}

/** `- Title: path.md` entries of the nav, in order, without needing a YAML parser. */
const navEntries = config => [...config.matchAll(/^\s+-\s+([^:\n]+):\s*(\S+\.md)\s*$/gm)].map(match => ({ title: match[1].trim(), file: match[2].trim() }))
const setting = (config, key) => config.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim()
const heading = body => body.split("\n").find(line => line.startsWith("# "))?.slice(2).trim() ?? ""
const contentLines = body => body.split("\n").filter(line => line.trim()).length

test("the MkDocs configuration lives outside the vault roots and points at the manual", async () => {
  assert.ok(await exists(CONFIG), `${CONFIG} exists`)
  const config = await read(CONFIG)
  assert.ok(setting(config, "site_name"), `the site has a name: ${setting(config, "site_name")}`)
  assert.equal(setting(config, "docs_dir"), "../docs", "docs_dir is the manual")
  const siteDir = setting(config, "site_dir") ?? "site"
  assert.ok(!siteDir.startsWith("../") || siteDir.startsWith("../.github/"), `a local build writes inside .github, not into a vault root: ${siteDir}`)
  const ignored = await read(".gitignore")
  const built = path.posix.normalize(path.posix.join(".github", siteDir))
  assert.ok(ignored.split("\n").some(line => line.trim().replace(/\/$/, "") === built.replace(/\/$/, "")), `.gitignore ignores the built site at ${built}`)
  assert.ok(await exists(".github/docs-requirements.txt"), "the documentation dependencies are pinned in .github/docs-requirements.txt")
  const requirements = await read(".github/docs-requirements.txt")
  assert.match(requirements, /mkdocs[^\n]*==\s*\d/, `every dependency is pinned to a version: ${requirements}`)
})

test("the nav covers every page of the manual exactly once, and names them as the pages do", async () => {
  const config = await read(CONFIG)
  const nav = navEntries(config)
  assert.ok(nav.length >= 10, `the nav lists the manual, found ${nav.length} entries`)
  const all = await pages()
  const index = "docs/README.md"
  for (const entry of nav) {
    const file = `docs/${entry.file}`
    assert.ok(all.includes(file), `the nav entry ${entry.file} exists`)
    const title = heading(await read(file))
    assert.equal(entry.title, title, `the nav title of ${entry.file} matches its heading "${title}"`)
  }
  const listed = nav.map(entry => `docs/${entry.file}`)
  assert.deepEqual([...new Set(listed)], listed, `no page is listed twice: ${listed.join(", ")}`)
  for (const file of all) {
    if (file === index) continue
    assert.ok(listed.includes(file), `${file} is in the nav`)
  }
})

test("every page has one heading, and every page is reachable from the index", async () => {
  const index = await read("docs/README.md")
  for (const file of await pages()) {
    const body = await read(file)
    const headings = body.split("\n").filter(line => line.startsWith("# "))
    assert.equal(headings.length, 1, `${file} has exactly one H1, found ${headings.length}`)
    if (file === "docs/README.md") continue
    assert.ok(index.includes(path.relative("docs", file)), `docs/README.md links ${file}`)
  }
})

test("one page owns keeping a vault up to date, and the others point at it", async () => {
  assert.ok(await exists("docs/UPDATING.md"), "docs/UPDATING.md exists")
  const updating = await read("docs/UPDATING.md")
  for (const topic of ["update --check", "update --latest", "update --from", ".rpgvault/backups", "Install update", "1.0.0"]) {
    assert.ok(updating.includes(topic), `the updating page covers ${topic}`)
  }
  assert.ok(contentLines(updating) >= 25, `the updating page is substantial, found ${contentLines(updating)} lines`)
  for (const file of ["docs/UPGRADING.md", "docs/TABLE-TOOLS.md", "docs/SETTINGS.md"]) {
    assert.ok((await read(file)).includes("UPDATING.md"), `${file} points at the updating page`)
  }
  const upgrading = await read("docs/UPGRADING.md")
  for (const topic of ["migration", "immutable", "tag"]) {
    assert.ok(new RegExp(topic, "i").test(upgrading), `the upgrading page keeps the maintainer's ${topic} material`)
  }
})

test("the pages the index promises as reference actually cover their subject", async () => {
  const required = {
    "docs/ARCHITECTURE.md": ["_local", "replaceOnUpdate", "ownedGlobs", "contentRoots", "radar"],
    "docs/CUSTOMISING.md": ["strings.json", "_local/templates", "community plugins", "doctor"],
    "docs/AUTHORING-SYSTEMS.md": ["_system/systems", "package.json", "radar", "template", "doctor"],
  }
  for (const [file, topics] of Object.entries(required)) {
    const body = await read(file)
    for (const topic of topics) assert.ok(body.includes(topic), `${file} covers ${topic}`)
    assert.ok(contentLines(body) >= 12, `${file} is more than a stub, found ${contentLines(body)} lines`)
  }
})

test("every relative link and heading anchor in the manual resolves", async () => {
  const slug = text => text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
  for (const file of await pages()) {
    const body = await read(file)
    for (const [, target] of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(target)) continue
      const [relative, anchor] = target.split("#")
      const resolved = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative)) : file
      assert.ok(await exists(resolved), `${file} links ${target}, which resolves to ${resolved}`)
      if (!anchor) continue
      const headings = [...(await read(resolved)).matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => slug(match[1]))
      assert.ok(headings.includes(anchor), `${file} links the anchor #${anchor} of ${resolved}; it has ${headings.join(", ")}`)
    }
  }
})

test("a workflow builds the site on every push and publishes it only for a release tag", async () => {
  const files = await readdir(path.join(repository, ".github/workflows"))
  const workflows = Object.fromEntries(await Promise.all(files.map(async name => [name, await read(`.github/workflows/${name}`)])))
  const building = Object.entries(workflows).filter(([, body]) => body.includes("mkdocs build"))
  assert.ok(building.length, `a workflow builds the site: ${files.join(", ")}`)
  const [, build] = building[0]
  assert.ok(build.includes("docs-requirements.txt"), "the build installs the pinned dependencies")
  assert.ok(build.includes(CONFIG.replace(".github/", "")) || build.includes(CONFIG), "the build uses the shipped configuration")
  assert.ok(/branches:\s*\[\s*main\s*\]|branches:\n\s+-\s*main/.test(build), "the site is built on pushes to main")
  const publishing = Object.entries(workflows).filter(([, body]) => body.includes("actions/deploy-pages"))
  assert.ok(publishing.length, "a workflow publishes the site to Pages")
  const [, publish] = publishing[0]
  assert.ok(/tags:\s*\['v\*'\]|startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(publish), "publishing happens for a release tag")
  assert.ok(/permissions:[\s\S]*pages:\s*write/.test(publish), "the publishing job may write Pages")
  assert.ok(/permissions:[\s\S]*id-token:\s*write/.test(publish), "the publishing job may claim its Pages identity")
  assert.ok(/needs:\s*\[?\s*(package|build)/.test(publish), "publishing waits for the job that runs the tests or builds the site")
})

test("the manual and the root README point at the published site", async () => {
  const config = await read(CONFIG)
  const url = setting(config, "site_url")
  assert.ok(url && /^https?:\/\//.test(url), `the configuration names the published address: ${url}`)
  const readme = await read("README.md")
  assert.ok(readme.includes(url.replace(/\/$/, "")), `the root README links the site at ${url}`)
})

await run("acceptance 36 docs site")
