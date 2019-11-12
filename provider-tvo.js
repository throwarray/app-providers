const cheerio = require('cheerio')
const request = require('request')
const { promisify } = require('util')
const { getSources, getStreams } = require('./lib-brightcove')

const fetch = promisify(request)
const MATCH_META_PREFIX = /^([^-]+)-(.*)$/
const BC_CONFIG = {
    accountId: '18140038001',
    policyKey: 'BCpkADawqM3GcA9H_gBNu1EPAEzHOmt9V6K6mOV7VWq1gPo3nGbZYy2Jcwhn8Pfs2Wx0D7Wq1zrWfiMOhNBJBlVq5SzWZZk_ec22WqI-JAksHAz9Zrvv-0JX4G4',
    referrer: 'https://www.tvo.org/video/documentaries/'
}

function parseCollectionFromHTML (html) {
    const $ = cheerio.load(html)
    const fields = $('.field-content a')
    const noResults = !!$('.no-results').length
    const output = []

    // const moreAnchor = $('.strand-load-more')
    // const moreHref = moreAnchor.attr('href')

    if (noResults) return output

    fields.each(function () {
        const $elem = $(this)
        const thumbWrapper =  $elem.find('.bc-thumb-wrapper')
        const thumb = thumbWrapper.find('img')
        const mediaPath = $elem.attr('href')

        let thumbSrc = thumb.attr('src')

        const title = $elem.find('.views-field-title').text()
        const isSeries = thumbWrapper.hasClass('no-play')

        if (isSeries && thumbSrc) thumbSrc = 'https://www.tvo.org' + thumbSrc

        if (thumbSrc && thumbSrc.startsWith('https://') && title) {
            const refId = thumb.attr('data-bc-ref-id')

            output.push({
                id: refId? `tvo-ref:${refId}` : ('tvo-' + encodeURIComponent(mediaPath)),
                type: isSeries || !refId ? 'series' : 'movie',
                title,
                poster: thumbSrc
            })
        }
    })

    return output
}

function combineURLS(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL
}

async function getSeason ({ query }) {
    const [,, view] = (query.id || '').match(MATCH_META_PREFIX) || []
    const view_path = decodeURIComponent(view)
    const page_url = combineURLS('https://www.tvo.org', view_path)
    const page_response = await fetch({ 
        url: page_url, 
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Upgrade-Insecure-Requests': '1'
        }
    })

    const page = cheerio.load(page_response.body)
    const nid = page('head meta[name="nid"]').attr('content')

    const season = []
    const seasons = page('button[data-season-value]')
    const seasonMap = new Map()    

    let first
    
    seasons.each(function () {
        const seasonElem = page(this)
        const seasonNumber = Number(seasonElem.attr('data-season-value')) || 1
        const seasonInstance = {
            type: 'season',
            season: seasonNumber
        }
        
        if (!first) first = seasonInstance
        
        seasonMap.set(seasonNumber, seasonInstance)
    })
    
    const field_season_value = Number(query.season !== void 0 ? query.season : first && first.season) || 1

    seasonMap.get(field_season_value).items = season

    const response = await fetch({
        url: 'https://www.tvo.org/views/ajax?_wrapper_format=drupal_ajax',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://www.tvo.org/'
        },
        form: {
            field_season_value,
            view_name: 'program_video_listing',
            view_display_id: 'season_filter',
            view_args: Number(nid),
            view_path,
            view_base_path: '',
            view_dom_id: '4543836b84ad34210efa621c0dea233871755bdbaf89b9b0f4feb142589d1b86',
            pager_element: 0,
            _drupal_ajax: 1,
            'ajax_page_state[theme]': 'tvo',
            'ajax_page_state[theme_token]': '',
            'ajax_page_state[libraries]': 'anchor_link/drupal.anchor_link,bootstrap/popover,bootstrap/tooltip,core/html5shiv,entity_browser/common,glazed/bootstrap3,glazed/global-styling,glazed_builder/bootstrap_light,glazed_builder/core,glazed_builder/elements.font_awesome,system/base,tvo/footer-menu,tvo/global-styling,tvo/masonry-menu,tvo/modal,tvo/program-page,tvo/season-filter,tvo_brightcove/brightcove.thumblazy,tvo_external_link/external.new_tab,tvo_gtm/global-gtm,view_scroll_fade/view_scroll_fade,views/views.module,views_infinite_scroll/views-infinite-scroll'
        },
        "method": "POST"
    }) 
    
    const json = JSON.parse(response.body)
    const command = json.find(function (command) { return command.command === 'insert' })
    const $ = cheerio.load(command.data)
    const rows = $('.views-row')

    rows.each(function () {
        const row = $(this)
        const thumb = row.find('.views-field a .bc-thumb-wrapper img')
        const refId = thumb.attr('data-bc-ref-id')

        let thumbSrc = thumb.attr('src')

        if (thumbSrc && thumbSrc.startsWith('/')) thumbSrc = 'https://www.tvo.org' + thumbSrc

        const title = row.find('.views-field-title a').text()
        const description = row.find('.views-field-field-summary .field-content').text()

        if (refId) {
            season.push({
                id: 'tvo-ref:' + refId,
                poster: thumbSrc,
                season: field_season_value,
                episode: season.length + 1,
                title,
                description
            })
        }
    })

    return {
        type: 'series',
        title: query.title,
        season: field_season_value,
        seasons: [...seasonMap.values()]
    }
}

