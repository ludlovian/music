import { stat, readFile } from 'fs/promises'
import { promisify } from 'util'
import { execFile as execFile_ } from 'child_process'

export const exec = promisify(execFile_)

export async function exists (path) {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

export async function readMetadata (path) {
  return JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'))
}
