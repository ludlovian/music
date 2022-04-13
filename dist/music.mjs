#!/usr/bin/env node
import sade from 'sade';
import { spawn as spawn$1, execFile } from 'child_process';
import http from 'http';
import { promisify, format } from 'util';
import { writeFile, readFile, rename, unlink, stat } from 'fs/promises';
import slugify from 'slugify';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import EventEmitter from 'events';
import { format as format$1 } from '@lukeed/ms';

function spawn (...args) {
  const child = spawn$1(...args);
  child.done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.on('exit', (code, signal) => {
      /* c8 ignore next */
      if (signal) return reject(new Error(`Signal: ${signal}`))
      if (code) return reject(new Error(`Bad code: ${code}`))
      resolve();
    });
  });
  return child
}

const exec = promisify(execFile);

const DAEMON_PORT = 39705;
const DAEMON_COMMAND = '/home/alan/dev/spotweb/start';
const WORK_DIRECTORY = '/home/alan/music';

async function daemonPid ({ port = DAEMON_PORT } = {}) {
  return exec('fuser', [`${port}/tcp`]).then(
    ({ stdout }) => stdout.trim().split('/')[0],
    err => {
      if (err.code) return ''
      throw err
    }
  )
}

async function daemonStart$1 ({ cmd = DAEMON_COMMAND } = {}) {
  const [file, ...args] = cmd.split(' ');
  spawn$1(file, args, { detached: true, stdio: 'ignore' }).unref();
}

