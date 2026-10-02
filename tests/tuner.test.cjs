const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// Exercise the shipped analysis functions without starting browser capture.
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const element = () => ({ getContext: () => ({}), style: {}, checked: false });
const context = vm.createContext({
  document: { querySelector: element, querySelectorAll: () => [] },
  Float32Array, Math, Date, Number, console,
});
vm.runInContext(source.replace("\ninit();\n", "\n") + `
globalThis.api = { analyzeDrumHit, detectPitchYin, detectModalPeakGoertzel,
  state, createLugs, captureActiveLugTake, getLugSequence, centsBetween,
  createHeadState, captureHeadTake, headRatio, el, fusePitchEstimates, createInputAudioContext };
`, context);
const { api } = context;

function capture(hz, sampleRate = 48000, amplitude = .5) {
  const preRollLength = Math.round(sampleRate * .09);
  const samples = new Float32Array(Math.round(sampleRate * .56));
  for (let i = preRollLength; i < samples.length; i++) {
    const t = (i - preRollLength) / sampleRate;
    samples[i] = amplitude * Math.exp(-9 * t) *
      (Math.sin(2 * Math.PI * hz * t) + .08 * Math.sin(4 * Math.PI * hz * t));
  }
  return { samples, sampleRate, preRollLength, noiseFloor: .003 };
}

for (const rate of [44100, 48000]) {
  for (const hz of [60, 87.3, 123.5, 196, 220, 350]) {
    test(`decaying ${hz} Hz tap at ${rate} Hz stays within 5 cents`, () => {
      const result = api.analyzeDrumHit(capture(hz, rate));
      assert.equal(result.accepted, true);
      assert.ok(Math.abs(api.centsBetween(result.hz, hz)) < 5, JSON.stringify(result));
    });
  }
}

test("silent and clipped captures are not accepted", () => {
  assert.equal(api.analyzeDrumHit(capture(123.5, 48000, 0)).accepted, false);
  const loud = capture(123.5);
  loud.clippedRatio = .2;
  assert.equal(api.analyzeDrumHit(loud).accepted, false);
});

test("lug round follows star order and stops after the last lug", () => {
  const state = api.state;
  state.lugs = api.createLugs(6);
  state.activeLug = 0;
  state.requiredTakes = 3;
  state.lugPattern = "star";
  state.lugArmed = true;
  const seen = [];
  for (let lug = 0; lug < 6; lug++) {
    seen.push(state.activeLug);
    for (let hit = 0; hit < 3; hit++) api.captureActiveLugTake({hz:180,confidence:.9});
  }
  assert.deepEqual(seen, [0, 3, 1, 4, 2, 5]);
  assert.equal(state.lugArmed, false);
  assert.equal(state.lugs.every(lug => lug.complete), true);
});

test("low confidence cannot complete a lug", () => {
  const state = api.state;
  state.lugs = api.createLugs(8);
  state.activeLug = 0;
  state.lugArmed = true;
  for (let i = 0; i < 3; i++) api.captureActiveLugTake({hz:180,confidence:.4});
  assert.equal(state.activeLug, 0);
  assert.equal(state.lugs[0].complete, false);
});

test("every supported lug order visits each lug once", () => {
  for (const count of [6, 8, 10]) for (const pattern of ["clockwise", "star"]) {
    const sequence = Array.from(api.getLugSequence(count, pattern));
    assert.equal(new Set(sequence).size, count);
    assert.ok(sequence.every(i => i >= 0 && i < count));
  }
});

test("head ratio requires complete, stable captures on both heads", () => {
  const state = api.state;
  state.requiredTakes = 3;
  state.heads = { batter: api.createHeadState(), resonant: api.createHeadState() };
  state.headSide = "batter";
  api.captureHeadTake({ hz: 150, confidence: .9 });
  state.headSide = "resonant";
  for (let i = 0; i < 3; i++) api.captureHeadTake({ hz: 225, confidence: .9 });
  assert.equal(state.heads.resonant.complete, true);
  assert.equal(state.heads.batter.complete, false);
  assert.equal(api.headRatio(), null);
  state.headSide = "batter";
  for (let i = 0; i < 2; i++) api.captureHeadTake({ hz: 150, confidence: .9 });
  assert.ok(Math.abs(api.headRatio() - 1.5) < .001);
  api.captureHeadTake({ hz: 180, confidence: .9 });
  assert.equal(state.heads.batter.complete, false, "variable taps invalidate comparison");
  assert.equal(api.headRatio(), null);
});

test("unfiltered octave resolution uses the measured mode independently of presets", () => {
  for (const mode of ["pitch", "lugs", "heads"]) {
    api.state.mode = mode;
    api.el.targetFilter.checked = mode !== "pitch";
    for (const target of [60, 147, 220, 450]) {
      api.state.targetHz = target;
      assert.equal(api.fusePitchEstimates({ hz: 110, confidence: .9 }, { hz: 220, confidence: .9 }).hz, 220);
      assert.equal(api.fusePitchEstimates({ hz: 220, confidence: .9 }, { hz: 110, confidence: .9 }).hz, 110);
    }
  }
  api.el.targetFilter.checked = false;
});

test("explicit pitch focus chooses a measured candidate near the target", () => {
  api.state.mode = "pitch";
  api.state.targetHz = 110;
  api.el.targetFilter.checked = true;
  assert.equal(api.fusePitchEstimates({ hz: 110, confidence: .9 }, { hz: 220, confidence: .9 }).hz, 110);
  api.el.targetFilter.checked = false;
});

test("audio context follows a reported input rate and uses defaults when absent", () => {
  const calls = [];
  context.window = { AudioContext: class {
    constructor(options) { calls.push(options); }
  } };
  api.createInputAudioContext({ getAudioTracks: () => [{ getSettings: () => ({ sampleRate: 48000 }) }] });
  api.createInputAudioContext({ getAudioTracks: () => [{ getSettings: () => ({}) }] });
  assert.equal(calls[0].sampleRate, 48000);
  assert.equal(Object.hasOwn(calls[1], "sampleRate"), false);
});

test("unsupported input rate recovers without suppressing unrelated audio errors", () => {
  let attempts = 0;
  context.window = { AudioContext: class {
    constructor(options) {
      attempts++;
      if (options.sampleRate) throw Object.assign(new Error("Unsupported rate"), { name: "NotSupportedError" });
    }
  } };
  api.createInputAudioContext({ getAudioTracks: () => [{ getSettings: () => ({ sampleRate: 48000 }) }] });
  assert.equal(attempts, 2);
  context.window.AudioContext = class { constructor() { throw new Error("Unavailable audio device"); } };
  assert.throws(() => api.createInputAudioContext({ getAudioTracks: () => [] }), /Unavailable audio device/);
});
