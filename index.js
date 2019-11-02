const express = require('express')
const path = require('path')
const wrapProvider = require('./wrap-provider.js')
const { getProvidersFromDirectory } = require('./lib')
const { promisify } = require('util')

const app = express()

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    next()
})

app.get('/', function (req, res) {
    res.end('')
})


async function launch () {
    const providerDir = __dirname
    const providers = await getProvidersFromDirectory(providerDir)

    // Mount providers and retain configs
    for (let [, { id, filename }] of Object.entries(providers)) {
        try {
            const { router: mount } = await wrapProvider(path.join(providerDir, filename))
        
            if (mount) app.use(`/providers/${id}`, mount)
        } catch (e) {
            continue
        }
    }

    app.listen(3001)

    console.log('Listening on port', 3001)
}

launch().catch(function (err) { 
    console.warn('Error', err) 
})
