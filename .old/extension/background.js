const videoframebytab = new Map();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "agapori:framehasvideo") {
        if (sender.tab && typeof message.frameId === "number") {
            videoframebytab.set( sender.tab.id, {
                frameId: sender.frameId,
                url : message.url
            });
        }
        return Promise.resolve({ok: true});
    }


    if (message.type === "agapori:framehasnovideo") {
        const info = videoframebytab.get(message.tabId) || null;
        return Promise.resolve(info);
    }

    if (message.type === 'agapori:poup-fw') {

        const info = videoframebytab.get(message.tabId);
        if (!info) {
            return Promise.resolve({ ok: false, error: 'NO known video frame for this tab yet.'})
        }
        return browser.tabs
        .sendMessage(message.tabId, message.payload, {frameId: info.frameId })
        .then((result) => ({ ok: true, result }))
        .catch((err) => ({ ok: false, error: err.message }));
    }
    return undefined;
});

browser.tabs.onRemoved.addListener((tabId) => {
    videoframebytab.delete(tabId);
});
browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
        videoframebytab.delete(details.tabId);
    }
});

