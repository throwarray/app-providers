const request = require('request')
const { promisify } = require('util')
const fetch = promisify(request)

async function getSources (contentId, options) { 
    // i.e: https://edge.api.brightcove.com/playback/v1/accounts/1632712407/videos/6098745110001
    
    const { referrer, accountId, policyKey } = options

    const response = await fetch({
        url: `https://edge.api.brightcove.com/playback/v1/accounts/${accountId}/videos/${contentId}`,
        headers: {
            'accept':`application/json;pk=${policyKey}`,
            'accept-language':'en-US,en;q=0.9',
            'BCOV-Policy': policyKey,
            'Referer': referrer 
        },
        method:'GET',
        json: true
    })

    if (response.statusCode >= 400 || response.statusCode < 200) throw new Error('Invalid response')

    return response.body
}

async function getStreams (contentId, options) {
    const data = await getSources(contentId, options)
    const { name: title } = data
    const source = Array.isArray(data.sources) && data.sources.find(function (settings) {
        const src = settings.src
        const isPlayable = !settings.key_systems || settings.key_systems['com.widevine.alpha']

        if (src && src.startsWith('https://') && isPlayable) return settings
    })

    if (source) {
        const { key_systems, type, src } = source
        const sourceMeta = { type, src, title }

        if (key_systems) {
            sourceMeta.drm = {
                widevine: { 
                    url: key_systems['com.widevine.alpha'].license_url
                }
            } 

            if (key_systems['com.microsoft.playready']) 
                sourceMeta.drm.playready = { url: key_systems['com.microsoft.playready'].license_url }
        }

        return [sourceMeta]
    }
}

module.exports = {
    getStreams,
    getSources
}