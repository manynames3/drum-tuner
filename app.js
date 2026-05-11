const presets = {
  kick22: { name: "22 in kick", hz: 60, min: 38, max: 110 },
  kick20: { name: "20 in kick", hz: 72, min: 45, max: 125 },
  floor16: { name: "16 in floor tom", hz: 87.3, min: 55, max: 150 },
  floor14: { name: "14 in floor tom", hz: 98, min: 65, max: 170 },
  rack13: { name: "13 in rack tom", hz: 110, min: 75, max: 190 },
  rack12: { name: "12 in rack tom", hz: 123.5, min: 82, max: 215 },
  rack10: { name: "10 in rack tom", hz: 147, min: 98, max: 260 },
  snare14: { name: "14 in snare", hz: 196, min: 130, max: 340 },
  snare14High: { name: "14 in snare high", hz: 220, min: 145, max: 390 },
  custom: { name: "Custom", hz: 123.5 },
};

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const el = {
  micButton: document.querySelector("#micButton"),
  micButtonText: document.querySelector("#micButtonText"),
  secureState: document.querySelector("#secureState"),
  meterCanvas: document.querySelector("#meterCanvas"),
  waveCanvas: document.querySelector("#waveCanvas"),
  spectrumCanvas: document.querySelector("#spectrumCanvas"),
  frequencyReadout: document.querySelector("#frequencyReadout"),
  noteReadout: document.querySelector("#noteReadout"),
  targetReadout: document.querySelector("#targetReadout"),
  centsReadout: document.querySelector("#centsReadout"),
  signalReadout: document.querySelector("#signalReadout"),
  confidenceReadout: document.querySelector("#confidenceReadout"),
  takeReadout: document.querySelector("#takeReadout"),
  stripPointer: document.querySelector("#stripPointer"),
  presetSelect: document.querySelector("#presetSelect"),
  presetName: document.querySelector("#presetName"),
  targetInput: document.querySelector("#targetInput"),
  rangeInput: document.querySelector("#rangeInput"),
  targetFilter: document.querySelector("#targetFilter"),
  sensitivityInput: document.querySelector("#sensitivityInput"),
  takesSelect: document.querySelector("#takesSelect"),
  resetTakesButton: document.querySelector("#resetTakesButton"),
  lugCountSelect: document.querySelector("#lugCountSelect"),
  lugPatternButtons: document.querySelectorAll("[data-lug-pattern]"),
  captureLugButton: document.querySelector("#captureLugButton"),
  clearLugsButton: document.querySelector("#clearLugsButton"),
  lugAverage: document.querySelector("#lugAverage"),
  headSideSelect: document.querySelector("#headSideSelect"),
  resetHeadsButton: document.querySelector("#resetHeadsButton"),
  headRatioReadout: document.querySelector("#headRatioReadout"),
  analysisStatus: document.querySelector("#analysisStatus"),
  historyList: document.querySelector("#historyList"),
  modeLabel: document.querySelector("#modeLabel"),
  segments: document.querySelectorAll(".segment"),
};

const state = {
  audioContext: null,
  analyser: null,
  workletNode: null,
  silentGain: null,
  usingWorklet: false,
  source: null,
  stream: null,
  rafId: 0,
  running: false,
  pendingAnalysis: false,
  lastHitAt: 0,
  timeData: null,
  freqData: null,
  targetHz: 123.5,
  mode: "pitch",
  searchFactor: 1.4,
  sensitivity: 0.045,
  signalRms: 0,
  signalPeak: 0,
  currentHz: null,
  currentCents: null,
  confidence: 0,
  qualityLabel: "Idle",
  requiredTakes: 3,
  takes: [],
  rejectedTakes: 0,
  lugs: createLugs(8),
  activeLug: 0,
  lugPattern: "clockwise",
  lugArmed: false,
  heads: {
    batter: createHeadState(),
    resonant: createHeadState(),
  },
  headSide: "batter",
  history: [],
};

const meterCtx = el.meterCanvas.getContext("2d");
const waveCtx = el.waveCanvas.getContext("2d");
const spectrumCtx = el.spectrumCanvas.getContext("2d");

init();

function createLugs(count) {
  return Array.from({ length: count }, () => ({
    hz: null,
    confidence: 0,
    takes: [],
  }));
}

function createHeadState() {
  return {
    hz: null,
    confidence: 0,
    takes: [],
  };
}

function getLugSequence(count, pattern) {
  if (pattern !== "star") {
    return Array.from({ length: count }, (_, index) => index);
  }

  const starSequences = {
    6: [0, 3, 1, 4, 2, 5],
    8: [0, 4, 2, 6, 1, 5, 3, 7],
    10: [0, 5, 2, 7, 4, 9, 1, 6, 3, 8],
  };

  return starSequences[count] || Array.from({ length: count }, (_, index) => index);
}

function init() {
  loadSettings();
  updateSecureState();
  bindControls();
  drawAll();
  updateTargetUI();
  updateTakeUI();
  updateLugPatternUI();
  updateLugUI();
  updateHeadUI();
}

