const fetch = require('isomorphic-unfetch')

const { getStreams } = require('./lib-brightcove.js')

const COLLECTION_URL = 'https://www.citytv.com/wp-json/rdm-content/v1/shows?sort=custom_title'

async function collection () {
    const data = await fetch(COLLECTION_URL).then(r=> r.json())

    const pattern = /^https:\/\/www.citytv.com\//

    const items = data.map(function (item) {
        const poster = item.images && item.images[0] && item.images[0].uri

        return {
            id: 'city-meta-' + encodeURIComponent(item.id),
            type: 'series',
            poster: pattern.test(poster) && poster || '',
            title: String(item.title || ''),
            description: String(item.description || '')
        }
    }).filter(function (item) {
        if (item) return true
    })

    return {
        id: 'city',
        items,
        page: 1
    }
}

async function meta ({ query }) {
    if (!query.id.startsWith('city-meta-')) throw new Error('Invalid id')

    const id = Number('' + query.id.replace(/^city-meta-/, ''))

    const pattern = /^https:\/\/www.citytv.com\//

    const season_number = Number(query.season) || 1

    const meta = await fetch(COLLECTION_URL).then(r=> r.json())

    const { title, seasons: available_seasons = [] } = meta.find(item => item.id && item.id === id) || {}

    let supportedIndex = -1

    const seasons = available_seasons
        .sort(function (a, b) { return a - b })
        .map(function (season, i) {
            if (season === season_number) supportedIndex = i

            return { season, items: [] }
        })

    if (supportedIndex >= 0) {
        const data = await fetch(`https://www.citytv.com/wp-json/rdm-content/v1/videos?show_id=${encodeURIComponent(id)}&season=${Number(season_number)}&sort=^episode`).then(r => r.json())

        seasons[supportedIndex].items = data.map(function (episode) {
            const poster = episode.images && episode.images[0] && episode.images[0].uri
    
            return {
                id: 'city-episode-' + encodeURIComponent(episode.cmsinfo && episode.cmsinfo.id || episode.id),
                title: String(episode.title),
                description: String(episode.description),
                season: Number(episode.season),
                episode: Number(episode.episode),
                poster: pattern.test(poster) && poster || ''
            }
        }).filter(function (item) {
            return item && item.season === season_number
        }).sort(function (a, b) {
            return a.episode - b.episode
        })
    }

    return {
        id: query.id,
        title: String(title || ''),
        season: season_number,
        seasons
    }
}

module.exports = {
    meta,
    collection,
    streams: async function ({ query }) {
        const episodeId = Number((query.id || '').split('-')[2]) || 0
        const accountId = '1632712407'
        const playerId = 'B1eOOY5fGl'
        const data = await getStreams(episodeId, { 
            referrer: `https://www.citytv.com/video/iframemod/${accountId}/${playerId}/${episodeId}`,
            accountId,
            policyKey: 'BCpkADawqM37UFmauihA6tl9J97-QanbU4u5W1pnlrJAas9t7NlL5h_cbEOTa6MWHwpzGhk2J8BSXwmAY0tE1vgY_z5HXmoGg65fxkfRh5KX7AoJmnb0xhRcAeg'
        })
        
        return data
    }
}
