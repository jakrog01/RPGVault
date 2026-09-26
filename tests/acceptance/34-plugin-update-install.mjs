// Prompt 34: the table home shows a banner when a newer RPGVault is recorded, and on the desktop a
// button in that banner runs `update --latest` in a modal that streams the CLI's own report. On a
// phone there is no button, only the command to run.
import { assert, boot, createVault, idle, run, startObsidian, test, unload } from "./support.mjs"

const MANIFEST = JSON.stringify({ release: { repo: "jakrog01/RPGVault", asset: "RPGVault.zip", api: "https://example.invalid" } })
const baseState = { installedVersion: "1.0.0", appliedMigrations: [], installId: "vault-abc", adoptedFrom: null }
const stateWith = updateCheck => JSON.stringify(updateCheck ? { ...baseState, updateCheck } : baseState, null, 2)
const recorded = (version, ageHours = 0) => ({ checkedAt: new Date(Date.now() - ageHours * 3600 * 1000).toISOString(), latestVersion: version, repo: "jakrog01/RPGVault" })

function vault(updateCheck, files = {}) {
  return createVault({ adapterFiles: new Map(Object.entries({
    "_system/manifest.json": MANIFEST,
    "_system/VERSION": "1.0.0\n",
    ".rpgvault/state.json": stateWith(updateCheck),
    ...files,
  })) })
}

async function home(env, plugin) {
  await plugin.openHome()
  const view = env.leaves.find(leaf => leaf.type === "tt-home")?.view
  assert.ok(view, "contract: openHome() opens the tt-home view")
  return view
}
const banner = (env, view) => env.byClass(view.contentEl, "tt-home-update")[0]
const text = element => (element ? element.textContent : "")
/** The plugin runs the CLI through an injectable runner so a test never spawns a process. */
const stubRunner = (plugin, run) => { plugin.commandRunner = run }

test("the home view shows a banner naming both versions when a newer release is recorded", async () => {
  const env = vault(recorded("1.1.0"))
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await home(env, plugin)
  const element = banner(env, view)
  assert.ok(element, `contract: the home view renders .tt-home-update; rendered: ${env.rendered.slice(-8).join(" | ")}`)
  const body = text(element)
  assert.ok(body.includes("1.1.0"), `the banner names the new version: ${body}`)
  assert.ok(body.includes("1.0.0"), `the banner names the installed version: ${body}`)
  await unload(plugin)
})

test("no banner appears when the vault is current, when nothing was ever checked, or when the record is junk", async () => {
  for (const [name, updateCheck] of [
    ["current", recorded("1.0.0")],
    ["older", recorded("0.9.0")],
    ["never checked", null],
    ["junk version", { checkedAt: new Date().toISOString(), latestVersion: "release-2", repo: "jakrog01/RPGVault" }],
  ]) {
    const env = vault(updateCheck)
    const plugin = await boot(env)
    startObsidian(env)
    await idle(plugin)
    const view = await home(env, plugin)
    assert.equal(banner(env, view), undefined, `${name} shows no banner: ${text(banner(env, view))}`)
    await unload(plugin)
  }
})

test("the banner offers the install button on the desktop and the command everywhere", async () => {
  const desktop = vault(recorded("1.1.0"))
  desktop.platform.isDesktopApp = true
  const first = await boot(desktop)
  startObsidian(desktop)
  await idle(first)
  const desktopView = await home(desktop, first)
  const install = desktop.byLabel(desktopView.contentEl, first.strings.homeUpdateInstall)[0]
  assert.ok(install, `contract: the desktop banner has a "${first.strings.homeUpdateInstall}" control`)
  assert.ok(text(banner(desktop, desktopView)).includes("update --latest"), "the banner names the command as well")
  await unload(first)

  const mobile = vault(recorded("1.1.0"))
  mobile.platform.isDesktopApp = false
  const second = await boot(mobile)
  startObsidian(mobile)
  await idle(second)
  const mobileView = await home(mobile, second)
  assert.ok(banner(mobile, mobileView), "the banner still appears on a phone")
  assert.equal(mobile.byLabel(mobileView.contentEl, second.strings.homeUpdateInstall)[0], undefined, "a phone offers no install button")
  assert.ok(text(banner(mobile, mobileView)).includes("update --latest"), "a phone is told the command to run")
  await unload(second)
})

