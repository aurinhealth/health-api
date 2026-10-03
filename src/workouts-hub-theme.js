// Workouts hub (week overview, weather, weekly planner, info tips), compact
// capability cards, compact activity history and Intervals-style zone tables.
export const workoutsHubTheme = `
.info-tip{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:4px;padding:0;border:1px solid #5b6577;border-radius:50%;background:transparent;color:#c3cbd8;font:700 10px/1 Georgia,serif;font-style:italic;vertical-align:middle;cursor:pointer}
.info-tip:hover,.info-tip:focus-visible,.info-tip[aria-expanded="true"]{border-color:#b393ff;color:#fff;background:#3a2c5c;outline:none}
.section .info-tip{text-transform:none;letter-spacing:0}
#infoPop{position:fixed;z-index:60;max-width:min(340px,calc(100vw - 24px));padding:12px 14px;border:1px solid #4a3f66;border-radius:10px;background:#16131f;color:#e8e4f3;font-size:12px;line-height:1.5;box-shadow:0 14px 40px #000a}
#infoPop strong{display:block;margin-bottom:4px;font-size:13px;color:#fff}
#infoPop p{margin:0 0 6px}#infoPop p:last-child{margin:0}
.week-hub{margin-bottom:14px}
.week-hub-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
.week-hub-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#hubLocationForm{margin-bottom:12px}#hubLocationForm input{background:#0d1119;color:#fff;border:1px solid #393245;border-radius:9px;padding:8px;min-width:0}
.hub-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.hub-day{min-width:0;background:#0f141d;border:1px solid #262d39;border-radius:11px;padding:9px;display:flex;flex-direction:column;gap:6px}
.hub-day.today{border-color:#9b6bff;box-shadow:inset 0 0 0 1px rgba(155,107,255,.25)}
.hub-day.past{opacity:.86}
.hub-day-head{display:flex;justify-content:space-between;align-items:baseline;gap:4px}
.hub-day-head strong{font-size:12px;text-transform:capitalize}.hub-day-head span{font-size:11px;color:#9ca6b5}
.hub-weather{display:flex;align-items:center;gap:5px;font-size:11px;color:#c9d2de;min-height:18px}.hub-weather b{font-size:12px;color:#fff}
.hub-item{border-left:3px solid #4b5568;background:#151b26;border-radius:6px;padding:5px 7px;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.hub-item.done{border-left-color:#3fda9c}.hub-item.planned{border-left-color:#9b6bff}.hub-item.suggested{border-left-style:dashed;border-left-color:#6b7385;background:transparent;color:#aab3c1}
.hub-item .meta{display:block;color:#9ca6b5;font-size:10px}
.hub-item.editable{cursor:grab;position:relative}.hub-item.editable:hover,.hub-item.editable:focus-visible{background:#1b2232;outline:none}
.hub-item.dragging{opacity:.45;cursor:grabbing}
.hub-day.drop-target{border-color:#9b6bff;background:#171428;box-shadow:inset 0 0 0 1px rgba(155,107,255,.45)}
.hub-actions{display:none;margin-top:6px;gap:5px;flex-direction:column}
.hub-item.open .hub-actions{display:flex}
.hub-actions .btn{padding:4px 6px;font-size:11px}.hub-actions label{display:grid;gap:3px;font-size:10px}
.hub-actions input{width:100%;min-width:0;background:#0d1119;color:#fff;border:1px solid #393245;border-radius:6px;padding:4px;font-size:11px}
.hub-actions [data-hub-delete]{border-color:#5a2a33;color:#ffb3bd}
.hub-empty{font-size:11px;color:#6f7888}
.planner-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.hub-plan{display:flex;flex-direction:column;gap:4px;margin-top:auto;padding-top:6px;border-top:1px dashed #2c3442}
.hub-plan .planner-chip{padding:4px 7px;font-size:11px;border-radius:6px}
.hub-day.pickable{cursor:copy;border-style:dashed;border-color:#6b5a99}
.planner-palette{display:flex;gap:8px;flex-wrap:wrap}
.planner-chip{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 9px;border-radius:8px;border:1px solid #4a3f66;background:#231c38;color:#f1ecff;font-size:12px;font-weight:650;cursor:grab;user-select:none}
.planner-chip.palette{padding:8px 12px;border-style:dashed;background:#171424}
.planner-chip.palette[aria-pressed="true"]{border-style:solid;border-color:#b393ff;background:#3a2c5c}
.planner-chip.dragging{opacity:.45}
.planner-chip small{flex-basis:100%;font-size:10px;font-weight:500;color:#c6acff}
.planner-chip button{border:0;background:transparent;color:#b8adcf;padding:0 2px;font-size:11px;line-height:1;cursor:pointer;margin-left:auto}
.planner-chip button:hover,.planner-chip button:focus-visible{color:#fff;outline:none}
.capability-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:8px!important}
.capability-card{padding:10px 12px!important}
.capability-card strong{display:block;font-size:20px;margin:2px 0}
.capability-bar{height:4px;border-radius:9px;background:#252b36;overflow:hidden;margin:4px 0}.capability-bar i{display:block;height:100%;background:#9b6bff}
.more-results{width:100%;margin-top:4px}
.scheduled-workout .rpe-form{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
.scheduled-workout .rpe-form input{width:84px}.scheduled-workout .rpe-form input[name=notes]{width:220px;max-width:100%}
.activity-gallery{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))!important;gap:8px!important}
.activity-summary-card{padding:11px 12px!important;border-radius:12px!important}
.activity-summary-card h3{font-size:14px;margin:3px 0 6px}
.activity-summary-card .eyebrow{font-size:9px}
.activity-summary-card .activity-numbers{gap:14px}
.activity-summary-card .activity-numbers strong{font-size:15px}
.activity-summary-card .activity-numbers small{font-size:10px}
.activity-summary-card p{margin:6px 0 0;font-size:11px}
.activity-summary-card.gym{border-color:#3e3358}
.zone-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:10px}
.zone-panel{background:#0f141d;border:1px solid #262d39;border-radius:10px;padding:12px}
.zone-panel h4{margin:0 0 10px;padding:6px 10px;border-radius:7px;background:#1b2130;font-size:13px}
.zone-figures{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px}
.zone-figures div{display:grid;gap:2px}.zone-figures span{font-size:10px;color:#9ca6b5;text-transform:uppercase;letter-spacing:.06em}
.zone-figures strong{font-size:18px}
.zone-figures input{width:78px;background:#0d1119;color:#fff;border:1px solid #393245;border-radius:7px;padding:4px 6px;font-weight:700}
.zone-table{width:100%;border-collapse:collapse;font-size:12px}
.zone-table td{padding:4px 6px;border:0;border-bottom:1px solid #1f2532}
.zone-table tr:nth-child(odd) td{background:#141a24}
.zone-table td:first-child{font-weight:700;width:42px;color:#c6acff}
.zone-table td:nth-child(n+3){text-align:right;white-space:nowrap;color:#d7dce6}
.zone-panel select{width:100%;margin-bottom:8px}
@media(max-width:1050px){.hub-week{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.hub-week{grid-template-columns:repeat(2,minmax(0,1fr))}.week-hub-tools{width:100%}.activity-gallery{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
.insight-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}
.insight-grid .card h3{margin:2px 0 10px}
.fresh-layout{display:grid;grid-template-columns:minmax(200px,300px) minmax(0,1fr);gap:16px;align-items:center}
.muscle-map{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.muscle-map .gym-figure{display:block!important;text-align:center;font-size:10px;color:#9ca6b5}
.muscle-map .gym-figure svg{width:100%;max-height:300px}
.muscle-map .gym-muscle{cursor:default;stroke:#1d262d}.muscle-map .gym-muscle:hover{fill:var(--fresh-fill);filter:brightness(1.15)}
.fresh-list{display:grid;gap:5px;min-width:0}
.fresh-row{display:grid;grid-template-columns:minmax(90px,1.1fr) minmax(60px,1fr) 46px 70px;gap:8px;align-items:center;font-size:12px}
.fresh-row strong{text-align:right;font-variant-numeric:tabular-nums}.fresh-row small{color:#9ca6b5;font-size:10px}
.fresh-bar{height:6px;border-radius:9px;background:#252b36;overflow:hidden}.fresh-bar i{display:block;height:100%;border-radius:9px}
.fresh-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:#9ca6b5}.fresh-legend i,.focus-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.load-gauge{display:block;width:100%;max-width:260px;margin:0 auto}
.load-status{text-align:center;font-weight:800;margin:4px 0 8px;color:#3fda9c}.load-status.detraining{color:#64d2ff}.load-status.maintaining{color:#c6acff}.load-status.peaking{color:#ffc15c}.load-status.overtraining{color:#ff6478}.load-status.calibrating{color:#9ca6b5}
.spark-bars{width:100%;height:60px;display:block;margin:6px 0}
.load-muscles{display:flex;flex-wrap:wrap;gap:5px}.load-muscles .pill{font-size:10px}
.load-overtraining{color:#ff9aa7}.load-detraining{color:#9fdcff}.load-productive{color:#8ff0ca}
.focus-bar{display:flex;height:14px;border-radius:8px;overflow:hidden;background:#252b36;margin:6px 0 10px}
.focus-bar i{display:block;height:100%}
.low{background:#64d2ff}.high{background:#ffc15c}.anaerobic{background:#ff6478}
.focus-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.focus-legend b{display:block;font-size:20px}.focus-legend span{font-size:11px;color:#9ca6b5}
.focus-weeks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;height:110px;margin:14px 0 6px}
.focus-weeks>div{display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
.focus-week{display:flex;flex-direction:column;width:34px;height:var(--h);border-radius:6px;overflow:hidden}.focus-week i{display:block;width:100%}
.focus-weeks small{font-size:10px;color:#9ca6b5}
.pr-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px}
.pr-badge{display:grid;grid-template-columns:38px 1fr;gap:2px 8px;align-items:center;padding:8px;border-radius:12px;background:#151b26;border:1px solid #2a3140}
.pr-badge span{grid-row:span 2;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-weight:800;color:#fff;background:radial-gradient(circle at 35% 30%,#8bb8ff,#3b6fd8)}
.pr-heaviest span{background:radial-gradient(circle at 35% 30%,#ffb38a,#e8642c)}.pr-setVolume span,.pr-sessionVolume span{background:radial-gradient(circle at 35% 30%,#ffe08a,#e0a21a)}.pr-setReps span{background:radial-gradient(circle at 35% 30%,#d6b5ff,#8a55e8)}
.pr-badge strong{font-size:14px}.pr-badge small{font-size:10px;color:#9ca6b5;line-height:1.3}
.pr-table{font-size:12px}.pr-table td,.pr-table th{padding:6px 8px}
.pr-cardio{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:10px}
.pr-cardio div{display:grid;gap:2px;padding:8px 10px;border-radius:10px;background:#151b26;border:1px solid #2a3140}.pr-cardio span{font-size:18px}.pr-cardio strong{font-size:15px}.pr-cardio small{font-size:10px;color:#9ca6b5}
.timeline{list-style:none;margin:6px 0 0;padding:0 0 0 6px;display:grid;gap:0}
.timeline li{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:start;padding:8px 0 8px;border-left:2px solid #2a3140;padding-left:14px;margin-left:10px}
.timeline .tl-icon{position:absolute;left:-17px;top:6px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#1a2030;border:1px solid #333b49;font-size:15px}
.timeline li>div{grid-column:2;min-width:0}.timeline strong{display:block;font-size:13px}.timeline small{display:block;color:#9ca6b5;font-size:11px;overflow-wrap:anywhere}
.timeline time{grid-column:3;font-size:12px;color:#c9d2de;font-variant-numeric:tabular-nums}
#dayTimeline .actions{display:flex;gap:6px;flex-wrap:wrap}#dayTimeline .actions .btn{white-space:nowrap}
.tl-coach .tl-icon{background:#2a2440}.tl-coach small{color:#d5dbe6;font-size:12px;line-height:1.55}
.coach-note{padding:10px 12px;margin-bottom:10px;border-radius:12px;background:#1a1f2c;border:1px solid #2e3546}.coach-note p{margin:4px 0 0}.coach-note small{color:#a99bff;font-size:11px}
.coach-ask{display:grid;gap:6px;margin:6px 0 10px}.coach-ask textarea{width:100%;background:#0d1119;color:#eef1f7;border:1px solid #333b49;border-radius:10px;padding:9px;font:inherit;resize:vertical}
#coachRpe button.active{background:#7e50e5;border-color:#a16fff;color:#fff}
.food-draft-row{display:grid;grid-template-columns:minmax(0,1fr) auto 80px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #2a3140}.food-draft-row small{display:block;color:#9ca6b5;font-size:11px}.food-draft-row input{width:76px;background:#0d1119;color:#fff;border:1px solid #333b49;border-radius:8px;padding:5px 7px}.food-draft-row>span{text-align:right;font-variant-numeric:tabular-nums}
.food-draft-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-top:10px}.food-draft-foot input,.food-draft-foot select{display:block;background:#0d1119;color:#fff;border:1px solid #333b49;border-radius:8px;padding:6px 8px}
.coach-note-inline{margin:6px 0 0;font-size:12px;line-height:1.55;color:#c9d2de;max-width:780px}
.tl-weight .tl-icon{background:#16303a}.tl-sleep .tl-icon{background:#241f45}.tl-food .tl-icon{background:#2b2342}.tl-activity .tl-icon{background:#173a30}.tl-planned .tl-icon{border-style:dashed}
.copy-days{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.copy-days label{display:inline-flex!important;align-items:center;gap:5px;padding:5px 8px;border:1px solid #333b49;border-radius:8px;font-size:12px;min-width:0!important}
.hrr-card{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:14px 0;padding:12px 14px;border-radius:12px;background:#151b26;border:1px solid #2a3140}.hrr-card strong{display:block;font-size:24px;color:#ff9c97}.hrr-card small{color:#9ca6b5;font-size:11px}.hrr-card p{margin:0;max-width:340px}
.activity-extras h3{margin:14px 0 8px}
@media(max-width:1050px){.insight-grid{grid-template-columns:1fr}}
@media(max-width:700px){.fresh-layout{grid-template-columns:1fr}.muscle-map{max-width:320px;margin:auto}.fresh-row{grid-template-columns:minmax(80px,1fr) minmax(50px,1fr) 40px}.fresh-row small{display:none}.focus-legend b{font-size:16px}}
.pulse-macros{display:grid;gap:5px;margin-top:10px}
.pulse-macro{display:grid;grid-template-columns:82px minmax(40px,1fr) auto;gap:8px;align-items:center;font-size:11px;color:#c9d2de}
.pulse-macro i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.pulse-macro-bar{height:5px;border-radius:9px;background:#2a343e;overflow:hidden}.pulse-macro-bar i{display:block;width:0;height:100%;border-radius:9px;margin:0}
.pulse-macro b{font-variant-numeric:tabular-nums;white-space:nowrap}
/* Phone layout */
@media(max-width:700px){
  .pulse-header{margin-bottom:12px}.pulse-header h1{font-size:24px!important}.pulse-header p{font-size:13px}
  .pulse-grid{gap:8px!important}
  .pulse-card{display:grid!important;grid-template-columns:72px 1fr!important;gap:12px!important;padding:13px 14px!important;align-items:center}
  .pulse-ring{width:72px!important;height:72px!important;margin:0!important}.pulse-ring strong{font-size:19px!important}
  .pulse-card h3{font-size:16px!important;margin:2px 0 3px!important}.pulse-card p{font-size:12px;margin:0}
  .pulse-macro{grid-template-columns:70px minmax(30px,1fr) auto}
  #workouts .hero-status{display:none}#workouts .section-hero h1{font-size:26px}#workouts .section-hero p{font-size:13px}
  .sport-switch .btn{flex:1;padding:8px 6px}
  .week-hub-head{margin-bottom:8px}
  .week-hub-tools{display:flex;flex-wrap:nowrap;gap:6px;width:100%}
  .week-hub-tools .btn{padding:6px 9px;font-size:12px}#hubLocation{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .week-hub-tools .weeknav{width:auto;flex:none}.week-hub-tools .weeknav .btn{flex:none}
  .planner-bar{gap:6px}.planner-bar>.small:first-of-type{display:none}.planner-palette{flex:1}.planner-chip.palette{flex:1;justify-content:center;padding:7px 6px}
  /* The week reads as an agenda: day and weather on the left, the day's items on the right. */
  .hub-week{grid-template-columns:1fr!important;gap:6px}
  .hub-day{display:grid;grid-template-columns:62px minmax(0,1fr);grid-auto-flow:row dense;column-gap:10px;row-gap:0;padding:8px 10px;min-height:0}.hub-day>*:not(.hub-day-head):not(.hub-weather){margin-bottom:4px}
  .hub-day>*{grid-column:2}.hub-day>.hub-day-head{grid-column:1;grid-row:1;flex-direction:column;justify-content:flex-start;align-self:start;gap:0}.hub-day>.hub-weather{grid-column:1;grid-row:2/span 8;align-self:start;flex-wrap:wrap;gap:3px;font-size:10px}
  .hub-day-head strong{font-size:13px}.hub-plan{flex-direction:row;flex-wrap:wrap;margin-top:0;padding-top:4px}
  .hub-empty{align-self:center}
  #workoutsEndurance .workout-filter-grid{grid-template-columns:1fr 1fr!important;gap:8px}
  #workoutsEndurance .workout-filter-grid .workout-filter-actions{grid-column:1/-1}
  #workoutsEndurance .generate-card .workout-filter-actions{grid-column:auto}#workoutsEndurance .generate-card .workout-filter-actions .btn{width:100%;min-height:42px}
  .workout-result-head{flex-wrap:nowrap!important}.workout-score{font-size:20px}
  .workout-result{padding:12px}.workout-result h3{font-size:15px}
  .fresh-list{grid-template-columns:1fr 1fr;column-gap:14px}
  .fresh-row{grid-template-columns:minmax(0,1fr) auto!important;row-gap:3px}.fresh-row .fresh-bar{grid-column:1/-1;grid-row:2}.fresh-row span:first-child{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fresh-row strong{white-space:nowrap}
  .fresh-list>p{grid-column:1/-1}
  .pr-table th:nth-child(4),.pr-table td:nth-child(4){display:none}
  .pr-badge{grid-template-columns:32px 1fr}.pr-badge span{width:32px;height:32px}
  .activity-summary-card .activity-numbers{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px!important}
  .activity-summary-card .activity-numbers strong{font-size:13px!important}
  .timeline li{grid-template-columns:minmax(0,1fr) auto;padding-left:24px}.timeline li>div{grid-column:1}.timeline time{grid-column:2}
  /* Gym plan rows as cards instead of a sideways-scrolling table. */
  .gym-table{min-width:0!important}.gym-table thead{display:none}
  .gym-table,.gym-table tbody{display:block}
  .gym-table tr{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 8px;padding:10px 0;border-bottom:1px solid #262d39}
  .gym-table td{padding:0;border:0;min-width:0}
  .gym-table td:nth-child(1){display:none}
  .gym-table td:nth-child(2){grid-column:1/4;font-size:14px}
  .gym-table td:nth-child(3){grid-column:4;text-align:right;font-size:11px;color:#9ca6b5}.gym-table td:nth-child(3):before{content:"série "}
  .gym-table td:nth-child(4){grid-column:1/2;white-space:nowrap;font-size:12px;color:#c9d2de}.gym-table td:nth-child(4):before{content:"Plán "}.gym-table td:nth-child(4):after{content:" kg"}
  .gym-table td:nth-child(5){grid-column:2/5;font-size:12px;color:#c9d2de}.gym-table td:nth-child(5):before{content:"× "}
  .gym-table td:nth-child(6),.gym-table td:nth-child(7),.gym-table td:nth-child(8),.gym-table td:nth-child(9){display:grid;gap:2px;font-size:10px;color:#9ca6b5}
  .gym-table td:nth-child(6):before{content:"Skutečně kg"}.gym-table td:nth-child(7):before{content:"Opakování"}.gym-table td:nth-child(8):before{content:"RPE"}.gym-table td:nth-child(9):before{content:"Hotovo"}
  .gym-table input{width:100%!important;min-width:0}.gym-table input[type=checkbox]{width:24px!important;height:24px}
  .gym-table td:nth-child(10){grid-column:1;align-self:center;font-size:12px}
  .gym-table td:nth-child(11){grid-column:2/5;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.gym-table td:nth-child(11) .btn{padding:5px 7px;font-size:11px}
  .gym-table td[colspan]{grid-column:1/-1}
  /* One block per exercise: its name, video and actions once; warm-up sets
     marked so they do not read as a second round of work sets. */
  .gym-table tr:not(.gym-first) td:nth-child(2),.gym-table tr:not(.gym-first) td:nth-child(10),.gym-table tr:not(.gym-last) td:nth-child(11){display:none}
  .gym-table tr:not(.gym-last){border-bottom:1px dashed #20262f}.gym-table tr.gym-first:not(:first-child){margin-top:12px;border-top:1px solid #3a4352;padding-top:14px}
  .gym-table tr[data-type=WARMUP] td:nth-child(3){color:#f5c26b}.gym-table tr[data-type=WARMUP] td:nth-child(3):before{content:"rozcvička "}
  .gym-table tr[data-type=WARMUP] td:nth-child(4),.gym-table tr[data-type=WARMUP] td:nth-child(5){color:#9ca6b5}
  #workoutsGym .generate-card .detail-heading .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%}#workoutsGym .generate-card .detail-heading .actions .btn{padding:7px 4px;font-size:12px}
}
/* Dnes (all screens), quick add, bottom sheets, gym workout mode */
.today-head h1{font-size:34px;margin:2px 0 12px}
.mini-rings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.mini-ring{display:grid;justify-items:center;gap:3px;padding:12px 4px 10px;border-radius:16px;border:1px solid #262d39;background:#121722;color:#eef1f7;text-align:center}
.mini-ring-dial{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at center,#121722 63%,transparent 64%),conic-gradient(var(--c) calc(var(--p)*1%),#2a313e 0)}
.mini-ring-dial b{font-size:15px}.mini-ring-label{font-size:12px;font-weight:700}.mini-ring small{font-size:10px;color:#9ca6b5;line-height:1.2}
.today-card{padding:14px!important;margin-bottom:12px}
.today-item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #222936}
.today-item:last-of-type{border-bottom:0}.today-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#1b2130;font-size:16px}
.today-item strong{display:block;font-size:14px}.today-item small{display:block;font-size:11px;color:#9ca6b5}
.today-item.role .today-icon{border:1px dashed #6b5a99;background:transparent}.today-item.done .today-icon{background:#173a30}
.today-item .btn{padding:8px 12px;font-size:13px;min-height:38px}
.week-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid #222936}
.strip-day{display:grid;justify-items:center;gap:1px;padding:6px 0;border-radius:12px;border:1px solid transparent;background:transparent;color:#c9d2de}
.strip-day span{font-size:10px;text-transform:uppercase;color:#9ca6b5}.strip-day b{font-size:16px}.strip-day i{font-style:normal;font-size:11px;min-height:15px;letter-spacing:-2px}
.strip-day.today b{color:#c6acff}.strip-day.active{background:#231c38;border-color:#9b6bff}
.today-more{width:100%;margin-top:4px}
#today #dayTimeline{margin:0 0 12px}
.today-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px;align-items:start}
.today-main{min-width:0}#todayTimelineSlot{min-width:0}#todayTimelineSlot:empty{display:none}
.mini-ring:hover{border-color:#3a4354}
.fab{display:none}
.sheet{position:fixed;inset:0;z-index:80}
.sheet-backdrop{position:absolute;inset:0;background:#000a;opacity:0;transition:opacity .18s}
.sheet-panel{position:absolute;left:0;right:0;bottom:0;max-height:86dvh;overflow:auto;background:#141821;border-top:1px solid #343c4b;border-radius:20px 20px 0 0;padding:6px 16px calc(18px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .2s ease;max-width:640px;margin:0 auto}
.sheet.open .sheet-backdrop{opacity:1}.sheet.open .sheet-panel{transform:none}
.sheet-handle{width:42px;height:5px;border-radius:9px;background:#454e5e;margin:6px auto 8px;cursor:pointer}
.sheet-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.sheet-head h3{margin:0;font-size:17px}
#sheetBody p{color:#c9d2de;font-size:14px;line-height:1.5}
.sheet-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:10px 0 14px}.sheet-days .btn{display:grid;gap:2px;padding:10px 4px;font-size:12px;text-align:center}.sheet-days b{text-transform:capitalize}
.sheet-danger{width:100%;border-color:#5a2a33;color:#ffb3bd}.sheet-wide{width:100%;min-height:48px;font-size:16px}
/* Wider screens: the sheet is a centred panel, not a full-width drawer. */
@media(min-width:701px){.sheet-panel{left:50%;right:auto;width:min(560px,calc(100% - 32px));border-radius:20px 20px 0 0;transform:translate(-50%,100%)}.sheet.open .sheet-panel{transform:translateX(-50%)}}
.quick-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:6px 0 4px}
.quick-actions button{display:grid;justify-items:center;gap:6px;padding:16px 6px;border-radius:14px;border:1px solid #2f3745;background:#1a1f2b;color:#eef1f7;font-size:12px;font-weight:650}
.quick-actions span{font-size:24px}
.stepper{display:grid;grid-template-columns:52px minmax(0,1fr) 52px;align-items:center;background:#0f131b;border:1px solid #2f3745;border-radius:14px;overflow:hidden}
.stepper button{height:52px;border:0;background:#1d2330;color:#fff;font-size:24px;font-weight:700}
.stepper output{text-align:center;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.stepper.big{grid-template-columns:64px 1fr 64px;margin:10px 0}.stepper.big button{height:64px}.stepper.big output{font-size:34px}
.rpe-pick{padding:10px 0;border-bottom:1px solid #262d39}.rpe-pick strong{display:block}.rpe-pick small{color:#9ca6b5}
.rpe-scale{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px;margin-top:8px}.rpe-scale button{height:40px;border-radius:8px;border:1px solid #333b49;background:#1a1f2b;color:#fff;font-weight:700}
.gym-mode{position:fixed;inset:0;z-index:70;background:#0b0e14;color:#f3f5fa;display:flex;flex-direction:column;padding:calc(10px + env(safe-area-inset-top)) 16px calc(14px + env(safe-area-inset-bottom));overflow:auto}
body.gym-mode-open{overflow:hidden}
.gm-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.gm-progress{height:5px;border-radius:9px;background:#1f2531;overflow:hidden;margin:10px 0 18px}.gm-progress i{display:block;height:100%;background:#3fda9c}
.gm-body{flex:1;display:flex;flex-direction:column;max-width:520px;width:100%;margin:0 auto}
.gm-body h2{font-size:28px;margin:4px 0 2px;line-height:1.15}
.gm-steppers{display:grid;gap:14px;margin-top:18px}.gm-steppers .label{display:block;margin-bottom:6px}
.gm-steppers .stepper{grid-template-columns:72px 1fr 72px}.gm-steppers .stepper button{height:72px;font-size:30px}.gm-steppers .stepper output{font-size:38px}
.gm-rpe{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:6px}.gm-rpe button{height:44px;border-radius:10px;border:1px solid #333b49;background:#161b25;color:#fff;font-weight:700}.gm-rpe button[aria-pressed="true"]{background:#3a2c5c;border-color:#b393ff}
.gm-done{margin-top:auto;min-height:60px;font-size:18px;border-radius:16px}
.gm-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;max-width:520px;width:100%;margin-inline:auto}.gm-nav .btn{min-height:46px}
.gm-rest{display:grid;justify-items:center;gap:16px;margin:auto 0}
.gm-rest-ring{width:180px;height:180px;border-radius:50%;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at center,#0b0e14 62%,transparent 63%),conic-gradient(#64d2ff calc(var(--p)*1%),#1f2531 0)}
.gm-rest-ring b{font-size:42px;font-variant-numeric:tabular-nums}.gm-rest-ring small{color:#9ca6b5}
.gm-rest-actions{display:flex;gap:10px}.gm-rest-actions .btn{min-height:48px;min-width:120px}
.gm-empty{margin:auto;text-align:center;display:grid;gap:10px;justify-items:center}.gm-check{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;background:#173a30;color:#3fda9c;font-size:42px}
@media(max-width:700px){
  .nav button[data-view="overview"]{display:none!important}
  .nav{grid-template-columns:repeat(6,minmax(0,1fr))!important}
  .fab{display:grid;place-items:center;position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:31;width:58px;height:58px;border-radius:50%;border:0;background:linear-gradient(135deg,#a16fff,#7e50e5);color:#fff;font-size:32px;font-weight:300;line-height:1;box-shadow:0 10px 26px #0009}
  .fab[hidden]{display:none}
  .today-head h1{font-size:30px}.today-layout{display:block}.tl-verb{display:none}
}
.planner-chip .proposal{color:#e9e2ff;font-weight:650}
.chip-actions{display:flex;gap:4px;flex-basis:100%;flex-wrap:wrap;margin-top:2px}.chip-actions .btn{padding:3px 7px;font-size:10px;border-radius:6px}
#proposeWeek{padding:7px 12px;font-size:12px}
.gym-date{display:inline-flex;align-items:center;gap:6px;margin-top:4px}.gym-date input{background:#0d1119;color:#fff;border:1px solid #393245;border-radius:8px;padding:5px 8px}
@media(max-width:700px){#proposeWeek{flex-basis:100%;order:3}}
`;
