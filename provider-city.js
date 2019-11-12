const request = require('request')
const { promisify } = require('util')
const { getStreams } = require('./lib-brightcove.js')

const fetch = promisify(request)

module.exports = {
    meta: async function ({ query }) {
        const showId = (query.id || '').split('-')[1] || 0
        const response = await fetch({
            url: `https://www.citytv.com/toronto/wp-json/rdm-broadcast-mobile-app/show/${showId}?web=true`,
            json: true,
            'headers':{
                'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
                'accept-language':'en-US,en;q=0.9',
                'cache-control':'max-age=0',
                'if-modified-since':'Wed, 06 Nov 2019 07:34:04 GMT',
                'sec-fetch-mode':'navigate',
                'sec-fetch-site':'none',
                'sec-fetch-user':'?1',
                'upgrade-insecure-requests':'1'
            }
        })
    
        if (response.statusCode >= 400 || response.statusCode < 200) throw new Error('Invalid response')
    
        const json = response.body
    
        const availableEpisodes = json.episodes && json.episodes
            .filter(function (episodeObj) {
                return !episodeObj.authenticate
            })
    
            .map(function (episodeObj) {
                return {
                    id: 'city-' + episodeObj.id,
                    title: episodeObj.name,
                    season: Number(episodeObj.season),
                    episode: Number(episodeObj.episode)
                }
            })
    
        return {
            id: query.id,
            title: decodeURIComponent(json.title),
            season: 0,
            seasons: [
                { season: 0, items: availableEpisodes }
            ]
        }
    },
    collection: async function () {
        return {
            items: [
                { type: 'series', id: 'city-39295', title: 'Bob\'s Burgers' },
                { type: 'series', id: 'city-39287', title: 'Family Guy' }
            ]
        }
    },
    streams: async function ({ query }) {
        const episodeId = Number((query.id || '').split('-')[1]) || 0
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
