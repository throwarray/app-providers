const _request = require('request')

const { promisify } = require('util')

const jar = _request.jar()

const cheerio = require('cheerio')

const request = promisify(_request.defaults({ gzip: true, jar }))

const registerDevice = (initialValue => {
    let cache = initialValue, promise

    async function register () {
        const { body } = await request({
            url: 'https://api-cbc.cloud.clearleap.com/cloffice/client/device/register',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Content-Type': 'text/plain;charset=UTF-8',
                'Referer': 'https://gem.cbc.ca/'
            },
            body: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<device>\n  <type>web</type>\n</device>',
            method: 'POST'
        })
        
        const $ = cheerio.load(body, { xmlMode: true })
        const id = $('deviceId').text()
        const token = $('deviceToken').text()

        cache = { deviceId: id, deviceToken: token }
        promise = null

        return cache
    }

    return async function (reset) {
        if (!reset && cache) return cache
        
        else if (!promise) promise = register()
        
        const val = await promise

        return val
    }
})()


let CONFIG = {}

try { 
    CONFIG = require ('./storage/cbc.json')  

    console.log('LOADED COOKIES FOR CBC PROVIDER')
} catch(e) {
    CONFIG = null
}

const MATCH_MEDIA_ID = /^cbc-media-(.+)$/

async function streams ({ query }) {
    let match = (query.id || '').match(MATCH_MEDIA_ID)
    let guid = match && match[1]

    const streams = []
    
    if (!guid) return streams

    const { statusCode, body } = await request({ 
        url: `https://api-cbc.cloud.clearleap.com/cloffice/V4/client/web/browse/${guid}?max=20&offset=0` 
    })

    if (statusCode === 200 || statusCode === 302) {
        const $ = cheerio.load(body, { xmlMode: true })
        const contentURL = $('media\\:content').attr('url')
        
        if (contentURL && contentURL.startsWith('https://api-cbc.cloud.clearleap.com/cloffice/client/web/play')) {
            let cfg

            if (CONFIG) cfg = { deviceId: CONFIG.deviceId, deviceToken: CONFIG.token } //* .token ?
            
            else cfg = await registerDevice()

            const { deviceId, deviceToken } = cfg

            const { statusCode, body} = await request({
                url: contentURL,
                headers: {
                    Referer: 'https://gem.cbc.ca/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0',
                    'X-Clearleap-DeviceId': deviceId,
                    'X-Clearleap-DeviceToken': deviceToken
                }
            })

            if (statusCode === 200 || statusCode === 302) {
                const $ = cheerio.load(body, { xmlMode: true })
                const url = $('url').text()
                const token = $('token').text()

                if (url && token) streams.push({ id: guid, url, type: 'hls' })
            }
        }
    }

    return streams
}

const MATCH_COLLECTION_ID = /^cbc-collection-(.+)$/