test("the install button streams the CLI output into a modal and reports success", async () => {
  const env = vault(recorded("1.1.0"))
  env.platform.isDesktopApp = true
  const calls = []
  const plugin = await boot(env)
  stubRunner(plugin, async (file, args, onOutput) => {
    calls.push({ file, args })
    onOutput("replaced docs (1 written, 0 removed), backup .rpgvault/backups/2026-01-01T00-00-00-000Z\n")
    onOutput("RPGVault doctor: clean (1.1.0)\n")
    return 0
  })
  startObsidian(env)
  await idle(plugin)
  const view = await home(env, plugin)
  await env.byLabel(view.contentEl, plugin.strings.homeUpdateInstall)[0].click()
  const invocation = calls.at(-1)
  assert.ok(invocation, "contract: the button runs the CLI through plugin.commandRunner")
  assert.ok(String(invocation.file).endsWith("_system/bin/rpgvault.mjs"), `it runs the shipped CLI: ${JSON.stringify(invocation)}`)
  assert.deepEqual(invocation.args, ["update", "--latest"], `it passes update --latest: ${JSON.stringify(invocation.args)}`)
  const modal = env.modals.at(-1)
  assert.ok(modal, "a modal is open")
  const shown = env.rendered.join("\n")
  assert.ok(shown.includes("RPGVault doctor: clean (1.1.0)"), `the modal shows the CLI output: ${shown.slice(-400)}`)
  assert.ok(shown.includes(plugin.strings.homeUpdateReload), "the modal asks for a reload when the update succeeded")
  await unload(plugin)
})

test("a failed install keeps the modal open, shows the CLI's own failure and never claims success", async () => {
  const env = vault(recorded("1.1.0"))
  env.platform.isDesktopApp = true
  const plugin = await boot(env)
  stubRunner(plugin, async (_file, _args, onOutput) => {
    onOutput("RPGVault doctor found 1 violation(s):\n- undeclared root: Campaign Library\n")
    onOutput("rpgvault: _system was replaced but finalisation failed; backup is .rpgvault/backups/2026-01-01T00-00-00-000Z\n")
    return 1
  })
  startObsidian(env)
  await idle(plugin)
  const view = await home(env, plugin)
  await env.byLabel(view.contentEl, plugin.strings.homeUpdateInstall)[0].click()
  const shown = env.rendered.join("\n")
  assert.ok(shown.includes("undeclared root: Campaign Library"), `the modal forwards the violation: ${shown.slice(-400)}`)
  assert.ok(shown.includes("finalisation failed"), "the modal forwards the CLI's own message")
  assert.ok(shown.includes(plugin.strings.homeUpdateFailed), "the modal says the update failed")
  assert.equal(shown.includes(plugin.strings.homeUpdateReload), false, "a failed update does not ask for a reload")
  await unload(plugin)
})

test("a runner that cannot start is reported, not thrown", async () => {
  const env = vault(recorded("1.1.0"))
  env.platform.isDesktopApp = true
  const plugin = await boot(env)
  stubRunner(plugin, async () => { throw new Error("spawn node ENOENT") })
  startObsidian(env)
  await idle(plugin)
  const view = await home(env, plugin)
  await env.byLabel(view.contentEl, plugin.strings.homeUpdateInstall)[0].click()
  const shown = `${env.rendered.join("\n")}\n${env.notices.join("\n")}`
  assert.ok(shown.includes(plugin.strings.homeUpdateFailed), `the failure is reported: ${shown.slice(-300)}`)
  assert.ok(shown.includes("spawn node ENOENT"), "the reason is shown")
  assert.equal(typeof plugin.index?.whenIdle, "function", "the plugin is still alive")
  await unload(plugin)
})

test("every banner and modal text comes from the strings file", async () => {
  const env = vault(recorded("1.1.0"))
  const plugin = await boot(env)
  for (const key of ["homeUpdateAvailable", "homeUpdateInstall", "homeUpdateRunning", "homeUpdateReload", "homeUpdateFailed"]) {
    assert.equal(typeof plugin.strings[key], "string", `contract: strings.${key} exists`)
    assert.ok(plugin.strings[key].length > 0, `contract: strings.${key} is not empty`)
  }
  await unload(plugin)
})

await run("acceptance 34 plugin update install")
