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
.week-planner{margin-top:12px;border-top:1px solid #262d39;padding-top:10px}
.week-planner summary{cursor:pointer}
.planner-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-top:10px}
.planner-day{background:#0f141d;border:1px solid #262d39;border-radius:10px;padding:8px;display:grid;gap:5px}
.planner-day strong{font-size:12px;text-transform:capitalize}
.planner-day button{font-size:11px;padding:6px 7px;border-radius:7px;border:1px solid #333b49;background:#151b26;color:#aab3c1;text-align:left}
.planner-day button[aria-pressed="true"]{background:#2b2147;border-color:#9b6bff;color:#fff}
.planner-role{font-size:10px;color:#c6acff;min-height:14px}
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
@media(max-width:1050px){.hub-week,.planner-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.hub-week,.planner-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.week-hub-tools{width:100%}.activity-gallery{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;
