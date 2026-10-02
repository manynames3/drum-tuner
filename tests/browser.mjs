import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Playwright is test tooling only; no browser automation ships with the app.
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set PLAYWRIGHT_MODULE to the absolute path of playwright/index.mjs");
const { chromium, webkit } = await import(pathToFileURL(modulePath).href);
const engine = process.env.BROWSER || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] },
);
const base = process.env.TUNER_URL || "http://127.0.0.1:5173";
const output = process.env.SCREENSHOT_DIR || "/tmp/drum-tuner-review";
await mkdir(output, { recursive: true });
const failures = [];

async function createPage(width = 390, height = 844, saved = null) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(12000);
  if (process.env.FALLBACK === "1") await page.route("**/drum-audio-worklet.js", route => route.abort());
  page.on("pageerror", error => failures.push(error.message));
  await page.addInitScript(settings => {
    window.micMode = "allow";
    const getUserMedia = async () => {
      if (window.micMode === "deny") throw new DOMException("Denied", "NotAllowedError");
      if (window.micMode === "pending") await new Promise(resolve => { window.resolveMic = resolve; });
      const audio = settings.inputRate ? new AudioContext({ sampleRate: settings.inputRate }) : new AudioContext();
      await audio.resume();
      const dest = audio.createMediaStreamDestination();
      const rate = audio.sampleRate;
      for (const track of dest.stream.getAudioTracks()) {
        const nativeSettings = track.getSettings.bind(track);
        Object.defineProperty(track, "getSettings", { value: () => {
          const { sampleRate, ...rest } = nativeSettings();
          return settings.omitRate ? rest : { ...rest, sampleRate: rate };
        } });
      }
      window.testStream = dest.stream;
      window.testHit = (hz, amplitude = .45) => {
        const buffer = audio.createBuffer(1, Math.round(rate * .75), rate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          const t = i / rate;
          samples[i] = amplitude * Math.exp(-t * 9) *
            (Math.sin(2 * Math.PI * hz * t) + .08 * Math.sin(4 * Math.PI * hz * t));
        }
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        source.start();
      };
      return dest.stream;
    };
    // WebKit exposes a fresh native mediaDevices wrapper to module scripts.
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia } });
  }, { inputRate: Number(process.env.INPUT_RATE) || null, omitRate: process.env.OMIT_INPUT_RATE === "1" });
  if (saved) await page.addInitScript(value => localStorage.setItem("drumTunerSettings", JSON.stringify(value)), saved);
  await page.goto(base);
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + "/" + engine + "-" + name + ".png" });
}

async function tap(page, hz, amplitude = .45) {
  await page.evaluate(({ hz, amplitude }) => window.testHit(hz, amplitude), { hz, amplitude });
  await page.waitForTimeout(1200);
}

