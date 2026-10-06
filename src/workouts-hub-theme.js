// Workouts hub (week overview, weather, weekly planner, info tips), compact
// capability cards, compact activity history and Intervals-style zone tables.
export const workoutsHubTheme = `
.info-tip{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:4px;padding:0;border:1px solid color-mix(in srgb,var(--muted) 53%,var(--bg));border-radius:50%;background:transparent;color:color-mix(in srgb,var(--muted) 59%,var(--text));font:700 10px/1 Georgia,serif;font-style:italic;vertical-align:middle;cursor:pointer}
.info-tip:hover,.info-tip:focus-visible,.info-tip[aria-expanded="true"]{border-color:var(--primary);color:var(--text);background:var(--primary-surface);outline:none}
.section .info-tip{text-transform:none;letter-spacing:0}
#infoPop{position:fixed;z-index:60;max-width:min(340px,calc(100vw - 24px));padding:12px 14px;border:1px solid var(--primary-line);border-radius:10px;background:var(--panel);color:color-mix(in srgb,var(--muted) 21%,var(--text));font-size:12px;line-height:1.5;box-shadow:0 14px 40px #000a}
#infoPop strong{display:block;margin-bottom:4px;font-size:13px;color:var(--text)}
#infoPop p{margin:0 0 6px}#infoPop p:last-child{margin:0}
.week-hub{margin-bottom:14px}
.week-hub-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
.week-hub-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#hubLocationForm{margin-bottom:12px}#hubLocationForm input{background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid var(--line);border-radius:9px;padding:8px;min-width:0}
.hub-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.hub-day{min-width:0;background:color-mix(in srgb,var(--blue) 4%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg));border-radius:11px;padding:9px;display:flex;flex-direction:column;gap:6px}
.hub-day.today{border-color:var(--primary);box-shadow:inset 0 0 0 1px rgba(var(--primary-rgb),.25)}
.hub-day.past{opacity:.86}
.hub-day-head{display:flex;justify-content:space-between;align-items:baseline;gap:4px}
.hub-day-head strong{font-size:12px;text-transform:capitalize}.hub-day-head span{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.hub-weather{display:flex;align-items:center;gap:5px;font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text));min-height:18px}.hub-weather b{font-size:12px;color:var(--text)}
.hub-item{border-left:3px solid color-mix(in srgb,var(--muted) 43%,var(--bg));background:color-mix(in srgb,var(--blue) 9%,var(--bg));border-radius:6px;padding:5px 7px;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
.hub-item.done{border-left-color:var(--green)}.hub-item.planned{border-left-color:var(--primary)}.hub-item.suggested{border-left-style:dashed;border-left-color:color-mix(in srgb,var(--muted) 62%,var(--bg));background:transparent;color:color-mix(in srgb,var(--muted) 93%,var(--text))}
.hub-item .meta{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.hub-item.editable{cursor:grab;position:relative}.hub-item.editable:hover,.hub-item.editable:focus-visible{background:color-mix(in srgb,var(--blue) 13%,var(--bg));outline:none}
.hub-item.dragging{opacity:.45;cursor:grabbing}
.hub-day.drop-target{border-color:var(--primary);background:var(--primary-surface);box-shadow:inset 0 0 0 1px rgba(var(--primary-rgb),.45)}
.hub-actions{display:none;margin-top:6px;gap:5px;flex-direction:column}
.hub-item.open .hub-actions{display:flex}
.hub-actions .btn{padding:4px 6px;font-size:12px}.hub-actions label{display:grid;gap:3px;font-size:12px}
.hub-actions input{width:100%;min-width:0;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px;font-size:12px}
.hub-actions [data-hub-delete]{border-color:color-mix(in srgb,var(--bad) 32%,var(--bg));color:color-mix(in srgb,var(--bad) 44%,var(--text))}
.hub-empty{font-size:12px;color:color-mix(in srgb,var(--muted) 65%,var(--bg))}
.planner-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.hub-plan{display:flex;flex-direction:column;gap:4px;margin-top:auto;padding-top:6px;border-top:1px dashed color-mix(in srgb,var(--muted) 23%,var(--bg))}
.hub-plan .planner-chip{touch-action:none;padding:4px 7px;font-size:12px;border-radius:6px}
.hub-day.pickable{cursor:copy;border-style:dashed;border-color:color-mix(in srgb,var(--lilac) 57%,var(--bg))}
.planner-palette{display:flex;gap:8px;flex-wrap:wrap}
.planner-chip{touch-action:none;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 9px;border-radius:8px;border:1px solid var(--primary-line);background:var(--primary-surface);color:color-mix(in srgb,var(--violet) 8%,var(--text));font-size:12px;font-weight:650;cursor:grab;user-select:none}
.planner-chip.palette{padding:8px 12px;border-style:dashed;background:color-mix(in srgb,var(--violet) 7%,var(--bg));touch-action:none}
.planner-chip.palette[aria-pressed="true"]{border-style:solid;border-color:var(--primary);background:var(--primary-surface)}
.planner-chip.dragging{opacity:.45}
.planner-chip small{flex-basis:100%;font-size:12px;font-weight:500;color:var(--primary-text)}
.planner-chip button{border:0;background:transparent;color:color-mix(in srgb,var(--lilac) 12%,var(--muted));padding:0 2px;font-size:12px;line-height:1;cursor:pointer;margin-left:auto}
.planner-chip button:hover,.planner-chip button:focus-visible{color:var(--text);outline:none}
.capability-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;gap:8px!important}
.capability-card{padding:10px 12px!important}
.capability-card strong{display:block;font-size:20px;margin:2px 0}
.capability-bar{height:4px;border-radius:9px;background:color-mix(in srgb,var(--muted) 17%,var(--bg));overflow:hidden;margin:4px 0}.capability-bar i{display:block;height:100%;background:var(--primary)}
.more-results{width:100%;margin-top:4px}
.scheduled-workout .rpe-form{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
.scheduled-workout .rpe-form input{width:84px}.scheduled-workout .rpe-form input[name=notes]{width:220px;max-width:100%}
.activity-gallery{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))!important;gap:8px!important}
.activity-summary-card{padding:11px 12px!important;border-radius:12px!important}
.activity-summary-card h3{font-size:14px;margin:3px 0 6px}
.activity-summary-card .eyebrow{font-size:12px}
.activity-summary-card .activity-numbers{gap:14px}
.activity-summary-card .activity-numbers strong{font-size:15px}
.activity-summary-card .activity-numbers small{font-size:12px}
.activity-summary-card p{margin:6px 0 0;font-size:12px}
.activity-summary-card.gym{border-color:color-mix(in srgb,var(--lilac) 29%,var(--bg))}
.zone-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:10px}
.zone-panel{background:color-mix(in srgb,var(--blue) 4%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg));border-radius:10px;padding:12px}
.zone-panel h4{margin:0 0 10px;padding:6px 10px;border-radius:7px;background:color-mix(in srgb,var(--blue) 13%,var(--bg));font-size:13px}
.zone-figures{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px}
.zone-figures div{display:grid;gap:2px}.zone-figures span{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));text-transform:uppercase;letter-spacing:.06em}
.zone-figures strong{font-size:18px}
.zone-figures input{width:78px;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid var(--line);border-radius:7px;padding:4px 6px;font-weight:700}
.zone-table{width:100%;border-collapse:collapse;font-size:12px}
.zone-table td{padding:4px 6px;border:0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 13%,var(--bg))}
.zone-table tr:nth-child(odd) td{background:color-mix(in srgb,var(--cyan) 7%,var(--bg))}
.zone-table td:first-child{font-weight:700;width:42px;color:var(--primary-text)}
.zone-table td:nth-child(n+3){text-align:right;white-space:nowrap;color:color-mix(in srgb,var(--muted) 36%,var(--text))}
.zone-panel select{width:100%;margin-bottom:8px}
@media(max-width:1050px){.hub-week{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.hub-week{grid-template-columns:repeat(2,minmax(0,1fr))}.week-hub-tools{width:100%}.activity-gallery{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
.insight-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}
.insight-grid .card h3{margin:2px 0 10px}
.fresh-layout{display:grid;grid-template-columns:minmax(200px,300px) minmax(0,1fr);gap:16px;align-items:center}
.muscle-map{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.muscle-map .gym-figure{display:block!important;text-align:center;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.muscle-map .gym-figure svg{width:100%;max-height:300px}
.muscle-map .gym-muscle{cursor:default;stroke:color-mix(in srgb,var(--muted) 14%,var(--bg))}.muscle-map .gym-muscle:hover{fill:var(--fresh-fill);filter:brightness(1.15)}
.fresh-list{display:grid;gap:5px;min-width:0}
.fresh-row{display:grid;grid-template-columns:minmax(90px,1.1fr) minmax(60px,1fr) 46px 70px;gap:8px;align-items:center;font-size:12px}
.fresh-row strong{text-align:right;font-variant-numeric:tabular-nums}.fresh-row small{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.fresh-bar{height:6px;border-radius:9px;background:color-mix(in srgb,var(--muted) 17%,var(--bg));overflow:hidden}.fresh-bar i{display:block;height:100%;border-radius:9px}
.fresh-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.fresh-legend i,.focus-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.load-gauge{display:block;width:100%;max-width:260px;margin:0 auto}
.load-status{text-align:center;font-weight:800;margin:4px 0 8px;color:var(--green)}.load-status.detraining{color:var(--sky)}.load-status.maintaining{color:var(--primary-text)}.load-status.peaking{color:var(--warn)}.load-status.overtraining{color:var(--bad)}.load-status.calibrating{color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.spark-bars{width:100%;height:60px;display:block;margin:6px 0}
.load-muscles{display:flex;flex-wrap:wrap;gap:5px}.load-muscles .pill{font-size:12px}.load-muscles .small{flex-basis:100%;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.load-muscles .pill.load-overtraining{border-color:color-mix(in srgb,var(--bad) 40%,transparent);color:color-mix(in srgb,var(--bad) 44%,var(--text))}.load-muscles .pill.load-detraining{border-color:color-mix(in srgb,var(--sky) 33.3%,transparent);color:color-mix(in srgb,var(--sky) 50%,var(--text))}
.load-overtraining{color:color-mix(in srgb,var(--bad) 62%,var(--text))}.load-detraining{color:color-mix(in srgb,var(--sky) 63%,var(--text))}.load-productive{color:color-mix(in srgb,var(--primary) 81%,var(--text))}
.focus-bar{display:flex;height:14px;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--muted) 17%,var(--bg));margin:6px 0 10px}
.focus-bar i{display:block;height:100%}
.low{background:var(--sky)}.high{background:var(--warn)}.anaerobic{background:var(--bad)}
.focus-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.focus-legend b{display:block;font-size:20px}.focus-legend span{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.focus-weeks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;height:110px;margin:14px 0 6px}
.focus-weeks>div{display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}
.focus-week{display:flex;flex-direction:column;width:34px;height:var(--h);border-radius:6px;overflow:hidden}.focus-week i{display:block;width:100%}
.focus-weeks small{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.pr-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px}
.pr-badge{display:grid;grid-template-columns:38px 1fr;gap:2px 8px;align-items:center;padding:8px;border-radius:12px;background:color-mix(in srgb,var(--blue) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 19%,var(--bg))}
.pr-badge span{grid-row:span 2;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-weight:800;color:#fff;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--blue) 73%,var(--text)),#3b6fd8)}
.pr-heaviest span{background:radial-gradient(circle at 35% 30%,#ffb38a,#e8642c)}.pr-setVolume span,.pr-sessionVolume span{background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--warn) 60%,var(--text)),color-mix(in srgb,var(--amber) 74%,var(--muted)))}.pr-setReps span{background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--violet) 43%,var(--text)),color-mix(in srgb,var(--violet) 85%,var(--bg)))}
.pr-badge strong{font-size:14px}.pr-badge small{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));line-height:1.3}
.pr-table{font-size:12px}.pr-table td,.pr-table th{padding:6px 8px}
.pr-cardio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
@media(max-width:480px){.pr-cardio{gap:6px}.pr-cardio div{padding:7px 8px;min-width:0}.pr-cardio span{font-size:15px}.pr-cardio strong{font-size:13px;white-space:nowrap}.pr-cardio .trend{font-size:12px;padding:1px 5px}.pr-cardio small{font-size:12px}}
.pr-cardio div{display:grid;gap:2px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--blue) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 19%,var(--bg))}.pr-cardio span{font-size:18px}.pr-cardio strong{font-size:15px}.pr-cardio small{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.timeline{list-style:none;margin:6px 0 0;padding:0 0 0 6px;display:grid;gap:0}
.timeline li{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:start;padding:8px 0 8px;border-left:2px solid color-mix(in srgb,var(--cyan) 19%,var(--bg));padding-left:14px;margin-left:10px}
.timeline .tl-icon{position:absolute;left:-17px;top:6px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:color-mix(in srgb,var(--blue) 12%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));font-size:15px}
.timeline li>div{grid-column:2;min-width:0}.timeline strong{display:block;font-size:13px}.timeline small{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px;overflow-wrap:anywhere}
.timeline time{grid-column:3;font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text));font-variant-numeric:tabular-nums}
#dayTimeline .actions{display:flex;gap:6px;flex-wrap:wrap}#dayTimeline .actions .btn{white-space:nowrap}
.tl-coach .tl-icon{background:color-mix(in srgb,var(--violet) 20%,var(--bg))}.tl-coach small{color:color-mix(in srgb,var(--muted) 38%,var(--text));font-size:12px;line-height:1.55}
.coach-note{padding:10px 12px;margin-bottom:10px;border-radius:12px;background:color-mix(in srgb,var(--blue) 12%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 22%,var(--bg))}.coach-note p{margin:4px 0 0}.coach-note small{color:color-mix(in srgb,var(--lilac) 96%,var(--text));font-size:12px}
.coach-ask{display:grid;gap:6px;margin:6px 0 10px}.coach-ask textarea{width:100%;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:color-mix(in srgb,var(--muted) 8%,var(--text));border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:10px;padding:9px;font:inherit;resize:vertical}
#rateRpe button.active,#coachRpe button.active{background:var(--primary);border-color:var(--primary);color:#fff}
.food-ai-card{display:grid;gap:8px;margin:10px 0;padding:14px 16px;border:1px solid var(--primary-line);border-radius:14px;background:linear-gradient(160deg,var(--primary-surface),color-mix(in srgb,var(--cyan) 6%,var(--bg)) 70%)}
.fac-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.fac-badge{padding:3px 9px;border-radius:999px;background:var(--primary-surface);color:var(--primary-text);font-size:12px;font-weight:700}
.fac-conf{display:inline-flex;align-items:center;gap:3px;color:color-mix(in srgb,var(--muted) 71%,var(--text));font-size:12px}.fac-conf i{width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--muted) 28%,var(--bg))}.fac-conf i:last-of-type{margin-right:4px}
.fac-conf.conf-3 i.on{background:var(--green)}.fac-conf.conf-2 i.on{background:color-mix(in srgb,var(--warn) 81%,var(--muted))}.fac-conf.conf-1 i.on{background:#ff8a80}
.fac-name{font-size:15px;line-height:1.3;color:color-mix(in srgb,var(--muted) 2%,var(--text))}.fac-meta{margin-top:-6px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.fac-meta:empty{display:none}
.fac-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.fac-values small{grid-column:1/-1;color:color-mix(in srgb,var(--muted) 88%,var(--bg));font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.fac-values div{display:grid;gap:1px;padding:8px 6px;border:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:10px;background:color-mix(in srgb,var(--muted) 5%,var(--bg));text-align:center}.fac-values b{font-size:16px}.fac-values span{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.fac-note{margin:0;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,var(--amber) 14%,var(--bg));color:color-mix(in srgb,var(--warn) 52%,var(--text));font-size:12.5px;line-height:1.45}
.fac-sources{display:flex;flex-wrap:wrap;gap:6px}.fac-sources a{padding:4px 10px;border:1px solid color-mix(in srgb,var(--cyan) 28%,var(--bg));border-radius:999px;background:color-mix(in srgb,var(--muted) 5%,var(--bg));color:color-mix(in srgb,var(--blue) 39%,var(--text));font-size:12px;text-decoration:none}.fac-sources a:hover{border-color:#6f8fc9}
.food-draft-row{display:grid;grid-template-columns:minmax(0,1fr) auto 80px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 19%,var(--bg))}.food-draft-row small{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.food-draft-row input{width:76px;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:8px;padding:5px 7px}.food-draft-row>span{text-align:right;font-variant-numeric:tabular-nums}
.food-draft-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-top:10px}.food-draft-foot input,.food-draft-foot select{display:block;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:8px;padding:6px 8px}
.coach-note-inline{margin:6px 0 0;font-size:12px;line-height:1.55;color:color-mix(in srgb,var(--muted) 51%,var(--text));max-width:780px}
.tl-weight .tl-icon{background:color-mix(in srgb,var(--sky) 17%,var(--bg))}.tl-sleep .tl-icon{background:color-mix(in srgb,var(--violet) 19%,var(--bg))}.tl-food .tl-icon{background:color-mix(in srgb,var(--violet) 20%,var(--bg))}.tl-activity .tl-icon{background:color-mix(in srgb,var(--green) 21%,var(--bg))}.tl-planned .tl-icon{border-style:dashed}
.copy-days{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.copy-days label{display:inline-flex!important;align-items:center;gap:5px;padding:5px 8px;border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:8px;font-size:12px;min-width:0!important}
.hrr-card{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:14px 0;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--blue) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 19%,var(--bg))}.hrr-card strong{display:block;font-size:24px;color:color-mix(in srgb,var(--bad) 63%,var(--text))}.hrr-card small{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.hrr-card p{margin:0;max-width:340px}
.activity-extras h3{margin:14px 0 8px}
@media(max-width:1050px){.insight-grid{grid-template-columns:1fr}}
@media(max-width:700px){.fresh-layout{grid-template-columns:1fr}.muscle-map{max-width:320px;margin:auto}.fresh-row{grid-template-columns:minmax(80px,1fr) minmax(50px,1fr) 40px}.fresh-row small{display:none}.focus-legend b{font-size:16px}}
.pulse-macros{display:grid;gap:5px;margin-top:10px}
.pulse-macro{display:grid;grid-template-columns:82px minmax(40px,1fr) auto;gap:8px;align-items:center;font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text))}
.pulse-macro i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.pulse-macro-bar{height:5px;border-radius:9px;background:color-mix(in srgb,var(--muted) 22%,var(--bg));overflow:hidden}.pulse-macro-bar i{display:block;width:0;height:100%;border-radius:9px;margin:0}
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
  .planner-bar{gap:6px}.planner-palette{flex:1}.planner-chip.palette{flex:1;justify-content:center;padding:7px 6px}
  /* The week reads as an agenda: day and weather on the left, the day's items on the right. */
  .hub-week{grid-template-columns:1fr!important;gap:6px}
  .hub-day{display:grid;grid-template-columns:62px minmax(0,1fr);grid-auto-flow:row dense;column-gap:10px;row-gap:0;padding:8px 10px;min-height:0}.hub-day>*:not(.hub-day-head):not(.hub-weather){margin-bottom:4px}
  .hub-day>*{grid-column:2}.hub-day>.hub-day-head{grid-column:1;grid-row:1;flex-direction:column;justify-content:flex-start;align-self:start;gap:0}.hub-day>.hub-weather{grid-column:1;grid-row:2/span 8;align-self:start;flex-wrap:wrap;gap:3px;font-size:12px}
  .hub-day-head strong{font-size:13px}.hub-plan{flex-direction:row;flex-wrap:wrap;margin-top:0;padding-top:4px}
  .hub-empty{align-self:center}
  #workoutsEndurance .workout-filter-grid{grid-template-columns:1fr 1fr!important;gap:8px}
  #workoutsEndurance .workout-filter-grid .workout-filter-actions{grid-column:1/-1}
  #workoutsEndurance .generate-card .workout-filter-actions{grid-column:auto}#workoutsEndurance .generate-card .workout-filter-actions .btn{width:100%;min-height:42px}
  .workout-result-head{flex-wrap:nowrap!important}.workout-score{font-size:20px}
  .workout-result{padding:12px}.workout-result h3{font-size:15px}
  .fresh-list{grid-template-columns:1fr 1fr;column-gap:14px}
  .fresh-row{grid-template-columns:minmax(0,1fr) auto!important;row-gap:3px}.fresh-row .fresh-bar{grid-column:1/-1;grid-row:2}.fresh-row span:first-child{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fresh-row strong{white-space:nowrap}
  .fresh-list>p{grid-column:1/-1}
  .pr-table td,.pr-table th{padding:6px 5px}
  .pr-badge{grid-template-columns:32px 1fr}.pr-badge span{width:32px;height:32px}
  .activity-summary-card .activity-numbers{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px!important}
  .activity-summary-card .activity-numbers strong{font-size:13px!important}
  .timeline li{grid-template-columns:minmax(0,1fr) auto;padding-left:24px}.timeline li>div{grid-column:1}.timeline time{grid-column:2}
  /* Gym plan rows as cards instead of a sideways-scrolling table. */
  .gym-table{min-width:0!important}.gym-table thead{display:none}
  .gym-table,.gym-table tbody{display:block}
  .gym-table tr{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 8px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg))}
  .gym-table td{padding:0;border:0;min-width:0}
  .gym-table td:nth-child(1){display:none}
  .gym-table td:nth-child(2){grid-column:1/4;font-size:14px}
  .gym-table td:nth-child(3){grid-column:4;text-align:right;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.gym-table td:nth-child(3):before{content:"série "}
  .gym-table td:nth-child(4){grid-column:1/2;white-space:nowrap;font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text))}.gym-table td:nth-child(4):before{content:"Plán "}.gym-table td:nth-child(4):after{content:" kg"}
  .gym-table td:nth-child(5){grid-column:2/5;font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text))}.gym-table td:nth-child(5):before{content:"× "}
  .gym-table td:nth-child(6),.gym-table td:nth-child(7),.gym-table td:nth-child(8),.gym-table td:nth-child(9){display:grid;gap:2px;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
  .gym-table td:nth-child(6):before{content:"Skutečně kg"}.gym-table td:nth-child(7):before{content:"Opakování"}.gym-table td:nth-child(8):before{content:"RPE"}.gym-table td:nth-child(9):before{content:"Hotovo"}
  .gym-table input{width:100%!important;min-width:0}.gym-table input[type=checkbox]{width:24px!important;height:24px}
  .gym-table td.gym-options-cell{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;min-width:0;padding:8px 0}
  .gym-table td.gym-options-cell label{margin:0;font-size:12px;white-space:nowrap}
  .gym-table td.gym-video-cell{grid-column:1/-1;align-self:center;font-size:12px}
  .gym-table td.gym-actions-cell{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg))}
  .gym-table td.gym-actions-cell .btn{padding:8px 10px;font-size:12px;min-height:36px;white-space:nowrap}
  .gym-table td[colspan]{grid-column:1/-1}
  /* One block per exercise: its name, video and actions once; warm-up sets
     marked so they do not read as a second round of work sets. */
  .gym-table tr:not(.gym-first) td:nth-child(2),.gym-table tr:not(.gym-first) td.gym-video-cell,.gym-table tr:not(.gym-last) td.gym-actions-cell{display:none}
  .gym-table tr[data-type=WARMUP] td.gym-options-cell{display:none}
  .gym-table tr:not(.gym-last){border-bottom:1px dashed color-mix(in srgb,var(--muted) 14%,var(--bg))}.gym-table tr.gym-first:not(:first-child){margin-top:12px;border-top:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));padding-top:14px}
  .gym-table tr[data-type=WARMUP] td:nth-child(3){color:color-mix(in srgb,var(--amber) 59%,var(--text))}.gym-table tr[data-type=WARMUP] td:nth-child(3):before{content:"rozcvička "}
  .gym-table tr[data-type=WARMUP] td:nth-child(4),.gym-table tr[data-type=WARMUP] td:nth-child(5){color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
  #workoutsGym .generate-card .detail-heading .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%}#workoutsGym .generate-card .detail-heading .actions .btn{padding:7px 4px;font-size:12px}
}
/* Dnes (all screens), quick add, bottom sheets, gym workout mode */
.today-head h1{font-size:34px;margin:2px 0 12px}
.mini-rings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.mini-ring{display:grid;justify-items:center;gap:3px;padding:12px 4px 10px;border-radius:16px;border:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg));background:color-mix(in srgb,var(--blue) 6%,var(--bg));color:color-mix(in srgb,var(--muted) 8%,var(--text));text-align:center}
.mini-ring-dial{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at center,color-mix(in srgb,var(--blue) 6%,var(--bg)) 63%,transparent 64%),conic-gradient(var(--c) calc(var(--p)*1%),color-mix(in srgb,var(--muted) 21%,var(--bg)) 0)}
.mini-ring-dial b{font-size:15px}.mini-ring-label{font-size:12px;font-weight:700}.mini-ring small{font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));line-height:1.2}
.today-card{padding:14px!important;margin-bottom:12px}
.today-item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 15%,var(--bg))}
.today-item:last-of-type{border-bottom:0}.today-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--blue) 13%,var(--bg));font-size:16px}
.today-item strong{display:block;font-size:14px}.today-item small{display:block;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.today-item.role .today-icon{border:1px dashed color-mix(in srgb,var(--lilac) 57%,var(--bg));background:transparent}.today-item.done .today-icon{background:color-mix(in srgb,var(--green) 21%,var(--bg))}
.today-item .btn{padding:8px 12px;font-size:13px;min-height:38px}.today-rated{font-size:12px;color:color-mix(in srgb,var(--primary) 90%,var(--bg));white-space:nowrap}
.deploy-steps{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:8px 0;padding:0;counter-reset:deploy}
.deploy-steps li{counter-increment:deploy;display:grid;gap:1px;min-width:0;padding:6px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--muted) 24%,var(--bg));background:color-mix(in srgb,var(--cyan) 7%,var(--bg));color:color-mix(in srgb,var(--muted) 86%,var(--bg));font-size:12px}
.deploy-steps li b::before{content:counter(deploy) " · ";color:color-mix(in srgb,var(--muted) 64%,var(--bg));font-weight:600}
.deploy-steps li small{font-size:12px;color:inherit;opacity:.85}
.deploy-steps li.done{border-color:color-mix(in srgb,var(--green) 45%,var(--bg));background:color-mix(in srgb,var(--green) 13%,var(--bg));color:color-mix(in srgb,var(--green) 51%,var(--text))}.deploy-steps li.active{border-color:var(--primary);background:var(--primary-surface);color:var(--primary-text)}.deploy-steps li.fail{border-color:#7a4545;background:color-mix(in srgb,var(--bad) 11%,var(--bg));color:color-mix(in srgb,var(--bad) 44%,var(--text))}
.deploy-live,.deploy-wait{display:block;flex-basis:100%;font-size:12px;font-weight:600;line-height:1.3}.deploy-live{color:color-mix(in srgb,var(--primary) 90%,var(--bg))}.deploy-wait{color:color-mix(in srgb,var(--lilac) 63%,var(--text))}
.week-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:12px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--cyan) 15%,var(--bg))}
.strip-day{display:grid;justify-items:center;gap:1px;padding:6px 0;border-radius:12px;border:1px solid transparent;background:transparent;color:color-mix(in srgb,var(--muted) 51%,var(--text))}
.strip-day span{font-size:12px;text-transform:uppercase;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.strip-day b{font-size:16px}.strip-day i{font-style:normal;font-size:12px;min-height:15px;letter-spacing:-2px}
.strip-day.today b{color:var(--primary-text)}.strip-day.active{background:var(--primary-surface);border-color:var(--primary)}
.today-more{width:100%;margin-top:4px}
#dayTimeline{margin-bottom:12px}#today #dayTimeline{margin:0 0 12px}
.today-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px;align-items:start}
.today-main{min-width:0}#todayTimelineSlot{min-width:0}#todayTimelineSlot:empty{display:none}
.morning-summary:not([hidden]){padding:16px 18px;margin-bottom:18px;border:1px solid color-mix(in srgb,var(--primary) 39%,var(--bg));border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--green) 16%,var(--bg)),color-mix(in srgb,var(--cyan) 8%,var(--bg)))}.morning-summary h3{font-size:17px;margin:7px 0}.morning-summary p{color:color-mix(in srgb,var(--text) 77%,var(--bg));font-size:13px;line-height:1.6;margin:8px 0}.morning-summary>strong{display:block;font-size:13px;line-height:1.6;font-weight:550;color:color-mix(in srgb,var(--green) 14%,var(--text))}
@media(min-width:701px){
  .today-main{display:contents}
  .today-layout>.today-main>.today-head{grid-column:1;grid-row:1}
  .today-layout>.today-main>.mini-rings{grid-column:1;grid-row:2;margin:0}
  .today-layout>.today-main>.today-card{grid-column:1;grid-row:3;margin:0}
  #todayTimelineSlot{grid-column:2;grid-row:2/4;align-self:stretch;position:relative;min-height:0}
  #today #todayTimelineSlot>#dayTimeline{position:absolute;inset:0;margin:0;display:flex;flex-direction:column;min-height:0;overflow:hidden}
  #todayTimelineSlot .detail-heading{flex:none}
  #todayTimelineSlot .timeline{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;margin-bottom:0}
}
.mini-ring:hover{border-color:color-mix(in srgb,var(--muted) 32%,var(--bg))}
.fab{display:none}
.sheet{position:fixed;inset:0;z-index:80}
.sheet-backdrop{position:absolute;inset:0;background:#000a;opacity:0;transition:opacity .18s}
.sheet-panel{position:absolute;left:0;right:0;bottom:0;max-height:86dvh;overflow:auto;background:color-mix(in srgb,var(--cyan) 6%,var(--bg));border-top:1px solid color-mix(in srgb,var(--muted) 28%,var(--bg));border-radius:20px 20px 0 0;padding:6px 16px calc(18px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .2s ease;max-width:640px;margin:0 auto}
.sheet.open .sheet-backdrop{opacity:1}.sheet.open .sheet-panel{transform:none}
.sheet-handle{width:42px;height:5px;border-radius:9px;background:color-mix(in srgb,var(--muted) 39%,var(--bg));margin:6px auto 8px;cursor:pointer}
.sheet-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.sheet-head h3{margin:0;font-size:17px}
#sheetBody p{color:color-mix(in srgb,var(--muted) 51%,var(--text));font-size:14px;line-height:1.5}
.sheet-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:10px 0 14px}.sheet-days .btn{display:grid;gap:2px;padding:10px 4px;font-size:12px;text-align:center}.sheet-days b{text-transform:capitalize}
.sheet-danger{width:100%;border-color:color-mix(in srgb,var(--bad) 32%,var(--bg));color:color-mix(in srgb,var(--bad) 44%,var(--text))}.sheet-wide{width:100%;min-height:48px;font-size:16px}
/* Wider screens: the sheet is a centred panel, not a full-width drawer. */
@media(min-width:701px){.sheet-panel{left:50%;right:auto;width:min(560px,calc(100% - 32px));border-radius:20px 20px 0 0;transform:translate(-50%,100%)}.sheet.open .sheet-panel{transform:translateX(-50%)}}
.quick-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:6px 0 4px}
.quick-actions button{display:grid;justify-items:center;gap:6px;padding:16px 6px;border-radius:14px;border:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));background:color-mix(in srgb,var(--cyan) 9%,var(--bg));color:color-mix(in srgb,var(--muted) 8%,var(--text));font-size:12px;font-weight:650}
.quick-actions span{font-size:24px}
.stepper{display:grid;grid-template-columns:52px minmax(0,1fr) 52px;align-items:center;background:color-mix(in srgb,var(--blue) 4%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));border-radius:14px;overflow:hidden}
.stepper button{height:52px;border:0;background:color-mix(in srgb,var(--cyan) 12%,var(--bg));color:var(--text);font-size:24px;font-weight:700}
.stepper output{text-align:center;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.stepper.big{grid-template-columns:64px 1fr 64px;margin:10px 0}.stepper.big button{height:64px}.stepper.big output{font-size:34px}
.rpe-pick{padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg))}.rpe-pick strong{display:block}.rpe-pick small{color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.rpe-scale{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px;margin-top:8px}.rpe-scale button{height:40px;border-radius:8px;border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));background:color-mix(in srgb,var(--cyan) 9%,var(--bg));color:var(--text);font-weight:700}
.gym-mode{position:fixed;inset:0;z-index:70;background:var(--bg);color:color-mix(in srgb,var(--muted) 2%,var(--text));display:flex;flex-direction:column;padding:calc(10px + env(safe-area-inset-top)) 16px calc(14px + env(safe-area-inset-bottom));overflow:auto}
body.gym-mode-open{overflow:hidden}
.gm-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.gm-progress{height:5px;border-radius:9px;background:color-mix(in srgb,var(--cyan) 13%,var(--bg));overflow:hidden;margin:10px 0 18px}.gm-progress i{display:block;height:100%;background:var(--green)}
.gm-body{flex:1;display:flex;flex-direction:column;max-width:520px;width:100%;margin:0 auto}
.gm-body h2{font-size:28px;margin:4px 0 2px;line-height:1.15}
.gm-steppers{display:grid;gap:14px;margin-top:18px}.gm-steppers .label{display:block;margin-bottom:6px}
.gm-steppers .stepper{grid-template-columns:72px 1fr 72px}.gm-steppers .stepper button{height:72px;font-size:30px}.gm-steppers .stepper output{font-size:38px}
.gm-rpe{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:6px}.gm-rpe button{height:44px;border-radius:10px;border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));background:color-mix(in srgb,var(--blue) 9%,var(--bg));color:var(--text);font-weight:700}.gm-rpe button[aria-pressed="true"]{background:var(--primary-surface);border-color:var(--primary)}
.gym-mode button,.gym-table button{touch-action:manipulation}
.gm-steppers .stepper input{width:100%;min-width:0;height:72px;background:color-mix(in srgb,var(--blue) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 42%,var(--bg));border-radius:10px;color:var(--text);text-align:center;font-size:38px;font-weight:800;font-variant-numeric:tabular-nums}
.gm-clock{max-width:520px;width:100%;margin:0 auto 12px;color:color-mix(in srgb,var(--muted) 86%,var(--text));font-size:12px}.gm-clock.over{color:color-mix(in srgb,var(--amber) 59%,var(--text))}
.gm-input-hint{margin:8px 0;color:var(--muted);font-size:12px}.gm-rpe-hint{margin:6px 0 10px;color:var(--muted);font-size:12px}
.gm-done{margin-top:auto;min-height:60px;font-size:18px;border-radius:16px}
.gm-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;max-width:520px;width:100%;margin-inline:auto}.gm-nav .btn{min-height:46px}
.gm-rest{display:grid;justify-items:center;gap:16px;margin:auto 0}
.gm-rest-ring{width:180px;height:180px;border-radius:50%;display:grid;place-items:center;align-content:center;background:radial-gradient(circle at center,var(--bg) 62%,transparent 63%),conic-gradient(var(--sky) calc(var(--p)*1%),color-mix(in srgb,var(--cyan) 13%,var(--bg)) 0)}
.gm-rest-ring b{font-size:42px;font-variant-numeric:tabular-nums}.gm-rest-ring small{color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.gm-rest-actions{display:flex;gap:10px}.gm-rest-actions .btn{min-height:48px;min-width:120px}
.gm-empty{margin:auto;text-align:center;display:grid;gap:10px;justify-items:center}.gm-check{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--green) 21%,var(--bg));color:var(--green);font-size:42px}
@media(max-width:700px){
  .nav button[data-view="overview"]{display:none!important}
  .nav{grid-template-columns:repeat(6,minmax(0,1fr))!important}
  .fab{display:grid;place-items:center;position:fixed;right:16px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:31;width:58px;height:58px;border-radius:50%;border:0;background:var(--primary);color:#fff;font-size:32px;font-weight:300;line-height:1;box-shadow:0 10px 26px #0009}
  .fab[hidden]{display:none}
  .today-head h1{font-size:30px}.today-layout{display:block}.tl-verb{display:none}
}
/* Výživa: day overview, meals, quick logging, amount wheel, scanner, drinks */
.nutrition-home{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-bottom:14px;align-items:start}
#enteredFood{display:none!important}
.do-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}.do-head h3{margin:0}.do-head small{color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.do-ring-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;text-align:center;gap:8px;margin:8px 0 16px}
.do-ring-row b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.do-ring-row span{display:block;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.do-burned-source{display:block;margin-top:2px;font-size:12px;line-height:1.3;color:color-mix(in srgb,var(--muted) 77%,var(--bg))}.form-word{font-size:13px;font-weight:600;color:color-mix(in srgb,var(--muted) 94%,var(--bg));margin-left:4px;letter-spacing:0}.food-tags{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 2px}.food-tag{display:inline-block;padding:2px 7px;border-radius:999px;font-size:12px;line-height:1.4;background:color-mix(in srgb,var(--cyan) 12%,var(--bg));color:color-mix(in srgb,var(--muted) 89%,var(--text))}.food-tag.tag-good{background:color-mix(in srgb,color-mix(in srgb,var(--green) 90%,var(--bg)) 14%,transparent);color:color-mix(in srgb,var(--green) 72%,var(--text))}.food-tag.tag-warn{background:color-mix(in srgb,color-mix(in srgb,var(--warn) 96%,var(--bg)) 14%,transparent);color:color-mix(in srgb,var(--warn) 86%,var(--text))}.ml-entry{flex-wrap:wrap}.ml-entry>span:first-child{flex:1 1 220px;min-width:0}.ml-entry-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end}@media(max-width:600px){.ml-entry-actions{flex-basis:100%;justify-content:flex-start}}.ml-entry-actions .btn{white-space:nowrap;padding:6px 9px;font-size:12px}.quick-meals,.quick-days{margin:6px 0 14px}
.do-ring{width:150px;height:150px;border-radius:50%;display:grid;place-content:center;background:radial-gradient(circle at center,color-mix(in srgb,var(--muted) 7%,var(--bg)) 66%,transparent 67%),conic-gradient(var(--primary) calc(var(--p)*1%),color-mix(in srgb,var(--muted) 21%,var(--bg)) 0)}.do-ring b{font-size:30px}
.do-macros{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}
.do-macro{display:grid;gap:5px;text-align:center}.do-macro span{font-size:12px;color:color-mix(in srgb,var(--muted) 51%,var(--text))}.do-macro i{display:block;height:6px;border-radius:9px;background:color-mix(in srgb,var(--muted) 21%,var(--bg));overflow:hidden}.do-macro i b{display:block;height:100%;border-radius:9px}.do-macro small{font-size:12px;font-variant-numeric:tabular-nums}
.do-water{border-top:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));padding-top:12px}.do-water-head{display:flex;justify-content:space-between;gap:8px;font-size:14px}.do-water-head span{font-variant-numeric:tabular-nums}
.do-water-bar{display:block;height:8px;border-radius:9px;background:color-mix(in srgb,var(--cyan) 15%,var(--bg));margin:8px 0;overflow:hidden}.do-water-bar b{display:block;height:100%;background:var(--sky);border-radius:9px}
.do-water-actions{display:flex;gap:6px;flex-wrap:wrap}.do-water-actions .btn{padding:8px 12px;font-size:13px}.do-water-note{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px;margin-top:8px;line-height:1.5}
.ml-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg))}.ml-row:last-of-type{border-bottom:0}
.ml-main{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:center;background:none;border:0;color:inherit;text-align:left;padding:0;min-width:0;font:inherit;cursor:pointer}
.ml-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--cyan) 12%,var(--bg));border:3px solid color-mix(in srgb,var(--muted) 21%,var(--bg));font-size:20px}
.ml-text{min-width:0}.ml-text strong{display:block;font-size:15px}.ml-text small{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ml-add{width:40px;height:40px;border-radius:50%;border:0;background:color-mix(in srgb,var(--muted) 8%,var(--text));color:color-mix(in srgb,var(--blue) 4%,var(--bg));font-size:24px;font-weight:600;line-height:1;cursor:pointer}
.ml-entries{grid-column:1/-1;padding:2px 0 2px 56px;display:grid;gap:8px}.ml-entry{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:13px}.ml-entry small{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.ml-entry .btn{padding:5px 10px;font-size:12px}
.ml-settings{padding:5px 10px;font-size:12px}#mealSettingsBox{margin-top:10px}#mealSettingsBox .meal-preferences{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:13px}
#foodEntry .food-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
#foodEntry .food-quick{display:grid!important;justify-items:center;align-content:center;gap:4px;padding:10px 4px!important;font-size:18px;text-align:center;min-height:0!important;line-height:1}#foodEntry .food-quick span{font-size:12px;font-weight:600;line-height:1.2}
.meal-chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.meal-chips .btn{padding:6px 10px;font-size:12px;border-radius:999px}.meal-chips .btn.active{background:color-mix(in srgb,var(--primary) 20%,var(--bg));border-color:var(--primary);color:color-mix(in srgb,var(--primary) 37%,var(--text))}
.food-compose{width:100%;margin-top:8px;font-size:13px}#foodQuickAmounts[hidden],#foodEditor .simple-food-fractions[hidden]{display:none!important}
.amount-wheel{position:relative;display:grid;grid-template-columns:1fr 1fr 2fr;gap:4px;height:180px;margin:12px 0;background:color-mix(in srgb,var(--cyan) 4%,var(--bg));border-radius:14px;overflow:hidden}.amount-wheel.two{grid-template-columns:1fr 2fr}
.amount-wheel:before{content:'';position:absolute;left:6px;right:6px;top:72px;height:36px;border-radius:10px;background:color-mix(in srgb,var(--muted) 17%,var(--bg));pointer-events:none}
.wheel-col{position:relative;height:180px;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;-webkit-mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent)}.wheel-col::-webkit-scrollbar{display:none}
.wheel-pad{height:72px}.wheel-item{height:36px;line-height:36px;text-align:center;scroll-snap-align:center;font-size:18px;color:color-mix(in srgb,var(--muted) 75%,var(--bg));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px;cursor:pointer;position:relative}.wheel-item.on{color:var(--text);font-weight:600}
.scan-box{position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:4/3}.scan-box video{width:100%;height:100%;object-fit:cover;display:block}
.scan-frame{position:absolute;left:12%;right:12%;top:33%;bottom:33%;border:3px solid var(--primary);border-radius:12px;box-shadow:0 0 0 999px #0008}.scan-photo{margin-top:10px;display:block;text-align:center}
.fluid-kinds,.fluid-amounts{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.fluid-kinds .btn.active{background:color-mix(in srgb,var(--sky) 17%,var(--bg));border-color:var(--sky)}
.fluid-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg))}.fluid-row .btn{padding:4px 9px}.fluid-row small{display:block;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.tl-water .tl-icon{background:color-mix(in srgb,var(--sky) 17%,var(--bg))}
#todayMore{margin-top:16px}#todayMore .section{margin-top:20px}#todayMore .quick-grid .card{padding:13px}#todayMore .quick-grid .value{font-size:25px}
.food-panel{position:fixed;inset:0;z-index:70}.food-panel-backdrop{position:absolute;inset:0;background:#000a}
.food-panel-sheet{position:absolute;top:4vh;max-height:92vh;left:50%;transform:translateX(-50%);width:min(920px,calc(100% - 32px));overflow:auto;background:color-mix(in srgb,var(--cyan) 6%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 24%,var(--bg));border-radius:20px;padding:6px 18px 18px;box-shadow:0 24px 60px #000c}
.food-panel-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;background:color-mix(in srgb,var(--cyan) 6%,var(--bg));border-bottom:1px solid color-mix(in srgb,var(--muted) 19%,var(--bg));margin-bottom:8px}.food-panel-head h3{margin:0}
.food-panel #foodEntry{margin:0!important;border:0!important;background:none!important;padding:0!important;box-shadow:none!important}
body.food-panel-open{overflow:hidden}#nutrition>.grid2:has(>.card:only-child){grid-template-columns:1fr}#mealDistribution.replaced{display:none!important}
@media(max-width:700px){.food-panel-sheet{top:0;bottom:0;max-height:none;left:0;transform:none;width:100%;border-radius:0;border:0;padding:calc(6px + env(safe-area-inset-top)) 14px calc(18px + env(safe-area-inset-bottom))}}
.today-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.today-card-head{flex-wrap:wrap}.today-card-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.today-week-nav{display:inline-flex;align-items:center;gap:4px}.today-week-nav .small{white-space:nowrap;margin:0 2px}.today-card.loading{opacity:.55;pointer-events:none}.review-btn{padding:5px 10px!important;font-size:12px!important;min-height:0!important}
.review-card{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--blue) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 19%,var(--bg));margin-bottom:10px}.review-card ul{margin:6px 0;padding-left:18px;display:grid;gap:4px;font-size:13px}.review-card h4{margin:10px 0 2px;font-size:13px}
.review-verdict{font-weight:700;font-size:15px}.verdict-ok .review-verdict{color:var(--primary)}.verdict-adjust .review-verdict{color:color-mix(in srgb,var(--warn) 84%,var(--text))}.verdict-swap .review-verdict{color:color-mix(in srgb,var(--blue) 58%,var(--text))}.verdict-rest .review-verdict{color:color-mix(in srgb,var(--bad) 63%,var(--text))}.review-headline{margin:6px 0;font-size:14px}

.mini-rings{grid-template-columns:repeat(4,minmax(0,1fr))!important}
@media(max-width:900px){.nutrition-home{grid-template-columns:1fr}}
@media(max-width:700px){#nutrition.active>.nutrition-home{order:-3}#nutrition.active>#foodEntry{order:-2}.mini-ring-dial{width:54px!important;height:54px!important}.mini-ring-dial b{font-size:13px!important}.do-ring{width:132px;height:132px}.do-ring b{font-size:26px}#foodEntry .food-quick{font-size:16px}}
.planner-chip .proposal{color:color-mix(in srgb,var(--violet) 14%,var(--text));font-weight:650}
.chip-actions{display:flex;gap:4px;flex-basis:100%;flex-wrap:wrap;margin-top:2px}.chip-actions .btn{padding:3px 7px;font-size:12px;border-radius:6px}
#proposeWeek{padding:7px 12px;font-size:12px}
.gym-date{display:inline-flex;align-items:center;gap:6px;margin-top:4px}.gym-date input{background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:var(--text);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.availability-grid{display:grid;gap:8px;margin:14px 0}.availability-row{display:grid;grid-template-columns:85px 1fr 100px;gap:10px;align-items:center;padding:10px;border:1px solid color-mix(in srgb,var(--muted) 26%,var(--bg));border-radius:12px}.availability-row label{font-size:12px}.availability-row input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:9px;border-radius:8px;background:color-mix(in srgb,var(--blue) 6%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));color:var(--text)}.availability-sports{grid-column:2/4;display:flex;gap:10px;flex-wrap:wrap}.availability-sports label{white-space:nowrap}#availabilityCount{width:80px;padding:8px;background:color-mix(in srgb,var(--blue) 6%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));border-radius:8px}.status-choices{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}#athleteStatusNote{display:block;width:100%;box-sizing:border-box;min-height:72px;background:color-mix(in srgb,var(--blue) 6%,var(--bg));color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));border-radius:10px;padding:10px}.athlete-status{margin-top:10px;padding:7px 12px;font-size:13px}#athleteStatusBox{display:flex;gap:8px;align-items:center}.coach-advice{margin-top:12px}.coach-advice p{font-size:13px}.assistant-fab{position:fixed;bottom:24px;right:24px;z-index:35;background:var(--primary-surface);border:1px solid var(--primary);border-radius:24px;color:var(--primary-text);padding:12px 18px;font-size:14px;font-weight:650;box-shadow:0 4px 22px #0005;cursor:pointer}.assistant-fab.has-advice{border-color:color-mix(in srgb,var(--warn) 84%,var(--text))}.coach-turn{padding:10px 14px;border-radius:12px;margin:8px 0;background:color-mix(in srgb,var(--blue) 10%,var(--bg))}.coach-turn.user{background:color-mix(in srgb,var(--lilac) 16%,var(--bg))}.coach-turn p{white-space:pre-wrap;margin:5px 0;font-size:14px}.memory-row{display:flex;gap:12px;justify-content:space-between;align-items:center;border-bottom:1px solid color-mix(in srgb,var(--muted) 26%,var(--bg));padding:10px 0;font-size:13px}.week-proposal-list{display:grid;gap:8px;margin:14px 0}.week-proposal-list>div,.gym-preview-rows>div{display:grid;gap:4px;background:color-mix(in srgb,var(--blue) 10%,var(--bg));border-radius:10px;padding:10px}.week-proposal-list small{color:color-mix(in srgb,var(--muted) 82%,var(--text))}.gym-preview-rows{display:grid;gap:6px;margin:14px 0}.gym-preview-rows span{font-size:12px;color:color-mix(in srgb,var(--muted) 82%,var(--text))}.hub-availability{font-size:12px;color:color-mix(in srgb,var(--violet) 40%,var(--text));padding:6px 0}.assistant-dialog{max-height:85dvh;overflow:auto}
@media(max-width:700px){.availability-row{grid-template-columns:65px 1fr 85px;gap:6px;padding:8px}.availability-sports{gap:6px;font-size:12px}.assistant-fab{left:16px;right:auto;bottom:84px;padding:10px 14px}#editWeekAvailability{font-size:12px}.assistant-dialog{max-width:calc(100vw - 20px);width:calc(100vw - 20px);box-sizing:border-box}}

/* Personal controls: soft status cards and a simple weekly time rhythm. */
.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
body.sheet-open{overflow:hidden}
.status-active{--status-color:color-mix(in srgb,var(--primary) 92%,var(--bg));--status-rgb:120,217,181}
.status-sick{--status-color:var(--warn);--status-rgb:242,197,92}
.status-injured{--status-color:#f59d8f;--status-rgb:245,157,143}
.status-on_break{--status-color:color-mix(in srgb,var(--blue) 78%,var(--text));--status-rgb:146,173,243}
#athleteStatusBox{margin:0 0 18px;display:block}
.athlete-status{display:flex;align-items:center;gap:12px;margin:0;padding:8px 14px 8px 8px;width:min(340px,100%);text-align:left;color:color-mix(in srgb,var(--muted) 4%,var(--text));background:linear-gradient(130deg,color-mix(in srgb,var(--muted) 17%,var(--bg)),color-mix(in srgb,var(--muted) 10%,var(--bg)));border:1px solid color-mix(in srgb,var(--text) 7.1%,transparent);border-radius:999px;box-shadow:0 8px 24px #0003,inset 0 1px 0 color-mix(in srgb,var(--text) 2.7%,transparent);cursor:pointer}
.status-orb{display:grid;place-items:center;width:48px;height:48px;flex:0 0 48px;color:#fff;background:radial-gradient(circle at 30% 18%,color-mix(in srgb,var(--text) 28.2%,transparent),transparent 60%),var(--status-color);border-radius:40%;box-shadow:inset 0 1px 3px color-mix(in srgb,var(--text) 53.3%,transparent),inset 0 -3px 6px #0002,0 3px 12px rgba(var(--status-rgb),.25)}
.status-orb svg{width:29px;height:29px;filter:drop-shadow(0 1px 1px #0002)}
.status-current-copy{display:grid;gap:3px;min-width:0;flex:1}.status-current-copy strong{font-size:16px;font-weight:650}.status-current-copy small{color:color-mix(in srgb,var(--muted) 93%,var(--text));font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status-chevron{width:18px;height:18px;color:color-mix(in srgb,var(--muted) 93%,var(--text));flex-shrink:0}
.status-sheet .sheet-panel,.availability-sheet .sheet-panel{background:color-mix(in srgb,var(--muted) 9%,var(--bg));border:1px solid color-mix(in srgb,var(--text) 7.8%,transparent);border-radius:28px 28px 0 0;padding:10px 22px 20px;box-shadow:0 24px 80px #0008;max-height:92dvh}
.status-sheet .sheet-head,.availability-sheet .sheet-head{position:sticky;top:-10px;z-index:3;background:color-mix(in srgb,var(--muted) 9%,var(--bg));padding:14px 0 10px;margin:0;border-bottom:0}
.status-sheet .sheet-head h3,.availability-sheet .sheet-head h3{font-size:20px;font-weight:650}
.status-sheet .sheet-head .btn,.availability-sheet .sheet-head .btn{background:color-mix(in srgb,var(--text) 3.1%,transparent);border:0;border-radius:50%;width:34px;height:34px;padding:0;color:color-mix(in srgb,var(--muted) 77%,var(--text))}
.status-intro{font-size:13px;line-height:1.6;color:color-mix(in srgb,var(--muted) 95%,var(--bg));margin:2px 0 18px}
.status-choices{display:grid;gap:10px;margin:0 0 18px}
.status-choice{position:relative;display:flex;align-items:center;gap:14px;min-height:80px;box-sizing:border-box;padding:14px 16px;border-radius:22px;border:1px solid color-mix(in srgb,var(--text) 4.3%,transparent);background:linear-gradient(120deg,color-mix(in srgb,var(--muted) 17%,var(--bg)),color-mix(in srgb,var(--muted) 14%,var(--bg)));box-shadow:0 5px 12px #0002;cursor:pointer;transition:border-color .15s,background .15s}
.status-choice input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.status-choice:has(input:checked){border-color:rgba(var(--status-rgb),.65);background:linear-gradient(120deg,rgba(var(--status-rgb),.12),color-mix(in srgb,var(--cyan) 14%,var(--bg)))}
.status-choice:has(input:focus-visible){outline:2px solid var(--status-color);outline-offset:3px}
.status-choice-copy{display:grid;gap:4px;flex:1;min-width:0}.status-choice-copy strong{font-size:16px;font-weight:650}.status-choice-copy small{font-size:12px;color:color-mix(in srgb,var(--muted) 86%,var(--text));line-height:1.4}
.status-radio{display:grid;place-items:center;width:21px;height:21px;flex:0 0 21px;border:1.5px solid color-mix(in srgb,var(--text) 22%,transparent);border-radius:50%}.status-choice:has(input:checked) .status-radio{border-color:var(--status-color)}.status-choice:has(input:checked) .status-radio:after{content:'';width:11px;height:11px;border-radius:50%;background:var(--status-color)}
.status-duration{display:grid;gap:8px;border:1px solid color-mix(in srgb,var(--text) 6.3%,transparent);border-radius:16px;padding:13px 15px;font-size:12px;color:color-mix(in srgb,var(--muted) 89%,var(--bg))}.status-duration select,.status-duration input{width:100%;box-sizing:border-box;min-height:42px;background:color-mix(in srgb,var(--blue) 6%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 34%,var(--bg));border-radius:10px;color:color-mix(in srgb,var(--muted) 18%,var(--text));font-size:14px;padding:9px 10px}.status-duration label{display:grid;gap:7px}.status-duration label[hidden]{display:none}.status-duration small{font-size:12px;line-height:1.5}
.status-note{margin:14px 0 0;color:color-mix(in srgb,var(--muted) 95%,var(--bg));font-size:12px}.status-note summary{cursor:pointer;padding:5px 0}.status-note textarea{margin-top:8px;min-height:70px!important}
.control-sheet-footer{position:sticky;bottom:-20px;z-index:2;padding:16px 0 0;background:linear-gradient(transparent,color-mix(in srgb,var(--muted) 9%,var(--bg)) 12px)}
.control-sheet-footer .small{font-size:12px;color:color-mix(in srgb,var(--muted) 87%,var(--bg));margin:0 0 9px}
.status-save.btn.primary{width:100%;border:0;border-radius:999px;background:color-mix(in srgb,var(--muted) 6%,var(--text));color:color-mix(in srgb,var(--cyan) 7%,var(--bg));min-height:48px;font-size:15px;font-weight:650;margin-top:4px}
.availability-scope{display:inline-block;padding:4px 9px;border-radius:999px;background:color-mix(in srgb,var(--text) 2.7%,transparent);color:color-mix(in srgb,var(--muted) 92%,var(--text));font-size:12px;margin-bottom:12px}
.availability-intro{display:grid;grid-template-columns:1fr auto;column-gap:14px;margin-bottom:12px}.availability-eyebrow{font-size:12px;color:color-mix(in srgb,var(--muted) 86%,var(--bg));letter-spacing:.05em}.availability-intro p{grid-column:1;margin:6px 0 0;font-size:13px;color:color-mix(in srgb,var(--muted) 40%,var(--text));line-height:1.5}.availability-total{grid-column:2;grid-row:1/3;display:grid;align-content:center;text-align:right;gap:4px}.availability-total strong{font-size:19px;color:color-mix(in srgb,var(--primary) 98%,var(--bg));white-space:nowrap}.availability-total span{font-size:12px;color:color-mix(in srgb,var(--muted) 86%,var(--bg))}
.availability-grid{display:grid;gap:0;margin:0 0 18px}.availability-row{display:block;background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--text) 3.5%,transparent);border-radius:0;padding:10px 0 12px}.availability-day-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.availability-day-head>label{font-size:13px;font-weight:550;color:color-mix(in srgb,var(--muted) 26%,var(--text))}
.availability-duration{display:flex;align-items:center;gap:9px;padding:5px 10px;border:0;border-radius:999px;background:color-mix(in srgb,color-mix(in srgb,var(--primary) 95%,var(--bg)) 10.6%,transparent);color:color-mix(in srgb,var(--green) 56%,var(--text));font-size:12px;font-weight:650;cursor:pointer;font-variant-numeric:tabular-nums;min-width:90px;justify-content:center}.availability-duration>span:last-child{opacity:.6}.availability-row.no-time .availability-duration{background:color-mix(in srgb,var(--text) 3.1%,transparent);color:color-mix(in srgb,var(--muted) 86%,var(--bg))}.availability-row.unspecified .availability-duration{background:transparent;color:color-mix(in srgb,var(--muted) 64%,var(--bg))}
.availability-row input[type=range]{display:block;width:100%;height:16px;margin:0;padding:0;border:0;border-radius:0;background:none;appearance:none;-webkit-appearance:none;cursor:pointer;outline-offset:5px;--fill:0%}
.availability-row input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:linear-gradient(to right,color-mix(in srgb,var(--primary) 93%,var(--bg)) 0 var(--fill),color-mix(in srgb,var(--muted) 27%,var(--bg)) var(--fill) 100%)}
.availability-row input[type=range]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:16px;height:16px;margin-top:-6px;border:3px solid color-mix(in srgb,var(--primary) 56%,var(--text));border-radius:50%;background:color-mix(in srgb,var(--green) 67%,var(--muted));box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 7.1%,transparent)}
.availability-row input[type=range]::-moz-range-track{height:4px;border-radius:4px;background:color-mix(in srgb,var(--muted) 27%,var(--bg))}.availability-row input[type=range]::-moz-range-progress{height:4px;border-radius:4px;background:color-mix(in srgb,var(--primary) 93%,var(--bg))}.availability-row input[type=range]::-moz-range-thumb{width:12px;height:12px;border:2px solid color-mix(in srgb,var(--primary) 56%,var(--text));border-radius:50%;background:color-mix(in srgb,var(--green) 67%,var(--muted))}.availability-row.no-time input[type=range]::-webkit-slider-thumb{background:color-mix(in srgb,var(--muted) 46%,var(--bg));border-color:color-mix(in srgb,var(--muted) 81%,var(--bg));box-shadow:none}
.availability-exact:not([hidden]){display:flex;align-items:flex-end;gap:10px;padding:10px 0 0}.availability-exact label{display:grid;gap:4px;color:color-mix(in srgb,var(--muted) 87%,var(--bg));font-size:12px}.availability-exact input[type=number]{width:80px;padding:7px;background:color-mix(in srgb,var(--blue) 6%,var(--bg))}.availability-exact .btn{padding:8px 12px;font-size:12px}
.availability-frequency{padding:14px;border-radius:18px;border:1px solid color-mix(in srgb,var(--text) 4.3%,transparent);background:color-mix(in srgb,var(--text) 1.2%,transparent)}.availability-frequency-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.availability-frequency-head>label{font-size:13px;font-weight:550}.availability-frequency-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}#availabilityCount{width:64px;height:40px;box-sizing:border-box;text-align:center;font-size:16px;font-weight:650;background:color-mix(in srgb,var(--blue) 6%,var(--bg));border-color:color-mix(in srgb,var(--muted) 34%,var(--bg))}#availabilityCount:disabled{opacity:.4}
.history-toggle{display:flex;gap:6px;align-items:center;font-size:12px;white-space:nowrap;color:color-mix(in srgb,var(--muted) 53%,var(--text))}.history-toggle input{width:16px;height:16px;accent-color:var(--primary);margin:0}.availability-history-note{font-size:12px;line-height:1.6;color:color-mix(in srgb,var(--muted) 88%,var(--bg));margin:12px 0 0}.availability-history-note.from-history{color:color-mix(in srgb,var(--muted) 83%,var(--text))}
.availability-save.btn.primary{width:100%;border:0;border-radius:999px;background:var(--primary);color:color-mix(in srgb,var(--green) 13%,var(--bg));min-height:46px;font-size:14px;font-weight:650}.availability-reset{width:100%;margin-top:7px;border:0;background:transparent;font-size:12px}

/* Hydration can be logged in place, with recent entries and all common sizes. */
.do-water{margin-top:8px;padding:18px 0 0}.do-water-head{align-items:center}.hydration-eyebrow{font-size:12px;letter-spacing:.07em;color:color-mix(in srgb,var(--muted) 85%,var(--bg));text-transform:uppercase}.do-water-head h4{font-size:18px;margin:4px 0 0}.hydration-total{text-align:right;display:grid;gap:3px}.hydration-total strong{font-size:23px;font-weight:650;color:color-mix(in srgb,var(--sky) 69%,var(--text))}.hydration-total span{font-size:12px;color:color-mix(in srgb,var(--muted) 88%,var(--bg))}.do-water-bar{height:6px;margin:13px 0 16px}.do-water-bar b{background:linear-gradient(90deg,color-mix(in srgb,var(--cyan) 81%,var(--bg)),color-mix(in srgb,var(--sky) 67%,var(--text)))}
.hydration-kinds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:10px}.hydration-kind{display:grid;justify-items:center;gap:5px;padding:10px 4px;background:color-mix(in srgb,var(--text) 1.2%,transparent);border:1px solid color-mix(in srgb,var(--text) 3.5%,transparent);border-radius:13px;color:color-mix(in srgb,var(--muted) 92%,var(--bg));font-size:12px;cursor:pointer;min-width:0}.hydration-kind>span{font-size:19px}.hydration-kind.active{border-color:color-mix(in srgb,color-mix(in srgb,var(--sky) 92%,var(--bg)) 43.9%,transparent);background:color-mix(in srgb,var(--sky) 7.1%,transparent);color:color-mix(in srgb,var(--sky) 41%,var(--text));box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text) 2.7%,transparent)}
.do-water-actions{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.do-water-actions .btn{min-width:0;padding:10px 3px;font-size:12px;border-radius:10px;background:color-mix(in srgb,var(--cyan) 12%,var(--bg));border-color:color-mix(in srgb,var(--cyan) 28%,var(--bg));color:color-mix(in srgb,var(--cyan) 33%,var(--text));white-space:nowrap;font-variant-numeric:tabular-nums}
.hydration-custom{display:flex;gap:8px;margin-top:10px}.hydration-custom>div{display:flex;align-items:center;gap:6px;background:color-mix(in srgb,var(--cyan) 5%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 24%,var(--bg));border-radius:11px;flex:1;min-width:0;padding:0 12px}.hydration-custom input{border:0;background:none;color:color-mix(in srgb,var(--cyan) 8%,var(--text));width:100%;min-width:0;outline:none;padding:11px 0;font-size:12px}.hydration-custom input::placeholder{color:color-mix(in srgb,var(--muted) 71%,var(--bg))}.hydration-custom>div>span{color:color-mix(in srgb,var(--muted) 82%,var(--bg));font-size:12px;flex:0 0 auto;white-space:nowrap}.hydration-custom .btn.primary{border-radius:11px;background:color-mix(in srgb,var(--sky) 73%,var(--text));color:color-mix(in srgb,var(--blue) 15%,var(--bg));border:0;font-size:12px;padding:8px 16px}
.hydration-recent{margin-top:16px}.hydration-recent-head{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:color-mix(in srgb,var(--muted) 81%,var(--bg));padding-bottom:5px}.hydration-recent-head button,.hydration-history-link{border:0;background:transparent;color:color-mix(in srgb,var(--sky) 36%,var(--muted));padding:3px 0;font-size:12px;cursor:pointer}.hydration-history-link{margin-top:12px}
.hydration-entry{display:grid;grid-template-columns:24px 1fr auto 24px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--text) 2.7%,transparent)}.hydration-entry>span:first-child{font-size:17px}.hydration-entry>div{display:grid;gap:2px;min-width:0}.hydration-entry strong{font-size:12px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.hydration-entry small{font-size:12px;color:color-mix(in srgb,var(--muted) 76%,var(--bg))}.hydration-entry>b{font-size:12px;color:color-mix(in srgb,var(--muted) 61%,var(--text));font-weight:500}.hydration-entry>button{border:0;background:color-mix(in srgb,var(--text) 2%,transparent);border-radius:50%;width:24px;height:24px;color:color-mix(in srgb,var(--muted) 77%,var(--bg));cursor:pointer}.do-water-note{font-size:12px;color:color-mix(in srgb,var(--muted) 71%,var(--bg));margin-top:12px;line-height:1.5}
.availability-sheet #sheetBody .availability-history-note{font-size:12px;line-height:1.6;color:color-mix(in srgb,var(--muted) 88%,var(--bg))}.availability-sheet #sheetBody .availability-intro p{font-size:13px}.status-sheet #sheetBody .status-intro{font-size:13px;color:color-mix(in srgb,var(--muted) 95%,var(--bg))}
@media(min-width:701px){.status-sheet .sheet-panel,.availability-sheet .sheet-panel{width:min(520px,calc(100% - 32px));left:50%;top:50%;bottom:auto;border-radius:28px;transform:translate(-50%,-45%)}.status-sheet.open .sheet-panel,.availability-sheet.open .sheet-panel{transform:translate(-50%,-50%)}.availability-sheet .sheet-panel{width:min(560px,calc(100% - 32px))}}
@media(max-width:700px){.status-sheet .sheet-panel,.availability-sheet .sheet-panel{padding:8px 18px 20px}.status-sheet .sheet-head,.availability-sheet .sheet-head{top:-8px}.status-choice{padding:13px 14px;min-height:78px;gap:12px}.status-choice-copy small{font-size:12px}.status-choice .status-orb{width:45px;height:45px;flex-basis:45px}.availability-row{padding:8px 0 10px}.availability-intro{column-gap:8px}.availability-intro p{font-size:12px}.availability-total strong{font-size:16px}.availability-frequency-head{align-items:flex-start;flex-direction:column;gap:10px}.availability-frequency-controls{width:100%;justify-content:space-between}.do-water-actions{grid-template-columns:repeat(3,minmax(0,1fr))}.do-water-actions .btn{font-size:12px;padding:10px 4px}.hydration-kind{font-size:12px;padding:9px 2px}.hydration-total strong{font-size:21px}}

/* Planner actions and the day's proposal on a chip (shown after 5 s of no changes). */
.planner-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}
.planner-action{display:inline-flex;align-items:center;gap:2px}
#plannerStatus{flex-basis:100%}
#plannerStatus:empty{display:none}
.planner-chip.picked{border-color:var(--primary);background:var(--primary-surface);box-shadow:0 0 0 2px rgba(var(--primary-rgb),.35)}
.planner-chip.cancelled{opacity:.65;border-style:dashed}
.planner-chip .chip-slot{font-size:12px;color:var(--primary-text);font-weight:700}
.planner-chip .chip-suggest{flex-basis:100%;margin:2px 0 0;padding:4px 6px;border:1px solid color-mix(in srgb,var(--lilac) 30%,var(--bg));border-radius:6px;background:color-mix(in srgb,var(--violet) 10%,var(--bg));color:color-mix(in srgb,var(--violet) 32%,var(--text));font-size:12px;font-weight:600;line-height:1.35;text-align:left;cursor:pointer;animation:chipSuggestIn .25s ease}
.planner-chip .chip-suggest:hover,.planner-chip .chip-suggest:focus-visible{background:color-mix(in srgb,var(--violet) 21%,var(--bg));color:var(--text);border-color:color-mix(in srgb,var(--violet) 88%,var(--bg));outline:none}
@keyframes chipSuggestIn{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.planner-chip .chip-suggest{animation:none}}
/* Doporučené tréninky */
.recommend-dialog{width:min(980px,calc(100vw - 32px));max-height:calc(100dvh - 48px);padding:0;border:1px solid color-mix(in srgb,var(--lilac) 28%,var(--bg));border-radius:20px;background:color-mix(in srgb,var(--blue) 5%,var(--bg));color:color-mix(in srgb,var(--muted) 8%,var(--text));box-shadow:0 24px 80px #000b;overflow:hidden}
.recommend-dialog[open]{display:flex;flex-direction:column}
.recommend-dialog::backdrop{background:color-mix(in srgb,var(--bg) 80%,transparent)}
.recommend-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg));background:color-mix(in srgb,var(--cyan) 7%,var(--bg));flex:none}
.recommend-head h3{margin:2px 0 0;font-size:19px}
.recommend-head-tools{display:flex;gap:8px;align-items:center}
.recommend-head .sport-switch{margin:0}
.recommend-scroll{overflow:auto;padding:16px 20px 22px;display:flex;flex-direction:column;gap:12px;min-height:0}
.recommend-scroll>*{flex-shrink:0}
.recommend-target{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:12px 14px;border:1px solid var(--primary-line);border-radius:12px;background:var(--primary-surface)}
.recommend-target strong{font-size:15px;flex-basis:100%;color:var(--text)}
.recommend-target .btn{margin-left:auto;padding:6px 10px;font-size:12px}
.daily-rec{border:1px solid color-mix(in srgb,var(--primary) 33%,var(--bg));border-radius:14px;background:color-mix(in srgb,var(--green) 7%,var(--bg));padding:14px}
.daily-rec-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.daily-rec-head h4{margin:3px 0 2px;font-size:16px}
.daily-rec-head p{margin:0}
.daily-rec-sports{display:flex;gap:6px;flex-wrap:wrap}
.daily-rec-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
.daily-rec-tools label{display:flex;gap:6px;align-items:center}
.daily-rec-tools select{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px}
.daily-rec #generatedWorkout:empty{display:none}
.recommend-focus{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.recommend-focus .btn{flex:none;white-space:nowrap;padding:7px 11px;font-size:12px}
.recommend-focus small{color:color-mix(in srgb,var(--warn) 80%,var(--muted));font-size:12px;font-weight:600}
.recommend-focus .btn.primary small{color:color-mix(in srgb,var(--amber) 20%,var(--bg))}
.workout-result.generated{grid-template-columns:minmax(0,1fr)}
.recommend-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.recommend-toolbar .small{color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.recommend-filters{border:1px solid color-mix(in srgb,var(--cyan) 17%,var(--bg));border-radius:12px;padding:12px;background:color-mix(in srgb,var(--blue) 4%,var(--bg))}
.recommend-context{margin:0}
.recommend-level summary{cursor:pointer;color:color-mix(in srgb,var(--muted) 59%,var(--text));font-size:13px;padding:6px 0}
.recommend-level .capability-grid{margin-top:8px}
@media(max-width:700px){
  .recommend-dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border:0;border-radius:0;margin:0}
  .recommend-head{padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top));flex-wrap:wrap}
  .recommend-head h3{font-size:17px}
  .recommend-head>div:first-child{flex:1 1 100%}
  .recommend-head-tools{width:100%}
  .recommend-head .sport-switch{flex:1}
  .recommend-head .sport-switch .btn{white-space:nowrap;padding:7px 8px;font-size:13px}
  .recommend-scroll{padding:12px 14px calc(24px + env(safe-area-inset-bottom))}
  .planner-actions{margin-left:0;width:100%}
  .planner-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .planner-action{grid-column:1/-1;display:flex}
  .planner-action .btn{flex:1}
  .planner-actions>.btn{padding:8px 6px;font-size:12px}
  .recommend-target .btn{margin-left:0}
}

/* Workout card: where, when and the numbers next to the button */
.workout-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.env-toggle{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--blue) 3%,var(--bg))}
.env-toggle .btn{padding:7px 6px;font-size:12px;border:0;border-radius:8px;background:transparent}
.env-toggle .btn.primary{background:color-mix(in srgb,var(--cyan) 21%,var(--bg));color:var(--text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cyan) 41%,var(--bg))}
.env-toggle .btn:disabled{opacity:.45;cursor:not-allowed}
.schedule-day-label{display:grid;gap:4px}
.schedule-day{width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px;font:inherit}
.workout-side .schedule-workout{width:100%}
.workout-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:0}
.workout-facts>div{background:color-mix(in srgb,var(--blue) 7%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 16%,var(--bg));border-radius:9px;padding:7px 9px;min-width:0}
.workout-facts dt{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb,var(--muted) 87%,var(--bg))}
.workout-facts dd{margin:2px 0 0;font-weight:700;font-variant-numeric:tabular-nums;font-size:13px;overflow-wrap:anywhere}
.env-notes{margin:0 0 8px;padding-left:18px;color:color-mix(in srgb,var(--muted) 74%,var(--text));font-size:12px;line-height:1.5}

/* Personal records: period switch, FTP and pace tiles, trend arrows */
.pr-period{display:flex;gap:4px;flex-wrap:wrap}
.pr-period .btn{padding:5px 9px;font-size:12px}
.pr-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:10px 0}
.pr-tile{display:grid;gap:3px;background:color-mix(in srgb,var(--blue) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--cyan) 18%,var(--bg));border-radius:12px;padding:10px 12px}
.pr-tile strong{font-size:22px;font-variant-numeric:tabular-nums}
.pr-tile small{color:color-mix(in srgb,var(--muted) 87%,var(--bg));font-size:12px}
.trend{display:inline-flex;align-items:center;gap:3px;width:max-content;padding:2px 7px;border-radius:999px;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;background:color-mix(in srgb,var(--cyan) 11%,var(--bg));color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.trend.up{background:color-mix(in srgb,var(--green) 17%,var(--bg));color:color-mix(in srgb,var(--green) 83%,var(--text))}
.trend.down{background:color-mix(in srgb,var(--bad) 18%,var(--bg));color:color-mix(in srgb,var(--bad) 73%,var(--text))}
.trend.flat{color:color-mix(in srgb,var(--muted) 59%,var(--text))}
.pr-table td{font-variant-numeric:tabular-nums}
.pr-extra{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.pr-extra b{color:color-mix(in srgb,var(--muted) 12%,var(--text))}

.pr-select{background:color-mix(in srgb,var(--cyan) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 25%,var(--bg));color:var(--text);border-radius:10px;padding:5px 8px;font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.pr-select.active{background:color-mix(in srgb,var(--primary) 82%,var(--text));border-color:color-mix(in srgb,var(--primary) 82%,var(--text));color:color-mix(in srgb,var(--green) 5%,var(--bg))}
.pr-select:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.pr-span{margin:2px 0 0;color:color-mix(in srgb,var(--muted) 87%,var(--bg))}
.pr-cardio .trend{font-size:12px;margin:2px 0}
/* Doporučené tréninky stands out next to Vygenerovat */
#openRecommendations{border-color:var(--primary-line);color:var(--primary-text)}
#openRecommendations:hover,#openRecommendations:focus-visible{background:linear-gradient(135deg,color-mix(in srgb,var(--violet) 90%,var(--bg)),color-mix(in srgb,var(--violet) 81%,var(--text)));outline:none}

.apple-steps{display:grid;gap:10px;margin:10px 0;padding-left:20px;font-size:13px;line-height:1.55;color:color-mix(in srgb,var(--muted) 51%,var(--text))}
.apple-steps a{color:var(--primary-text)}
.apple-steps .pill{margin-left:4px}

/* Chip: length menu and outdoor/indoor next to the sport */
.planner-chip .chip-line{flex-basis:100%;display:flex;gap:4px;align-items:stretch;flex-wrap:wrap;margin-top:2px}
.planner-chip .chip-line .chip-suggest{flex:1 1 120px;margin:0;flex-basis:auto}
.planner-chip .chip-time{margin:0;padding:4px 6px;border:1px solid color-mix(in srgb,var(--lilac) 30%,var(--bg));border-radius:6px;background:color-mix(in srgb,var(--violet) 7%,var(--bg));color:color-mix(in srgb,var(--violet) 14%,var(--text));font-size:12px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.planner-chip .chip-time.chosen{border-color:var(--primary);color:var(--text)}
.planner-chip .chip-env{margin:0 0 0 2px;padding:1px 6px;border:1px solid color-mix(in srgb,var(--cyan) 30%,var(--bg));border-radius:999px;background:color-mix(in srgb,var(--blue) 7%,var(--bg));color:color-mix(in srgb,var(--muted) 51%,var(--text));font-size:12px;font-weight:700}
.planner-chip .chip-env.indoor{border-color:color-mix(in srgb,var(--blue) 64%,var(--bg));color:color-mix(in srgb,var(--blue) 42%,var(--text));background:color-mix(in srgb,var(--blue) 9%,var(--bg))}
.planner-chip .chip-env.chosen{box-shadow:0 0 0 1px var(--primary)}
.planner-chip .chip-time:hover,.planner-chip .chip-env:hover,.planner-chip .chip-time:focus-visible,.planner-chip .chip-env:focus-visible{color:var(--text);border-color:var(--primary);outline:none}
.chip-menu{position:fixed;z-index:70;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:6px;min-width:170px;border:1px solid var(--primary-line);border-radius:10px;background:var(--panel);box-shadow:0 14px 40px #000a}
.chip-menu button{padding:7px 8px;border:1px solid color-mix(in srgb,var(--lilac) 21%,var(--bg));border-radius:7px;background:color-mix(in srgb,var(--violet) 12%,var(--bg));color:color-mix(in srgb,var(--muted) 21%,var(--text));font:inherit;font-size:12px;font-weight:650;text-align:left;cursor:pointer}
.chip-menu button:first-child{grid-column:1/-1}
.chip-menu button[aria-checked="true"]{background:var(--primary-surface);border-color:var(--primary);color:var(--text)}
.chip-menu button:hover,.chip-menu button:focus-visible{border-color:var(--primary);outline:none}
.hub-plan .planner-chip{position:relative;padding-right:22px}
.hub-plan .planner-chip [data-chip-remove]{position:absolute;top:5px;right:5px;margin:0}
.week-proposal-done{display:grid;gap:6px}.week-proposal-done p{margin:0}
.gm-help{display:flex;gap:8px;margin:0 0 12px}.gm-help .gm-assistant{margin:0}
.gm-why{margin:-6px 0 12px;color:var(--muted,color-mix(in srgb,var(--muted) 92%,var(--bg)))}
.gm-technique{font-size:13px;padding:7px 12px;border-color:color-mix(in srgb,var(--cyan) 32%,var(--bg));background:color-mix(in srgb,var(--cyan) 10%,var(--bg))}
.gm-edit-toggle{font-size:13px;padding:7px 12px;border-color:color-mix(in srgb,var(--cyan) 32%,var(--bg));background:color-mix(in srgb,var(--cyan) 10%,var(--bg))}.gm-edit-toggle[aria-pressed="true"]{border-color:var(--primary);background:var(--primary-surface)}
.gm-coach{margin:10px 0;padding:8px 10px;border-left:3px solid var(--primary);border-radius:6px;background:var(--primary-surface);color:var(--primary-text);font-size:13px;line-height:1.4}
.gm-edit{display:grid;gap:12px;margin-top:6px}.gm-edit h3{margin:0;font-size:16px}
.gm-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gm-edit-grid .btn{min-height:52px;white-space:normal;line-height:1.25}
.gm-alt-list{display:grid;gap:8px}.gm-alt{display:grid;gap:2px;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));background:color-mix(in srgb,var(--blue) 9%,var(--bg));color:var(--text);cursor:pointer;touch-action:manipulation}.gm-alt small{color:var(--muted)}.gm-alt:hover,.gm-alt:focus-visible{border-color:var(--primary);outline:none}
.gym-set-badge.coach{color:var(--primary-text);border-color:var(--primary-line)}
.technique h4{margin:16px 0 6px;font-size:13px;letter-spacing:.02em;text-transform:uppercase;color:color-mix(in srgb,var(--cyan) 5%,var(--muted))}
.technique ol,.technique ul{margin:0;padding-left:20px;color:color-mix(in srgb,var(--muted) 36%,var(--text));font-size:14px;line-height:1.5}.technique li{margin:3px 0}
.technique ul li::marker{content:"✕  ";color:color-mix(in srgb,var(--bad) 74%,var(--text))}
.technique ul.tech-feel li::marker{content:"●  ";color:color-mix(in srgb,var(--primary) 90%,var(--bg))}.technique ul.tech-feel li:last-child::marker{content:"!  ";color:color-mix(in srgb,var(--amber) 59%,var(--text))}
.tech-meta{margin:0 0 10px}
.tech-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000}.tech-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.tech-video-note{margin:6px 0 0}
.tech-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.tech-actions .btn{text-decoration:none}
.tech-own{margin-top:14px;border-top:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));padding-top:10px}.tech-own summary{cursor:pointer;color:color-mix(in srgb,var(--muted) 51%,var(--text));font-size:13px}
.tech-own input{width:100%;margin:8px 0;padding:9px 10px;border-radius:8px;border:1px solid color-mix(in srgb,var(--cyan) 28%,var(--bg));background:color-mix(in srgb,var(--cyan) 3%,var(--bg));color:color-mix(in srgb,var(--muted) 6%,var(--text));font:inherit}
.tech-own-actions{display:flex;gap:8px}
.hub-item[data-detail]{cursor:pointer}.hub-item[data-detail]:hover{border-color:color-mix(in srgb,var(--muted) 57%,var(--bg))}.hub-item[data-detail]:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.training-detail .training-name{margin:4px 0 10px;font-size:17px;line-height:1.3}
.training-facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.training-facts div{background:color-mix(in srgb,var(--cyan) 4%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:9px;padding:7px 11px;display:grid}.training-facts span{font-size:12px;color:color-mix(in srgb,var(--muted) 88%,var(--bg))}.training-facts strong{font-size:15px}
.plan-steps{display:grid;gap:4px;margin:4px 0 8px}.plan-step{padding:6px 10px;border-left:3px solid #7b61c4;background:color-mix(in srgb,var(--cyan) 7%,var(--bg));border-radius:0 7px 7px 0;font-size:13px;color:color-mix(in srgb,var(--muted) 24%,var(--text))}.plan-step-head{font-size:12px;font-weight:700;color:color-mix(in srgb,var(--muted) 89%,var(--text));margin-top:6px;text-transform:uppercase;letter-spacing:.03em}
.plan-compare{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:13px}.plan-compare th,.plan-compare td{padding:7px 6px;border-bottom:1px solid color-mix(in srgb,var(--muted) 18%,var(--bg));text-align:left}.plan-compare thead th{font-size:12px;color:color-mix(in srgb,var(--muted) 88%,var(--bg));font-weight:600}.plan-compare tbody th{color:color-mix(in srgb,var(--muted) 51%,var(--text));font-weight:600;text-transform:none;letter-spacing:0;font-size:13px}.plan-compare thead th{text-transform:none;letter-spacing:0}
.plan-compare .ok{color:color-mix(in srgb,var(--primary) 88%,var(--bg))}.plan-compare .over{color:color-mix(in srgb,var(--warn) 96%,var(--bg))}.plan-compare .under{color:color-mix(in srgb,var(--blue) 71%,var(--text))}
.plan-verdict{margin:0 0 8px;font-weight:650}.plan-verdict.ok{color:color-mix(in srgb,var(--primary) 88%,var(--bg))}.plan-verdict.over{color:color-mix(in srgb,var(--warn) 96%,var(--bg))}.plan-verdict.under{color:color-mix(in srgb,var(--blue) 71%,var(--text))}
.training-plan summary{cursor:pointer;color:color-mix(in srgb,var(--muted) 51%,var(--text));font-size:13px;margin:4px 0}
.training-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.training-move{margin-top:12px}
.gym-detail{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:16px;align-items:start;margin:6px 0}
.hub-item.editable{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}.hub-item.editable.dragging{opacity:.55;outline:2px dashed var(--primary);outline-offset:2px}
.gym-focus-details.card{margin-top:12px;padding:0}.gym-focus-details>summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:14px 16px;cursor:pointer;list-style:none}.gym-focus-details>summary::-webkit-details-marker{display:none}
.gym-focus-details>summary::after{content:'▾';margin-left:auto;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}.gym-focus-details[open]>summary::after{content:'▴'}.gym-focus-details>summary span{font-size:15px;font-weight:700}.gym-focus-details>summary small{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.gym-focus-details .gym-focus-builder{margin:0;padding:4px 16px 16px;border:0}.gym-focus-day{display:flex;align-items:center;gap:8px;padding:0 16px 6px}.gym-week-hint{margin:10px 2px;color:color-mix(in srgb,var(--muted) 94%,var(--bg))}
.gs-mode{width:100%;margin:2px 0 12px;padding:11px;font-size:15px}
.gym-table-tools{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-bottom:10px}
.gym-table-details{margin-top:14px}.gym-table-details summary{cursor:pointer;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:13px;margin-bottom:10px}
.gym-session{display:grid;gap:12px;margin:6px 0}
.gs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
.gs-stats div{display:grid;gap:3px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:10px;background:color-mix(in srgb,var(--cyan) 6%,var(--bg))}.gs-stats span{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.gs-stats b{font-size:17px;line-height:1.15}
.gs-prs{padding:10px 12px;border:1px solid color-mix(in srgb,var(--warn) 32%,var(--bg));border-radius:12px;background:linear-gradient(160deg,color-mix(in srgb,var(--amber) 15%,var(--bg)),color-mix(in srgb,var(--amber) 6%,var(--bg)))}.gs-prs>b{color:color-mix(in srgb,var(--warn) 69%,var(--text));font-size:14px}
.gs-prs ul{display:grid;gap:4px;margin:8px 0 0;padding:0;list-style:none}.gs-prs li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;align-items:baseline;font-size:13px}.gs-prs li span{color:color-mix(in srgb,var(--warn) 32%,var(--text))}.gs-prs li strong{color:color-mix(in srgb,var(--warn) 69%,var(--text))}.gs-prs li small{grid-column:1/-1;color:color-mix(in srgb,var(--amber) 35%,var(--muted));font-size:12px}
.gs-top{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:16px;align-items:center}
.gs-top .gym-detail-figure .muscle-map{max-width:220px;margin:0 auto}
.gs-muscles{display:grid;gap:10px}.gs-mg{display:grid;gap:5px}.gs-mg-h{display:flex;align-items:center;gap:6px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px;text-transform:uppercase;letter-spacing:.05em}.gs-mg-h i{width:9px;height:9px;border-radius:3px}
.gs-mg-list{display:flex;flex-wrap:wrap;gap:5px}.gs-mg-list span{padding:3px 9px;border:1px solid var(--primary-line);border-radius:999px;background:var(--primary-surface);color:var(--primary-text);font-size:12px}
.gs-mg:nth-child(2) .gs-mg-list span{border-color:var(--primary-line);background:var(--primary-surface);color:var(--primary-text)}.gs-mg:nth-child(3) .gs-mg-list span{border-color:color-mix(in srgb,var(--lilac) 17%,var(--bg));background:color-mix(in srgb,var(--muted) 3%,var(--bg));color:color-mix(in srgb,var(--violet) 13%,var(--muted))}
.gs-list{display:grid;gap:10px}
.gs-ex{padding:10px 12px;border:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:12px;background:color-mix(in srgb,var(--cyan) 6%,var(--bg))}
.gs-ex header{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.gs-num{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--primary-surface);color:var(--primary-text);font-size:12px;font-weight:700}
.gs-name{flex:1;display:grid;min-width:0}.gs-name b{font-size:14px;line-height:1.25}.gs-name small{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}
.gs-ex-actions{flex:none;display:flex;gap:6px}.gs-ex-actions .btn{min-height:30px;padding:5px 9px;font-size:12px}
.gs-set{display:grid;grid-template-columns:24px minmax(0,1fr);gap:4px 10px;align-items:center;padding:6px 0;border-top:1px solid color-mix(in srgb,var(--cyan) 15%,var(--bg));font-size:13px}
.gs-set.log{grid-template-columns:24px minmax(0,1fr) auto 16px}
.gs-head{padding:2px 0 0;border-top:0;color:color-mix(in srgb,var(--muted) 88%,var(--bg));font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.gs-tag{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:color-mix(in srgb,var(--cyan) 12%,var(--bg));color:color-mix(in srgb,var(--muted) 51%,var(--text));font-size:12px;font-weight:700}
.gs-set.warm .gs-tag{background:color-mix(in srgb,var(--warn) 13%,var(--bg));color:color-mix(in srgb,var(--warn) 81%,var(--muted))}.gs-set.warm .gs-plan{color:color-mix(in srgb,var(--muted) 94%,var(--text))}
.gs-plan{min-width:0}.gs-actual{display:flex;align-items:center;gap:5px}.gs-actual i{font-style:normal;color:color-mix(in srgb,var(--muted) 88%,var(--bg));font-size:12px}
.gs-in{width:58px;min-width:0;padding:5px 6px;border:1px solid color-mix(in srgb,var(--cyan) 28%,var(--bg));border-radius:7px;background:color-mix(in srgb,var(--muted) 2%,var(--bg));color:color-mix(in srgb,var(--muted) 6%,var(--text));font:inherit;font-size:13px;text-align:center}
.gs-in:focus{outline:2px solid var(--primary);outline-offset:1px}
.gs-ok{color:color-mix(in srgb,var(--primary) 88%,var(--bg));font-weight:700;text-align:center}
.gs-badge{grid-column:2/-1;justify-self:start;padding:1px 7px;border:1px solid color-mix(in srgb,var(--warn) 29%,var(--bg));border-radius:999px;color:color-mix(in srgb,var(--warn) 96%,var(--bg));font-size:12px}
.gs-record{margin:6px 0 4px;padding:6px 10px;border-radius:8px;background:color-mix(in srgb,var(--amber) 14%,var(--bg));color:color-mix(in srgb,var(--warn) 69%,var(--text));font-size:12.5px;font-weight:600}.gs-record small{color:color-mix(in srgb,var(--warn) 48%,var(--muted));font-weight:400}
.gs-ex-tools{display:flex;gap:6px;margin-top:8px}.gs-ex-tools .btn{min-height:28px;padding:4px 10px;font-size:12px}
.gs-swap{display:grid;gap:6px;margin-top:8px}
.gs-tools{display:flex;flex-wrap:wrap;gap:8px}
.gs-ai{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--primary-line);border-radius:12px;background:var(--primary-surface)}.gs-ai label{color:var(--primary-text);font-size:12.5px;font-weight:600}
.gs-ai div{display:flex;gap:8px}.gs-ai input{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--primary-line);border-radius:8px;background:color-mix(in srgb,var(--violet) 3%,var(--bg));color:color-mix(in srgb,var(--muted) 11%,var(--text));font:inherit}.gs-ai-note{margin:0;color:var(--primary-text)}
.gs-confirm{position:sticky;bottom:-18px;display:grid;gap:4px;margin-top:12px;padding:12px 0 8px;background:linear-gradient(180deg,color-mix(in srgb,color-mix(in srgb,var(--cyan) 6%,var(--bg)) 0%,transparent),color-mix(in srgb,var(--cyan) 6%,var(--bg)) 28%)}.gs-confirm .btn{width:100%;padding:12px;font-size:15px}.gs-confirm p{margin:0;text-align:center}
.tech-back{margin-bottom:10px}
.planner-chip .proposal-open{display:block;margin:4px 0 0;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;text-decoration:underline dotted var(--primary)}
@media(max-width:560px){.gs-top{grid-template-columns:minmax(0,150px) minmax(0,1fr);gap:12px}.gs-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.gs-stats div{padding:8px}.gs-in{width:50px}.gs-ex{padding:9px 10px}}
.gym-done-edit{margin:12px 0;padding:12px;border:1px solid color-mix(in srgb,var(--muted) 24%,var(--bg));border-radius:12px}.gym-done-edit h4{margin:0 0 8px}.gym-done-list{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.gym-done-list span{display:inline-flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border:1px solid color-mix(in srgb,var(--muted) 27%,var(--bg));border-radius:16px;font-size:12px}.gym-done-list .btn{padding:2px 8px;min-height:0;font-size:12px}
.done-exercise-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.done-exercise-form label{display:grid;gap:4px;font-size:12px}.done-exercise-form input{width:100%;min-width:0;padding:10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--muted) 42%,var(--bg));background:color-mix(in srgb,var(--blue) 9%,var(--bg));color:var(--text);font-size:16px}
.gym-detail-figure .muscle-map{max-width:260px;margin:0}.gym-detail-figure .gym-figure svg{max-height:240px}
.gym-figure-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:color-mix(in srgb,var(--muted) 94%,var(--bg));margin-top:4px}.gym-figure-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.gym-compact{list-style:none;margin:0;padding:0;display:grid;gap:6px;counter-reset:ex}
.gym-compact li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;border:1px solid color-mix(in srgb,var(--muted) 22%,var(--bg));border-radius:9px;background:color-mix(in srgb,var(--cyan) 6%,var(--bg));counter-increment:ex}
.gym-compact li div{display:grid;min-width:0}.gym-compact li b{font-size:14px}.gym-compact li b::before{content:counter(ex) ". ";color:color-mix(in srgb,var(--muted) 88%,var(--bg));font-weight:600}
.gym-compact li small{color:color-mix(in srgb,var(--muted) 94%,var(--bg));font-size:12px}.gym-compact li span{white-space:nowrap;font-size:13px;color:color-mix(in srgb,var(--muted) 36%,var(--text))}
.training-detail .workout-profile{margin:4px 0 12px}.training-detail .workout-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:0 0 12px}
.activity-sheet .experience-chart{width:100%;height:auto}.activity-sheet h3{font-size:14px;margin:14px 0 4px}.activity-sheet .route-map{margin:6px 0}
@media(max-width:700px){.gym-detail{grid-template-columns:1fr}.gym-detail-figure .muscle-map{margin:auto}}
`;