async function collection ({ query }) 
{
    const match = (query.id || '').match(MATCH_COLLECTION_ID)
    
    let guid = match && match[1]
    const response = {
        id: query.id,
        title: query.title,
        page: query.page,
        width: 200,
        height: 100
    }

    if (guid === '9efab56d-0bc1-4b99-8ac2-4c96d7f71d9d') {
        response.width = 200
        response.height = 300
    }

    if (query.id === 'cbc') //guid = 'babb23ae-fe47-40a0-b3ed-cdc91e31f3d6'
        return {
            title: 'CBC',
            id: 'cbc',
            type: 'collection',
            items: [
                {
                    title: 'All Shows',
                    id: 'cbc-collection-babb23ae-fe47-40a0-b3ed-cdc91e31f3d6',
                    type: 'collection',
                    width: 200,
                    height: 100
                },
                {
                    title: 'Must Watch',
                    id: 'cbc-collection-c0727fa0-1465-4c58-bb4f-a9d10e71ac24',
                    type: 'collection',
                    width: 200,
                    height: 100
                },
                {
                    title: 'Films',
                    id: 'cbc-collection-9efab56d-0bc1-4b99-8ac2-4c96d7f71d9d',
                    type: 'collection',
                    width: 200,
                    height: 300
                },
                {
                    title: 'Featured Documentaries',
                    id: 'cbc-collection-a04e4803-9d0c-4480-845f-54bcf081b65f',
                    type: 'collection',
                    width: 200,
                    height: 100
                },
                {
                    title: 'All Documentaries',
                    id: 'cbc-collection-d1c2427d-988b-4111-a63a-fffad4406ac7',
                    type: 'collection',
                    width: 200,
                    height: 100
                }
                /*
                # https://gem.cbc.ca/category/shows/all/babb23ae-fe47-40a0-b3ed-cdc91e31f3d6
                # https://gem.cbc.ca/category/shows/must-watch/c0727fa0-1465-4c58-bb4f-a9d10e71ac24
                # https://gem.cbc.ca/category/shows/films/9efab56d-0bc1-4b99-8ac2-4c96d7f71d9d
                https://gem.cbc.ca/category/shows/categories/animation/e3490c50-4196-416b-b663-3e6a9c577c52
                https://gem.cbc.ca/category/shows/categories/arts/7ca656fb-8b14-409b-8044-576ac8b9a11d
                https://gem.cbc.ca/category/shows/categories/comedy/6e21e14d-3245-4b4c-bcc3-099c663e0ef4
                https://gem.cbc.ca/category/shows/categories/drama/4075747b-cfed-4a44-903b-a8763750d0e4
                https://gem.cbc.ca/category/shows/categories/factual-reality/0129c2b5-222e-41c0-89f2-67e9e74b9dc5
                https://gem.cbc.ca/category/shows/categories/lifestyle/f4a6e3fa-6aa6-4c72-9f7d-19308f3d5bf6
                https://gem.cbc.ca/category/shows/categories/music/e3c3f9c0-abfc-4502-9247-548b0b8c5cf3
                https://gem.cbc.ca/category/shows/categories/news-current-affairs/d594d93a-3d9f-4c6c-bab7-c2bd52e710a4
                https://gem.cbc.ca/category/shows/categories/regional/e8cda762-bfa9-46da-8c0a-c858c0ac4234
                https://gem.cbc.ca/category/shows/categories/sports/526a1202-4e75-41df-8085-7d5d8e68b236
                https://gem.cbc.ca/category/shows/short-form-series/861c3ad8-6824-47bb-aab1-38b2e6236345
                --* should be in documentaries category too
                https://gem.cbc.ca/category/shows/categories/documentary/2227334a-b82e-4b58-b3ea-3a142cd9d45b
                
                
                # https://gem.cbc.ca/category/documentaries/featured-documentaries/a04e4803-9d0c-4480-845f-54bcf081b65f
                # https://gem.cbc.ca/category/documentaries/all/d1c2427d-988b-4111-a63a-fffad4406ac7
                https://gem.cbc.ca/category/documentaries/shorts/c479ce73-4984-485e-8bed-8e424ccbd086
                https://gem.cbc.ca/category/documentaries/categories/arts/5b65308f-c0a0-4146-b19c-23b3c1c504a0
                https://gem.cbc.ca/category/documentaries/categories/biography/84c59d8b-d0b5-4207-a58a-6345388e822a
                https://gem.cbc.ca/category/documentaries/categories/crime-justice/5623f2d3-9a65-43f4-8064-996e8cdc4258
                https://gem.cbc.ca/category/documentaries/categories/environment/ad50dd31-bf48-4c27-af65-ba6de1d1223b
                https://gem.cbc.ca/category/documentaries/categories/health/e5ee5ab3-e285-47e9-96b5-9f91ab70bb3c
                https://gem.cbc.ca/category/documentaries/categories/history/087f8464-807e-42cc-84ff-8e7a917792ec
                https://gem.cbc.ca/category/documentaries/categories/music/63858d55-8611-4c60-85be-8f4b9d0df682
                https://gem.cbc.ca/category/documentaries/categories/politics/fae362e5-5145-4bef-b7db-a1608854665c
                https://gem.cbc.ca/category/documentaries/categories/science-technology/98032bf6-c338-400e-8db2-153311c45586
                https://gem.cbc.ca/category/documentaries/categories/society-culture/fcc86ef4-5e2b-4d23-a214-51afa7612f04
                https://gem.cbc.ca/category/documentaries/categories/sports/61d65feb-d34f-4eca-b499-50ecad9ceebb
                https://gem.cbc.ca/category/documentaries/categories/war-conflict/ed1dd7c4-2756-41ff-a9e1-c322ebf97cbc
                https://gem.cbc.ca/category/documentaries/categories/wildlife/f6f1b3a3-5142-4213-a440-f7c0efe97eff
                */
            ]
        }

    if (!guid) return response

    const page = Math.max(Number(query.page) || 1, 1)
    const limit = 20
    const skip = (page - 1) * limit
    const { body } = await request(`https://api-cbc.cloud.clearleap.com/cloffice/V4/client/web/browse/${guid}?max=${limit}&offset=${skip}`)
    const $ = cheerio.load(body, { xmlMode: true })
    
    const title = $('channel > title').text()
    const poster = $('channel > media\\:thumbnail[profile="CBC-BANNER-2X"]').text()
    const elems = $('channel > item').toArray()
    const items = []
    
    for (let elem of elems) 
    {
        const guid = $('clearleap\\:shortcutToGuid', elem).text() || $('guid', elem).text()
        const title = $('title', elem).text()
        const media = $('media\\:keywords', elem).text()
        const mediaType = media.includes('series')? 'series': 'movie'

        let poster = $('media\\:thumbnail[profile="CBC-PORTRAIT-3X"]', elem).attr('url')

        if (!poster) 
            poster = $('media\\:thumbnail[profile="CBC-CAROUSEL-3X"]', elem).attr('url')
        if (poster) 
            poster = poster + '?impolicy=portrait3x&imwidth=320'

        items.push({
            id: 'cbc-media-' + guid,
            title,
            type: mediaType,
            poster,
            region: 'CA'
        })
    }

    return Object.assign(response, {
        title,
        poster,
        items,
        page
    })
}

