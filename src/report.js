import EventEmitter from 'events'

import log from 'logjs'

const reporter = new EventEmitter()
export default function report (msg, payload) {
  reporter.emit(msg, payload)
}

reporter
  .on('daemon.started', () => log('spotweb started'))
  .on('daemon.stopped', () => log('spotweb stopped'))
  .on('daemon.status', pid =>
    log(pid ? `spotweb running as pid ${pid}` : 'spotweb not running')
  )
  .on('checkout.album.start', dir => log.status(`Copying to ${dir}`))
  .on('checkout.album.done', dir => log(`Copied to ${dir}`))
  .on('publish.album.start', path => log(`Storing to ${path}`))
  .on('publish.album.done', () => log('Stored'))
  .on('tag.track', name => log.status(`Tagging ${name}`))
  .on('replaygain.start', () => log.status('Calculating replay gain'))
  .on('replaygain.done', () => log('Album tags written'))
/*
  .on('track.capturing.start', name => {
    log.prefix = `${green(name)} `
    log.status('... ')
  })
  .on('track.capturing.update', ({ percent, taken, eta }) =>
    log.status(`- ${percent}%  in ${ms(taken)}  eta ${ms(eta)}`)
  )
  .on('track.capturing.done', ({ total, speed }) => {
    log.prefix += green(
      `- ${fmtDuration(total * 1e3)}  at ${speed.toFixed(1)}x`
    )
    log.status(' ')
  })
  .on('track.converting.start', () => log.status(' ... converting'))
  .on('track.converting.done', () => {
    log('')
    log.prefix = ''
  })
  .on('album.recording.start', md => {
    log(`Recording ${cyan(md.album)}`)
    log(`by ${cyan(md.albumArtist)}`)
    log(`from ${md.albumUri}`)
    log('')
  })
  .on('album.recording.done', () => log(''))
  .on('album.queue.start', uri => log(`Queue ${green(uri)}`))
  .on('album.queue.done', name => log(`\nQueued ${cyan(name)} for ripping`))
  .on('retry', ({ delay, error }) => {
    console.error(
      `\nError occured: ${error ? error.message : 'Unknown'}\nWaiting ${ms(
        delay
      )} to retry...`
    )
  })
  .on('extract.mp3.track.start', name => log.status(`${name} extracting`))
  .on('extract.mp3.track.convert', name => log.status(`${name} converting`))
  .on('extract.mp3.track.done', track => log(green(track)))
  .on('extract.mp3.album.done', () => log('\nExtracted'))
  .on('extract.flac.track', track => log(green(track)))
  .on('extract.flac.album', () => log('\nExtracted'))
  .on('extract.wav.track.convert', name => log.status(`${name} converting`))
  .on('extract.wav.track', track => log(green(track)))
  .on('extract.wav.album', () => log('\nExtracted'))

function fmtDuration (ms) {
  const secs = Math.round(ms / 1e3)
  const mn = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0')
  const sc = (secs % 60).toString().padStart(2, '0')
  return `${mn}:${sc}`
}
*/