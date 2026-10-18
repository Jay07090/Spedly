# Spendly — Personal Expense Tracker

A personal expense tracker that runs as a **website** and installs on your iPhone as a **PWA** (home-screen app). Built with plain HTML, CSS and JavaScript — no build step, no dependencies.

## Features

- **iOS look & feel** — SF Pro Text (Apple system font), large collapsing titles, grouped lists, iOS alerts, segmented controls
- **Liquid glass** — frosted, saturated blur with refractive rims and a specular highlight that follows your finger/cursor, over a slowly moving colour background
- **iPhone-style animations** — spring bottom sheet that scales the app behind it, swipe-to-delete rows, sliding "lens" tab bar, Dynamic-Island style notifications with Undo, count-up numbers, animated donut & bar charts
- **Tracking** — expenses & income, 10 expense categories, notes, dates, edit/delete
- **Summary** — monthly spend, budget progress (on track / spending fast / over), income, net, today, daily average, top category
- **Activity** — search, filter (All / Expenses / Income), grouped by day
- **Insights** — category donut + breakdown, daily spending bars, browse previous months
- **Settings** — name, monthly budget, currency (₹ $ € £), Light / Dark / Automatic, CSV export, JSON backup & restore, sample data, erase all
- **PWA** — works offline, installable, "Add Expense" app shortcut
- **Website extras** — keyboard shortcuts: `N` new transaction, `1–4` switch tabs, `Esc` close

## Project structure

```
index.html            app markup + icon sprite
styles.css            liquid glass design system & animations
app.js                all app logic (data stored in localStorage)
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA manifest
vercel.json           headers for the service worker & manifest
icons/                app icons (192, 512, maskable, apple-touch)
```

## Deploy to Vercel (live link)

### Option A — GitHub + Vercel dashboard (easiest)
1. Create a new repository on GitHub (e.g. `spendly`) and upload all these files (keep the `icons` folder).
2. Go to **vercel.com → Add New… → Project**, and import the repository.
3. Framework preset: **Other**. Leave Build Command and Output Directory empty.
4. Click **Deploy**. You'll get a live URL like `https://spendly-xxxx.vercel.app`.
   Every push to GitHub redeploys automatically.

### Option B — Vercel CLI
```bash
npm i -g vercel
cd spendly
vercel          # first time: log in and accept the defaults
vercel --prod   # publish to your production URL
```

## Install on iPhone
1. Open your Vercel URL in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Spendly from the home screen — it runs full-screen like a native app and works offline.

On Android/desktop Chrome, use the install icon in the address bar or **Settings → Install App** inside Spendly.

## Good to know
- **Your data stays on your device** (localStorage). Nothing is sent to a server.
- The home-screen app and Safari keep **separate** data on iPhone — pick one and use it.
- Use **Settings → Back Up Data** occasionally; restore it with **Restore Backup** on any device.
- After changing files, bump `CACHE` in `sw.js` (e.g. `spendly-v2`) so installed apps pick up the update.
- SF Pro is Apple's system font: it shows on iPhone, iPad and Mac. Windows/Android show their own system font instead (Apple's licence doesn't allow bundling SF Pro on a website).

## Run locally
```bash
cd spendly
python3 -m http.server 8000   # then open http://localhost:8000
```
