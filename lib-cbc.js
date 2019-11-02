const req = require('request')
const cheerio = require('cheerio')

function hasValidStatusCode (response) { return response.statusCode >= 200 && response.statusCode <= 400 }

const request = req.defaults({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
        'DNT': '1'
    },
})

const Gem = {}

Gem.loginLocalLoginRadius = function (username, password, cb) {
    request({
        url: 'https://api.loginradius.com/identity/v2/auth/login',
        json: true,
        qs: { apikey: '3f4beddd-2061-49b0-ae80-6f1f2ed65b37' }, // TODO
        headers: {
            'Host': 'api.loginradius.com',
            'Referer': 'https://gem.cbc.ca/login',
            'Origin': 'https://gem.cbc.ca'
        },
        body: { email: username, password },
        method: 'POST'
    }, function (err, response, body) {
        const isResponseError = err || !hasValidStatusCode(response) || typeof body !== 'object' || !body.access_token

        if (isResponseError) {
            cb(new Error('loginLocalLoginRadius: Invalid response'))

            return
        }

        cb(null, {
            expires_in: body.expires_in,
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            Profile: body.Profile
        })
    })
}

Gem.registerDevice = function (cb) {
    request({
        url: ' https://api-cbc.cloud.clearleap.com/cloffice/client/device/register',
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'text/plain;charset=UTF-8',
            'Content-Length': '93',
            'Host': 'api-cbc.cloud.clearleap.com',
            'Origin': 'https://gem.cbc.ca',
            'Referer': 'https://gem.cbc.ca/login'
        },
        body: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<device>\n  <type>web</type>\n</device>',
        method: 'POST'
    }, function (err, response) {
        let $

        if (err || !hasValidStatusCode(response)) {
            cb(new Error('registerDevice: Invalid response'))

            return
        }

        try { $ = cheerio.load(response.body, { xmlMode: true }) } catch (e) { $ = null }

        if ($) {
            const deviceId = $('deviceId').text()
            const deviceToken = $('deviceToken').text()

            if (deviceId && deviceToken) { 
                cb(null, { deviceId, deviceToken })

                return
            }
        }

        cb(new Error('registerDevice: Invalid response'))
    })
}

Gem.loginRadiusToken = function ({ access_token, apikey = '3f4beddd-2061-49b0-ae80-6f1f2ed65b37' }, cb) {
    request({
        url: 'https://cloud-api.loginradius.com/sso/jwt/api/token',
        qs: {
            access_token,
            apikey,
            jwtapp: 'jwt'
        },
        headers: {
            Host: 'cloud-api.loginradius.com',
            Origin: 'https://gem.cbc.ca',
            Referer: 'https://gem.cbc.ca/login'
        },
        json: true
    }, function (err, response) {
        if (err || !hasValidStatusCode(response) || !response.body.signature) {
            cb(new Error('loginRadiusToken:Invalid response'))

            return
        }

        cb(null, { signature: response.body.signature })
    })
}

Gem.loginClearleap = function ({ signature, deviceId }, cb) {
    request({
        url: 'https://api-cbc.cloud.clearleap.com/cloffice/client/device/login',
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'application/xml',
            'Host': 'api-cbc.cloud.clearleap.com',
            'Origin': 'https://gem.cbc.ca',
            'Referer': 'https://gem.cbc.ca/login',
        },
        body: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<login>\n  <token>' + signature + '</token>\n  <device>\n    <deviceId>' + deviceId + '</deviceId>\n    <type>web</type>\n  </device>\n</login>',
        method: 'POST'
    }, function (err, response) {
        if (err || !hasValidStatusCode(response)) return cb(new Error('loginClearleap: Invalid response'))

        let $

        try { $ = cheerio.load(response.body, { xmlMode: true }) } catch (e) { $ = null }

        if ($) {
            const token = $('token').text()
            const identityGuid = $('identityGuid').text()
            if (token && identityGuid) return cb(null, { token, identityGuid })
        }

        cb(new Error('loginClearleap: Invalid response'))
    })
}

Gem.loginCBC = function ({ identityGuid }, cb) {
    request({
        url: 'https://uie.data.cbc.ca/v0/login',
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'text/plain;charset=UTF-8',
            Host: 'uie.data.cbc.ca',
            Origin: 'https://gem.cbc.ca',
            Referer: 'https://gem.cbc.ca/login'
        },
        method: 'POST',
        'body': '{"@context":{"cbc":"http://vocab.data.cbc.ca/"},"cbc:loginradius_id":["'+ identityGuid + '"]}',
    }, function (err, response) {
        if (err || !hasValidStatusCode(response)) 
            return cb(new Error('loginCBC: Invalid response'))

        let body

        try { body = JSON.parse(response.body) } catch (e) { body = null }
        
        if (!body || !(body = body['cbc:cbc_plus_id']) || !Array.isArray(body) || !body.length || !(body = body[0])) {
            return cb(new Error('loginCBC: Invalid response'))
        }

        cb(null, { plusId: body })
    })
}



Gem.loginLocal = function (username, password, cb) {
    Gem.loginLocalLoginRadius(username, password, function (err, body) {
        if (err) return cb(err)
        
        const { access_token, refresh_token, Profile = {} } = body

        Gem.registerDevice(function (err, { deviceToken, deviceId }) {
            if (err) return cb(err)

            Gem.loginRadiusToken({ access_token }, function (err, body) {
                if (err) return cb(err)
                
                const { signature } = body

                Gem.loginClearleap({ signature, deviceId }, function (err, body) {
                    if (err) return cb(err)

                    const { identityGuid, token } = body

                    Gem.loginCBC({ identityGuid: identityGuid || Profile.Uid }, function (err, { plusId }) {
                        if (err) return cb(err)

                        cb(null, {
                            plusId,
                            identityGuid,
                            token,
                            signature,
                            deviceId,
                            deviceToken,
                            access_token,
                            refresh_token,
                            Profile
                        })
                    })
                })
            })
        })
    })
}

Gem.profileClearleap = function  ({ deviceId, token }, cb) {
    request({
        gzip: true,
        url: 'https://api-cbc.cloud.clearleap.com/cloffice/client/account',
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'X-Clearleap-DeviceId': deviceId,
            'X-Clearleap-DeviceToken': token,
            Host: 'api-cbc.cloud.clearleap.com',
            Origin: 'https://gem.cbc.ca',
            Referer: 'https://gem.cbc.ca/login'
        }
    }, function (err, response) {
        if (err || !hasValidStatusCode(response)) return cb(new Error('profileClearleap: Invalid response'))

        cb(null, response.body) // XML
    })
}

module.exports = Gem