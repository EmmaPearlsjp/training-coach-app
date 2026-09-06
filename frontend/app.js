const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const AVOID_TYPES = ["intervals","tempo","hills","long","timetrial","race"];
const RUN_TYPES = ["easy","intervals","tempo","hills","long","timetrial","race"];
const PLAN_START = new Date(2026, 8, 6); // Sun Sept 6 2026 — Week1 Day1, Sun-Sat week structure
const CHART_TEXT = "#8A7A80";
const CHART_GRID = "rgba(80,52,71,0.14)";
const RACE_DATE = new Date(2026, 10, 21); // Nov 21 2026
let charts = {};
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
let guidedSession = null;
let sessionStartedAt = null;
let sessionClockInterval = null;
let restClockInterval = null;
let restSecondsRemaining = 0;
let intervalClockInterval = null;
let intervalState = null;
const BACKUP_PREFIXES = ["custom-workout:", "plan-override:", "done:", "activities:", "swaps:", "feel:", "journal:", "food:", "weight:", "meal:", "goal:", "mi-fitness:"];

async function collectTrainingData() {
  const data = { exportedAt: new Date().toISOString(), version: 1, records: {} };
  for (const prefix of BACKUP_PREFIXES) {
    const list = await window.storage.list(prefix, false);
    data.records[prefix] = {};
    for (const key of (list.keys || [])) {
      const entry = await window.storage.get(key, false);
      if (entry) data.records[prefix][key] = entry.value;
    }
  }
  return data;
}

async function createLocalSafetySnapshot(reason) {
  try {
    const data = await collectTrainingData();
    localStorage.setItem("training-coach:safety:last", JSON.stringify({
      ...data, reason, snapshotAt: new Date().toISOString()
    }));
    updateDataSafetyStatus("Snapshot saved before " + reason + ".");
  } catch (error) {
    console.error("Could not create local safety snapshot:", error);
    updateDataSafetyStatus("Automatic snapshot could not be saved. Export a backup before continuing.");
  }
}

function updateDataSafetyStatus(message) {
  const summary = document.getElementById("dataSafetySummary");
  if (!summary) return;
  const status = window.storage?.getStatus?.() || { mode: "checking" };
  const domain = window.location.hostname || "local file";
  const mode = status.mode === "backend" ? "connected local backend" : status.mode === "browser" ? "this browser only" : "checking storage";
  summary.textContent = `${domain} · ${mode}${message ? ` · ${message}` : ""}`;
}

function refreshDataSafetyStatus() {
  updateDataSafetyStatus("");
  setTimeout(() => updateDataSafetyStatus(""), 500);
}

