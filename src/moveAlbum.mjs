import exec from 'pixutil/exec'

import report from './report.mjs'
import { readMetadata } from './util.mjs'

const RSYNC_OPTIONS = ['--times', '--recursive', '--omit-dir-times', '--delete']

export async function checkoutAlbum (path, { work: workPath }) {
  if (path.startsWith(workPath)) return path

  const md = await readMetadata(path)
  const destPath = `${workPath}/work/${md.path.replace(/\//g, '_')}`

  report('checkout.album.start', destPath)

  await exec('mkdir', ['-p', destPath])
  await exec('rsync', [...RSYNC_OPTIONS, path + '/', destPath + '/'])

  report('checkout.album.done', destPath)
  return destPath
}

export async function publishAlbum (path, { store: storePath }) {
  if (path.startsWith(storePath)) return

  const md = await readMetadata(path)
  const destPath = `${storePath}/${md.path}`

  report('publish.album.start', destPath)

  await exec('mkdir', ['-p', destPath])
  await exec('rsync', [...RSYNC_OPTIONS, path + '/', destPath + '/'])
  await exec('rm', ['-rf', path])

  report('publish.album.done', destPath)
}
