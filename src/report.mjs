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
  .on('extract.mp3.track.start', name => log.status(`${name} extracting`))
  .on('extract.mp3.track.convert', name => log.status(`${name} converting`))
  .on('extract.mp3.track.done', track => log(green(track)))
  .on('extract.mp3.album.done', () => log('\nExtracted'))
  .on('extract.flac.track', track => log(green(track)))
  .on('extract.flac.album', () => log('\nExtracted'))
  .on('extract.wav.track.convert', name => log.status(`${name} converting`))
  .on('extract.wav.track', track => log(green(track)))
  .on('extract.wav.album', () => log('\nExtracted'))
*/
