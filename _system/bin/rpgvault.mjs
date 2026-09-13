#!/usr/bin/env node
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile, access } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import process from 'node:process'
import os from 'node:os'

const exec = promisify(execFile)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const system = path.join(root, '_system')
const manifest = JSON.parse(await readFile(path.join(system, 'manifest.json'), 'utf8'))
const version = (await readFile(path.join(system, 'VERSION'), 'utf8')).trim()
const statePath = path.join(root, '.rpgvault', 'state.json')
const exists = async item => access(item).then(() => true).catch(() => false)
const readJson = async item => JSON.parse(await readFile(item, 'utf8'))
const writeJson = (item, value) => writeFile(item, `${JSON.stringify(value, null, 2)}\n`)
const rel = item => path.relative(root, item).split(path.sep).join('/')
const hash = text => createHash('sha256').update(text).digest('hex')
const managedPath = item => typeof item === 'string' ? item : item.path
const managedKeys = item => typeof item === 'string' ? null : item.keys

const files = async (directory, includeDirectories = false) => {
  if (!(await exists(directory))) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const item = path.join(directory, entry.name)
    if (entry.isDirectory()) return [...(includeDirectories ? [item] : []), ...(await files(item, includeDirectories))]
    return [item]
  }))
  return nested.flat()
}

const copyManagedObsidian = async () => {
  for (const item of manifest.managedObsidian) {
    const relative = managedPath(item)
    if (relative === 'plugins/table-tools/main.js') continue
    if (manifest.neverTouch.includes(`.obsidian/${relative}`)) continue
    const source = path.join(system, 'obsidian', relative)
    const target = path.join(root, '.obsidian', relative)
    await mkdir(path.dirname(target), { recursive: true })
    const keys = managedKeys(item)
    if (!keys) await cp(source, target)
    else {
      const sourceJson = await readJson(source)
      const targetJson = await exists(target) ? await readJson(target) : {}
      for (const key of keys) targetJson[key] = sourceJson[key]
      await writeJson(target, targetJson)
    }
  }
}

const sourceHash = async () => {
  const source = await files(path.join(system, 'plugin', 'src'))
  const records = []
  for (const item of source.sort()) records.push(`${rel(item)}:${(await readFile(item, 'utf8')).replace(/\r\n/g, '\n')}`)
  return hash(records.join('\n'))
}

const refreshPlugin = async () => {
  const source = path.join(system, 'plugin', 'main.js')
  const target = path.join(root, '.obsidian', 'plugins', 'table-tools', 'main.js')
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target)
  await cp(path.join(system, 'plugin', 'styles.css'), path.join(root, '.obsidian', 'plugins', 'table-tools', 'styles.css'))
  await writeJson(path.join(root, '.rpgvault', 'plugin-build.json'), { sourceHash: await sourceHash() })
}

const loadState = async () => (await exists(statePath)) ? readJson(statePath) : { installedVersion: null, appliedMigrations: [], installId: randomUUID(), adoptedFrom: null }

const init = async () => {
  for (const folder of manifest.folders) await mkdir(path.join(root, folder.path), { recursive: true })
  for (const contentRoot of manifest.contentRoots) await mkdir(path.join(root, contentRoot), { recursive: true })
  await mkdir(path.join(root, '.rpgvault'), { recursive: true })
  await copyManagedObsidian()
  const calendarSource = path.join(system, 'obsidian', 'plugins', 'calendarium', 'data.json')
  const calendarTarget = path.join(root, '.obsidian', 'plugins', 'calendarium', 'data.json')
  if (!(await exists(calendarTarget))) {
    await mkdir(path.dirname(calendarTarget), { recursive: true })
    await cp(calendarSource, calendarTarget)
  }
  await refreshPlugin()
  const state = await loadState()
  state.installedVersion ||= version
  state.installId ||= randomUUID()
  await writeJson(statePath, state)
  console.log(`initialised RPGVault ${version}`)
}

const frontmatter = text => Object.fromEntries([...text.matchAll(/^([A-Za-z][\w-]*):\s*(.+)$/gm)].map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]))
const contentFiles = async () => (await Promise.all(manifest.contentRoots.map(folder => files(path.join(root, folder))))).flat().filter(file => file.endsWith('.md'))