function openAppPanel(panelName) {
  const button = document.querySelector(`.tab-btn[data-panel="${panelName}"]`);
  if (button) button.click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const GUIDED_SESSIONS = {
  "abs-5": {
    title: "Quick Abs — 5 minutes",
    equipment: "Exercise mat recommended. Move smoothly; this is a focused core finisher, not a promise of spot fat loss.",
    interval: { work: 40, transition: 20, rounds: 1 },
    exercises: [
      ["Dead bug", 1, "40 sec", "Keep your lower back gently connected to the floor and move opposite arm and leg slowly.", "dead bug exercise proper form"],
      ["Forearm plank", 1, "40 sec", "Squeeze glutes and brace without holding your breath; stop before your back sags.", "forearm plank proper form"],
      ["Reverse crunch", 1, "40 sec", "Curl the pelvis toward the ribs without swinging your legs.", "reverse crunch proper form"],
      ["Side plank — left", 1, "40 sec", "Lift from the waist and keep your body in one long line.", "side plank left proper form"],
      ["Side plank — right", 1, "40 sec", "Keep the shoulder stacked and the hips lifted as long as form stays strong.", "side plank right proper form"]
    ]
  },
  "abs-10": {
    title: "Quick Abs — 10 minutes",
    equipment: "Exercise mat recommended. Complete two controlled rounds of the 5-minute core circuit.",
    interval: { work: 40, transition: 20, rounds: 2 },
    exercises: [
      ["Dead bug", 2, "40 sec", "Keep your lower back gently connected to the floor and move opposite arm and leg slowly.", "dead bug exercise proper form"],
      ["Forearm plank", 2, "40 sec", "Squeeze glutes and brace without holding your breath; stop before your back sags.", "forearm plank proper form"],
      ["Reverse crunch", 2, "40 sec", "Curl the pelvis toward the ribs without swinging your legs.", "reverse crunch proper form"],
      ["Side plank — left", 2, "40 sec", "Lift from the waist and keep your body in one long line.", "side plank left proper form"],
      ["Side plank — right", 2, "40 sec", "Keep the shoulder stacked and the hips lifted as long as form stays strong.", "side plank right proper form"]
    ]
  },
  "legs-core": {
    title: "Legs & Core — Loading Up",
    equipment: "Dumbbell, exercise mat, stable bench or step",
    exercises: [
      ["Heel walks", 3, "30–45 sec", "Keep toes lifted and take short controlled steps.", "heel walks exercise"],
      ["Diagonal toe tap", 3, "8–12 / side", "Brace your ribs down and move slowly from the hip.", "diagonal toe tap exercise"],
      ["Side leg swings", 3, "10 / side", "Hold support, keep the pelvis level, and use a controlled range.", "side leg swings exercise"],
      ["Bodyweight squat", 3, "8–12", "Keep the whole foot grounded and knees tracking over toes.", "bodyweight squat form"],
      ["Single-leg hamstring hold", 3, "20–30 sec / side", "Hinge gently and keep the working heel heavy.", "single leg isometric hamstring hold"],
      ["Hip drop", 3, "8–12 / side", "Move from the hip; avoid twisting the trunk.", "hip drop exercise glute medius"],
      ["Single-leg glute bridge", 3, "8–12 / side", "Finish with the hip extended without arching your back.", "single leg glute bridge form"],
      ["Bent-knee calf raise", 3, "12–15 / side", "Pause at the top and lower slowly.", "bent knee calf raise exercise"],
      ["Walking lunge", 2, "8–10 / side", "Use a comfortable stride and keep your front knee stable.", "walking lunge form"],
      ["Loaded walking calf raise", 2, "10–15", "Hold the dumbbell securely and rise smoothly.", "loaded walking calf raise"],
      ["Standing side bend", 2, "10 / side", "Stay tall; make the side body work instead of collapsing.", "standing dumbbell side bend"],
      ["Plank", 2, "20–45 sec", "Squeeze glutes, brace gently, and stop before your back sags.", "forearm plank proper form"]
    ]
  },
  "upper-body": {
    title: "Upper Body Lift",
    equipment: "Dumbbell, bench, exercise mat",
    exercises: [
      ["Travelling press-up walk out", 3, "6–10", "Move as one unit and keep the shoulders away from the ears.", "traveling push up walkout"],
      ["Mountain climber", 3, "20–30 sec", "Keep the hips steady and choose a pace you can control.", "mountain climber proper form"],
      ["Press-up position walk out", 3, "6–10", "Brace your trunk before moving your hands.", "push up position walk out"],
      ["Bear crawl", 3, "20–30 sec", "Keep knees low and take small opposite-hand steps.", "bear crawl exercise form"],
      ["Dumbbell bench press", 2, "8–12", "Lower with control and keep wrists stacked over elbows.", "dumbbell bench press form"],
      ["Lunge and press", 2, "8 / side", "Stand tall before pressing; use a manageable dumbbell.", "dumbbell lunge and press"],
      ["Bent-over row", 2, "8–12 / side", "Keep your back long and pull the elbow toward your hip.", "one arm dumbbell row form"],
      ["Dead bug", 2, "8 / side", "Keep your lower back gently connected to the mat.", "dead bug exercise proper form"],
      ["Single-arm row", 2, "8–12 / side", "Avoid rotating; pause when the elbow reaches the ribs.", "single arm dumbbell row"],
      ["Farmer's carry", 2, "30–45 sec", "Walk tall with quiet steps and shoulders level.", "dumbbell farmers carry form"],
      ["Side plank", 3, "20–30 sec / side", "Lift from the waist and keep your head neutral.", "side plank proper form"]
    ]
  }
};

function renderCountdown() {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysToRace = Math.round((RACE_DATE - t0) / (1000 * 60 * 60 * 24));
  const pos = todayPosition();
  const weekLabel = pos ? weeks[pos.wi].label.replace("Week ", "") : "–";
  document.getElementById("countdownRow").innerHTML = `
    <div class="countdown-box accent"><div class="num">${daysToRace}</div><div class="lbl">Days to race</div></div>
    <div class="countdown-box"><div class="num">${weekLabel}</div><div class="lbl">Current week</div></div>
  `;
}

function parseKm(detail) {
  const m = detail.match(/([\d.]+)\s*km/i);
  return m ? parseFloat(m[1]) : 0;
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// Pulled from Mi Fitness on 2026-09-05 (see Physiology tab / SOP for refresh procedure).
// Keyed by calendar date so any workout landing on a plan day surfaces as "Actual" data.
const REPORT_GENERATED_DATE = "2026-09-05";
const ACTUAL_WORKOUTS = {
  "2026-08-06": [{ type: "outdoor_running", duration: 38, distance_km: 5.3, avg_hr: 181, max_hr: 192, calories: 244 }],
  "2026-08-10": [{ type: "outdoor_running", duration: 36, distance_km: 5.0, avg_hr: 187, max_hr: 200, calories: 213 }],
  "2026-08-11": [{ type: "outdoor_running", duration: 38, distance_km: 5.1, avg_hr: 181, max_hr: 192, calories: 221 }],
  "2026-08-16": [{ type: "badminton", duration: 96, avg_hr: 146, max_hr: 187, calories: 712 }],
  "2026-08-18": [{ type: "outdoor_running", duration: 9, distance_km: 1.0, avg_hr: 157, max_hr: 182, calories: 48 }],
  "2026-08-19": [{ type: "badminton", duration: 120, avg_hr: 145, max_hr: 181, calories: 717 }],
  "2026-08-20": [{ type: "outdoor_walking", duration: 36, distance_km: 3.2, avg_hr: 120, max_hr: 143, calories: 113 }],
  "2026-08-21": [{ type: "outdoor_walking", duration: 67, distance_km: 5.7, avg_hr: 122, max_hr: 149, calories: 205 }],
  "2026-08-22": [
    { type: "outdoor_walking", duration: 36, distance_km: 3.2, avg_hr: 130, max_hr: 143, calories: 139 },
    { type: "outdoor_walking", duration: 52, distance_km: 4.4, avg_hr: 122, max_hr: 160, calories: 236 }
  ],
  "2026-08-23": [{ type: "outdoor_walking", duration: 67, distance_km: 6.2, avg_hr: 115, max_hr: 127, calories: 196 }],
  "2026-08-24": [
    { type: "badminton", duration: 89, avg_hr: 119, max_hr: 151, calories: 449 },
    { type: "outdoor_running", duration: 22, distance_km: 3.0, avg_hr: 189, max_hr: 202, calories: 128 }
  ],
  "2026-08-25": [{ type: "core_training", duration: 40, avg_hr: 106, max_hr: 153, calories: 205 }],
  "2026-08-27": [{ type: "badminton", duration: 64, avg_hr: 138, max_hr: 175, calories: 566 }],
  "2026-08-29": [
    { type: "outdoor_running", duration: 38, distance_km: 5.2, avg_hr: 182, max_hr: 195, calories: 216 },
    { type: "core_training", duration: 10, avg_hr: 110, max_hr: 136, calories: 51 }
  ],
  "2026-08-30": [
    { type: "badminton", duration: 138, avg_hr: 107, max_hr: 166, calories: 762 },
    { type: "outdoor_walking", duration: 58, distance_km: 5.2, avg_hr: 128, max_hr: 165, calories: 226 },
    { type: "core_training", duration: 32, avg_hr: 105, max_hr: 139, calories: 160 }
  ],
  "2026-09-01": [{ type: "outdoor_running", duration: 48, distance_km: 6.6, avg_hr: 191, max_hr: 202, calories: 291 }],
  "2026-09-02": [{ type: "badminton", duration: 120, avg_hr: 145, max_hr: 174, calories: 686 }],
  "2026-09-05": [{ type: "outdoor_walking", duration: 51, distance_km: 4.6, avg_hr: 120, max_hr: 150, calories: 173 }]
};
const ACTUAL_TYPE_LABELS = { outdoor_running: "Run", outdoor_walking: "Walk", badminton: "Badminton", core_training: "Core" };

const DAILY_STEPS = [
  {"date":"08-06","steps":14948},{"date":"08-07","steps":13748},{"date":"08-08","steps":3141},
  {"date":"08-09","steps":1742},{"date":"08-10","steps":34901},{"date":"08-11","steps":29482},
  {"date":"08-12","steps":15455},{"date":"08-13","steps":4879},{"date":"08-14","steps":9008},
  {"date":"08-15","steps":11218},{"date":"08-16","steps":13852},{"date":"08-17","steps":16312},
  {"date":"08-18","steps":14417},{"date":"08-19","steps":19067},{"date":"08-20","steps":19023},
  {"date":"08-21","steps":28023},{"date":"08-22","steps":28910},{"date":"08-23","steps":25802},
  {"date":"08-24","steps":27221},{"date":"08-25","steps":11876},{"date":"08-26","steps":25654},
  {"date":"08-27","steps":16319},{"date":"08-28","steps":15462},{"date":"08-29","steps":15728},
  {"date":"08-30","steps":29129},{"date":"08-31","steps":19365},{"date":"09-01","steps":26622},
  {"date":"09-02","steps":17227},{"date":"09-03","steps":12562},{"date":"09-04","steps":19140},
  {"date":"09-05","steps":15171}
];
const WEEKLY_BY_ACTIVITY = {
  labels: ["W32 (Aug3)", "W33 (Aug10)", "W34 (Aug17)", "W35 (Aug24)", "W36 (Aug31)"],
  running: [38, 74, 9, 60, 48],
  badminton: [0, 96, 120, 291, 120],
  walking: [0, 0, 258, 58, 51],
  core: [0, 0, 0, 82, 0]
};
const RUN_HR_HISTORY = [
  { date: "08-06", avg: 181, max: 192 }, { date: "08-10", avg: 187, max: 200 }, { date: "08-11", avg: 181, max: 192 },
  { date: "08-24", avg: 189, max: 202 }, { date: "08-29", avg: 182, max: 195 }, { date: "09-01", avg: 191, max: 202 }
];

// Everything Mi Fitness has on record before the plan's start date (Sept 6, 2026), for context —
// this is history, not scored against any plan day. Source: same Sept 5 pull as ACTUAL_WORKOUTS.
const PAST_ACTIVITIES = [
  { date: "2026-08-06", type: "outdoor_running", label: "Run", duration: 38, distance_km: 5.3, avg_hr: 181, max_hr: 192, calories: 244, source: "Mi Fitness" },
  { date: "2026-08-10", type: "outdoor_running", label: "Run", duration: 36, distance_km: 5.0, avg_hr: 187, max_hr: 200, calories: 213, source: "Mi Fitness" },
  { date: "2026-08-11", type: "outdoor_running", label: "Run", duration: 38, distance_km: 5.1, avg_hr: 181, max_hr: 192, calories: 221, source: "Mi Fitness" },
  { date: "2026-08-16", type: "badminton", label: "Badminton", duration: 96, avg_hr: 146, max_hr: 187, calories: 712, source: "Mi Fitness" },
  { date: "2026-08-18", type: "outdoor_running", label: "Run", duration: 9, distance_km: 1.0, avg_hr: 157, max_hr: 182, calories: 48, source: "Mi Fitness" },
  { date: "2026-08-19", type: "badminton", label: "Badminton", duration: 120, avg_hr: 145, max_hr: 181, calories: 717, source: "Mi Fitness" },
  { date: "2026-08-20", type: "outdoor_walking", label: "Walk", duration: 36, distance_km: 3.2, avg_hr: 120, max_hr: 143, calories: 113, source: "Mi Fitness" },
  { date: "2026-08-21", type: "outdoor_walking", label: "Walk", duration: 67, distance_km: 5.7, avg_hr: 122, max_hr: 149, calories: 205, source: "Mi Fitness" },
  { date: "2026-08-22", type: "outdoor_walking", label: "Walk", duration: 36, distance_km: 3.2, avg_hr: 130, max_hr: 143, calories: 139, source: "Mi Fitness" },
  { date: "2026-08-22", type: "outdoor_walking", label: "Walk", duration: 52, distance_km: 4.4, avg_hr: 122, max_hr: 160, calories: 236, source: "Mi Fitness" },
  { date: "2026-08-23", type: "outdoor_walking", label: "Walk", duration: 67, distance_km: 6.2, avg_hr: 115, max_hr: 127, calories: 196, source: "Mi Fitness" },
  { date: "2026-08-24", type: "badminton", label: "Badminton", duration: 89, avg_hr: 119, max_hr: 151, calories: 449, source: "Mi Fitness" },
  { date: "2026-08-24", type: "outdoor_running", label: "Run", duration: 22, distance_km: 3.0, avg_hr: 189, max_hr: 202, calories: 128, source: "Mi Fitness" },
  { date: "2026-08-25", type: "core_training", label: "Core", duration: 40, avg_hr: 106, max_hr: 153, calories: 205, source: "Mi Fitness" },
  { date: "2026-08-27", type: "badminton", label: "Badminton", duration: 64, avg_hr: 138, max_hr: 175, calories: 566, source: "Mi Fitness" },
  { date: "2026-08-29", type: "outdoor_running", label: "Run", duration: 38, distance_km: 5.2, avg_hr: 182, max_hr: 195, calories: 216, source: "Mi Fitness" },
  { date: "2026-08-29", type: "core_training", label: "Core", duration: 10, avg_hr: 110, max_hr: 136, calories: 51, source: "Mi Fitness" },
  { date: "2026-08-30", type: "badminton", label: "Badminton", duration: 138, avg_hr: 107, max_hr: 166, calories: 762, source: "Mi Fitness" },
  { date: "2026-08-30", type: "outdoor_walking", label: "Walk", duration: 58, distance_km: 5.2, avg_hr: 128, max_hr: 165, calories: 226, source: "Mi Fitness" },
  { date: "2026-08-30", type: "core_training", label: "Core", duration: 32, avg_hr: 105, max_hr: 139, calories: 160, source: "Mi Fitness" },
  { date: "2026-09-01", type: "outdoor_running", label: "Run", duration: 48, distance_km: 6.6, avg_hr: 191, max_hr: 202, calories: 291, source: "Mi Fitness" },
  { date: "2026-09-02", type: "badminton", label: "Badminton", duration: 120, avg_hr: 145, max_hr: 174, calories: 686, source: "Mi Fitness" },
  { date: "2026-09-05", type: "outdoor_walking", label: "Walk", duration: 51, distance_km: 4.6, avg_hr: 120, max_hr: 150, calories: 173, source: "Mi Fitness" },
  { date: "2026-09-05", type: "yoga", label: "Yoga / stretching (from video)", duration: 35, avg_hr: null, calories: null, note: "Followed a yoga/stretching video (youtu.be/FXhoN-ji79g).", source: "Manual" }
];

function dateForDay(wi, di) {
  const d = new Date(PLAN_START);
  d.setDate(d.getDate() + wi * 7 + di);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getActualWorkoutsFor(wi, di) {
  return ACTUAL_WORKOUTS[dateForDay(wi, di)] || [];
}

const weeks = [
  { label: "Week 1", date: "Sept 6", race: false, days: [
    {day:"Sun",type:"easy",detail:"5km Easy Run"}, {day:"Mon",type:"rest",detail:"Rest"}, {day:"Tue",type:"intervals",detail:"4km — 400m Repeats"},
    {day:"Wed",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Thu",type:"easy",detail:"5.5km Easy Run"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"hills",detail:"7km Hilly Long Run"} ]},
  { label: "Week 2", date: "Sept 13", race: false, days: [
    {day:"Sun",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"easy",detail:"4.5km Easy Run"},
    {day:"Wed",type:"easy",detail:"6.5km Easy Run"}, {day:"Thu",type:"upperbody",detail:"40–50m Upper Body"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"long",detail:"8km Progressive Long Run"} ]},
  { label: "Week 3", date: "Sept 20", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"intervals",detail:"4km Rolling 400s"},
    {day:"Wed",type:"rest",detail:"Rest"}, {day:"Thu",type:"easy",detail:"4km Easy Run"},
    {day:"Fri",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Sat",type:"long",detail:"5km Long Run"} ]},
  { label: "Week 4", date: "Sept 27", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"hills",detail:"5.6km Hill Repeats"},
    {day:"Wed",type:"rest",detail:"Rest"}, {day:"Thu",type:"easy",detail:"6.5km Easy Run"},
    {day:"Fri",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Sat",type:"hills",detail:"9km Hilly Progressive Long Run"} ]},
  { label: "Week 5", date: "Oct 4", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"rest",detail:"Rest"}, {day:"Tue",type:"tempo",detail:"7km Tempo 2-1-1"},
    {day:"Wed",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Thu",type:"easy",detail:"7km Easy Run"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"long",detail:"10km Long Run"} ]},
  { label: "Week 6", date: "Oct 11", race: false, days: [
    {day:"Sun",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"easy",detail:"7km Easy Run"},
    {day:"Wed",type:"easy",detail:"7.5km Easy Run"}, {day:"Thu",type:"upperbody",detail:"40–50m Upper Body"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"hills",detail:"12km Hilly Progressive Long Run"} ]},
  { label: "Week 7", date: "Oct 18", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"timetrial",detail:"6km — 5km Time Trial"},
    {day:"Wed",type:"rest",detail:"Rest"}, {day:"Thu",type:"easy",detail:"6km Easy Run"},
    {day:"Fri",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Sat",type:"long",detail:"7.5km Long Run"} ]},
  { label: "Week 8", date: "Oct 25", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"intervals",detail:"7.5km On/Off Ks"},
    {day:"Wed",type:"rest",detail:"Rest"}, {day:"Thu",type:"easy",detail:"7.5km Easy Run"},
    {day:"Fri",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Sat",type:"long",detail:"14km Progressive Long Run"} ]},
  { label: "Week 9", date: "Nov 1", race: false, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"rest",detail:"Rest"}, {day:"Tue",type:"intervals",detail:"9km — 1km Repeats"},
    {day:"Wed",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Thu",type:"easy",detail:"7.5km Easy Run"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"hills",detail:"13km Hilly Long Run"} ]},
  { label: "Week 10", date: "Nov 8", race: false, days: [
    {day:"Sun",type:"upperbody",detail:"40–50m Upper Body"}, {day:"Mon",type:"legscore",detail:"40–50m Legs & Core"}, {day:"Tue",type:"easy",detail:"6km Easy Run"},
    {day:"Wed",type:"easy",detail:"7.5km Easy Run"}, {day:"Thu",type:"upperbody",detail:"40–50m Upper Body"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"long",detail:"9km Progressive Long Run"} ]},
  { label: "Week 11", date: "Nov 15", race: true, days: [
    {day:"Sun",type:"rest",detail:"Rest"}, {day:"Mon",type:"easy",detail:"5km Easy Run"}, {day:"Tue",type:"legscore",detail:"40–50m Legs & Core"},
    {day:"Wed",type:"intervals",detail:"7km Taper 400s"}, {day:"Thu",type:"rest",detail:"Rest"},
    {day:"Fri",type:"rest",detail:"Rest"}, {day:"Sat",type:"race",detail:"10km Race — 21/11/2026"} ]},
];

function typeLabel(t) {
  return {rest:"Rest",easy:"Easy run",intervals:"Intervals",tempo:"Tempo",hills:"Hills",long:"Long run",timetrial:"Time trial",race:"Race",legscore:"Legs & core",upperbody:"Upper body"}[t] || t;
}

function renderWeeks() {
  const container = document.getElementById("weeksContainer");
  container.innerHTML = weeks.map((w, wi) => `
    <div class="week-block ${w.race ? 'race' : ''}" id="wb-${wi}">
      <div class="week-head" onclick="toggleWeek(${wi})">
        <span class="wname">${w.label}${w.race ? ' — RACE WEEK' : ''}</span>
        <span class="wdate">${w.date}</span>
      </div>
      <div class="week-body">
        ${w.days.map((d, di) => `
          <div class="day-row">
            <div class="day-name">${d.day}</div>
            <div>
              <p class="day-title" id="day-title-${wi}-${di}">${d.detail}</p>
              <span class="badge b-${d.type}" id="day-badge-${wi}-${di}">${typeLabel(d.type)}</span>
              <div id="actual-${wi}-${di}"></div>
              <button class="edit-day-btn" onclick="openActivityEditor(${wi},${di})">Log what I did</button>
              ${RUN_TYPES.includes(d.type) ? `<div class="abs-actions"><button class="quick-abs-btn" onclick="startGuidedSession('abs-5')">+ 5 min abs</button><button class="quick-abs-btn" onclick="startGuidedSession('abs-10')">+ 10 min abs</button></div>` : ""}
            </div>
            <input type="checkbox" id="done-${wi}-${di}" onchange="saveDone(${wi},${di})">
          </div>
        `).join("")}
        <div class="bad-picker">
          <label>Extra activities this week</label>
          <div id="activities-list-${wi}"></div>
          <div class="add-activity-row">
            <select id="act-type-${wi}">
              <option value="badminton">Badminton</option>
              <option value="hiking">Hiking</option>
              <option value="gym">Gym</option>
              <option value="swim">Swim</option>
              <option value="yoga">Yoga</option>
              <option value="walk">Walk</option>
              <option value="other">Other</option>
            </select>
            <select id="act-day-${wi}">
              ${DAY_LABELS.map(d => `<option value="${d}">${d}</option>`).join("")}
            </select>
          </div>
          <input type="text" id="act-details-${wi}" placeholder="Optional detail — e.g. 90 min, felt good" style="margin-top:6px;">
          <button class="action" style="margin-top:8px; width:100%;" onclick="addActivity(${wi})">+ Add activity</button>
        </div>
        <div class="bad-picker" style="margin-top:8px;">
          <label>How did this week feel?</label>
          <div class="bad-row" id="feel-row-${wi}">
            <button class="feel-btn" data-week="${wi}" data-feel="Easy" onclick="saveFeel(${wi},'Easy')">Easy</button>
            <button class="feel-btn" data-week="${wi}" data-feel="Right" onclick="saveFeel(${wi},'Right')">Right effort</button>
            <button class="feel-btn" data-week="${wi}" data-feel="Tough" onclick="saveFeel(${wi},'Tough')">Tough</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

async function renderActualDataForAllWeeks() {
  const doneMap = await getDoneMap();
  weeks.forEach(async (w, wi) => {
    w.days.forEach(async (d, di) => {
      const el = document.getElementById(`actual-${wi}-${di}`);
      if (!el) return;
      const outcome = await getDayOutcome(wi, di, doneMap);
      const linked = outcome.activities.flatMap(activity => activity.importedMetrics || []);
      const actuals = [...getActualWorkoutsFor(wi, di), ...linked];
      if (actuals.length === 0) { el.innerHTML = ""; return; }
      el.innerHTML = actuals.map(a => {
        const label = ACTUAL_TYPE_LABELS[a.type] || a.label || a.type;
        const isRun = a.type === "outdoor_running" || activityKind(label) === "run";
        const pacingFlag = isRun && a.max_hr && (a.avg_hr / a.max_hr) > 0.85
          ? `<div class="actual-flag">⚠ Avg HR was ${Math.round((a.avg_hr / a.max_hr) * 100)}% of peak — harder than an easy effort should be.</div>`
          : "";
        return `<div class="actual-data">
          <strong>Actual (${escapeHtml(a.source || "Mi Fitness")}):</strong> ${escapeHtml(label)} · ${a.duration ? `${Number(a.duration).toFixed(1)} min` : "duration unavailable"}${a.distance_km ? ` · ${Number(a.distance_km).toFixed(2)}km` : ""}${a.pace_min_per_km ? ` · ${Number(a.pace_min_per_km).toFixed(2)} min/km` : ""}${a.avg_hr ? ` · avg HR ${a.avg_hr}` : ""}${a.max_hr ? ` (peak ${a.max_hr})` : ""}${a.breathing_rate ? ` · ${a.breathing_rate} breaths/min` : ""}${a.calories ? ` · ${a.calories} kcal` : ""}${a.cadence ? ` · ${a.cadence} spm` : ""}
          ${pacingFlag}
        </div>`;
      }).join("");
    });
  });
}

function toggleWeek(i) {
  document.getElementById(`wb-${i}`).classList.toggle("open");
}

async function getActivityOverride(wi, di) {
  try {
    const result = await window.storage.get(`plan-override:${wi}:${di}`, false);
    return result && result.value ? JSON.parse(result.value) : null;
  } catch (e) { return null; }
}

function overrideActivities(override) {
  if (!override) return [];
  if (Array.isArray(override.activities)) return override.activities;
  return [override];
}

async function getDayOutcome(wi, di, doneMap) {
  const original = weeks[wi].days[di];
  const override = await getActivityOverride(wi, di);
  const activities = overrideActivities(override);
  const rest = Boolean(override && override.rest);
  const completed = rest || activities.length > 0 || (doneMap || await getDoneMap())[wi]?.[di];
  const distance = activities.reduce((sum, activity) => sum + (Number(activity.distance) || 0), 0);
  const minutes = activities.reduce((sum, activity) => sum + (Number(activity.minutes) || 0), 0);
  const effectiveTypes = activities.map(activity => activity.type);
  return { original, override, activities, rest, completed: Boolean(completed), distance, minutes, effectiveTypes };
}

async function openActivityEditor(wi, di) {
  const original = weeks[wi].days[di];
  const override = await getActivityOverride(wi, di);
  document.getElementById("editor-week").value = wi;
  document.getElementById("editor-day").value = di;
  const current = overrideActivities(override).slice(-1)[0];
  document.getElementById("editor-type").value = current?.type || original.type;
  document.getElementById("editor-detail").value = current?.detail || original.detail;
  document.getElementById("editor-minutes").value = current?.minutes || "";
  document.getElementById("editor-distance").value = current?.distance || parseKm(original.detail) || "";
  document.getElementById("editor-notes").value = current?.notes || "";
  document.getElementById("editor-video").value = current?.video || "";
  document.getElementById("editor-image").value = current?.image || "";
  document.getElementById("editor-rest").checked = Boolean(override?.rest);
  document.getElementById("activity-editor").hidden = false;
}

function closeActivityEditor() {
  document.getElementById("activity-editor").hidden = true;
}

async function saveActivityOverride(addAnother) {
  const wi = Number(document.getElementById("editor-week").value);
  const di = Number(document.getElementById("editor-day").value);
  const activity = {
    type: document.getElementById("editor-type").value,
    detail: document.getElementById("editor-detail").value.trim(),
    minutes: Number(document.getElementById("editor-minutes").value) || 0,
    distance: Number(document.getElementById("editor-distance").value) || 0,
    notes: document.getElementById("editor-notes").value.trim(),
    video: document.getElementById("editor-video").value.trim(),
    image: document.getElementById("editor-image").value.trim()
  };
  const existing = await getActivityOverride(wi, di);
  if (existing && !addAnother) await createLocalSafetySnapshot("replacing a planned activity");
  const activities = addAnother ? overrideActivities(existing).concat(activity) : [activity];
  const override = { activities, rest: document.getElementById("editor-rest").checked };
  await window.storage.set(`plan-override:${wi}:${di}`, JSON.stringify(override), false);
  await window.storage.set(`done:${wi}:${di}`, "1", false);
  const title = document.getElementById(`day-title-${wi}-${di}`);
  const badge = document.getElementById(`day-badge-${wi}-${di}`);
  const labels = activities.map(item => typeLabel(item.type));
  if (title) title.textContent = override.rest ? "Rest / recovery" : labels.join(" + ");
  if (badge) { badge.textContent = override.rest ? "Rest" : labels[0]; badge.className = `badge b-${override.rest ? "rest" : activities[0].type}`; }
  if (addAnother) {
    document.getElementById("editor-detail").value = "";
    document.getElementById("editor-minutes").value = "";
    document.getElementById("editor-distance").value = "";
    document.getElementById("editor-notes").value = "";
    document.getElementById("editor-video").value = "";
    document.getElementById("editor-image").value = "";
  } else {
    closeActivityEditor();
  }
  renderOverview();
}

const ACTIVITY_LABELS = { badminton: "Badminton", hiking: "Hiking", gym: "Gym", swim: "Swim", yoga: "Yoga", walk: "Walk", other: "Other" };
const ACTIVITY_BADGE_CLASS = { badminton: "b-badminton", hiking: "b-hiking" };

function activityBadgeClass(type) {
  return ACTIVITY_BADGE_CLASS[type] || "b-extra";
}

function dayIndex(wi, dayName) {
  return weeks[wi].days.findIndex(d => d.day === dayName);
}

async function getActivities(wi) {
  try {
    const res = await window.storage.get(`activities:week${wi}`, false);
    return res && res.value ? JSON.parse(res.value) : [];
  } catch (e) { return []; }
}

async function getSwaps(wi) {
  try {
    const res = await window.storage.get(`swaps:week${wi}`, false);
    return res && res.value ? JSON.parse(res.value) : [];
  } catch (e) { return []; }
}

async function saveActivities(wi, list) {
  await window.storage.set(`activities:week${wi}`, JSON.stringify(list), false);
}

async function saveSwaps(wi, list) {
  await window.storage.set(`swaps:week${wi}`, JSON.stringify(list), false);
}

async function addActivity(wi) {
  const type = document.getElementById(`act-type-${wi}`).value;
  const day = document.getElementById(`act-day-${wi}`).value;
  const details = document.getElementById(`act-details-${wi}`).value.trim();
  const list = await getActivities(wi);
  list.push({ id: `a${Date.now()}`, type, day, details });
  await saveActivities(wi, list);
  document.getElementById(`act-details-${wi}`).value = "";
  renderActivityList(wi);
  renderOverview();
}

async function removeActivity(wi, id) {
  await createLocalSafetySnapshot("deleting an extra activity");
  let list = await getActivities(wi);
  list = list.filter(a => a.id !== id);
  await saveActivities(wi, list);
  let swaps = await getSwaps(wi);
  const hadSwap = swaps.some(s => s.activityId === id);
  swaps = swaps.filter(s => s.activityId !== id);
  await saveSwaps(wi, swaps);
  if (hadSwap) applySwapsForWeek(wi);
  renderActivityList(wi);
}

async function moveSession(wi, activityId, fromDay, toDay, type, detail) {
  const swaps = await getSwaps(wi);
  swaps.push({ activityId, from: fromDay, to: toDay, type, detail });
  await saveSwaps(wi, swaps);
  applySwapsForWeek(wi);
  renderActivityList(wi);
}

function findFreeRestDay(wi, excludeDay) {
  const w = weeks[wi];
  const rest = w.days.find(d => d.type === "rest" && d.day !== excludeDay);
  return rest ? rest.day : null;
}

async function applySwapsForWeek(wi) {
  const w = weeks[wi];
  // reset to original first
  w.days.forEach((d, di) => {
    const titleEl = document.getElementById(`day-title-${wi}-${di}`);
    const badgeEl = document.getElementById(`day-badge-${wi}-${di}`);
    if (titleEl) titleEl.textContent = d.detail;
    if (badgeEl) { badgeEl.textContent = typeLabel(d.type); badgeEl.className = `badge b-${d.type}`; }
  });
  const swaps = await getSwaps(wi);
  const currentType = {}; // tracks the effective type shown per day index, after swaps
  w.days.forEach((d, di) => { currentType[di] = d.type; });
  swaps.forEach(s => {
    const fromIdx = dayIndex(wi, s.from);
    const toIdx = dayIndex(wi, s.to);
    if (fromIdx < 0 || toIdx < 0) return;
    const fromTitle = document.getElementById(`day-title-${wi}-${fromIdx}`);
    const fromBadge = document.getElementById(`day-badge-${wi}-${fromIdx}`);
    if (fromTitle) fromTitle.textContent = `Rest (moved to ${s.to})`;
    if (fromBadge) { fromBadge.textContent = "Rest"; fromBadge.className = "badge b-rest"; }
    currentType[fromIdx] = "rest";
    const toTitle = document.getElementById(`day-title-${wi}-${toIdx}`);
    const toBadge = document.getElementById(`day-badge-${wi}-${toIdx}`);
    if (toTitle) toTitle.textContent = `${s.detail} (moved from ${s.from})`;
    if (toBadge) { toBadge.textContent = typeLabel(s.type); toBadge.className = `badge b-${s.type}`; }
    currentType[toIdx] = s.type;
  });

  // Any day with a non-low-impact activity (badminton, hiking, gym, swim, other) shows that
  // instead of the scheduled session. Low-impact ones (walk, yoga) don't take over — they fit
  // alongside a real training day, so the session stays visible.
  const activities = await getActivities(wi);
  w.days.forEach((d, di) => {
    const dayActivities = activities.filter(a => a.day === d.day && !LOW_IMPACT_TYPES.includes(a.type));
    if (dayActivities.length === 0) return;
    const titleEl = document.getElementById(`day-title-${wi}-${di}`);
    const badgeEl = document.getElementById(`day-badge-${wi}-${di}`);
    const labels = dayActivities.map(a => ACTIVITY_LABELS[a.type] || a.type);
    const detailBits = dayActivities.filter(a => a.details).map(a => a.details);
    if (titleEl) titleEl.textContent = labels.join(" + ") + (detailBits.length ? ` — ${detailBits.join("; ")}` : "");
    if (badgeEl) { badgeEl.textContent = labels[0]; badgeEl.className = `badge ${activityBadgeClass(dayActivities[0].type)}`; }
  });

  const overrides = await Promise.all(w.days.map((_, di) => getActivityOverride(wi, di)));
  overrides.forEach((override, di) => {
    if (!override) return;
    const titleEl = document.getElementById(`day-title-${wi}-${di}`);
    const badgeEl = document.getElementById(`day-badge-${wi}-${di}`);
    const activities = overrideActivities(override);
    if (titleEl) titleEl.textContent = override.rest ? "Rest / recovery" : activities.map(activity => activity.detail || typeLabel(activity.type)).join(" + ");
    if (badgeEl) { badgeEl.textContent = override.rest ? "Rest" : typeLabel(activities[0]?.type || "other"); badgeEl.className = `badge b-${override.rest ? "rest" : (activities[0]?.type || "extra")}`; }
  });
}

const LOW_IMPACT_TYPES = ["walk", "yoga"];

async function renderActivityList(wi) {
  const w = weeks[wi];
  const list = await getActivities(wi);
  const swaps = await getSwaps(wi);
  const listEl = document.getElementById(`activities-list-${wi}`);
  if (list.length === 0) { listEl.innerHTML = '<p class="no-activities">No extra activities added yet.</p>'; return; }

  listEl.innerHTML = list.map(a => {
    const dayData = w.days.find(d => d.day === a.day);
    const existingSwap = swaps.find(s => s.activityId === a.id);
    let statusHtml = "";
    let moveBtnHtml = "";
    if (dayData) {
      if (LOW_IMPACT_TYPES.includes(a.type)) {
        statusHtml = `<div class="ok">✓ ${a.day} — low-impact enough to fit alongside anything, including ${typeLabel(dayData.type)}.</div>`;
      } else if (existingSwap) {
        statusHtml = `<div class="ok">✓ Moved ${existingSwap.type === "rest" ? "" : ""}${typeLabel(existingSwap.type)} to ${existingSwap.to} to make room.</div>`;
      } else if (dayData.type === "long" || dayData.type === "race") {
        statusHtml = `<div class="warn">⚠ ${a.day} is your ${typeLabel(dayData.type)} day — two big efforts same day. This one needs your call, not an auto-move.</div>`;
      } else if (AVOID_TYPES.includes(dayData.type)) {
        statusHtml = `<div class="warn">⚠ ${a.day} clashes with ${typeLabel(dayData.type)} — a hard run plus this is a lot in one day.</div>`;
      } else if (dayData.type === "legscore" || dayData.type === "upperbody") {
        const restDay = findFreeRestDay(wi, a.day);
        statusHtml = `<div class="warn">⚠ ${a.day} is your ${typeLabel(dayData.type)} day.</div>`;
        if (restDay) {
          moveBtnHtml = `<button class="move-btn" onclick="moveSession(${wi},'${a.id}','${a.day}','${restDay}','${dayData.type}','${dayData.detail.replace(/'/g, "\\'")}')">Move ${typeLabel(dayData.type)} to ${restDay} instead</button>`;
        }
      } else {
        statusHtml = `<div class="ok">✓ ${a.day} (${typeLabel(dayData.type)}) — fine to fit this in.</div>`;
      }
    }
    return `
      <div class="activity-row">
        <div class="activity-main">
          <span class="badge ${activityBadgeClass(a.type)}">${ACTIVITY_LABELS[a.type] || a.type}</span>
          <span class="activity-day">${a.day}</span>
          ${a.details ? `<div class="activity-detail">${a.details}</div>` : ""}
          ${a.type === "badminton" ? `<div class="abs-actions"><button class="quick-abs-btn" onclick="startGuidedSession('abs-5')">+ 5 min abs</button><button class="quick-abs-btn" onclick="startGuidedSession('abs-10')">+ 10 min abs</button></div>` : ""}
          ${statusHtml}
          ${moveBtnHtml}
        </div>
        <button class="activity-remove" onclick="removeActivity(${wi},'${a.id}')">×</button>
      </div>
    `;
  }).join("");
}

const SEED_ACTIVITIES = {
  0: [{ id: "seed1", type: "badminton", day: "Mon", details: "" }, { id: "seed2", type: "badminton", day: "Thu", details: "" }, { id: "seed3", type: "hiking", day: "Sat", details: "" }],
  1: [{ id: "seed4", type: "badminton", day: "Sun", details: "" }, { id: "seed5", type: "hiking", day: "Sat", details: "" }],
  3: [{ id: "seed6", type: "hiking", day: "Sat", details: "Tama river hiking" }],
};

async function loadActivities() {
  for (let wi = 0; wi < weeks.length; wi++) {
    const existing = await getActivities(wi);
    if (existing.length === 0 && SEED_ACTIVITIES[wi]) {
      await saveActivities(wi, SEED_ACTIVITIES[wi]);
    }
    await renderActivityList(wi);
    await applySwapsForWeek(wi);
  }
}

async function saveFeel(wi, feel) {
  try {
    await window.storage.set(`feel:week${wi}`, feel, false);
  } catch (e) { console.error(e); }
  markFeelSelected(wi, feel);
}

function markFeelSelected(wi, feel) {
  const row = document.getElementById(`feel-row-${wi}`);
  if (!row) return;
  row.querySelectorAll(".feel-btn").forEach(b => {
    b.classList.toggle("selected", b.dataset.feel === feel);
  });
}

async function loadFeel() {
  for (let wi = 0; wi < weeks.length; wi++) {
    try {
      const res = await window.storage.get(`feel:week${wi}`, false);
      if (res && res.value) markFeelSelected(wi, res.value);
    } catch (e) { /* no entry yet */ }
  }
}

async function getFeel(wi) {
  try {
    const res = await window.storage.get(`feel:week${wi}`, false);
    return res ? res.value : null;
  } catch (e) { return null; }
}

async function saveDone(wi, di) {
  const checked = document.getElementById(`done-${wi}-${di}`).checked;
  try {
    await window.storage.set(`done:${wi}:${di}`, checked ? "1" : "0", false);
  } catch (e) { console.error(e); }
  renderOverview();
}

async function loadDone() {
  for (let wi = 0; wi < weeks.length; wi++) {
    for (let di = 0; di < weeks[wi].days.length; di++) {
      try {
        const res = await window.storage.get(`done:${wi}:${di}`, false);
        if (res && res.value === "1") {
          const el = document.getElementById(`done-${wi}-${di}`);
          if (el) el.checked = true;
        }
      } catch (e) { /* not set yet */ }
    }
  }
}

async function getDoneMap() {
  const map = {};
  for (let wi = 0; wi < weeks.length; wi++) {
    map[wi] = [];
    for (let di = 0; di < weeks[wi].days.length; di++) {
      try {
        const res = await window.storage.get(`done:${wi}:${di}`, false);
        map[wi].push(res && res.value === "1");
      } catch (e) { map[wi].push(false); }
    }
  }
  return map;
}

async function getActivitiesForDay(wi, dayName) {
  const list = await getActivities(wi);
  return list.filter(a => a.day === dayName);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

async function getCustomWorkouts() {
  try {
    const list = await window.storage.list("custom-workout:", false);
    if (!list || !list.keys) return [];
    const entries = await Promise.all(list.keys.sort().reverse().map(key => window.storage.get(key, false)));
    return entries.filter(Boolean).map(entry => ({ key: entry.key, ...JSON.parse(entry.value) }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function getActualActivityTotals() {
  const totals = { Run: { minutes: 0, distance: 0 }, Badminton: { minutes: 0 }, Strength: { minutes: 0 }, Hiking: { minutes: 0 }, Yoga: { minutes: 0 }, Other: { minutes: 0 } };
  const custom = await getCustomWorkouts();
  custom.forEach(workout => {
    const type = totals[workout.type] ? workout.type : "Other";
    totals[type].minutes += Number(workout.minutes) || 0;
    totals[type].distance = (totals[type].distance || 0) + (Number(workout.distance) || 0);
  });
  const imported = await getImportedMiFitness();
  imported.forEach(workout => {
    const raw = String(workout.label || "").toLowerCase();
    const type = raw.includes("run") ? "Run" : raw.includes("badminton") ? "Badminton" : raw.includes("walk") ? "Other" : raw.includes("hiking") ? "Hiking" : raw.includes("yoga") ? "Yoga" : raw.includes("strength") || raw.includes("core") ? "Strength" : "Other";
    totals[type].minutes += Number(workout.duration) || 0;
    totals[type].distance = (totals[type].distance || 0) + (Number(workout.distance_km) || 0);
  });
  try {
    const list = await window.storage.list("plan-override:", false);
    const overrides = await Promise.all((list.keys || []).map(key => window.storage.get(key, false)));
    overrides.filter(Boolean).forEach(entry => {
      const override = JSON.parse(entry.value);
      overrideActivities(override).forEach(activity => {
        const type = activity.type === "easy" || RUN_TYPES.includes(activity.type) ? "Run" : activity.type === "legscore" || activity.type === "upperbody" ? "Strength" : ACTIVITY_LABELS[activity.type] || "Other";
        if (!totals[type]) totals[type] = { minutes: 0 };
        totals[type].minutes += Number(activity.minutes) || 0;
        totals[type].distance = (totals[type].distance || 0) + (Number(activity.distance) || 0);
      });
    });
  } catch (e) {
    console.error(e);
  }
  return totals;
}

async function saveCustomWorkout() {
  const date = document.getElementById("customWorkoutDate").value;
  const type = document.getElementById("customWorkoutType").value;
  const minutes = document.getElementById("customWorkoutMinutes").value;
  const distance = document.getElementById("customWorkoutDistance").value;
  const notes = document.getElementById("customWorkoutNotes").value.trim();
  const video = document.getElementById("customWorkoutVideo").value.trim();
  const image = document.getElementById("customWorkoutImage").value.trim();
  const tags = [...document.querySelectorAll(".tag-picker input:checked")].map(input => input.value);
  if (!date || !minutes) return;
  const editingKey = document.getElementById("customWorkoutEditingKey").value;
  const key = editingKey || `custom-workout:${Date.now()}`;
  await window.storage.set(key, JSON.stringify({
    date, type, minutes: Number(minutes), distance: distance ? Number(distance) : 0, notes, video, image,
    effort: Number(document.getElementById("customWorkoutEffort").value) || 0,
    heartRate: Number(document.getElementById("customWorkoutHeartRate").value) || 0,
    energy: Number(document.getElementById("customWorkoutEnergy").value) || 0,
    pain: document.getElementById("customWorkoutPain").value.trim(),
    tags
  }), false);
  document.getElementById("customWorkoutMinutes").value = "";
  document.getElementById("customWorkoutDistance").value = "";
  document.getElementById("customWorkoutNotes").value = "";
  document.getElementById("customWorkoutVideo").value = "";
  document.getElementById("customWorkoutImage").value = "";
  ["customWorkoutEffort", "customWorkoutHeartRate", "customWorkoutEnergy", "customWorkoutPain"].forEach(id => { document.getElementById(id).value = ""; });
  document.querySelectorAll(".tag-picker input").forEach(input => { input.checked = false; });
  cancelWorkoutEdit();
  await loadCustomWorkouts();
  renderOverview();
}

async function loadCustomWorkouts() {
  const el = document.getElementById("customWorkoutHistory");
  if (!el) return;
  const query = (document.getElementById("workoutSearch")?.value || "").toLowerCase();
  const filter = document.getElementById("workoutFilter")?.value || "";
  const workouts = (await getCustomWorkouts()).filter(workout => {
    const matchesText = `${workout.date} ${workout.type} ${workout.notes} ${workout.pain} ${(workout.tags || []).join(" ")}`.toLowerCase().includes(query);
    return matchesText && (!filter || workout.type === filter);
  });
  el.innerHTML = workouts.length ? workouts.slice(0, 12).map(workout => `
    <div class="log-entry">
      <span><strong>${escapeHtml(workout.date)}</strong> · ${escapeHtml(workout.type)} · ${workout.minutes} min${workout.distance ? ` · ${workout.distance} km` : ""}${workout.distance && workout.minutes ? ` · ${formatPace(workout.distance, workout.minutes)}/km` : ""}${workout.effort ? ` · RPE ${workout.effort}` : ""}${workout.heartRate ? ` · HR ${workout.heartRate}` : ""}${workout.importedMetrics?.length ? ` · <span class="entry-note">Mi Fitness linked: ${workout.importedMetrics.length} import${workout.importedMetrics.length === 1 ? "" : "s"}</span>` : ""}${workout.video ? ` · <a href="${escapeHtml(workout.video)}" target="_blank" rel="noreferrer">video</a>` : ""}${workout.image ? ` · <a href="${escapeHtml(workout.image)}" target="_blank" rel="noreferrer">image</a>` : ""}<br>${(workout.tags || []).map(tag => `<span class="saved-tag">${escapeHtml(tag)}</span>`).join("")}<span class="entry-note">${escapeHtml(workout.notes || workout.pain || "")}</span></span>
      <span class="entry-actions"><button class="text-button" onclick="editCustomWorkout('${escapeHtml(workout.key)}')">Edit</button><button class="text-button danger" onclick="deleteCustomWorkout('${escapeHtml(workout.key)}')">Delete</button></span>
    </div>
  `).join("") : '<p class="empty-note">Your custom workouts will appear here.</p>';
}

function formatPace(distance, minutes) {
  const pace = Number(minutes) / Number(distance);
  if (!Number.isFinite(pace) || pace <= 0) return "—";
  const totalSeconds = Math.round(pace * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

async function editCustomWorkout(key) {
  const workout = (await getCustomWorkouts()).find(item => item.key === key);
  if (!workout) return;
  document.getElementById("customWorkoutEditingKey").value = key;
  document.getElementById("customWorkoutDate").value = workout.date || "";
  document.getElementById("customWorkoutType").value = workout.type || "Other";
  document.getElementById("customWorkoutMinutes").value = workout.minutes || "";
  document.getElementById("customWorkoutDistance").value = workout.distance || "";
  document.getElementById("customWorkoutEffort").value = workout.effort || "";
  document.getElementById("customWorkoutHeartRate").value = workout.heartRate || "";
  document.getElementById("customWorkoutEnergy").value = workout.energy || "";
  document.getElementById("customWorkoutPain").value = workout.pain || "";
  document.querySelectorAll(".tag-picker input").forEach(input => { input.checked = (workout.tags || []).includes(input.value); });
  document.getElementById("customWorkoutNotes").value = workout.notes || "";
  document.getElementById("customWorkoutVideo").value = workout.video || "";
  document.getElementById("customWorkoutImage").value = workout.image || "";
  document.getElementById("saveWorkoutButton").textContent = "Update workout";
  document.getElementById("cancelWorkoutEdit").hidden = false;
  document.getElementById("customWorkoutDate").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteCustomWorkout(key) {
  if (!window.confirm("Delete this workout?")) return;
  await createLocalSafetySnapshot("deleting a workout");
  await window.storage.delete(key, false);
  await loadCustomWorkouts();
  renderOverview();
}

function cancelWorkoutEdit() {
  document.getElementById("customWorkoutEditingKey").value = "";
  document.getElementById("saveWorkoutButton").textContent = "Save workout";
  document.getElementById("cancelWorkoutEdit").hidden = true;
}

async function getImportedMiFitness() {
  try {
    const list = await window.storage.list("mi-fitness:", false);
    const entries = await Promise.all((list.keys || []).map(key => window.storage.get(key, false)));
    return entries.filter(Boolean).map(entry => ({ storageKey: entry.key, ...JSON.parse(entry.value) }));
  } catch (e) { return []; }
}

function activityKind(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("run") || text.includes("jog") || text.includes("walk")) return "run";
  if (text.includes("bike") || text.includes("cycle")) return "bike";
  if (text.includes("badminton")) return "badminton";
  if (text.includes("strength") || text.includes("core") || text.includes("gym")) return "strength";
  if (text.includes("hike")) return "hiking";
  if (text.includes("yoga") || text.includes("stretch")) return "yoga";
  return text.replace(/[^a-z]+/g, " ").trim();
}

function associationMetricSummary(activity) {
  return {
    source: activity.source || "Mi Fitness",
    activity_id: activity.activity_id || activity.storageKey,
    date: activity.date || null,
    label: activity.label || "Mi Fitness activity",
    duration: activity.duration || null,
    distance_km: activity.distance_km || null,
    pace_min_per_km: activity.pace_min_per_km || null,
    avg_hr: activity.avg_hr || null,
    max_hr: activity.max_hr || null,
    heart_rate_samples: activity.heart_rate_samples || [],
    breathing_rate: activity.breathing_rate || null,
    breathing_samples: activity.breathing_samples || [],
    calories: activity.calories || null,
    cadence: activity.cadence || null,
    elevation: activity.route?.elevation || [],
    route: activity.route || null
  };
}

async function getAssociationCandidates(activity) {
  const targetDate = activity.date || "";
  const targetKind = activityKind(activity.label);
  const targetDuration = Number(activity.duration) || 0;
  const targetDistance = Number(activity.distance_km) || 0;
  const candidates = [];
  const custom = await getCustomWorkouts();
  custom.forEach(workout => {
    const dateDiff = Math.abs((new Date(workout.date) - new Date(targetDate)) / 86400000);
    if (!Number.isFinite(dateDiff) || dateDiff > 1) return;
    const durationDiff = targetDuration && workout.minutes ? Math.abs(targetDuration - Number(workout.minutes)) : 30;
    const distanceDiff = targetDistance && workout.distance ? Math.abs(targetDistance - Number(workout.distance)) : 2;
    const score = (workout.date === targetDate ? 50 : 20) + (activityKind(workout.type) === targetKind ? 25 : 0) - Math.min(durationDiff, 30) - Math.min(distanceDiff * 5, 20);
    candidates.push({ id: `custom:${workout.key}`, label: `${workout.date} · ${workout.type} · ${workout.minutes} min${workout.distance ? ` · ${workout.distance} km` : ""}`, score, kind: "custom", key: workout.key });
  });
  weeks.forEach((week, wi) => week.days.forEach((day, di) => {
    const date = dateForDay(wi, di);
    const dateDiff = Math.abs((new Date(date) - new Date(targetDate)) / 86400000);
    if (!Number.isFinite(dateDiff) || dateDiff > 1) return;
    const distance = parseKm(day.detail);
    const score = (date === targetDate ? 50 : 20) + (activityKind(typeLabel(day.type)) === targetKind ? 25 : 0) - Math.min(Math.abs((targetDistance || distance) - distance) * 5, 20);
    candidates.push({ id: `plan:${wi}:${di}`, label: `${date} · ${typeLabel(day.type)} · ${day.detail}`, score, kind: "plan", wi, di });
  }));
  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

async function updateImportedActivity(activity, association) {
  const activityKey = activity.storageKey || `mi-fitness:${activity.activity_id}`;
  const current = await window.storage.get(activityKey, false);
  if (!current) throw new Error("Imported activity could not be found.");
  const updated = JSON.parse(current.value);
  updated.association = association;
  updated.associatedAt = new Date().toISOString();
  await window.storage.set(activityKey, JSON.stringify(updated), false);
}

async function associateImportedActivity(activityId, targetId) {
  const activity = (window.importedMiFitnessActivities || []).find(item => (item.activity_id || item.storageKey) === activityId);
  if (!activity || !targetId) return;
  await createLocalSafetySnapshot("linking imported activity metrics");
  const candidates = await getAssociationCandidates(activity);
  const target = candidates.find(candidate => candidate.id === targetId);
  if (!target) return;
  const metrics = associationMetricSummary(activity);
  const association = { targetId: target.id, targetLabel: target.label, targetKind: target.kind };
  await updateImportedActivity(activity, association);
  if (target.kind === "custom") {
    const current = await window.storage.get(target.key, false);
    if (current) {
      const workout = JSON.parse(current.value);
      workout.importedMetrics = [...(workout.importedMetrics || []).filter(item => item.activity_id !== metrics.activity_id), metrics];
      workout.importedSource = metrics.source;
      await window.storage.set(target.key, JSON.stringify(workout), false);
    }
  } else {
    const current = await getActivityOverride(target.wi, target.di);
    const activities = overrideActivities(current);
    const base = activities.length ? activities : [{ type: weeks[target.wi].days[target.di].type, detail: weeks[target.wi].days[target.di].detail }];
    base[base.length - 1].importedMetrics = [...(base[base.length - 1].importedMetrics || []).filter(item => item.activity_id !== metrics.activity_id), metrics];
    base[base.length - 1].importedSource = metrics.source;
    await window.storage.set(`plan-override:${target.wi}:${target.di}`, JSON.stringify({ activities: base, rest: Boolean(current?.rest) }), false);
  }
  await renderImportedMiFitness();
  await loadCustomWorkouts();
  renderWeeks();
  renderActualDataForAllWeeks();
}

async function renderImportedAssociations(imported) {
  const el = document.getElementById("miFitnessAssociations");
  if (!el) return;
  const pending = imported.filter(activity => !activity.association);
  if (!pending.length) { el.hidden = true; return; }
  const rows = await Promise.all(pending.map(async activity => {
    const id = activity.activity_id || activity.storageKey;
    const candidates = await getAssociationCandidates(activity);
    return `<div class="association-item"><div><strong>${escapeHtml(activity.date || "Date unavailable")} · ${escapeHtml(activity.label || "Activity")}</strong><span>${activity.duration ? `${Number(activity.duration).toFixed(1)} min` : "duration unavailable"}${activity.distance_km ? ` · ${Number(activity.distance_km).toFixed(2)} km` : ""}${activity.avg_hr ? ` · HR ${activity.avg_hr}/${activity.max_hr || "—"}` : ""} · ${escapeHtml(activity.source || "Mi Fitness")}</span></div><select data-association-id="${escapeHtml(id)}"><option value="">Choose a plan/manual activity…</option>${candidates.map(candidate => `<option value="${escapeHtml(candidate.id)}">${candidate.score > 45 ? "Suggested · " : ""}${escapeHtml(candidate.label)}</option>`).join("")}</select><button class="text-button" data-associate-id="${escapeHtml(id)}">Link</button></div>`;
  }));
  el.hidden = false;
  el.innerHTML = `<h3>Review imported activity links</h3><p class="empty-note">Choose a matching plan day or manual workout. Nothing is changed until you click Link; existing notes and activity fields are preserved.</p>${rows.join("")}`;
  el.querySelectorAll("[data-associate-id]").forEach(button => button.addEventListener("click", () => {
    const select = button.closest(".association-item")?.querySelector("select");
    if (select?.value) associateImportedActivity(button.dataset.associateId, select.value);
  }));
}

function xmlElements(node, name) {
  if (!node) return [];
  return [...node.getElementsByTagName("*")].filter(element => element.localName === name || element.tagName === name);
}

function xmlFirst(node, name) {
  return xmlElements(node, name)[0] || null;
}

function xmlText(node, name) {
  return xmlFirst(node, name)?.textContent?.trim() || "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseActivityDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function formatActivityDate(value) {
  const parsed = parseActivityDate(value);
  return parsed ? parsed.slice(0, 10) : "";
}

function haversineKm(first, second) {
  if (!first || !second) return 0;
  const radians = value => value * Math.PI / 180;
  const lat = radians(second.lat - first.lat);
  const lon = radians(second.lon - first.lon);
  const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeStats(points) {
  const valid = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  let distance = 0;
  for (let index = 1; index < valid.length; index++) distance += haversineKm(valid[index - 1], valid[index]);
  const times = valid.map(point => new Date(point.time).getTime()).filter(Number.isFinite);
  const duration = times.length > 1 ? Math.max(0, (Math.max(...times) - Math.min(...times)) / 60000) : null;
  return {
    points: valid.length,
    path: valid.map(point => ({ lat: point.lat, lon: point.lon })),
    elevation: valid.map(point => point.elevation).filter(Number.isFinite),
    distance_km: distance || null,
    duration: duration || null,
    start_time: times.length ? new Date(Math.min(...times)).toISOString() : "",
    end_time: times.length ? new Date(Math.max(...times)).toISOString() : ""
  };
}

let selectedRouteIds = new Set();

function routeColor(index) {
  return ["#862C4D", "#507555", "#B25074", "#817F3E", "#E18079", "#503447"][index % 6];
}

function routeFiltersMatch(activity, prefix = "") {
  const type = document.getElementById(prefix ? `${prefix}RouteTypeFilter` : "routeTypeFilter")?.value || "";
  const date = document.getElementById(prefix ? `${prefix}RouteDateFilter` : "routeDateFilter")?.value || "";
  return (!type || activity.label === type) && (!date || activity.date === date);
}

function renderRouteMap(prefix = "") {
  const panel = document.getElementById(prefix ? `${prefix}RouteView` : "miFitnessRoutes");
  const checklist = document.getElementById(prefix ? `${prefix}RouteChecklist` : "routeChecklist");
  const map = document.getElementById(prefix ? `${prefix}RouteMap` : "routeMap");
  const analysis = document.getElementById(prefix ? `${prefix}RouteAnalysis` : "routeAnalysis");
  if (!panel || !checklist || !map || !analysis) return;
  const routes = window.importedMiFitnessRoutes || [];
  const imported = window.importedMiFitnessActivities || [];
  const filtered = routes.filter(route => routeFiltersMatch(route, prefix));
  if (!prefix) panel.hidden = imported.length === 0;
  if (!routes.length) {
    checklist.innerHTML = '<p class="empty-note">No imported activity contains GPS route points yet.</p>';
    map.innerHTML = '<p class="empty-note">No GPS data available for an interactive route preview.</p>';
    analysis.innerHTML = "";
    return;
  }
  const availableIds = new Set(filtered.map(route => route.activity_id));
  selectedRouteIds = new Set([...selectedRouteIds].filter(id => availableIds.has(id)));
  if (!selectedRouteIds.size && filtered.length) selectedRouteIds.add(filtered[0].activity_id);
  checklist.innerHTML = filtered.length ? filtered.map((route, index) =>
    `<label class="route-check"><input type="checkbox" data-route-id="${escapeHtml(route.activity_id)}" ${selectedRouteIds.has(route.activity_id) ? "checked" : ""}> <span style="color:${routeColor(index)}">●</span> ${escapeHtml(route.date || "Date unavailable")} · ${escapeHtml(route.label)} · ${route.distance_km ? `${Number(route.distance_km).toFixed(2)} km` : "distance unavailable"}</label>`
  ).join("") : '<p class="empty-note">No routes match these filters.</p>';
  checklist.querySelectorAll("input[data-route-id]").forEach(input => input.addEventListener("change", () => {
    if (input.checked) selectedRouteIds.add(input.dataset.routeId); else selectedRouteIds.delete(input.dataset.routeId);
    renderRouteMap(prefix);
  }));
  const selected = filtered.filter(route => selectedRouteIds.has(route.activity_id) && route.route?.path?.length > 1);
  const allPoints = selected.flatMap(route => route.route.path);
  if (!allPoints.length) {
    map.innerHTML = '<p class="empty-note">Selected activities do not contain GPS route points.</p>';
    analysis.innerHTML = "";
    return;
  }
  const minLat = Math.min(...allPoints.map(point => point.lat));
  const maxLat = Math.max(...allPoints.map(point => point.lat));
  const minLon = Math.min(...allPoints.map(point => point.lon));
  const maxLon = Math.max(...allPoints.map(point => point.lon));
  const latSpan = maxLat - minLat || 0.001;
  const lonSpan = maxLon - minLon || 0.001;
  const project = point => `${10 + ((point.lon - minLon) / lonSpan) * 480},${210 - ((point.lat - minLat) / latSpan) * 200}`;
  map.innerHTML = `<svg viewBox="0 0 500 220" preserveAspectRatio="xMidYMid meet">${selected.map((route, index) => `<path d="M ${route.route.path.map(project).join(" L ")}" stroke="${routeColor(index)}"></path>`).join("")}</svg>`;
  const totalDistance = selected.reduce((sum, route) => sum + (Number(route.distance_km) || 0), 0);
  const totalDuration = selected.reduce((sum, route) => sum + (Number(route.duration) || 0), 0);
  const paces = selected.filter(route => route.pace_min_per_km).map(route => route.pace_min_per_km);
  const elevations = selected.flatMap(route => route.route.elevation || []).filter(Number.isFinite);
  analysis.innerHTML = [
    ["Routes", selected.length],
    ["Distance", `${totalDistance.toFixed(2)} km`],
    ["Duration", `${totalDuration.toFixed(1)} min`],
    ["Avg pace", paces.length ? `${(paces.reduce((sum, pace) => sum + pace, 0) / paces.length).toFixed(2)} min/km` : "Unavailable"],
    ["Elevation", elevations.length ? `${(Math.max(...elevations) - Math.min(...elevations)).toFixed(0)} m gain range` : "Unavailable"]
  ].map(([label, value]) => `<div class="route-stat"><strong>${escapeHtml(value)}</strong><span>${label}</span></div>`).join("");
}

function metricAverage(values) {
  const numbers = values.map(Number).filter(value => Number.isFinite(value) && value > 0);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function parseTcxActivities(xml) {
  return xmlElements(xml, "Activity").map((activity, index) => {
    const laps = xmlElements(activity, "Lap");
    const points = xmlElements(activity, "Trackpoint").map(point => ({
      lat: Number(xmlText(point, "LatitudeDegrees")),
      lon: Number(xmlText(point, "LongitudeDegrees")),
      time: xmlText(point, "Time"),
      elevation: Number(xmlText(point, "AltitudeMeters"))
    }));
    const route = routeStats(points);
    const distance = numberOrNull(laps.reduce((sum, lap) => sum + (Number(xmlText(lap, "DistanceMeters")) || 0), 0) / 1000) || route.distance_km;
    const duration = numberOrNull(laps.reduce((sum, lap) => sum + (Number(xmlText(lap, "TotalTimeSeconds")) || 0), 0) / 60) || route.duration;
    const heartRates = xmlElements(activity, "HeartRateBpm").map(rate => Number(xmlText(rate, "Value"))).filter(value => value > 0);
    const breathingRates = xmlElements(activity, "RespirationRateBpm").concat(xmlElements(activity, "RespirationRate")).map(rate => Number(rate.textContent)).filter(value => value > 0);
    const firstLap = laps[0];
    return {
      source_activity_id: xmlText(activity, "Id") || `activity-${index + 1}`,
      date: formatActivityDate(xmlText(activity, "Id") || route.start_time),
      label: activity.getAttribute("Sport")?.replace(/_/g, " ") || "Mi Fitness activity",
      duration, distance_km: distance,
      avg_hr: numberOrNull(xmlText(firstLap, "AverageHeartRateBpm")) || metricAverage(heartRates),
      max_hr: numberOrNull(xmlText(firstLap, "MaximumHeartRateBpm")) || (heartRates.length ? Math.max(...heartRates) : null),
      heart_rate_samples: heartRates,
      breathing_rate: metricAverage(breathingRates),
      breathing_samples: breathingRates,
      calories: numberOrNull(laps.reduce((sum, lap) => sum + (Number(xmlText(lap, "Calories")) || 0), 0)),
      cadence: metricAverage(xmlElements(activity, "Cadence").map(element => element.textContent)),
      route
    };
  });
}

function parseGpxActivities(xml) {
  return xmlElements(xml, "trk").map((track, index) => {
    const points = xmlElements(track, "trkpt").map(point => ({
      lat: Number(point.getAttribute("lat")),
      lon: Number(point.getAttribute("lon")),
      time: xmlText(point, "time"),
      elevation: Number(xmlText(point, "ele")),
      breathingRate: Number(xmlText(point, "breathing_rate") || xmlText(point, "respiration")),
      heartRate: Number(xmlText(point, "hr")),
      cadence: Number(xmlText(point, "cad"))
    }));
    const route = routeStats(points);
    return {
      source_activity_id: xmlText(track, "name") || `track-${index + 1}`,
      date: formatActivityDate(xmlText(track, "time") || route.start_time),
      label: xmlText(track, "name") || "Mi Fitness activity",
      duration: route.duration,
      distance_km: route.distance_km,
      avg_hr: metricAverage(points.map(point => point.heartRate)),
      max_hr: Math.max(...points.map(point => point.heartRate).filter(value => value > 0)) || null,
      heart_rate_samples: points.map(point => point.heartRate).filter(value => value > 0),
      breathing_rate: metricAverage(points.map(point => point.breathingRate)),
      breathing_samples: points.map(point => point.breathingRate).filter(value => value > 0),
      calories: numberOrNull(xmlText(track, "calories")),
      cadence: metricAverage(points.map(point => point.cadence)),
      route
    };
  });
}

function parseKmlActivities(xml) {
  return xmlElements(xml, "Placemark").map((place, index) => {
    const extended = {};
    xmlElements(place, "Data").forEach(data => {
      const name = data.getAttribute("name");
      if (name) extended[name.toLowerCase()] = xmlText(data, "value");
    });
    const coordinates = (xmlText(place, "coordinates") || xmlElements(place, "coord").map(element => element.textContent).join(" "))
      .split(/\s+/).map(value => value.split(",")).filter(value => value.length >= 2).map(value => ({ lon: Number(value[0]), lat: Number(value[1]), elevation: Number(value[2]) }));
    const when = xmlElements(place, "when").map(element => element.textContent.trim());
    const points = coordinates.map((point, pointIndex) => ({ ...point, time: when[pointIndex] || when[0] || "" }));
    const route = routeStats(points);
    return {
      source_activity_id: xmlText(place, "name") || `placemark-${index + 1}`,
      date: formatActivityDate(when[0] || xmlText(place, "begin")),
      label: xmlText(place, "name") || "Mi Fitness route",
      duration: route.duration,
      distance_km: route.distance_km,
      avg_hr: numberOrNull(extended.heartrate || extended.avg_hr) || numberOrNull(xmlText(place, "heartRate")) || numberOrNull(xmlText(place, "avg_hr")),
      max_hr: numberOrNull(extended.maxheartrate || extended.max_hr) || numberOrNull(xmlText(place, "maxHeartRate")) || numberOrNull(xmlText(place, "max_hr")),
      calories: numberOrNull(extended.calories) || numberOrNull(xmlText(place, "calories")),
      cadence: numberOrNull(extended.cadence) || numberOrNull(xmlText(place, "cadence")),
      route
    };
  }).filter(activity => activity.distance_km || activity.date || activity.label !== "Mi Fitness route");
}

async function fileIdentifier(file) {
  const bytes = await file.arrayBuffer();
  if (window.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function activityIdentifier(fileId, activity, index) {
  return `${fileId}:${activity.source_activity_id || activity.date || "activity"}:${index}`;
}

async function saveParsedMiFitnessActivities(activities, file, format) {
  const fileId = await fileIdentifier(file);
  const existing = await getImportedMiFitness();
  const existingIds = new Set(existing.map(activity => activity.activity_id).filter(Boolean));
  let imported = 0;
  let skipped = 0;
  let missing = new Set();
  for (const [index, activity] of activities.entries()) {
    const activityId = activityIdentifier(fileId, activity, index);
    if (existingIds.has(activityId)) { skipped++; continue; }
    const workout = {
      ...activity,
      activity_id: activityId,
      source_file_id: fileId,
      source_file: file.name,
      source: `${format.toUpperCase()} activity file`,
      pace_min_per_km: activity.duration && activity.distance_km ? activity.duration / activity.distance_km : null
    };
    ["date", "duration", "distance_km", "pace_min_per_km", "avg_hr", "max_hr", "calories", "cadence"].forEach(field => {
      if (workout[field] === null || workout[field] === "") missing.add(field);
    });
    await window.storage.set(`mi-fitness:file:${activityId}`, JSON.stringify(workout), false);
    imported++;
  }
  return { imported, skipped, missing: [...missing] };
}

async function importMiFitnessActivityFile(fileInputId = "miFitnessActivityFile", statusId = "miFitnessStatus") {
  const file = document.getElementById(fileInputId)?.files[0];
  const status = document.getElementById(statusId);
  if (!file) { status.textContent = "Choose a TCX, GPX, or KML activity file first."; return; }
  const format = file.name.split(".").pop().toLowerCase();
  try {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("The activity file is not valid XML.");
    const activities = format === "tcx" ? parseTcxActivities(xml) : format === "gpx" ? parseGpxActivities(xml) : format === "kml" ? parseKmlActivities(xml) : [];
    if (!activities.length) throw new Error(`No ${format.toUpperCase()} activities or routes were found.`);
    await createLocalSafetySnapshot(`importing ${format.toUpperCase()} activity data`);
    const result = await saveParsedMiFitnessActivities(activities, file, format);
    const missingText = result.missing.length ? ` Unavailable in this file: ${result.missing.join(", ")}.` : "";
    status.textContent = `${result.imported} ${format.toUpperCase()} activit${result.imported === 1 ? "y" : "ies"} imported${result.skipped ? `; ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : ""}.${missingText}`;
    await renderImportedMiFitness();
    await renderOverview();
  } catch (error) {
    status.textContent = `Could not import that ${format.toUpperCase()} file. ${error.message}`;
    console.error(error);
  }
}

async function importMiFitnessBackup() {
  const file = document.getElementById("miFitnessFile").files[0];
  const status = document.getElementById("miFitnessStatus");
  if (!file) { status.textContent = "Choose a JSON backup first."; return; }
  try {
    const parsed = JSON.parse(await file.text());
    const source = Array.isArray(parsed) ? parsed : (parsed.workouts || parsed.activities || parsed.data || []);
    if (!Array.isArray(source) || source.length === 0) throw new Error("No workout array found");
    await createLocalSafetySnapshot("importing Mi Fitness data");
    let imported = 0;
    for (const item of source) {
      const date = item.date || item.startTime || item.start_time || item.start;
      const type = item.type || item.activityType || item.name || "Mi Fitness activity";
      if (!date) continue;
      const workout = {
        activity_id: item.activity_id || item.workout_id || `${date}:${type}:${item.startTime || item.start_time || ""}`,
        date: String(date).slice(0, 10),
        label: String(type).replace(/_/g, " "),
        duration: Number(item.duration || item.durationMinutes || item.duration_min || 0),
        distance_km: Number(item.distance_km || item.distance || 0) || null,
        pace_min_per_km: Number(item.pace_min_per_km || item.pace || 0) || null,
        avg_hr: Number(item.avg_hr || item.averageHeartRate || item.avgHeartRate || 0) || null,
        max_hr: Number(item.max_hr || item.maxHeartRate || 0) || null,
        heart_rate_samples: item.heart_rate_samples || item.heartRateSamples || [],
        breathing_rate: Number(item.breathing_rate || item.breathingRate || item.respiratory_rate || item.respiratoryRate || item.avg_respiration || 0) || null,
        breathing_samples: item.breathing_samples || item.breathingSamples || [],
        calories: Number(item.calories || item.caloriesBurned || 0) || null,
        cadence: Number(item.cadence || 0) || null,
        source: "Mi Fitness import"
      };
      await window.storage.set(`mi-fitness:${workout.date}:${Date.now()}:${imported}`, JSON.stringify(workout), false);
      imported++;
    }

    status.textContent = `${imported} workout${imported === 1 ? "" : "s"} imported.`;
    renderImportedMiFitness();
  } catch (error) {
    status.textContent = "Could not read that file. Export a JSON workout backup and try again.";
    console.error(error);
  }
}

async function syncLocalMiFitness() {
  const status = document.getElementById("miFitnessStatus");
  status.textContent = "Connecting to the local Mi Fitness MCP...";
  try {
    const response = await fetch("http://localhost:3001/api/mi-fitness/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "Local bridge unavailable");
    const workouts = payload.workouts?.data?.workouts || payload.workouts?.workouts || [];
    await createLocalSafetySnapshot("syncing local Mi Fitness data");
    let imported = 0;
    for (const item of workouts) {
      const workout = {
        date: item.local_date || String(item.start_at || "").slice(0, 10),
        label: item.activity_type || item.sport_category || "Mi Fitness workout",
        duration: Number(item.duration_minutes) || 0,
        distance_km: item.distance_m ? Number(item.distance_m) / 1000 : null,
        avg_hr: Number(item.avg_heart_rate_bpm) || null,
        max_hr: Number(item.max_heart_rate_bpm) || null,
        breathing_rate: Number(item.breathing_rate || item.breathingRate || item.respiratory_rate || 0) || null,
        calories: Number(item.calories_kcal) || null,
        source: "Local Mi Fitness MCP",
        workout_id: item.workout_id || `${item.local_date}-${item.activity_type}-${item.start_at}`
      };
      if (!workout.date) continue;
      await window.storage.set(`mi-fitness:mcp:${workout.workout_id}`, JSON.stringify(workout), false);
      imported++;
    }
    status.textContent = `${imported} Mi Fitness workouts synced locally (${payload.startDate} to ${payload.endDate}).`;
    await renderImportedMiFitness();
    await renderOverview();
  } catch (error) {
    status.textContent = `Local Mi Fitness is unavailable. Your existing data is safe; use the JSON import above or start the backend with npm start. (${error.message})`;
  }
}

async function renderImportedMiFitness() {
  const imported = await getImportedMiFitness();
  window.importedMiFitnessActivities = imported;
  window.importedMiFitnessRoutes = imported.filter(workout => workout.route?.path?.length > 1);
  ["", "maps"].forEach(prefix => {
    const typeFilter = document.getElementById(prefix ? `${prefix}RouteTypeFilter` : "routeTypeFilter");
    if (typeFilter) {
      const currentType = typeFilter.value;
      const types = [...new Set(window.importedMiFitnessRoutes.map(route => route.label).filter(Boolean))].sort();
      typeFilter.innerHTML = '<option value="">All activities</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("");
      typeFilter.value = types.includes(currentType) ? currentType : "";
      typeFilter.onchange = () => renderRouteMap(prefix);
    }
    const dateFilter = document.getElementById(prefix ? `${prefix}RouteDateFilter` : "routeDateFilter");
    if (dateFilter) dateFilter.onchange = () => renderRouteMap(prefix);
  });
  const el = document.getElementById("miFitnessHistory");
  if (!el) return;
  el.innerHTML = imported.slice(-20).reverse().map(workout =>
    `<div class="past-activity-entry"><span class="pa-date">${escapeHtml(workout.date || "Date unavailable")}</span> — ${escapeHtml(workout.label)}${workout.duration ? ` · ${Number(workout.duration).toFixed(1)} min` : ""}${workout.distance_km ? ` · ${Number(workout.distance_km).toFixed(2)} km` : ""}${workout.pace_min_per_km ? ` · ${formatPace(workout.distance_km, workout.duration)}/km` : ""}${workout.avg_hr ? ` · avg HR ${workout.avg_hr}` : ""}${workout.max_hr ? ` · peak HR ${workout.max_hr}` : ""}${workout.calories ? ` · ${workout.calories} kcal` : ""}${workout.cadence ? ` · ${workout.cadence} spm` : ""}${workout.route?.points ? ` · route ${workout.route.points} pts` : ""} · <span style="color:var(--dim);">${escapeHtml(workout.source)}</span></div>`
  ).join("") || '<p class="no-activities">No imported workouts yet.</p>';
  await renderImportedAssociations(imported);
  renderRouteMap();
  renderRouteMap("maps");
}

async function saveJournalEntry() {
  const body = document.getElementById("journalBody").value.trim();
  if (!body) return;
  const entry = {
    date: document.getElementById("journalDate").value || new Date().toISOString().slice(0, 10),
    title: document.getElementById("journalTitle").value.trim() || "Untitled entry",
    mood: document.getElementById("journalMood").value.trim(),
    tags: document.getElementById("journalTags").value.trim(),
    body,
    video: document.getElementById("journalVideo").value.trim(),
    image: document.getElementById("journalImage").value.trim()
  };
  await window.storage.set(`journal:${Date.now()}`, JSON.stringify(entry), false);
  ["journalTitle", "journalMood", "journalTags", "journalBody", "journalVideo", "journalImage"].forEach(id => { document.getElementById(id).value = ""; });
  await renderJournalEntries();
}

async function getJournalEntries() {
  try {
    const list = await window.storage.list("journal:", false);
    const entries = await Promise.all((list.keys || []).sort().reverse().map(key => window.storage.get(key, false)));
    return entries.filter(Boolean).map(entry => JSON.parse(entry.value));
  } catch (e) { return []; }
}

async function renderJournalEntries() {
  const el = document.getElementById("journalEntries");
  if (!el) return;
  const query = (document.getElementById("journalSearch").value || "").toLowerCase();
  const entries = (await getJournalEntries()).filter(entry => `${entry.title} ${entry.body} ${entry.tags} ${entry.mood}`.toLowerCase().includes(query));
  el.innerHTML = entries.map(entry => `
    <article class="journal-entry">
      <div class="journal-entry-meta">${escapeHtml(entry.date)}${entry.mood ? ` · ${escapeHtml(entry.mood)}` : ""}</div>
      <h3>${escapeHtml(entry.title)}</h3>
      ${entry.tags ? `<div class="journal-tags">${escapeHtml(entry.tags)}</div>` : ""}
      <p>${escapeHtml(entry.body).replace(/\n/g, "<br>")}</p>
      <div class="journal-links">${entry.video ? `<a href="${escapeHtml(entry.video)}" target="_blank" rel="noreferrer">YouTube video</a>` : ""}${entry.image ? `<a href="${escapeHtml(entry.image)}" target="_blank" rel="noreferrer">Image</a>` : ""}</div>
    </article>
  `).join("") || '<p class="empty-note">No journal entries match your search.</p>';
}

async function getNutritionProfile() {
  try {
    const result = await window.storage.get("nutrition:profile", false);
    return JSON.parse(result.value);
  } catch (e) { return {}; }
}

async function saveNutritionProfile() {
  const profile = {
    weight: document.getElementById("nutritionWeight").value,
    height: document.getElementById("nutritionHeight").value,
    age: document.getElementById("nutritionAge").value,
    goal: document.getElementById("nutritionGoal").value,
    diet: document.getElementById("nutritionDiet").value.trim(),
    calories: document.getElementById("nutritionCalories").value
  };
  await window.storage.set("nutrition:profile", JSON.stringify(profile), false);
}

function nutritionDate() {
  return new Date().toISOString().slice(0, 10);
}

async function getFoodEntries() {
  try {
    const list = await window.storage.list(`food:${nutritionDate()}:`, false);
    const entries = await Promise.all((list.keys || []).sort().map(key => window.storage.get(key, false)));
    return entries.filter(Boolean).map(entry => JSON.parse(entry.value));
  } catch (e) { return []; }
}

async function saveFoodEntry() {
  const name = document.getElementById("foodName").value.trim();
  if (!name) return;
  const entry = {
    name,
    meal: document.getElementById("foodMeal").value,
    calories: Number(document.getElementById("foodCalories").value) || 0,
    protein: Number(document.getElementById("foodProtein").value) || 0,
    carbs: Number(document.getElementById("foodCarbs").value) || 0,
    fat: Number(document.getElementById("foodFat").value) || 0
  };
  await window.storage.set(`food:${nutritionDate()}:${Date.now()}`, JSON.stringify(entry), false);
  ["foodName", "foodCalories", "foodProtein", "foodCarbs", "foodFat"].forEach(id => { document.getElementById(id).value = ""; });
  await renderFoodLog();
}

async function renderFoodLog() {
  const entries = await getFoodEntries();
  const totals = entries.reduce((sum, entry) => ({
    calories: sum.calories + entry.calories, protein: sum.protein + entry.protein,
    carbs: sum.carbs + entry.carbs, fat: sum.fat + entry.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const profile = await getNutritionProfile();
  document.getElementById("nutritionTotals").innerHTML = `
    <div class="nutrition-total"><strong>${totals.calories}</strong><span>kcal${profile.calories ? ` / ${profile.calories}` : ""}</span></div>
    <div class="nutrition-total"><strong>${totals.protein.toFixed(1)}g</strong><span>protein</span></div>
    <div class="nutrition-total"><strong>${totals.carbs.toFixed(1)}g</strong><span>carbs</span></div>
    <div class="nutrition-total"><strong>${totals.fat.toFixed(1)}g</strong><span>fat</span></div>
  `;
  document.getElementById("foodHistory").innerHTML = entries.slice().reverse().map(entry =>
    `<div class="log-entry"><span>${escapeHtml(entry.meal)} · ${escapeHtml(entry.name)}</span><span class="val">${entry.calories} kcal</span></div>`
  ).join("") || '<p class="empty-note">Nothing logged today yet.</p>';
}

async function sendNutritionMessage() {
  const input = document.getElementById("nutritionChatInput");
  const message = input.value.trim();
  if (!message) return;
  const chat = document.getElementById("nutritionChatMessages");
  chat.insertAdjacentHTML("beforeend", `<div class="chat-message user">${escapeHtml(message)}</div>`);
  input.value = "";
  const entries = await getFoodEntries();
  const profile = await getNutritionProfile();
  const apiBase = window.TRAINING_API_BASE;
  if (!apiBase) {
    chat.insertAdjacentHTML("beforeend", '<div class="chat-message coach">Nutrition Coach needs a hosted backend before it can answer. Your food entries are saved locally for now.</div>');
    return;
  }
  try {
    const response = await fetch(`${apiBase}/api/nutrition/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, profile, foodLog: entries })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    chat.insertAdjacentHTML("beforeend", `<div class="chat-message coach">${escapeHtml(data.text).replace(/\n/g, "<br>")}</div>`);
  } catch (error) {
    chat.insertAdjacentHTML("beforeend", `<div class="chat-message coach">${escapeHtml(error.message)}</div>`);
  }
}

async function renderOverview() {
  const stats = document.getElementById("overviewStats");
  if (!stats) return;
  const doneMap = await getDoneMap();
  const outcomes = await Promise.all(weeks.flatMap((week, wi) => week.days.map((_, di) => getDayOutcome(wi, di, doneMap))));
  const planned = weeks.reduce((sum, week) => sum + week.days.filter(day => day.type !== "rest").length, 0);
  const completed = outcomes.filter(outcome => outcome.completed && outcome.original.type !== "rest").length;
  const actualTotals = await getActualActivityTotals();
  const completedKm = actualTotals.Run.distance;
  const plannedKm = weeks.reduce((sum, week) => sum + week.days.reduce((inner, day) => inner + (RUN_TYPES.includes(day.type) ? parseKm(day.detail) : 0), 0), 0);
  const extras = (await Promise.all(weeks.map((_, wi) => getActivities(wi)))).reduce((sum, list) => sum + list.length, 0);
  const percent = planned ? Math.round((completed / planned) * 100) : 0;
  const today = todayPosition();
  const next = today ? weeks[today.wi].days[today.di] : null;
  stats.innerHTML = `
    <div class="overview-stat"><strong>${completed}/${planned}</strong><span>sessions done</span></div>
    <div class="overview-stat"><strong>${completedKm.toFixed(1)} km</strong><span>completed running</span></div>
    <div class="overview-stat"><strong>${extras}</strong><span>extra activities</span></div>
  `;
  document.getElementById("overviewProgressBar").style.width = `${Math.min(percent, 100)}%`;
  document.getElementById("overviewGoalLabel").textContent = `${completed}/${planned} sessions`;
  document.getElementById("overviewKmLabel").textContent = `${completedKm.toFixed(1)} / ${plannedKm.toFixed(1)} km`;
  document.getElementById("overviewKmProgressBar").style.width = `${plannedKm ? Math.min((completedKm / plannedKm) * 100, 100) : 0}%`;
  document.getElementById("activityHours").innerHTML = Object.entries(actualTotals)
    .filter(([, value]) => value.minutes > 0)
    .map(([type, value]) => `<span><strong>${type === "Run" ? `${(value.distance || 0).toFixed(1)} km` : `${(value.minutes / 60).toFixed(1)} h`}</strong> ${type}</span>`)
    .join("");
  const todayBrief = document.getElementById("todayBrief");
  if (todayBrief) {
    const recent = (await getCustomWorkouts()).filter(w => w.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const hard = recent.filter(w => Number(w.effort) >= 8).length;
    const hasPain = recent.some(w => w.pain);
    const readiness = hasPain ? "Recovery first" : hard >= 2 ? "Keep the next session easy" : "Ready to build consistently";
    const detail = hasPain ? "You recorded discomfort recently. Choose rest or low-impact movement and avoid pushing through pain." : hard >= 2 ? `${hard} high-effort sessions were logged in the last 7 days. Protect the easy days and sleep.` : "Your recent load is manageable. Follow the next planned session and record effort so the guidance gets smarter.";
    todayBrief.innerHTML = `<strong>${readiness}</strong><span>${detail}</span>`;
  }
  document.getElementById("overviewMessage").textContent = next
    ? `Next up: ${next.detail}. ${percent}% of your planned training is complete.`
    : "Your plan is outside the current date range.";
}

async function getGoals() {
  try {
    const list = await window.storage.list("goal:", false);
    const entries = await Promise.all((list.keys || []).map(key => window.storage.get(key, false)));
    return entries.filter(Boolean).map(entry => ({ key: entry.key, ...JSON.parse(entry.value) }));
  } catch (e) { return []; }
}

async function saveGoal() {
  const name = document.getElementById("goalName").value.trim();
  const target = Number(document.getElementById("goalTarget").value);
  if (!name || !target) return;
  const goal = { name, metric: document.getElementById("goalMetric").value, target, deadline: document.getElementById("goalDeadline").value };
  await window.storage.set(`goal:${Date.now()}`, JSON.stringify(goal), false);
  document.getElementById("goalName").value = "";
  document.getElementById("goalTarget").value = "";
  renderGoals();
}

async function deleteGoal(key) {
  await createLocalSafetySnapshot("deleting a goal");
  await window.storage.delete(key, false);
  renderGoals();
}

async function getGoalProgress(goal) {
  const totals = await getActualActivityTotals();
  const doneMap = await getDoneMap();
  const outcomes = await Promise.all(weeks.flatMap((week, wi) => week.days.map((_, di) => getDayOutcome(wi, di, doneMap))));
  const custom = await getCustomWorkouts();
  let value = 0;
  if (goal.metric === "distance") value = totals.Run.distance;
  if (goal.metric === "minutes") value = Object.values(totals).reduce((s, v) => s + (v.minutes || 0), 0);
  if (goal.metric === "sessions") value = outcomes.filter(o => o.completed && o.original.type !== "rest").length;
  if (goal.metric === "longest") value = Math.max(0, ...custom.filter(w => w.type === "Run").map(w => Number(w.distance) || 0), ...outcomes.map(o => Number(o.distance) || 0));
  return value;
}

async function renderGoals() {
  const el = document.getElementById("goalsList");
  if (!el) return;
  const goals = await getGoals();
  if (!goals.length) { el.innerHTML = '<p class="empty-note">Add one or two measurable objectives to make the dashboard personal.</p>'; return; }
  const cards = await Promise.all(goals.map(async goal => {
    const value = await getGoalProgress(goal);
    const percent = Math.min(100, Math.round((value / goal.target) * 100));
    const deadline = goal.deadline ? ` · target ${escapeHtml(goal.deadline)}` : "";
    return `<div class="goal-card"><div class="goal-card-head"><div><p class="goal-status">${percent >= 100 ? "Achieved" : percent >= 70 ? "On track" : "Building"}</p><h3>${escapeHtml(goal.name)}</h3></div><button class="activity-remove" onclick="deleteGoal('${escapeHtml(goal.key)}')">×</button></div><div class="progress-label"><span>${value.toFixed(goal.metric === "sessions" ? 0 : 1)} / ${goal.target}${goal.metric === "distance" || goal.metric === "longest" ? " km" : goal.metric === "minutes" ? " min" : " sessions"}</span><strong>${percent}%${deadline}</strong></div><div class="goal-progress"><span style="width:${percent}%"></span></div></div>`;
  }));
  el.innerHTML = cards.join("");
}

function calendarDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const listEl = document.getElementById("timelineList");
  if (!grid) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  document.getElementById("calendarTitle").textContent = calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const custom = await getCustomWorkouts();
  const imported = await getImportedMiFitness();
  window.importedMiFitnessActivities = imported;
  const keys = new Set([...custom.map(w => w.date), ...imported.map(w => w.date).filter(Boolean)]);
  grid.innerHTML = DAY_LABELS.map(d => `<div class="calendar-weekday">${d}</div>`).join("") + Array.from({ length: firstDay }, () => '<div class="calendar-day empty"></div>').join("") + Array.from({ length: daysInMonth }, (_, i) => { const key = calendarDateKey(year, month, i + 1); return `<button class="calendar-day ${keys.has(key) ? "has-data" : ""}" onclick="showCalendarDay('${key}')"><strong>${i + 1}</strong>${keys.has(key) ? "<span>●</span>" : ""}</button>`; }).join("");
  const monthItems = [...custom.map(workout => ({ ...workout, calendarKind: "manual" })), ...imported.map(workout => ({ ...workout, calendarKind: "imported" }))]
    .filter(w => String(w.date || "").startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  listEl.innerHTML = monthItems.length ? monthItems.map(w => w.calendarKind === "imported"
    ? `<button class="timeline-item imported" data-imported-calendar-id="${escapeHtml(w.activity_id || w.storageKey)}"><strong>${escapeHtml(w.date)}</strong><span>${escapeHtml(w.label || "Mi Fitness activity")} · ${w.duration ? `${Number(w.duration).toFixed(1)} min` : "duration unavailable"}${w.distance_km ? ` · ${Number(w.distance_km).toFixed(2)} km` : ""} · <span class="source-tag">${escapeHtml(w.source || "Imported")}</span></span></button>`
    : `<div class="timeline-item"><strong>${escapeHtml(w.date)}</strong><span>${escapeHtml(w.type || "Activity")} · ${w.minutes || 0} min${w.distance ? ` · ${w.distance} km` : ""}</span></div>`
  ).join("") : '<p class="empty-note">No logged activities this month.</p>';
  listEl.querySelectorAll("[data-imported-calendar-id]").forEach(button => button.addEventListener("click", () => {
    showImportedCalendarActivity(button.dataset.importedCalendarId);
  }));
}

function routePreviewSvg(route) {
  const points = route?.path || [];
  if (points.length < 2) return "";
  const minLat = Math.min(...points.map(point => point.lat));
  const maxLat = Math.max(...points.map(point => point.lat));
  const minLon = Math.min(...points.map(point => point.lon));
  const maxLon = Math.max(...points.map(point => point.lon));
  const latSpan = maxLat - minLat || 0.001;
  const lonSpan = maxLon - minLon || 0.001;
  const project = point => `${8 + ((point.lon - minLon) / lonSpan) * 484},${165 - ((point.lat - minLat) / latSpan) * 150}`;
  return `<div class="calendar-route-preview"><svg viewBox="0 0 500 175" preserveAspectRatio="xMidYMid meet"><path d="M ${points.map(project).join(" L ")}"></path></svg></div>`;
}

function showImportedCalendarActivity(activityId) {
  const activity = (window.importedMiFitnessActivities || []).find(item => (item.activity_id || item.storageKey) === activityId);
  const details = document.getElementById("calendarActivityDetails");
  if (!activity || !details) return;
  const association = activity.association ? `${activity.association.targetLabel} (${activity.association.targetKind})` : "Not linked yet";
  details.hidden = false;
  details.innerHTML = `<h3>${escapeHtml(activity.date || "Date unavailable")} · ${escapeHtml(activity.label || "Imported activity")}</h3>
    <p class="metric-line"><strong>Source:</strong> ${escapeHtml(activity.source || "Imported file")} · <strong>Association:</strong> ${escapeHtml(association)}</p>
    <p class="metric-line"><strong>Metrics:</strong> ${activity.duration ? `${Number(activity.duration).toFixed(1)} min` : "duration unavailable"}${activity.distance_km ? ` · ${Number(activity.distance_km).toFixed(2)} km` : ""}${activity.pace_min_per_km ? ` · ${Number(activity.pace_min_per_km).toFixed(2)} min/km` : ""}${activity.avg_hr ? ` · avg HR ${activity.avg_hr}` : ""}${activity.max_hr ? ` · max HR ${activity.max_hr}` : ""}${activity.breathing_rate ? ` · ${activity.breathing_rate} breaths/min` : ""}${activity.calories ? ` · ${activity.calories} kcal` : ""}${activity.cadence ? ` · ${activity.cadence} spm` : ""}</p>
    <p class="metric-line"><strong>Route:</strong> ${activity.route?.points ? `${activity.route.points} GPS points` : "No GPS route in this file."}</p>${routePreviewSvg(activity.route)}`;
  details.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function shiftCalendar(amount) { calendarCursor.setMonth(calendarCursor.getMonth() + amount); renderCalendar(); }
function showCalendarDay(date) {
  calendarCursor = new Date(`${date}T00:00:00`);
  calendarCursor.setDate(1);
  renderCalendar();
  document.getElementById("timelineList").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function exportTrainingData() {
  const data = await collectTrainingData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `training-coach-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  document.getElementById("backupStatus").textContent = "Backup exported.";
  updateDataSafetyStatus("Portable backup downloaded.");
}

async function importTrainingData(fileInputId = "trainingBackupFile") {
  const file = document.getElementById(fileInputId)?.files[0];
  const status = document.getElementById("backupStatus");
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed.records) throw new Error("This is not a Training Coach backup.");
    await createLocalSafetySnapshot("importing a training backup");
    let count = 0;
    for (const values of Object.values(parsed.records)) for (const [key, value] of Object.entries(values)) { await window.storage.set(key, value, false); count++; }
    status.textContent = `Imported ${count} saved records. Refreshing views…`;
    await Promise.all([loadCustomWorkouts(), renderGoals(), renderCalendar(), renderOverview()]);
  } catch (e) { status.textContent = `Import failed: ${e.message}`; }
}

function openTodayReport() {
  document.querySelector('[data-panel="reports"]').click();
}

async function getAllWeights() {
  try {
    const list = await window.storage.list("weight:", false);
    if (!list || !list.keys) return [];
    const keys = list.keys.sort();
    const entries = await Promise.all(keys.map(k => window.storage.get(k, false)));
    return entries.filter(Boolean).map(e => JSON.parse(e.value));
  } catch (e) { return []; }
}

function todayPosition() {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((t0 - PLAN_START) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  const wi = Math.floor(diffDays / 7);
  const di = diffDays % 7;
  if (wi >= weeks.length) return null;
  return { wi, di };
}

async function renderDailyReport() {
  const pos = todayPosition();
  const card = document.getElementById("todayCard");
  if (!pos) {
    card.innerHTML = `<p class="dow">Today</p><p class="sesh">Outside the plan's date range.</p>`;
  } else {
    const w = weeks[pos.wi];
    const d = w.days[pos.di];
    const todaysActivities = await getActivitiesForDay(pos.wi, d.day);
    const replacingActivities = todaysActivities.filter(a => !LOW_IMPACT_TYPES.includes(a.type));
    const lowImpactActivities = todaysActivities.filter(a => LOW_IMPACT_TYPES.includes(a.type));
    const doneRes = await window.storage.get(`done:${pos.wi}:${pos.di}`, false).catch(() => null);
    const isDone = doneRes && doneRes.value === "1";
    const hasActivity = replacingActivities.length > 0;
    const displayTitle = hasActivity
      ? replacingActivities.map(a => ACTIVITY_LABELS[a.type] || a.type).join(" + ") + (replacingActivities.some(a => a.details) ? ` — ${replacingActivities.filter(a => a.details).map(a => a.details).join("; ")}` : "")
      : d.detail;
    const displayBadgeClass = hasActivity ? activityBadgeClass(replacingActivities[0].type) : `b-${d.type}`;
    const displayBadgeLabel = hasActivity ? (ACTIVITY_LABELS[replacingActivities[0].type] || replacingActivities[0].type) : typeLabel(d.type);
    const lowImpactBadges = lowImpactActivities.map(a => `<span class="badge ${activityBadgeClass(a.type)}" style="margin-left:6px;">+ ${ACTIVITY_LABELS[a.type] || a.type} today</span>`).join("");
    const clashNote = hasActivity && (d.type === "long" || d.type === "race")
      ? `<div class="warn" style="margin-top:8px;">⚠ Your ${typeLabel(d.type)} was also scheduled today — it's not shown above, but it hasn't gone away.</div>`
      : hasActivity && AVOID_TYPES.includes(d.type)
      ? `<div class="warn" style="margin-top:8px;">⚠ ${typeLabel(d.type)} was also scheduled today.</div>`
      : "";
    card.innerHTML = `
      <p class="dow">${w.label} · ${d.day} · ${new Date().toLocaleDateString()}</p>
      <p class="sesh">${displayTitle}</p>
      <span class="badge ${displayBadgeClass}">${displayBadgeLabel}</span>${lowImpactBadges}
      ${clashNote}
      <div>
        <button class="action" onclick="toggleTodayDone(${pos.wi},${pos.di})">${isDone ? '✓ Marked done' : 'Mark today done'}</button>
      </div>
    `;
  }

  const weights = (await getAllWeights()).slice(-10);
  destroyChart("dailyWeightChart");
  charts.dailyWeightChart = new Chart(document.getElementById("dailyWeightChart"), {
    type: "line",
    data: {
      labels: weights.map(w => w.date),
      datasets: [{ label: "Weight (kg)", data: weights.map(w => parseFloat(w.value)), borderColor: "#862C4D", backgroundColor: "rgba(134,44,77,0.12)", tension: 0.3, fill: true }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } },
        y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } }
      }
    }
  });
}

async function toggleTodayDone(wi, di) {
  const current = await window.storage.get(`done:${wi}:${di}`, false).catch(() => null);
  const newVal = current && current.value === "1" ? "0" : "1";
  await window.storage.set(`done:${wi}:${di}`, newVal, false);
  const el = document.getElementById(`done-${wi}-${di}`);
  if (el) el.checked = newVal === "1";
  renderDailyReport();
}

function populateWeekSelect() {
  const sel = document.getElementById("weekSelect");
  sel.innerHTML = weeks.map((w, i) => `<option value="${i}">${w.label} — ${w.date}</option>`).join("");
  const pos = todayPosition();
  sel.value = pos ? pos.wi : 0;
}

// Adapted from the coach skill's training-load model (TSS/CTL ramp-rate concept),
// simplified to relative load points since we don't have power/HR data.
const LOAD_POINTS = {
  rest: 0, easy: 3, legscore: 2, upperbody: 2, intervals: 5, tempo: 5,
  hills: 6, long: 7, timetrial: 6, race: 10,
  badminton: 2, hiking: 4, gym: 2, swim: 3, yoga: 1, walk: 1, other: 2
};

async function computeWeekLoad(wi) {
  const doneMap = await getDoneMap();
  const w = weeks[wi];
  const outcomes = await Promise.all(w.days.map((_, di) => getDayOutcome(wi, di, doneMap)));
  const runLoad = outcomes.reduce((sum, outcome) => {
    if (!outcome.completed || outcome.rest) return sum;
    return sum + (outcome.activities.length
      ? outcome.activities.reduce((inner, activity) => inner + (LOAD_POINTS[activity.type] || 2), 0)
      : (LOAD_POINTS[outcome.original.type] || 0));
  }, 0);
  const activities = await getActivities(wi);
  // Extra activities count toward load regardless of a "done" checkbox, since they're logged as happened.
  const activityLoad = activities.reduce((s, a) => s + (LOAD_POINTS[a.type] || 2), 0);
  return runLoad + activityLoad;
}

function buildCoachNote(completedCount, feel, wi, thisLoad, prevLoad) {
  const isLastWeek = wi === weeks.length - 1;
  let msg;
  const rampPct = (prevLoad && prevLoad > 0) ? Math.round(((thisLoad - prevLoad) / prevLoad) * 100) : null;
  const rampWarning = rampPct !== null && rampPct > 25;

  if (completedCount < 4) {
    msg = "Under half the week's sessions got done. Rather than pushing into next week's higher volume, repeat this week's distances again — consistency matters more than the calendar date.";
  } else if (feel === "Tough" && completedCount >= 4) {
    msg = "Sessions got done but felt tough. Keep next week's long run at the same distance instead of increasing it, and prioritize sleep and the easy days actually being easy.";
  } else if (isLastWeek) {
    msg = "Race week. Keep everything short and easy, trust the fitness you've built, and don't add anything new now — no new shoes, no new gels, no new distances.";
  } else if (rampWarning) {
    msg = `Your training load jumped about ${rampPct}% versus last week — steeper than the usual guideline of building gradually. If that's from extra activities stacking on top of the plan, consider trimming one this coming week rather than adding more.`;
  } else if (completedCount >= 6 && feel !== "Tough") {
    msg = "Strong week — on track to progress into next week as planned.";
  } else {
    msg = "Reasonable week overall. A missed session here or there is normal — continue into next week as planned.";
  }
  return `
    <h4>Coach note</h4>
    <p>${msg}</p>
    <p class="caveat">Rule-based on completion, load ramp vs. last week, and how you tagged the week — not personalized coaching or medical advice. If anything hurts (versus just feeling tired), rest and consider a physio rather than pushing through.</p>
  `;
}

async function renderWeeklyReport() {
  const wi = parseInt(document.getElementById("weekSelect").value, 10);
  const w = weeks[wi];
  const doneMap = await getDoneMap();
  const weekActivities = await getActivities(wi);
  const doneArr = doneMap[wi] || [];
  const outcomes = await Promise.all(w.days.map((_, di) => getDayOutcome(wi, di, doneMap)));
  const completedCount = outcomes.filter(outcome => outcome.completed && outcome.original.type !== "rest").length;
  const kmPlanned = w.days.filter(d => RUN_TYPES.includes(d.type)).reduce((s, d) => s + parseKm(d.detail), 0);
  const kmDone = outcomes.reduce((s, outcome) => s + (outcome.completed ? (outcome.distance || (RUN_TYPES.includes(outcome.original.type) ? parseKm(outcome.original.detail) : 0)) : 0), 0);
  const activityCount = weekActivities.length;
  const weekStart = dateForDay(wi, 0);
  const weekEnd = dateForDay(wi, 6);
  const weekCustom = (await getCustomWorkouts()).filter(workout => workout.date >= weekStart && workout.date <= weekEnd);
  const runEntries = weekCustom.filter(workout => workout.type === "Run" && Number(workout.distance) > 0 && Number(workout.minutes) > 0);
  const totalRunMinutes = runEntries.reduce((sum, workout) => sum + Number(workout.minutes), 0);
  const totalRunDistance = runEntries.reduce((sum, workout) => sum + Number(workout.distance), 0);
  const avgPace = totalRunDistance ? formatPace(totalRunDistance, totalRunMinutes) : "—";
  const hardSessions = weekCustom.filter(workout => Number(workout.effort) >= 8).length;
  const feel = await getFeel(wi);
  const thisLoad = await computeWeekLoad(wi);
  const prevLoad = wi > 0 ? await computeWeekLoad(wi - 1) : null;

  document.getElementById("weeklyStats").innerHTML = `
    <div class="stat-box"><div class="num">${completedCount}/7</div><div class="lbl">Sessions done</div></div>
    <div class="stat-box"><div class="num">${kmDone}/${kmPlanned}</div><div class="lbl">Km run</div></div>
    <div class="stat-box"><div class="num">${activityCount}</div><div class="lbl">Extra activities</div></div>
    <div class="stat-box"><div class="num">${thisLoad}${prevLoad !== null ? ` <span style="font-size:12px;color:var(--dim);">(prev ${prevLoad})</span>` : ""}</div><div class="lbl">Training load</div></div>
    <div class="stat-box"><div class="num">${avgPace}</div><div class="lbl">Avg run pace / km</div></div>
    <div class="stat-box"><div class="num">${hardSessions}</div><div class="lbl">High-effort sessions</div></div>
  `;

  document.getElementById("coachNote").innerHTML = buildCoachNote(completedCount, feel, wi, thisLoad, prevLoad);

  destroyChart("weeklyCompletionChart");
  charts.weeklyCompletionChart = new Chart(document.getElementById("weeklyCompletionChart"), {
    type: "bar",
    data: {
      labels: w.days.map(d => d.day),
      datasets: [{
        label: "Done",
        data: outcomes.map(outcome => outcome.completed ? 1 : 0),
        backgroundColor: outcomes.map(outcome => outcome.completed ? "#507555" : "rgba(80,52,71,0.14)")
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => outcomes[ctx.dataIndex].rest ? "Rest / recovery" : (outcomes[ctx.dataIndex].activities.map(activity => activity.detail || typeLabel(activity.type)).join(" + ") || w.days[ctx.dataIndex].detail) } } },
      scales: {
        x: { ticks: { color: CHART_TEXT }, grid: { display: false } },
        y: { ticks: { display: false }, grid: { color: CHART_GRID }, max: 1 }
      }
    }
  });
  const volumeLabels = weeks.slice(Math.max(0, wi - 5), wi + 1).map(item => item.label.replace("Week ", "W"));
  const volumeMinutes = [];
  const volumeLoad = [];
  for (let i = Math.max(0, wi - 5); i <= wi; i++) {
    const weekOutcomes = await Promise.all(weeks[i].days.map((_, di) => getDayOutcome(i, di, doneMap)));
    volumeMinutes.push(weekOutcomes.reduce((sum, o) => sum + (o.completed ? o.minutes : 0), 0));
    volumeLoad.push(await computeWeekLoad(i));
  }
  destroyChart("weeklyVolumeChart");
  charts.weeklyVolumeChart = new Chart(document.getElementById("weeklyVolumeChart"), {
    type: "line",
    data: { labels: volumeLabels, datasets: [
      { label: "Minutes", data: volumeMinutes, borderColor: "#862C4D", backgroundColor: "rgba(134,44,77,0.12)", fill: true, tension: 0.3 },
      { label: "Load points", data: volumeLoad, borderColor: "#507555", backgroundColor: "transparent", tension: 0.3, yAxisID: "load" }
    ] },
    options: { plugins: { legend: { labels: { color: CHART_TEXT } } }, scales: {
      x: { ticks: { color: CHART_TEXT }, grid: { display: false } },
      y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID }, title: { display: true, text: "minutes", color: CHART_TEXT } },
      load: { position: "right", ticks: { color: "#507555" }, grid: { display: false }, title: { display: true, text: "load", color: "#507555" } }
    } }
  });
}

async function saveReportToHistory() {
  const key = `physiology-report:${REPORT_GENERATED_DATE}`;
  const existing = await window.storage.get(key, false).catch(() => null);
  if (existing) return;
  const avgSteps = Math.round(DAILY_STEPS.reduce((s, d) => s + d.steps, 0) / DAILY_STEPS.length);
  const avgRunHr = Math.round(RUN_HR_HISTORY.reduce((s, r) => s + r.avg, 0) / RUN_HR_HISTORY.length);
  await window.storage.set(key, JSON.stringify({
    generatedDate: REPORT_GENERATED_DATE, avgSteps, avgRunHr,
    workoutCount: Object.values(ACTUAL_WORKOUTS).reduce((s, arr) => s + arr.length, 0)
  }), false);
}

async function renderReportHistory() {
  const el = document.getElementById("physHistory");
  try {
    const list = await window.storage.list("physiology-report:", false);
    if (!list || !list.keys || list.keys.length === 0) { el.innerHTML = '<p class="no-activities">No reports yet.</p>'; return; }
    const keys = list.keys.sort().reverse();
    const entries = await Promise.all(keys.map(k => window.storage.get(k, false)));
    el.innerHTML = entries.filter(Boolean).map(e => {
      const d = JSON.parse(e.value);
      return `<div class="phys-history-entry"><span>${d.generatedDate}</span><span>${d.workoutCount} workouts · avg ${d.avgSteps.toLocaleString()} steps/day · avg run HR ${d.avgRunHr}</span></div>`;
    }).join("");
  } catch (e) { el.innerHTML = '<p class="no-activities">No reports yet.</p>'; }
}

function renderPastActivity() {
  const el = document.getElementById("physPastActivity");
  const sorted = [...PAST_ACTIVITIES].sort((a, b) => a.date.localeCompare(b.date));
  el.innerHTML = sorted.map(a => {
    const distBit = a.distance_km ? ` · ${a.distance_km}km` : "";
    const hrBit = a.avg_hr ? ` · avg HR ${a.avg_hr}${a.max_hr ? ` (peak ${a.max_hr})` : ""}` : "";
    const breathingBit = a.breathing_rate ? ` · ${a.breathing_rate} breaths/min` : "";
    const calBit = a.calories ? ` · ${a.calories} kcal` : "";
    const noteBit = a.note ? ` <em>(${a.note})</em>` : "";
    return `<div class="past-activity-entry">
      <span class="pa-date">${a.date}</span> — ${a.label} · ${a.duration} min${distBit}${hrBit}${breathingBit}${calBit}
      <span style="color:var(--dim);"> · ${a.source}</span>${noteBit}
    </div>`;
  }).join("");
}

async function getBreathingHistory() {
  const seed = PAST_ACTIVITIES.filter(activity => activity.breathing_rate).map(activity => ({
    date: activity.date, label: activity.label, breathing_rate: activity.breathing_rate, avg_hr: activity.avg_hr
  }));
  const imported = (await getImportedMiFitness()).filter(activity => activity.breathing_rate).map(activity => ({
    date: activity.date, label: activity.label, breathing_rate: activity.breathing_rate, avg_hr: activity.avg_hr
  }));
  return [...seed, ...imported].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function breathingAdvice(history) {
  if (!history.length) {
    return `<h4>How to use breathing data</h4><p>No breathing-rate values were found in the current Mi Fitness data. If your export supports respiratory rate, import the workout JSON and the chart will appear. In the meantime, record whether you could speak in short sentences on easy runs.</p>`;
  }
  const recent = history.slice(-3);
  const average = Math.round(recent.reduce((sum, item) => sum + Number(item.breathing_rate), 0) / recent.length);
  const earlier = history.length > 3 ? history.slice(0, -3) : history;
  const baseline = Math.round(earlier.reduce((sum, item) => sum + Number(item.breathing_rate), 0) / earlier.length);
  const change = average - baseline;
  const direction = change <= -2 ? "lower" : change >= 2 ? "higher" : "similar";
  const suggestion = change <= -2
    ? "That can be a positive sign when pace and effort are comparable: keep most running conversational and progress distance gradually."
    : change >= 2
      ? "Treat this as a recovery signal, not a fitness failure. Repeat easy intensity, warm up longer, and check sleep, heat, hydration, and illness before adding load."
      : "The trend is broadly stable. Build breathing control with easy conversational running, relaxed shoulders, and a steady exhale rather than forcing a breathing pattern.";
  return `<h4>Breathing guidance</h4><p>Recent recorded breathing averaged <strong>${average} breaths/min</strong>, ${direction} than the earlier comparison (${baseline}). ${suggestion}</p><p class="empty-note">Compare similar activities at similar effort. Wearable respiratory estimates can be noisy and cannot diagnose breathing problems. Seek medical advice for chest pain, faintness, wheezing, or unusual shortness of breath.</p>`;
}

async function renderPhysiologyTab() {
  document.getElementById("physReportDate").textContent = `Report generated: ${REPORT_GENERATED_DATE}`;

  const avgSteps = Math.round(DAILY_STEPS.reduce((s, d) => s + d.steps, 0) / DAILY_STEPS.length);
  const totalWorkouts = Object.values(ACTUAL_WORKOUTS).reduce((s, arr) => s + arr.length, 0);
  const totalMinutes = Object.values(ACTUAL_WORKOUTS).reduce((s, arr) => s + arr.reduce((s2, a) => s2 + a.duration, 0), 0);
  const peakHr = Math.max(...Object.values(ACTUAL_WORKOUTS).flat().map(a => a.max_hr || 0));
  const breathingHistory = await getBreathingHistory();
  const recentHr = RUN_HR_HISTORY.slice(-3);
  const earlierHr = RUN_HR_HISTORY.slice(0, -3);
  const recentAvgHr = recentHr.length ? Math.round(recentHr.reduce((sum, item) => sum + item.avg, 0) / recentHr.length) : 0;
  const baselineAvgHr = earlierHr.length ? Math.round(earlierHr.reduce((sum, item) => sum + item.avg, 0) / earlierHr.length) : recentAvgHr;

  document.getElementById("physStats").innerHTML = `
    <div class="stat-box"><div class="num">${avgSteps.toLocaleString()}</div><div class="lbl">Avg daily steps</div></div>
    <div class="stat-box"><div class="num">${totalWorkouts}</div><div class="lbl">Workouts logged</div></div>
    <div class="stat-box"><div class="num">${(totalMinutes / 60).toFixed(1)}h</div><div class="lbl">Total training time</div></div>
    <div class="stat-box"><div class="num">${peakHr}</div><div class="lbl">Peak HR observed</div></div>
    <div class="stat-box"><div class="num">${breathingHistory.length ? `${Math.round(breathingHistory.slice(-3).reduce((s, a) => s + Number(a.breathing_rate), 0) / Math.min(3, breathingHistory.length))}` : "—"}</div><div class="lbl">Recent breaths/min</div></div>
  `;

  const physChartText = "#8A8A8A";
  const physChartGrid = "rgba(0,0,0,0.08)";

  destroyChart("physStepsChart");
  charts.physStepsChart = new Chart(document.getElementById("physStepsChart"), {
    type: "line",
    data: { labels: DAILY_STEPS.map(d => d.date), datasets: [{ label: "Steps", data: DAILY_STEPS.map(d => d.steps), borderColor: "#862C4D", backgroundColor: "rgba(134,44,77,0.08)", tension: 0.3, fill: true, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: physChartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } }, y: { ticks: { color: physChartText }, grid: { color: physChartGrid } } } }
  });

  destroyChart("physWeeklyChart");
  charts.physWeeklyChart = new Chart(document.getElementById("physWeeklyChart"), {
    type: "bar",
    data: {
      labels: WEEKLY_BY_ACTIVITY.labels,
      datasets: [
        { label: "Running", data: WEEKLY_BY_ACTIVITY.running, backgroundColor: "#862C4D" },
        { label: "Badminton", data: WEEKLY_BY_ACTIVITY.badminton, backgroundColor: "#E18079" },
        { label: "Walking", data: WEEKLY_BY_ACTIVITY.walking, backgroundColor: "#507555" },
        { label: "Core", data: WEEKLY_BY_ACTIVITY.core, backgroundColor: "#B385A2" }
      ]
    },
    options: { plugins: { legend: { labels: { color: physChartText, font: { size: 11 } } } }, scales: { x: { stacked: true, ticks: { color: physChartText }, grid: { display: false } }, y: { stacked: true, ticks: { color: physChartText }, grid: { color: physChartGrid }, title: { display: true, text: "minutes", color: physChartText } } } }
  });

  destroyChart("physHrChart");
  charts.physHrChart = new Chart(document.getElementById("physHrChart"), {
    type: "line",
    data: {
      labels: RUN_HR_HISTORY.map(r => r.date),
      datasets: [
        { label: "Avg HR", data: RUN_HR_HISTORY.map(r => r.avg), borderColor: "#862C4D", backgroundColor: "rgba(134,44,77,0.1)", fill: true, tension: 0.25 },
        { label: "Max HR", data: RUN_HR_HISTORY.map(r => r.max), borderColor: "#8A8A8A", backgroundColor: "transparent", borderDash: [4,3], tension: 0.25 },
        { label: "Easy zone (~140-155)", data: RUN_HR_HISTORY.map(() => 148), borderColor: "#507555", backgroundColor: "transparent", borderDash: [2,2], pointRadius: 0 }
      ]
    },
    options: { plugins: { legend: { labels: { color: physChartText, font: { size: 11 } } } }, scales: { x: { ticks: { color: physChartText }, grid: { display: false } }, y: { ticks: { color: physChartText }, grid: { color: physChartGrid }, min: 120, max: 210 } } }
  });

  destroyChart("physBreathingChart");
  charts.physBreathingChart = new Chart(document.getElementById("physBreathingChart"), {
    type: "line",
    data: {
      labels: breathingHistory.map(item => item.date),
      datasets: [{ label: "Breaths/min", data: breathingHistory.map(item => item.breathing_rate), borderColor: "#B25074", backgroundColor: "rgba(178,80,116,0.12)", fill: true, tension: 0.25, pointRadius: 3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: physChartText }, grid: { display: false } }, y: { ticks: { color: physChartText }, grid: { color: physChartGrid }, suggestedMin: 8, suggestedMax: 40, title: { display: true, text: "breaths/min", color: physChartText } } } }
  });

  const avgRunHr = Math.round(RUN_HR_HISTORY.reduce((s, r) => s + r.avg, 0) / RUN_HR_HISTORY.length);
  document.getElementById("physInsights").innerHTML = `
    <div class="insight-flag">
      <span class="tag">Worth fixing</span>
      <h3>Your "easy" runs aren't easy</h3>
      <p>Average heart rate across your real runs was <strong>${avgRunHr} bpm</strong> — peak observed anywhere in the data was ${peakHr} bpm. Recent runs average ${recentAvgHr} bpm versus ${baselineAvgHr} bpm earlier. Compare at similar pace and effort; slow down until you could hold a conversation, even if that means a slower pace than the plan implies.</p>
    </div>
    <div class="insight-normal">
      <span class="tag tag-watch">Watch this</span>
      <h3>Badminton volume ramped up fast</h3>
      <p>From 0 minutes to 291 minutes in a single week by Aug 24. If a week ever feels flat, badminton is the easiest thing to trim back — not the prescribed runs.</p>
    </div>
    <div class="insight-normal">
      <span class="tag tag-good">Working well</span>
      <h3>Walking is a solid recovery base</h3>
      <p>Consistently low HR (110-130 bpm) — genuine easy-effort recovery activity. No change needed.</p>
    </div>
  `;
  document.getElementById("breathingGuidance").innerHTML = breathingAdvice(breathingHistory);

  renderPastActivity();
  await saveReportToHistory();
  await renderReportHistory();
}

async function renderMonthlyReport() {
  const doneMap = await getDoneMap();
  const allActivities = await Promise.all(weeks.map((w, wi) => getActivities(wi)));
  const weights = await getAllWeights();

  const totalSessions = weeks.reduce((s, w) => s + w.days.length, 0);
  const totalDone = Object.values(doneMap).reduce((s, arr) => s + arr.filter(Boolean).length, 0);
  const totalKmDone = weeks.reduce((s, w, wi) => s + w.days.reduce((s2, d, di) => RUN_TYPES.includes(d.type) && doneMap[wi][di] ? s2 + parseKm(d.detail) : s2, 0), 0);
  const totalActivities = allActivities.reduce((s, arr) => s + arr.length, 0);

  document.getElementById("monthlyStats").innerHTML = `
    <div class="stat-box"><div class="num">${totalDone}/${totalSessions}</div><div class="lbl">Total sessions done</div></div>
    <div class="stat-box"><div class="num">${totalKmDone.toFixed(1)}</div><div class="lbl">Km run so far</div></div>
    <div class="stat-box"><div class="num">${totalActivities}</div><div class="lbl">Extra activities set</div></div>
  `;

  const weekLabels = weeks.map(w => w.label.replace("Week ", "W"));

  destroyChart("monthlyCompletionChart");
  charts.monthlyCompletionChart = new Chart(document.getElementById("monthlyCompletionChart"), {
    type: "bar",
    data: {
      labels: weekLabels,
      datasets: [{ label: "% complete", data: weeks.map((w, wi) => Math.round((doneMap[wi].filter(Boolean).length / w.days.length) * 100)), backgroundColor: "#862C4D" }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: CHART_TEXT }, grid: { display: false } }, y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID }, max: 100 } }
    }
  });

  destroyChart("monthlyKmChart");
  charts.monthlyKmChart = new Chart(document.getElementById("monthlyKmChart"), {
    type: "line",
    data: {
      labels: weekLabels,
      datasets: [
        { label: "Planned km", data: weeks.map(w => w.days.filter(d => RUN_TYPES.includes(d.type)).reduce((s, d) => s + parseKm(d.detail), 0)), borderColor: "#8A7A80", backgroundColor: "transparent", borderDash: [4,3], tension: 0.3 },
        { label: "Completed km", data: weeks.map((w, wi) => w.days.reduce((s, d, di) => RUN_TYPES.includes(d.type) && doneMap[wi][di] ? s + parseKm(d.detail) : s, 0)), borderColor: "#862C4D", backgroundColor: "rgba(134,44,77,0.12)", fill: true, tension: 0.3 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: CHART_TEXT } } },
      scales: { x: { ticks: { color: CHART_TEXT }, grid: { display: false } }, y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } } }
    }
  });

  destroyChart("monthlyBadmintonChart");
  charts.monthlyBadmintonChart = new Chart(document.getElementById("monthlyBadmintonChart"), {
    type: "bar",
    data: {
      labels: weekLabels,
      datasets: [{ label: "Activities", data: allActivities.map(arr => arr.length), backgroundColor: "#E18079" }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: CHART_TEXT }, grid: { display: false } }, y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID }, max: 3, ticks: { stepSize: 1, color: CHART_TEXT } } }
    }
  });

  destroyChart("monthlyWeightChart");
  charts.monthlyWeightChart = new Chart(document.getElementById("monthlyWeightChart"), {
    type: "line",
    data: {
      labels: weights.map(w => w.date),
      datasets: [{ label: "Weight (kg)", data: weights.map(w => parseFloat(w.value)), borderColor: "#B385A2", backgroundColor: "rgba(179,133,162,0.14)", tension: 0.3, fill: true }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: CHART_TEXT }, grid: { display: false } }, y: { ticks: { color: CHART_TEXT }, grid: { color: CHART_GRID } } }
    }
  });
}