function bindControls() {
  el.micButton.addEventListener("click", () => {
    if (state.running) {
      stopMic();
    } else {
      startMic();
    }
  });

  el.presetSelect.addEventListener("change", () => {
    const preset = presets[el.presetSelect.value];
    if (!preset) return;
    state.targetHz = preset.hz;
    el.targetInput.value = preset.hz.toFixed(preset.hz % 1 ? 1 : 0);
    resetTakes();
    updateTargetUI();
    persistSettings();
  });

  el.targetInput.addEventListener("input", () => {
    const next = clamp(Number(el.targetInput.value) || state.targetHz, 35, 450);
    state.targetHz = next;
    if (el.presetSelect.value !== "custom") {
      el.presetSelect.value = "custom";
    }
    resetTakes();
    updateTargetUI();
    persistSettings();
  });

  el.rangeInput.addEventListener("input", () => {
    state.searchFactor = Number(el.rangeInput.value);
    persistSettings();
  });

  el.sensitivityInput.addEventListener("input", () => {
    state.sensitivity = Number(el.sensitivityInput.value);
    state.workletNode?.port.postMessage({ type: "settings", sensitivity: state.sensitivity });
    persistSettings();
  });

  el.takesSelect.addEventListener("change", () => {
    state.requiredTakes = Number(el.takesSelect.value);
    resetTakes();
    persistSettings();
  });

  el.resetTakesButton.addEventListener("click", () => {
    resetTakes();
  });

  el.lugCountSelect.addEventListener("change", () => {
    const count = Number(el.lugCountSelect.value);
    state.lugs = createLugs(count);
    state.activeLug = getLugSequence(count, state.lugPattern)[0];
    state.lugArmed = false;
    updateLugUI();
    persistSettings();
  });

  el.lugPatternButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.lugPattern = button.dataset.lugPattern;
      state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
      state.lugArmed = false;
      updateLugPatternUI();
      updateLugUI();
      drawMeter();
      persistSettings();
    });
  });

  el.captureLugButton.addEventListener("click", () => {
    state.lugArmed = !state.lugArmed;
    if (state.lugArmed) {
      setMode("lugs");
      state.lugs[state.activeLug].takes = [];
      state.lugs[state.activeLug].hz = null;
      state.lugs[state.activeLug].confidence = 0;
    }
    updateLugUI();
    drawMeter();
  });

  el.clearLugsButton.addEventListener("click", () => {
    state.lugs = createLugs(state.lugs.length);
    state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
    state.lugArmed = false;
    updateLugUI();
    drawMeter();
  });

  el.headSideSelect.addEventListener("change", () => {
    state.headSide = el.headSideSelect.value;
    resetTakes();
    setMode("heads");
    persistSettings();
  });

  el.resetHeadsButton.addEventListener("click", () => {
    state.heads = {
      batter: createHeadState(),
      resonant: createHeadState(),
    };
    updateHeadUI();
    drawMeter();
  });

  el.segments.forEach((segment) => {
    segment.addEventListener("click", () => setMode(segment.dataset.mode));
  });

  window.addEventListener("resize", drawAll);
}

async function startMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Mic unavailable", "This browser cannot open the microphone");
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setStatus("HTTPS required", "iPhone mic needs HTTPS");
    return;
  }

  try {
    setStatus("Opening mic", "Waiting for permission");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass({ latencyHint: "interactive" });
    await audioContext.resume();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 8192;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -18;
    analyser.smoothingTimeConstant = 0.55;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    let workletNode = null;
    let usingWorklet = false;
    if (audioContext.audioWorklet) {
      try {
        await audioContext.audioWorklet.addModule("./drum-audio-worklet.js");
        workletNode = new AudioWorkletNode(audioContext, "drum-input-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          outputChannelCount: [1],
          processorOptions: {
            sensitivity: state.sensitivity,
          },
        });
        workletNode.port.onmessage = handleWorkletMessage;
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(workletNode);
        workletNode.connect(silentGain).connect(audioContext.destination);
        state.silentGain = silentGain;
        usingWorklet = true;
      } catch {
        setStatus("Fallback", "Analyzer mode");
      }
    }

    state.stream = stream;
    state.audioContext = audioContext;
    state.analyser = analyser;
    state.workletNode = workletNode;
    state.usingWorklet = usingWorklet;
    state.source = source;
    state.timeData = new Float32Array(analyser.fftSize);
    state.freqData = new Uint8Array(analyser.frequencyBinCount);
    state.running = true;

    el.micButton.classList.add("listening");
    el.micButtonText.textContent = "Stop mic";
    setStatus("Listening", usingWorklet ? "Worklet ready" : "Analyzer fallback");
    loop();
  } catch (error) {
    setStatus("Mic blocked", error?.message || "Permission was not granted");
  }
}

function stopMic() {
  cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  state.running = false;
  state.pendingAnalysis = false;

  if (state.workletNode) {
    state.workletNode.port.close();
    state.workletNode.disconnect();
  }
  if (state.silentGain) state.silentGain.disconnect();
  if (state.source) state.source.disconnect();
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  if (state.audioContext) state.audioContext.close();

  state.audioContext = null;
  state.analyser = null;
  state.workletNode = null;
  state.silentGain = null;
  state.usingWorklet = false;
  state.source = null;
  state.stream = null;
  state.timeData = null;
  state.freqData = null;
  state.signalRms = 0;
  state.signalPeak = 0;

  el.micButton.classList.remove("listening");
  el.micButtonText.textContent = "Start mic";
  setStatus("Mic off", "Ready");
  drawAll();
}

function loop(now = performance.now()) {
  if (!state.running || !state.analyser) return;

  state.analyser.getFloatTimeDomainData(state.timeData);
  state.analyser.getByteFrequencyData(state.freqData);

  const level = measureLevel(state.timeData);
  state.signalRms = level.rms;
  state.signalPeak = level.peak;
  const signalLabel = level.peak > 0.5 ? "Hot" : level.rms > state.sensitivity / 2 ? "Live" : "Quiet";
  el.signalReadout.textContent = signalLabel;

  if (!state.usingWorklet && isDrumHit(level, now)) {
    state.lastHitAt = now;
    state.pendingAnalysis = true;
    setStatus("Hit detected", "Analyzing");
    window.setTimeout(analyzeHit, 55);
  }

  drawAll();
  state.rafId = requestAnimationFrame(loop);
}

