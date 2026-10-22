# Curse of Scully website

The official website for **Curse of Scully**, a free pirate strategy game for Android.

Live at https://kraabat.github.io/curse-of-scully/

This repo only holds the static website (plain HTML, CSS and JavaScript, no build step). The game code lives elsewhere.

## Layout

- `index.html` – the whole page, styles and scripts included
- `assets/` – images (webp), gameplay videos (mp4 + webm), icons
- `assets/gh/` – Grand Horizon art
- `assets/video/` – gameplay clips cut from the YouTube Shorts

## Updating

- **New release:** edit the "Captain's Log" card in `index.html` (search for `Captain's Log`).
- **PC version:** replace the "Coming soon" badges (search for `Coming soon`) with a download link.

Push to `main` and GitHub Pages publishes the change within a minute or two.