document.querySelectorAll(".sub-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sub-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".report-view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
    if (btn.dataset.view === "weekly") renderWeeklyReport();
    if (btn.dataset.view === "monthly") renderMonthlyReport();
  });
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
    if (btn.dataset.panel === "reports") renderDailyReport();
    if (btn.dataset.panel === "goals") renderGoals();
    if (btn.dataset.panel === "calendar") renderCalendar();
    if (btn.dataset.panel === "physiology") { renderPhysiologyTab(); renderImportedMiFitness(); }
    if (btn.dataset.panel === "journal") renderJournalEntries();
    if (btn.dataset.panel === "nutrition") { renderFoodLog(); loadNutritionProfile(); }
  });

});

refreshDataSafetyStatus();

async function logWeight() {
  const val = document.getElementById("weightInput").value;
  if (!val) return;
  try {
    const key = "weight:" + Date.now();
    await window.storage.set(key, JSON.stringify({ value: val, date: new Date().toLocaleDateString() }), false);
    document.getElementById("weightInput").value = "";
    loadWeightHistory();
  } catch (e) { console.error(e); }
}

async function loadNutritionProfile() {
  const profile = await getNutritionProfile();
  ["weight", "height", "age", "goal", "diet", "calories"].forEach(key => {
    const el = document.getElementById(`nutrition${key[0].toUpperCase()}${key.slice(1)}`);
    if (el && profile[key]) el.value = profile[key];
  });
}
async function loadWeightHistory() {
  const el = document.getElementById("weightHistory");
  try {
    const list = await window.storage.list("weight:", false);
    if (!list || !list.keys || list.keys.length === 0) { el.innerHTML = '<p class="empty-note">No entries yet.</p>'; return; }
    const keys = list.keys.sort().reverse().slice(0, 8);
    const entries = await Promise.all(keys.map(k => window.storage.get(k, false)));
    el.innerHTML = entries.filter(Boolean).map(e => {
      const d = JSON.parse(e.value);
      return `<div class="log-entry"><span>${d.date}</span><span class="val">${d.value} kg</span></div>`;
    }).join("");
  } catch (e) { el.innerHTML = '<p class="empty-note">No entries yet.</p>'; }
}
async function logMeal() {
  const val = document.getElementById("mealInput").value.trim();
  if (!val) return;
  try {
    const key = "meal:" + Date.now();
    await window.storage.set(key, JSON.stringify({ text: val, date: new Date().toLocaleDateString() }), false);
    document.getElementById("mealInput").value = "";
    loadMealHistory();
  } catch (e) { console.error(e); }
}
async function loadMealHistory() {
  const el = document.getElementById("mealHistory");
  try {
    const list = await window.storage.list("meal:", false);
    if (!list || !list.keys || list.keys.length === 0) { el.innerHTML = '<p class="empty-note">No notes yet.</p>'; return; }
    const keys = list.keys.sort().reverse().slice(0, 6);
    const entries = await Promise.all(keys.map(k => window.storage.get(k, false)));
    el.innerHTML = entries.filter(Boolean).map(e => {
      const d = JSON.parse(e.value);
      return `<div class="log-entry"><span>${d.date}</span><span class="val">${d.text}</span></div>`;
    }).join("");
  } catch (e) { el.innerHTML = '<p class="empty-note">No notes yet.</p>'; }
}