function handleWorkletMessage(event) {
  const data = event.data;
  if (!data) return;

  if (data.type === "level") {
    state.signalRms = data.rms || 0;
    state.signalPeak = data.peak || 0;
    const signalLabel = data.peak > 0.5 ? "Hot" : data.rms > state.sensitivity / 2 ? "Live" : "Quiet";
    el.signalReadout.textContent = signalLabel;
    return;
  }

  if (data.type === "hit") {
    state.pendingAnalysis = true;
    setStatus("Hit detected", "Analyzing");
    analyzeCapturedHit(data);
  }
}

function isDrumHit(level, now) {
  const threshold = state.sensitivity;
  const isPeak = level.peak > threshold * 3.2;
  const hasBody = level.rms > threshold;
  const cooledDown = now - state.lastHitAt > 430;
  return isPeak && hasBody && cooledDown && !state.pendingAnalysis;
}

function analyzeHit() {
  if (!state.running || !state.analyser || !state.timeData) {
    state.pendingAnalysis = false;
    return;
  }

  const frame = new Float32Array(state.timeData.length);
  state.analyser.getFloatTimeDomainData(frame);
  state.analyser.getByteFrequencyData(state.freqData);
  analyzeCapturedHit({
    samples: frame,
    sampleRate: state.audioContext.sampleRate,
    preRollLength: 0,
    peak: state.signalPeak,
    rms: state.signalRms,
    noiseFloor: state.sensitivity * 0.25,
    clippedRatio: 0,
  });
}

function analyzeCapturedHit(capture) {
  const result = analyzeDrumHit(capture);

  if (!result.accepted) {
    state.rejectedTakes += 1;
    state.confidence = result.confidence || 0;
    state.qualityLabel = result.reason || "Rejected";
    setStatus("Rejected", state.qualityLabel);
    updateTakeUI();
    state.pendingAnalysis = false;
    drawAll();
    return;
  }

  acceptHit(result);
  state.pendingAnalysis = false;
  drawAll();
}

function analyzeDrumHit(capture) {
  const samples = capture.samples;
  const sampleRate = capture.sampleRate;
  const range = getSearchRange();
  const onset = findHitOnset(samples, sampleRate, capture.preRollLength || 0, capture.noiseFloor || 0.003);
  const quality = measureHitQuality(samples, sampleRate, onset, capture);

  if (!quality.accepted) {
    return {
      accepted: false,
      confidence: quality.score,
      reason: quality.reason,
    };
  }

  const windows = buildAnalysisWindows(samples, sampleRate, onset, range.min);
  if (!windows.length) {
    return {
      accepted: false,
      confidence: 0,
      reason: "Short hit",
    };
  }

  const modalCandidates = windows
    .map((window) => detectModalPeakGoertzel(window.data, sampleRate, range.min, range.max))
    .filter(Boolean);
  const modal = combineModalCandidates(modalCandidates);
  const yin = detectPitchYin(windows[0].data, sampleRate, range.min, range.max);
  const fused = fusePitchEstimates(yin, modal);

  if (!fused) {
    return {
      accepted: false,
      confidence: quality.score * 0.3,
      reason: "No stable pitch",
    };
  }

  const confidence = clamp(fused.confidence * quality.score, 0, 1);
  if (confidence < 0.48) {
    return {
      accepted: false,
      confidence,
      reason: "Low confidence",
    };
  }

  return {
    accepted: true,
    hz: fused.hz,
    cents: centsBetween(fused.hz, state.targetHz),
    confidence,
    quality,
    source: fused.source,
    spreadCents: modal?.spreadCents ?? 0,
  };
}

function findHitOnset(samples, sampleRate, preRollLength, noiseFloor) {
  const start = Math.max(0, preRollLength - Math.round(sampleRate * 0.04));
  const threshold = Math.max(state.sensitivity * 1.6, noiseFloor * 10, 0.018);
  for (let i = start; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) > threshold) return i;
  }
  return Math.max(0, preRollLength);
}

function measureHitQuality(samples, sampleRate, onset, capture) {
  const start = clamp(onset, 0, samples.length - 1);
  const end = Math.min(samples.length, start + Math.round(sampleRate * 0.36));
  let peak = 0;
  let sum = 0;
  let clipped = 0;

  for (let i = start; i < end; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
    sum += value * value;
    if (value > 0.985) clipped += 1;
  }

  const rms = Math.sqrt(sum / Math.max(1, end - start));
  const noiseFloor = Math.max(capture.noiseFloor || 0.003, 0.0005);
  const snrDb = 20 * Math.log10(Math.max(rms, 0.000001) / noiseFloor);
  const clippedRatio = Math.max(capture.clippedRatio || 0, clipped / Math.max(1, end - start));
  const crest = peak / Math.max(rms, 0.000001);
  const peakScore = clamp((peak - 0.035) / 0.23, 0, 1);
  const snrScore = clamp((snrDb - 12) / 24, 0, 1);
  const crestScore = clamp(1 - Math.abs(crest - 5.5) / 8, 0.25, 1);
  const clipPenalty = clippedRatio > 0.004 ? 0.35 : clippedRatio > 0 ? 0.75 : 1;
  const score = clamp((peakScore * 0.38 + snrScore * 0.44 + crestScore * 0.18) * clipPenalty, 0, 1);

  if (clippedRatio > 0.012) {
    return { accepted: false, score, reason: "Clipped hit", peak, rms, snrDb, clippedRatio };
  }

  if (peak < 0.035 || snrDb < 10) {
    return { accepted: false, score, reason: "Weak hit", peak, rms, snrDb, clippedRatio };
  }

  return { accepted: true, score, peak, rms, snrDb, clippedRatio };
}

