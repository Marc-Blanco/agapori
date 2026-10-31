(function () {
    'use strict';

    const DEFAULTS = {
        server: 'http://localhost:8600',
        subSize: 100,
        subColor: '#e8e6e1',
        subBg: '#1e1e1e',
        subBgOpacity: 55,
        subPos: 0,
        syncMs: 0,
    };

    let config = { ...DEFAULTS };
    let videoName = null;

    const engine = window.AgaporiEngine.createSubtitleEngine(() => config);

    const video = document.getElementById('video');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const pickFileBtn = document.getElementById('pick-file-btn');
    const hud = document.getElementById('hud');
    const seek = document.getElementById('seek');
    const timeLabel = document.getElementById('time');
    const playpauseBtn = document.getElementById('playpause');
    const speedLabel = document.getElementById('speed-label');
    const settings = document.getElementById('settings');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsClose = document.getElementById('settings-close');
    const serverUrlInput = document.getElementById('server-url');

    browser.storage.local.get(Object.keys(DEFAULTS)).then((stored) => {
        config = { ...DEFAULTS, ...stored };
        serverUrlInput.value = config.server;
        document.getElementById('sub-size').value = config.subSize;
        document.getElementById('sub-color').value = config.subColor;
        document.getElementById('sub-bg').value = config.subBg;
        document.getElementById('sub-bg-opacity').value = config.subBgOpacity;
        document.getElementById('sub-pos').value = config.subPos;
        document.getElementById('sub-sync').value = config.syncMs;
        document.getElementById('fs-val').textContent = config.subSize + '%';
        document.getElementById('bg-op-val').textContent = config.subBgOpacity + '%';
        document.getElementById('pos-val').textContent = config.subPos + 'px';
        document.getElementById('sync-val').textContent = (config.syncMs / 1000).toFixed(1) + 's';
    });

    function saveConfig(key, value) {
        config[key] = value;
        browser.storage.local.set({ [key]: value });
    }

    
    const EP_PATTERNS = [
        /\bs\d{1,2}e(\d{1,4})\b/i,
        /\bep(?:isode)?[\s._-]?(\d{1,4})\b/i,
        /(?:^|[\s._-])e(\d{2,4})\b/i,
        /[\s._-](\d{1,4})(?=\.\w+$)/,
    ];

    function detectEpisode(name) {
        if (!name) return null;
        for (const re of EP_PATTERNS) {
            const m = name.match(re);
            if (m) return String(parseInt(m[1], 10));
        }
        return null;
    }


    function fetchSrt(ep) {
        const base = config.server.replace(/\/+$/, '');
        return fetch(`${base}/${ep}.srt`).then((res) => {
            if (!res.ok) throw new Error(`Server returned HTTP ${res.status} for episode ${ep}`);
            return res.text();
        });
    }

    async function loadSubsForEpisode(ep) {
        try {
            const srtText = await fetchSrt(ep);
            const vtt = engine.srtVtt(srtText);
            const cues = engine.parseVtt(vtt);
            engine.setCues(cues);
            if (cues.length) {
                engine.attachToVideo(video);
                engine.applyStyling();
            }
        } catch (err) {
            console.error('[agapori-player]', err.message);
        }
    }

    function maybeLoadSubs(name) {
        const ep = detectEpisode(name);
        if (ep) loadSubsForEpisode(ep);
    }

    
    function loadVideoFromFile(file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        video.load();
        video.play().catch(() => {});
        dropzone.style.display = 'none';
        videoName = file.name;
        maybeLoadSubs(file.name);
    }

    ['dragenter', 'dragover'].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragging');
        })
    );
    ['dragleave', 'drop'].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragging');
        })
    );
    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadVideoFromFile(file);
    });
    pickFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) loadVideoFromFile(fileInput.files[0]);
    });

    
    function fmtTime(t) {
        if (!isFinite(t)) return '00:00';
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60);
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    video.addEventListener('loadedmetadata', () => {
        seek.max = video.duration || 100;
        hud.classList.remove('hidden');
    });
    video.addEventListener('timeupdate', () => {
        if (!seek.matches(':active')) seek.value = video.currentTime;
        timeLabel.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
    });
    seek.addEventListener('input', () => {
        video.currentTime = parseFloat(seek.value);
    });
    video.addEventListener('play', () => (playpauseBtn.textContent = '⏸'));
    video.addEventListener('pause', () => (playpauseBtn.textContent = '▶'));

    function togglePlay() {
        if (video.paused) video.play();
        else video.pause();
    }
    playpauseBtn.addEventListener('click', togglePlay);
    document.getElementById('back10').addEventListener('click', () => (video.currentTime -= 10));
    document.getElementById('fwd10').addEventListener('click', () => (video.currentTime += 10));

    const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    function setSpeed(rate) {
        video.playbackRate = rate;
        speedLabel.textContent = rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + '×';
    }
    function stepSpeed(dir) {
        const cur = video.playbackRate;
        let idx = SPEED_STEPS.findIndex((s) => Math.abs(s - cur) < 0.001);
        if (idx === -1) idx = SPEED_STEPS.indexOf(1);
        idx = Math.min(SPEED_STEPS.length - 1, Math.max(0, idx + dir));
        setSpeed(SPEED_STEPS[idx]);
    }
    document.getElementById('speed-up').addEventListener('click', () => stepSpeed(1));
    document.getElementById('speed-down').addEventListener('click', () => stepSpeed(-1));
    setSpeed(1);

    
    function takeScreenshot() {
        if (!video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = fmtTime(video.currentTime).replace(/:/g, '-');
            const base = (videoName || 'frame').replace(/\.[^.]+$/, '');
            a.href = url;
            a.download = `${base}_${stamp}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }, 'image/png');
    }
    document.getElementById('shot-btn').addEventListener('click', takeScreenshot);

    
    document.getElementById('pip-btn').addEventListener('click', async () => {
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await video.requestPictureInPicture();
        } catch (err) {
            /* unavailable in this context; ignore */
        }
    });
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.getElementById('stage').requestFullscreen();
    });

    
    settingsBtn.addEventListener('click', () => settings.classList.add('open'));
    settingsClose.addEventListener('click', () => settings.classList.remove('open'));

    serverUrlInput.addEventListener('change', () => {
        saveConfig('server', serverUrlInput.value.trim() || DEFAULTS.server);
    });

    function bindRange(id, valId, fmt, onChange) {
        const el = document.getElementById(id);
        const valEl = valId ? document.getElementById(valId) : null;
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            if (valEl) valEl.textContent = fmt(v);
            onChange(v);
        });
    }

    bindRange('sub-size', 'fs-val', (v) => v + '%', (v) => { saveConfig('subSize', v); engine.applyStyling(); });
    bindRange('sub-bg-opacity', 'bg-op-val', (v) => v + '%', (v) => { saveConfig('subBgOpacity', v); engine.applyStyling(); });
    bindRange('sub-pos', 'pos-val', (v) => v + 'px', (v) => { saveConfig('subPos', v); engine.updatePosition(); });
    bindRange('sub-sync', 'sync-val', (v) => (v / 1000).toFixed(1) + 's', (v) => { saveConfig('syncMs', v); });

    document.getElementById('sub-color').addEventListener('input', (e) => {
        saveConfig('subColor', e.target.value);
        engine.applyStyling();
    });
    document.getElementById('sub-bg').addEventListener('input', (e) => {
        saveConfig('subBg', e.target.value);
        engine.applyStyling();
    });

    
    function adjustSync(deltaMs) {
        const v = config.syncMs + deltaMs;
        saveConfig('syncMs', v);
        document.getElementById('sub-sync').value = v;
        document.getElementById('sync-val').textContent = (v / 1000).toFixed(1) + 's';
    }

    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'arrowleft':
                video.currentTime -= 5;
                break;
            case 'arrowright':
                video.currentTime += 5;
                break;
            case 'arrowup':
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.1);
                break;
            case 'arrowdown':
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.1);
                break;
            case 'j':
                video.currentTime -= 10;
                break;
            case 'l':
                video.currentTime += 10;
                break;
            case '[':
                stepSpeed(-1);
                break;
            case ']':
                stepSpeed(1);
                break;
            case 's':
                takeScreenshot();
                break;
            case 'p':
                document.getElementById('pip-btn').click();
                break;
            case 'f':
                document.getElementById('fullscreen-btn').click();
                break;
            case 'm':
                video.muted = !video.muted;
                break;
            case ',':
                adjustSync(-100);
                break;
            case '.':
                adjustSync(100);
                break;
        }
    });

    
    let hudTimer = null;
    function showHud() {
        hud.classList.remove('hidden');
        clearTimeout(hudTimer);
        hudTimer = setTimeout(() => {
            if (!video.paused) hud.classList.add('hidden');
        }, 2800);
    }
    ['mousemove', 'click'].forEach((evt) => document.getElementById('stage').addEventListener(evt, showHud));
    video.addEventListener('play', showHud);

    const localView = document.getElementById('local-view');
    const remoteView = document.getElementById('remote-view');
    const modeLocalBtn = document.getElementById('mode-local');
    const modeRemoteBtn = document.getElementById('mode-remote');

    function setMode(mode) {
        const isLocal = mode === 'local';
        localView.classList.toggle('hidden', !isLocal);
        remoteView.classList.toggle('hidden', isLocal);
        modeLocalBtn.classList.toggle('active', isLocal);
        modeRemoteBtn.classList.toggle('active', !isLocal);
        if (!isLocal) refreshTabList();
    }
    modeLocalBtn.addEventListener('click', () => setMode('local'));
    modeRemoteBtn.addEventListener('click', () => setMode('remote'));

    
    const SPEED_STEPS_REMOTE = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
    let remoteTabId = null;
    let remoteSpeed = 1;

    const r = {
        dot: document.getElementById('r-status-dot'),
        status: document.getElementById('r-status-text'),
        tabSelect: document.getElementById('r-tab-select'),
        refreshBtn: document.getElementById('r-refresh-btn'),
        speedDown: document.getElementById('r-speed-down'),
        speedUp: document.getElementById('r-speed-up'),
        speedLabel: document.getElementById('r-speed-label'),
        shotBtn: document.getElementById('r-shot-btn'),
        pipBtn: document.getElementById('r-pip-btn'),
        size: document.getElementById('r-size'),
        sizeVal: document.getElementById('r-size-val'),
        color: document.getElementById('r-color'),
        bg: document.getElementById('r-bg'),
        bgop: document.getElementById('r-bgop'),
        bgopVal: document.getElementById('r-bgop-val'),
        sync: document.getElementById('r-sync'),
        syncVal: document.getElementById('r-sync-val'),
        serverInput: document.getElementById('r-server-input'),
        frameInfo: document.getElementById('r-frame-info'),
    };

    function setRemoteStatus(msg, mode) {
        r.status.textContent = msg;
        r.dot.classList.remove('err', 'idle');
        if (mode === 'err') r.dot.classList.add('err');
        if (mode === 'idle') r.dot.classList.add('idle');
    }

    function setRemoteControlsEnabled(enabled) {
        [r.speedDown, r.speedUp, r.shotBtn, r.pipBtn].forEach((b) => (b.disabled = !enabled));
    }

    async function forwardToTab(payload) {
        if (!remoteTabId) return { ok: false, error: 'no tab selected' };
        return browser.runtime.sendMessage({
            type: 'agapori:forward-to-tab',
            tabId: remoteTabId,
            payload,
        });
    }

    async function refreshTabList() {
        const known = await browser.runtime.sendMessage({ type: 'agapori:list-tabs' });
        r.tabSelect.innerHTML = '';
        if (!known || !known.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— none detected yet —';
            r.tabSelect.appendChild(opt);
            setRemoteStatus('no tabs with a detected video yet — open a site in a tab first', 'idle');
            setRemoteControlsEnabled(false);
            remoteTabId = null;
            return;
        }
        known.forEach((entry) => {
            const opt = document.createElement('option');
            opt.value = String(entry.tabId);
            opt.textContent = entry.title || entry.pageUrl;
            r.tabSelect.appendChild(opt);
        });
        // auto-select the first one and load its state
        r.tabSelect.value = String(known[0].tabId);
        await selectRemoteTab(known[0].tabId, known[0].url);
    }
    r.refreshBtn.addEventListener('click', refreshTabList);
    r.tabSelect.addEventListener('change', async () => {
        const tabId = parseInt(r.tabSelect.value, 10);
        if (!tabId) return;
        await selectRemoteTab(tabId, null);
    });

    async function selectRemoteTab(tabId, knownUrl) {
        remoteTabId = tabId;
        r.frameInfo.textContent = knownUrl || '—';

        const stateResp = await forwardToTab({ type: 'agapori:get-state' });
        if (!stateResp || !stateResp.ok) {
            setRemoteStatus('could not reach that tab — try reloading it', 'err');
            setRemoteControlsEnabled(false);
            return;
        }

        const state = stateResp.result;
        setRemoteControlsEnabled(true);
        setRemoteStatus(state.ep ? `ep ${state.ep} · connected` : 'waiting for episode…', state.ep ? 'ok' : 'idle');

        const cfg = state.config;
        r.size.value = cfg.subSize;
        r.sizeVal.textContent = cfg.subSize + '%';
        r.color.value = cfg.subColor;
        r.bg.value = cfg.subBg;
        r.bgop.value = cfg.subBgOpacity;
        r.bgopVal.textContent = cfg.subBgOpacity + '%';
        r.sync.value = cfg.syncMs;
        r.syncVal.textContent = (cfg.syncMs / 1000).toFixed(1) + 's';
        r.serverInput.value = cfg.server;
    }

    function stepRemoteSpeed(dir) {
        let idx = SPEED_STEPS_REMOTE.findIndex((s) => Math.abs(s - remoteSpeed) < 0.001);
        if (idx === -1) idx = SPEED_STEPS_REMOTE.indexOf(1);
        idx = Math.min(SPEED_STEPS_REMOTE.length - 1, Math.max(0, idx + dir));
        remoteSpeed = SPEED_STEPS_REMOTE[idx];
        r.speedLabel.textContent = remoteSpeed.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + '×';
        forwardToTab({ type: 'agapori:set-speed', rate: remoteSpeed });
    }
    r.speedUp.addEventListener('click', () => stepRemoteSpeed(1));
    r.speedDown.addEventListener('click', () => stepRemoteSpeed(-1));

    r.shotBtn.addEventListener('click', async () => {
        const result = await forwardToTab({ type: 'agapori:screenshot' });
        if (!result || !result.ok || !result.result || !result.result.ok) {
            const errMsg = (result && result.result && result.result.error) || (result && result.error) || 'screenshot failed';
            setRemoteStatus(errMsg, 'err');
            return;
        }
        const a = document.createElement('a');
        a.href = result.result.dataUrl;
        a.download = `screenshot_${Date.now()}.png`;
        a.click();
        setRemoteStatus('screenshot saved', 'ok');
    });

    r.pipBtn.addEventListener('click', () => forwardToTab({ type: 'agapori:pip' }));

    function bindRemoteConfigInput(inputEl, key, formatFn, valueEl) {
        inputEl.addEventListener('input', () => {
            const raw = inputEl.value;
            const value = inputEl.type === 'range' ? parseFloat(raw) : raw;
            if (valueEl) valueEl.textContent = formatFn(value);
            forwardToTab({ type: 'agapori:set-config', key, value });
        });
    }
    bindRemoteConfigInput(r.size, 'subSize', (v) => v + '%', r.sizeVal);
    bindRemoteConfigInput(r.bgop, 'subBgOpacity', (v) => v + '%', r.bgopVal);
    bindRemoteConfigInput(r.sync, 'syncMs', (v) => (v / 1000).toFixed(1) + 's', r.syncVal);
    bindRemoteConfigInput(r.color, 'subColor', () => '', null);
    bindRemoteConfigInput(r.bg, 'subBg', () => '', null);

    r.serverInput.addEventListener('change', () => {
        forwardToTab({ type: 'agapori:set-config', key: 'server', value: r.serverInput.value.trim() });
    });
})();