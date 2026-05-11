# Drum Tuner

Drum Tuner is a mobile-first browser app for tuning acoustic drums with the device microphone. It captures drum hits on-device with the Web Audio API, estimates the dominant drumhead frequency, scores hit confidence, averages repeated takes, and supports pitch, lug, and batter/resonant head tuning workflows without sending microphone audio to a server.

Live demo: [https://drum-tuner.pages.dev](https://drum-tuner.pages.dev)

## About

This project explores how close a web app can get to a dedicated instrument tuner while staying deployable as static assets. The core tuning path runs in the browser: microphone capture, hit segmentation, quality checks, modal-frequency scanning, YIN-style pitch estimation, and UI rendering all happen locally.

The app is designed for tuning taps rather than full-performance drum hits. It includes rejection paths for weak, clipped, and low-confidence strikes, but the DSP thresholds still need field calibration against real drums and reference tuners before release-quality claims.

## Tech Stack

- HTML, CSS, and vanilla JavaScript ES modules
- Web Audio API with `AudioWorklet` for low-latency mic capture
- Canvas for tuner, waveform, spectrum, lug, and head-matching visualizations
- localStorage for local tuning/settings persistence
- Cloudflare Pages for static HTTPS deployment
- Wrangler CLI for deployment

## Engineering Highlights

- On-device audio processing, so live tuning does not depend on a backend round trip.
- `AudioWorklet` hit capture with pre-roll, decay capture, cooldown, noise-floor tracking, and clipping checks.
- Analyzer fallback for browsers where `AudioWorklet` is unavailable.
- Drum-specific hit quality scoring for weak, clipped, and low-confidence strikes.
- Modal-frequency scanning plus YIN-style pitch estimation with estimator agreement scoring.
- Repeated-hit averaging with confidence and take count to reduce single-strike variance.
- Guided lug tuning with 6, 8, and 10 lug layouts plus clockwise and star-pattern sequences.
- Batter/resonant head capture with ratio display.
- HTTPS deployment headers that allow microphone access from the app origin.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the runtime model, deployment shape, constraints, and a C4-style container diagram.

Architecture decisions are documented in [docs/adrs/README.md](docs/adrs/README.md).

## Run Locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Use On iPhone

iPhone mic access in Safari requires a secure context. `localhost` works on the same machine, but a phone on your network needs HTTPS.

Good options:

- Use the Cloudflare Pages demo URL.
- Deploy the folder to any HTTPS static host.
- Use a temporary HTTPS tunnel while developing.

For tuning, pick a drum preset, tap near the center of the head, and let the hit decay naturally. For lug tuning, select the lug count and order, arm the active lug, then capture consistent taps near each lug.

## Deployment

This repository is deployed as a static Cloudflare Pages site. There is no build step.

```sh
npx wrangler pages deploy . --project-name drum-tuner --branch main
```

The Cloudflare `_headers` file sets:

- `Permissions-Policy: microphone=(self)`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Privacy

Microphone audio is processed in the browser. The app does not upload raw audio, tuning readings, or settings to a backend. Settings are stored locally with `localStorage`.

## Limitations

- The tuner has not yet been validated against a broad field dataset of drums, rooms, iPhone models, and reference tuners.
- Browser audio constraints such as echo cancellation and automatic gain control are requested, but browser and operating system behavior can vary.
- Hard rimshots, very close phone placement, and reflective rooms can still produce clipped or unstable readings.
- There is no account system, cloud preset sync, analytics, or server-side DSP.

## Project Structure

```text
.
├── index.html              # App shell and controls
├── styles.css              # Responsive UI and tuner layout
├── app.js                  # UI state, pitch analysis, tuning workflows
├── drum-audio-worklet.js   # AudioWorklet hit capture and level tracking
├── manifest.webmanifest    # PWA metadata
├── _headers                # Cloudflare Pages security/mic headers
├── _routes.json            # Cloudflare Pages routing config
└── docs/
    ├── architecture.md
    └── adrs/
        └── README.md
```
