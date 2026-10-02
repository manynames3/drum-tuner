const presets = {
  kick22: { name: "22 in kick", hz: 60, min: 38, max: 110 },
  kick20: { name: "20 in kick", hz: 72, min: 45, max: 125 },
  floor16: { name: "16 in floor tom", hz: 69.3, min: 55, max: 150, guide: [65.4, 73.4] },
  floor14: { name: "14 in floor tom", hz: 87.3, min: 65, max: 170, guide: [82.4, 98] },
  rack13: { name: "13 in rack tom", hz: 87.3, min: 75, max: 190, guide: [87.3, 104] },
  rack12: { name: "12 in rack tom", hz: 110, min: 82, max: 215, guide: [98, 131] },
  rack10: { name: "10 in rack tom", hz: 147, min: 98, max: 260, guide: [131, 165] },
  snare14: { name: "14 in snare", hz: 196, min: 130, max: 340, guide: [165, 233] },
  snare14High: { name: "14 in snare high", hz: 220, min: 145, max: 390, guide: [165, 233] },
  custom: { name: "Custom", hz: 123.5 },
};

const legacyPresetHz = { floor16: 87.3, floor14: 98, rack13: 110, rack12: 123.5 };

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const colors = {
  bgBase: "#111315",
  surface: "#1d2225",
  elevated: "#2c3438",
  text: "#f6f7f4",
  secondary: "#a9b2b4",
  accent: "#8de0db",
  accentSoft: "rgba(141, 224, 219, 0.20)",
  success: "#8de0db",
  warning: "#f6c56a",
  error: "#ff8b85",
  border: "rgba(255, 255, 255, 0.12)",
};

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
  feedback: document.querySelector("#feedback"),
  feedbackTitle: document.querySelector("#feedbackTitle"),
  feedbackDetail: document.querySelector("#feedbackDetail"),
  readingState: document.querySelector("#readingState"),
  pitchDeviation: document.querySelector("#pitchDeviation"),
  pitchNeedle: document.querySelector("#pitchNeedle"),
  lugButtons: document.querySelector("#lugButtons"),
  inputLevel: document.querySelector("#inputLevel"),
  presetSelect: document.querySelector("#presetSelect"),
  presetName: document.querySelector("#presetName"),
  targetInput: document.querySelector("#targetInput"),
  rangeInput: document.querySelector("#rangeInput"),
  targetFilter: document.querySelector("#targetFilter"),
  filterReference: document.querySelector("#filterReference"),
  measurementGuide: document.querySelector("#measurementGuide"),
  sensitivityInput: document.querySelector("#sensitivityInput"),
  takesSelect: document.querySelector("#takesSelect"),
  resetTakesButton: document.querySelector("#resetTakesButton"),
  lugCountSelect: document.querySelector("#lugCountSelect"),
  lugPatternButtons: document.querySelectorAll("[data-lug-pattern]"),
  captureLugButton: document.querySelector("#captureLugButton"),
  clearLugsButton: document.querySelector("#clearLugsButton"),
  lugAverage: document.querySelector("#lugAverage"),
  lugReferenceNote: document.querySelector("#lugReferenceNote"),
  setLugReferenceButton: document.querySelector("#setLugReferenceButton"),
  headButtons: document.querySelectorAll("[data-head]"),
  soundGoalSelect: document.querySelector("#soundGoalSelect"),
  headRatioInput: document.querySelector("#headRatioInput"),
  customGoalField: document.querySelector("#customGoalField"),
  goalReadout: document.querySelector("#goalReadout"),
  kitNameInput: document.querySelector("#kitNameInput"),
  drumNameInput: document.querySelector("#drumNameInput"),
  saveDrumButton: document.querySelector("#saveDrumButton"),
  kitStatus: document.querySelector("#kitStatus"),
  kitDrumList: document.querySelector("#kitDrumList"),
  kitCount: document.querySelector("#kitCount"),
  resetHeadsButton: document.querySelector("#resetHeadsButton"),
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
  opening: false,
  micRequest: 0,
  generation: 0,
  captureGeneration: 0,
  measuredLug: null,
  pendingAnalysis: false,
  lastHitAt: 0,
  timeData: null,
  freqData: null,
  targetHz: 110,
  mode: "pitch",
  searchFactor: 1.4,
  pitchLockHz: null,
  sensitivity: 0.025,
  signalRms: 0,
  signalPeak: 0,
  currentHz: null,
  currentCents: null,
  confidence: 0,
  qualityLabel: "Idle",
  lastTriggerLevel: null,
  workletCaptureStartedAt: 0,
  analyzerCandidateAt: 0,
  requiredTakes: 3,
  takes: [],
  rejectedTakes: 0,
  lugs: createLugs(8),
  activeLug: 0,
  lugPattern: "clockwise",
  lugArmed: false,
  lugReference: null,
  savedLugTargetHz: null,
  heads: {
    batter: createHeadState(),
    resonant: createHeadState(),
  },
  headSide: "batter",
  headGoal: 1.2,
  headGoalCustom: false,
  savedHeadTargets: { batter: null, resonant: null },
  kits: [],
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
    complete: false,
  }));
}

function createHeadState() {
  return {
    hz: null,
    confidence: 0,
    takes: [],
    complete: false,
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
  loadKits();
  updateSecureState();
  bindControls();
  drawAll();
  updateTargetUI();
  updateTakeUI();
  updateLugPatternUI();
  updateLugUI();
  updateHeadUI();
  updateGoalUI();
  renderKits();
  setMode("pitch");
  updateCaptureSettings();
  observeMeterLayout();
}

function observeMeterLayout() {
  const meter = document.querySelector(".meter-wrap");
  const readout = document.querySelector(".readout");
  const frequency = document.querySelector(".frequency");
  const unit = document.querySelector(".unit");
  const measure = document.createElement("canvas").getContext("2d");
  const textWidth = element => {
    if (element.hidden) return 0;
    const style = getComputedStyle(element);
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = style.textTransform === "uppercase" ? element.textContent.toUpperCase() : element.textContent;
    return measure.measureText(text).width;
  };
  const resize = () => {
    const width = meter.getBoundingClientRect().width;
    const lugMode = state.mode === "lugs";
    const frequencyWidth = textWidth(el.frequencyReadout) + textWidth(unit) + parseFloat(getComputedStyle(frequency).gap);
    const widest = Math.max(frequencyWidth, textWidth(el.modeLabel), textWidth(el.noteReadout), textWidth(el.readingState));
    // Keep enlarged text readable without letting it cover the scale or lug controls.
    meter.classList.toggle("readout-below", widest > width * (lugMode ? .56 : .7)
      || readout.getBoundingClientRect().height > width * (lugMode ? .44 : .55));
  };
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(resize);
  });
  [meter, readout, frequency, el.noteReadout, el.readingState].forEach(element => observer.observe(element));
}

