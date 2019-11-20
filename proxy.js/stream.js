const request = require('request')
const { URL, parse : parseURL } = require('url')
const { dirname, extname } = require('path')
const { ParseStream: M3U8ParseStream } = require('m3u8-parser')

function isUrlRelative (uri) {
    const parsed = parseURL(uri)
    
    if (parsed.protocol === null) return true
}

function getBaseFromURL (uri) {
    const parsed = new URL(uri)
    const pathname = parsed.pathname

    if (pathname) {
        parsed.pathname = dirname(pathname)

        return parsed.toString()
    }
}

function combineURLS(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL
}

function shouldAccumulateUri (url) {
    return url && (url.protocol === 'http:' || url.protocol === 'https:')
}

// REWRITE URLS IN M3U8
// NOTE https://github.com/videojs/m3u8-parser Some tags are unsupported by the parser and the URL property is unchanged

module.exports = function ({
    STREAM_PATH_INVALID,
    STREAM_PATH_VALID,
    STREAM_PATH_MANIFEST,
    SERVER_PROTOCOL = 'http://'
}) {
    function modifyManifest (streampath, lines) {
        const base = getBaseFromURL(streampath)
        const parseStream = new M3U8ParseStream()
        const output = []
    
        if (!lines.length || (lines.length === 1 && !lines[0])) return ''

        function proxyURL (uri_input, base = STREAM_PATH_INVALID) { 
            let obj

            const uri = uri_input.replace(/^\/\//, SERVER_PROTOCOL)
    
            try {
                if (isUrlRelative(uri)) obj = new URL(combineURLS(base, uri))
                
                else obj = new URL(uri)
            } catch (e) {
                obj = null
            }
    
            if (!obj || !shouldAccumulateUri(obj)) { 
                obj = new URL(STREAM_PATH_INVALID)
    
                return obj
            }
    
            const ext = extname(obj.pathname)
    
            obj = new URL('?q=' + encodeURIComponent(obj.toString()), 
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
                        
                        else {
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
    }

    return function (req, res) {
        const query = req.query
    
        const { ref, q: pathname } = query
    
        res.setHeader('Access-Control-Allow-Origin', '*')
    
        function handleError (err) {
            console.warn('Error', err)

            res.status(err.status || 500)
            res.end('')
        }
    
        try {
            const urlObj = new URL(decodeURI(pathname))
    
            const requestUrl = urlObj.toString()
    
            const { protocol } = urlObj
            
            if (!(protocol === 'http:' || protocol === 'https:')) throw new Error('Invalid protocol')
    
            const headers = {
                'Accept-Encoding': 'gzip',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
                DNT: 1
            }

            if (ref !== void 0) headers.Referer = ref
    
            console.log('PROXY STREAM REQUEST', requestUrl)
    
            request({
                url: requestUrl,
                headers,
                gzip: true
            }, function (err, response) {
                if (err || (response.statusCode < 200 || response.statusCode >= 400)) 
                {
                    err = err || new Error('Invalid response')
                    err.status = response.statusCode
                    handleError(err)
    
                    return
                }
    
                const lines = response.body.toString().split('\n')
                const manifest = modifyManifest(requestUrl, lines)
                
                if (!manifest) {
                    handleError(new Error('Invalid response'))
    
                    return
                }

                res.type('application/x-mpegurl')
                res.end(manifest)
            })
        } catch (e) {
            handleError(e)
        }
    }
}
