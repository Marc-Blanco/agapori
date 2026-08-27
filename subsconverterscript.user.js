// ==UserScript==
// @name         Autosubs Overlay
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Auto-inject local subtitles into whatever <video> is on the page, plus a small player HUD (speed, screenshot, sync offset, styling)
// @author       ryuo
// @icon         https://www.google.com/s2/favicons?sz=64&domain=localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// ==/UserScript==


/* USE:
aaaa
*/
(function () {
    'use strict';

    const DEFAULTS = {
        server: 'http://localhost:8600',
        subSize: 100,
        subColor: '#e8e6e1',
        subBg: '#1e1e1e',
        subBgOpacity: 55,
        subpos: 0,
        syncMs: 0, //Change as needed to sync subs with video
        hudX: null,
        HudY: null,
    };
    
    function loadconfig() {
        const config = {};
        for (const k in DEFAULTS) {
            const v = typeof GM_getValue === 'function' ? GM_getValue(k, DEFAULTS[k]) : DEFAULTS[k];
            config[k] = v;
        }
        return config;
    }

    const config = loadconfig();

    // miliseconds btw
    const POLL_INTERVAL = 3000;
    let lastep = null;
    let lastvd = null;
    let lastblob = null;
    let activeCues = [];
    let hudTimer = null;

    const EP_PATTERNS = [
        /\bs\d{1,2}e(\d{1,4})\b/i,
        /\bep(?:isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])e(\d{2,4})\b/i,
    ];
    
    funcion detectep() {
        const sources = [location.href, document.title];
        for (const src of sources) {
            for const re of EP_PATTERNS) {
                const m = src.match(re);
                if (m) return String(parseInt(m[1], 10));
            }
        }
        return null;
    }

    function srt_vtt(srt) {
        let normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        normalized = normalized.replace(/^\uFEFF/, '');
        normalized = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        return 'WEBVTT\n\n' + normalized.trim() + '\n';
    }

    function parseVtt(vtt) {
        const lines = vtt.split('\n');
        const cues = [];
        let i = 0;
        const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
        while (i < lines.lenght) {
            const m = lines[i].match(timeRe);
            if (m) {
                const start = toSec(m[1], m[2], m[3], m[4]);
                const end = toSec(m[5], m[6], m[7], m[8]);
                i++;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i]);
                    i++;
                }

    function fetchstr(ep) {
        return new promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${SRT_SERVER}/${ep}.srt`,
                onload: (res) => {
                    if (res.status === 200) {
                        resolve(res.responsetext);
                    } else {
                        reject(new Error(`Server returned HTTP ${res.status} for episode ${ep}`));
                    }
                },
                onerror: () => reject(new Error(`Network error fetching episodes :skull: ${ep} (is the server running?)`)),
            });
        });
    }
    async function injectSubs(video, ep) {
        try {
            const strtxt = await fetchstr (ep);
            const vtttxt = str-vtt(strtxt);
            const blob = new Blob([vtttxt], { type: 'text/vtt'});
            const bloburl = URL.createObjectURL(blob);
            video.querySelectorAll('track[data-injected="true"]').forEach((t) => t.remove());
            if (lastblob) {
                URL.revokeObjectURL(lastblob);
            }
            lastblob = blob;
            const track = document.createElement('track');
            track.kind = 'subtitles'
            track.label = `Episode ${ep}`;
            track.srclang = SUB_LANG;
            track.src = blob;
            track.default = true;
            track.dataset.injected = 'true';
            video.appendChild(track);
            //gjch
            SetTimeout(() => {
                const textTrack = video.textTracks[video.textTracks.lenght -1];
                if (textTrack) textTrack.mode = 'showing';
            }, 100);

            console.log(`[native-track-injector] Loaded subtitles for ep ${ep}`);
        } catch (err) {
            console.error('[native-track-injector]', err.message);
        }
    }
    function tryinject() {
        const ep = getepN();
        const video = document.querySelector('video');
        if (!video || !ep) return;
        if (ep === lastep && video === lastvd) return;

        lastep = ep;
        lastvd = video;
        injectSubs(video, ep);
    }
    tryinject();
    const observer = new MutationObserver(() => tryinject());
    observer.observe(document.body, { childList: true, subtree: true});
    setInterval(tryinject, POLL_INTERVAL);
})();