function buildAnalysisWindows(samples, sampleRate, onset, minFreq) {
  const cycles = minFreq < 70 ? 5.8 : 4.6;
  const wanted = sampleRate * Math.max(0.055, cycles / Math.max(minFreq, 35));
  const size = nextPowerOfTwo(clamp(Math.round(wanted), 2048, 16384));
  const offsets = [0.028, 0.07, 0.12].map((seconds) => Math.round(seconds * sampleRate));

  return offsets
    .map((offset) => {
      const start = onset + offset;
      const safeStart = clamp(start, 0, Math.max(0, samples.length - size));
      const data = samples.subarray(safeStart, safeStart + size);
      return data.length >= 2048 ? { data, start: safeStart } : null;
    })
    .filter(Boolean);
}

function detectModalPeakGoertzel(samples, sampleRate, minFreq, maxFreq) {
  const span = maxFreq - minFreq;
  const step = span > 220 ? 1 : span > 110 ? 0.65 : 0.35;
  const bins = [];
  let bestIndex = -1;
  let bestPower = -Infinity;
  let secondPower = -Infinity;

  for (let freq = minFreq; freq <= maxFreq; freq += step) {
    const power = goertzelPower(samples, sampleRate, freq);
    bins.push({ freq, power });
    if (power > bestPower) {
      secondPower = bestPower;
      bestPower = power;
      bestIndex = bins.length - 1;
    } else if (power > secondPower && Math.abs(freq - bins[bestIndex]?.freq) > step * 6) {
      secondPower = power;
    }
  }

  if (bestIndex < 0 || !Number.isFinite(bestPower) || bestPower <= 0) return null;

  const left = bins[bestIndex - 1]?.power ?? bestPower;
  const center = bestPower;
  const right = bins[bestIndex + 1]?.power ?? bestPower;
  const divisor = left - 2 * center + right;
  const offset = Math.abs(divisor) > 1e-9 ? clamp(0.5 * (left - right) / divisor, -1, 1) : 0;
  const hz = bins[bestIndex].freq + offset * step;
  const clarity = clamp(1 - secondPower / Math.max(bestPower, 1), 0.08, 1);

  return {
    hz,
    confidence: clamp(0.42 + clarity * 0.52, 0, 0.96),
    clarity,
  };
}

function goertzelPower(samples, sampleRate, freq) {
  const omega = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const windowValue = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1));
    q0 = coeff * q1 - q2 + samples[i] * windowValue;
    q2 = q1;
    q1 = q0;
  }

  return q1 * q1 + q2 * q2 - coeff * q1 * q2;
}

function combineModalCandidates(candidates) {
  if (!candidates.length) return null;
  const weightSum = candidates.reduce((sum, item) => sum + item.confidence, 0);
  const hz = Math.exp(
    candidates.reduce((sum, item) => sum + Math.log(item.hz) * item.confidence, 0) / weightSum,
  );
  const spreadCents = Math.max(...candidates.map((item) => Math.abs(centsBetween(item.hz, hz))));
  const confidence =
    candidates.reduce((sum, item) => sum + item.confidence, 0) / candidates.length *
    clamp(1 - spreadCents / 95, 0.22, 1);
  return {
    hz,
    confidence,
    spreadCents,
    source: "modal",
  };
}

function fusePitchEstimates(yin, modal) {
  if (!yin && !modal) return null;
  if (yin && !modal) return { ...yin, source: "yin" };
  if (!yin && modal) return modal;

  const diff = Math.abs(centsBetween(yin.hz, modal.hz));
  if (diff <= 42) {
    const yinWeight = yin.confidence * 0.48;
    const modalWeight = modal.confidence * 0.52;
    return {
      hz: Math.exp((Math.log(yin.hz) * yinWeight + Math.log(modal.hz) * modalWeight) / (yinWeight + modalWeight)),
      confidence: clamp((yin.confidence + modal.confidence) / 2 + 0.1, 0, 1),
      source: "modal+yin",
    };
  }

  const octaveDiff = Math.min(
    Math.abs(centsBetween(yin.hz * 2, modal.hz)),
    Math.abs(centsBetween(yin.hz / 2, modal.hz)),
  );
  if (octaveDiff <= 45) {
    const corrected = Math.abs(centsBetween(yin.hz * 2, state.targetHz)) < Math.abs(centsBetween(yin.hz, state.targetHz))
      ? yin.hz * 2
      : yin.hz;
    return {
      hz: corrected,
      confidence: clamp(Math.max(yin.confidence, modal.confidence) * 0.82, 0, 1),
      source: "octave-corrected",
    };
  }

  const chosen = modal.confidence >= yin.confidence ? modal : yin;
  return {
    ...chosen,
    confidence: chosen.confidence * 0.68,
    source: `${chosen.source || "pitch"} disagreement`,
  };
}

function acceptHit(result) {
  addTake(state.takes, result, state.requiredTakes);
  const stats = computeTakeStats(state.takes);
  state.currentHz = stats.hz;
  state.confidence = stats.confidence;
  state.currentCents = centsBetween(stats.hz, state.targetHz);
  state.qualityLabel = qualityLabelFor(result);

  if (state.mode === "lugs" && state.lugArmed) {
    captureActiveLugTake(result);
  }

  if (state.mode === "heads") {
    captureHeadTake(result);
  }

  pushHistory(result.hz, centsBetween(result.hz, state.targetHz), result.confidence);
  updateReadouts();
  updateTakeUI();
  updateLugUI();
  updateHeadUI();
  setStatus("Captured", `${stats.hz.toFixed(1)} Hz`);
  persistSettings();
}

