import { basename } from 'path'
import { promisify } from 'util'
import { execFile as execFile_ } from 'child_process'

const exec = promisify(execFile_)

const TAGS = [
  'TITLE',
  'TRACKNUMBER',
  'DISCNUMMBER',
  'TRACKTOTAL',
  'TOTALDISCS',
  'ALBUM',
  'ALBUMARTIST',
  'YEAR',
  'ARTIST',
  'GENRE'
]

main(process.argv.slice(2)).catch(err => {
  console.error(err)
  process.exit(1)
})

async function main (flacFiles) {
  const md = {}
  let trackNumber = 1
  for (const flacFile of flacFiles) {
    const tags = await readFileTags(flacFile)

    if (trackNumber === 1) {
      Object.assign(md, {
        albumArtist: tags.ALBUMARTIST || 'Unknown',
        album: tags.ALBUM || 'Unknown',
        genre: tags.GENRE || 'Classical',
        year: tags.YEAR,
        path: '',
        discTotal: tags.DISCTOTAL,
        tracks: []
      })
      md.path = `${slug(md.albumArtist)}/${slug(md.album)}`
    }

    md.tracks.push({
      title: tags.TITLE,
      artist: tags.ARTIST,
      trackNumber: trackNumber++,
      trackTotal: flacFiles.length,
      file: basename(flacFile)
    })
  }

  console.log(JSON.stringify(md, undefined, 2))
}

async function readFileTags (file) {
  const { stdout } = await exec('metaflac', [
    '--no-utf8-convert',
    ...TAGS.map(tag => `--show-tag=${tag}`),
    file
  ])
  return stdout
    .split('\n')
    .filter(Boolean)
    .reduce((tags, line) => {
      const [key, ...parts] = line.split('=')
      const value = parts.join('=').trim()
      return {
        ...tags,
        [key]: addValue(tags[key], value)
      }
    }, {})
}

function addValue (prev, value) {
  if (!prev) return value
  if (Array.isArray(prev)) return [...prev, value]
  return [prev, value]
}

function slug (s) {
  return s.replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}
