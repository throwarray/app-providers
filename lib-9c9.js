const request = require('request')
const pify = require('pify')
const fetch = pify(request)
const ID_REGEX = /(\w+(?:-|$)(?:\w+-)?)(.*)/

const parseIdPrefix =(id)=> {
    const match = (id || '').match(ID_REGEX)

    return match //[input, prefix, id]
}

function parseImages (images) {
    let posterImg, thumbnailImg

    if (Array.isArray(images)) images.forEach(function (poster) {
        if (!poster || !poster.Url) return
        else if (poster.Type === 'poster' && !posterImg) posterImg = poster.Url
        else if (poster.Type === 'thumbnail' && !thumbnailImg) thumbnailImg = poster.Url                
    })

    return {
        poster: posterImg,
        thumbnail: thumbnailImg
    }
}


async function getSeriesItems ({ prefix, id, destination, query }) {
    const { body } = await fetch({
        url: `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/medias/${id}/contents?$include=[Authentication,Episode,Media.Id,Season,Genres,BroadcastDate,ItemsType,Items.ID,Images,Type,ShortDesc,Media.Name,Media.Images,Season,Episode,Genres,ContentPackages]&$inlinecount=true&$sort=BroadcastDate&$order=desc&$page=1&type=episode`,
        gzip: true,
        json: true 
    })

    const meta = {  ...query, type: 'series', seasons: []  }

    const seasonMap = new Map()

    if (body.Items && Array.isArray(body.Items)) {
        const first = body.Items[0]

        if (first) {
            const Media = first.Media
            const mediaTitle = Media && Media.Name
            const { poster, thumbnail } = parseImages(Media.Images)
            const image = poster || thumbnail

            if (image) meta.poster = image + '?height=200&maintain_aspect=1&size=200'

            if (typeof mediaTitle === 'string') meta.title = mediaTitle
        }

        body.Items.forEach(function (item) {
            const Season = item.Season
            const seasonNumber = Number(Season && Season.Number)
            
            if (item.Authentication && item.Authentication.Required) return

            if (seasonNumber !== void 0) {
                if (!seasonMap.has(seasonNumber)) {
                    seasonMap.set(seasonNumber, {
                        type: 'season',
                        title: Season.Name,
                        season: seasonNumber,
                        items: []
                    })
                }

                const season = seasonMap.get(seasonNumber)
                const { poster, thumbnail } = parseImages(item.Images)
                const image = thumbnail || poster

                season.items.push({
                    season: seasonNumber,
                    episode: item.Episode,
                    id: prefix + '-media-' + item.Id,
                    title: item.Name,
                    description: item.ShortDesc,
                    type: 'episode',
                    poster:  image !== void 0 ? image + '?height=200&maintain_aspect=1&size=200' : void 0
                })
            }
        })

        meta.seasons = [...seasonMap.values()]

        if (meta.season === void 0) {
            meta.season = meta.seasons[0].season
        } else {
            meta.season = Number(meta.season)
        }
    }

    return meta
}

async function getPackage ({ id, destination })  {
    console.log('request', `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/contents/${id}?%24include=%5BId%2CName%2CDesc%2CShortDesc%2CType%2COwner%2CMedia%2CSeason%2CEpisode%2CGenres%2CImages%2CContentPackages%2CAuthentication%2CPeople%2COmniture%2C+revShare%5D&%24lang=en`)

    const { body } = await fetch({
        url: `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/contents/${id}?%24include=%5BId%2CName%2CDesc%2CShortDesc%2CType%2COwner%2CMedia%2CSeason%2CEpisode%2CGenres%2CImages%2CContentPackages%2CAuthentication%2CPeople%2COmniture%2C+revShare%5D&%24lang=en`,
        gzip: true,
        json: true
    })

    const needsAuth = body.Authentication && body.Authentication.Required
    const packages = body.ContentPackages && body.ContentPackages.length && body.ContentPackages
    const pkg = packages && Number(packages[0] && packages[0].Id)

    return {
        needsAuth,
        pkg,
        body
    }
}

