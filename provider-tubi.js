const wrapProvider = require('./wrap-provider')

const request = require('request')

const pify = require('pify')

const { mediaInfo, collection: collectionInfo } = require('./lib-tubi')

const hasOwn = Object.prototype.hasOwnProperty

const tubiMediaInfo = pify(mediaInfo)

const tubiCollection = pify(collectionInfo)

const idRegex = /^tubi-media-(.*)$/
const collectionRegex = /^tubi-collection-(.*)$/
const episodeTitleRegex = /(?:^S(\d+):E(\d+) - )?(.*)/

function parseMediaId(id = '') {
    const matched = id.match(idRegex)
    const mediaId = matched && Number(matched[1])

    return mediaId
}


function getPoster (item) {
    const poster = item.posterarts && item.posterarts[0]

    return poster && poster.replace(/^http:\/\//, 'https://')
}

async function streams ({ query }) {
    let meta
    const id = parseMediaId(query.id)

    if (id) { try { meta = await tubiMediaInfo(id) } catch (e) {/* */} }

    return meta && meta.url? [
        { 
            type: 'hls', 
            provider: 'tubi', 
            url: meta.url,
            thumbnails: '/providers/tubi/thumbnail-sprites?id=' + id
        }
    ]: []
}

async function meta ({ query }) {
    const id = parseMediaId(query.id)

    if (id) {
        try {
            let item = await tubiMediaInfo(id)
            let type = item.type == 'v'? 'video' : 'series'

            const poster = getPoster(item)

            let meta = {
                id: query.id,
                type,
                title: item.title || query.title,
                year: Number(item.year || query.year),
                description: item.description,
                imdb: item.imdb_id,
                poster
            }

            
            if (type == 'series') {
                const requestedSeason = Number(query.season || 1)
                
                let matchedSeason

                meta.season = requestedSeason
                
                meta.seasons = item.children.map(season => {
                    const seasonNumber = Number(season.id)
                    
                    matchedSeason = !matchedSeason && (!requestedSeason || seasonNumber == requestedSeason)

                    return {
                        title: season.title || 'Season ' + seasonNumber,
                        type: 'season',
                        season: seasonNumber,
                        items:  matchedSeason && (season.children || []).map(function (episode) {
                            const [,season, episodeNumber] = episode.title.match(episodeTitleRegex) || []

                            return {
                                id: 'tubi-media-' + episode.id,
                                title: episode.title,
                                type: 'episode',
                                year: episode.year,
                                poster: getPoster(episode),
                                imdb: episode.imdb_id,
                                season: Number(season) || seasonNumber,
                                episode: Number(episodeNumber)
                            }
                        })
                    }
                })
            }

            return meta
        } catch (e) {
            console.log('WOOPS THOUGH', e.message)
        }
    }

    return {
        id: query.id,
        title: query.title,
        type: query.type,
        year: Number(query.year)
    }
}

const Views = Object.assign(Object.create(null), {
    tubi: { title: 'TUBI', items: [
        { type: 'collection', id: 'tubi-series', title: 'SERIES', height: 50 },
        { type: 'collection', id: 'tubi-movies', title: 'MOVIES', height: 50 },
        { type: 'collection', id: 'tubi-collection-featured', title: 'Featured'},
        { type: 'collection', id: 'tubi-collection-weekly_watchlist', title: 'Weekly Watchlist'},
        { type: 'collection', id: 'tubi-collection-recently_added', title: 'Recently Added'},
        { type: 'collection', id: 'tubi-collection-most_popular', title: 'Most Popular'},
        { type: 'collection', id: 'tubi-collection-highly_rated_on_rotten_tomatoes', title: 'Highly rated on Rotten Tomatoes'},
        { type: 'collection', id: 'tubi-collection-leaving_soon', title: 'Leaving soon'},
        { type: 'collection', id: 'tubi-collection-cult_favorites', title: 'Cult Favorites'},
        { type: 'collection', id: 'tubi-collection-sports_movies_and_tv', title: 'Sports Movies & Tv'},
    ]},
    'tubi-series': { title: 'SERIES', items: [
        { type: 'collection', id: 'tubi-collection-stand_up_comedy', title: 'Stand Up Comedy'},
        { type: 'collection', id: 'tubi-collection-tv_comedies', title: 'TV Comedies'},
        { type: 'collection', id: 'tubi-collection-tv_dramas', title: 'TV Dramas'},
        { type: 'collection', id: 'tubi-collection-reality_tv', title: 'Reality TV'},
        { type: 'collection', id: 'tubi-collection-lifestyle_tv', title: 'Lifestyle TV'},
        { type: 'collection', id: 'tubi-collection-docuseries', title: 'Docuseries'},
        { type: 'collection', id: 'tubi-collection-crime_tv', title: 'Crime TV'},
        { type: 'collection', id: 'tubi-collection-foreign_language_tv', title: 'Foreign Language TV'},
        { type: 'collection', id: 'tubi-collection-anime', title: 'Anime'},
        { type: 'collection', id: 'tubi-collection-kids_shows', title: 'Kids shows'},
        { type: 'collection', id: 'tubi-collection-preschool', title: 'Preschool'},
    ]},
    'tubi-movies': { title: 'MOVIES', items: [
        { type: 'collection', id: 'tubi-collection-comedy', title: 'Comedy'},
        { type: 'collection', id: 'tubi-collection-family_movies', title: 'Family Movies'},
        { type: 'collection', id: 'tubi-collection-action', title: 'Action'},
        { type: 'collection', id: 'tubi-collection-sci_fi_and_fantasy', title: 'Sci-fi & Fantasy'},
        { type: 'collection', id: 'tubi-collection-horror', title: 'Horror'},
        { type: 'collection', id: 'tubi-collection-thrillers', title: 'Thrillers'},
        { type: 'collection', id: 'tubi-collection-documentary', title: 'Documentary'},
        { type: 'collection', id: 'tubi-collection-drama', title: 'Drama'},
        { type: 'collection', id: 'tubi-collection-romance', title: 'Romance'},
        { type: 'collection', id: 'tubi-collection-classics', title: 'Classics'},
        { type: 'collection', id: 'tubi-collection-martial_arts', title: 'Martial Arts'},
        { type: 'collection', id: 'tubi-collection-music_musicals', title: 'Music & Musicals'},
        { type: 'collection', id: 'tubi-collection-indie_films', title: 'Indie Films'},
        { type: 'collection', id: 'tubi-collection-foreign_films', title: 'Foreign Language Films'},
        { type: 'collection', id: 'tubi-collection-faith_and_spirituality', title: 'Faith'},
    ]}
})

async function collection ({ query: { title, page, id = '' } }) {
    if (hasOwn.call(Views, id)) {
        const { items, title: collectionTitle } = Views[id]

        return {
            type: 'collection',
            title: collectionTitle || title,
            items,
            id,
            page
        }
    }

    const currentPage = Number(page) || 1
    const cursor = Math.max(0, currentPage - 1) * 50

    // Provide tubi streams
    const matched = id.match(collectionRegex)
    const items = []

    if (!matched) return { id, items }

    const container = matched[1]
    const body = await tubiCollection({ cursor, limit: 50, container })

    const contents = body.contents
    const meta = body.containersHash[container]

    meta.children.forEach((id)=> {
        if (hasOwn.call(contents, id)) {
            const item = contents[id]

            items.push({
                id: 'tubi-media-' + item.id,
                title: item.title,
                type: item.type == 'v'? 'video' : 'series', // TODO
                year: item.year,
                poster: getPoster(item)
            })
        }
    })

    return {
        id,
        title: meta.title,
        description: meta.description,
        items,
        page: currentPage
    }
}


module.exports = async function () {
    const { router } = await wrapProvider({
        collection,
        meta,
        streams
    })

    router.get('/thumbnail-sprites', function (req, res) {
        const id = Number(req.query.id)

        request({
            url: `https://tubitv.com/oz/videos/${id}/thumbnail-sprites`,
            json: true
        }, function (err, response) {
            if (err || !Array.isArray(response.body.sprites) || !response.body.sprites.length || !response.body.duration) 
            {
                res.status(404)
                res.end('')
            } else {
                const { sprites, count_per_sprite = 1, duration, frame_width = 1, height = 1 } = response.body
                const frames = count_per_sprite * sprites.length // 20 * 73 = 1460
                
                let frameDuration = duration / frames // (type 5x)
                const vtt = new Array(frames + 1)

                vtt[0] = 'WEBVTT\n'
                
                for (let frame = 0; frame < frames; frame++) {
                    const sheet = Math.floor(frame / count_per_sprite)
                    const sheet_frame = frame - (sheet * count_per_sprite)
                    const str_start = new Date((frameDuration * frame) * 1000).toISOString().substr(11, 12)
                    const str_end = new Date((frame === frames - 1? duration : frameDuration * (frame + 1)) * 1000).toISOString().substr(11, 12)
            
                    vtt[frame + 1] = `\n${str_start} --> ${str_end}\n${sprites[sheet]}#xywh=${sheet_frame * frame_width},0,${frame_width},${height}\n`
                }
            
                const testVtt = vtt.join('')
            
                res.send(testVtt)
            }
        })
    })

    return router
}