const doctor = async () => {
  const failures = []
  for (const folder of manifest.contentRoots) if (!(await exists(path.join(root, folder)))) failures.push(`missing content root: ${folder}`)
  const allowedDirectories = new Set(['_system', '_local', '.obsidian', '.rpgvault', '.git', '.github', 'docs', 'tests', 'node_modules', '.trash', ...manifest.contentRoots])
  const allowedFiles = new Set(['Active.md', 'Home.md', 'README.md', 'CHANGELOG.md', 'package.json', '.gitignore', '.gitattributes'])
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedDirectories.has(entry.name)) failures.push(`undeclared root: ${entry.name}`)
    if (entry.isFile() && !allowedFiles.has(entry.name)) failures.push(`undeclared root file: ${entry.name}`)
  }
  for (const item of manifest.managedObsidian) {
    const relative = managedPath(item)
    if (relative === 'plugins/table-tools/main.js') continue
    const source = path.join(system, 'obsidian', relative)
    const target = path.join(root, '.obsidian', relative)
    if (!(await exists(target))) {
      failures.push(`missing managed Obsidian artifact: .obsidian/${relative}`)
      continue
    }
    const keys = managedKeys(item)
    if (!keys && (await readFile(source, 'utf8')) !== (await readFile(target, 'utf8'))) failures.push(`managed Obsidian artifact differs: .obsidian/${relative}`)
    if (keys) {
      const sourceJson = await readJson(source)
      const targetJson = await readJson(target)
      for (const key of keys) if (JSON.stringify(sourceJson[key]) !== JSON.stringify(targetJson[key])) failures.push(`managed Obsidian key differs: .obsidian/${relative}:${key}`)
    }
  }
  const build = await exists(path.join(root, '.rpgvault', 'plugin-build.json')) ? await readJson(path.join(root, '.rpgvault', 'plugin-build.json')) : null
  if (!build || build.sourceHash !== await sourceHash()) failures.push('plugin build is stale')
  for (const rule of manifest.templateRules) if (!(await exists(path.join(system, 'templates', rule.template)))) failures.push(`missing template: ${rule.template}`)
  const templateNames = await files(path.join(system, 'templates'))
  const basenameCounts = new Map()
  for (const item of templateNames) {
    const body = await readFile(item, 'utf8')
    for (const match of body.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const target = match[1]
      if (manifest.contractualNames.includes(path.basename(target)) && !target.includes('/')) failures.push(`unqualified contractual embed in ${rel(item)}: ${target}`)
    }
  }
  const allContent = await contentFiles()
  for (const item of allContent) {
    const name = path.basename(item)
    basenameCounts.set(name, [...(basenameCounts.get(name) ?? []), item])
  }
  for (const [name, entries] of basenameCounts) if (entries.length > 1 && !manifest.contractualNames.includes(name)) failures.push(`duplicate basename: ${name}`)
  const bases = await files(path.join(system, 'bases'))
  const baseText = await Promise.all(bases.map(item => readFile(item, 'utf8')))
  for (const template of templateNames) {
    const type = frontmatter(await readFile(template, 'utf8')).type
    if (type && type !== 'home' && !baseText.some(body => body.includes(`type == "${type}"`))) failures.push(`template type has no base: ${type}`)
  }
  const systemFiles = [...await files(path.join(system, 'scripts')), ...await files(path.join(system, 'plugin', 'src'))]
  for (const item of systemFiles) {
    const body = await readFile(item, 'utf8')
    for (const match of body.matchAll(/(["'`])(_system\/[^"'`$]*)\1/g)) if (!manifest.runtimeReadOnlyAllowlist.includes(match[2])) failures.push(`runtime state path inside shipped layer in ${rel(item)}: ${match[2]}`)
    for (const match of body.matchAll(/(["'`])((?:_Shared|Library|Campaigns|Parties|Runs|Calendar)\/[A-Za-z0-9_.*${}/ -]+)\1/g)) {
      const literal = match[2].replace(/\$\{[^}]+\}/g, '*')
      if (!literal.includes('*') && !(await exists(path.join(root, literal)))) failures.push(`unresolved literal path in ${rel(item)}: ${literal}`)
    }
  }
  for (const item of await files(system)) {
    const relative = rel(item)
    if (relative.includes('/node_modules/')) continue
    if (manifest.asciiAllowlist.includes(relative)) continue
    if (/[^\x00-\x7F]/.test(relative) || /[^\x00-\x7F]/.test(await readFile(item, 'utf8'))) failures.push(`non-ASCII shipped file: ${relative}`)
  }
  for (const item of await files(root, true)) {
    const relative = rel(item)
    if (relative.startsWith('_system/') || relative.startsWith('_local/') || relative.startsWith('.git/') || relative.startsWith('.rpgvault/backups/')) continue
    if (['.gitkeep', '.rpgvault-keep'].includes(path.basename(item))) {
      const children = await readdir(path.dirname(item))
      const folder = rel(path.dirname(item))
      const insideContent = manifest.contentRoots.some(contentRoot => folder === contentRoot || folder.startsWith(`${contentRoot}/`))
      if (children.length === 1 && !insideContent && !manifest.contentRoots.includes(folder) && !manifest.folders.some(entry => entry.path === folder)) failures.push(`empty scaffold without declaration: ${folder}`)
    }
  }
  if (failures.length) {
    console.error(`RPGVault doctor found ${failures.length} violation(s):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else console.log(`RPGVault doctor: clean (${version})`)
}

const demoRoots = ['Campaigns', 'Parties', 'Runs', 'Library', 'Calendar']
const demoInstall = async () => {
  const source = path.join(system, 'demo')
  for (const item of await files(source)) {
    const target = path.join(root, path.relative(source, item))
    await mkdir(path.dirname(target), { recursive: true })
    await cp(item, target, { errorOnExist: false, force: true })
  }
  console.log('demo installed')
}

const demoRemove = async () => {
  let count = 0
  for (const item of await contentFiles()) {
    if (frontmatter(await readFile(item, 'utf8')).origin === 'demo') {
      await rm(item)
      count += 1
    }
  }
  const candidates = (await Promise.all(demoRoots.map(folder => files(path.join(root, folder), true)))).flat()
  const directories = []
  for (const candidate of candidates) if ((await stat(candidate)).isDirectory()) directories.push(candidate)
  for (const directory of directories.sort((a, b) => b.length - a.length)) if ((await readdir(directory)).length === 0) await rm(directory, { recursive: true })
  console.log(`removed ${count} demo notes`)
}

const demoStatus = async () => {
  let count = 0
  for (const item of await contentFiles()) if (frontmatter(await readFile(item, 'utf8')).origin === 'demo') count += 1
  console.log(`demo notes: ${count}`)
}

const migrationContext = dryRun => ({
  vaultRoot: root,
  dryRun,
  exists: async relative => exists(path.join(root, relative)),
  list: async relative => (await exists(path.join(root, relative))) ? (await readdir(path.join(root, relative), { withFileTypes: true })).map(entry => ({ name: entry.name, directory: entry.isDirectory() })) : [],
  glob: async () => contentFiles(),
  readFrontmatter: async relative => frontmatter(await readFile(path.join(root, relative), 'utf8')),
  readJson: async relative => readJson(path.join(root, relative)),
  writeJson: async (relative, value) => {
    if (!dryRun) await writeJson(path.join(root, relative), value)
  },
  writeFrontmatter: async (relative, fields) => {
    const item = path.join(root, relative)
    const body = await readFile(item, 'utf8')
    const next = body.replace(/^---[\s\S]*?---/, `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---`)
    if (!dryRun) await writeFile(item, next)
  },
  writeFile: async (relative, content) => {
    if (!dryRun) await writeFile(path.join(root, relative), content)
  },
  copyFile: async (from, to) => {
    if (!dryRun) await cp(path.join(root, from), path.join(root, to))
  },
  moveNote: async (from, to) => {
    const source = path.join(root, from)
    const target = path.join(root, to)
    await mkdir(path.dirname(target), { recursive: true })
    if (dryRun) return
    await rename(source, target)
    const sourceLink = from.replace(/\.md$/, '')
    const targetLink = to.replace(/\.md$/, '')
    for (const note of await contentFiles()) {
      const body = await readFile(note, 'utf8')
      const rewritten = body.replaceAll(`[[${sourceLink}`, `[[${targetLink}`)
      if (rewritten !== body) await writeFile(note, rewritten)
    }
  },
  removeEmpty: async relative => {
    const item = path.join(root, relative)
    if (!(await exists(item))) return false
    if (!(await stat(item)).isDirectory()) return false
    for (const entry of await readdir(item, { withFileTypes: true })) {
      if (entry.isDirectory()) await migrationContext(dryRun).removeEmpty(path.join(relative, entry.name))
      if (entry.isFile() && entry.name === '.gitkeep' && !dryRun) await rm(path.join(item, entry.name))
    }
    if ((await readdir(item)).length !== 0) return false
    if (!dryRun) await rm(item, { recursive: true })
    return true
  },
  remove: async relative => {
    if (!dryRun) await rm(path.join(root, relative), { recursive: true })
  },
  log: message => console.log(message)
})

const migrations = async dryRun => {
  const state = await loadState()
  const applied = new Set(state.appliedMigrations)
  for (const file of (await files(path.join(system, 'migrations'))).sort()) {
    const migration = await import(`file://${file}`)
    if (applied.has(migration.id)) continue
    const report = await migration.up(migrationContext(dryRun))
    console.log(JSON.stringify(report))
    if (!dryRun) state.appliedMigrations.push(migration.id)
  }
  if (!dryRun) {
    state.installedVersion = version
    await writeJson(statePath, state)
  }
}

const update = async args => {
  const dryRun = args.includes('--dry-run')
  const index = args.indexOf('--from')
  let from = index >= 0 ? path.resolve(args[index + 1]) : null
  if (!from) throw new Error('update requires --from <directory|zip>; network release lookup is intentionally not implicit')
  if (!(await exists(from))) throw new Error(`update source does not exist: ${from}`)
  let extracted = null
  if (from.endsWith('.zip')) {
    extracted = await mkdtemp(path.join(os.tmpdir(), 'rpgvault-update-'))
    await exec('unzip', ['-q', from, '-d', extracted])
    from = extracted
  }
  if (!(await exists(path.join(from, '_system')))) throw new Error(`update source has no _system directory: ${from}`)
  if (dryRun) {
    console.log(`would replace _system from ${from}`)
    await migrations(true)
    if (extracted) await rm(extracted, { recursive: true })
    return
  }
  const backup = path.join(root, '.rpgvault', 'backups', new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(backup, { recursive: true })
  await cp(path.join(root, '_system'), path.join(backup, '_system'), { recursive: true })
  await rm(path.join(root, '_system'), { recursive: true })
  await cp(path.join(from, '_system'), path.join(root, '_system'), { recursive: true })
  await exec('node', [path.join(root, '_system', 'bin', 'rpgvault.mjs'), 'finalize-update'], { cwd: root })
  if (extracted) await rm(extracted, { recursive: true })
}

const finalizeUpdate = async () => {
  await migrations(false)
  await copyManagedObsidian()
  await refreshPlugin()
  const state = await loadState()
  state.installedVersion = version
  await writeJson(statePath, state)
  await doctor()
}

const copyImportedFiles = async (source, destination) => {
  let count = 0
  for (const item of await files(source)) {
    const target = path.join(destination, path.relative(source, item))
    await mkdir(path.dirname(target), { recursive: true })
    await cp(item, target, { force: false, errorOnExist: false })
    count += 1
  }
  return count
}

const expandMapping = async (source, from, to) => {
  const segments = from.split('/').filter(Boolean)
  const walk = async (directory, index, captures) => {
    if (index === segments.length) return [[directory, captures]]
    const segment = segments[index]
    if (segment !== '*') {
      const next = path.join(directory, segment)
      return (await exists(next)) ? walk(next, index + 1, captures) : []
    }
    const entries = await readdir(directory, { withFileTypes: true })
    const matches = await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => walk(path.join(directory, entry.name), index + 1, [...captures, entry.name])))
    return matches.flat()
  }
  const matches = await walk(source, 0, [])
  return matches.map(([directory, captures]) => [directory, to.replace(/\*/g, () => captures.shift() ?? '')])
}

const adopt = async args => {
  const [sourceArgument, ...options] = args
  const mapIndex = options.indexOf('--map')
  const mapArgument = mapIndex >= 0 ? options[mapIndex + 1] : null
  if (!sourceArgument || !mapArgument) throw new Error('adopt requires <source-path> --map <mapping.json>')
  const source = path.resolve(sourceArgument)
  const mappingPath = path.resolve(mapArgument)
  if (!(await exists(source))) throw new Error(`adopt source does not exist: ${source}`)
  if (!(await exists(mappingPath))) throw new Error(`adopt map does not exist: ${mappingPath}`)
  const mapping = await readJson(mappingPath)
  if (!Array.isArray(mapping.folders)) throw new Error('adopt map requires a folders array')
  await init()
  const report = { folders: [], pluginKeys: [], calendar: false }
  for (const entry of mapping.folders) {
    if (typeof entry?.from !== 'string' || typeof entry?.to !== 'string') throw new Error('each folder mapping requires from and to strings')
    for (const [folder, targetRelative] of await expandMapping(source, entry.from, entry.to)) report.folders.push({ from: entry.from, to: targetRelative, files: await copyImportedFiles(folder, path.join(root, targetRelative)) })
  }
  for (const entry of mapping.pluginData ?? []) {
    if (typeof entry?.from !== 'string' || typeof entry?.to !== 'string' || !entry.keys || typeof entry.keys !== 'object') throw new Error('each plugin-data mapping requires from, to, and keys')
    const sourceData = path.join(source, entry.from)
    if (!(await exists(sourceData))) continue
    const imported = await readJson(sourceData)
    const target = path.join(root, '.obsidian', 'plugins', entry.to, 'data.json')
    const current = (await exists(target)) ? await readJson(target) : {}
    const names = []
    for (const [oldKey, newKey] of Object.entries(entry.keys)) {
      if (!Object.hasOwn(imported, oldKey) || typeof newKey !== 'string') continue
      const rewrites = entry.rewrites?.[newKey]
      current[newKey] = rewrites && typeof imported[oldKey] === 'string' && Object.hasOwn(rewrites, imported[oldKey]) ? rewrites[imported[oldKey]] : imported[oldKey]
      names.push(newKey)
    }
    for (const [parent, keyMap] of Object.entries(entry.nestedKeys ?? {})) {
      if (!current[parent] || typeof current[parent] !== 'object' || Array.isArray(current[parent]) || !keyMap || typeof keyMap !== 'object') continue
      const renamed = {}
      for (const [oldKey, newKey] of Object.entries(keyMap)) {
        if (!Object.hasOwn(current[parent], oldKey) || typeof newKey !== 'string') continue
        const rewrites = entry.nestedRewrites?.[parent]?.[newKey]
        renamed[newKey] = rewrites && typeof current[parent][oldKey] === 'string' && Object.hasOwn(rewrites, current[parent][oldKey]) ? rewrites[current[parent][oldKey]] : current[parent][oldKey]
        names.push(`${parent}.${newKey}`)
      }
      current[parent] = renamed
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeJson(target, current)
    report.pluginKeys.push({ plugin: entry.to, keys: names })
  }
  if (mapping.calendar?.from && mapping.calendar?.to) {
    const calendarSource = path.join(source, mapping.calendar.from)
    if (await exists(calendarSource)) {
      const calendarTarget = path.join(root, mapping.calendar.to)
      await mkdir(path.dirname(calendarTarget), { recursive: true })
      await cp(calendarSource, calendarTarget)
      report.calendar = true
    }
  }
  const state = await loadState()
  state.adoptedFrom = 'mapping'
  await writeJson(statePath, state)
  console.log(JSON.stringify(report))
  await doctor()
}

const [command, subcommand, ...arguments_] = process.argv.slice(2)
try {
  if (command === 'init') await init()
  else if (command === 'doctor') await doctor()
  else if (command === 'demo' && subcommand === 'install') await demoInstall()
  else if (command === 'demo' && subcommand === 'remove') await demoRemove()
  else if (command === 'demo' && subcommand === 'status') await demoStatus()
  else if (command === 'update') await update([subcommand, ...arguments_].filter(Boolean))
  else if (command === 'finalize-update') await finalizeUpdate()
  else if (command === 'adopt') await adopt([subcommand, ...arguments_].filter(Boolean))
  else throw new Error('usage: rpgvault init|doctor|update --from <dir> [--dry-run]|demo install|remove|status|adopt <source-path> --map <mapping.json>')
} catch (error) {
  console.error(`rpgvault: ${error.message}`)
  process.exitCode = 1
}
