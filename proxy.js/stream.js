const { URL, parse : parseURL } = require('url')
const { dirname, extname } = require('path')
const { ParseStream: M3U8ParseStream } = require('m3u8-parser')
const cheerio = require('cheerio')
const assert = require('assert')
const fetch = require('./fetch.js')
const AbortController = require('abort-controller')

async function textRequest (requestUrl, options) {
    let response

    try { 
        response = await fetch(requestUrl, options) 

        if (!response.ok) throw new Error('Invalid response')

        const data = await response.text()

        return {
            body: data,
            response
        }
    } catch (e) {
        if (response) e.status = response.status

        throw e
    }
}

function isWebUrl (pathname) {
    const urlObj = new URL(pathname.toString())

    const { protocol } = urlObj
    
    if ((protocol === 'http:' || protocol === 'https:')) return true

    return false
}    


function isUrlRelative (uri) {
    const parsed = parseURL(uri)

    if (parsed.protocol === null && !parsed.pathname.endsWith('/')) return true
    
    else return false
}

function getBaseFromURL (uri) {
    const parsed = new URL(uri)
    const pathname = parsed.pathname

    if (pathname) {
        const name = dirname(pathname)
        const url = new URL(name, parsed.origin).toString()
        
        return url.endsWith('/') ? url : url + '/'
    }
}

function shouldAccumulateUri (url) {
    return url && (url.protocol === 'http:' || url.protocol === 'https:')
}

// REWRITE URLS IN M3U8
// NOTE https://github.com/videojs/m3u8-parser Some tags are unsupported by the parser and the URL property is unchanged
// NOTE Add response headers

module.exports = function (settings) {
    return function (req, res) {
        const query = req.query    
        
        const { ref, q: pathname, o, t = 'hls' } = query

        const headers = {
            'Accept-Encoding': 'gzip',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
            DNT: 1
        }
    
        res.setHeader('Access-Control-Allow-Origin', '*')
    
        function handleError (err) {
            if (err) console.warn('Error', err)

            res.status(err && err.status || 500)
            res.end('')
        }

        let urlObj

        try {
            urlObj = new URL(decodeURI(pathname))
    
            const { protocol } = urlObj
            
            if (!(protocol === 'http:' || protocol === 'https:')) throw new Error('Invalid protocol')
            if (ref !== void 0) headers.Referer = decodeURIComponent(ref)
            if (o !== void 0) headers.Origin = decodeURIComponent(o)
        } catch (e) {
            handleError(e)

            return
        }
        
        const requestUrl = urlObj.toString()
        const controller = new AbortController()
        const signal = controller.signal
        const timeout = setTimeout(function () { controller.abort() }, 10000)

        console.log('PROXY STREAM REQUEST', requestUrl)

        textRequest(requestUrl, {
            headers,
            compress: true,
            signal,
            method: 'GET'
        }).then(function ({ response, body }) {
            res.status(response.status || 500)

            if (t === 'hls') {
                const manifest = modify.hls(settings, requestUrl, body, ref, o)
                
                if (!manifest) {
                    handleError(new Error('Invalid m3u8 response'))
    
                    return
                }

                res.type('application/x-mpegurl')
                res.end(manifest)
            }

            else if (t === 'dash') {
                const manifest = modify.dash(settings, requestUrl, body, ref, o)

                if (!manifest) {
                    handleError(new Error('Invalid mpd response'))
    
                    return
                }

                res.setHeader('content-type', 'application/dash+xml')
                res.end(manifest)
            }

            else throw new Error('Invalid manifest type')
        }).catch(handleError).then(function () {
            clearTimeout(timeout)
            controller.abort()
        })
    }
}

