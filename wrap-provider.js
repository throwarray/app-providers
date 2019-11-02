const express = require('express')

const koaify = fn => (...args) => fn(...args).catch(args[2])

// Wrap provider with mountable express router
module.exports = async function (providerPath) {
    let provider

    if (providerPath && String(providerPath) === providerPath)  provider = require(providerPath)

    else provider = providerPath

    // provider returned a function, assume it provides a router
    if (typeof provider === 'function') {
        const router = await Promise.resolve(provider())

        return { router }
    }

    const { streams, collection, config, meta } = provider

    const app = express.Router()

    app.use(function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*')
        next()
    })

    function handleRoute (handler) {
        return koaify(async function (req, res) {
            let data

            try {
                data = await handler(req)

                if (!data) res.status(404)
            } catch (e) {
                res.status(404)
            }

            res.json(data)
        })
    }

    app.get('/streams.json', handleRoute(streams))

    app.get('/collection.json', handleRoute(collection))

    app.get('/meta.json', handleRoute(meta))

    app.get('/config.json', handleRoute(config))

    app.get('/', function (req, res) { res.end() })

    return { 
        router: app
    }
}