import fs from 'node:fs/promises'
import path from 'node:path'
import { loadSystemPackage } from './context.mjs'

const frontmatter = text => Object.fromEntries([...text.matchAll(/^([A-Za-z][\w-]*):\s*([^\n]+)$/gm)].map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]))
const cap = (items, size = 15) => items.length > size ? [...items.slice(0, size), `and ${items.length - size} more`] : items
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const globPattern = value => new RegExp(`^${escaped(value).replace(/\\\*/g, '[^/]+')}(?:/|$)`)

const readNotes = async (vaultRoot, notes) => Promise.all(notes.map(async note => {
  const text = await fs.readFile(path.join(vaultRoot, note), 'utf8')
  return { note, text, meta: frontmatter(text) }
}))

const unresolvedLinks = parsed => {
  const known = new Set(parsed.map(({ note }) => note.replace(/\.md$/, '')))
  return parsed.flatMap(({ note, text }) => [...text.matchAll(/\[\[([^\]|#]+)/g)].map(match => match[1].trim()).filter(link => link.includes('/') && !known.has(link)).map(link => `${note} -> ${link}`))
}

export const renderRadar = async (vaultRoot, role, notes, system = 'generic') => {
  const parsed = await readNotes(vaultRoot, notes)
  if (role === 'player') {
    const claims = parsed.filter(({ meta }) => meta.type === 'claim')
    const conflicts = claims.filter(({ meta }, index) => claims.some((other, otherIndex) => index !== otherIndex && other.meta.about === meta.about && other.meta.what !== meta.what))
    return { role, conflicts: cap(conflicts.map(({ note }) => note)), stubs: [], unresolved: cap(unresolvedLinks(parsed)) }
  }
  const manifest = JSON.parse(await fs.readFile(path.join(vaultRoot, '_system', 'manifest.json'), 'utf8'))
  const referencePatterns = manifest.referenceFolders.map(globPattern)
  const packageDefinition = await loadSystemPackage(vaultRoot, system)
  const isReference = note => referencePatterns.some(pattern => pattern.test(note))
  const required = parsed.flatMap(({ note, meta }) => (packageDefinition.requiredFrontmatter?.[meta.type] ?? []).filter(field => !meta[field]).map(field => `${note}: ${field}`))
  const stubs = parsed.filter(({ note, text, meta }) => meta.type && !isReference(note) && text.length < 220).map(({ note }) => note)
  const dormant = parsed.filter(({ meta }) => meta.type === 'quest' && ['dormant', 'stalled'].includes(meta.status)).map(({ note }) => note)
  const byBasename = new Map()
  for (const { note } of parsed) {
    const name = path.basename(note)
    byBasename.set(name, [...(byBasename.get(name) ?? []), note])
  }
  const duplicates = [...byBasename].filter(([name, entries]) => entries.length > 1 && !manifest.contractualNames.includes(name)).map(([name]) => name)
  return { role, conflicts: [], stubs: cap(stubs), missingFields: cap(required), dormant: cap(dormant), duplicates: cap(duplicates), unresolved: cap(unresolvedLinks(parsed)) }
}
