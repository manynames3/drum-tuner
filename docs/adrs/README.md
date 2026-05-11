# Architecture Decision Records

## ADR 001: Keep Live Tuning On-Device

**Status:** Accepted

**Context:** The app needs fast feedback from an iPhone or desktop microphone. Sending live microphone audio to a server would add network latency, create privacy concerns, and make tuning dependent on connectivity.

**Decision:** Run microphone capture, hit detection, pitch analysis, confidence scoring, and tuning workflows in the browser.

**Consequences:** The app has low-latency local behavior and does not upload microphone audio. The browser runtime becomes the main constraint, so the code must handle varied Web Audio support and mobile Safari behavior.

## ADR 002: Deploy As Static Assets On Cloudflare Pages

**Status:** Accepted

**Context:** The app currently has no backend, database, or build step. It needs HTTPS so iPhone Safari can grant microphone access.

**Decision:** Serve the repository root as a static Cloudflare Pages project.

**Consequences:** Deployment is simple and reliable, and HTTPS is provided by the platform. Server-side features such as accounts, cloud preset sync, analytics, and uploaded sample analysis are out of scope until a backend is introduced.

## ADR 003: Use AudioWorklet With Analyzer Fallback

**Status:** Accepted

**Context:** Drum-hit capture benefits from stable audio-frame processing, pre-roll, cooldown, and level tracking. Main-thread polling can be affected by UI work and animation timing.

**Decision:** Use an `AudioWorklet` for microphone-frame processing when available, with an `AnalyserNode` fallback for older browsers.

**Consequences:** Modern browsers get a more stable capture path. The fallback keeps the app usable where `AudioWorklet` is unavailable, but analysis quality may vary more in fallback mode.

## ADR 004: Use Drum-Specific Hit Quality Gates And Multi-Estimator Pitch Analysis

**Status:** Accepted

**Context:** Drums produce short, noisy, inharmonic decays. A single general-purpose pitch estimator can be fooled by overtones, clipped hits, weak taps, room reflections, or inconsistent strikes.

**Decision:** Score hits before accepting them, reject weak/clipped/low-confidence strikes, scan modal frequency windows, run YIN-style estimation, fuse estimator results, and average repeated takes.

**Consequences:** The app is more conservative and credible than a simple FFT peak display. Some hits are rejected, which is preferable to showing unstable readings. Thresholds still need field calibration.

## ADR 005: Store Settings Locally Instead Of Adding Accounts

**Status:** Accepted

**Context:** The app needs to remember practical local preferences such as target frequency, sensitivity, hit count, lug count, lug order, and selected head side. There is no current requirement for cross-device accounts.

**Decision:** Use `localStorage` for lightweight local settings persistence.

**Consequences:** The app remains backend-free and private by default. Settings are device-local and can be cleared by the browser; cloud sync would require a later architecture change.
