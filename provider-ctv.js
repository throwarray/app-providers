const request = require('request')

const pify = require('pify')

const { handleRoute } = require('./lib')

const { parseImages, collection: fetchCollection, streams, getPackage, getSeriesItems } = require('./lib-9c9.js')

const fetch = pify(request)

const matchYear = /\((\d+)\)$/

const poster = 'https://www.ctv.ca/getmedia/27dbd4e9-5a47-4bf8-b7c2-854a16c553ad/default_image_poster'

function IsObject (list) { return list && typeof list === 'object' && !Array.isArray(list) }

function parseContentList (list) {
    let itemsFiltered = []
    
    if (IsObject(list) && Array.isArray(list.Items)) {
        itemsFiltered = list.Items.filter((Item)=> {
            if (!IsObject(Item)) return false
            
            const maybeValid = Item.Type === 'ContentItem' &&
            Item.Id !== void 0 && 
            Item.MediaId !== void 0 && 
            Item.PrimaryUrl && 
            Item.SecondaryUrl
            
            return maybeValid
        })
    }
    
    return itemsFiltered
}

const Routes = Object.assign(Object.create(null), {
    'ctv': {
        id: 'ctv',
        title: 'CTV',
        type: 'collection',
        page: 1,
        items: [
            // // Note The 67 collections are mostly episode collections which breaks pagination
            // // consider replacing collection ids or handle collections as list of episodes
            // // { type: 'collection', title: 'Bravo', id: 'bravo-media-67', poster },
            // // { type: 'collection', title: 'CTV Sci-fi / Space', id: 'space-media-67', page: 1, poster },
            { type: 'collection', title: 'MTV (All A-Z)', id: 'mtv-media-67', page: 1, poster, width: 200, height: 100 },
            { type: 'collection', title: 'Discovery Velocity', id: 'discvel-media-67', page: 1, poster },
            { type: 'collection', title: 'Discovery Science', id: 'discsci-media-67', page: 1, poster },
            { type: 'collection', title: 'Investigation Discovery', id: 'invdisc-media-67', page: 1, poster },
            { type: 'collection', title: 'Animal Planet', id: 'aniplan-media-67', page: 1, poster },
            { type: 'collection', title: 'eNOW', id: 'enow-media-67', page: 1, poster },
            { type: 'collection', title: 'Comedy Network', id: 'comedy-media-67', page: 1, poster, width: 200, height: 100 },
            // { type: 'collection', title: 'Discovery Channel', id: 'discovery-media-67', page: 1 , poster },
            // { type: 'collection', title: 'Much Music', id: 'much-media-67', page: 1, poster }, // broken?
            { type: 'collection', title: 'CTV Series', id: 'ctv-collection-series', page: 1 , poster },            
            // { type: 'collection', title: 'CTV (All A-Z)', id: 'ctv-media-67', page: 1, poster },
            { type: 'collection', title: 'CTV Throwback', id: 'ctv-collection-throwback', page: 1, poster, height: 150, width: 200 },
            { type: 'collection', title: 'CTV Life', id: 'ctv-collection-3709', page: 1 , poster },
            { type: 'collection', title: 'CTV Featured Movies', id: 'ctv-collection-2962', page: 1 , poster },
            { type: 'collection', title: 'CTV Latest Movies', id: 'ctv-collection-3125', page: 1, poster },
            { type: 'collection', title: 'CTV Action / Adventure Movies', id: 'ctv-collection-2747', page: 1, poster },
            { type: 'collection', title: 'CTV Comedy Movies', id: 'ctv-collection-2749', page: 1, poster },
            { type: 'collection', title: 'CTV Romantic Comedy', id: 'ctv-collection-2754', page: 1, poster }, 
            { type: 'collection', title: 'CTV Family Movies', id: 'ctv-collection-2751', page: 1, poster },                
            { type: 'collection', title: 'CTV Drama Movies', id: 'ctv-collection-2750', page: 1, poster },
            { type: 'collection', title: 'CTV Classic Movies', id: 'ctv-collection-2748', page: 1, poster }, 
            { type: 'collection', title: 'CTV Horror Movies', id: 'ctv-collection-2753', page: 1, poster }, 
            // { type: 'collection', title: 'TSN', id: 'tsn-media-67', page: 1, poster },
            // { type: 'collection', title: 'RDS', id: 'rds-media-67', page: 1, poster },
        ]
    },
    'ctv-collection-series': async function () {
        const response = await fetch({
            url: 'https://www.ctv.ca/api/shows/contentlist', // https://www.ctv.ca/api/shows/contentlist/comingsoon|daytime|exclusives|newseries|primetime|throwback
            gzip: true,
            json: true,
            headers: {
                Origin: 'https://www.ctv.ca',
                Referer: 'https://www.ctv.ca'
            }
        })

        const items = parseContentList(response.body)

        return {
            id: 'ctv-collection-series',
            title: 'CTV Series',
            type: 'catalogue',
            page: 1,
            items: items.map((item)=> {
                return {
                    id: 'ctv-media-' + item.MediaId,
                    title: item.Title,
                    poster: item.Poster,
                    type: 'series'
                }
            })
        }
    },
    'ctv-collection-throwback': async function ({ query }) {
        const id = query.id || ''
        const page = Number(query.page)
        const collection = { id, page, title: query.title }
        const response = await fetch({
            url: 'https://www.ctv.ca/api/shows/contentlist/throwback',
            gzip: true,
            json: true,
            headers: {
                Origin: 'https://www.ctv.ca',
                Referer: 'https://www.ctv.ca'
            }
        })            

        const items = response.body && response.body.Items
    
        if (items && items.length) {
            collection.items = []
    
            items.forEach(item=> {
                if (item && item.MediaId) {
                    const matched_year = (item.SubTitle || '').match(matchYear)
    
                    collection.items.push({
                        id: 'ctv-media-' + item.MediaId,
                        title: item.Title,
                        year: matched_year && Number(matched_year[1]),
                        type: 'series',
                        poster: item.Image && item.Image + '/177/266?width=177&height=266'
                    })
                }
            })
        }
    
        return collection
    }
})