const modify = {
    hls (settings, manifestURL, data, ref, o) {
        const base = getBaseFromURL(manifestURL)
        const lines = Array.isArray(data) && data || data.split('\n')
        const parseStream = new M3U8ParseStream()
        const output = []       
        const {
            STREAM_PATH_INVALID,
            STREAM_PATH_VALID,
            STREAM_PATH_MANIFEST
        } = settings

        if (!lines.length || (lines.length === 1 && !lines[0])) return ''
    
        function proxyURL (uri_input, base = STREAM_PATH_INVALID) { 
            let obj
    
            const uri = uri_input.replace(/^\/\//, 'http://')
    
            try {
                if (base && !base.endsWith('/')) base = base + '/'    
                if (isUrlRelative(uri)) obj = new URL(uri, base) // .replace(/^\//, '')
                else obj = new URL(uri)
            } catch (e) {
                obj = null
            }
    
            if (!obj || !shouldAccumulateUri(obj)) { 
                obj = new URL(STREAM_PATH_INVALID)
    
                return obj
            }
    
            const ext = extname(obj.pathname)
            const refArg = ref === void 0 ? '' : 'ref=' + encodeURIComponent(ref)  + '&'
            const originArg = o === void 0 ? '' : 'o=' + encodeURIComponent(o)  + '&'
    
            obj = new URL('?' + originArg + refArg + 'q=' + encodeURIComponent(obj.toString()), 
                ext === '.m3u8'?
                STREAM_PATH_MANIFEST: // modify manifiest
                STREAM_PATH_VALID // cors proxy
            )
    
            return obj
        }
    
        parseStream.on('data', function (node) {
            const attributes = node && node.attributes
            const elem = output[output.length - 1]
    
            if (node.type === 'uri') elem.data = proxyURL(node.uri, base)
    
            else if (attributes && attributes.URI) {
                let joined = Object.entries(attributes).map(function ([key, value]) {
                    if (typeof value === 'object') {
                        if (key === 'RESOLUTION') value = `${value.width}x${value.height}`
    
                        else if (key === 'IV') 
                        {
                            value = '0x' + Array.prototype.slice.call(value).map(function (v) { // was Uint32Array
                                return v.toString(16).padStart(8, 0)
                            }).join('')
                        } else {
                            console.warn('FIXME UNSUPPORTED TAG ->', key)
    
                            return
                        }
                    }
    
                    else if (key === 'URI') value = proxyURL(value, base)
                    
                    return `${key}=${value}`
                }).join(',')
    
                if (elem.title) joined = joined + ',' + elem.title
    
                elem.data =  joined.length? elem.tag + ':' + joined : elem.data
            } 
            
            else if (elem.tag || node.type === 'comment') return
            
            else if (elem.data) {
                elem.data = proxyURL(elem.data, base)
            }
        })
    
        lines.forEach(function (line) {
            const trimmed = (line || '').trim()
            const matched = trimmed.match(/^(#[^:]*)(:.*)?$/)
            const item = { data: line, tag: matched && matched[1] } 
    
            output.push(item)
            
            parseStream.push(trimmed)
        })
    
        return output.map(({ data }) => data).join('\n')
    },
    dash (settings, manifestURL, data, ref, o) {
        console.log('WHATS DATA', data)

        const $ = cheerio.load(data.toString('utf8'), { xmlMode: true })
        const root = $('MPD')
        const bases = root.find('> BaseURL')
        const segment_bases = root.find('> * BaseURL')
        const source_attributes = root.find('[sourceURL]')
        const has_base = bases.length >= 1
        const first = has_base && bases.first().text()    
        const manifest_base = getBaseFromURL(manifestURL)
    
        function modifyDashPath (path, base_path) {
            try {
                const output = new URL(path, base_path).toString()
                const refArg = ref === void 0 ? '' : 'ref=' + encodeURIComponent(ref)  + '&'
                const originArg = o === void 0 ? '' : 'o=' + encodeURIComponent(o)  + '&'

                assert.strictEqual(isWebUrl(output), true, `url must be web ready ${path}`)
                
                return new URL(
                    '?' + originArg + refArg + 'q=' + encodeURIComponent(output), 
                    settings.STREAM_PATH_VALID
                ).toString()
            } catch (e) {
                return 'about:blank'
            }
        }

        let base_path
        
        // Modify root BaseURL
        if (has_base) {
            const { protocol } = parseURL(first)
            
            base_path = has_base && getBaseFromURL(!protocol? 
                new URL(first, manifest_base).toString() : 
                first
            )
        
            bases.first().text(modifyDashPath(base_path, manifest_base))
        }
        
        // Fallback to baseURL from manifest url
        else { 
            base_path = manifest_base
            //has_base = true
    
            root.prepend(`<BaseURL>${base_path}</BaseURL>`)
        }
        
        // assert.strictEqual(root.length, 1, 'found multiple mpd tags')
        assert.strictEqual(bases.length <= 1, true, 'found multiple BaseURL tags at MPD root')
        assert.strictEqual(isWebUrl(base_path), true, `base url must be web ready ${base_path}`)
        // assert.strictEqual(base_path.endsWith('/'), true, `base url must end with / got     ${base_path}`)
        
        console.log('USE BASE', base_path)
    
        // Modify segment BaseURL tags
        segment_bases.each(function () {
            const elem = $(this)
            const edited = modifyDashPath(elem.text(), base_path)
        
            elem.text(edited)
        })
        
        // Modify sourceURL attributes
        source_attributes.each(function () {
            const elem = $(this)
            const url = elem.attr('sourceURL')
            elem.attr('sourceURL', modifyDashPath(url, base_path))
        })
    
        $('SegmentTemplate').each(function () {
            /*
            Modify SegementTemplate media and initialization attributes
            Example: <SegmentTemplate 
                timescale="10000000" 
                media="QualityLevels($Bandwidth$)/Fragments(video=$Time$,format=mpd-time-csf)" 
                initialization="QualityLevels($Bandwidth$)/Fragments(video=i,format=mpd-time-csf)">
            */
    
            // const elem = $(this)
            // const media = elem.attr('media')
            // const initialization = elem.attr('initialization')
            
            // if (media !== void 0) elem.attr('media', modifyDashPath(media, base_path))
            
            // if (initialization !== void 0) elem.attr('initialization', modifyDashPath(initialization, base_path))
        })
        
    
    
        return $.xml()
    }
}
