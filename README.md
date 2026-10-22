# Curse of Scully website

The official website for **Curse of Scully**, a free pirate strategy game for Android.

Live at https://kraabat.github.io/curse-of-scully/

This repo only holds the static website (plain HTML, CSS and JavaScript, no build step). The game code lives elsewhere.

## Layout

- `index.html` – the whole page, styles and scripts included
- `assets/` – images (webp), gameplay videos (mp4 + webm), icons
- `assets/gh/` – Grand Horizon art
- `assets/video/` – gameplay clips cut from the YouTube Shorts
- `assets/game/` – Storm Run, the 45-second browser mini-game (`storm-run.js` plus sprites from the game's own art). Tuning numbers (length, speed, spawn rates, points) sit near the top and in `spawnObstacle`/`spawnPickup`; the best score is kept in the visitor's browser only.

## Updating

- **New release:** edit the "Captain's Log" card in `index.html` (search for `Captain's Log`).
- **PC version:** replace the "Coming soon" badges (search for `Coming soon`) with a download link.

Push to `main` and GitHub Pages publishes the change within a minute or two.
