import { readFile } from 'fs/promises'

export async function readMetadata (path) {
  return JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'))
}
