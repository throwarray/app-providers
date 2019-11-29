// TODO replace localhost proxy

const CryptoJS = require('crypto-js')

const cheerio = require('cheerio')

const request = require('request')

const { promisify } = require('util')

const fetch = promisify(request)

const { URL } = require('url')

function isWebURL (urlStr) {
    try {
        const url = new URL(urlStr)

        return (url.protocol === 'http:' || url.protocol === 'https:' || false)
    } catch (e) {
        return false
    }
}

const E = {
    m:256,
    d:function(r, t){
        const e = JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(r))),
            o = CryptoJS.enc.Hex.parse(e.salt),
            p = CryptoJS.enc.Hex.parse(e.iv),
            a = e.ciphertext

        let S = parseInt(e.iterations); S<=0&&(S=999);

        const i = this.m / 4, n = CryptoJS.PBKDF2(t, o, {
            hasher:CryptoJS.algo.SHA512,keySize:i/8,
            iterations:S
        });
        
        return CryptoJS.AES.decrypt(a, n, { mode:CryptoJS.mode.CBC, iv:p }).toString(CryptoJS.enc.Utf8)
    }
}

const func = function(content) { 
    const matches = (content || '').match(/=\s*\r*E.d\('([^)]+)',\s*\r*'([^)]+)'\)/m)
    const [,a, b] = matches || []

    if (a && b) return E.d(a, b)

    return null
}

async function collection ({ query = {} }) {
    const { id, page = 1 } = query

    const ref = 'http://123tvnow.com/category/united-states-usa/'
    const response = await fetch({
        url: 'http://123tvnow.com/wp-admin/admin-ajax.php',
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            'Accept': 'text/html, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': ref
        },
        method: 'POST',
        form: {
            action: '_123tv_load_more_videos_from_category',
            cat_id: 1,
            page_num: page - 1
        }
    })
    
    const $ = cheerio.load(response.body)
    const channels = $('.video-wrapper')
    const items = []

    channels.each(function () {
        const elem = $(this)
        const videoId = elem.attr('data-id')
        const thumb = elem.find('.video-thumb img').attr('src')
        const titleAnchor = elem.find('.video-title a')
        const title = titleAnchor.find('.entry-title').text()
        // const isLive = elem.find('.video-thumb .video-duration.isLive')
        
        let url; try { url = new URL(titleAnchor.attr('href')) } catch (e) { return }

        const pathname = url.pathname.replace(/\/$/, '')
        const parts = pathname.split('/')
        const uri = parts[parts.length - 1]

        if (videoId) items.push({
            id: 'tv_123tv-' + uri,
            poster: 'https://localhost:3001/api/proxy/?q=' + encodeURIComponent(thumb) + '&ref=' + encodeURIComponent(ref),
            title,
            tmdb_id: false,
            type: 'movie'
        })
    })

    if (!items.length) return

    return {
        id,
        page,
        items: items
    }
}

async function meta ({ query = {} }) {
    const { id = '' } = query
    
    const matches = id.match(/^tv_123tv-(.+)$/)

    if (!matches) { 
        console.warn('Invalid item id')

        return
    }

    const url = `http://123tvnow.com/watch/${matches[1]}/`

    let html
    
    try { html = await fetch({
        url,
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            'Accept': 'text/html, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'http://123tvnow.com/category/united-states-usa/',
            //'Origin': 'http://123tvnow.com'
        }
    }) } catch (e) {
        console.log('Failed to fetch', e)

        return
    }

    const $ = cheerio.load(html.body)
    const head = $('head')
    const title = head.find('title').text()
    const description = head.find('meta[name="description"]').attr('content')
    
    let poster = head.find('meta[name="twitter:image"]').attr('content') //.replace(/-[0-9]+x[0-9]+/g,'')
    
    let msg, payload

    if (!isWebURL(poster)) poster = void 0

    //.content script ?
    $('script').each(function () {
        const script = $(this)
        const text = script.html()
        const [, data] = text && text.match(/='\?1&json=([^']+)';/m) || []
        
        if (!payload) payload = data

        if (!msg && text) { 
            const url = func(text)

            if (!isWebURL(url)) return
            
            msg = url
        }
    })


    if (!msg || !payload) {
        const embedSrc = $('.video-player').find('iframe[allowFullScreen]').attr('src').replace(/^\/\//, 'https://')
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            Referer: embedSrc,
            Origin: 'https://ok.ru/'
        }

        console.log('EMBED SRC', embedSrc)

        if (embedSrc.startsWith('https://ok.ru/')) {
            const response = await fetch(embedSrc, { headers })
            const text = response.body
            const $ = cheerio.load(text)
            const meta = JSON.parse(JSON.parse($('[data-module="OKVideo"]').attr('data-options')).flashvars.metadata)
            const streamURL = new URL(meta.hlsMasterPlaylistUrl.replace(/^\/\//, 'https://')).toString()

            if (!isWebURL(streamURL)) return

            else return {
                id,
                title,
                description,
                poster: poster && ('https://localhost:3001/api/proxy/?q=' + encodeURIComponent(poster) + '&ref=' + encodeURIComponent(url)),
                src: 'https://localhost:3001/api/stream/?q=' + encodeURIComponent(streamURL) + '&ref=' + encodeURIComponent(headers.Referer) + '&o=' + encodeURIComponent(headers.Origin),
                contentType: 'm3u8'
            }
        }
    
        return
    }

    const response = await fetch({
        url: msg + '?1&json=' + payload,
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            'Accept': 'text/html, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': url
        },
        json: true
    })
    
    const body = response.body

    let streamURL

    if (Array.isArray(body)) {
        const found = body.find(stream=> stream && stream.type === 'hls')
        
        if (found) streamURL = found.file
    } else if (typeof body === 'string') streamURL === body

    if (!isWebURL(streamURL)) return

    else return {
        id,
        title,
        description,
        poster: poster && ('https://localhost:3001/api/proxy/?q=' + encodeURIComponent(poster) + '&ref=' + encodeURIComponent(url)),
        src: 'https://localhost:3001/api/stream/?q=' + encodeURIComponent(streamURL) + '&ref=' + encodeURIComponent(url),
        contentType: 'm3u8'
    }
}

module.exports = {
    collection,
    meta,
    streams: async function () {}
}
