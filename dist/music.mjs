#!/usr/bin/env node
import sade from 'sade';
import http from 'http';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { stat, writeFile, readFile, rename, unlink } from 'fs/promises';
import slugify from 'slugify';
import { createWriteStream } from 'fs';
import EventEmitter from 'events';
import ms from 'ms';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

const URI_PATTERN = /^[a-zA-Z0-9]{22}$/;

const exec$1 = promisify(execFile);

function processEnded (proc) {
  return new Promise((resolve, reject) => {
    proc.once('error', reject);
    proc.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`Signal: ${signal}`))
      if (code) return reject(new Error(`Bad code: ${code}`))
      resolve();
    });
  })
}

function streamFinished (stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.on('finish', resolve);
  })
}

function normalizeUri (uri, prefix) {
  const coreUri = uri.replace(/.*[:/]/, '').replace(/\?.*$/, '');
  if (!URI_PATTERN.test(coreUri)) {
    throw new Error(`Bad URI: ${uri}`)
  }
  return `spotify:${prefix}:${coreUri}`
}

async function exists$1 (path) {
  try {
    await stat(path);
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

const DAEMON_PORT = 39705;
const DAEMON_COMMAND = '/home/alan/dev/spotweb/start';
const WORK_DIRECTORY = '/home/alan/music';

async function daemonPid ({ port = DAEMON_PORT } = {}) {
  return exec$1('fuser', [`${port}/tcp`]).then(
    ({ stdout }) => stdout.trim().split('/')[0],
    err => {
      if (err.code) return ''
      throw err
    }
  )
}

async function daemonStart$1 ({ cmd = DAEMON_COMMAND } = {}) {
  const [file, ...args] = cmd.split(' ');
  spawn(file, args, { detached: true, stdio: 'ignore' }).unref();
}

async function daemonStop$1 ({ port = DAEMON_PORT } = {}) {
  const pid = await daemonPid({ port });
  if (pid) await exec$1('kill', [pid]);
}

async function getAlbumMetadata (uri) {
  return getData({ path: `/album/${uri}` })
}

async function getTrackMetadata (uri) {
  return getData({ path: `/track/${uri}` })
}

function getPlayStream (uri) {
  return getResponse({ path: `/play/${uri}` })
}

function getStatus () {
  return getData({ path: '/status' })
}

async function getData (opts) {
  const response = await getResponse(opts);
  response.setEncoding('utf8');
  let data = '';
  for await (const chunk of response) {
    data += chunk;
  }
  return JSON.parse(data)
}

function getResponse ({ path, port = DAEMON_PORT } = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${port}${path}`, resolve)
      .once('error', reject)
      .end();
  }).then(
    res => {
      if (res.statusCode !== 200) {
        throw new Error(`${res.statusCode} - ${res.statusMessage}`)
      }
      return res
    },
    err => {
      if (err.code === 'ECONNREFUSED') throw new Error('Spotweb not running')
      throw err
    }
  )
}

const SONOS_PLAYER = '192.168.86.210';
const SONOS_PORT = 1400;

function albumArtUri (
  uri,
  { player = SONOS_PLAYER, port = SONOS_PORT } = {}
) {
  uri = normalizeUri(uri, 'track');
  return [
    `http://${player}:${port}`,
    '/getaa?s=1&u=',
    encodeURIComponent(
      [
        'x-sonos-spotify:',
        encodeURIComponent(uri),
        '?sid=9&flags=8224&sn=1'
      ].join('')
    )
  ].join('')
}

async function getAlbumArt (uri, destFile) {
  const coverData = await new Promise((resolve, reject) =>
    http
      .get(albumArtUri(uri), resolve)
      .once('error', reject)
      .end()
  ).then(res => {
    if (res.statusCode !== 200) {
      throw new Error(`${res.statusCode} - ${res.statusMessage}`)
    }
    return res
  });

  const fileStream = createWriteStream(destFile);
  coverData.once('error', err => fileStream.emit('error', err)).pipe(fileStream);

  await streamFinished(fileStream);
}

let FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM, isTTY=true;
if (typeof process !== 'undefined') {
	({ FORCE_COLOR, NODE_DISABLE_COLORS, NO_COLOR, TERM } = process.env);
	isTTY = process.stdout && process.stdout.isTTY;
}

const $ = {
	enabled: !NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== 'dumb' && (
		FORCE_COLOR != null && FORCE_COLOR !== '0' || isTTY
	)
};

function init(x, y) {
	let rgx = new RegExp(`\\x1b\\[${y}m`, 'g');
	let open = `\x1b[${x}m`, close = `\x1b[${y}m`;

	return function (txt) {
		if (!$.enabled || txt == null) return txt;
		return open + (!!~(''+txt).indexOf(close) ? txt.replace(rgx, close + open) : txt) + close;
	};
}
const red = init(31, 39);
const green = init(32, 39);
const yellow = init(33, 39);
const blue = init(34, 39);
const magenta = init(35, 39);
const cyan = init(36, 39);
const grey = init(90, 39);

const CSI = '\u001B[';
const CR = '\r';
const EOL = `${CSI}0K`;
const RE_DECOLOR = /(^|[^\x1b]*)((?:\x1b\[\d*m)|$)/g; // eslint-disable-line no-control-regex

function log (string, { newline = true, limitWidth } = {}) {
  if (log.prefix) {
    string = log.prefix + string;
  }
  if (limitWidth && log.width) {
    string = truncateToWidth(string, log.width);
  }
  const start = log.dirty ? CR + EOL : '';
  const end = newline ? '\n' : '';

  log.dirty = newline ? false : !!string;

  log.write(start + string + end);
}

Object.assign(log, {
  write: process.stdout.write.bind(process.stdout),

  status: string =>
    log(string, {
      newline: false,
      limitWidth: true
    }),

  prefix: '',

  width: process.stdout.columns,

  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  grey
});

process.stdout.on('resize', () => {
  log.width = process.stdout.columns;
});

function truncateToWidth (string, width) {
  const maxLength = width - 2; // leave two chars at end
  if (string.length <= maxLength) return string
  const parts = [];
  let w = 0;
  let full;
  for (const match of string.matchAll(RE_DECOLOR)) {
    const [, text, ansiCode] = match;
    if (full) {
      parts.push(ansiCode);
      continue
    } else if (w + text.length <= maxLength) {
      parts.push(text, ansiCode);
      w += text.length;
    } else {
      parts.push(text.slice(0, maxLength - w), ansiCode);
      full = true;
    }
  }
  return parts.join('')
}

const reporter$1 = new EventEmitter();
const report$1 = reporter$1.emit.bind(reporter$1);

reporter$1
  .on('spotrip.queue.start', uri => log(`Queue ${log.green(uri)}`))
  .on('spotrip.queue.done', name => {
    log('');
    log(`Queued ${log.cyan(name)} for ripping.`);
  })
  .on('spotrip.track.record.start', file => {
    const name = file.replace(/.*\//, '');
    log.prefix = `${log.green(name)} `;
    log.status('... ');
  })
  .on('spotrip.track.record.update', ({ percent, taken, eta }) =>
    log.status(`- ${percent}%  in ${ms(taken)}  eta ${ms(eta)}`)
  )
  .on('spotrip.track.record.done', ({ total, speed }) => {
    log.prefix += log.green(
      `- ${fmtDuration(total * 1e3)}  at ${speed.toFixed(1)}x`
    );
    log.status('');
  })
  .on('spotrip.track.convert.start', () => log.status(' ... converting'))
  .on('spotrip.track.convert.done', () => {
    log('');
    log.prefix = '';
  })
  .on('spotrip.album.record.start', md => {
    log(`Recording ${log.cyan(md.album)}`);
    log(`by ${log.cyan(md.albumArtist)}`);
    log(`from ${md.albumUri}`);
    log('');
  })
  .on('spotrip.album.record.done', () => log(''));

function fmtDuration (ms) {
  const secs = Math.round(ms / 1e3);
  const mn = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const sc = (secs % 60).toString().padStart(2, '0');
  return `${mn}:${sc}`
}

async function queueAlbum$1 (
  uri,
  { report = report$1, workDir = WORK_DIRECTORY } = {}
) {
  uri = normalizeUri(uri, 'album');
  report('spotrip.queue.start', uri);

  const album = await getAlbumMetadata(uri);
  let metadata = {
    ...albumTags(album),
    tracks: album.tracks.map(track => trackTags(track, album))
  };

  const mdFile = `${workDir}/work/${uri.replace(/.*:/, '')}.json`;
  const jpgFile = mdFile.replace(/json$/, 'jpg');
  await writeFile(mdFile, JSON.stringify(metadata, null, 2));

  await Promise.all([
    processEnded(spawn('vi', [mdFile], { stdio: 'inherit' })),
    getAlbumArt(metadata.tracks[0].trackUri, jpgFile)
  ]);

  // reread metadata
  metadata = JSON.parse(await readFile(mdFile, 'utf8'));
  const jobName = metadata.path.replace(/\//g, '_');

  // create work directory
  const destDir = `${workDir}/work/${jobName}`;
  await exec$1('mkdir', ['-p', destDir]);
  await rename(mdFile, `${destDir}/metadata.json`);
  await rename(jpgFile, `${destDir}/cover.jpg`);

  // queue work item
  const jobFile = `${workDir}/queue/${jobName}`;
  await writeFile(jobFile, `music spotrip ${destDir}`);

  report('spotrip.queue.done', jobName);
}

function albumTags (album) {
  const tags = {
    albumArtist: album.artist.name,
    album: album.name,
    genre: 'Classical',
    year: album.year,
    path: null,
    albumUri: album.uri
  };

  tags.path = slug(album.artist.name) + '/' + slug(album.name);

  const discTotal = countDiscs(album);

  if (discTotal > 1) {
    tags.discTotal = discTotal;
  }

  return tags
}

function slug (s) {
  const slugOpts = { remove: /[^\w\s_-]/ };
  return slugify(s, slugOpts)
}

function trackTags (track, album) {
  const tags = {
    title: track.name,
    artist: track.artists.map(a => a.name),
    trackNumber: track.number
  };

  const discTotal = countDiscs(album);
  const trackTotal = countTracks(album, track.disc);
  let file = 'track';

  if (discTotal > 1) {
    tags.discNumber = track.disc;
    file += track.disc;
  }

  const digits = trackTotal > 99 ? 3 : 2;
  file += track.number.toString().padStart(digits, '0');
  file += '.flac';
  tags.trackTotal = trackTotal;
  tags.trackUri = track.uri;
  tags.file = file;

  return tags
}

function countDiscs (album) {
  const discNumbers = album.tracks.map(t => t.disc).filter(Boolean);
  return uniq(discNumbers).length
}

function countTracks (album, discNumber) {
  return album.tracks.filter(t => t.disc === discNumber).length
}

function uniq (list) {
  return [...new Set(list)]
}

class Speedo {
  // Units:
  //  curr / total - things
  //  rate - things per second
  //  eta / taken - ms
  constructor ({ window = 10 } = {}) {
    this.windowSize = window;
    this.start = Date.now();
    this.readings = [[this.start, 0]];
  }

  update (data) {
    if (typeof data === 'number') data = { current: data };
    const { current, total } = data;
    if (total) this.total = total;
    this.readings = [...this.readings, [Date.now(), current]].slice(
      -this.windowSize
    );
    this.current = current;
  }

  get done () {
    return this.total && this.current >= this.total
  }

  rate () {
    if (this.readings.length < 2) return 0
    if (this.done) return (this.current * 1e3) / this.taken()
    const last = this.readings[this.readings.length - 1];
    const first = this.readings[0];
    return ((last[1] - first[1]) * 1e3) / (last[0] - first[0])
  }

  percent () {
    if (!this.total) return null
    return this.done ? 100 : Math.round((100 * this.current) / this.total)
  }

  eta () {
    if (!this.total || this.done) return 0
    const rate = this.rate();
    /* c8 ignore next */
    if (!rate) return 0
    return (1e3 * (this.total - this.current)) / rate
  }

  taken () {
    return this.readings[this.readings.length - 1][0] - this.start
  }
}

function progress (opts = {}) {
  const { onProgress, progressInterval, ...rest } = opts;
  let interval;
  let bytes = 0;
  let done = false;
  let error;

  const ts = new Transform({
    transform (chunk, encoding, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    },
    flush (cb) {
      if (interval) clearInterval(interval);
      done = true;
      reportProgress();
      cb(error);
    }
  });

  if (progressInterval) {
    interval = setInterval(reportProgress, progressInterval);
  }
  if (typeof onProgress === 'function') {
    ts.on('progress', onProgress);
  }

  ts.on('pipe', src =>
    src.on('error', err => {
      error = error || err;
      ts.emit('error', err);
    })
  );

  return ts

  function reportProgress () {
    if (!error) ts.emit('progress', { bytes, done, ...rest });
  }
}

function retry (fn, opts = {}) {
  return tryOne({ ...opts, fn, attempt: 1 })
}

function tryOne (options) {
  const {
    fn,
    attempt,
    retries = 10,
    delay = 1000,
    backoff = retry.exponential(1.5),
    onRetry
  } = options;
  return new Promise(resolve => resolve(fn())).catch(error => {
    if (attempt > retries) throw error
    if (onRetry) onRetry({ error, attempt, delay });
    return sleep(delay).then(() =>
      tryOne({ ...options, attempt: attempt + 1, delay: backoff(delay) })
    )
  })
}

retry.exponential = x => n => Math.round(n * x);

const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

const ONE_SECOND = 2 * 2 * 44100;
const FLAC_OPTIONS = [
  '--silent',
  '--force',
  '--force-raw-format',
  '--endian=little',
  '--channels=2',
  '--bps=16',
  '--sample-rate=44100',
  '--sign=signed',
  '--stdout'
];

async function recordTrack ({ report = report$1, uri, file }) {
  uri = normalizeUri(uri, 'track');
  const pcmFile = file.replace(/(\.flac)?$/, '.pcm');

  await retry(() => captureTrackPCM({ uri, file: pcmFile, onProgress }), {
    onRetry: data => report('spotrip.retry', data),
    retries: 5,
    delay: 60 * 1000
  });

  report('spotrip.track.convert.start');
  await processEnded(
    spawn('flac', [...FLAC_OPTIONS, `--output-name=${file}`, pcmFile])
  );
  await unlink(pcmFile);
  report('spotrip.track.convert.done');

  function onProgress (data) {
    if (!data.current) {
      report('spotrip.track.record.start', file);
    } else if (data.done) {
      report('spotrip.track.record.done', data);
    } else {
      report('spotrip.track.record.update', data);
    }
  }
}

async function captureTrackPCM ({ uri, file, onProgress }) {
  // send an initial progress marker
  onProgress({});

  // get track length
  const md = await getTrackMetadata(uri);
  const speedo = new Speedo({ window: 60 });
  speedo.total = 1 + md.duration / 1e3;

  // get stream
  const dataStream = await getPlayStream(uri);

  // progress
  const progress$1 = progress({
    progressInterval: 1000,
    onProgress ({ bytes, done }) {
      const current = bytes / ONE_SECOND;
      speedo.update({ current });
      if (done) speedo.total = current;
      onProgress({
        done,
        current,
        taken: speedo.taken(),
        percent: speedo.percent(),
        total: speedo.total,
        eta: speedo.eta(),
        speed: speedo.rate()
      });
    }
  });

  const fileStream = createWriteStream(file);

  await pipeline(dataStream, progress$1, fileStream);

  const { streamed, error } = await getStatus();
  if (!streamed || error) {
    throw new Error(`Recording of ${uri} failed: ${error}`)
  }
}

async function recordAlbum$1 ({ report = report$1, path }) {
  const md = JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'));

  report('spotrip.album.record.start', md);

  for (const track of md.tracks) {
    const file = `${path}/${track.file}`;
    if (!(await exists$1(file))) {
      await recordTrack({ report, file, uri: track.trackUri });
    }
  }

  report('spotrip.album.record.done');
}

const reporter = new EventEmitter();
function report (msg, payload) {
  reporter.emit(msg, payload);
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
  .on('replaygain.done', () => log('Album tags written'));
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

async function daemonStatus () {
  const pid = await daemonPid();
  report('daemon.status', pid);
}

async function daemonStart () {
  const pid = await daemonPid();
  if (pid) {
    report('daemon.status', pid);
  } else {
    await daemonStart$1();
    report('daemon.started');
  }
}

async function daemonStop () {
  const pid = await daemonPid();
  if (!pid) {
    report('daemon.status');
  } else {
    await daemonStop$1();
    report('daemon.stopped');
  }
}

async function queueAlbum (uri, { work }) {
  return queueAlbum$1(uri, { workDir: work })
}

async function recordAlbum (path) {
  return recordAlbum$1({ path })
}

const exec = promisify(execFile);

async function exists (path) {
  try {
    await stat(path);
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function readMetadata (path) {
  return JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'))
}

const RSYNC_OPTIONS = ['--times', '--recursive', '--omit-dir-times'];

async function checkoutAlbum (path, { work: workPath }) {
  if (path.startsWith(workPath)) return path

  const md = await readMetadata(path);
  const destPath = `${workPath}/work/${md.path.replace(/\//g, '_')}`;

  report('checkout.album.start', destPath);

  await exec('mkdir', ['-p', destPath]);
  await exec('rsync', [...RSYNC_OPTIONS, path + '/', destPath + '/']);

  report('checkout.album.done', destPath);
  return destPath
}

async function publishAlbum (path, { store: storePath }) {
  if (path.startsWith(storePath)) return

  const md = await readMetadata(path);
  const destPath = `${storePath}/${md.path}`;

  report('publish.album.start', destPath);

  await exec('mkdir', ['-p', destPath]);
  await exec('rsync', [...RSYNC_OPTIONS, path + '/', destPath + '/']);
  await exec('rm', ['-rf', path]);

  report('publish.album.done', destPath);
}

async function tagAlbum (path) {
  const md = await readMetadata(path);

  const coverFile = `${path}/cover.jpg`;
  const hasCover = await exists(coverFile);

  for (const track of md.tracks) {
    report('tag.track', track.file);
    const flacFile = `${path}/${track.file}`;
    await tagTrack(flacFile, md, track, hasCover && coverFile);
  }

  report('replaygain.start');
  await addReplayGain(md.tracks.map(track => `${path}/${track.file}`));
  report('replaygain.done');
}

async function tagTrack (file, album, track, cover) {
  if (cover) {
    await exec('metaflac', ['--remove', '--block-type=PICTURE', file]);
    await exec('metaflac', [`--import-picture-from=${cover}`, file]);
  }

  const tags = [...getTags(album), ...getTags(track)].reduce(
    (tags, tag) => [
      ...tags,
      `--remove-tag=${tag.split('=')[0]}`,
      `--set-tag=${tag}`
    ],
    []
  );

  await exec('metaflac', ['--no-utf8-convert', ...tags, file]);
}

async function addReplayGain (files) {
  await exec('metaflac', ['--add-replay-gain', ...files]);
  await Promise.all(files.map(convertReplayGain));
}

async function convertReplayGain (file) {
  const TAGS = 'TRACK_GAIN,TRACK_PEAK,ALBUM_GAIN,ALBUM_PEAK'
    .split(',')
    .map(x => 'REPLAYGAIN_' + x);

  const { stdout } = await exec('metaflac', [
    '--no-utf8-convert',
    ...TAGS.map(tag => '--show-tag=' + tag),
    file
  ]);

  const rg = stdout
    .split('\n')
    .filter(Boolean)
    .map(tag => tag.split('='))
    .reduce((o, [k, v]) => ({ ...o, [k]: v }), {});

  rg.REPLAYGAIN_TRACK_GAIN = rg.REPLAYGAIN_ALBUM_GAIN;
  rg.REPLAYGAIN_TRACK_PEAK = rg.REPLAYGAIN_ALBUM_PEAK;

  await exec('metaflac', [
    '--no-utf8-convert',
    ...Object.entries(rg).reduce(
      (args, [k, v]) => [...args, `--remove-tag=${k}`, `--set-tag=${k}=${v}`],
      []
    ),
    file
  ]);
}

function getTags (obj) {
  const EXCEPT_TAGS = new Set(['PATH', 'TRACKS', 'FILE']);

  return Object.entries(obj)
    .map(([k, v]) => [k.toUpperCase(), v])
    .filter(([k, v]) => !EXCEPT_TAGS.has(k))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(', ') : v}`)
}

const version = '1.0.0';

const prog = sade('music');

prog
  .version(version)
  .option('--work', 'working directory', '/home/alan/music')
  .option('--store', 'network store', '/nas/data/media/music/albums/Classical');

prog.command('spotweb status').action(daemonStatus);
prog.command('spotweb start').action(daemonStart);
prog.command('spotweb stop').action(daemonStop);
prog.command('queue <uri>').action(queueAlbum);
prog.command('spotrip <path>').action(spotripAlbum);
prog.command('checkout <path>').action(checkoutAlbum);
prog.command('publish <path>').action(publishAlbum);
prog.command('tag <path>').action(tagAlbum);
prog.command('tag publish <path>').action(tagPublishAlbum);

const parse = prog.parse(process.argv, { lazy: true });
if (parse) {
  const { handler, args } = parse;
  handler.apply(null, args).catch(err => {
    console.error('An unexpected error occured');
    console.error(err);
    process.exit(1);
  });
}

async function tagPublishAlbum (path, options) {
  await tagAlbum(path);
  await publishAlbum(path, options);
}

async function spotripAlbum (path, options) {
  await recordAlbum(path);
  await tagPublishAlbum(path, options);
}
