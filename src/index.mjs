import sade from 'sade'
import spawn from 'pixutil/spawn'

import {
  daemonStatus,
  daemonStart,
  daemonStop,
  queueAlbum,
  recordAlbum
} from './spotrip.mjs'
import { checkoutAlbum, publishAlbum } from './moveAlbum.mjs'
import { tagAlbum } from './tag.mjs'

const version = '__VERSION__'

const prog = sade('music')

prog
  .version(version)
  .option('--work', 'working directory', '/home/alan/music')
  .option('--store', 'network store', '/nas/data/media/music/albums/Classical')

prog.command('spotweb status').action(daemonStatus)
prog.command('spotweb start').action(daemonStart)
prog.command('spotweb stop').action(daemonStop)
prog.command('queue <uri>').action(queueAlbum)
prog.command('spotrip <path>').action(spotripAlbum)
prog.command('checkout <path>').action(checkoutAlbum)
prog.command('publish <path>').action(publishAlbum)
prog.command('tag <path>').action(tagAlbum)
prog.command('tag publish <path>').action(tagPublishAlbum)
prog.command('backup').action(backup)
prog.command('backup mp3').action(backupMp3)

const p = prog.parse(process.argv, { lazy: true })
if (p) p.handler(...p.args).catch(handleError)

function handleError (err) {
  console.error(err)
  process.exit(1)
}

async function tagPublishAlbum (path, options) {
  await tagAlbum(path, options)
  await publishAlbum(path, options)
}

async function spotripAlbum (path, options) {
  await recordAlbum(path, options)
  await tagPublishAlbum(path, options)
}

function backup (opts) {
  return spawn(
    'node',
    [
      '/home/alan/bin/s3cli',
      'sync',
      '/nas/data/media/music/albums/Classical',
      's3://backup-media-readersludlow/Classical',
      '-d',
      ...(opts._ || [])
    ],
    { stdio: 'inherit' }
  ).done.catch(handleError)
}

function backupMp3 (opts) {
  return spawn(
    'node',
    [
      '/home/alan/bin/s3cli',
      'sync',
      '/nas/data/media/music/mp3',
      's3://media-readersludlow/public/mp3',
      '-d',
      ...(opts._ || [])
    ],
    { stdio: 'inherit' }
  ).done.catch(handleError)
}
