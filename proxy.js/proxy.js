const fetch = require('./fetch.js')
const AbortController = require('abort-controller')

function hasContentType (header_value = '', contentType = '') {
    if (!header_value) return

    const m = header_value.split(';')
    const needle = contentType.toLowerCase() 
    
    return !!m.find(function (n) { 
        return n && n.split(',').find(i => i.toLowerCase() === needle)
    })
}

module.exports = function ({ STREAM_PATH_VALID, STREAM_PATH_MANIFEST }) {
    const handleRoute = function (req, res) {
        const { q, ref, o } = req.query || {}
        const method = req.method
        const controller = new AbortController()
        const signal = controller.signal
        const requestedHeaders = req.headers['access-control-request-headers']

        const handleError = function (err) {
            res.status(err.status || 404)
            res.end('')
            controller.abort()
            console.warn('ERROR', err)
        }

        const pathname = ((typeof q === 'string' && q) || '').trim()
        
        if (!pathname) { 
            handleError(new Error('Invalid URL'))
            
            return
        }
        
        let requestUrl
        
        const headers = {
            DNT: 1,
            Connection: 'keep-alive',            
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0",
            'Accept-Encoding': 'gzip',
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
        }

        try {
            const urlObj = new URL(decodeURI(pathname))
            
            requestUrl = urlObj.toString()            
            
            const { protocol } = urlObj
            
            if (!(protocol === 'http:' || protocol === 'https:')) throw new Error('Invalid protocol')
            if (requestedHeaders) headers['access-control-request-headers'] = requestedHeaders
        } catch (err) {
            err.status = 500
            
            res.setHeader('access-control-allow-origin', '*')
            
            handleError(err)
            
            return
        }
        
        const cached = req.headers['if-none-match']
        const lang = req.headers['accept-language']
        const connection = req.headers['connection']
        const range = req.headers['range']
        
        if (cached) headers['if-none-match'] = cached
        if (lang) headers['accept-language'] = lang
        if (connection) headers.Connection = connection
        
        if (range) headers.range = range
        if (ref !== void 0) headers.Referer = decodeURIComponent(ref)
        // if (o !== void 0) headers.origin = decodeURIComponent(o)

        // Forward Request
        fetch(requestUrl, {
            headers, 
            compress: true,
            signal,
            method
        }).then(function (response) {
        
        console.log('PROXY REQUEST', method, requestUrl, response.status)

        res.setHeader('access-control-allow-origin', '*')
        
        if (!response.ok && requestedHeaders && req.method === 'OPTIONS') { //FIXME Options requests may fail likely due Origin'
            controller.abort()
            
            res.setHeader('access-control-allow-headers', requestedHeaders || 'range')
            res.status(200)
            res.end()
            
            return
        }
    
        if (requestedHeaders) res.setHeader('access-control-allow-headers', requestedHeaders || 'range')
        
        let isRedirect = false
        
        // Set Response Headers and status
        const rawHeaders = response.headers.raw()
        const allowedHeaders = [
            'accept-ranges',
            'content-length',
            'connection',
            'content-type',
            'content-range',
            // 'content-encoding',
            'cache-control',
            'expires',
            'location',
            'transfer-encoding',
            'access-control-request-headers',
            'etag'
        ]
        
        const refArg = ref === void 0 ? '' : 'ref=' + encodeURIComponent(ref)  + '&'
        const originArg = o === void 0 ? '' : 'o=' + encodeURIComponent(o)  + '&'
        
        allowedHeaders.forEach(headername => {
            if (response.headers.has(headername)) {
                const value =  response.headers.get(headername)
                
                if (headername === 'location') {
                    isRedirect = true
                    
                    res.setHeader('Location', `${STREAM_PATH_VALID}?${originArg}${refArg}q=` + encodeURIComponent(value)) // TODO handle relative paths?
                    
                    return
                }
                
                const values = rawHeaders[headername]
                
                if (Array.isArray(values)) {
                    values.forEach(function (value) {
                        res.setHeader(headername, value)
                    })
                }
                
                else res.setHeader(headername, value)
            } 
        })
        
        const statusCode = response.status
        
        res.status(statusCode)

        // Redirect and rewrite m3u8 files
        if (!isRedirect && hasContentType(response.headers.get('content-type'), 'application/x-mpegurl')) {
            console.log('REDIRECT STREAM')
            controller.abort()
            res.setHeader('Location', `${STREAM_PATH_MANIFEST}?${originArg}${refArg}q=` + q)
            res.end('')
            return
        }
        
        // Forward response
        response.body.on('data', function (chunk) { res.write(chunk/*, 'binary'*/) })

        response.body.once('end', function () {
            // const completed = response.complete
            // console.log('REQUEST END', method, requestUrl, response.status)

            res.end('')
        })
    }, handleError)
}

return handleRoute
}