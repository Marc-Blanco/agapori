// ==UserScript==
// @name         Agapori Subs
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-inject local subtitles into whatever <video> is on the page, plus a small player HUD (speed, screenshot, sync offset, styling)
// @author       Ryuo
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @match        *://*/*
// @connect      localhost
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULTS = {
        server: 'http://localhost:8600',
        subSize: 100,
        subColor: '#e8e6e1',
        subBg: '#1e1e1e',
        subBgOpacity: 55,
        subpos: 0,
        syncMs: 0,
        hudX: null,
        hudY: null,
    };

    function loadConfig() {
        const config = {};
        for (const key in DEFAULTS) {
            const value = typeof GM_getValue === 'function' ? GM_getValue(key, DEFAULTS[key]) : DEFAULTS[key];
            config[key] = value;
        }
        return config;
    }

    function saveConfig(key, value) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
        }
    }

    const config = loadConfig();
    const SUB_LANG = 'en';
    const POLL_INTERVAL = 3000;
    const SPEED_STEP = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 4, 5];

    let lastEp = null;
    let lastVideo = null;
    let lastBlobUrl = null;
    let activeCues = [];
    let hudHost = null;
    let hudEls = null;
    let hudRoot = null;

    const EP_PATTERNS = [
        /\bs\d{1,2}e(\d{1,4})\b/i,
        /\bep(?:isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._/-])e(\d{2,4})\b/i,
        /[?&]ep(?:isode)?=(\d{1,4})\b/i,
    ];

    function detectEp() {
        const sources = [location.href, document.title];
        for (const src of sources) {
            for (const re of EP_PATTERNS) {
                const match = src && src.match(re);
                if (match) return String(parseInt(match[1], 10));
            }
        }
        return null;
    }

    function srtVtt(srt) {
        let normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        normalized = normalized.replace(/^\uFEFF/, '');
        normalized = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        return 'WEBVTT\n\n' + normalized.trim() + '\n';
    }

    function toSec(h, m, s, ms) {
        const parts = [h, m, s].map((n) => parseInt(n, 10));
        return parts[0] * 3600 + parts[1] * 60 + parts[2] + (parseInt(ms || 0, 10) / 1000);
    }

    function parseVtt(vtt) {
        const lines = vtt.split(/\r?\n/);
        const cues = [];
        const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
        let i = 0;

        while (i < lines.length) {
            const match = lines[i].match(timeRe);
            if (match) {
                const start = toSec(match[1].split(':')[0], match[1].split(':')[1], match[1].split(':')[2].replace(/\.\d{3}/, ''), match[1].split(':')[2].split('.')[1]);
                const end = toSec(match[2].split(':')[0], match[2].split(':')[1], match[2].split(':')[2].replace(/\.\d{3}/, ''), match[2].split(':')[2].split('.')[1]);
                i += 1;
                const textLines = [];
                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i]);
                    i += 1;
                }
                cues.push({ start, end, text: textLines.join('\n') });
            }
            i += 1;
        }

        return cues;
    }

    function buildVttFromCues(cues, syncMs) {
        const syncSec = syncMs / 1000;
        function formatTime(t) {
            const value = Math.max(0, t + syncSec);
            const h = Math.floor(value / 3600);
            const m = Math.floor((value % 3600) / 60);
            const s = Math.floor(value % 60);
            const ms = Math.floor((value % 1) * 1000);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        }

        let out = 'WEBVTT\n\n';
        cues.forEach((cue, index) => {
            out += `${index + 1}\n`;
            out += `${formatTime(cue.start)} --> ${formatTime(cue.end)}\n`;
            out += `${cue.text}\n\n`;
        });
        return out.trim() + '\n';
    }

    function fetchSubtitles(ep) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${config.server}/${ep}.srt`,
                onload: (res) => {
                    if (res.status === 200) {
                        resolve(res.responseText || res.response || '');
                    } else {
                        reject(new Error(`Server returned HTTP ${res.status} for episode ${ep}`));
                    }
                },
                onerror: () => reject(new Error(`Network error fetching episode ${ep} (is the server running?)`)),
            });
        });
    }

    async function injectSubs(video, ep) {
        try {
            const subtitleText = await fetchSubtitles(ep);
            const vttText = srtVtt(subtitleText);
            const blob = new Blob([vttText], { type: 'text/vtt' });
            const blobUrl = URL.createObjectURL(blob);

            video.querySelectorAll('track[data-injected="true"]').forEach((track) => track.remove());
            if (lastBlobUrl) {
                URL.revokeObjectURL(lastBlobUrl);
            }
            lastBlobUrl = blobUrl;

            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = `Episode ${ep}`;
            track.srclang = SUB_LANG;
            track.src = blobUrl;
            track.default = true;
            track.dataset.injected = 'true';
            video.appendChild(track);

            setTimeout(() => {
                const lastTextTrack = [...video.textTracks].at(-1);
                if (lastTextTrack) lastTextTrack.mode = 'showing';
            }, 100);

            console.log(`[autosubs] Loaded subtitles for ep ${ep}`);
        } catch (err) {
            console.error('[autosubs]', err);
        }
    }

    function rebuildTrack(video) {
        if (!video || !activeCues.length) return;
        const vttText = buildVttFromCues(activeCues, config.syncMs);
        const blob = new Blob([vttText], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);

        if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = blobUrl;

        video.querySelectorAll('track[data-injected="true"]').forEach((track) => track.remove());
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = `Episode ${lastEp}`;
        track.srclang = SUB_LANG;
        track.src = blobUrl;
        track.default = true;
        track.dataset.injected = 'true';
        video.appendChild(track);

        setTimeout(() => {
            const lastTextTrack = [...video.textTracks].at(-1);
            if (lastTextTrack) lastTextTrack.mode = 'showing';
        }, 100);
    }

    function hexToRgba(hex, alpha) {
        const cleaned = hex.replace('#', '');
        const red = parseInt(cleaned.substring(0, 2), 16);
        const green = parseInt(cleaned.substring(2, 4), 16);
        const blue = parseInt(cleaned.substring(4, 6), 16);
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function applyStyling(video) {
        let styleEl = document.getElementById('autosubs-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'autosubs-style';
            document.head.appendChild(styleEl);
        }

        const alpha = (config.subBgOpacity / 100).toFixed(2);
        const bg = hexToRgba(config.subBg, alpha);
        styleEl.textContent = `
            video::cue {
                font-size: ${config.subSize}px;
                color: ${config.subColor};
                background-color: ${bg};
                text-shadow: 1px 1px 2px black;
                line-height: 1.4;
            }
        `;
    }

    const MSG_TYPE = 'autosubs';
    const isTopFrame = window === window.top;
    let receivedEp = null;

    console.log(`[autosubs] script loaded in ${isTopFRame ? 'Top Frame' : 'a sub-frame'} - ${location.href}`);
    
    function broadcastEp(ep) {
        if (!ep) return;
        console.log(`[autosubs] broadcasting episode ep=${ep} to ${window.frames.length} child frames`);
        for (let i = 0; i < window.frames.length; i++) {
            try {
                window.frames[i].postMessage({ type: MSG_TYPE, ep }, '*');
                console.log(`[autosubs] sent episode ep=${ep} to frame ${i}`);
            } catch (err) {
            
            }
        }
    }

    window.addEventListener('message', (event) => {
        if (event.source === window) return;
        const data = event.data;
        if (!data || data.type !== MSG_TYPE) return;
        console.log(`[autosubs] received episode ep=${data.ep} via postMessage from ${location.href}`);
        receivedEp = data.ep;
    });

    function isthisreal(video) {
        if (!video) return false;
        const hassauce = !!(video.currentSrc || video.src || video.querySelector('source')?.src);
        return hassauce;
    }

    function tryInject() {
        const video = document.querySelector('video');
        const playablevideo = isthisreal(video) ? video : null;
        if (!isTopFrame) {
            const ep = detectEp();
            if (ep) broadcastEp(ep);
        } else if (recivedEp) {
            broadcastEp(receivedEp);
        }

        if (!playablevideo) return;

        const ep = isTopFrame ? detectEp() : receivedEp;

        applyStyling(playablevideo);
        mountHud(playablevideo);

        if (!ep) {
            setHudStatus(isTopFrame ? 'Waiting for episode…' : 'Waiting for episode number form parent frame...',
                false

            );
            return;
        }

        if (ep === lastEp && video === lastVideo) {
            return;
        }

        lastEp = ep;
        lastVideo = playablevideo;
        if (activeCues.length) rebuildTrack(playablevideo);
        injectSubs(playablevideo, ep);
    }

    const HUD_TEMPLATE = `
    <style>
      :host { all: initial; }
      .root {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        background: #101216;
        border: 1px solid #1E2025;
        border-radius: 10px;
        color: #E8E6E1;
        width: 230px;
        box-shadow: 0 8px 24px rgba(0,0,0,.45);
        user-select: none;
        font-size: 12px;
      }
      .header {
        display:flex; align-items:center; justify-content:space-between;
        padding:8px 10px; cursor:grab; border-bottom:1px solid #1E2025;
        letter-spacing:.06em; text-transform:uppercase; font-size:10.5px;
        color:#5EEAD4;
      }
      .header .dot { width:6px;height:6px;border-radius:50%;background:#5EEAD4; box-shadow:0 0 6px #5EEAD4; display:inline-block; margin-right:6px;}
      .collapse-btn { background:none;border:none;color:#8A8D93;cursor:pointer;font-size:13px;padding:0 4px; }
      .body { padding:10px; display:flex; flex-direction:column; gap:8px; }
      .body.collapsed { display:none; }
      .status { font-size:11px; color:#8A8D93; line-height:1.4; min-height:14px; word-break:break-word; }
      .status.err { color:#E85C5C; }
      .row { display:flex; gap:6px; align-items:center; }
      button.ctl {
        flex:1; font-family:inherit; background:#0B0C0F; border:1px solid #1e2025; color:#E8E6E1;
        padding:6px 4px; border-radius:6px; font-size:11px; cursor:pointer;
      }
      button.ctl:hover { border-color:#5EEAD4; color:#5EEAD4; }
      .speed-label { min-width:36px; text-align:center; color:#8A8D93; font-size:11px; }
      details { border-top:1px solid #111111; padding-top:8px; margin-top:2px; }
      summary { cursor:pointer; color:#8A8D93; font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; }
      .field { margin-top:8px; }
      .field label { display:flex; justify-content:space-between; font-size:10.5px; color:#8A8D93; margin-bottom:4px; }
      input[type="range"] { width:100%; accent-color:#5EEAD4; }
      input[type="color"] { width:100%; height:24px; border:1px solid #1E2025; border-radius:4px; background:#0B0C0F; padding:1px; }
      input[type="text"] { width:100%; font-family:inherit; background:#0B0C0F; border:1px solid #1E2025; color:#E8E6E1; border-radius:4px; padding:5px 6px; font-size:11px; }
    </style>
    <div class="root">
      <div class="header" data-drag-handle>
        <span><span class="dot"></span>autosubs</span>
        <button class="collapse-btn" data-collapse>–</button>
      </div>
      <div class="body" data-body>
        <div class="status" data-status>waiting for episode…</div>
        <div class="row">
          <button class="ctl" data-speed-down>−speed</button>
          <span class="speed-label" data-speed-label>1.0×</span>
          <button class="ctl" data-speed-up>+speed</button>
        </div>
        <div class="row">
          <button class="ctl" data-shot>📷 shot</button>
          <button class="ctl" data-pip>pip</button>
        </div>
        <details>
          <summary>subtitle style</summary>
          <div class="field">
            <label><span>size</span><span data-size-val>100%</span></label>
            <input type="range" min="50" max="220" value="100" data-size />
          </div>
          <div class="field">
            <label><span>text color</span></label>
            <input type="color" value="#e8e6e1" data-color />
          </div>
          <div class="field">
            <label><span>bg opacity</span><span data-bgop-val>55%</span></label>
            <input type="range" min="0" max="100" value="55" data-bgop />
          </div>
          <div class="field">
            <label><span>sync offset</span><span data-sync-val>0.0s</span></label>
            <input type="range" min="-1000" max="1000" step="10" value="0" data-sync />
          </div>
        </details>
        <details>
          <summary>server</summary>
          <div class="field">
            <input type="text" data-server-input value="http://localhost:8600" />
          </div>
        </details>
      </div>
    </div>
  `;

    function collectHudEls(shadow) {
        const q = (selector) => shadow.querySelector(selector);
        return {
            root: q('.root'),
            header: q('[data-drag-handle]'),
            collapseBtn: q('[data-collapse]'),
            body: q('[data-body]'),
            status: q('[data-status]'),
            speedDown: q('[data-speed-down]'),
            speedUp: q('[data-speed-up]'),
            speedLabel: q('[data-speed-label]'),
            shot: q('[data-shot]'),
            pip: q('[data-pip]'),
            size: q('[data-size]'),
            sizeVal: q('[data-size-val]'),
            color: q('[data-color]'),
            bgop: q('[data-bgop]'),
            bgopVal: q('[data-bgop-val]'),
            sync: q('[data-sync]'),
            syncVal: q('[data-sync-val]'),
            serverInput: q('[data-server-input]'),
        };
    }

    function setHudStatus(msg, isError = false) {
        if (!hudEls) return;
        hudEls.status.textContent = msg;
        hudEls.status.classList.toggle('err', !!isError);
    }

    function applySavedStylesToInputs() {
        if (!hudEls) return;
        hudEls.size.value = config.subSize;
        hudEls.sizeVal.textContent = `${config.subSize}%`;
        hudEls.color.value = config.subColor;
        hudEls.bgop.value = config.subBgOpacity;
        hudEls.bgopVal.textContent = `${config.subBgOpacity}%`;
        hudEls.sync.value = config.syncMs;
        hudEls.syncVal.textContent = `${(config.syncMs / 1000).toFixed(2)}s`;
        hudEls.serverInput.value = config.server;
    }

    function clampToViewport(x, y) {
        const w = (hudHost && hudHost.offsetWidth) || 230;
        const h = (hudHost && hudHost.offsetHeight) || 200;
        const maxX = Math.max(0, window.innerWidth - w - 4);
        const maxY = Math.max(0, window.innerHeight - h - 4);
        return {
            x: Math.min(Math.max(0, x), maxX),
            y: Math.min(Math.max(0, y), maxY),
        };
    }

    function positionHud() {
        if (!hudHost) return;
        const x = config.hudX;
        const y = config.hudY;
        if (x !== null && y !== null) {
            const clamped = clampToViewport(x, y);
            hudHost.style.left = `${clamped.x}px`;
            hudHost.style.top = `${clamped.y}px`;
            hudHost.style.right = 'auto';
            hudHost.style.bottom = 'auto';
        } else {
            hudHost.style.left = 'auto';
            hudHost.style.top = 'auto';
            hudHost.style.right = '18px';
            hudHost.style.bottom = '18px';
        }
    }

    function resetHudPosition() {
        config.hudX = null;
        config.hudY = null;
        saveConfig('hudX', null);
        saveConfig('hudY', null);
        positionHud();
    }

    function mountHud(video) {
        if (hudHost) return;

        const host = document.createElement('div');
        host.id = 'autosubs-hud';
        host.style.cssText = 'all:initial; position:fixed; z-index:2147483647;';
        document.documentElement.appendChild(host);

        const shadow = host.attachShadow({ mode: 'closed' });
        const wrap = document.createElement('div');
        wrap.innerHTML = HUD_TEMPLATE;
        shadow.appendChild(wrap);

        hudHost = host;
        hudRoot = shadow;
        hudEls = collectHudEls(shadow);
        positionHud();
        wireHud(host, video);
        applySavedStylesToInputs();
    }

    function setSpeed(rate) {
        const video = document.querySelector('video');
        if (video) video.playbackRate = rate;
        if (hudEls) {
            hudEls.speedLabel.textContent = rate.toFixed(2).replace(/\.?0+$/, '') + '×';
        }
    }

    function stepSpeed(dir) {
        const video = document.querySelector('video');
        const cur = video ? video.playbackRate : 1;
        let index = SPEED_STEP.findIndex((value) => Math.abs(value - cur) < 0.01);
        if (index === -1) {
            index = SPEED_STEP.findIndex((value) => value > cur);
            if (index === -1) index = SPEED_STEP.length - 1;
        }
        index += dir;
        index = Math.max(0, Math.min(SPEED_STEP.length - 1, index));
        setSpeed(SPEED_STEP[index]);
    }

    function wireHud(host, initialVideo) {
        const getVideo = () => document.querySelector('video') || initialVideo;
        let dragging = false;
        let dragOffset = { x: 0, y: 0 };

        hudEls.collapseBtn.addEventListener('click', () => {
            const collapsed = hudEls.body.classList.toggle('collapsed');
            hudEls.collapseBtn.textContent = collapsed ? '+' : '–';
        });

        hudEls.header.addEventListener('mousedown', (event) => {
            dragging = true;
            const rect = host.getBoundingClientRect();
            dragOffset.x = event.clientX - rect.left;
            dragOffset.y = event.clientY - rect.top;
            event.preventDefault();
        });

        document.addEventListener('mousemove', (event) => {
            if (!dragging) return;
            const newX = event.clientX - dragOffset.x;
            const newY = event.clientY - dragOffset.y;
            host.style.left = `${newX}px`;
            host.style.top = `${newY}px`;
            host.style.right = 'auto';
            host.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            const rect = host.getBoundingClientRect();
            saveConfig('hudX', rect.left);
            saveConfig('hudY', rect.top);
            config.hudX = rect.left;
            config.hudY = rect.top;
        });
        hudEls.followFullscreen.checked = !!config.followFullscreen;
        hudEls.followFullscreen.addEventListener('change', () => {
            config.followFullscreen = hudEls.followFullscreen.checked;
            saveConfig('followFullscreen', config.followFullscreen);
        });
        
        
        document.addEventListener('click', () => {
            resetHudPosition();
            setHudStatus('HUD position reset to default', false);
        });

        hudEls.speedDown.addEventListener('click', () => stepSpeed(-1));
        hudEls.speedUp.addEventListener('click', () => stepSpeed(1));

        hudEls.shot.addEventListener('click', () => {
            const video = getVideo();
            if (!video || !video.videoWidth) {
                setHudStatus('No video to screenshot', true);
                return;
            }

            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `screenshot_${Date.now()}.png`;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                }, 'image/png');
                setHudStatus('Screenshot taken');
            } catch (error) {
                console.error(error);
                setHudStatus('Error taking screenshot', true);
            }
        });

        hudEls.pip.addEventListener('click', async () => {
            const video = getVideo();
            if (!video) return;

            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else {
                    await video.requestPictureInPicture();
                }
            } catch (error) {
                console.error(error);
                setHudStatus('Error toggling PiP', true);
            }
        });

        hudEls.size.addEventListener('input', () => {
            config.subSize = parseFloat(hudEls.size.value);
            hudEls.sizeVal.textContent = `${config.subSize}%`;
            saveConfig('subSize', config.subSize);
            applyStyling(getVideo());
        });

        hudEls.color.addEventListener('input', () => {
            config.subColor = hudEls.color.value;
            saveConfig('subColor', config.subColor);
            applyStyling(getVideo());
        });

        hudEls.bgop.addEventListener('input', () => {
            config.subBgOpacity = parseInt(hudEls.bgop.value, 10);
            hudEls.bgopVal.textContent = `${config.subBgOpacity}%`;
            saveConfig('subBgOpacity', config.subBgOpacity);
            applyStyling(getVideo());
        });

        hudEls.sync.addEventListener('input', () => {
            config.syncMs = parseInt(hudEls.sync.value, 10);
            hudEls.syncVal.textContent = `${(config.syncMs / 1000).toFixed(2)}s`;
            saveConfig('syncMs', config.syncMs);
            rebuildTrack(getVideo());
        });

        hudEls.serverInput.addEventListener('change', () => {
            config.server = hudEls.serverInput.value.trim();
            saveConfig('server', config.server);
        });

        document.addEventListener('keydown', (event) => {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (document.activeElement && document.activeElement.isContentEditable) return;

            const video = getVideo();
            if (!video) return;

            switch (event.key) {
                case '[':
                    stepSpeed(-1);
                    break;
                case ']':
                    stepSpeed(1);
                    break;
                case '\\':
                    setSpeed(1);
                    break;
                case ',':
                    config.syncMs -= 100;
                    hudEls.sync.value = config.syncMs;
                    hudEls.syncVal.textContent = `${(config.syncMs / 1000).toFixed(1)}s`;
                    saveConfig('syncMs', config.syncMs);
                    rebuildTrack(video);
                    break;
                case '.':
                    config.syncMs += 100;
                    hudEls.sync.value = config.syncMs;
                    hudEls.syncVal.textContent = `${(config.syncMs / 1000).toFixed(1)}s`;
                    saveConfig('syncMs', config.syncMs);
                    rebuildTrack(video);
                    break;
                default:
                    break;
            }
        });
    }

    tryInject();
    const observer = new MutationObserver(() => tryInject());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(tryInject, POLL_INTERVAL);
})();