function bindControls() {
  el.micButton.addEventListener("click", () => {
    if (state.running || state.opening) {
      stopMic();
    } else {
      startMic();
    }
  });

  el.presetSelect.addEventListener("change", () => {
    const preset = presets[el.presetSelect.value];
    if (!preset) return;
    if (el.presetSelect.value !== "custom") state.targetHz = preset.hz;
    el.targetInput.value = String(state.targetHz);
    clearSavedTargets();
    clearMeasurements();
    updateTargetUI();
    persistSettings();
  });

  el.targetInput.addEventListener("change", () => {
    const next = Number(el.targetInput.value);
    if (!Number.isFinite(next) || next < 35 || next > 450) {
      el.targetInput.value = String(state.targetHz);
      setFeedback("Target unchanged", "Choose a frequency from 35 to 450 Hz.", "warning");
      return;
    }
    state.targetHz = next;
    el.presetSelect.value = "custom";
    clearSavedTargets();
    clearPitchLock();
    resetTakes();
    updateTargetUI();
    updateLugUI();
    persistSettings();
  });

  el.rangeInput.addEventListener("input", () => {
    state.searchFactor = Number(el.rangeInput.value);
    updateCaptureSettings();
    persistSettings();
  });

  el.targetFilter.addEventListener("change", () => {
    if (el.targetFilter.checked) {
      const stats = computeTakeStats(state.takes);
      if (state.mode !== "pitch" || state.requiredTakes < 3 || !hasStableReading(stats)) {
        el.targetFilter.checked = false;
      } else {
        state.pitchLockHz = stats.hz;
      }
    } else {
      state.pitchLockHz = null;
    }
    updateCaptureSettings();
    resetTakes();
  });

  el.sensitivityInput.addEventListener("input", () => {
    state.sensitivity = Number(el.sensitivityInput.value);
    updateCaptureSettings();
    state.workletNode?.port.postMessage({ type: "settings", sensitivity: state.sensitivity });
    persistSettings();
  });

  el.takesSelect.addEventListener("change", () => {
    state.requiredTakes = Number(el.takesSelect.value);
    clearPitchLock();
    clearMeasurements();
    persistSettings();
  });

  el.resetTakesButton.addEventListener("click", () => {
    if (state.mode === "lugs") {
      state.activeLug = state.measuredLug ?? state.activeLug;
      state.lugs[state.activeLug] = createLugs(1)[0];
      state.lugArmed = false;
    }
    if (state.mode === "heads") state.heads[state.headSide] = createHeadState();
    resetTakes();
    updateLugUI();
    updateHeadUI();
  });

  el.lugCountSelect.addEventListener("change", () => {
    const count = Number(el.lugCountSelect.value);
    state.lugs = createLugs(count);
    state.activeLug = getLugSequence(count, state.lugPattern)[0];
    state.lugArmed = false;
    state.lugReference = null;
    state.savedLugTargetHz = null;
    resetTakes();
    updateLugUI();
    persistSettings();
  });

  el.lugPatternButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.lugPattern = button.dataset.lugPattern;
      state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
      state.lugArmed = false;
      resetTakes();
      updateLugPatternUI();
      updateLugUI();
      drawMeter();
      persistSettings();
    });
  });

  el.captureLugButton.addEventListener("click", async () => {
    if (state.lugArmed) {
      state.lugArmed = false;
      state.generation += 1;
      updateLugUI();
      updateReadouts();
      setFeedback("Lug capture paused", "Your captured readings are kept.");
      return;
    }
    const selectedLug = state.activeLug;
    const generation = state.generation;
    if (!state.running) await startMic();
    if (!state.running || state.mode !== "lugs" || selectedLug !== state.activeLug || generation !== state.generation) return;
    state.lugs[state.activeLug] = createLugs(1)[0];
    resetTakes();
    state.lugArmed = true;
    updateLugUI();
    showReadyFeedback();
  });

  el.clearLugsButton.addEventListener("click", () => {
    state.lugs = createLugs(state.lugs.length);
    state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
    state.lugArmed = false;
    state.lugReference = null;
    resetTakes();
    updateLugUI();
  });

  el.setLugReferenceButton.addEventListener("click", () => {
    const lug = state.lugs[state.activeLug];
    if (!lug.complete) return;
    state.lugReference = { index: state.activeLug, hz: lug.hz };
    state.savedLugTargetHz = null;
    updateLugUI();
    updateReadouts();
    setFeedback(`Lug ${state.activeLug + 1} is the reference`, "Other lug offsets now compare to this fixed reading.", "good");
  });

  el.soundGoalSelect.addEventListener("change", () => {
    state.headGoalCustom = el.soundGoalSelect.value === "custom";
    if (!state.headGoalCustom) state.headGoal = Number(el.soundGoalSelect.value);
    updateGoalUI();
    persistSettings();
  });
  el.headRatioInput.addEventListener("change", () => {
    const value = Number(el.headRatioInput.value);
    if (Number.isFinite(value) && value >= .6 && value <= 2) state.headGoal = value;
    updateGoalUI();
    persistSettings();
  });
  el.saveDrumButton.addEventListener("click", saveCurrentDrum);
  el.kitDrumList.addEventListener("click", event => {
    const button = event.target.closest("button[data-kit-action]");
    if (!button) return;
    const [kitIndex, drumIndex] = [Number(button.dataset.kit), Number(button.dataset.drum)];
    if (button.dataset.kitAction === "load") loadSavedDrum(kitIndex, drumIndex);
    if (button.dataset.kitAction === "remove") removeSavedDrum(kitIndex, drumIndex);
  });

  el.headButtons.forEach(button => button.addEventListener("click", () => {
    state.headSide = button.dataset.head;
    resetTakes();
    restoreHeadReading();
    updateHeadUI();
    persistSettings();
  }));

  el.resetHeadsButton.addEventListener("click", () => {
    state.heads = { batter: createHeadState(), resonant: createHeadState() };
    resetTakes();
    updateHeadUI();
  });

  el.lugButtons.addEventListener("click", event => {
    const button = event.target.closest("[data-lug]");
    if (!button) return;
    state.activeLug = Number(button.dataset.lug);
    state.lugArmed = false;
    resetTakes();
    const lug = state.lugs[state.activeLug];
    if (lug.hz) {
      state.currentHz = lug.hz;
      state.confidence = lug.confidence;
      state.takes = [...lug.takes];
      state.measuredLug = state.activeLug;
    }
    updateReadouts();
    updateTakeUI();
    updateLugUI();
    const reference = referenceHz("lugs");
    if (lug.complete && reference) {
      const cents = centsBetween(lug.hz, reference);
      setFeedback(`Lug ${state.activeLug + 1} · ${Math.abs(cents) <= 6 ? "matched" : cents < 0 ? "below reference" : "above reference"}`,
        Math.abs(cents) <= 6 ? "Within 6 cents of the fixed lug reference."
          : cents < 0 ? "Tighten this rod slightly, then recapture." : "Loosen this rod slightly, then recapture.",
        Math.abs(cents) <= 6 ? "good" : "warning");
    }
    drawMeter();
  });

  const help = document.querySelector("#helpDialog");
  document.querySelector("#helpButton").addEventListener("click", () => help.showModal());
  document.querySelector("#closeHelp").addEventListener("click", () => help.close());
  help.addEventListener("click", event => { if (event.target === help) {
    const rect = help.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) help.close();
  } });
  document.querySelector(".segmented").addEventListener("keydown", event => {
    const tabs = [...el.segments];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    setMode(tabs[next].dataset.mode);
    tabs[next].focus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (state.running || state.opening)) {
      stopMic();
      setFeedback("Microphone paused", "Start the mic again when you return.");
    }
  });

  el.segments.forEach((segment) => {
    segment.addEventListener("click", () => setMode(segment.dataset.mode));
  });

  window.addEventListener("resize", drawAll);
}

