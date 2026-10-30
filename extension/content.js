(function () {
    'use strict';

    const DEFAULTS = {
        server: 'https://localhost:8600',
        subSize : 100,
        subColor: '#e8e6e1',
        subBg: '#1e1e1e',
        subBgOpacity: 55,
        subPos: 0,
        syncMs: 0,
    };

    let config = {...DEFAULTS };
    let configLoaded = browser.storage.local.get(Object.keys(DEFAULTS)).then((stored) => {
        config = {...DEFAULTS, ...stored};
    });

    function saveConfig(key, value) {
        config[key] = value;
        browser.storage.local.set({ [key]: value });
    }

    const engine = window.AgaporiEngine.createSubtitleEngine(() => config);

    const POLL_INTERVAL = 3000; // 3 sec
    let lastEp = null;
    let lastVideo = null;
    let statusEl = null;
    let statusDot = null;
    let statusText = null;

    const EP_PATTERNS = [
        /[?&]ep(?:isode)?=(\d{1,4})\b/i,
        /\bs\d{1,2}e(\d{1,4})\b/i,
        /\bep(?:isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])e(\d{2,4})\b/i,
        /\b(\d{1,4})\s*of\s*\d{1,4}\b/i
    ];

    function detectEp() {
        const sources = [location.href, document.title];
        for (const src of sources) {
            for (const re of EP_PATTERNS) {
                const m = src.match(re);
                if (m) return String(parseInt(m[1], 10));
            }
        }
        return null;
    }

    function fetchSubtitles(ep) {
        const base = config.server.replace(/\/+$/, '');
        const url = `${base}/${ep}.srt`;
        return fetch(url).then((res) => {
            if (!res.ok) throw new Error(`Server returned HTTP ${res.status} for episode ${ep}`);
            return res.text();
        });
    }

    async function injectSubs(video, ep) {
        try {
            const subtitleText = await fetchSubtitles(ep);
            const vttText = engine.srtVtt(subtitleText);
            const cues = engine.parseVtt(vttText);
            engine.setCues(cues);

            if (!cues.length) {
                setStatus(`ep ${ep} subtitle empty or unparseable`, true);
                return;
            }

            engine.attachToVideo(video);
            setStatus(`ep ${ep} subtitle loaded`, false);
            console.log(`[Agapori] Loaded ${cues.length} subtitle cues for ep ${ep}`);
        } catch (err) {
            engine.setCues([]);
            setStatus(`ep ${ep} · ${err.message}`, true);
            console.error ('[Agapori]', err);
        }
    }

    const MSG_TYPE = 'autosubs-episode';
    const isTopFrame = window === window.top;
    let receivedEp = null;

    function broadcastEpisode(ep) {
        if (!ep) return;
        for (let i = 0; i < window.frames.length; i++) {
            try {
                window.frames[i].postMessage({ type: MSG_TYPE, ep }, '*');
            } catch (err) {
            }
        }
    }

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.type !== MSG_TYPE || !data.ep) return;
        receivedEp = String(data.ep);
    });

    function isRealVideo(video) {
        if (!video) return false;
        return !!(video.currentSrc || video.src || video.querySelector('source'));
    }

    let reportedHasVideo = false;

    function tryInject() {
        const video = document.querySelector('video');
        const playableVideo = isRealVideo(video) ? video : null;

        if (isTopFrame) {
            const ep = detectEp();
            if (ep) broadcastEpisode(ep);
        } else if (receivedEp) {
            broadcastEpisode(receivedEp);
        }

        if (!playableVideo) return;

        if (!reportedHasVideo) {
            reportedHasVideo = true;
            browser.runtime
                .sendMessage({ type: 'agapori:has-video', url: location.href })
                .catch(() => {});
            mountStatusIndicator();
        }

        const ep = isTopFrame ? detectEp() : receivedEp;
        
        if(!ep) {
            setStatus(isTopFrame ? 'waiting for episode...' : 'waiting for episode (parentpage)...', false);
            return;
        }

        const isNewEpisodeOrVideo = ep !== lastEp || playableVideo !== lastVideo;

        if (isNewEpisodeOrVideo) {
            lastEp = ep;
            lastVideo = playableVideo;
            if (engine.getCueCount()) engine.attachToVideo(playableVideo);
            injectSubs(playableVideo, ep).then(() => engine.applyStyling());
        }

        engine.applyStyling();
    }

    function mountStatusIndicator() {
        if (statusEl) return;
        const host = document.createElement('div');
        host.id = 'agapori-status-host';
        host.style.cssText = 'al:initial;position:fixed; right:12px; bottom:12px; z-index:2147483647;';
        document.documentElement.appendChild(host);
        const shadow = host.attachShadow({ mode: 'closed' });
        shadow.innerHTML = `
            <style>
                :host { all: initial; }
                .pill {
                    display: flex; align-items: center; gap 6px;
                    font-family: ui-monospace, monospace, sans-serif;
                    font-size: 12px; color: #e8e6e1;
                    background: #101216;
                    border: 1px solid #1e2025;
                    border-radius: 999px;
                    padding: 5px 10px;
                    backdrop-filter: blur(3px);
                    max-width: 300px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .dot {
                    width: 6px; height: 6px; border-radius: 50%;
                    background: #5ed0ea; box-shadow: 0 0 6px #5ed0ea;
                    flex-shrink: 0;
                }
                .dot.error { background: #e85c5c; box-shadow: 0 0 6px #e85c5c; }
            </style>
            <div class="pill">
                <span class="dot" data-dot></span>
                <span data-text>Agapori Ready</span>
            </div>
        `;
        statusEl = host;
        statusDot = shadow.querySelector('[data-dot]');
        statusText = shadow.querySelector('[data-text]');
    }

    browser.runtime.onMessage.addListener((message) => {
        if (!message || !message.type) return undefined;

        switch (message.type) {
            case 'agapori:get-state':
                return Promise.resolve({
                    ep: lastEp,
                    hasVIdeo: !!lastVideo,
                    config,
                    isTopFrame,
                });
            case 'agapori:set-config':
                const { key, value } = message;
                if (key.startsWith('sub') && key !== 'subPos') engine.applyStyling();
                if (key === 'subPos') engine.updatePosition();
                return Promise.resolve({ok: true});

            case 'agapori:set-speed': {
                if (lastVideo) lastVideo.playbackRate = message.rate;
                return Promise.resolve({ok: true, rate: lastVideo ? lastVideo.playbackRate : null});
            }

            case 'agapori:screenshot': {
                if (!lastVideo || !lastVideo.videoWidth) {
                    return Promise.resolve({ok: false, error: 'nothing to capture'});
                }
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = lastVideo.videoWidth;
                    canvas.height = lastVideo.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(lastVideo, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/png');
                    return Promise.resolve({ok: true, dataUrl});
                } catch (err) {
                    return Promise.resolve({ok: false, error: 'capture blocked (cross-origin)'});
                }
            }

            case 'agapori:pip': {
                if (!lastVideo) return Promise.resolve({ok: false, error: 'no video'});
                if (document.pictureInPictureElement) {
                    document.exitPictureInPicture();
                } else {
                    lastVideo.requestPictureInPicture().catch(() => {});
                }
                return Promise.resolve({ok: true});
            }

            default:
                return undefined;
        }
    });

    configLoaded.then(() => {
        tryInject();
        const observer = new MutationObserver(() => tryInject());
        observer.observe(document.body, { childList: true, subtree: true });
        setInterval(() => tryInject(), POLL_INTERVAL);
    });
})();

