#!/usr/bin/env node
import { readFile, stat } from 'fs/promises'
import { createWriteStream } from 'fs'
import { basename, dirname } from 'path'
import { finished } from 'stream/promises'
import sade from 'sade'

import log from 'logjs'
import filescan from 'filescan'
import exec from 'pixutil/exec'
import spawn from 'pixutil/spawn'

const options = {}

const prog = sade('make-mp3')
  .option('flac', 'Flac files', '/nas/data/media/music/albums/Classical')
  .option('mp3', 'MP3 files', '/nas/data/media/music/mp3')
  .option('work', 'Work dir', '/home/alan/music/work/mp3')

prog.command('list', 'list the albums that need making').action(async opts => {
  Object.assign(options, opts)
  for await (const album of findAlbums()) log(album.mp3File)
})

prog
  .command('make <album>', 'make the MP3 for an album')
  .action(async (path, opts) => {
    Object.assign(options, opts)
    await makeMp3(await readMetadata(path))
  })

prog
  .command('make all', 'makes all the MP3 that need doing')
  .action(async opts => {
    Object.assign(options, opts)
    for await (const album of findAlbums()) {
      await makeMp3(album)
    }
  })

const parsed = prog.parse(process.argv, { lazy: true })
if (parsed) {
  const { handler, args } = parsed
  handler(...args).catch(err => {
    console.error(err)
    process.exit(1)
  })
}

async function * findAlbums () {
  for await (const album of getAlbums()) {
    log.status(album.mp3File)
    if (!(await mp3FileExists(album))) yield album
  }
  log.status('')
}

async function * getAlbums () {
  const { flac: root } = options
  for await (const { path, stats } of filescan(root)) {
    if (!stats.isFile() || basename(path) !== 'metadata.json') continue
    yield readMetadata(dirname(path), stats)
  }
}

async function readMetadata (dir, stats) {
  const mdFile = `${dir}/metadata.json`
  const md = JSON.parse(await readFile(mdFile, 'utf8'))
  if (!stats) stats = await stat(mdFile)
  const { mtime } = stats
  const mp3File = md.path.replace(/\//g, '_') + '.mp3'
  const pcmFile = md.path.replace(/\//g, '_') + '.pcm'
  const files = dir => md.tracks.map(trk => `${dir}/${trk.file}`)
  return { src: dir, mtime, pcmFile, mp3File, files, ...md }
}

async function mp3FileExists ({ mp3File, mtime: mdDate }) {
  try {
    const { mtime: mp3Date } = await stat(`${options.mp3}/${mp3File}`)
    return mp3Date > mdDate
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}

async function makeMp3 (md) {
  log(`Making ${md.album} by ${md.albumArtist}`)

  await copyFlacFiles(md)
  await extractFlacFiles(md)
  await removeFlacFiles(md)
  await compressToMp3(md)
  await copyMp3File(md)

  log(`${md.mp3File} created`)
}

function copyFlacFiles (md) {
  return exec('cp', md.files(md.src).concat(options.work))
}

async function extractFlacFiles (md) {
  const args = [
    '--decode',
    '--stdout',
    '--force-raw-format',
    '--endian=little',
    '--sign=signed',
    ...md.files(options.work)
  ]
  const spawnArgs = { stdio: ['inherit', 'pipe', 'inherit'] }
  const pcmFile = `${options.work}/${md.pcmFile}`
  const flac = spawn('flac', args, spawnArgs)
  await finished(flac.stdout.pipe(createWriteStream(pcmFile)))
}

function removeFlacFiles (md) {
  return exec('rm', md.files(options.work))
}

async function compressToMp3 (md) {
  const args = [
    '-r',
    '-s',
    '44.1',
    '--little-endian',
    '--preset',
    'medium',
    '--tt',
    md.album,
    '--ta',
    md.albumArtist,
    '--tl',
    md.album,
    '--tn',
    '1/1',
    '--ti',
    `${md.src}/cover.jpg`,
    `${options.work}/${md.pcmFile}`,
    `${options.work}/${md.mp3File}`
  ]

  await spawn('lame', args, { stdio: 'inherit' }).done
}

async function copyMp3File (md) {
  await exec('rm', [`${options.work}/${md.pcmFile}`])
  await exec('mv', [
    `${options.work}/${md.mp3File}`,
    `${options.mp3}/${md.mp3File}`
  ])
}
