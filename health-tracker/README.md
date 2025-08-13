# Health Tracker (Static SPA)

A lightweight, deployable web app to track daily nutrition, supplements, hydration, and fitness. Data is stored in your browser via localStorage.

## Quick start

- Open `index.html` directly in a browser, or serve the folder using any static server.
- Python quick server:

```bash
cd health-tracker
python3 -m http.server 5173
# then open http://localhost:5173
```

## Run with Docker

Build and run a tiny image that serves the app with NGINX:

```bash
docker build -t health-tracker .
docker run --rm -p 8080:80 health-tracker
# open http://localhost:8080
```

## Features

- Tabbed UI: Dashboard, Nutrition, Supplements, Hydration, Fitness
- Progress bars for calories, macros, hydration, and weekly workouts
- Add/remove meals; macros and calories auto-sum
- Toggle supplements as taken
- Hydration quick-add (+250 ml, +500 ml) with Undo
- Start workouts and track weekly progress
- LocalStorage persistence with daily and weekly rollovers

## Notes

- No backend required. This is a static app, easy to deploy on any static hosting (GitHub Pages, Netlify, Vercel, S3, etc.).
- To reset data, clear `localStorage` key `health-tracker-state-v1` in your browser devtools.