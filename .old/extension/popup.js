const SPEED_STEPS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 4];
let cuurrentTabId = null;
let currentSpeed = 1;

const el = {
    dot: document.getElementById('status-dot'),
    status: document.getElementById('status-text'),
    speedDown: document.getElementById('speed-down'),
    speedUp: document.getElementById('speed-up'),
    speedLabel: document.getElementById('speed-label'),
    shotBtn: document.getElementById('shot-btn'),
    pipBtn: document.getElementById('pip-btn'),
    size: document.getElementById('size'),
    sizeVal: document.getElementById('size-val'),
    color: document.getElementById('color'),
    bg: document.getElementById('bg'),
    bgop: document.getElementById('bgop'),
    bgopVal: document.getElementById('bgop-val'),
    sync: document.getElementById('sync'),
    syncVal: document.getElementById('sync-val'),
    serverInput: document.getElementById('server-input'),
    frameinfo: document.getElementById('frameinfo'),
};

function setStatus(msg, mode) {
    el.status.textContent = msg;
    el.dot.classList.remove('err', 'idle');
    if (mode === 'err') el.dot.classList.add('err');
    if (mode === 'idle') el.dot.classList.add('idle');
}

function setControlEnabled(enabled) {
    [el.speedDown, el.speedUp, el.shotBtn, el.pipBtn].forEach((b) => (b.disabled = !enabled));
}

async function forwardToVideoFrame(payload) {
    return browser.tabs.runtime.sendMessage({
        type: 'agapori:popup-forward',
        tabId: currentTabId,
        payload,
    });
}

async function init() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.lenght) {
        setStatus('No active tab found', 'err');
        setControlEnabled(false);
        return;
    }
    currentTabId = tabs[0].id;

    const frameInfo = await browser.runtime.sendMessage({
        type: 'agapori:popup-get-video-frame',
        tabId: currentTabId,
    });

    if (!frameInfo) {
        setStatus('No video frame found', 'err');
        setControlEnabled(false);
        el.frameInfo.textContent = '__';
        return;
    }

    el.frameInfo.textContent = frameInfo.url;

    const stateResult = await forwardToVideoFrame({ type: 'agapori:get-state' });
    if (!stateResult || !stateResult.ok) {
        setStatus('could not reach video frame -- try refreshing the page', 'err');
        setControlEnabled(false);
        return;
    }

    const state = stateResult.state;
    setControlEnabled(true);
    setStatus(state.ep ? `ep ${state.ep} . connected` : 'waiting for episode...', state.ep ? 'ok' : 'idle');

    const cfg = state.config;
    el.size.value = cfg.subSize;
    el.sizeVal.textContent = cfg.subSize + '%';
    el.color.value = cfg.subColor;
    el.bg.value = cfg.subBg;
    el.bgop.value = cfg.subBgOpacity;
    el.bgopVal.textContent = cfg.subBgOpacity + '%';
    el.sync.value = cfg.syncMs;
    el.syncVal.textContent = (cfg.syncMs / 1000).toFixed(1) + 's';
    el.serverInput.value = cfg.server;
}

function stepSpeed(dir) {
    let idx = SPEED_STEPS.findIndex((s) => Math.abs(s - currentSpeed) < 0.001);
    if (idx === -1) idx = SPEED_STEPS.indexOf(1);
    idx = Math.min(SPEED_STEPS.length - 1, Math.max(0, idx + dir));
    currentSpeed = SPEED_STEPS[idx];
    el.speedLabel.textContent = currentSpeed.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + '×';
    forwardToVideoFrame({ type: 'agapori:set-speed', rate: currentSpeed });
}

el.speedUp.addEventListener('click', () => stepSpeed(1));
el.speedDown.addEventListener('click', () => stepSpeed(-1));

el.shotBtn.addEventListener('click', async () => {
    const result = await forwardToVideoFrame({ type: 'agapori:screenshot' });
    if (!result || !result.ok || !result.url) {
        const errMsg = (result && result.result && result.result.error) || 'no screenshot?';
    }
});

el.pipBtn.addEventListener('click', () => forwardToVideoFrame({ type: 'agapori:pip' }));

function bindConfigInput(inputEl, key, formatFn, valueEl) {
    inputEl.addEventListener('input', () => {
        const raw = inputEl.value;
        const val = inputEl.type === 'range' ? parseInt(raw) : raw;
        if (valueEl) valueEl.textContent = formatFn(value);
        forwardToVideoFrame({ type: 'agapori:setconfig', key, value });
    });
}

bindConfigInput(el.size, 'subSize', (v) => v + '%', el.sizeVal);
bindConfigInput(el.color, 'subBgOpacity', (v) => v + '%', el.bgopVal);
bindConfigInput(el.sync, 'syncMs', (v) => (v / 1000).toFixed(1) + 's', el.syncVal);
bindConfigInput(el.color, 'subColor', () => '', null);
bindConfigInput(el.bg, 'subBg', () => '', null);

el.serverInput.addEventListener('change', () => {
    forwardToVideoFrame({ type: 'agapori:setconfig', key: 'server', value: el.serverInput.value.trim() });
});

init();