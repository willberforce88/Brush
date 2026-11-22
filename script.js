const stages = [
  { name: "Lower teeth", duration: 60, description: "Gently brush the outside, inside and chewing surfaces.", tip: "Use small, gentle circles. No need to scrub hard." },
  { name: "Upper teeth", duration: 60, description: "Move around every upper tooth, taking your time.", tip: "Tilt your brush towards the gumline and keep the pressure light." },
  { name: "Front teeth", duration: 30, description: "Finish by carefully brushing the front surfaces.", tip: "For the inside of your front teeth, tilt the brush vertically." }
];

const STORAGE_KEY = "brush-progress-v1";
const intro = document.getElementById("intro");
const session = document.getElementById("session");
const complete = document.getElementById("complete");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const restartButton = document.getElementById("restartButton");
const exitButton = document.getElementById("exitButton");
const againButton = document.getElementById("againButton");
const homeButton = document.getElementById("homeButton");
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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dayDifference(fromKey, toKey) {
  const a = dateFromKey(fromKey);
  const b = dateFromKey(toKey);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
function freshProgress() {
  return { lastCompletedDate: null, streak: 0, bestStreak: 0, totalSessions: 0,
    freezeAvailable: true, frozenDates: [], completedDates: [] };
}
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return freshProgress();
    return { ...freshProgress(), ...saved };
  } catch (_) {
    return freshProgress();
  }
}
let progress = loadProgress();
function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch (_) { /* Private browsing or full storage: the brushing timer still works. */ }
}

function renderJourney() {
  document.getElementById("streakCount").textContent = progress.streak;
  document.getElementById("bestStreak").textContent = progress.bestStreak;
  document.getElementById("totalSessions").textContent = progress.totalSessions;
  const freezePill = document.getElementById("freezePill");
  freezePill.classList.toggle("used", !progress.freezeAvailable);
  document.getElementById("freezeText").textContent = progress.freezeAvailable ? "1 freeze ready" : "freeze used";
  const week = document.getElementById("weekRow");
  week.innerHTML = "";
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = localDateKey(date);
    const isDone = progress.completedDates.includes(key);
    const isFrozen = progress.frozenDates.includes(key);
    const cell = document.createElement("div");
    cell.className = "day-cell" + (isDone ? " done" : "") + (isFrozen ? " frozen" : "") + (key === localDateKey() ? " today" : "");
    const mark = document.createElement("span");
    mark.className = "day-mark";
    mark.textContent = isDone ? "✓" : isFrozen ? "❄" : "·";
    const label = document.createElement("span");
    label.textContent = labels[i];
    cell.append(mark, label);
    week.appendChild(cell);
  }
}

function recordCompletedSession() {
  const today = localDateKey();
  progress.totalSessions += 1;
  if (!progress.completedDates.includes(today)) progress.completedDates.push(today);

  if (!progress.lastCompletedDate) {
    progress.streak = 1;
    progress.lastCompletedDate = today;
  } else {
    const gap = dayDifference(progress.lastCompletedDate, today);
    if (gap === 0) {
      // More than one session today counts towards totals, not extra streak days.
    } else if (gap === 1) {
      progress.streak += 1;
      progress.lastCompletedDate = today;
    } else if (gap === 2 && progress.freezeAvailable) {
      // One missed calendar day is covered automatically by the single freeze.
      const missedDate = localDateKey(new Date(dateFromKey(progress.lastCompletedDate).getFullYear(),
        dateFromKey(progress.lastCompletedDate).getMonth(), dateFromKey(progress.lastCompletedDate).getDate() + 1));
      progress.frozenDates.push(missedDate);
      progress.freezeAvailable = false;
      progress.streak += 2; // includes the protected day and today's completed session
      progress.lastCompletedDate = today;
      document.getElementById("completeMessage").textContent = "Your streak freeze covered a day off. No guilt, just pick up where you left off.";
    } else if (gap > 1) {
      progress.streak = 1;
      progress.freezeAvailable = true; // a fresh streak gets one fresh freeze
      progress.lastCompletedDate = today;
      document.getElementById("completeMessage").textContent = "Welcome back! A fresh start, and your next little streak begins today.";
    }
  }
  progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
  saveProgress();
  renderJourney();
}

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
  oscillator.connect(gain); gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.03);
}
function checkpointSound() {
  tone(660, 0, .13, "sine", .11);
  tone(880, .12, .2, "sine", .1);
}
function trumpetFinish() {
  const notes = [[523.25,0,.24],[659.25,.24,.24],[783.99,.48,.28],[1046.5,.78,.52],[783.99,1.32,.18],[1046.5,1.52,.65]];
  notes.forEach(([frequency,start,duration]) => {
    tone(frequency,start,duration,"sawtooth",.075);
    tone(frequency*2,start,duration*.8,"triangle",.018);
  });
}
function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
  ringProgress.style.strokeDashoffset = circumference * (1 - remaining / stages[stageIndex].duration);
}
function startSession() {
  clearInterval(interval);
  stageIndex = 0; remaining = stages[0].duration; running = true;
  intro.classList.add("hidden"); complete.classList.add("hidden"); session.classList.remove("hidden");
  document.getElementById("completeMessage").textContent = "You showed up for your smile. That's something worth celebrating.";
  document.getElementById("pauseLabel").textContent = "Pause";
  pauseButton.lastElementChild.textContent = "Ⅱ";
  updateProgress(); audio(); runTimer();
}
function runTimer() {
  clearInterval(interval);
  if (!running) return;
  interval = setInterval(() => {
    remaining -= 1; updateClock();
    if (remaining <= 0) advanceStage();
  }, 1000);
}
function advanceStage() {
  clearInterval(interval);
  if (stageIndex < stages.length - 1) {
    stageIndex += 1; remaining = stages[stageIndex].duration;
    updateProgress(); checkpointSound(); runTimer();
  } else finishSession();
}
function finishSession() {
  clearInterval(interval); running = false;
  recordCompletedSession();
  session.classList.add("hidden"); complete.classList.remove("hidden");
  trumpetFinish();
}
function togglePause() {
  if (running) {
    running = false; clearInterval(interval);
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
  clearInterval(interval); running = false;
  session.classList.add("hidden"); complete.classList.add("hidden"); intro.classList.remove("hidden");
}
startButton.addEventListener("click", startSession);
againButton.addEventListener("click", startSession);
homeButton.addEventListener("click", () => {
  complete.classList.add("hidden"); intro.classList.remove("hidden"); renderJourney();
});
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startSession);
exitButton.addEventListener("click", exitSession);
soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundToggle.textContent = soundEnabled ? "♫" : "♪";
  soundToggle.setAttribute("aria-label", soundEnabled ? "Mute sounds" : "Enable sounds");
  if (soundEnabled) checkpointSound();
});
let wakeLock = null;
async function requestWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); }
  catch (_) { /* Wake lock is optional and browser-dependent. */ }
}
startButton.addEventListener("click", requestWakeLock);
againButton.addEventListener("click", requestWakeLock);
renderJourney();
