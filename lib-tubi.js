const NOOP = ()=> {}
const request = require('request')
const cookie = require('cookie')
const jar = request.jar()
const hasOwn = Object.prototype.hasOwnProperty

// Login with username and password
function login ({ username, password }, cb = NOOP) {
    request.post({ url: 'https://tubitv.com/oz/auth/login/', jar, json:true, gzip: true, body: { password, username } }, function (err, response, body) {
        if (!err && response.statusCode == 200 && body.token) {
            const { userId, name, email, fbId, hasPassword, token } = body

            cb(false, { userId, name, email, fbId, hasPassword, token })
        } 
        else cb(err || new Error('Unauthorized'))
    })
}

// Dispose session
function logout (cb = NOOP) { request({ url: 'https://tubitv.com/oz/auth/logout', gzip: true, jar }, function () { cb(false) }) }

// Login with cookies
function getCookies () { return cookie.parse(jar.getCookieString('https://tubitv.com')) }

function setCookies (cookies = {}) { 
    const baseUrl = 'https://tubitv.com'

    Object.keys(cookies).forEach(function (cookieName) {
        if (cookieName) jar.setCookie(request.cookie(`${cookieName}=${JSON.stringify(cookies[cookieName])}`), baseUrl)
    })
}

// Refresh session
function refresh (cb) {
    request({ url: 'https://tubitv.com/oz/auth/loadAuth', jar, json: true, gzip: true }, function (err, response, body) {
        if (!err && response.statusCode == 200) cb(false, body)
        else cb(err || new Error('Unauthorized'))
    })    
}

// Get media info //-> "video_resources":[{"manifest":{"url":"..."}}]
function mediaInfo (mediaId, cb = NOOP) {
    let id = Number(mediaId)

    if (String(id).length <= 4) id = '0' + id

    request({ url: `https://tubitv.com/oz/videos/${id}/content`, jar, json: true, gzip: true }, function (err, response, body) {
        if (!err && response.statusCode == 200) cb(false, body)
        else cb(err || 'Unauthorized')
    })
}

//  Get collection info for category. containerHash.weekly_watchlist.cursor is null when no more results in collection.
function collection ({ cursor = 0, /* skip n items */ limit = 50, container = 'weekly_watchlist', expand }, cb = NOOP) {
    const containerMatch = container.match(/^\w+$/)

    if (!containerMatch) return cb(new Error('Invalid container name'))
    
    const collection = containerMatch[0]

    let strEnd = ''

    if (expand === void 0 && cursor == 0) strEnd = '&expand=0'
    else if (expand !== void 0) strEnd = `&expand=${Number(expand)}`

    request({
        url: `https://tubitv.com/oz/containers/${collection}/content?parentId&cursor=${Number(cursor)}&limit=${Number(limit)}${strEnd}`,
        jar,
        gzip: true,
        json: true
    }, function (err, response, body) {
        if (!err && body.containersHash && hasOwn.call(body.containersHash, collection)) 
            cb(false, body)
        else cb(err || new Error('Invalid collection query'))
    })    
}


module.exports = {
    collection,
    mediaInfo,
    refresh,
    setCookies,
    getCookies,
    logout,
    login
}