function createInputAudioContext(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const inputRate = stream.getAudioTracks()[0]?.getSettings?.().sampleRate;
  const options = { latencyHint: "interactive" };
  if (Number.isFinite(inputRate) && inputRate > 0) options.sampleRate = inputRate;
  try {
    return new AudioContextClass(options);
  } catch (error) {
    if (!options.sampleRate || error.name !== "NotSupportedError") throw error;
    return new AudioContextClass({ latencyHint: "interactive" });
  }
}

async function startMic() {
  if (state.opening || state.running) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setFeedback("Microphone unavailable", window.isSecureContext ? "Open in Safari or Chrome and allow microphone access." : "Open this app over HTTPS to use the microphone.", "error");
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setStatus("HTTPS required", "iPhone mic needs HTTPS");
    return;
  }

  state.opening = true;
  const request = ++state.micRequest;
  el.micButtonText.textContent = "Cancel";
  el.captureLugButton.disabled = true;
  let stream;
  let audioContext;
  try {
    setFeedback("Allow microphone access", "Your browser is waiting for permission. Audio stays on this device.");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    if (request !== state.micRequest) { stream.getTracks().forEach(track => track.stop()); return; }
    state.stream = stream;
    audioContext = createInputAudioContext(stream);
    state.audioContext = audioContext;
    await audioContext.resume();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 16384;
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
        if (request === state.micRequest) setStatus("Listening", "Standard capture");
      }
    }

    if (request !== state.micRequest) {
      stream.getTracks().forEach(track => track.stop());
      await audioContext.close();
      return;
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
    el.micButton.setAttribute("aria-pressed", "true");
    stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
      if (state.running) { stopMic(); setFeedback("Microphone disconnected", "Reconnect your input, then start the mic again.", "error"); }
    }));
    audioContext.addEventListener("statechange", () => {
      if (state.running && ["suspended", "interrupted"].includes(audioContext.state)) {
        stopMic(); setFeedback("Audio interrupted", "Start the mic again to resume tuning.", "warning");
      }
    });
    updateSecureState();
    updateReadouts();
    showReadyFeedback();
    loop();
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== "closed") await audioContext.close().catch(() => {});
    if (request !== state.micRequest) return;
    state.stream = null;
    state.audioContext = null;
    const denied = ["NotAllowedError", "PermissionDeniedError"].includes(error?.name);
    setFeedback(denied ? "Microphone access blocked" : "Microphone unavailable",
      denied ? "Allow microphone access in your browser's site settings, then try again." : "Check your microphone connection and close other audio apps, then try again.", "error");
    el.micButtonText.textContent = "Try mic again";
    el.secureState.textContent = "Mic unavailable";
  } finally {
    if (request === state.micRequest) {
      state.opening = false;
      el.captureLugButton.disabled = false;
    }
  }
}

function stopMic() {
  state.micRequest += 1;
  state.generation += 1;
  state.lugArmed = false;
  state.opening = false;
  el.captureLugButton.disabled = false;
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
  if (state.audioContext) state.audioContext.close().catch(() => {});

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
  state.lastTriggerLevel = null;
  state.workletCaptureStartedAt = 0;

  el.micButton.classList.remove("listening");
  el.micButtonText.textContent = "Start mic";
  el.micButton.setAttribute("aria-pressed", "false");
  el.inputLevel.style.transform = "scaleX(0)";
  setStatus("Mic off", "Mic off");
  updateSecureState();
  updateReadouts();
  updateLugUI();
  setFeedback("Microphone stopped", state.currentHz ? "Last reading held. Start the mic to measure again." : "Start the mic when you are ready.");
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
  el.inputLevel.style.transform = `scaleX(${clamp(level.rms * 8, 0, 1)})`;

  if (shouldUseAnalyzerHit(level, now)) {
    state.lastHitAt = now;
    state.lastTriggerLevel = level;
    state.pendingAnalysis = true;
    setStatus("Hit detected", "Analyzing");
    const generation = state.generation;
    // Preserve the attack plus enough decay cycles for the fallback's first window.
    window.setTimeout(() => { if (generation === state.generation) analyzeHit(); }, 260);
  }

  drawAll();
  state.rafId = requestAnimationFrame(loop);
}

function handleWorkletMessage(event) {
  const data = event.data;
  if (!data || !state.running) return;

  if (data.type === "level") {
    state.signalRms = data.rms || 0;
    state.signalPeak = data.peak || 0;
    const signalLabel = data.peak > 0.5 ? "Hot" : data.rms > state.sensitivity / 2 ? "Live" : "Quiet";
    el.signalReadout.textContent = signalLabel;
    return;
  }

  if (data.type === "hit-start") {
    state.captureGeneration = state.generation;
    state.lastHitAt = performance.now();
    state.lastTriggerLevel = {
      rms: data.rms || state.signalRms,
      peak: data.peak || state.signalPeak,
    };
    state.workletCaptureStartedAt = state.lastHitAt;
    setStatus("Hit detected", "Capturing");
    return;
  }

  if (data.type === "hit") {
    if (state.captureGeneration !== state.generation) { state.workletCaptureStartedAt = 0; return; }
    state.lastHitAt = performance.now();
    state.workletCaptureStartedAt = 0;
    state.pendingAnalysis = true;
    setStatus("Hit detected", "Analyzing");
    analyzeCapturedHit(data);
  }
}

function shouldUseAnalyzerHit(level, now) {
  if (state.pendingAnalysis || !isDrumHit(level, now)) {
    state.analyzerCandidateAt = 0;
    return false;
  }
  if (!state.usingWorklet) return true;
  if (state.workletCaptureStartedAt && now - state.workletCaptureStartedAt < 950) return false;
  if (now - state.lastHitAt < 950) return false;
  // Give the worklet's hit-start message time to arrive before using the fallback.
  if (!state.analyzerCandidateAt) state.analyzerCandidateAt = now;
  return now - state.analyzerCandidateAt >= 120;
}

function isDrumHit(level, now) {
  const threshold = state.sensitivity;
  const isPeak = level.peak > Math.max(0.04, threshold * 1.35);
  const hasBody = level.rms > Math.max(0.006, threshold * 0.22) || level.peak > threshold * 2.2;
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
    peak: Math.max(state.signalPeak, state.lastTriggerLevel?.peak || 0),
    rms: Math.max(state.signalRms, state.lastTriggerLevel?.rms || 0),
    noiseFloor: state.sensitivity * 0.25,
    clippedRatio: 0,
  });
}

