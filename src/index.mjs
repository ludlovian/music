import sade from 'sade'

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

const parse = prog.parse(process.argv, { lazy: true })
if (parse) {
  const { handler, args } = parse
  handler.apply(null, args).catch(err => {
    console.error('An unexpected error occured')
    console.error(err)
    process.exit(1)
  })
}

async function tagPublishAlbum (path, options) {
  await tagAlbum(path, options)
  await publishAlbum(path, options)
}

async function spotripAlbum (path, options) {
  await recordAlbum(path, options)
  await tagPublishAlbum(path, options)
}