function startGuidedSession(sessionKey) {
  guidedSession = GUIDED_SESSIONS[sessionKey];
  if (!guidedSession) return;
  openSessionPanel();
}

function openSessionPanel() {
  if (!guidedSession) return;
  document.getElementById("session-modal").hidden = true;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
  const panel = document.getElementById("session");
  panel.hidden = false;
  panel.classList.add("active");
  document.getElementById("sessionTitle").textContent = guidedSession.title;
  document.getElementById("sessionProgress").textContent = `${guidedSession.equipment}. Follow the cues, use the video links as a visual reference, and stop if you feel sharp pain.`;
  const intervalControls = document.getElementById("intervalControls");
  intervalControls.hidden = !guidedSession.interval;
  stopIntervalCircuit();
  sessionStartedAt = Date.now();
  clearInterval(sessionClockInterval);
  sessionClockInterval = setInterval(updateSessionClock, 1000);
  renderGuidedSession();
  updateSessionClock();
}

function renderGuidedSession() {
  const el = document.getElementById("sessionExerciseList");
  el.innerHTML = guidedSession.exercises.map((exercise, index) => {
    const [name, sets, reps, cue, search] = exercise;
    return `<article class="exercise-card"><div class="exercise-card-head"><div><span class="exercise-number">${index + 1}</span><h3>${escapeHtml(name)}</h3><p>${sets} sets · ${escapeHtml(reps)}</p></div><a class="video-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(search)}" target="_blank" rel="noreferrer">Watch explanation</a></div><p class="exercise-cue"><strong>Form cue:</strong> ${escapeHtml(cue)}</p><div class="set-tracker">${Array.from({ length: sets }, (_, setIndex) => `<label class="set-check"><input type="checkbox" onchange="updateSessionProgress()"><span>Set ${setIndex + 1}</span></label>`).join("")}</div><button class="text-button" onclick="startRestTimer(${sets > 2 ? 60 : 90})">Rest ${sets > 2 ? 60 : 90}s</button></article>`;
  }).join("");
  updateSessionProgress();
}