function analyzeCapturedHit(capture) {
  if (state.mode === "lugs" && !state.lugArmed) {
    state.pendingAnalysis = false;
    state.workletCaptureStartedAt = 0;
    return;
  }
  const result = analyzeDrumHit(capture);

  if (!result.accepted) {
    state.rejectedTakes += 1;
    state.confidence = result.confidence || 0;
    state.qualityLabel = result.reason || "Rejected";
    setStatus("Rejected", state.qualityLabel);
    updateTakeUI();
    state.pendingAnalysis = false;
    state.workletCaptureStartedAt = 0;
    drawAll();
    return;
  }

  acceptHit(result);
  state.pendingAnalysis = false;
  state.workletCaptureStartedAt = 0;
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
  if (confidence < 0.3) {
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
  const threshold = Math.max(state.sensitivity * 0.9, noiseFloor * 6, 0.012);
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
  const windowed = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    windowed[i] = samples[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (samples.length - 1)));
  }

  for (let freq = minFreq; freq <= maxFreq; freq += step) {
    const power = goertzelPower(windowed, sampleRate, freq);
    bins.push({ freq, power });
    if (power > bestPower) {
      bestPower = power;
      bestIndex = bins.length - 1;
    }
  }

  if (bestIndex < 0 || !Number.isFinite(bestPower) || bestPower <= 0) return null;
  // Adjacent bins belong to the same peak, not to competing drum modes.
  const separation = Math.max(step * 6, 2 * sampleRate / samples.length);
  secondPower = bins.reduce((best, bin) =>
    Math.abs(bin.freq - bins[bestIndex].freq) > separation ? Math.max(best, bin.power) : best, 0);

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
    q0 = coeff * q1 - q2 + samples[i];
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
    // A locked reading may disambiguate an octave; preset targets never do.
    const targetFocused = state.mode === "pitch" && el.targetFilter.checked && state.pitchLockHz;
    const chosen = targetFocused && Math.abs(centsBetween(yin.hz, state.pitchLockHz)) < Math.abs(centsBetween(modal.hz, state.pitchLockHz))
      ? yin : modal;
    return {
      hz: chosen.hz,
      confidence: clamp(Math.max(yin.confidence, modal.confidence) * 0.82, 0, 1),
      source: "octave-resolved",
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
  if (state.mode === "lugs" && !state.lugArmed) return;
  if (state.mode === "lugs") {
    state.measuredLug = state.activeLug;
    state.takes = [...state.lugs[state.activeLug].takes];
  } else if (state.mode === "heads") {
    state.takes = [...state.heads[state.headSide].takes];
  }
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

  const reference = referenceHz();
  const pitchReady = state.mode !== "pitch" || hasStableReading(stats);
  pushHistory(result.hz, state.mode === "heads" || !reference || !pitchReady ? null : centsBetween(result.hz, reference),
    result.confidence, state.mode === "pitch" && !pitchReady);
  updateReadouts();
  updateTakeUI();
  updateLugUI();
  updateHeadUI();
  setStatus("Captured", `${stats.hz.toFixed(1)} Hz`);
  showMeasurementFeedback(stats);
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
    return { hz: state.currentHz || state.targetHz, confidence: 0, signalConfidence: 0, spreadCents: 0 };
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
    signalConfidence: averageConfidence,
    spreadCents,
  };
}

