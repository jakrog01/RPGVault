// Offline stand-in for the GitHub releases API: a loopback HTTP server that answers the
// releases endpoint and serves a release archive built here, a dependency-free store-only
// zip writer so no test needs the `zip` binary or the network, and an installed-vault clone.
import { createServer } from "node:http"
import { crc32 } from "node:zlib"
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const encode = value => Buffer.from(value, "utf8")

const dosStamp = () => {
  const time = ((12 & 31) << 11) | ((0 & 63) << 5) | 0
  const date = (((2026 - 1980) & 127) << 9) | ((1 & 15) << 5) | 1
  return { time, date }
}

/** A store-only zip of `entries` ([{name, data}]), readable by `unzip`. */
export function zipArchive(entries) {
  const { time, date } = dosStamp()
  const locals = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const name = encode(entry.name)
    const data = Buffer.isBuffer(entry.data) ? entry.data : encode(String(entry.data))
    const sum = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(10, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, data)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(10, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(sum, 16)
    header.writeUInt32LE(data.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(entry.name.endsWith("/") ? 0x10 : 0, 38)
    header.writeUInt32LE(offset, 42)
    central.push(header, name)
    offset += local.length + name.length + data.length
  }
  const body = Buffer.concat(locals)
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(body.length, 16)
  return Buffer.concat([body, directory, end])
}

const skipped = item => item.includes(`${path.sep}.git`) || item.includes(`${path.sep}node_modules`) || item.includes(`${path.sep}backups`)

/** Every file under `directory` as zip entries, paths relative and slash-separated. */
export async function archiveEntries(directory, prefix = "") {
  const entries = []
  const walk = async current => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const item = path.join(current, entry.name)
      if (skipped(item)) continue
      if (entry.isDirectory()) await walk(item)
      else if (entry.isFile()) entries.push({ name: prefix + path.relative(directory, item).split(path.sep).join("/"), data: await readFile(item) })
    }
  }
  if ((await stat(directory)).isDirectory()) await walk(directory)
  return entries
}

/**
 * Fake releases host. `options`:
 *   release  the JSON body for /repos/<repo>/releases/latest, or null for 404
 *   asset    Buffer served for the asset download, or null for 404
 *   assetName  download path segment (default RPGVault.zip)
 *   status   status code for the releases endpoint (default 200)
 *   body     raw string body for the releases endpoint, overriding `release`
 * Records every request path in `requests`.
 */
export async function releaseHost(options = {}) {
  const requests = []
  const assetName = options.assetName ?? "RPGVault.zip"
  const server = createServer((request, response) => {
    requests.push(request.url)
    if (request.url.endsWith(`/download/${assetName}`)) {
      if (!options.asset) { response.writeHead(404); response.end("no asset"); return }
      response.writeHead(200, { "content-type": "application/zip", "content-length": String(options.asset.length) })
      response.end(options.asset)
      return
    }
    if (request.url.includes("/releases/latest")) {
      const status = options.status ?? (options.release ? 200 : 404)
      response.writeHead(status, { "content-type": "application/json" })
      response.end(options.body ?? JSON.stringify(options.release ?? { message: "Not Found" }))
      return
    }
    response.writeHead(404)
    response.end("not found")
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, requests, downloadUrl: `${base}/download/${assetName}`, close: () => new Promise(resolve => server.close(resolve)) }
}

/** A releases payload shaped like GitHub's, for tag `tag` with one named asset. */
export const releaseBody = (tag, downloadUrl, assetName = "RPGVault.zip") => ({
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  assets: [{ name: assetName, browser_download_url: downloadUrl, size: 1 }],
})

/**
 * A temporary vault that looks like an installed clone of this repository: shipped layer,
 * managed Obsidian files, one note of owner content and one `_local` override.
 */
export async function cloneVault(prefix) {
  const vault = await mkdtemp(path.join(os.tmpdir(), prefix))
  await cp(repository, vault, { recursive: true, filter: item => !skipped(item) })
  await mkdir(path.join(vault, "Campaigns/User"), { recursive: true })
  await mkdir(path.join(vault, "_local/templates"), { recursive: true })
  await writeFile(path.join(vault, "Campaigns/User/Campaign.md"), "owner content\n")
  await writeFile(path.join(vault, "_local/templates/campaign.md"), "local override\n")
  return vault
}

/** Run the vault's own CLI. Resolves with the exit code and both streams. */
export function cli(vault, args, env = {}, timeout = 120000) {
  return new Promise(resolve => {
    execFile("node", [path.join(vault, "_system/bin/rpgvault.mjs"), ...args], { cwd: vault, timeout, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr })
    })
  })
}

/** Every file under `directory` with its hash, for proving a failed command wrote nothing. */
export async function snapshot(directory) {
  const lines = []
  const walk = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const item = path.join(current, entry.name)
      if (skipped(item)) continue
      if (entry.isDirectory()) await walk(item)
      else if (entry.isFile()) lines.push(`${path.relative(directory, item)} ${createHash("sha1").update(await readFile(item)).digest("hex")}`)
    }
  }
  await walk(directory)
  return lines.sort().join("\n")
}

/** A host that accepts the connection and never answers, for proving a request gives up. */
export async function hangingHost() {
  const sockets = []
  const server = createServer(() => {})
  server.on("connection", socket => sockets.push(socket))
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    downloadUrl: `${base}/download/RPGVault.zip`,
    close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve) }),
  }
}
