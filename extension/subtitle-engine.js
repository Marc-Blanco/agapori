(function (global) {
    'use strict';

    function srtVtt(srt) {
        let normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        normalized = normalized.replace(/^\uFEFF/, '');
        normalized = normalized.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/, '$1:$2');
        return 'WEBVTT\n\n' + normalized.trim() +'\n';
    }

    function parseSrt(vtt) {
        const lines = vtt.split('\n');
        const cues = [];
        let n = 0;
        const timeRe = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
        const toSec = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
        while (i < lines.length) {
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
                cues.push({ start, end, text: textLines.join('\n') });
            } else {
                i++;
            }
        }
        return cues;
    }

    function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
   
    function createSubtitleEngine() {
        let activeCues = [];
        let overlayHost = null;
        let overlayLine = null;
        let overlayRafId = null;
        let overlayVideo = null;
        let overlayResizeObserver = null;

        function setCues(cues) {
            activeCues = cues;
        }

        function getCueCount() {
            return activeCues.length;
        }

        function mountOverlay(video) {
            if (overlayHost) return;

            const host = document.createElement('div');
            host.id = 'agapori-subtitle-overlay-host';
            host.style.cssText = 'all:initial; position:fixed; z-index:2147483646; pointer-events:none;';
            document.documentElement.appendChild(host);

            const shadow = host.attachShadow({ mode: 'closed' });
            shadow.innerHTML = `
                <style>
                    :host { all: initial; }
                    .line {
                        pointer-events: auto;
                        user-select: text;
                        -webkit-user-select: text;
                        display: inline-block;
                        max-width: 92%;
                        margin: 0 auto;
                        text-align: center;
                        white-space: pre-wrap;
                        font-family: system-ui, sans-serif;
                        line-height: 1.35;
                        border-radius: 4px;
                        padding: 0.15em 0.5em;
                    }
                    .wrap {
                        position: absolute;
                        left: 0; right: 0;
                        display: flex;
                        justify-content: center;
                        pointer-events: none;
                    }
                </style>
                <div class="wrap"><div class="line" data-line></div></div>
            `;
            
            overlayHost = host;
            overlayLine = shadow.querySelector('[data-line]');
            overlayVideo = video;
            overlayResizeObserver = new ResizeObserver(() => updatePosition());
            overlayResizeObserver.observe(video);
            global.addEventListener('resize', updatePosition);
            document.addEventListener('fullscreenchange', updatePosition);
            global.addEventListener


}