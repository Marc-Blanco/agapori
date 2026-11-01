# Agapori

Agapori is a browser extension that detects videos in browser tabs and loads matching subtitles automatically. It also includes a dedicated player for loading videos stored locally on your computer.

## What it does

- Detects tabs and frames containing playable videos.
- Detects episode numbers from page titles, URLs, and video filenames.
- Loads matching subtitle files such as `1.srt`, `2.srt`, or `12.srt`.
- Includes a dedicated extension player.
- Supports loading local video files directly from your computer.
- Provides playback controls, subtitle styling, synchronization, fullscreen, and picture-in-picture support and screeanshot capturing.

## How to Use

1. Load the `extension` folder as an unpacked browser extension.
2. Place the matching subtitle file in the server directory.
3. Start the local subtitle server if your subtitle files are stored locally.
4. Open a webpage containing a video.
4. Select a local video file or drag and drop it into the player.
5. Agapori detects the video and attempts to identify its episode number.
5. Open the Agapori player from the extension button when needed.
7. If the filename contains an episode number, Agapori automatically loads the matching subtitle.

## Local Video Support

Agapori can load videos locally from your computer. Videos do not need to be uploaded to a remote service. The player reads the selected file directly in the browser and creates a temporary local object URL for playback.

Example filenames:

```text
S01E01.mp4
episode-2.mkv
3.webm
```
## Photos
<img width="260" height="279" alt="image" src="https://github.com/user-attachments/assets/55435bdd-21d7-4445-a199-90c9b386c832" />
