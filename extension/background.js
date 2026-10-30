const videoFrameByTab = new Map();

browser.action.onClicked.addListener(() => {
    browser.tabs.create({url: browser.runtime.getURL("player.html")});
});

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'agapori:frame-has-video') {
        if (sender.tab && typeof sender.frameId === 'number') {
        videoFrameByTab.set(sender.tab.id, {frameId: sender.frameId, url: message.url});
        }
        return Promise.resolve({ok: true});
    }
    
    if (message.type === 'agapori:forward-to-tab') {
        const info = videoFrameByTab.get(message.tabId);
        if (!info) {
            return Promise.resolve({ok: false, error: 'No video frame found for tab yet'});
        }
        return browser.tabs
        .sendMessage(message.tabId, message.payload, {frameId: info.frameId })
        .then((result) => ({ok: true, result}))
        .catch((err) => ({ok: false, error: err.message}));
    }

    if (message.type === 'agapori:list-tabs') {
        return browser.tabs.query({}).then((tabs) => {
            const known = [];
            for (const tab of tabs) {
                const info = videoFrameByTab.get(tab.id);
                if (info) known.push({ tabId: tab.id, title: tab.title, url: info.url, pageUrl: tab.url });

            }
            return known;
        });
    }
    return undefined;
});

browser.tabs.onRemoved.addListener((tabId) => {
    videoFrameByTab.delete(tabId);
});
browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
        videoFrameByTab.delete(details.tabId);
    }
});