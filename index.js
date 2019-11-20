const dotenv = require('dotenv')
dotenv.config({})

const express = require('express')
const path = require('path')
const wrapProvider = require('./wrap-provider.js')
const { getProvidersFromDirectory } = require('./lib')
const { promisify } = require('util')
const { readFile } = require('fs')
const { join: joinPath } = require('path')
const { createServer: createHttpsServer } = require('https')
const { createServer: createHttpServer } = require('http')

const { USE_HTTPS_SERVER, PORT:STR_PORT = 3001, NODE_ENV,  APP_URL = 'http://localhost:3001'  }  = process.env

const PORT = Number(STR_PORT)

const usesHttps = APP_URL.startsWith('https://')

const protocol = usesHttps? 'https://' : 'http://'

const dev = NODE_ENV !== 'production'

const isLocalHost = APP_URL.match(/https?:\/\/localhost:\d+$/)

const createServer = USE_HTTPS_SERVER || (isLocalHost && usesHttps) ?  createHttpsServer: createHttpServer

const expressApp = express()

if (!dev) expressApp.set('trust proxy', 1)

expressApp.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    next()
})

expressApp.get('/', function (req, res) { res.end('') })


function combineURLS(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL
}

async function launch () {
    const providerDir = __dirname

    const readFileAsync = promisify(readFile)
  
    const httpsSettings = createServer === createHttpsServer? {
        key: await readFileAsync('./key.pem'),
        cert: await readFileAsync('./cert.pem')
    } : {}
    
    const providers = await getProvidersFromDirectory(providerDir)
    
    // Mount providers and retain configs
    for (let [, { id, filename }] of Object.entries(providers)) {
        try {
            const { router: mount } = await wrapProvider(path.join(providerDir, filename))
            
            if (mount) expressApp.use(`/providers/${id}`, mount)
            
            console.log('Mounted provider', id)
        } catch (e) {
            console.log('Failed to mount provider', id, e)
            
            continue
        }
    }

    expressApp.use('/api', require('./proxy.js/index.js')({
        STREAM_PATH_INVALID: 'about:blank',
        STREAM_PATH_VALID:  combineURLS(APP_URL, '/api/proxy'),
        STREAM_PATH_MANIFEST: combineURLS(APP_URL, '/api/stream'),
        SERVER_PROTOCOL: protocol
    }))

    const server = createServer(httpsSettings, expressApp)

    await new Promise(function (resolve, reject) {
        server.listen(PORT, function (err) {
          if (err) reject(err)
          else resolve(PORT)
        })
    })

    console.log('Listening on port', PORT)
    console.log(`> Server ready on ${protocol}localhost:${PORT}`)

    return {
        server,
        expressApp
    }
}

launch().catch(function (err) { 
    console.warn('Error', err) 
})