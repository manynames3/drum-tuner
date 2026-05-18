class DrumInputProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = options.processorOptions || {};
    this.sensitivity = settings.sensitivity || 0.025;
    this.preRollLength = Math.max(2048, Math.round(sampleRate * 0.09));
    this.captureLength = Math.max(16384, Math.round(sampleRate * 0.56));
    this.cooldownSamples = Math.round(sampleRate * 0.36);
    this.levelInterval = Math.round(sampleRate * 0.035);

    this.preRoll = new Float32Array(this.preRollLength);
    this.preRollIndex = 0;
    this.capture = null;
    this.captureIndex = 0;
    this.cooldown = 0;
    this.samplesSinceLevel = 0;
    this.noiseFloor = 0.004;
    this.blockRms = 0;
    this.blockPeak = 0;
    this.capturePeak = 0;
    this.captureRmsSum = 0;
    this.clippedSamples = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === "settings") {
        this.sensitivity = event.data.sensitivity || this.sensitivity;
      }
    };
  }

  process(inputs, outputs) {
    const channel = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    if (!channel) return true;

    let sum = 0;
    let peak = 0;

    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i] || 0;
      const abs = Math.abs(sample);
      sum += sample * sample;
      if (abs > peak) peak = abs;

      this.preRoll[this.preRollIndex] = sample;
      this.preRollIndex = (this.preRollIndex + 1) % this.preRoll.length;

      if (this.capture) {
        this.capture[this.captureIndex] = sample;
        this.captureIndex += 1;
        this.captureRmsSum += sample * sample;
        if (abs > this.capturePeak) this.capturePeak = abs;
        if (abs > 0.985) this.clippedSamples += 1;

        if (this.captureIndex >= this.capture.length) {
          this.finishCapture();
        }
      }
    }

    const rms = Math.sqrt(sum / channel.length);
    this.blockRms = rms;
    this.blockPeak = peak;

    if (!this.capture && this.cooldown <= 0) {
      this.updateNoiseFloor(rms);
      if (this.shouldCapture(rms, peak)) {
        this.startCapture();
      }
    } else if (!this.capture) {
      this.cooldown -= channel.length;
      this.updateNoiseFloor(rms);
    }

    this.samplesSinceLevel += channel.length;
    if (this.samplesSinceLevel >= this.levelInterval) {
      this.samplesSinceLevel = 0;
      this.port.postMessage({
        type: "level",
        rms,
        peak,
        noiseFloor: this.noiseFloor,
      });
    }

    return true;
  }

  updateNoiseFloor(rms) {
    const capped = Math.min(rms, this.sensitivity * 0.6);
    this.noiseFloor = this.noiseFloor * 0.985 + capped * 0.015;
  }

  shouldCapture(rms, peak) {
    const adaptiveRms = Math.max(this.sensitivity * 0.45, this.noiseFloor * 4.2, 0.006);
    const adaptivePeak = Math.max(this.sensitivity * 1.35, this.noiseFloor * 8, 0.035);
    return peak > adaptivePeak && (rms > adaptiveRms || peak > adaptivePeak * 1.65);
  }

  startCapture() {
    this.port.postMessage({
      type: "hit-start",
      peak: this.blockPeak,
      rms: this.blockRms,
      noiseFloor: this.noiseFloor,
    });

    this.capture = new Float32Array(this.captureLength);
    for (let i = 0; i < this.preRoll.length; i += 1) {
      this.capture[i] = this.preRoll[(this.preRollIndex + i) % this.preRoll.length];
    }
    this.captureIndex = this.preRoll.length;
    this.capturePeak = this.blockPeak;
    this.captureRmsSum = 0;
    this.clippedSamples = 0;
  }

  finishCapture() {
    const samples = this.capture;
    const rms = Math.sqrt(this.captureRmsSum / Math.max(1, samples.length - this.preRoll.length));
    const payload = {
      type: "hit",
      samples,
      sampleRate,
      preRollLength: this.preRoll.length,
      noiseFloor: this.noiseFloor,
      peak: this.capturePeak,
      rms,
      clippedRatio: this.clippedSamples / samples.length,
      capturedAt: currentTime,
    };

    this.capture = null;
    this.captureIndex = 0;
    this.capturePeak = 0;
    this.captureRmsSum = 0;
    this.clippedSamples = 0;
    this.cooldown = this.cooldownSamples;
    this.port.postMessage(payload, [samples.buffer]);
  }
}

registerProcessor("drum-input-processor", DrumInputProcessor);