function startIntervalCircuit() {
  if (!guidedSession || !guidedSession.interval) return;
  stopIntervalCircuit();
  intervalState = { phase: "work", seconds: guidedSession.interval.work, exercise: 0, round: 1 };
  updateIntervalDisplay();
  intervalClockInterval = setInterval(tickIntervalCircuit, 1000);
}

function tickIntervalCircuit() {
  if (!intervalState || !guidedSession?.interval) return;
  intervalState.seconds -= 1;
  if (intervalState.seconds <= 0) {
    if (intervalState.phase === "work") {
      const nextExercise = intervalState.exercise + 1;
      if (nextExercise >= guidedSession.exercises.length) {
        if (intervalState.round >= guidedSession.interval.rounds) {
          stopIntervalCircuit();
          document.getElementById("intervalExerciseName").textContent = "Circuit complete";
          document.getElementById("intervalClock").textContent = "Done";
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
          return;
        }
        intervalState.round += 1;
        intervalState.exercise = 0;
      } else {
        intervalState.exercise = nextExercise;
      }
      intervalState.phase = "transition";
      intervalState.seconds = guidedSession.interval.transition;
    } else {
      intervalState.phase = "work";
      intervalState.seconds = guidedSession.interval.work;
    }
  }
  updateIntervalDisplay();
}

