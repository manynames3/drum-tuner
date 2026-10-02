# Product validation

Review date: 2026-10-01. Scope: the browser product, before native packaging.

## Verdict: NOT READY for commercial release

The revised interface and automated flows have been exercised in Chromium and
WebKit. Physical drum and phone microphone validation is still missing. Generated
tones establish regression coverage, not accuracy on inharmonic drumheads,
room reflections, or phone input processing.

## Problems corrected

- The Performance Focus visual direction replaces the pitch dial with a large
  reading, a labeled +/-50-cent target scale, and a prominent next action.
  Readings still being collected or failing stability checks are withheld;
  the scale clamps out-of-range offsets while the exact offset remains in text.
- The interface uses a compact top preset, restrained teal/amber status colors,
  and a fixed lug-capture action on short phone screens. The drumhead diagrams
  remain in the lug and head workflows.
- The phone layout previously stacked five large metric tiles and placed lug
  controls several screens below the meter.
- Idle feedback looked like a measurement. Unmeasured head values displayed the
  target frequency. Clearing takes left the old frequency in place.
- The needle rotation did not agree with the scale.
- Note-relative cents and target-relative cents gave conflicting impressions.
- Lug and head measurements could inherit unrelated takes. A completed lug
  round could wrap around and replace earlier results.
- The YIN calculation inspected uninitialized normalized values. A generated
  123.5 Hz tap could be reported near 136 Hz.
- Spectral confidence compared neighboring bins within the same peak.
- Worklet and analyzer fallback could count a strike twice. The fallback's short
  delay also analyzed an incomplete decay window.
- Permission denial, pending requests, interruption, and held readings lacked
  sufficiently clear recovery states.
- Repeated idle messages and always-expanded target controls competed with the
  measurement. The revised mode selector, pitch scale, compact preset field,
  feedback band, and hit-progress marks establish a clearer hierarchy.
- Lug order and head selection were below the dial. They now precede capture;
  short-screen checks ensure the capture dock does not cover the lowest lug.
- Head comparison could show a final ratio after only one take on one head.
  Both heads now require complete, stable captures and show individual progress.
- Partially saved preset settings could disagree with the editable target.
- Rounded lug offsets could appear green while the completion message requested
  adjustment. Color and completion now use the same unrounded threshold.
- Partial-hit progress and the next lug were only explained below the meter.
  The center readout now shows that progress and the next lug directly.
- Enlarged long readings could overlap the lug buttons. Readings reflow below
  the diagram when they no longer fit; preset text and order buttons also wrap.
- The generic boxed equalizer identity and redundant subtitle were replaced
  with an original drumhead mark and a quieter, compact wordmark.
- Octave disagreement could make the same unfiltered head or lug signal change
  frequency when its preset changed. Resolution now uses measured candidates;
  only explicit pitch-mode filtering uses the target as an octave preference.
- The audio context now follows the microphone's reported sample rate when
  supported, avoiding unnecessary resampling. Missing or unsupported metadata
  retains the browser default.

## Current evidence

| Area | Verification |
| --- | --- |
| Phone layout | Screenshots at 320x568, 375x667, 390x844, and 430x932; no horizontal overflow |
| Desktop layout | Screenshots at 1280x900 |
| Text sizing | Layout fixtures at 150% and 200% text size at 320x568 and 393x852; long reading/lug collision checks and restoration to the normal layout |
| Pitch analysis | Decaying synthetic taps at 60, 87.3, 123.5, 196, 220, and 350 Hz at 44.1/48 kHz; within 5 cents in regression tests |
| Real-time pipeline | Generated audio delivered through a MediaStream into the shipped capture and analysis path |
| Primary flows | Pitch below/on/above target; one capture per generated tap; reset and preset changes; mic stop/restart |
| Lug capture | 6-lug star round, automatic progression, completion, recapture, low-confidence gate; 6/8/10 sequence coverage |
| Heads | Independent 150/225 Hz captures produce approximately 1.50; partial head capture withholds ratio; complete/variable-tap gates tested; reset clears both |
| Error states | Clipping rejection, permission denial/retry, cancellation with late permission resolution, unavailable storage; simulated input disconnection and background pause in Chromium |
| Accessibility | Keyboard tab navigation, native dialog focus behavior, named lug buttons; automated axe WCAG A/AA scans of the three main views found no violations |
| Privacy | Local audio processing; no remote font request or audio upload added |

The browser suite replaces the microphone with generated audio. It does not
exercise a physical microphone or certify iOS Safari/Android device behavior.
Automated accessibility results do not replace VoiceOver/TalkBack testing.
The displayed confidence is an estimator score, not a calibrated probability
of measurement accuracy.

One live WebKit run displayed 1.51 for the synthetic 150/225 Hz pair. Separate
single-hit diagnostics showed small variation (one 225 Hz estimate was 225.83 Hz).
The browser regression checks each head within 10 cents and verifies the rounded
ratio against the measured values. The direct sample-analysis tests retain the
stricter 5-cent bound. This is a regression threshold, not an advertised accuracy
specification; field validation must assess repeatability and single-hit variation.
Single-hit lug rounds can also request adjustment for this variation. The browser
suite checks that the completion message agrees with the displayed lug offsets;
it does not require a green result when the measurements differ.

Intermittent WebKit fixture failures prompted recording the audio that reached
analysis. With a 48 kHz generated source and a default 44.1 kHz analysis context,
one of 20 captures was an outlier immediately after restart: 225 Hz was reported
as 226.06 Hz. Its captured buffer contained short zero-filled gaps. A comparison
with matched 48 kHz contexts produced 20 stable captures. The generated stream
had omitted sample-rate metadata; the fixture now reports its actual rate unless
explicitly testing missing metadata.

After the context-selection change, the full WebKit suite passed with reported
48 kHz input and separately with omitted rate metadata. Chromium's analyzer
fallback also passed with reported 48 kHz input. The 21 unit tests include
sample-rate selection, unsupported-rate recovery, and preset-independent octave
resolution. No confidence threshold was lowered to force a successful reading.
These results do not establish that physical Safari input has the same behavior
or certify real-drum repeatability.

## Remaining release gate

Run a reference-matched field session on an actual iPhone. Android validation
is a separate gate if that platform is added later:

The user has an iPhone 15 Pro available and can use a physical pitch tuner or
an app-based reference. No results from that device have been recorded yet.

1. Record the phone model, OS/browser version, drum/head, room, microphone
   position, and reference tuner or spectrum measurement method.
2. Compare at least 20 light taps on kick, tom, and snare heads. Check repeatability,
   rejected-hit rate, harmonic jumps, and agreement with the same measured mode.
3. Complete lug rounds with clockwise and star orders, then verify a deliberately
   detuned lug and both head measurements.
4. Test soft and loud taps, background noise, a blocked microphone permission,
   app switching, screen locking, and external/Bluetooth input changes.
5. Agree on accuracy and rejection-rate acceptance limits before advertising
   commercial measurement performance. Investigate failures instead of relaxing
   thresholds to fit the results.

No native port or App Store submission is included in this review. A public
static deployment is useful for iPhone testing but does not satisfy the field
validation gate. Optional later polish includes a custom app icon and store
screenshot composition after that gate is satisfied.

## Reproduction

Run the commands in the README's Validation section. Browser screenshots are
written outside the repository by default. Use a separate SCREENSHOT_DIR for
each engine or capture path to retain comparable evidence.