async function collection ({ query }) {
    if (query.id === 'tvo') {
        return {
            id: 'tvo',
            type: 'collection',
            items: [
                { type: 'collection', id: 'tvo-all', title: 'All', height: 115 },
                { type: 'collection', id: 'tvo-Art', title: 'Art', height: 115 },
                { type: 'collection', id: 'tvo-Canadian Docs', title: 'Canadian Docs', height: 115 },
                { type: 'collection', id: 'tvo-Current Affairs', title: 'Current Affairs', height: 115 },
                { type: 'collection', id: 'tvo-Drama', title: 'Drama', height: 115 },
                { type: 'collection', id: 'tvo-Environment', title: 'Environment', height: 115 },
                { type: 'collection', id: 'tvo-History', title: 'History', height: 115 },
                { type: 'collection', id: 'tvo-International Docs', title: 'International Docs', height: 115 },
                { type: 'collection', id: 'tvo-National Geographic', title: 'National Geographic', height: 115 },
                { type: 'collection', id: 'tvo-Science', title: 'Science', height: 115 },
                { type: 'collection', id: 'tvo-Society', title: 'Society', height: 115 },
                { type: 'collection', id: 'tvo-Technology', title: 'Technology', height: 115 }
            ]
        }
    }

    const [,, category = 'all'] = (query.id || '').match(MATCH_META_PREFIX) || []
    const page = Number(query.page) || 1
    const skip = (page - 1) * 16
    const { body } = await fetch({
        url: `https://www.tvo.org/documentaries/browse/strands/ajax/${category}/${skip}?_wrapper_format=drupal_ajax`,
        json: true,
        headers: {
            Host: 'www.tvo.org',
            Origin: 'https://www.tvo.org',
            Referer: 'https://www.tvo.org/documentaries/browse'
        }
    })

    const html = body && Array.isArray(body) && body.length && body[0].data
    const items = parseCollectionFromHTML(html || '')

    if (!items.length) throw new Error('Invalid response')

    return {
        id: query.id,
        title: 'TVO',
        items,
        page
    }
}

async function streams ({ query }) {
    const [,, contentId] = (query.id || '').match(MATCH_META_PREFIX) || []
    const streams = await getStreams(contentId, BC_CONFIG)

    return streams
}

async function meta ({ query }) {
    let poster

    if (query.type === 'series') {
        const response = await getSeason({ query })

        return response
    }

    const contentId = (query.id || '').split('-')[1]
    const data = await getSources(contentId, BC_CONFIG)

    const { 
        name: title = query.title, 
        description, 
        poster_sources 
    } = data

    if (Array.isArray(poster_sources)) {
        const found = poster_sources.find(function (poster) {
            return poster && poster.src.startsWith('https://')
        })

        if (found) poster = found.src
    }

    return {
        id: query.id,
        title,
        description,
        poster,
        type: 'movie',
        _dev: data
    }
}

module.exports = {
    streams,
    collection,
    meta
}