async function getStreams ({ id, destination, query }) {
    const streams = []

    if (!id && id !== 0) return streams

    const { needsAuth, pkg /*, body */ } = await getPackage({ id, destination })

    // Valid stream URL
    if (!needsAuth && pkg)
        streams.push({
            id: query.id,
            type: 'mpd',
            url: `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/contents/${id}/contentpackages/${pkg}/manifest.mpd`,
            drm: {
                'widevine': { url: 'https://license.9c9media.ca/widevine' },
                'playready': { url: 'https://license.9c9media.ca/playready' },
                'fairplay': {
                    certificateUrl:	'https://license.9c9media.ca/fairplay/cert',
                    processSpcUrl:	'https://license.9c9media.ca/fairplay/ckc'
                }
            }
        })
    
    return streams
}

async function getCollection ({ isContentCollection, id, destination, query, prefix }) {
    let response 

    const page = Number(query.page) || 1

    const url = isContentCollection ?  
        `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/collections/${id}/contents?$include=[Id,Name,Desc,ShortDesc,Type,Owner,Media,Season,Episode,Genres,Images,ContentPackages,Authentication,People,Omniture,revShare]&$sort=Name&$top=100&$inlinecount=true&$page=${page}` :
        `https://capi.9c9media.com/destinations/${destination}/platforms/desktop/collections/${id}/medias?$sort=name&$include=[Id,Name,Desc,ShortDesc,Type,Owner,Media,Season,Episode,Genres,Images,ContentPackages,Authentication,People,Omniture,revShare]&$page=${page}&$top=25&$inlinecount=`

    const collection = {
        id,
        page,
        title: query.title
    }

    try {
        response = await fetch({
            url,
            gzip: true,
            json: true,
            headers: {
                Origin: 'https://www.ctv.ca',
                Referer: 'https://www.ctv.ca'
            }
        })
    } catch (e) {
        response = null
    }

    const items = response && response.body && response.body.Items

    if (!items || !items.length) return collection

    collection.items = []
    
    const itemMap = new Map()
    const fallbackImg = 'https://www.ctv.ca/getmedia/27dbd4e9-5a47-4bf8-b7c2-854a16c553ad/default_image_poster'
    
    items.forEach(item=> {
        const media = item && (item.Media || item)
        const needsAuth = item.Authentication && item.Authentication.Required
        const year = (item.BroadcastDate || '').match(/(\d+)-\d+-\d+$/)

        if (media.Type == 'news') return

        const mediaType = media.Type == 'movie' ? 'movie' : 'series'

        const mediaId = prefix + (mediaType == 'movie'? item.Id || media.Id : media.Id || item.Id)
        const images = media.Images || item.Images
        const { poster, thumbnail } = parseImages(images)
    
        if (!needsAuth) {

            if (!itemMap.has(mediaId)) { // dedupe
                itemMap.set(mediaId, true)

                // TODO Remove unavailable content somehow
                const entry = {
                    id: mediaId,
                    title: media.Name || media.Title,
                    type: mediaType,
                    poster: (poster || thumbnail || fallbackImg) + '?height=600&maintain_aspect=1&size=600',
                    _dev: item
                }

                if (year) entry.year = Number(year[1])

                collection.items.push(entry)
            }
        }
    })

    return collection
}

async function streams ({ query }) {
    const matchId = parseIdPrefix(query.id)
    
    if (matchId) {
        const prefix = matchId[1]
        const id = matchId[2] // Id
        const dest = prefix.split('-')[0] // i.e ctv-media just ctv
        const streams = await getStreams({ id, destination: dest + '_web', query })

        return streams
    }

    return []
}

async function collection ({ query }) {
    const matchId = parseIdPrefix(query.id)

    if (matchId) {
        const prefix = matchId[1]
        const id = matchId[2] // collectionId
        const split = prefix.split('-')
        const dest = split[0] // i.e ctv-media just ctv
        const isContentCollection = split[1] !== 'media'
        const data = await getCollection({ isContentCollection, id, prefix, query, destination: dest + '_web' })
        
        return data
    }
}

module.exports = {
    getCollection,
    collection,
    getStreams,
    streams,
    getPackage,
    getSeriesItems,
    parseImages
}
