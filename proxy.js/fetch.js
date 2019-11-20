const https = require('https')

const originalFetch = require('isomorphic-unfetch') //.default

const { format : formatURL, parse : parseURL } = require('url')

const APP_URL = process.env.APP_URL || 'http://localhost:3001'

const parsedAppURL = parseURL(APP_URL)

const freeAgent = https.Agent({ rejectUnauthorized: false })

const empty = {}

function fetch (url = '', options = empty) {
    const parsed = parseURL(typeof url === 'object' ? url.toString() : url)
    const optionsDefault = {}

    if (!parsed.host) {
        parsed.protocol = parsedAppURL.protocol
        parsed.host = parsedAppURL.host
        parsed.hostname = parsedAppURL.hostname
        parsed.port = parsedAppURL.port
        parsed.href = null
    }

    if (
        freeAgent &&
        parsedAppURL.protocol === 'https:' &&
        parsed.host === parsedAppURL.host && 
        parsed.hostname === parsedAppURL.hostname &&
        parsed.protocol === 'https:'
    ) options.agent = freeAgent

    return originalFetch(formatURL(parsed), { 
        ...optionsDefault, 
        ...options 
    })
}

module.exports = fetch