function addTake(target, result, limit) {
  target.push({
    hz: result.hz,
    confidence: result.confidence,
    source: result.source,
    time: Date.now(),
  });
  while (target.length > limit) target.shift();
}

function computeTakeStats(takes) {
  const valid = takes.filter((take) => Number.isFinite(take.hz));
  if (!valid.length) {
    return { hz: state.currentHz || state.targetHz, confidence: 0, spreadCents: 0 };
  }
  const weightSum = valid.reduce((sum, take) => sum + Math.max(0.1, take.confidence), 0);
  const hz = Math.exp(
    valid.reduce((sum, take) => sum + Math.log(take.hz) * Math.max(0.1, take.confidence), 0) / weightSum,
  );
  const spreadCents = Math.max(...valid.map((take) => Math.abs(centsBetween(take.hz, hz))));
  const averageConfidence = valid.reduce((sum, take) => sum + take.confidence, 0) / valid.length;
  const stability = clamp(1 - spreadCents / 36, 0.35, 1);
  return {
    hz,
    confidence: clamp(averageConfidence * stability, 0, 1),
    spreadCents,
  };
}

function captureActiveLugTake(result) {
  const lug = state.lugs[state.activeLug];
  addTake(lug.takes, result, state.requiredTakes);
  const stats = computeTakeStats(lug.takes);
  lug.hz = stats.hz;
  lug.confidence = stats.confidence;

  if (lug.takes.length >= state.requiredTakes && stats.spreadCents <= 22) {
    state.activeLug = getNextLugIndex();
    if (!state.lugs[state.activeLug].hz) {
      state.lugs[state.activeLug].takes = [];
      state.lugs[state.activeLug].confidence = 0;
    }
  }
}

function getNextLugIndex() {
  const sequence = getLugSequence(state.lugs.length, state.lugPattern);
  const currentPosition = Math.max(0, sequence.indexOf(state.activeLug));
  return sequence[(currentPosition + 1) % sequence.length];
}

function captureHeadTake(result) {
  const head = state.heads[state.headSide];
  addTake(head.takes, result, state.requiredTakes);
  const stats = computeTakeStats(head.takes);
  head.hz = stats.hz;
  head.confidence = stats.confidence;
}

function resetTakes() {
  state.takes = [];
  state.rejectedTakes = 0;
  state.confidence = 0;
  state.qualityLabel = "Idle";
  updateTakeUI();
  updateReadouts();
  drawMeter();
}

function qualityLabelFor(result) {
  if (result.confidence >= 0.82) return "Strong";
  if (result.confidence >= 0.64) return "Good";
  return "Usable";
}

function getSearchRange() {
  if (!el.targetFilter.checked) {
    const preset = presets[el.presetSelect.value];
    return {
      min: preset?.min || 35,
      max: preset?.max || 450,
    };
  }

  const factor = state.searchFactor;
  const preset = presets[el.presetSelect.value];
  return {
    min: clamp(Math.max(state.targetHz / factor, preset?.min || 35), 35, 450),
    max: clamp(Math.min(state.targetHz * factor, preset?.max || 450), 35, 450),
  };
}

function choosePitch(yin, spectral) {
  if (yin?.hz && yin.confidence >= 0.45) {
    return yin;
  }

  if (yin?.hz && spectral?.hz) {
    const ratio = Math.max(yin.hz, spectral.hz) / Math.min(yin.hz, spectral.hz);
    if (ratio < 1.08 || Math.abs(ratio - 2) < 0.08 || Math.abs(ratio - 0.5) < 0.08) {
      return yin.confidence >= 0.28 ? yin : spectral;
    }
  }

  return spectral || yin;
}

function detectPitchYin(input, sampleRate, minFreq, maxFreq) {
  const buffer = prepareBuffer(input);
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxTau = Math.min(buffer.length - 2, Math.floor(sampleRate / minFreq));
  if (maxTau <= minTau) return null;

  const diff = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau += 1) {
    let sum = 0;
    const limit = buffer.length - tau;
    for (let i = 0; i < limit; i += 1) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  let runningSum = 0;
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let tauEstimate = -1;
  const threshold = 0.18;

  for (let tau = 1; tau <= maxTau; tau += 1) {
    runningSum += diff[tau];
    cmnd[tau] = diff[tau] * tau / (runningSum || 1);
    if (tau >= minTau && cmnd[tau] < threshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) {
        tau += 1;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate < 0) {
    let bestTau = minTau;
    let bestValue = Infinity;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (cmnd[tau] < bestValue) {
        bestValue = cmnd[tau];
        bestTau = tau;
      }
    }
    if (bestValue > 0.52) return null;
    tauEstimate = bestTau;
  }

  const betterTau = parabolicInterpolation(cmnd, tauEstimate);
  const hz = sampleRate / betterTau;
  if (!Number.isFinite(hz) || hz < minFreq || hz > maxFreq) return null;
  return {
    hz,
    confidence: clamp(1 - cmnd[tauEstimate], 0, 1),
    source: "yin",
  };
}

function prepareBuffer(input) {
  let mean = 0;
  for (let i = 0; i < input.length; i += 1) mean += input[i];
  mean /= input.length;

  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const windowValue = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (input.length - 1));
    output[i] = (input[i] - mean) * windowValue;
  }
  return output;
}

