import { readMetadata, exists, exec } from './util'
import report from './report'

export async function tagAlbum (path) {
  const md = await readMetadata(path)

  const coverFile = `${path}/cover.jpg`
  const hasCover = await exists(coverFile)

  for (const track of md.tracks) {
    report('tag.track', track.file)
    const flacFile = `${path}/${track.file}`
    await tagTrack(flacFile, md, track, hasCover && coverFile)
  }

  report('replaygain.start')
  await addReplayGain(md.tracks.map(track => `${path}/${track.file}`))
  report('replaygain.done')
}

async function tagTrack (file, album, track, cover) {
  if (cover) {
    await exec('metaflac', ['--remove', '--block-type=PICTURE', file])
    await exec('metaflac', [`--import-picture-from=${cover}`, file])
  }

  const tags = [...getTags(album), ...getTags(track)].reduce(
    (tags, tag) => [
      ...tags,
      `--remove-tag=${tag.split('=')[0]}`,
      `--set-tag=${tag}`
    ],
    []
  )

  await exec('metaflac', ['--no-utf8-convert', ...tags, file])
}

async function addReplayGain (files) {
  await exec('metaflac', ['--add-replay-gain', ...files])
  await Promise.all(files.map(convertReplayGain))
}

async function convertReplayGain (file) {
  const TAGS = 'TRACK_GAIN,TRACK_PEAK,ALBUM_GAIN,ALBUM_PEAK'
    .split(',')
    .map(x => 'REPLAYGAIN_' + x)

  const { stdout } = await exec('metaflac', [
    '--no-utf8-convert',
    ...TAGS.map(tag => '--show-tag=' + tag),
    file
  ])

  const rg = stdout
    .split('\n')
    .filter(Boolean)
    .map(tag => tag.split('='))
    .reduce((o, [k, v]) => ({ ...o, [k]: v }), {})

  rg.REPLAYGAIN_TRACK_GAIN = rg.REPLAYGAIN_ALBUM_GAIN
  rg.REPLAYGAIN_TRACK_PEAK = rg.REPLAYGAIN_ALBUM_PEAK

  await exec('metaflac', [
    '--no-utf8-convert',
    ...Object.entries(rg).reduce(
      (args, [k, v]) => [...args, `--remove-tag=${k}`, `--set-tag=${k}=${v}`],
      []
    ),
    file
  ])
}

function getTags (obj) {
  const EXCEPT_TAGS = new Set(['PATH', 'TRACKS', 'FILE'])

  return Object.entries(obj)
    .map(([k, v]) => [k.toUpperCase(), v])
    .filter(([k, v]) => !EXCEPT_TAGS.has(k))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(', ') : v}`)
}
