import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

export const resolveOverride = async (vaultRoot, internalPath) => {
  const normalized = internalPath.replace(/^\/+/, '')
  const local = path.join(vaultRoot, '_local', normalized)
  try {
    await access(local, constants.R_OK)
    return local
  } catch {
    return path.join(vaultRoot, '_system', normalized)
  }
}