function updateIntervalDisplay() {
  if (!intervalState) return;
  const exercise = guidedSession.exercises[intervalState.exercise];
  document.getElementById("intervalExerciseName").textContent = `${intervalState.phase === "work" ? "Work" : "Transition"} · ${exercise[0]} · Round ${intervalState.round}/${guidedSession.interval.rounds}`;
  document.getElementById("intervalClock").textContent = formatTimer(intervalState.seconds);
}

function stopIntervalCircuit() {
  clearInterval(intervalClockInterval);
  intervalClockInterval = null;
  intervalState = null;
  const clock = document.getElementById("intervalClock");
  const name = document.getElementById("intervalExerciseName");
  if (clock) clock.textContent = "00:40";
  if (name) name.textContent = "Circuit ready";
}

function pauseIntervalCircuit() {
  clearInterval(intervalClockInterval);
  intervalClockInterval = null;
}

function updateSessionClock() {
  if (!sessionStartedAt) return;
  const seconds = Math.floor((Date.now() - sessionStartedAt) / 1000);
  document.getElementById("sessionElapsed").textContent = formatTimer(seconds);
}

function updateSessionProgress() {
  const checks = [...document.querySelectorAll("#sessionExerciseList input[type=checkbox]")];
  const completed = checks.filter(input => input.checked).length;
  document.getElementById("sessionCompleted").textContent = `${completed}/${checks.length}`;
  const totalExercises = guidedSession ? guidedSession.exercises.length : 0;
  const current = checks.findIndex(input => !input.checked);
  document.getElementById("sessionProgress").dataset.current = current >= 0 ? `Exercise ${Math.floor(current / 3) + 1} of ${totalExercises}` : "Session complete";
}

