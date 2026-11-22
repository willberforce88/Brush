// brush. — household edition
const SUPABASE_URL = "https://mcwwrhojsegfykzyeixd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Zj15JtRlRjD01CvC0Rt2CQ_LY8Fjhei";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const stages = [
  { name:"Lower teeth", duration:60, description:"Gently brush the outside, inside and chewing surfaces.", tip:"Use small, gentle circles. No need to scrub hard." },
  { name:"Upper teeth", duration:60, description:"Move around every upper tooth, taking your time.", tip:"Tilt your brush towards the gumline and keep the pressure light." },
  { name:"Front teeth", duration:30, description:"Finish by carefully brushing the front surfaces.", tip:"For the inside of your front teeth, tilt the brush vertically." }
];
const $ = id => document.getElementById(id);
const screens = ["profilesScreen","homeScreen","session","mouthwashScreen","mouthwashTimer","complete"];
let profiles = [], activeProfile = null, sessions = [];
let currentPeriod = "AM", stageIndex = 0, remaining = 60, interval = null, mouthwashInterval = null;
let running = false, soundEnabled = true, audioContext = null;
const circumference = 2 * Math.PI * 126;
$("ringProgress").style.strokeDasharray = circumference;
$("mouthwashRing").style.strokeDasharray = circumference;

