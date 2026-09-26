// Prompt 33: Table Tools can ask the configured release host whether a newer RPGVault exists —
// from a settings button and, when the owner opts in, once a day at startup — and records the
// answer where the CLI keeps it, without touching anything else in the vault.
import { assert, boot, createVault, idle, run, startObsidian, test, unload } from "./support.mjs"

const MANIFEST = JSON.stringify({
  release: { repo: "jakrog01/RPGVault", asset: "RPGVault.zip", api: "https://api.github.com" },
  contentRoots: ["Campaigns", "Parties", "Runs", "Library", "Calendar", "Archive"],
})
const STATE = JSON.stringify({ installedVersion: "1.0.0", appliedMigrations: ["0001-example"], installId: "vault-abc", adoptedFrom: null }, null, 2)
const VERSION = "1.0.0\n"

/** A vault whose shipped files the plugin can read, with `files` merged into the adapter. */
function vault(files = {}) {
  const env = createVault({ adapterFiles: new Map(Object.entries({
    "_system/manifest.json": MANIFEST,
    "_system/VERSION": VERSION,
    ".rpgvault/state.json": STATE,
    ...files,
  })) })
  return env
}

const release = (tag, extra = {}) => ({ status: 200, json: { tag_name: tag, assets: [{ name: "RPGVault.zip", browser_download_url: "https://example.invalid/RPGVault.zip" }], ...extra } })
const state = env => JSON.parse(env.adapterFiles.get(".rpgvault/state.json"))
const checkButton = (env, plugin) => {
  const tab = plugin.settingTabs.at(-1)
  assert.ok(tab, "contract: the plugin registers a settings tab")
  tab.display()
  const button = env.buttonComponent(tab.containerEl, plugin.strings.settingsCheckForUpdates)
  const names = tab.containerEl.settings.map(setting => setting.name).filter(Boolean)
  assert.ok(button, `contract: the settings tab has a "${plugin.strings.settingsCheckForUpdates}" button; settings offered: ${names.join(" | ")}`)
  return button
}
const releaseRequests = env => env.requests.filter(request => String(request.url ?? "").includes("/releases/latest"))

test("the settings button reports a newer release and names both versions", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.1.0")
  const plugin = await boot(env)
  await checkButton(env, plugin).click()
  const asked = releaseRequests(env)
  assert.equal(asked.length, 1, `exactly one release request: ${env.requests.map(item => item.url).join(", ")}`)
  assert.ok(String(asked[0].url).includes("/repos/jakrog01/RPGVault/releases/latest"), `the manifest repo is queried: ${asked[0].url}`)
  const notice = env.notices.at(-1)
  assert.ok(notice.includes("1.1.0"), `the notice names the new version: ${notice}`)
  assert.ok(notice.includes("1.0.0"), `the notice names the installed version: ${notice}`)
  await unload(plugin)
})

test("an up-to-date vault is told so, and nothing is recorded as newer", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.0.0")
  const plugin = await boot(env)
  await checkButton(env, plugin).click()
  const notice = env.notices.at(-1)
  assert.ok(notice.includes("1.0.0"), `the notice names the installed version: ${notice}`)
  assert.equal(state(env).updateCheck.latestVersion, "1.0.0", "the answer is still recorded")
  await unload(plugin)
})

test("a successful check records the answer beside the CLI's own state and keeps every other key", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.2.3")
  const plugin = await boot(env)
  const started = Date.now()
  await checkButton(env, plugin).click()
  const after = state(env)
  assert.equal(after.updateCheck.latestVersion, "1.2.3", "the version is recorded without the tag prefix")
  assert.equal(after.updateCheck.repo, "jakrog01/RPGVault", "the repository is recorded")
  const checkedAt = Date.parse(after.updateCheck.checkedAt)
  assert.ok(Number.isFinite(checkedAt) && checkedAt >= started - 60000, `checkedAt is the time of the check: ${after.updateCheck.checkedAt}`)
  assert.equal(after.installedVersion, "1.0.0", "installedVersion is untouched")
  assert.equal(after.installId, "vault-abc", "installId is untouched")
  assert.deepEqual(after.appliedMigrations, ["0001-example"], "appliedMigrations is untouched")
  assert.deepEqual(env.writes.filter(item => !item.startsWith(".rpgvault/state.json")), [], `nothing else is written: ${env.writes.join(", ")}`)
  await unload(plugin)
})

test("`_local/release.json` sends the check to a fork", async () => {
  const env = vault({ "_local/release.json": JSON.stringify({ repo: "someone/Fork" }) })
  env.network.requestUrl = async () => release("v1.1.0")
  const plugin = await boot(env)
  await checkButton(env, plugin).click()
  const asked = releaseRequests(env)
  assert.ok(String(asked[0].url).includes("/repos/someone/Fork/releases/latest"), `the fork is queried: ${asked[0].url}`)
  assert.equal(state(env).updateCheck.repo, "someone/Fork", "the fork is recorded")
  await unload(plugin)
})

