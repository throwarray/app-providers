const request = require('request')
const uuid = require('uuid')
const { promisify } = require('util')
const wrapProvider = require('../wrap-provider')

///////////////////////////
const APP_URL = process.env.APP_URL

// TODO unused deps rimraf, fluent-ffmpeg

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

function combineURLS(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL
}

async function getListItems (txt) {
  return new Map([...matchItems(txt)].map(function ({ url, params, title }) {
    const filename = uuid.v4()

    let poster = params.get('tvg-logo') || ''

    let item = {
      id: 'm3u-item-' + filename, // encodeURI(url.toString()),
      title: title || filename,
      tmdb_id: false,
      contentType: 'm3u8',
      src: combineURLS(APP_URL, '/api/stream?q=' + encodeURI(url)) // '/providers/m3u/storage/' + filename + '/stream.m3u8'
    }
    
    if (poster.startsWith('https://i.imgur.com/')) item.poster = poster
    
    return [filename, item]
  }))
}

module.exports = async function () {
  async function collection () {
    return {
      type: 'catalogue',
      id: 'm3u',
      items: [
        { 
          id: 'm3u-list-ca.m3u',
          title: 'CA',
          type: 'series',
          tmdb_id: false
        },
        { 
          id: 'm3u-list-us.m3u',
          title: 'US',
          type: 'series',
          tmdb_id: false
        },
        { 
          id: 'm3u-list-uk.m3u',
          title: 'UK',
          type: 'series',
          tmdb_id: false
        }
      ]
    }
  }
  
  async function streams () { }
  
  async function meta ({ query }) {
    const fetch = promisify(request)
    
    const matched = query.id.match(/^m3u-list-(.+)$/)
    
    if (!matched || !matched[1]) return

    const id = matched[1]

    const { body } = await fetch({ 
      url: `https://raw.githubusercontent.com/iptv-org/iptv/master/channels/${id}`, 
      gzip: true,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0'
      }
    })
  
    let itemsMap = await getListItems(body.toString('utf8'))
    
    const list = [...itemsMap.values()]

    if (!list.length) return

    return {
      id: query.id,
      type: 'series',
      title: query.id,
      season: 1,
      seasons: [
        { title: id, season: 1, items: list.map((item, i)=> {
          return {
            ...item,
            season: 1,
            episode: i
          }
        }) }
      ]
    }
  }
  
  const { router } = await wrapProvider({ collection, meta, streams })

  return router
}