async function collection ({ query }) {    
    const handled = await handleRoute(Routes, { query })
    
    if (handled) return handled
    
    const collection = await fetchCollection({ query })

    return collection
}


async function meta ({ query }) {
    const matchId = (query.id || '').match(/^(\w+)-\w+-(\d+)$/)    
    const prefix = matchId && matchId[1]
    const id = matchId && Number(matchId[2])
    const year = Number(query.year)

    let meta = { id: query.id, title: query.title, type: query.type }

    if (!Number.isNaN(year)) meta.year = year

    if (!id) return meta

    // Handle as movie
    if (meta.type !== 'series') try {
        const { body } = await getPackage({ id, destination: prefix + '_web', query })

        const year = (body.BroadcastDate || '').match(/(\d+)-\d+-\d+$/)
    
        const { poster, thumbnail } = parseImages(body.Images)
        const image = poster || thumbnail

        if (year) meta.year = Number(year[1])
    
        if (image) meta.poster = image + '?height=200&maintain_aspect=1&size=200'
    
        meta.title = body.Title || body.Name || meta.title
        
        meta.description = body.Desc || body.Description
    
        if (body.Type == 'feature' || body.Type == 'video' || body.Type == 'movie') meta.type = 'movie'
        else meta.type = 'series'
    
        if (meta.type !== 'series') return meta
    } catch (e) {/** */
        console.warn('ERROR', e)
    }

    meta = await getSeriesItems({ prefix, id, destination: prefix + '_web', query })

    return meta
}

module.exports = {
    collection,
    meta, 
    streams
}

// function getContentList () {
//     // https://www.ctv.ca/api/shows/videourlsAndCategories
//     // https://www.ctvcomedy.ca/Sites/Comedy/Feeds/ShowList.aspx
// }

// 'much': async function () {
//     return { // manual atm since api is jsonp and prerendered mostly
//         id: 'much',
//         title: 'Much Music',
//         page: 1,
//         type: 'catalogue',
//         items: [
//             {
//                 title: 'South Park',
//                 type: 'series',
//                 id: 'much-media-34522',
//                 poster: 'https://image.tmdb.org/t/p/w200/v9zc0cZpy5aPSfAy6Tgb6I1zWgV.jpg'
//             },
//             {
//                 title: 'Tosh.0',
//                 type: 'series',
//                 id: 'much-media-32015',
//                 background: 'red'
//             }
//         ]
//     }
// },
