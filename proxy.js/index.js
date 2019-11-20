const express = require('express')
const router = express.Router()

module.exports = function (constants) {
    const proxy = require('./proxy')(constants)
    const stream = require('./stream')(constants)

    router.all('/proxy', proxy)
    router.all('/stream', stream)

    return router
}