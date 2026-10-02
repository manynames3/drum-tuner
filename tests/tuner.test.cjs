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
  state, presets, createLugs, captureActiveLugTake, getLugSequence, centsBetween,
  createHeadState, captureHeadTake, headRatio, el, fusePitchEstimates, createInputAudioContext,
  referenceHz, getSearchRange, normalizeSavedDrum, computeTakeStats, hasTentativePitch };
`, context);
const { api } = context;

test("tom and snare defaults use published center-pitch examples", () => {
  for (const [key, low, high] of [
    ["rack10", 131, 165], ["rack12", 98, 131], ["rack13", 87.3, 104],
    ["floor14", 82.4, 98], ["floor16", 65.4, 73.4],
    ["snare14", 165, 233], ["snare14High", 165, 233],
  ]) {
    const preset = api.presets[key];
    assert.deepEqual(Array.from(preset.guide), [low, high]);
    assert.ok(preset.hz >= low && preset.hz <= high, `${key} target outside guide`);
  }
  assert.equal(api.presets.kick22.guide, undefined, "kick lug pitches are not center-pitch ranges");
  assert.equal(api.presets.kick20.guide, undefined);
});

test("tentative pitch needs enough agreeing taps and some signal quality", () => {
  api.state.mode = "pitch";
  api.state.requiredTakes = 3;
  api.state.takes = [94.4, 94.5, 94.6].map(hz => ({ hz, confidence: .44 }));
  const steady = api.computeTakeStats(api.state.takes);
  assert.ok(steady.spreadCents < 22);
  assert.ok(steady.confidence < .64);
  assert.equal(api.hasTentativePitch(steady), true);
  api.state.takes = [{ hz: 94.4, confidence: .44 }];
  assert.equal(api.hasTentativePitch(api.computeTakeStats(api.state.takes)), false);
  api.state.takes = [94.5, 110, 130].map(hz => ({ hz, confidence: .7 }));
  assert.equal(api.hasTentativePitch(api.computeTakeStats(api.state.takes)), false);
  api.state.takes = [94.4, 94.5, 94.6].map(hz => ({ hz, confidence: .9 }));
  assert.equal(api.hasTentativePitch(api.computeTakeStats(api.state.takes)), false);
});

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

test("first stable lug locks the reference while later captures do not move it", () => {
  const state = api.state;
  state.lugs = api.createLugs(6);
  state.lugReference = null;
  state.savedLugTargetHz = null;
  state.activeLug = 0;
  state.lugPattern = "clockwise";
  state.lugArmed = true;
  for (let i = 0; i < 3; i++) api.captureActiveLugTake({ hz: 180, confidence: .9 });
  assert.equal(api.referenceHz("lugs"), 180);
  for (let i = 0; i < 3; i++) api.captureActiveLugTake({ hz: 190, confidence: .9 });
  assert.equal(api.referenceHz("lugs"), 180);
  assert.equal(state.lugReference.index, 0);
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

test("pitch focus follows only a measured lock, never a preset target", () => {
  api.state.mode = "pitch";
  api.state.targetHz = 220;
  api.el.targetFilter.checked = true;
  api.state.pitchLockHz = null;
  assert.equal(api.fusePitchEstimates({ hz: 110, confidence: .9 }, { hz: 220, confidence: .9 }).hz, 220);
  api.state.pitchLockHz = 110;
  assert.equal(api.fusePitchEstimates({ hz: 110, confidence: .9 }, { hz: 220, confidence: .9 }).hz, 110);
  const range = api.getSearchRange();
  assert.ok(range.min < 110 && range.max > 110);
  assert.ok(range.max < 220);
  api.el.targetFilter.checked = false;
  api.state.pitchLockHz = null;
});

test("saved drum data is validated before use", () => {
  assert.equal(api.normalizeSavedDrum({ name: "Tom", targetHz: 999 }), null);
  const drum = api.normalizeSavedDrum({ name: "Tom", targetHz: 123.5, lugHz: 180, batterHz: 150, resonantHz: 225, headGoal: 1.5 });
  assert.equal(drum.lugHz, 180);
  assert.equal(drum.headGoal, 1.5);
  assert.equal(drum.resonantHz, 225);
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