function parabolicInterpolation(values, index) {
  const left = values[index - 1] ?? values[index];
  const center = values[index];
  const right = values[index + 1] ?? values[index];
  const divisor = left - 2 * center + right;
  if (Math.abs(divisor) < 1e-12) return index;
  return index + 0.5 * (left - right) / divisor;
}

function detectSpectralPeak(freqData, sampleRate, minFreq, maxFreq) {
  if (!freqData) return null;
  const fftSize = freqData.length * 2;
  const minBin = Math.max(1, Math.floor((minFreq * fftSize) / sampleRate));
  const maxBin = Math.min(freqData.length - 2, Math.ceil((maxFreq * fftSize) / sampleRate));
  let bestBin = minBin;
  let bestValue = -Infinity;

  for (let bin = minBin; bin <= maxBin; bin += 1) {
    const hz = (bin * sampleRate) / fftSize;
    const lowBias = 1 / Math.sqrt(Math.max(1, hz / 80));
    const value = freqData[bin] * lowBias;
    if (value > bestValue) {
      bestValue = value;
      bestBin = bin;
    }
  }

  if (bestValue < 26) return null;
  const left = freqData[bestBin - 1] || 0;
  const center = freqData[bestBin] || 0;
  const right = freqData[bestBin + 1] || 0;
  const divisor = left - 2 * center + right;
  const offset = Math.abs(divisor) > 1e-9 ? 0.5 * (left - right) / divisor : 0;
  const refinedBin = bestBin + clamp(offset, -0.5, 0.5);
  return {
    hz: (refinedBin * sampleRate) / fftSize,
    confidence: clamp(bestValue / 180, 0.15, 0.85),
    source: "spectrum",
  };
}

function measureLevel(buffer) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = Math.abs(buffer[i]);
    sum += value * value;
    if (value > peak) peak = value;
  }
  return {
    rms: Math.sqrt(sum / buffer.length),
    peak,
  };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("drumTunerSettings") || "null");
    if (!saved) return;

    if (presets[saved.preset]) {
      el.presetSelect.value = saved.preset;
      state.targetHz = presets[saved.preset].hz;
    }
    if (Number.isFinite(saved.targetHz)) {
      state.targetHz = clamp(saved.targetHz, 35, 450);
      el.targetInput.value = state.targetHz.toFixed(1);
    }
    if (Number.isFinite(saved.searchFactor)) {
      state.searchFactor = clamp(saved.searchFactor, 0.5, 2.5);
      el.rangeInput.value = String(state.searchFactor);
    }
    if (Number.isFinite(saved.sensitivity)) {
      state.sensitivity = clamp(saved.sensitivity, 0.01, 0.18);
      el.sensitivityInput.value = String(state.sensitivity);
    }
    if (Number.isFinite(saved.requiredTakes)) {
      state.requiredTakes = clamp(Math.round(saved.requiredTakes), 1, 5);
      el.takesSelect.value = String(state.requiredTakes);
    }
    if ([6, 8, 10].includes(saved.lugCount)) {
      state.lugs = createLugs(saved.lugCount);
      el.lugCountSelect.value = String(saved.lugCount);
    }
    if (saved.lugPattern === "clockwise" || saved.lugPattern === "star") {
      state.lugPattern = saved.lugPattern;
      state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
    }
    if (saved.headSide === "batter" || saved.headSide === "resonant") {
      state.headSide = saved.headSide;
      el.headSideSelect.value = saved.headSide;
    }
  } catch {
    localStorage.removeItem("drumTunerSettings");
  }
}

function persistSettings() {
  const settings = {
    preset: el.presetSelect.value,
    targetHz: state.targetHz,
    searchFactor: state.searchFactor,
    sensitivity: state.sensitivity,
    requiredTakes: state.requiredTakes,
    lugCount: state.lugs.length,
    lugPattern: state.lugPattern,
    headSide: state.headSide,
  };
  try {
    localStorage.setItem("drumTunerSettings", JSON.stringify(settings));
  } catch {
    // Settings persistence is optional; tuning must still work without storage.
  }
}

function updateSecureState() {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if (window.isSecureContext || isLocal) {
    el.secureState.textContent = "Mic ready";
    return;
  }
  el.secureState.textContent = "HTTPS required on iPhone";
}

function updateTargetUI() {
  const preset = presets[el.presetSelect.value] || presets.custom;
  el.presetName.textContent = el.presetSelect.value === "custom" ? "Custom" : preset.name;
  el.targetReadout.textContent = `${state.targetHz.toFixed(1)} Hz`;
  updateReadouts();
  drawMeter();
}

function updateReadouts() {
  if (!state.currentHz) {
    el.frequencyReadout.textContent = "-- Hz";
    el.noteReadout.textContent = state.running ? "Listening" : "Tap a drum";
    el.centsReadout.textContent = "-- cents";
    el.confidenceReadout.textContent = "--%";
    el.stripPointer.style.left = "50%";
    return;
  }

  const note = frequencyToNote(state.currentHz);
  const cents = centsBetween(state.currentHz, state.targetHz);
  state.currentCents = cents;
  el.frequencyReadout.textContent = `${state.currentHz.toFixed(1)} Hz`;
  el.noteReadout.textContent = `${note.name}${note.octave} (${note.cents >= 0 ? "+" : ""}${note.cents}c)`;
  el.centsReadout.textContent = `${cents >= 0 ? "+" : ""}${Math.round(cents)} cents`;
  el.confidenceReadout.textContent = `${Math.round(state.confidence * 100)}%`;
  el.stripPointer.style.left = `${clamp(50 + cents, 0, 100)}%`;
}