try {
  for (const [width, height] of [[320,568], [375,667], [390,844], [430,932], [1280,900]]) {
    const page = await createPage(width, height);
    for (const mode of ["Pitch", "Lugs", "Heads"]) {
      await page.getByRole("tab", { name: mode, exact: true }).click();
      if (mode === "Lugs") await page.locator("#lugCountSelect").selectOption("10");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width} ${mode}`);
      if (width < 760 && mode === "Lugs") {
        const box = await page.locator("#captureLugButton").boundingBox();
        assert.ok(box.y >= 0 && box.y + box.height <= height, "capture action must stay reachable");
        const bottomLug = await page.locator('[data-lug="5"]').boundingBox();
        const dock = await page.locator(".button-row").boundingBox();
        assert.ok(bottomLug.y + bottomLug.height <= dock.y, `bottom lug hidden by dock at ${width}x${height}`);
      }
      await shot(page, `${width}-${mode.toLowerCase()}`);
    }
    await page.close();
  }

  for (const [saved, expectedHz, expectedPreset] of [
    [{ preset: "snare14" }, "196.0", "snare14"],
    [{ preset: "snare14", targetHz: 180 }, "180.0", "custom"],
    [{ preset: "__proto__" }, "123.5", "rack12"],
  ]) {
    const restored = await createPage(390, 844, saved);
    assert.equal(await restored.locator("#targetInput").inputValue(), expectedHz);
    assert.equal(await restored.locator("#presetSelect").inputValue(), expectedPreset);
    await restored.close();
  }

  // Stress text sizing independently of microphone behavior. These are layout
  // fixtures, not claims about real-device Dynamic Type or VoiceOver behavior.
  for (const [width, height] of [[320, 568], [393, 852]]) {
    for (const scale of [1.5, 2]) {
      const enlarged = await createPage(width, height);
      await enlarged.locator("#tab-lugs").click();
      await enlarged.locator("#lugCountSelect").selectOption("10");
      await enlarged.evaluate(factor => {
        document.querySelector("#frequencyReadout").textContent = "449.9";
        document.querySelector("#noteReadout").textContent = "+124 c vs lug average";
        const state = document.querySelector("#readingState");
        state.hidden = false;
        state.textContent = "Next: lug 6";
        const elements = [...document.querySelectorAll("body *")];
        const sizes = elements.map(element => parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element, i) => { element.style.fontSize = sizes[i] * factor + "px"; });
      }, scale);
      await enlarged.waitForFunction(() => document.querySelector(".meter-wrap").classList.contains("readout-below"));
      const collisions = await enlarged.evaluate(() => {
        const text = ["#frequencyReadout", ".unit", "#modeLabel", "#noteReadout", "#readingState"].map(selector => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(selector));
          return range.getBoundingClientRect();
        });
        return [...document.querySelectorAll(".lug-point")].some(lug => {
          const box = lug.getBoundingClientRect();
          return text.some(t => t.left < box.right && t.right > box.left && t.top < box.bottom && t.bottom > box.top);
        });
      });
      assert.equal(collisions, false, `enlarged reading overlaps a lug at ${width}, ${scale}x`);
      await shot(enlarged, `${width}-text-${scale}`);
      await enlarged.evaluate(() => document.querySelectorAll("body *").forEach(element => { element.style.fontSize = ""; }));
      await enlarged.waitForFunction(() => !document.querySelector(".meter-wrap").classList.contains("readout-below"));
      await enlarged.close();
    }
  }

  const page = await createPage();
  await page.locator("#helpButton").click();
  assert.equal(await page.locator("#helpDialog").evaluate(d => d.open), true);
  await shot(page, "guide");
  await page.locator("#closeHelp").click();
  await page.locator("#tab-pitch").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#tab-lugs").getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");

  await page.evaluate(() => { window.micMode = "deny"; });
  await page.locator("#micButton").click();
  await page.waitForFunction(() => document.querySelector("#feedbackTitle").textContent.includes("blocked"));
  await shot(page, "permission-denied");
  await page.evaluate(() => { window.micMode = "pending"; });
  await page.locator("#micButton").click();
  await page.waitForFunction(() => document.querySelector("#micButtonText").textContent === "Cancel");
  await shot(page, "permission-pending");
  await page.locator("#micButton").click();
  await page.evaluate(() => window.resolveMic());
  await page.waitForFunction(() => window.testStream?.getTracks().every(t => t.readyState === "ended"));
  assert.equal(await page.locator("#micButtonText").innerText(), "Start mic");

  await page.evaluate(() => { window.micMode = "allow"; });
  await page.locator("#micButton").click();
  await page.waitForFunction(() => document.querySelector("#micButtonText").textContent === "Stop mic");
  await shot(page, "listening");
  for (let i = 0; i < 3; i++) {
    await tap(page, 123.5);
    if (i < 2) {
      assert.equal(await page.locator("#readingState").innerText(), `${i + 1} of 3 hits captured`);
      assert.equal(await page.locator("#frequencyReadout").innerText(), "--", "partial pitch must be withheld");
      assert.equal(await page.locator("#pitchNeedle").isHidden(), true);
    }
  }
  assert.ok(Math.abs(Number(await page.locator("#frequencyReadout").innerText()) - 123.5) < .5);
  assert.equal(await page.locator("#pitchNeedle").isVisible(), true);
  assert.equal(await page.locator("#feedbackTitle").innerText(), "On target", await page.locator(".tuner-panel").innerText());
  assert.equal(await page.locator(".history-chip").count(), 3, "one capture per physical tap");
  await shot(page, "on-target");
  await tap(page, 123.5, 3);
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Tap not used");
  assert.equal(await page.locator(".history-chip").count(), 3);
  await shot(page, "clipped");

  await page.locator(".settings-details summary").click();
  await page.locator("#resetTakesButton").click();
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  await page.locator("#takesSelect").selectOption("1");
  await page.locator(".settings-details summary").click();
  await tap(page, 110);
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Below target");
  assert.equal(await page.locator("#pitchNeedle").evaluate(el => parseFloat(el.style.left)), 0, "out-of-range pitch must meet scale endpoint");
  await shot(page, "below-target");
  await tap(page, 140);
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Above target");
  await shot(page, "above-target");
  await page.evaluate(() => window.testHit(140));
  await page.waitForTimeout(100);
  await page.locator("#presetSelect").selectOption("snare14");
  await page.waitForTimeout(800);
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  await page.locator("#presetSelect").selectOption("custom");
  assert.equal(await page.locator("#targetInput").inputValue(), "196");
  await page.locator("#targetInput").fill("999");
  await page.locator("#targetInput").blur();
  assert.equal(await page.locator("#targetInput").inputValue(), "196");

  await page.getByRole("tab", { name: "Lugs", exact: true }).click();
  await page.locator("#lugCountSelect").selectOption("6");
  await page.locator('[data-lug-pattern="star"]').click();
  await page.locator("#captureLugButton").click();
  const sequence = [0, 3, 1, 4, 2, 5];
  for (const index of sequence) {
    assert.equal(await page.locator('.lug-point[aria-pressed="true"]').getAttribute("data-lug"), String(index));
    await tap(page, 180);
    if (index !== sequence.at(-1)) {
      const next = sequence[sequence.indexOf(index) + 1];
      assert.equal(await page.locator("#readingState").innerText(), `Next: lug ${next + 1}`);
      if (index === 0) await shot(page, "next-lug");
    }
  }
  assert.equal(await page.locator("#lugAverage").innerText(), "6 of 6 captured");
  const completeFeedback = await page.locator("#feedbackTitle").innerText();
  assert.ok(["Lugs are matched", "Round captured"].includes(completeFeedback));
  const lugMeasurements = await page.locator(".lug-point").evaluateAll(buttons => buttons.map(button => {
    const label = button.getAttribute("aria-label");
    return Number(label.match(/, ([\d.]+) Hz/)[1]);
  }));
  for (const hz of lugMeasurements) assert.ok(Math.abs(1200 * Math.log2(hz / 180)) < 10, `Lug estimate: ${hz}`);
  const allMatched = await page.locator('.lug-point[data-tone="good"]').count() === 6;
  assert.equal(completeFeedback === "Lugs are matched", allMatched, "completion must agree with measured lug offsets");
  await shot(page, "lugs-complete");
  const historyCount = await page.locator(".history-chip").count();
  await tap(page, 200);
  assert.equal(await page.locator(".history-chip").count(), historyCount);
  assert.equal(await page.locator("#feedbackTitle").innerText(), completeFeedback);
  await page.locator('[data-lug="0"]').click();
  await page.locator("#captureLugButton").click();
  await tap(page, 200);
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Round captured");
  await shot(page, "lugs-adjust");

  await page.getByRole("tab", { name: "Heads", exact: true }).click();
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  await tap(page, 150);
  await page.locator('[data-head="resonant"]').click();
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  await tap(page, 225);
  const batter = parseFloat(await page.locator("#batterValue").innerText());
  const resonant = parseFloat(await page.locator("#resonantValue").innerText());
  const ratio = parseFloat(await page.locator("#targetReadout").innerText());
  // Live streams can resample the generated audio; test estimates and ratio math separately.
  assert.ok(Math.abs(1200 * Math.log2(batter / 150)) < 10, `Batter estimate: ${batter}`);
  assert.ok(Math.abs(1200 * Math.log2(resonant / 225)) < 10, `Resonant estimate: ${resonant}`);
  assert.ok(Math.abs(ratio - resonant / batter) <= .006, "ratio must agree with the measured heads");
  assert.ok(Math.abs(ratio - 1.5) <= .011, `Expected approximately 1.50x, received ${ratio}`);
  await shot(page, "heads-complete");
  await page.locator("#resetHeadsButton").click();
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  assert.equal(await page.locator("#targetReadout").innerText(), "--");
  await page.locator(".settings-details summary").click();
  await page.locator("#takesSelect").selectOption("3");
  await page.locator(".settings-details summary").click();
  await page.locator('[data-head="batter"]').click();
  await tap(page, 150);
  await page.locator('[data-head="resonant"]').click();
  for (let i = 0; i < 3; i++) await tap(page, 225);
  assert.equal(await page.locator("#batterProgress").innerText(), "1/3");
  assert.equal(await page.locator("#resonantProgress").innerText(), "Captured");
  assert.equal(await page.locator("#targetReadout").innerText(), "--", "incomplete head must not produce a finished ratio");
  assert.match(await page.locator("#feedbackDetail").innerText(), /other head/);
  await shot(page, "heads-incomplete");
  await page.locator('[data-head="batter"]').click();
  for (let i = 0; i < 2; i++) await tap(page, 150);
  assert.equal(await page.locator("#batterProgress").innerText(), "Captured");
  assert.notEqual(await page.locator("#targetReadout").innerText(), "--");
  await page.locator("#resetHeadsButton").click();
  await page.locator('[data-head="resonant"]').click();
  await page.locator("#micButton").click();
  assert.equal(await page.locator("#micButton").getAttribute("aria-pressed"), "false");
  await page.locator("#micButton").click();
  await page.waitForFunction(() => document.querySelector("#micButtonText").textContent === "Stop mic");
  await tap(page, 225);
  assert.ok(Math.abs(Number(await page.locator("#frequencyReadout").innerText()) - 225) < 1,
    await page.locator(".tuner-panel").innerText());
  await page.evaluate(() => window.testStream.getTracks()[0].dispatchEvent(new Event("ended")));
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Microphone disconnected");
  await page.locator("#micButton").click();
  await page.waitForFunction(() => document.querySelector("#micButtonText").textContent === "Stop mic");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(await page.locator("#feedbackTitle").innerText(), "Microphone paused");
  assert.equal(await page.evaluate(() => window.testStream.getTracks()[0].readyState), "ended");

  // Denied storage must not prevent startup.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Unavailable", "SecurityError"); } });
  });
  await page.reload();
  assert.equal(await page.locator("#frequencyReadout").innerText(), "--");
  assert.deepEqual(failures, []);
  console.log(engine + ": responsive screens, permission recovery, synthetic audio flow, clipping, lug round, head ratio, and storage denial passed.");
} finally {
  await browser.close();
}
