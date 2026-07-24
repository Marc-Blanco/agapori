/* USE:
aaaa
*/
(function () {
    'use strict';
    const SERVER = 'http://localhost:8600';
    const ep
    const ep
    // miliseconds btw
    const POLL_INTERVAL = 3000;
    
    let lastep = null;
    let lastvd = null;
    let lastblob = null;
    
    function getepN() {
        let match = location.herf.match(ep1);
        if (match) return match[1];

        match = document.title.match(ep2);
        if (match) return match[1]
        
        return null;
    }
    function srt-vtt(srt) {
        //
        // const normalize = srt.replace(/\r/g, '');
        //const withD = normalize.replace(/(\d{2}:\d{2}:\d{2}), (\d{3})/g, '$1.$2')
        //return 'WEBVTT\n\n' + withD;
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