async function meta ({ query }) {
    const match = (query.id || '').match(MATCH_MEDIA_ID)
    const id = match && match[1]
    const response = { id: query.id }

    if (!id) return response

    const { body } = await request(`https://api-cbc.cloud.clearleap.com/cloffice/V4/client/web/browse/${id}?max=20&offset=0`)
    
    const $ = cheerio.load(body, { xmlMode: true })
    
    const title = $('channel > title').text() || query.title

    const description = $('channel > description').text()
    
    let mediaType = $('channel > media\\:keywords').text()

    if (mediaType.includes('series')) {
        const seasons = []

        let query_season

        if (query.season) query_season = Number(query.season) || 0

        // Append seasons
        const items = $('channel > item').toArray() // season nodes

        for (let item of items) {
            const guid = $('guid', item).text()
            const analyticsSeason = $('clearleap\\:analyticsLabel', item).text()
            const match = analyticsSeason && analyticsSeason.match(/Season (\d+)/)

            if (!match) continue

            const season_number = Number(match && match[1]) || 0

            if (!seasons[season_number]) seasons[season_number] = {
                title: analyticsSeason,
                type: 'season',
                season: season_number,
                series: query.id,
                items: []
            }

            const season = seasons[season_number].items

            if (query_season === void 0) {
                 query_season = season_number // season wasn't specified use first available
                 console.log('using default season', season_number)
            }

            if (query_season === season_number) {
                const { body } = await request(`https://api-cbc.cloud.clearleap.com/cloffice/V4/client/web/browse/${guid}?max=20&offset=0`)

                const $ = cheerio.load(body, { xmlMode: true})

                const episodes = $('item').toArray()

                // Append episodes
                for (let episodeNode of episodes) {
                    const id = $('guid', episodeNode).text()
                    const title = $('title', episodeNode).text()
                    const description = $('description', episodeNode).text()
                    const episode_number = Number($('clearleap\\:episodeInSeason', episodeNode).text()) || 0
                    const poster = $('media\\:thumbnail[profile="CBC-THUMBNAIL-1X"]', episodeNode).attr('url')

                    season[episode_number] = {
                        id: 'cbc-media-' + id,
                        title,
                        description,
                        season: season_number,
                        episode: episode_number,
                        poster // todo allow srcset objects
                    }
                }
            }
        }

        response.seasons = seasons
        response.season = query_season
    } else mediaType = 'movie'

    let poster = $('media\\:thumbnail[profile="CBC-PORTRAIT-3X"]').attr('url')

    if (!poster) poster = $('media\\:thumbnail[profile="CBC-CAROUSEL-3X"]').attr('url')

    if (poster) poster = poster + '?impolicy=portrait3x&imwidth=320'

    return Object.assign(response, {
        title,
        poster,
        type: mediaType,
        description
    })
}

module.exports = {
    meta, 
    collection, 
    streams
}
