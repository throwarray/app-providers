// ext dep
const request = require('request')
const express = require('express')
const ffmpeg = require('fluent-ffmpeg')
const rimraf = require('rimraf')
const uuid = require('uuid')

const fs = require('fs')
const { promisify } = require('util')
const path = require('path')
const wrapProvider = require('../wrap-provider')

///////////////////////////
// options
const assetPath = path.join(__dirname, './storage')
const ffmpegPath = process.env.FFMPEG_PATH || path.join(__dirname, './ffmpeg.exe')

ffmpeg.setFfmpegPath(ffmpegPath)

///////////////////////////

function* matchParams (input) {
  const reg = /((?:\w-?)+)(?:(?:,|\s|$)|=(?:"([^"]*)")|(\w*))(?:,|\s|$)/g
  
  let meta_matches; do {
    meta_matches = reg.exec(input)
 
    if (meta_matches) {
      const [, keyname, value] = meta_matches

      yield [keyname, value === void 0? true : value]
    }
  } while (meta_matches)
}

function* matchItems (input) {
  const reg = /\n#EXTINF:(-?\d+(?:\.\d+)?)(?:\s|,)(.*)\n([^#].+)/g
  
  let matches; do {
    matches = reg.exec(input)
    
    if (matches) {
      let url
      const [, duration, meta, urlparam] = matches

      let [,protocol] = (urlparam).match(/^(\w+:)/)
      
      const split = meta.split(',')
      const title = split[(split.length || 1) - 1]
      
      if (protocol === 'localhost:') protocol = null
           
      try { url = new URL(!protocol? 'http://' + urlparam: urlparam) } catch (e) { url = null }

      // Yield valid url
      if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
        yield {
          title, 
          duration, 
          url, 
          params: new Map([...matchParams(meta)]) 
        }
      }
    }
  } while (matches)
}

async function getListItems (txt) {
  return new Map([...matchItems(txt)].map(function ({ url, params, title }) {
    const filename = uuid.v4()

    let poster = params.get('tvg-logo') || ''

    let item = {
      id: 'm3u-item-' + encodeURI(url.toString()),
      title: title || filename,
      tmdb_id: false,
      contentType: 'm3u8',
      src: '/providers/m3u/storage/' + filename + '/stream.m3u8'
    }
    
    if (poster.startsWith('https://i.imgur.com/')) item.poster = poster
    
    return [filename, item]
  }))
}

module.exports = async function () {
  // FIXME not on server start
  const fetch = promisify(request)
  const { body } = await fetch({ 
    url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/channels/ca.m3u', 
    gzip: true,
    headers: {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0'
    }
  })

  let itemsMap = await getListItems(body.toString('utf8'))

  async function collection () {
    return {
      type: 'catalogue',
      id: 'm3u',
      items: [
        { 
          id: 'm3u-list',
          title: 'm3u list',
          type: 'series',
          tmdb_id: false
        }
      ]
    }
  }
  
  async function streams () { }
  
  async function meta ({ query }) {
    if (query.id === 'm3u-list') {
      return {
        id: 'm3u-list',
        type: 'series',
        title: 'm3u list',
        season: 1,
        seasons: [
          { title: 'ca', season: 1, items: [...itemsMap.values()].map((item, i)=> {
            return {
              ...item,
              season: 1,
              episode: i
            }
          }) }
        ]
      }
    }
  }
  
  const wrote = new Map()
  const { router } = await wrapProvider({ collection, meta, streams })

  setInterval(function () {
    wrote.forEach(function ({ command, iat, uid }) {
      const now = Date.now()
      const diff = now - iat

      if (diff >= 10000) {
        command.kill()
        wrote.delete(uid)
        rimraf(path.join(assetPath, './' + uid + '/'), function () {
          console.log('DESTROY!', uid)
        })
      }
    })
  }, 1000)

  router.get('/storage/:uid/stream.m3u8', function (req, res, next) {
    const uid = req.params.uid

    if (itemsMap.has(uid) && !wrote.has(uid)) {
      const { id, title } = itemsMap.get(uid)
      const src = decodeURI(id.replace(/^m3u-item-/, ''))
      const destination = path.join(assetPath, './' + uid + '/stream.m3u8')

      fs.mkdir(path.join(assetPath, './' + uid), function () {
          const command = ffmpeg()
          .input(src)
          .format('hls')
          .outputOptions([ // https://ffmpeg.org/ffmpeg-formats.html
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments'
          ])
          .output(destination)
          .once('start', function () { 
              setTimeout(function () {
                console.log('stream ready')
                next()
              }, 5000) // FIXME
          })
          .once('end', function () { next() })
          .once('error', function () { next() })
  
          command.run()
          wrote.set(uid, { iat: Date.now(), command, uid })
  
          console.log('TRANSCODE', uid, src, title, destination)
      })
    } else {
      next()
    }
  }, function (req, res, next) {
    const uid = req.params.uid
    const meta = wrote.get(uid)

    if (meta) meta.iat = Date.now()

    next()
  }, function (req, res) {
    const uid = req.params.uid
    res.type('application/x-mpegurl')
    res.sendFile(path.join(assetPath, './' + uid + '/stream.m3u8'))
  })

  router.use('/storage', express.static(assetPath))

  return router
}