function formatTimer(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function startRestTimer(seconds) {
  clearInterval(restClockInterval);
  restSecondsRemaining = seconds;
  document.getElementById("restTimer").textContent = formatTimer(restSecondsRemaining);
  restClockInterval = setInterval(() => {
    restSecondsRemaining -= 1;
    document.getElementById("restTimer").textContent = formatTimer(restSecondsRemaining);
    if (restSecondsRemaining <= 0) {
      clearInterval(restClockInterval);
      document.getElementById("restTimer").textContent = "Ready";
      if ("vibrate" in navigator) navigator.vibrate([150, 80, 150]);
    }
  }, 1000);
}

function stopRestTimer() {
  clearInterval(restClockInterval);
  restSecondsRemaining = 0;
  document.getElementById("restTimer").textContent = "00:00";
}

function closeGuidedSession() {
  clearInterval(sessionClockInterval);
  clearInterval(restClockInterval);
  stopIntervalCircuit();
  sessionStartedAt = null;
  stopRestTimer();
  document.getElementById("session-modal").hidden = true;
  document.getElementById("session").classList.remove("active");
  document.getElementById("session").hidden = true;
  const strengthTab = document.querySelector('[data-panel="strength"]');
  if (strengthTab) strengthTab.click();
}

renderWeeks();
renderCountdown();
renderActualDataForAllWeeks();
document.getElementById("wb-0").classList.add("open");
document.getElementById("customWorkoutDate").value = new Date().toISOString().slice(0, 10);
document.getElementById("journalDate").value = new Date().toISOString().slice(0, 10);
renderOverview().catch(error => console.error("Initial dashboard render failed", error));
Promise.all([
  loadActivities(),
  loadDone(),
  loadFeel(),
  loadWeightHistory(),
  loadMealHistory(),
  loadCustomWorkouts(),
  renderImportedMiFitness(),
  renderJournalEntries(),
  loadNutritionProfile(),
  renderFoodLog()
]).then(() => Promise.all([
  renderOverview(),
  renderGoals(),
  renderCalendar()
])).catch(error => console.error("Training Coach initialization failed", error));
populateWeekSelect();