async function daemonStop$1 ({ port = DAEMON_PORT } = {}) {
  const pid = await daemonPid({ port });
  if (pid) await exec('kill', [pid]);
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

async function getResponse ({ path, port = DAEMON_PORT } = {}) {
  try {
    const p = new Promise((resolve, reject) => {
      console.log(`http://localhost:${port}${path}`);
      const req = http.get(
        `http://localhost:${port}${path}`,
        { family: 4 },
        resolve
      );
      req.once('error', reject).end();
    });
    const response = await p;
    const { statusCode: code, statusMessage: msg } = response;
    console.log({ code, msg });
    if (code !== 200) throw Object.assign(new Error(msg), { response })
    return response
  } catch (err) {
    console.log(err);
    if (err.code === 'ECONNREFUSED') throw new Error('Spotweb not running')
    throw err
  }
}

const URI_PATTERN = /^[a-zA-Z0-9]{22}$/;

function normalizeUri (uri, prefix) {
  const coreUri = uri.replace(/.*[:/]/, '').replace(/\?.*$/, '');
  if (!URI_PATTERN.test(coreUri)) {
    throw new Error(`Bad URI: ${uri}`)
  }
  return `spotify:${prefix}:${coreUri}`
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
  const res = await new Promise((resolve, reject) => {
    const req = http.get(albumArtUri(uri), resolve);
    req.once('error', reject).end();
  });

  if (res.statusCode !== 200) {
    throw new Error(`${res.statusCode} - ${res.statusMessage}`)
  }

  await pipeline(res, createWriteStream(destFile));
}

const allColours = (
  '20,21,26,27,32,33,38,39,40,41,42,43,44,45,56,57,62,63,68,69,74,75,76,' +
  '77,78,79,80,81,92,93,98,99,112,113,128,129,134,135,148,149,160,161,' +
  '162,163,164,165,166,167,168,169,170,171,172,173,178,179,184,185,196,' +
  '197,198,199,200,201,202,203,204,205,206,207,208,209,214,215,220,221'
)
  .split(',')
  .map(x => parseInt(x, 10));

const painters = [];

function makePainter (n) {
  const CSI = '\x1b[';
  const set = CSI + (n < 8 ? n + 30 + ';22' : '38;5;' + n + ';1') + 'm';
  const reset = CSI + '39;22m';
  return s => {
    if (!s.includes(CSI)) return set + s + reset
    return removeExcess(set + s.replaceAll(reset, reset + set) + reset)
  }
}

function painter (n) {
  if (painters[n]) return painters[n]
  painters[n] = makePainter(n);
  return painters[n]
}

// eslint-disable-next-line no-control-regex
const rgxDecolour = /(^|[^\x1b]*)((?:\x1b\[[0-9;]+m)|$)/g;
function truncate (string, max) {
  max -= 2; // leave two chars at end
  if (string.length <= max) return string
  const parts = [];
  let w = 0;
  for (const [, txt, clr] of string.matchAll(rgxDecolour)) {
    parts.push(txt.slice(0, max - w), clr);
    w = Math.min(w + txt.length, max);
  }
  return removeExcess(parts.join(''))
}

// eslint-disable-next-line no-control-regex
const rgxSerialColours = /(?:\x1b\[[0-9;]+m)+(\x1b\[[0-9;]+m)/g;
function removeExcess (string) {
  return string.replaceAll(rgxSerialColours, '$1')
}

function randomColour () {
  const n = Math.floor(Math.random() * allColours.length);
  return allColours[n]
}

const colours = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
};

const CLEAR_LINE = '\r\x1b[0K';

const state = {
  dirty: false,
  width: process.stdout && process.stdout.columns,
  /* c8 ignore next */
  level: process.env.LOGLEVEL ? parseInt(process.env.LOGLEVEL, 10) : undefined,
  write: process.stdout.write.bind(process.stdout)
};

process.stdout &&
  process.stdout.on('resize', () => (state.width = process.stdout.columns));

function _log (
  args,
  { newline = true, limitWidth, prefix = '', level, colour }
) {
  if (level && (!state.level || state.level < level)) return
  const msg = format(...args);
  let string = prefix + msg;
  if (colour != null) string = painter(colour)(string);
  if (limitWidth) string = truncate(string, state.width);
  if (newline) string = string + '\n';
  if (state.dirty) string = CLEAR_LINE + string;
  state.dirty = !newline && !!msg;
  state.write(string);
}

function makeLogger (base, changes = {}) {
  const baseOptions = base ? base._preset : {};
  const options = {
    ...baseOptions,
    ...changes,
    prefix: (baseOptions.prefix || '') + (changes.prefix || '')
  };
  const configurable = true;
  const fn = (...args) => _log(args, options);
  const addLevel = level => makeLogger(fn, { level });
  const addColour = c =>
    makeLogger(fn, { colour: c in colours ? colours[c] : randomColour() });
  const addPrefix = prefix => makeLogger(fn, { prefix });
  const status = () => makeLogger(fn, { newline: false, limitWidth: true });

  const colourFuncs = Object.fromEntries(
    Object.entries(colours).map(([name, n]) => [
      name,
      { value: painter(n), configurable }
    ])
  );

  return Object.defineProperties(fn, {
    _preset: { value: options, configurable },
    _state: { value: state, configurable },
    name: { value: 'log', configurable },
    level: { value: addLevel, configurable },
    colour: { value: addColour, configurable },
    prefix: { value: addPrefix, configurable },
    status: { get: status, configurable },
    ...colourFuncs
  })
}

const log = makeLogger();

const reporter$1 = new EventEmitter();
const report$1 = reporter$1.emit.bind(reporter$1);

let prefix;

reporter$1
  .on('spotrip.queue.start', uri => log(`Queue ${log.green(uri)}`))
  .on('spotrip.queue.done', name => {
    log('');
    log(`Queued ${log.cyan(name)} for ripping.`);
  })
  .on('spotrip.track.record.start', file => {
    const name = file.replace(/.*\//, '');
    prefix = log.green(name);
    log.status(prefix + ' ... ');
  })
  .on('spotrip.track.record.update', ({ percent, taken, eta }) =>
    log.status(
      [
        prefix,
        `- ${percent}% `,
        `in ${format$1(taken)} `,
        `eta ${format$1(eta)}`
      ].join(' ')
    )
  )
  .on('spotrip.track.record.done', ({ total, speed }) => {
    prefix += log.green(
      ` - ${fmtDuration(total * 1e3)}  at ${speed.toFixed(1)}x`
    );
    log.status(prefix);
  })
  .on('spotrip.track.convert.start', () =>
    log.status(prefix + ' ... converting')
  )
  .on('spotrip.track.convert.done', () => {
    log(prefix);
    prefix = '';
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
    spawn('vi', [mdFile], { stdio: 'inherit' }).done,
    getAlbumArt(metadata.tracks[0].trackUri, jpgFile)
  ]);

  // reread metadata
  metadata = JSON.parse(await readFile(mdFile, 'utf8'));
  const jobName = metadata.path.replace(/\//g, '_');

  // create work directory
  const destDir = `${workDir}/work/${jobName}`;
  await exec('mkdir', ['-p', destDir]);
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

function speedo ({
  total,
  interval = 250,
  windowSize = 40
} = {}) {
  let readings;
  let start;
  return Object.assign(transform, { current: 0, total, update, done: false })

  async function * transform (source) {
    start = Date.now();
    readings = [[start, 0]];
    const int = setInterval(update, interval);
    try {
      for await (const chunk of source) {
        transform.current += chunk.length;
        yield chunk;
      }
      transform.total = transform.current;
      update(true);
    } finally {
      clearInterval(int);
    }
  }

  function update (done = false) {
    if (transform.done) return
    const { current, total } = transform;
    const now = Date.now();
    const taken = now - start;
    readings = [...readings, [now, current]].slice(-windowSize);
    const first = readings[0];
    const wl = current - first[1];
    const wt = now - first[0];
    const rate = 1e3 * (done ? total / taken : wl / wt);
    const percent = Math.round((100 * current) / total);
    const eta = done || !total ? 0 : (1e3 * (total - current)) / rate;
    Object.assign(transform, { done, taken, rate, percent, eta });
  }
}

function progressStream ({
  onProgress,
  interval = 1000,
  ...rest
} = {}) {
  return async function * transform (source) {
    const int = setInterval(report, interval);
    let bytes = 0;
    let done = false;
    try {
      for await (const chunk of source) {
        bytes += chunk.length;
        yield chunk;
      }
      done = true;
      report();
    } finally {
      clearInterval(int);
    }

    function report () {
      onProgress && onProgress({ bytes, done, ...rest });
    }
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
  await exec('flac', [...FLAC_OPTIONS, `--output-name=${file}`, pcmFile]);
  await unlink(pcmFile);
  report('spotrip.track.convert.done');

  function onProgress (update) {
    const { done, speedo } = update;
    if (!speedo) return report('spotrip.track.record.start', file)

    const { taken, eta, percent, total, rate } = speedo;
    if (done) {
      report('spotrip.track.record.done', {
        total: total / ONE_SECOND,
        speed: rate / ONE_SECOND
      });
    } else {
      report('spotrip.track.record.update', { percent, taken, eta });
    }
  }
}

async function captureTrackPCM ({ uri, file, onProgress }) {
  // send an initial progress marker
  onProgress({});

  // get data size
  const md = await getTrackMetadata(uri);
  const speedo$1 = speedo({ total: (ONE_SECOND * (1 + md.duration)) / 1e3 });

  await pipeline(
    await getPlayStream(uri),
    speedo$1,
    progressStream({ onProgress, speedo: speedo$1 }),
    createWriteStream(file)
  );

  const { streamed, error } = await getStatus();
  if (!streamed || error) {
    throw new Error(`Recording of ${uri} failed: ${error}`)
  }
}

async function exists (file) {
  try {
    await stat(file);
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function recordAlbum$1 ({ report = report$1, path }) {
  const md = JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'));

  report('spotrip.album.record.start', md);

  for (const track of md.tracks) {
    const file = `${path}/${track.file}`;
    if (!(await exists(file))) {
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

async function readMetadata (path) {
  return JSON.parse(await readFile(`${path}/metadata.json`, 'utf8'))
}

const RSYNC_OPTIONS = ['--times', '--recursive', '--omit-dir-times', '--delete'];

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

const version = '1.2.0';

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
prog.command('backup').action(backup);
prog.command('backup mp3').action(backupMp3);

const p = prog.parse(process.argv, { lazy: true });
if (p) p.handler(...p.args).catch(handleError);

function handleError (err) {
  console.error(err);
  process.exit(1);
}

async function tagPublishAlbum (path, options) {
  await tagAlbum(path);
  await publishAlbum(path, options);
}

async function spotripAlbum (path, options) {
  await recordAlbum(path);
  await tagPublishAlbum(path, options);
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