function showScreen(id) {
  screens.forEach(screen => $(screen).classList.toggle("hidden", screen !== id));
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.remove("hidden");
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.classList.add("hidden"), 3200);
}
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function dateFromKey(key) {
  const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d);
}
function dayDiff(a,b) {
  const x=dateFromKey(a), y=dateFromKey(b);
  return Math.round((Date.UTC(y.getFullYear(),y.getMonth(),y.getDate())-Date.UTC(x.getFullYear(),x.getMonth(),x.getDate()))/86400000);
}
function getFullDates(rows) {
  const days = new Map();
  rows.forEach(row => {
    if (!days.has(row.session_date)) days.set(row.session_date, new Set());
    days.get(row.session_date).add(row.period);
  });
  return [...days.entries()].filter(([,periods])=>periods.has("AM")&&periods.has("PM")).map(([date])=>date).sort();
}
function streakFromDates(fullDates, freezeAvailable) {
  if (!fullDates.length) return {streak:0, usedFreeze:false, freezeAvailable};
  let streak=1, usedFreeze=false, freeze=freezeAvailable;
  for (let i=fullDates.length-1;i>0;i--) {
    const gap=dayDiff(fullDates[i-1],fullDates[i]);
    if (gap===1) streak+=1;
    else if (gap===2 && freeze) { streak+=2; freeze=false; usedFreeze=true; }
    else { freeze=true; break; }
  }
  return {streak,usedFreeze,freezeAvailable:freeze};
}
function sessionsForToday() {
  const today=localDateKey();
  return {
    AM:sessions.some(s=>s.session_date===today&&s.period==="AM"),
    PM:sessions.some(s=>s.session_date===today&&s.period==="PM")
  };
}
function audio() {
  if (!audioContext) { const C=window.AudioContext||window.webkitAudioContext; if(C) audioContext=new C(); }
  if(audioContext?.state==="suspended") audioContext.resume();
  return audioContext;
}
function tone(freq,start,duration,type="sine",volume=.12) {
  if(!soundEnabled)return;
  const ctx=audio(); if(!ctx)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=type; osc.frequency.setValueAtTime(freq,ctx.currentTime+start);
  gain.gain.setValueAtTime(.0001,ctx.currentTime+start);
  gain.gain.exponentialRampToValueAtTime(volume,ctx.currentTime+start+.025);
  gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+start+duration);
  osc.connect(gain);gain.connect(ctx.destination);osc.start(ctx.currentTime+start);osc.stop(ctx.currentTime+start+duration+.03);
}
function checkpointSound(){tone(660,0,.13);tone(880,.12,.2);}
function trumpetFinish(){
  [[523.25,0,.24],[659.25,.24,.24],[783.99,.48,.28],[1046.5,.78,.52],[783.99,1.32,.18],[1046.5,1.52,.65]].forEach(([f,s,d])=>{tone(f,s,d,"sawtooth",.075);tone(f*2,s,d*.8,"triangle",.018);});
}
function formatTime(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

async function loadProfiles() {
  $("profileMessage").textContent = "Profiles are shared across your household devices.";
  const {data,error}=await db.from("profiles").select("id,name,freeze_available,best_streak,created_at").order("name");
  if(error) { $("profileMessage").textContent=`Couldn't load profiles: ${error.message}`; return; }
  profiles=data||[];
  renderProfiles();
  if(activeProfile) {
    const refreshed=profiles.find(p=>p.id===activeProfile.id);
    if(!refreshed) { activeProfile=null; localStorage.removeItem("brush-active-profile"); showScreen("profilesScreen"); }
    else { activeProfile=refreshed; await loadActiveProfile(); }
  }
}
function renderProfiles() {
  const list=$("profileList"); list.innerHTML="";
  if(!profiles.length) {
    const empty=document.createElement("div"); empty.className="empty-card";
    empty.textContent="No profiles yet. Create the first one below."; list.append(empty); return;
  }
  profiles.forEach(profile=>{
    const button=document.createElement("button"); button.type="button"; button.className="profile-option";
    const avatar=document.createElement("span"); avatar.className="avatar"; avatar.textContent=profile.name.trim().charAt(0).toUpperCase();
    const info=document.createElement("span"); info.className="profile-name"; info.textContent=profile.name;
    const hint=document.createElement("small"); hint.className="profile-hint"; hint.textContent="Open your brushing journey";
    info.append(hint);
    const arrow=document.createElement("span"); arrow.className="profile-arrow"; arrow.textContent="›";
    button.append(avatar,info,arrow); button.addEventListener("click",()=>selectProfile(profile));
    list.append(button);
  });
}
async function createProfile(event) {
  event.preventDefault();
  const input=$("newProfileName"), name=input.value.trim();
  if(!name) return;
  $("profileMessage").textContent="Creating your profile...";
  const {data,error}=await db.from("profiles").insert({name}).select("id,name,freeze_available,best_streak,created_at").single();
  if(error) { $("profileMessage").textContent=`Couldn't create profile: ${error.message}`; return; }
  input.value=""; profiles.push(data); renderProfiles(); await selectProfile(data);
}
async function selectProfile(profile) {
  activeProfile=profile;
  localStorage.setItem("brush-active-profile",profile.id);
  await loadActiveProfile();
}
async function loadActiveProfile() {
  if(!activeProfile)return;
  const {data,error}=await db.from("brushing_sessions").select("id,profile_id,session_date,period,mouthwash,completed_at").eq("profile_id",activeProfile.id).order("session_date",{ascending:true});
  if(error){toast(`Couldn't load brushing history: ${error.message}`);return;}
  sessions=data||[];
  $("activeName").textContent=activeProfile.name;
  $("todayDate").textContent=new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  renderHome();
  showScreen("homeScreen");
}
function renderHome() {
  const fullDates=getFullDates(sessions);
  const stats=streakFromDates(fullDates,activeProfile.freeze_available!==false);
  const latest=fullDates[fullDates.length-1];
  // Keep a just-earned streak visible while today's AM/PM pair is still being completed.
  let shownStreak=stats.streak;
  if(latest && dayDiff(latest,localDateKey())>2) shownStreak=0;
  $("streakCount").textContent=shownStreak;
  $("bestStreak").textContent=activeProfile.best_streak||0;
  $("totalSessions").textContent=sessions.length;
  $("freezePill").classList.toggle("used",!activeProfile.freeze_available);
  $("freezeText").textContent=activeProfile.freeze_available?"1 freeze ready":"freeze used";
  const days=["M","T","W","T","F","S","S"],today=new Date(),mondayOffset=(today.getDay()+6)%7;
  const monday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-mondayOffset);
  const week=$("weekRow");week.innerHTML="";
  for(let i=0;i<7;i++){
    const date=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i),key=localDateKey(date);
    const cell=document.createElement("div");cell.className="day-cell"+(fullDates.includes(key)?" done":"")+(key===localDateKey()?" today":"");
    const mark=document.createElement("span");mark.className="day-mark";mark.textContent=fullDates.includes(key)?"✓":"·";
    const label=document.createElement("span");label.textContent=days[i];cell.append(mark,label);week.append(cell);
  }
  const done=sessionsForToday();
  $("amStatus").textContent=done.AM?"Completed ✓":"Not done";$("pmStatus").textContent=done.PM?"Completed ✓":"Not done";
  $("amStatus").classList.toggle("done",done.AM);$("pmStatus").classList.toggle("done",done.PM);
  $("amButton").disabled=done.AM;$("pmButton").disabled=done.PM;
  $("amButton").innerHTML=done.AM?"Morning brush completed <span>✓</span>":'Start morning brush <span>↗</span>';
  $("pmButton").innerHTML=done.PM?"Evening brush completed <span>✓</span>":'Start evening brush <span>↗</span>';
}
function beginBrush(period) {
  currentPeriod=period;stageIndex=0;remaining=stages[0].duration;running=true;
  $("stageCount").textContent=`${period==="AM"?"MORNING":"EVENING"} · CHECKPOINT 01 / 03`;
  updateStage();showScreen("session");audio();runTimer();
}
function updateStage() {
  const stage=stages[stageIndex];
  $("stageCount").textContent=`${currentPeriod==="AM"?"MORNING":"EVENING"} · CHECKPOINT 0${stageIndex+1} / 03`;
  $("stageTitle").textContent=stage.name;$("stageDescription").textContent=stage.description;$("tipText").textContent=stage.tip;
  $("timerSub").textContent=stageIndex===2?"FINAL LITTLE PUSH":"YOU'VE GOT THIS";
  stages.forEach((_,i)=>{$(`step${i}`).classList.toggle("active",i===stageIndex);$(`step${i}`).classList.toggle("done",i<stageIndex);});
  updateClock();
}
function updateClock(){ $("timeDisplay").textContent=formatTime(remaining);ringProgressOffset(1-remaining/stages[stageIndex].duration); }
function ringProgressOffset(progress){$("ringProgress").style.strokeDashoffset=circumference*progress;}
function runTimer(){
  clearInterval(interval);if(!running)return;
  interval=setInterval(()=>{remaining--;updateClock();if(remaining<=0)advanceStage();},1000);
}
function advanceStage(){
  clearInterval(interval);
  if(stageIndex<2){stageIndex++;remaining=stages[stageIndex].duration;updateStage();checkpointSound();runTimer();}
  else{running=false;showScreen("mouthwashScreen");}
}
function togglePause(){
  if(running){running=false;clearInterval(interval);$("pauseLabel").textContent="Resume";$("pauseButton").lastElementChild.textContent="▶";$("timerSub").textContent="TAKE YOUR TIME";}
  else{running=true;$("pauseLabel").textContent="Pause";$("pauseButton").lastElementChild.textContent="Ⅱ";$("timerSub").textContent=stageIndex===2?"FINAL LITTLE PUSH":"YOU'VE GOT THIS";runTimer();}
}
function startMouthwash(){
  showScreen("mouthwashTimer");let left=30;
  $("mouthwashTime").textContent=formatTime(left);$("mouthwashRing").style.strokeDashoffset=0;
  clearInterval(mouthwashInterval);
  mouthwashInterval=setInterval(()=>{left--; $("mouthwashTime").textContent=formatTime(left);$("mouthwashRing").style.strokeDashoffset=circumference*(1-left/30);if(left<=0){clearInterval(mouthwashInterval);saveBrushSession(true);}},1000);
}
function finishMouthwashEarly(){clearInterval(mouthwashInterval);saveBrushSession(true);}
async function saveBrushSession(mouthwash){
  clearInterval(interval);clearInterval(mouthwashInterval);
  const today=localDateKey();
  const {error}=await db.from("brushing_sessions").insert({profile_id:activeProfile.id,session_date:today,period:currentPeriod,mouthwash});
  if(error){
    if(error.code==="23505"){toast("This brushing session is already recorded.");await loadActiveProfile();return;}
    toast(`Couldn't save session: ${error.message}`);showScreen("homeScreen");return;
  }
  await refreshStreakAndHistory();
  $("completePeriod").textContent=currentPeriod;
  const status=sessionsForToday();
  $("completeMessage").textContent=status.AM&&status.PM?"AM and PM complete! You've earned today's full brushing streak.":"Lovely work! Your other brush is still waiting whenever you're ready.";
  showScreen("complete");trumpetFinish();
}
async function refreshStreakAndHistory(){
  const {data,error}=await db.from("brushing_sessions").select("id,session_date,period,mouthwash").eq("profile_id",activeProfile.id).order("session_date",{ascending:true});
  if(error){toast("Your session saved, but the progress refresh failed.");return;}
  sessions=data||[];
  const fullDates=getFullDates(sessions);
  const stats=streakFromDates(fullDates,activeProfile.freeze_available!==false);
  const best=Math.max(activeProfile.best_streak||0,stats.streak);
  const {data:updated,error:updateError}=await db.from("profiles").update({freeze_available:stats.freezeAvailable,best_streak:best}).eq("id",activeProfile.id).select("id,name,freeze_available,best_streak").single();
  if(!updateError&&updated){activeProfile={...activeProfile,...updated};}
  renderHome();
}
function leaveSession(){
  clearInterval(interval);clearInterval(mouthwashInterval);running=false;loadActiveProfile();
}
async function refreshHousehold(){
  await loadProfiles();
  if(activeProfile)await loadActiveProfile();
  toast("Household profiles refreshed.");
}
$("newProfileForm").addEventListener("submit",createProfile);
$("amButton").addEventListener("click",()=>beginBrush("AM"));
$("pmButton").addEventListener("click",()=>beginBrush("PM"));
$("switchProfile").addEventListener("click",()=>{activeProfile=null;localStorage.removeItem("brush-active-profile");loadProfiles();showScreen("profilesScreen");});
$("refreshButton").addEventListener("click",refreshHousehold);
$("brandHome").addEventListener("click",e=>{e.preventDefault();if(activeProfile)loadActiveProfile();else{loadProfiles();showScreen("profilesScreen");}});
$("pauseButton").addEventListener("click",togglePause);
$("restartButton").addEventListener("click",()=>beginBrush(currentPeriod));
$("exitButton").addEventListener("click",leaveSession);
$("mouthwashYes").addEventListener("click",startMouthwash);
$("mouthwashNo").addEventListener("click",()=>saveBrushSession(false));
$("mouthwashFinish").addEventListener("click",finishMouthwashEarly);
$("doneButton").addEventListener("click",()=>loadActiveProfile());
$("soundToggle").addEventListener("click",()=>{soundEnabled=!soundEnabled;$("soundToggle").textContent=soundEnabled?"♫":"♪";if(soundEnabled)checkpointSound();});
let wakeLock=null;
async function requestWakeLock(){try{if("wakeLock"in navigator)wakeLock=await navigator.wakeLock.request("screen");}catch(_){}}
$("amButton").addEventListener("click",requestWakeLock);$("pmButton").addEventListener("click",requestWakeLock);
async function boot(){
  const savedId=localStorage.getItem("brush-active-profile");
  const {data,error}=await db.from("profiles").select("id,name,freeze_available,best_streak,created_at").order("name");
  if(error){$("profileMessage").textContent=`Supabase connection error: ${error.message}`;showScreen("profilesScreen");return;}
  profiles=data||[];renderProfiles();
  if(savedId){const saved=profiles.find(p=>p.id===savedId);if(saved){activeProfile=saved;await loadActiveProfile();}else{showScreen("profilesScreen");}}
  else showScreen("profilesScreen");
  // Refresh profile list periodically so dashboard deletions disappear without a manual reload.
  setInterval(async()=>{const {data:latest}=await db.from("profiles").select("id,name,freeze_available,best_streak,created_at").order("name");if(latest){profiles=latest;renderProfiles();if(activeProfile){const refreshed=profiles.find(p=>p.id===activeProfile.id);if(!refreshed){activeProfile=null;localStorage.removeItem("brush-active-profile");showScreen("profilesScreen");}else{activeProfile=refreshed;}}}},30000);
}
boot();
