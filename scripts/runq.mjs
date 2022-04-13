#!/usr/bin/env node
import { join } from 'path'
import { readdir, stat, unlink } from 'fs/promises'

import sade from 'sade'

import exec from 'pixutil/exec'
import spawn from 'pixutil/spawn'
import sleep from 'pixutil/sleep'
import log from 'logjs'
import sortBy from 'sortby'

const DAY = 24 * 60 * 60 * 1000

sade('runq', true)
  .option('--queue', 'queue dir', '/home/alan/music/queue')
  .option('--on', 'start time', '8pm')
  .option('--off', 'end time', '8am')
  .action(opts => main(opts).catch(handle))
  .parse(process.argv)

function handle (err) {
  console.error(err)
  process.exit(1)
}

async function main ({ queue, on, off }) {
  log('Starting')
  while (true) {
    const nextOff = await calcNext(off)
    while (Date.now() < nextOff) {
      const item = await nextItem(queue)
      if (!item) break
      log(item)
      await spawn('bash', [item], { stdio: 'inherit' }).done
      await unlink(item)
    }
    const nextOn = await calcNext(on)
    log('Sleeping until next %s', on)
    await sleep(nextOn - Date.now())
  }
}

async function calcNext (timespec) {
  const { stdout } = await exec('date', ['-d', timespec, '+%s'])
  let dt = new Date(1e3 * parseInt(stdout))
  while (dt < Date.now()) dt = new Date(+dt + DAY)
  return dt
}

async function nextItem (dir) {
  const names = await readdir(dir)
  const data = await Promise.all(
    names.map(async name => {
      const path = join(dir, name)
      const { mtime } = await stat(path)
      return { path, mtime }
    })
  )
  return data.sort(sortBy('mtime')).map(({ path }) => path)[0]
}