function updateTakeUI() {
  const rejected = state.rejectedTakes ? ` R${state.rejectedTakes}` : "";
  el.takeReadout.textContent = `${Math.min(state.takes.length, state.requiredTakes)}/${state.requiredTakes}${rejected}`;
  if (!state.currentHz) {
    el.confidenceReadout.textContent = state.confidence ? `${Math.round(state.confidence * 100)}%` : "--%";
  }
}

function updateLugPatternUI() {
  el.lugPatternButtons.forEach((button) => {
    const active = button.dataset.lugPattern === state.lugPattern;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateLugUI() {
  const readings = state.lugs.map((lug) => lug.hz).filter((value) => Number.isFinite(value));
  if (!readings.length) {
    el.lugAverage.textContent = state.lugArmed ? `Lug ${state.activeLug + 1}` : "-- Hz avg";
    el.captureLugButton.textContent = state.lugArmed ? `Pause lug ${state.activeLug + 1}` : `Arm lug ${state.activeLug + 1}`;
    return;
  }
  const average = readings.reduce((sum, value) => sum + value, 0) / readings.length;
  const active = state.lugs[state.activeLug];
  const activeTakes = active?.takes.length || 0;
  el.lugAverage.textContent = state.lugArmed
    ? `Lug ${state.activeLug + 1} ${activeTakes}/${state.requiredTakes}`
    : `${average.toFixed(1)} Hz avg`;
  el.captureLugButton.textContent = state.lugArmed ? `Pause lug ${state.activeLug + 1}` : `Arm lug ${state.activeLug + 1}`;
}

function updateHeadUI() {
  const batter = state.heads.batter.hz;
  const resonant = state.heads.resonant.hz;
  if (batter && resonant) {
    el.headRatioReadout.textContent = `${(resonant / batter).toFixed(2)} ratio`;
  } else {
    const active = state.heads[state.headSide];
    el.headRatioReadout.textContent = active.hz ? `${active.hz.toFixed(1)} Hz` : "-- ratio";
  }
}

function setMode(mode) {
  state.mode = mode;
  if (mode !== "lugs") state.lugArmed = false;
  el.segments.forEach((segment) => {
    const active = segment.dataset.mode === mode;
    segment.classList.toggle("active", active);
    segment.setAttribute("aria-selected", String(active));
  });
  el.modeLabel.textContent =
    mode === "lugs" ? "Lug tuning" : mode === "heads" ? "Head matching" : "Pitch tuning";
  updateLugUI();
  drawMeter();
}

function setStatus(signal, analysis) {
  el.signalReadout.textContent = signal;
  el.analysisStatus.textContent = analysis;
}

function pushHistory(hz, cents, confidence = 0) {
  state.history.unshift({
    hz,
    cents,
    confidence,
    time: new Date(),
  });
  state.history = state.history.slice(0, 9);
  renderHistory();
}

function renderHistory() {
  el.historyList.replaceChildren();
  state.history.forEach((item) => {
    const chip = document.createElement("span");
    const abs = Math.abs(item.cents);
    chip.className = `history-chip ${abs <= 5 ? "good" : abs <= 18 ? "warn" : "bad"}`;
    chip.textContent = `${item.hz.toFixed(1)} Hz  ${item.cents >= 0 ? "+" : ""}${Math.round(item.cents)}c  ${Math.round((item.confidence || 0) * 100)}%`;
    el.historyList.append(chip);
  });
}

function drawAll() {
  drawMeter();
  drawWaveform();
  drawSpectrum();
}

function drawMeter() {
  const canvas = el.meterCanvas;
  const ctx = meterCtx;
  const width = canvas.width;
  const height = canvas.height;
  const center = width / 2;
  const radius = width * 0.36;
  ctx.clearRect(0, 0, width, height);

  const shellGradient = ctx.createRadialGradient(center, center, width * 0.1, center, center, width * 0.46);
  shellGradient.addColorStop(0, "#20282a");
  shellGradient.addColorStop(0.55, "#111718");
  shellGradient.addColorStop(1, "#070a0b");
  ctx.fillStyle = shellGradient;
  ctx.beginPath();
  ctx.arc(center, center, width * 0.46, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2c3a3a";
  ctx.lineWidth = width * 0.055;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  const cents = Number.isFinite(state.currentCents) ? clamp(state.currentCents, -50, 50) : 0;
  const startAngle = -Math.PI * 0.78;
  const endAngle = Math.PI * 0.78;
  const angle = map(cents, -50, 50, startAngle, endAngle);

  ctx.strokeStyle = colorForCents(cents);
  ctx.lineWidth = width * 0.065;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(center, center, radius, startAngle, angle, false);
  ctx.stroke();
  ctx.lineCap = "butt";

  for (let i = -50; i <= 50; i += 10) {
    const tickAngle = map(i, -50, 50, startAngle, endAngle);
    const inner = radius - width * (i % 25 === 0 ? 0.06 : 0.035);
    const outer = radius + width * 0.035;
    drawRadialLine(ctx, center, center, inner, outer, tickAngle, i === 0 ? "#f3fff9" : "#72807c", i === 0 ? 5 : 3);
  }

  drawNeedle(ctx, center, center, radius * 0.95, angle, colorForCents(cents));

  if (state.mode === "lugs") {
    drawLugs(ctx, center, center, radius * 1.03);
  } else if (state.mode === "heads") {
    drawHeadMatcher(ctx, center, center, radius);
  } else {
    drawTargetArc(ctx, center, center, radius * 1.18);
  }

  drawInputRing(ctx, center, center, width * 0.47);
}

function drawTargetArc(ctx, x, y, radius) {
  ctx.strokeStyle = "rgba(87, 184, 255, 0.65)";
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 14]);
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI * 0.62, Math.PI * 0.62);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLugs(ctx, x, y, radius) {
  const readings = state.lugs.map((lug) => lug.hz).filter((value) => Number.isFinite(value));
  const average = readings.length ? readings.reduce((sum, value) => sum + value, 0) / readings.length : state.targetHz;
  const lugPoints = [];

  for (let i = 0; i < state.lugs.length; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / state.lugs.length;
    lugPoints[i] = {
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
    };
  }

  if (state.lugPattern === "star") {
    const sequence = getLugSequence(state.lugs.length, state.lugPattern);
    ctx.strokeStyle = "rgba(87, 184, 255, 0.34)";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 13]);
    ctx.beginPath();
    sequence.forEach((lugIndex, position) => {
      const point = lugPoints[lugIndex];
      if (position === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < state.lugs.length; i += 1) {
    const lx = lugPoints[i].x;
    const ly = lugPoints[i].y;
    const lug = state.lugs[i];
    const value = lug.hz;
    const offset = Number.isFinite(value) ? centsBetween(value, average) : null;
    const active = i === state.activeLug;
    const armed = active && state.lugArmed;

    ctx.fillStyle = offset === null ? "#ecf3ef" : colorForCents(offset);
    ctx.strokeStyle = armed ? "#39d67a" : active ? "#57b8ff" : "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = armed ? 9 : active ? 7 : 3;
    ctx.beginPath();
    ctx.arc(lx, ly, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = offset === null ? "#101615" : "#07100c";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label =
      offset === null ? String(i + 1) : `${offset >= 0 ? "+" : ""}${Math.round(offset)}`;
    ctx.fillText(label, lx, ly);

    if (lug.takes.length) {
      ctx.fillStyle = "#07100c";
      ctx.font = "800 13px system-ui, sans-serif";
      ctx.fillText(`${lug.takes.length}/${state.requiredTakes}`, lx, ly + 22);
    }
  }
}

function drawHeadMatcher(ctx, x, y, radius) {
  const batter = state.heads.batter.hz || (state.headSide === "batter" ? state.currentHz : null) || state.targetHz;
  const resonant = state.heads.resonant.hz || (state.headSide === "resonant" ? state.currentHz : null) || state.targetHz;
  const leftX = x - radius * 0.42;
  const rightX = x + radius * 0.42;

  drawMiniDial(ctx, leftX, y + radius * 0.52, batter, "Batter");
  drawMiniDial(ctx, rightX, y + radius * 0.52, resonant, "Reso");
}

function drawMiniDial(ctx, x, y, hz, label) {
  ctx.strokeStyle = "#39d67a";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(x, y, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f2faf7";
  ctx.font = "900 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(hz.toFixed(1), x, y - 4);
  ctx.fillStyle = "#9aa7a3";
  ctx.font = "800 15px system-ui, sans-serif";
  ctx.fillText(label, x, y + 25);
}

function drawInputRing(ctx, x, y, radius) {
  const level = clamp(state.signalRms * 8, 0, 1);
  ctx.strokeStyle = `rgba(57, 214, 122, ${0.16 + level * 0.65})`;
  ctx.lineWidth = 5 + level * 10;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawNeedle(ctx, x, y, length, angle, color) {
  const readoutClearance = 92;
  const baseY = -Math.min(readoutClearance, length - 34);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-10, baseY);
  ctx.lineTo(10, baseY);
  ctx.lineTo(0, -length);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRadialLine(ctx, x, y, inner, outer, angle, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
  ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  ctx.stroke();
}

function drawWaveform() {
  const canvas = el.waveCanvas;
  const ctx = waveCtx;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#090d0e";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  if (!state.timeData) {
    drawCanvasLabel(ctx, width, height, "Waveform");
    return;
  }

  ctx.strokeStyle = "#39d67a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(state.timeData.length / width));
  for (let x = 0; x < width; x += 1) {
    const value = state.timeData[x * step] || 0;
    const y = height / 2 + value * height * 0.42;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawSpectrum() {
  const canvas = el.spectrumCanvas;
  const ctx = spectrumCtx;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#090d0e";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  if (!state.freqData || !state.audioContext) {
    drawCanvasLabel(ctx, width, height, "Spectrum");
    return;
  }

  const sampleRate = state.audioContext.sampleRate;
  const fftSize = state.freqData.length * 2;
  const maxHz = 500;
  ctx.fillStyle = "#57b8ff";
  for (let x = 0; x < width; x += 2) {
    const hz = (x / width) * maxHz;
    const bin = Math.round((hz * fftSize) / sampleRate);
    const value = state.freqData[bin] || 0;
    const barHeight = (value / 255) * height * 0.9;
    ctx.fillRect(x, height - barHeight, 2, barHeight);
  }

  const targetX = (state.targetHz / maxHz) * width;
  ctx.strokeStyle = "#39d67a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(targetX, 0);
  ctx.lineTo(targetX, height);
  ctx.stroke();
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += height / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawCanvasLabel(ctx, width, height, label) {
  ctx.fillStyle = "#7f8c88";
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2);
}

function frequencyToNote(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const name = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return {
    name,
    octave,
    cents: Math.round((exact - midi) * 100),
  };
}

function centsBetween(value, target) {
  return 1200 * Math.log2(value / target);
}

function colorForCents(cents) {
  const abs = Math.abs(cents);
  if (abs <= 6) return "#39d67a";
  if (abs <= 22) return "#f4b95a";
  return "#ff6868";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function map(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}