function captureActiveLugTake(result) {
  const lug = state.lugs[state.activeLug];
  addTake(lug.takes, result, state.requiredTakes);
  const stats = computeTakeStats(lug.takes);
  lug.hz = stats.hz;
  lug.confidence = stats.confidence;
  lug.complete = lug.takes.length >= state.requiredTakes && stats.spreadCents <= 22 && stats.confidence >= .64;
  if (lug.complete) {
    if (!state.lugReference && !state.savedLugTargetHz) {
      state.lugReference = { index: state.activeLug, hz: lug.hz };
    }
    const sequence = getLugSequence(state.lugs.length, state.lugPattern);
    const at = sequence.indexOf(state.activeLug);
    const remaining = [...sequence.slice(at + 1), ...sequence.slice(0, at)].find(index => !state.lugs[index].complete);
    if (remaining === undefined) state.lugArmed = false;
    else state.activeLug = remaining;
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
  head.complete = head.takes.length >= state.requiredTakes && stats.spreadCents <= 22 && stats.confidence >= .64;
}

function headRatio() {
  return state.heads.batter.complete && state.heads.resonant.complete
    ? state.heads.resonant.hz / state.heads.batter.hz : null;
}

function hasStableReading(stats) {
  return state.takes.length >= state.requiredTakes && stats.spreadCents <= 22 && stats.confidence >= .64;
}

function hasTentativePitch(stats) {
  return state.mode === "pitch" && state.takes.length >= state.requiredTakes
    && stats.spreadCents <= 22 && stats.confidence >= .3 && stats.confidence < .64;
}

function clearPitchLock() {
  state.pitchLockHz = null;
  el.targetFilter.checked = false;
  updateCaptureSettings();
}

function resetTakes() {
  state.takes = [];
  state.pendingAnalysis = false;
  state.analyzerCandidateAt = 0;
  state.rejectedTakes = 0;
  state.confidence = 0;
  state.qualityLabel = "Idle";
  state.currentHz = null;
  state.currentCents = null;
  state.measuredLug = null;
  state.generation += 1;
  updateTakeUI();
  updateReadouts();
  showReadyFeedback();
  drawMeter();
}

function qualityLabelFor(result) {
  if (result.confidence >= 0.82) return "Strong";
  if (result.confidence >= 0.64) return "Good";
  return "Usable";
}

function getSearchRange() {
  if (!el.targetFilter.checked || state.mode !== "pitch" || !state.pitchLockHz) {
    return {
      min: 35,
      max: 450,
    };
  }

  const factor = state.searchFactor;
  return {
    min: clamp(state.pitchLockHz / factor, 35, 450),
    max: clamp(state.pitchLockHz * factor, 35, 450),
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
  }

  // Complete normalization before looking ahead for a local minimum.
  for (let tau = minTau; tau <= maxTau; tau += 1) {
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
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;

    if (Object.hasOwn(presets, saved.preset)) {
      el.presetSelect.value = saved.preset;
      state.targetHz = presets[saved.preset].hz;
    }
    const oldDefault = Object.hasOwn(legacyPresetHz, saved.preset)
      && saved.targetHz === legacyPresetHz[saved.preset];
    if (Number.isFinite(saved.targetHz) && !oldDefault) {
      state.targetHz = clamp(saved.targetHz, 35, 450);
    }
    if (state.targetHz !== presets[el.presetSelect.value]?.hz) el.presetSelect.value = "custom";
    el.targetInput.value = state.targetHz.toFixed(1);
    if (Number.isFinite(saved.searchFactor)) {
      state.searchFactor = clamp(saved.searchFactor, 1.1, 2.5);
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
    }
    if (Number.isFinite(saved.headGoal) && saved.headGoal >= .6 && saved.headGoal <= 2) {
      state.headGoal = saved.headGoal;
    }
    state.headGoalCustom = saved.headGoalCustom === true;
  } catch {
    // Invalid or unavailable storage must not prevent tuning.
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
    headGoal: state.headGoal,
    headGoalCustom: state.headGoalCustom,
  };
  try {
    localStorage.setItem("drumTunerSettings", JSON.stringify(settings));
  } catch {
    // Settings persistence is optional; tuning must still work without storage.
  }
}

function updateSecureState() {
  el.secureState.textContent = state.running ? "Microphone on" : window.isSecureContext ? "Microphone off" : "HTTPS required";
}

function updateTargetUI() {
  const preset = presets[el.presetSelect.value] || presets.custom;
  el.presetName.textContent = el.presetSelect.value === "custom" ? "Custom" : preset.name;
  document.querySelector("#presetDisplay").textContent = el.presetSelect.value === "custom"
    ? `Custom target - ${state.targetHz.toFixed(1)} Hz` : `${preset.name} - ${state.targetHz.toFixed(1)} Hz`;
  document.querySelector("#presetGuide").textContent = preset.guide
    ? `Tune-Bot center-pitch examples: ${preset.guide[0]}-${preset.guide[1]} Hz`
    : el.presetSelect.value === "custom" ? "Your selected whole-drum target" : "Starter target; no published center-pitch range";
  document.querySelector("#targetGuide").hidden = !preset.guide;
  el.targetReadout.textContent = `${state.targetHz.toFixed(1)} Hz`;
  document.querySelector("#targetSettings").open = el.presetSelect.value === "custom";
  updateReadouts();
  drawMeter();
}

function updateReadouts() {
  const ref = referenceHz();
  document.querySelector("#referenceLabel").textContent = state.mode === "lugs" ? "Lug reference" : state.mode === "heads" ? "Resonant / batter" : "Target";
  el.targetReadout.textContent = state.mode === "heads"
    ? headRatio() ? headRatio().toFixed(2) + "x" : "--"
    : ref ? ref.toFixed(1) + " Hz" : "--";
  el.modeLabel.textContent = state.mode === "lugs" ? `Lug ${(state.measuredLug ?? state.activeLug) + 1}`
    : state.mode === "heads" ? state.headSide === "batter" ? "Batter head" : "Resonant head" : "Whole-drum pitch";
  el.readingState.textContent = state.currentHz
    ? state.running ? "Last captured reading" : "Mic off · reading held"
    : state.running ? "Listening for a tap" : "Ready to listen";
  el.readingState.hidden = !state.currentHz;
  if (!state.currentHz) {
    el.frequencyReadout.textContent = "--";
    el.noteReadout.textContent = state.running ? "Listening" : "Mic off";
    el.centsReadout.textContent = "--";
    el.confidenceReadout.textContent = "--";
    document.querySelector("#consistencyReadout").textContent = "No taps yet";
    state.currentCents = null;
    updatePitchIndicator(false);
    updateCaptureSettings();
    return;
  }
  const note = frequencyToNote(state.currentHz);
  const stats = computeTakeStats(state.takes);
  const pitchReady = state.mode !== "pitch" || hasStableReading(stats);
  const tentative = hasTentativePitch(stats);
  if (state.running) {
    el.readingState.textContent = state.takes.length < state.requiredTakes
      ? `${state.takes.length} of ${state.requiredTakes} hits captured`
      : stats.spreadCents > 22 ? "Taps vary · try again"
      : tentative ? state.takes.length < 2 ? "Single hit · pitch uncertain" : "Taps steady · pitch uncertain"
      : stats.confidence < .64 ? "Pitch uncertain"
      : state.mode === "lugs" && state.lugArmed && state.measuredLug !== state.activeLug
        ? `Next: lug ${state.activeLug + 1}` : "Last captured reading";
  }
  const cents = ref && state.mode !== "heads" ? centsBetween(state.currentHz, ref) : null;
  state.currentCents = cents;
  el.frequencyReadout.textContent = pitchReady ? state.currentHz.toFixed(1)
    : tentative ? `≈${state.currentHz.toFixed(1)}` : "--";
  const offset = cents === null ? null : `${cents >= 0 ? "+" : ""}${Math.round(cents)} c`;
  el.noteReadout.textContent = state.mode === "lugs"
    ? offset ? `${offset} vs reference` : "Capture a reference lug"
    : state.mode === "heads" ? `${note.name}${note.octave}`
    : pitchReady ? `${note.name}${note.octave} · ${state.requiredTakes === 1 ? "single hit" : `${state.requiredTakes}-tap average`}`
      : tentative ? "Tentative · verify pitch" : "Another tap needed";
  el.centsReadout.textContent = cents === null || !pitchReady ? "--" : `${cents >= 0 ? "+" : ""}${Math.round(cents)} c`;
  el.confidenceReadout.textContent = stats.signalConfidence >= .82 ? "Strong" : stats.signalConfidence >= .64 ? "Good" : "Low";
  document.querySelector("#consistencyReadout").textContent = state.takes.length < 2
    ? state.requiredTakes === 1 ? "Single hit" : "Need more taps"
    : stats.spreadCents <= 22 ? "Steady taps" : "Taps vary";
  updatePitchIndicator(pitchReady && cents !== null, tentative);
  updateCaptureSettings();
}

function updatePitchIndicator(ready, tentative = false) {
  if (state.mode !== "pitch" || !ready) {
    el.pitchDeviation.textContent = tentative ? "Tentative · no tuning direction"
      : state.mode === "pitch" && state.currentHz ? "Reading withheld" : "Waiting for a steady reading";
    el.pitchDeviation.dataset.tone = "neutral";
    el.pitchNeedle.hidden = true;
    return;
  }
  const cents = state.currentCents;
  const distance = Math.round(Math.abs(cents));
  el.pitchDeviation.textContent = distance <= 6 ? `On target · ${distance} c` :
    `${cents < 0 ? "Below" : "Above"} target · ${distance} c`;
  el.pitchDeviation.dataset.tone = distance <= 6 ? "good" : "warning";
  el.pitchNeedle.hidden = false;
  el.pitchNeedle.style.left = `${50 + clamp(cents, -50, 50)}%`;
}

function updateTakeUI() {
  el.takeReadout.textContent = `${Math.min(state.takes.length, state.requiredTakes)} / ${state.requiredTakes}`;
  document.querySelector("#takeDots").innerHTML = Array.from({ length: state.requiredTakes }, (_, i) =>
    `<i class="${i < state.takes.length ? "filled" : ""}"></i>`).join("");
}

function updateLugPatternUI() {
  el.lugPatternButtons.forEach((button) => {
    const active = button.dataset.lugPattern === state.lugPattern;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateLugUI() {
  const count = state.lugs.filter(lug => lug.complete).length;
  const sequence = getLugSequence(state.lugs.length, state.lugPattern);
  updateLugOrderGuide(sequence);
  el.lugAverage.textContent = `${count} of ${state.lugs.length} captured`;
  el.captureLugButton.textContent = state.lugArmed ? "Pause capture"
    : `${state.lugs[state.activeLug].complete ? "Recapture" : "Capture"} lug ${state.activeLug + 1}`;
  el.captureLugButton.setAttribute("aria-pressed", String(state.lugArmed));
  const reference = referenceHz("lugs");
  el.setLugReferenceButton.disabled = !state.lugs[state.activeLug].complete;
  el.lugReferenceNote.textContent = state.lugReference
    ? `Locked to lug ${state.lugReference.index + 1} · ${state.lugReference.hz.toFixed(1)} Hz`
    : state.savedLugTargetHz ? `Saved lug target · ${state.savedLugTargetHz.toFixed(1)} Hz`
      : "First stable lug becomes the reference.";
  if (el.lugButtons.children.length !== state.lugs.length) {
    el.lugButtons.replaceChildren(...state.lugs.map((_, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lug-point";
      button.dataset.lug = i;
      const angle = -Math.PI / 2 + Math.PI * 2 * i / state.lugs.length;
      button.style.left = `${50 + Math.cos(angle) * 39}%`;
      button.style.top = `${50 + Math.sin(angle) * 39}%`;
      return button;
    }));
  }
  el.lugButtons.dataset.pattern = state.lugPattern;
  [...el.lugButtons.children].forEach((button, i) => {
    const lug = state.lugs[i];
    const step = sequence.indexOf(i) + 1;
    const cents = lug.complete && reference ? centsBetween(lug.hz, reference) : null;
    const offset = cents === null ? null : Math.abs(cents) > 6 && Math.abs(cents) < 7 ? cents.toFixed(1) : Math.round(cents);
    button.setAttribute("aria-pressed", String(i === state.activeLug));
    button.setAttribute("aria-label", `Lug ${i + 1}, ${lug.hz ? lug.hz.toFixed(1) + " Hz" : "not measured"}${lug.complete ? ", captured" : ""}${cents === null ? "" : ", " + offset + " cents from fixed reference"}, capture step ${step} of ${sequence.length}`);
    button.dataset.captureStep = step;
    button.dataset.tone = cents === null ? "neutral" : Math.abs(cents) <= 6 ? "good" : "adjust";
    button.innerHTML = `<span>${i + 1}</span>${cents === null ? "" : "<small>" + (cents >= 0 ? "+" : "") + offset + "c</small>"}`;
  });
  drawMeter();
}

function updateLugOrderGuide(sequence) {
  if (state.mode !== "lugs") return;
  const label = state.lugPattern === "star" ? "Star order" : "Clockwise order";
  el.measurementGuide.classList.add("order-guide");
  el.measurementGuide.setAttribute("aria-label", `${label}: ${sequence.map(index => index + 1).join(", ")}. Selected lug ${state.activeLug + 1}.`);
  const title = document.createElement("span");
  title.className = "order-label";
  title.textContent = state.lugPattern === "star" ? "Star" : "Clockwise";
  const steps = document.createElement("span");
  steps.className = "order-steps";
  sequence.forEach((index, position) => {
    if (position) {
      const arrow = document.createElement("span");
      arrow.className = "order-arrow";
      arrow.textContent = "›";
      arrow.setAttribute("aria-hidden", "true");
      steps.append(arrow);
    }
    const step = document.createElement("span");
    step.className = "order-step";
    step.textContent = String(index + 1);
    if (index === state.activeLug) step.classList.add("current");
    steps.append(step);
  });
  el.measurementGuide.replaceChildren(title, steps);
}

function updateHeadUI() {
  for (const side of ["batter", "resonant"]) {
    const head = state.heads[side];
    document.querySelector("#" + side + "Progress").textContent = head.complete ? "Captured" : `${head.takes.length}/${state.requiredTakes}`;
    document.querySelector("#" + (side === "batter" ? "batterValue" : "resonantValue")).innerHTML = `${head.hz ? head.hz.toFixed(1) : "--"} <small>Hz</small>`;
  }
  el.headButtons.forEach(button => {
    const active = button.dataset.head === state.headSide;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateReadouts();
  updateGoalUI();
}

function updateGoalUI() {
  const preset = [1, 1.2, 1.5].find(value => Math.abs(value - state.headGoal) < .001);
  el.soundGoalSelect.value = !state.headGoalCustom && preset ? String(preset) : "custom";
  el.customGoalField.hidden = el.soundGoalSelect.value !== "custom";
  el.headRatioInput.value = state.headGoal.toFixed(2);
  const actual = headRatio();
  const saved = state.savedHeadTargets.batter || state.savedHeadTargets.resonant
    ? ` Saved: batter ${state.savedHeadTargets.batter?.toFixed(1) || "--"} Hz, resonant ${state.savedHeadTargets.resonant?.toFixed(1) || "--"} Hz.` : "";
  el.goalReadout.textContent = (actual
    ? `Measured ${actual.toFixed(2)}x · goal ${state.headGoal.toFixed(2)}x (${actual > state.headGoal + .02 ? "above" : actual < state.headGoal - .02 ? "below" : "close"}). Adjust by ear.`
    : `Starting point: ${state.headGoal.toFixed(2)}x. Adjust by ear.`) + saved;
}

function setMode(mode) {
  const changed = state.mode !== mode;
  if (!changed && state.lugArmed) return;
  state.mode = mode;
  if (changed) clearPitchLock();
  state.lugArmed = false;
  document.querySelector(".app-shell").dataset.mode = mode;
  document.querySelector("#tuningView").setAttribute("aria-labelledby", "tab-" + mode);
  document.querySelector("#lugControls").hidden = mode !== "lugs";
  document.querySelector("#headControls").hidden = mode !== "heads";
  document.querySelector("#lugSetup").hidden = mode !== "lugs";
  document.querySelector("#headSetup").hidden = mode !== "heads";
  document.querySelector("#headGoal").hidden = mode !== "heads";
  if (mode !== "lugs") {
    el.measurementGuide.classList.remove("order-guide");
    el.measurementGuide.removeAttribute("aria-label");
    el.measurementGuide.textContent = mode === "heads" ? "Mute the opposite head · tap the selected head's center"
      : "Both heads free · tap near the center";
  }
  document.querySelector("#targetSettings").hidden = mode !== "pitch";
  el.lugButtons.hidden = mode !== "lugs";
  el.segments.forEach(segment => {
    const active = segment.dataset.mode === mode;
    segment.classList.toggle("active", active);
    segment.setAttribute("aria-selected", String(active));
    segment.tabIndex = active ? 0 : -1;
  });
  if (changed) resetTakes();
  if (mode === "heads") restoreHeadReading();
  updateCaptureSettings();
  updateReadouts();
  updateLugUI();
  showReadyFeedback();
  drawMeter();
}

function setStatus(signal, analysis) {
  el.signalReadout.textContent = signal;
  el.analysisStatus.textContent = analysis;
  if (signal === "Rejected") {
    const hints = {
      "Clipped hit": "Tap more gently or move the phone farther away.",
      "Weak hit": "Move the phone closer and use a consistent tap.",
      "Short hit": "Let the head ring after the tap.",
      "No stable pitch": "Mute nearby drums and try a lighter, isolated tap.",
      "Low confidence": "Try another tap in a quieter room.",
    };
    setFeedback("Tap not used", hints[analysis] || "Try a lighter, isolated tap and let it ring.", "warning");
    el.readingState.textContent = state.currentHz ? "Previous reading · tap not used" : "No accepted reading";
  } else if (signal === "Hit detected" && (state.mode !== "lugs" || state.lugArmed)) {
    setFeedback("Measuring the decay", state.mode === "lugs" ? `Lug ${state.activeLug + 1} · let the head ring.` : "Let the head ring before the next tap.");
  }
}

function setFeedback(title, detail, tone = "neutral") {
  el.feedbackTitle.textContent = title;
  el.feedbackDetail.textContent = detail;
  el.feedback.dataset.tone = tone;
  if (!state.running && !state.currentHz) {
    el.readingState.textContent = tone === "error" ? "Microphone unavailable"
      : state.opening ? "Waiting for permission" : "Ready to listen";
  }
}

function showReadyFeedback() {
  if (state.mode === "lugs") {
    setFeedback(state.lugArmed ? `Tap beside lug ${state.activeLug + 1}` : "Match the lugs",
      state.lugArmed ? `${state.requiredTakes} consistent taps. Lightly mute the center.` : "Select a lug, then capture taps beside that tension rod.");
  } else if (state.mode === "heads") {
    setFeedback(state.running ? `Tap the ${state.headSide} head` : "Compare both heads",
      state.running ? "Mute the opposite head and let each tap decay." : "Start the mic, then measure each head separately.");
  } else {
    setFeedback(state.running ? "Listening for your drum" : "Ready when you are",
      state.running ? "Tap the center and let it ring." : "Start the mic, then tap the center of the head.");
  }
}

function showMeasurementFeedback(stats) {
  if (state.mode === "lugs") {
    const complete = state.lugs.every(lug => lug.complete);
    const current = state.lugs[state.measuredLug];
    if (complete) {
      const reference = referenceHz("lugs");
      const spread = Math.max(...state.lugs.map(lug => Math.abs(centsBetween(lug.hz, reference))));
      setFeedback(spread <= 6 ? "Lugs are matched" : "Round captured",
        spread <= 6 ? "All lugs are within 6 cents of the fixed reference." : "Select a lug to inspect and recapture after adjusting.", spread <= 6 ? "good" : "warning");
    } else if (current.complete) {
      setFeedback(`Lug ${state.measuredLug + 1} captured`, `Next: lug ${state.activeLug + 1}. Tap beside that tension rod.`, "good");
    } else {
      setFeedback(`Lug ${state.measuredLug + 1} · ${current.takes.length} of ${state.requiredTakes} taps`,
        stats.spreadCents > 22 ? "Taps vary. Keep the tap position and strength consistent."
          : stats.confidence < .64 ? "Signal is uncertain. Try a quieter room and consistent taps." : "Keep tapping at the same position.");
    }
    return;
  }
  if (hasTentativePitch(stats)) {
    setFeedback("Tentative pitch", state.takes.length < 2
      ? "Pitch signal is unclear. Capture more taps before tuning."
      : "Taps agree, but the pitch signal is unclear. Adjust phone position and tap again before tuning.", "warning");
    return;
  }
  if (state.takes.length < state.requiredTakes || stats.spreadCents > 22 || stats.confidence < .64) {
    setFeedback("Building a reading", stats.spreadCents > 22 ? "Taps vary. Keep the tap position and strength consistent."
      : stats.confidence < .64 ? "Pitch signal is unclear. Adjust phone position or reduce nearby noise."
        : "Keep tapping at the same position for a steadier reading.");
    return;
  }
  if (state.mode === "heads") {
    setFeedback(`${state.headSide === "batter" ? "Batter" : "Resonant"} captured`,
      headRatio() ? "Both head readings are ready to compare." : "Select the other head to complete the comparison.", "good");
    return;
  }
  const cents = state.currentCents;
  setFeedback(Math.abs(cents) <= 6 ? "On target" : cents < 0 ? "Below target" : "Above target",
    Math.abs(cents) <= 6 ? "Within 6 cents of your selected pitch."
      : cents < 0 ? "Increase tension evenly, then tap again." : "Reduce tension evenly, then tap again.",
    Math.abs(cents) <= 6 ? "good" : "warning");
}

function referenceHz(mode = state.mode) {
  if (mode !== "lugs") return state.targetHz;
  return state.lugReference?.hz || state.savedLugTargetHz;
}

function restoreHeadReading() {
  const head = state.heads[state.headSide];
  state.takes = [...head.takes];
  state.currentHz = head.hz;
  state.confidence = head.confidence;
  updateReadouts();
  updateTakeUI();
}

function clearMeasurements() {
  clearPitchLock();
  state.lugs = createLugs(state.lugs.length);
  state.lugReference = null;
  state.heads = { batter: createHeadState(), resonant: createHeadState() };
  state.activeLug = getLugSequence(state.lugs.length, state.lugPattern)[0];
  state.lugArmed = false;
  resetTakes();
  updateLugUI();
  updateHeadUI();
}

function clearSavedTargets() {
  state.savedLugTargetHz = null;
  state.savedHeadTargets = { batter: null, resonant: null };
  updateGoalUI();
}

function validFrequency(value) {
  return Number.isFinite(value) && value >= 35 && value <= 450 ? value : null;
}

function normalizeSavedDrum(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      typeof raw.name !== "string" || !raw.name.trim() || !validFrequency(raw.targetHz)) return null;
  return {
    name: raw.name.trim().slice(0, 40),
    preset: Object.hasOwn(presets, raw.preset) ? raw.preset : "custom",
    targetHz: raw.targetHz,
    lugCount: [6, 8, 10].includes(raw.lugCount) ? raw.lugCount : 8,
    lugHz: validFrequency(raw.lugHz),
    batterHz: validFrequency(raw.batterHz),
    resonantHz: validFrequency(raw.resonantHz),
    headGoal: Number.isFinite(raw.headGoal) && raw.headGoal >= .6 && raw.headGoal <= 2 ? raw.headGoal : 1.2,
  };
}

function loadKits() {
  try {
    const saved = JSON.parse(localStorage.getItem("drumTunerKits") || "null");
    if (!Array.isArray(saved)) return;
    state.kits = saved.slice(0, 12).filter(kit => kit && typeof kit.name === "string" && kit.name.trim() && Array.isArray(kit.drums))
      .map(kit => ({ name: kit.name.trim().slice(0, 40), drums: kit.drums.slice(0, 24).map(normalizeSavedDrum).filter(Boolean) }));
  } catch {
    // Optional local storage cannot block the tuner.
  }
}

function persistKits() {
  try {
    localStorage.setItem("drumTunerKits", JSON.stringify(state.kits));
    return true;
  } catch {
    el.kitStatus.textContent = "Could not save on this device. Check browser storage settings.";
    return false;
  }
}

function saveCurrentDrum() {
  const kitName = el.kitNameInput.value.trim().slice(0, 40) || "My kit";
  const drumName = el.drumNameInput.value.trim().slice(0, 40) || (presets[el.presetSelect.value]?.name || "Drum");
  const before = JSON.stringify(state.kits);
  let kit = state.kits.find(item => item.name.toLowerCase() === kitName.toLowerCase());
  if (!kit) {
    if (state.kits.length >= 12) {
      el.kitStatus.textContent = "Limit: 12 kits on this device.";
      return;
    }
    kit = { name: kitName, drums: [] };
    state.kits.push(kit);
  }
  const drum = {
    name: drumName,
    preset: el.presetSelect.value,
    targetHz: state.targetHz,
    lugCount: state.lugs.length,
    lugHz: state.lugReference?.hz || state.savedLugTargetHz,
    batterHz: state.heads.batter.complete ? state.heads.batter.hz : state.savedHeadTargets.batter,
    resonantHz: state.heads.resonant.complete ? state.heads.resonant.hz : state.savedHeadTargets.resonant,
    headGoal: state.headGoal,
  };
  const existing = kit.drums.findIndex(item => item.name.toLowerCase() === drumName.toLowerCase());
  if (existing < 0 && kit.drums.length >= 24) {
    el.kitStatus.textContent = "Limit: 24 drums per kit on this device.";
    return;
  }
  if (existing >= 0) kit.drums[existing] = drum;
  else kit.drums.push(drum);
  el.kitNameInput.value = kit.name;
  el.drumNameInput.value = drumName;
  if (!persistKits()) state.kits = JSON.parse(before);
  else el.kitStatus.textContent = `Saved ${drumName} in ${kit.name}.`;
  renderKits();
}

function loadSavedDrum(kitIndex, drumIndex) {
  const kit = state.kits[kitIndex];
  const drum = kit?.drums[drumIndex];
  if (!drum) return;
  state.targetHz = drum.targetHz;
  el.presetSelect.value = presets[drum.preset]?.hz === drum.targetHz ? drum.preset : "custom";
  el.targetInput.value = String(drum.targetHz);
  state.lugs = createLugs(drum.lugCount);
  el.lugCountSelect.value = String(drum.lugCount);
  state.headGoal = drum.headGoal;
  state.headGoalCustom = ![1, 1.2, 1.5].some(value => Math.abs(value - drum.headGoal) < .001);
  clearMeasurements();
  state.savedLugTargetHz = drum.lugHz;
  state.savedHeadTargets = { batter: drum.batterHz, resonant: drum.resonantHz };
  el.kitNameInput.value = kit.name;
  el.drumNameInput.value = drum.name;
  updateTargetUI();
  updateLugUI();
  updateHeadUI();
  persistSettings();
  el.kitStatus.textContent = `Loaded ${drum.name}. Saved references are targets, not live readings.`;
  document.querySelector("#kitsDetails").open = false;
  setFeedback(`${drum.name} loaded`, "Start a new capture to compare against its saved targets.");
}

function removeSavedDrum(kitIndex, drumIndex) {
  const kit = state.kits[kitIndex];
  if (!kit?.drums[drumIndex] || !window.confirm(`Remove ${kit.drums[drumIndex].name} from ${kit.name}?`)) return;
  const before = JSON.stringify(state.kits);
  kit.drums.splice(drumIndex, 1);
  if (!kit.drums.length) state.kits.splice(kitIndex, 1);
  if (!persistKits()) {
    state.kits = JSON.parse(before);
    return;
  }
  renderKits();
  el.kitStatus.textContent = "Saved drum removed.";
}

function renderKits() {
  const count = state.kits.reduce((sum, kit) => sum + kit.drums.length, 0);
  el.kitCount.textContent = `${count} saved`;
  el.kitDrumList.replaceChildren();
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "setting-note";
    empty.textContent = "No drums saved yet.";
    el.kitDrumList.append(empty);
    return;
  }
  state.kits.forEach((kit, kitIndex) => {
    const heading = document.createElement("h3");
    heading.textContent = kit.name;
    el.kitDrumList.append(heading);
    kit.drums.forEach((drum, drumIndex) => {
      const row = document.createElement("div");
      row.className = "kit-row";
      const summary = document.createElement("span");
      summary.textContent = `${drum.name} · ${drum.targetHz.toFixed(1)} Hz`;
      const load = document.createElement("button");
      load.type = "button";
      load.className = "text-action";
      load.textContent = "Load";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-action";
      remove.textContent = "Remove";
      for (const [button, action] of [[load, "load"], [remove, "remove"]]) {
        button.dataset.kitAction = action;
        button.dataset.kit = kitIndex;
        button.dataset.drum = drumIndex;
      }
      row.append(summary, load, remove);
      el.kitDrumList.append(row);
    });
  });
}

function updateCaptureSettings() {
  el.rangeInput.disabled = !el.targetFilter.checked || state.mode !== "pitch";
  el.targetFilter.disabled = state.mode !== "pitch" || (!state.pitchLockHz && (state.requiredTakes < 3 || !hasStableReading(computeTakeStats(state.takes))));
  el.filterReference.textContent = state.pitchLockHz
    ? `Locked to ${state.pitchLockHz.toFixed(1)} Hz. Turn off before changing drums.`
    : state.requiredTakes < 3 ? "Set hits to average to 3 or more before locking a measured pitch."
      : "Capture a stable pitch reading first. This does not use the preset target.";
  document.querySelector("#rangeValue").textContent = state.searchFactor.toFixed(1) + "x";
  document.querySelector("#sensitivityValue").textContent = state.sensitivity.toFixed(3);
}

function pushHistory(hz, cents, confidence = 0, tentative = false) {
  state.history.unshift({
    label: state.mode === "lugs" ? `Lug ${state.measuredLug + 1}` : state.mode === "heads" ? state.headSide : "Pitch",
    hz,
    cents,
    confidence,
    tentative,
    time: new Date(),
  });
  state.history = state.history.slice(0, 9);
  renderHistory();
}

function renderHistory() {
  el.historyList.replaceChildren();
  state.history.forEach((item) => {
    const chip = document.createElement("span");
    const abs = item.cents === null ? null : Math.abs(item.cents);
    chip.className = `history-chip ${abs === null ? "" : abs <= 6 ? "good" : abs <= 22 ? "warn" : "bad"}`;
    const offset = item.cents === null ? "" : ` · ${item.cents >= 0 ? "+" : ""}${Math.round(item.cents)}c`;
    chip.textContent = `${item.label} · ${item.tentative ? "≈" : ""}${item.hz.toFixed(1)} Hz${offset}`;
    el.historyList.append(chip);
  });
}

function drawAll() {
  drawMeter();
  drawWaveform();
  drawSpectrum();
}

function drawMeter() {
  const ctx = meterCtx;
  const width = el.meterCanvas.width;
  const center = width / 2;
  const radius = width * 0.39;
  ctx.clearRect(0, 0, width, width);
  if (state.mode === "pitch") return;

  const shell = ctx.createRadialGradient(center, center, 40, center, center, radius);
  shell.addColorStop(0, "#1e2225");
  shell.addColorStop(1, "#131517");
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#454b50";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center, center, radius + 12, 0, Math.PI * 2);
  ctx.strokeStyle = "#292e32";
  ctx.stroke();

  if (state.mode === "lugs") {
    return;
  }
  if (state.mode === "heads") {
    ctx.strokeStyle = state.heads[state.headSide].complete ? colors.success : state.heads[state.headSide].hz ? colors.accent : "#454c51";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center, center, radius - 16, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawWaveform() {
  const canvas = el.waveCanvas;
  const ctx = waveCtx;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.bgBase;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  if (!state.timeData) {
    drawCanvasLabel(ctx, width, height, "Waveform");
    return;
  }

  ctx.strokeStyle = colors.accent;
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
  ctx.fillStyle = colors.bgBase;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  if (!state.freqData || !state.audioContext) {
    drawCanvasLabel(ctx, width, height, "Spectrum");
    return;
  }

  const sampleRate = state.audioContext.sampleRate;
  const fftSize = state.freqData.length * 2;
  const maxHz = 500;
  ctx.fillStyle = colors.accent;
  for (let x = 0; x < width; x += 2) {
    const hz = (x / width) * maxHz;
    const bin = Math.round((hz * fftSize) / sampleRate);
    const value = state.freqData[bin] || 0;
    const barHeight = (value / 255) * height * 0.9;
    ctx.fillRect(x, height - barHeight, 2, barHeight);
  }

  const targetX = (state.targetHz / maxHz) * width;
  ctx.strokeStyle = colors.success;
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
  ctx.fillStyle = colors.secondary;
  ctx.font = "700 20px Geist, system-ui, sans-serif";
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}
