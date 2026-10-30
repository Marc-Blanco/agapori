(function() {
    'use strict';

    const SUB_LANG = 'jp';
    const DEFAULTS = {
        server: 'http://localhost:8600',
        subSize: 50,
        subColor: '#e8e6e1',
        subbg: '#22272d',
        subbgOpacity: 55,
        subPos: 0,
        sync: 0,
    };

    let config = {...DEFAULTS};
    let configLoaded = browser.storage.local.get(Object.keys(DEFAULTS)).then((stored) => { // bruh less better
        config = {...DEFAULTS, ...stored};
    });

    function savedConfig(key, value) {
        config[key] = value;
        browser.storage.local.set({[key]: value});
    }

    const POLL_INTERVAL = 3000;
    let lastEp = null;
    let lastVideo = null;
    let lastblob = null;
    let activeCues = [];
    let statusel = null;
    let statusDot = null;
    let statusText = null;

    const EP_PATTERNS = [
        /[?&]ep(?:isode)?=(\d{1,4})\b/i,
        /\bs\d{1,2}e(\d{1,4})\b/i,
        /\b(\d{1,4})\s*화\b/i,
        /\b(\d{1,4})\s*話\b/i,
        /\bep(?;isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])e(\d{2,4})\b/i,
        /(?:^|[\s._/-])ep(\d{2,4})\b/i,
        /(?:^|[\s._/-])episode[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])ep(?:isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])e(?:p)?[\s._-]?(\d{1,4})\b/i,
    ];

    function detectEp() {
        const sources = [location.href, document.title];
        for (const src of sources) {
            for (const re of EP_PATTERNS) {
                const m = src.match(re);
                if (m) {
                    return parseInt(m[1], 10);
                }
            }
        }
        return null;
    }

    