test("a host that refuses, a body without a tag and a tag that is not a version are all reported without recording", async () => {
  const cases = [
    { name: "refused", answer: async () => ({ status: 403, json: { message: "rate limited" } }) },
    { name: "thrown", answer: async () => { throw new Error("network down") } },
    { name: "no tag", answer: async () => ({ status: 200, json: { assets: [] } }) },
    { name: "not a version", answer: async () => release("release-2") },
  ]
  for (const item of cases) {
    const env = vault()
    env.network.requestUrl = item.answer
    const plugin = await boot(env)
    const before = env.notices.length
    await checkButton(env, plugin).click()
    assert.ok(env.notices.length > before, `${item.name} shows a notice`)
    assert.equal(state(env).updateCheck, undefined, `${item.name} records nothing`)
    assert.equal(env.notices.at(-1).includes("undefined"), false, `${item.name} shows no undefined text: ${env.notices.at(-1)}`)
    await unload(plugin)
  }
})

test("the startup check is off by default and asks nothing", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.1.0")
  const plugin = await boot(env)
  assert.equal(plugin.settings.checkForUpdatesOnStart, false, "contract: settings.checkForUpdatesOnStart defaults to false")
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(releaseRequests(env), [], `nothing is asked at startup: ${env.requests.map(item => item.url).join(", ")}`)
  assert.equal(state(env).updateCheck, undefined, "nothing is recorded at startup")
  await unload(plugin)
})

test("with the startup check on, the vault is asked once a day and not again", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.1.0")
  const plugin = await boot(env)
  plugin.settings.checkForUpdatesOnStart = true
  startObsidian(env)
  await idle(plugin)
  assert.equal(releaseRequests(env).length, 1, `the startup check asks once: ${env.requests.map(item => item.url).join(", ")}`)
  assert.ok(env.notices.some(notice => notice.includes("1.1.0")), `the owner is told: ${env.notices.join(" | ")}`)
  await unload(plugin)

  const second = vault({ ".rpgvault/state.json": JSON.stringify({ ...JSON.parse(STATE), updateCheck: { checkedAt: new Date().toISOString(), latestVersion: "1.1.0", repo: "jakrog01/RPGVault" } }, null, 2) })
  second.network.requestUrl = async () => release("v1.1.0")
  const again = await boot(second)
  again.settings.checkForUpdatesOnStart = true
  startObsidian(second)
  await idle(again)
  assert.deepEqual(releaseRequests(second), [], `a check from today is not repeated: ${second.requests.map(item => item.url).join(", ")}`)
  await unload(again)

  const old = vault({ ".rpgvault/state.json": JSON.stringify({ ...JSON.parse(STATE), updateCheck: { checkedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), latestVersion: "1.0.0", repo: "jakrog01/RPGVault" } }, null, 2) })
  old.network.requestUrl = async () => release("v1.1.0")
  const third = await boot(old)
  third.settings.checkForUpdatesOnStart = true
  startObsidian(old)
  await idle(third)
  assert.equal(releaseRequests(old).length, 1, `a check older than a day is repeated: ${old.requests.map(item => item.url).join(", ")}`)
  await unload(third)
})

test("a failed startup check is attempted, stays silent and leaves the plugin working", async () => {
  const env = vault()
  env.network.requestUrl = async () => { throw new Error("network down") }
  const plugin = await boot(env)
  plugin.settings.checkForUpdatesOnStart = true
  const before = env.notices.length
  startObsidian(env)
  await idle(plugin)
  assert.equal(releaseRequests(env).length, 1, `the startup check was attempted: ${env.requests.map(item => item.url).join(", ")}`)
  assert.equal(env.notices.length, before, `a failed startup check says nothing: ${env.notices.slice(before).join(" | ")}`)
  assert.equal(state(env).updateCheck, undefined, "a failed startup check records nothing")
  assert.equal(typeof plugin.index?.whenIdle, "function", "the plugin is still alive")
  await unload(plugin)
})

test("every text the check shows comes from the strings file", async () => {
  const env = vault()
  env.network.requestUrl = async () => release("v1.1.0")
  const plugin = await boot(env)
  for (const key of ["settingsUpdateHeading", "settingsCheckForUpdates", "settingsCheckOnStart", "settingsUpdateAvailable", "settingsUpdateCurrent", "settingsUpdateFailed"]) {
    assert.equal(typeof plugin.strings[key], "string", `contract: strings.${key} exists`)
    assert.ok(plugin.strings[key].length > 0, `contract: strings.${key} is not empty`)
  }
  await checkButton(env, plugin).click()
  assert.ok(env.notices.at(-1).includes("1.1.0"), `the available notice is formatted from its string: ${env.notices.at(-1)}`)
  await unload(plugin)
})

await run("acceptance 33 plugin update check")
