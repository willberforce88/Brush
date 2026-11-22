const stages = [
  { name: "Lower teeth", duration: 60, description: "Gently brush the outside, inside and chewing surfaces.", tip: "Use small, gentle circles. No need to scrub hard." },
  { name: "Upper teeth", duration: 60, description: "Move around every upper tooth, taking your time.", tip: "Tilt your brush towards the gumline and keep the pressure light." },
  { name: "Front teeth", duration: 30, description: "Finish by carefully brushing the front surfaces.", tip: "For the inside of your front teeth, tilt the brush vertically." }
];

const intro = document.getElementById("intro");
const session = document.getElementById("session");
const complete = document.getElementById("complete");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const restartButton = document.getElementById("restartButton");
const exitButton = document.getElementById("exitButton");
const againButton = document.getElementById("againButton");
const soundToggle = document.getElementById("soundToggle");
const timeDisplay = document.getElementById("timeDisplay");
const ringProgress = document.getElementById("ringProgress");

let stageIndex = 0;
let remaining = stages[0].duration;
let interval = null;
let running = false;
let soundEnabled = true;
let audioContext = null;

const circumference = 2 * Math.PI * 126;
ringProgress.style.strokeDasharray = circumference;
ringProgress.style.strokeDashoffset = 0;

function audio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioContext = new AudioCtx();
  }
  if (audioContext?.state === "suspended") audioContext.resume();
  return audioContext;
}

function tone(frequency, start, duration, type = "sine", volume = 0.12) {
  if (!soundEnabled) return;
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.03);
}

function checkpointSound() {
  tone(660, 0, .13, "sine", .11);
  tone(880, .12, .2, "sine", .1);
}

function trumpetFinish() {
  // A bright, original brass-like fanfare made with synthesized notes.
  const notes = [
    [523.25, 0, .24], [659.25, .24, .24], [783.99, .48, .28],
    [1046.5, .78, .52], [783.99, 1.32, .18], [1046.5, 1.52, .65]
  ];
  notes.forEach(([frequency, start, duration]) => {
    tone(frequency, start, duration, "sawtooth", .075);
    tone(frequency * 2, start, duration * .8, "triangle", .018);
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function updateProgress() {
  const stage = stages[stageIndex];
  document.getElementById("stageCount").textContent = `CHECKPOINT 0${stageIndex + 1} / 03`;
  document.getElementById("stageTitle").textContent = stage.name;
  document.getElementById("stageDescription").textContent = stage.description;
  document.getElementById("tipText").textContent = stage.tip;
  document.getElementById("timerSub").textContent = stageIndex === 2 ? "FINAL LITTLE PUSH" : "YOU'VE GOT THIS";

  stages.forEach((_, index) => {
    const element = document.getElementById(`step${index}`);
    element.classList.toggle("active", index === stageIndex);
    element.classList.toggle("done", index < stageIndex);
  });
  updateClock();
}

function updateClock() {
  timeDisplay.textContent = formatTime(remaining);
  const progress = 1 - remaining / stages[stageIndex].duration;
  ringProgress.style.strokeDashoffset = circumference * progress;
}

function startSession() {
  clearInterval(interval);
  stageIndex = 0;
  remaining = stages[0].duration;
  running = true;
  intro.classList.add("hidden");
  complete.classList.add("hidden");
  session.classList.remove("hidden");
  pauseButton.querySelector("#pauseLabel").textContent = "Pause";
  pauseButton.lastElementChild.textContent = "Ⅱ";
  updateProgress();
  audio();
  runTimer();
}

function runTimer() {
  clearInterval(interval);
  if (!running) return;
  interval = setInterval(() => {
    remaining -= 1;
    updateClock();
    if (remaining <= 0) advanceStage();
  }, 1000);
}

function advanceStage() {
  clearInterval(interval);
  if (stageIndex < stages.length - 1) {
    stageIndex += 1;
    remaining = stages[stageIndex].duration;
    updateProgress();
    checkpointSound();
    runTimer();
  } else {
    finishSession();
  }
}

function finishSession() {
  clearInterval(interval);
  running = false;
  session.classList.add("hidden");
  complete.classList.remove("hidden");
  trumpetFinish();
}

function togglePause() {
  if (running) {
    running = false;
    clearInterval(interval);
    document.getElementById("pauseLabel").textContent = "Resume";
    pauseButton.lastElementChild.textContent = "▶";
    document.getElementById("timerSub").textContent = "TAKE YOUR TIME";
  } else {
    running = true;
    document.getElementById("pauseLabel").textContent = "Pause";
    pauseButton.lastElementChild.textContent = "Ⅱ";
    document.getElementById("timerSub").textContent = stageIndex === 2 ? "FINAL LITTLE PUSH" : "YOU'VE GOT THIS";
    runTimer();
  }
}

function exitSession() {
  clearInterval(interval);
  running = false;
  session.classList.add("hidden");
  complete.classList.add("hidden");
  intro.classList.remove("hidden");
}

startButton.addEventListener("click", startSession);
againButton.addEventListener("click", startSession);
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startSession);
exitButton.addEventListener("click", exitSession);
soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggle.textContent = soundEnabled ? "♫" : "♪";
  soundToggle.classList.toggle("muted", !soundEnabled);
  soundToggle.setAttribute("aria-label", soundEnabled ? "Mute sounds" : "Enable sounds");
  if (soundEnabled) checkpointSound();
});

// Prevent the screen from sleeping during an active brushing session where supported.
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) { /* Wake lock is optional and browser-dependent. */ }
}
startButton.addEventListener("click", requestWakeLock);
againButton.addEventListener("click", requestWakeLock);
