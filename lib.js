
const fs = require('fs')

const { promisify } = require('util')


async function handleRoute (Routes, props) {
    const query = props.query
    const id = query.id

    if (Object.prototype.hasOwnProperty.call(Routes, id)) {
        const handler = Routes[id]
        
        if (typeof handler === 'function') {
            const collection = await handler(props)

            return collection
        }

        else return handler
    }
}

const getProvidersFromDirectory = promisify(function (directory, cb) {
    fs.readdir(directory, function (err, list) {
        if (err) return cb(err)

        const reg = /^provider-(.*).js$/

        cb(null, list
            .map(file=> file.match(reg))
            .filter(a => a)
            .map(([filename, id])=> ({ 
                id, 
                filename 
            }))
        )
    })
})


module.exports = {
    handleRoute,
    getProvidersFromDirectory
}