# Drum Tuner

A static Web Audio drum tuner built for mobile Safari and desktop browsers.

The live tuner runs on-device. The app uses `AudioWorklet` for mic capture and hit segmentation when available, with an analyzer fallback for older browsers.

## Run locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Use on iPhone

iPhone mic access in Safari requires a secure context. `localhost` works on the same machine, but a phone on your network needs HTTPS.

Good options:

- Deploy the folder to Netlify, Vercel, GitHub Pages, or any HTTPS static host.
- Use a temporary HTTPS tunnel while developing.
- Open the deployed HTTPS URL in Safari, then tap `Start mic`.

For tuning, pick a drum preset, tap near the center of the head, and let the hit decay naturally. For lug tuning, capture one hit per lug and compare the cents offset around the drum.

## Current commercial-grade pieces

- On-device mic capture through Web Audio.
- AudioWorklet hit capture with pre-roll, decay capture, cooldown, noise-floor tracking, and clipping checks.
- Drum-hit quality scoring for weak/clipped/low-confidence strikes.
- Modal-frequency scanning plus YIN pitch estimation and estimator agreement scoring.
- Repeated-hit averaging with confidence and take count.
- Guided lug capture with per-lug repeated-hit averaging and clockwise/star-pattern lug order.
- Batter/resonant head capture and ratio display.
- Local settings persistence without a backend dependency.

## Remaining validation work

Before treating this as a release-quality tuner, test it against real drums and a trusted reference tuner across several iPhone models, drum sizes, rooms, and strike intensities. The app can reject low-quality hits, but the target thresholds still need field calibration.
