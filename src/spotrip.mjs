import {
  daemonPid as spotwebPid,
  daemonStart as spotwebStart,
  daemonStop as spotwebStop,
  queueAlbum as queueSpotifyAlbum,
  recordAlbum as recordSpotifyAlbum
} from 'spotrip'

import report from './report.mjs'

export async function daemonStatus () {
  const pid = await spotwebPid()
  report('daemon.status', pid)
}

export async function daemonStart () {
  const pid = await spotwebPid()
  if (pid) {
    report('daemon.status', pid)
  } else {
    await spotwebStart()
    report('daemon.started')
  }
}

export async function daemonStop () {
  const pid = await spotwebPid()
  if (!pid) {
    report('daemon.status')
  } else {
    await spotwebStop()
    report('daemon.stopped')
  }
}

export async function queueAlbum (uri, { work }) {
  return queueSpotifyAlbum(uri, { workDir: work })
}

export async function recordAlbum (path) {
  return recordSpotifyAlbum({ path })
}
