export const mobileTheme = `
.next-meal{margin-top:16px}
.next-meal h3{margin:0 0 6px}
.next-meal .foodrow>div:first-child{min-width:0}
.next-meal .foodrow strong{overflow-wrap:anywhere}
.topbar #viewDate{min-width:0;width:130px;padding:7px;background:#14212b;color:#eff3fa;border:1px solid #354651;border-radius:6px;font:inherit}
.topbar #previousDay,.topbar #nextDay{min-width:36px;padding:7px}
.topbar .actions button:disabled{opacity:.4;cursor:default}
.gym-exercise-dialog{width:min(520px,calc(100vw - 24px));max-height:min(80dvh,680px);overflow:auto;background:#121b24;color:#eff3fa;border:1px solid #43525d;border-radius:8px;padding:18px}
.gym-exercise-dialog::backdrop{background:#000a}
.gym-exercise-dialog .detail-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.gym-exercise-dialog h3{margin:0 0 14px;font-size:19px}
.gym-exercise-dialog input{width:100%;margin:6px 0 10px;padding:11px 12px;background:#0b1219;color:#eff3fa;border:1px solid #5a6b76;border-radius:6px;font:inherit}
#gymExerciseResults{display:grid;gap:3px;max-height:360px;overflow:auto}
#gymExerciseResults button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 11px;background:transparent;color:#eff3fa;border:1px solid transparent;border-radius:6px;text-align:left}
#gymExerciseResults button:hover,#gymExerciseResults button:focus-visible,#gymExerciseResults button[aria-selected=true]{background:#203c37;border-color:#5fbf9c;outline:0}
#gymExerciseResults button strong{font-size:13px}
#gymExerciseResults button small{color:#a6b9bf;font-size:11px;text-align:right}
@media(max-width:700px){
  html{scroll-padding-top:72px}
  body{background:#0a0d12}
  .shell{display:block;min-height:100dvh}
  .sidebar{position:fixed;inset:auto 0 0;z-index:30;height:auto;padding:5px 6px calc(5px + env(safe-area-inset-bottom));background:#111820;border:0;border-top:1px solid #34414b;box-shadow:0 -8px 24px #0007}
  /* One row for all seven sections; the last one (Nastavení) is labelled Více. */
  .nav{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;overflow:visible}
  .nav button{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px;min-width:0;min-height:56px;padding:4px 1px;border:0;border-radius:7px;background:transparent;color:#a9b9c5;font-size:22px;line-height:1.1;text-align:center}
  .nav button span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;font-weight:650;letter-spacing:-.1px}
  .nav button[data-view="settings"] span{font-size:0}
  .nav button[data-view="settings"] span::after{content:"Více";font-size:9.5px}
  .nav button[data-view="workouts"] span{font-size:0}
  .nav button[data-view="workouts"] span::after{content:"Workout";font-size:9.5px}
  .nav button.active{background:#1b322e;color:#8ce0ba;box-shadow:none}
  .nav button:focus-visible{outline:2px solid #8ce0ba;outline-offset:-2px}
  .topbar{position:sticky;top:0;height:60px;z-index:12;padding:0 14px;background:#0d131a;border-bottom:1px solid #26343e}
  .top-title{font-size:15px;max-width:none}
  .topbar .actions{width:auto;gap:4px}
  .topbar .top-title,.topbar #refresh{display:none}
  .topbar #viewDate{width:114px;font-size:12px}
  .topbar #openAssistant{font-size:0}
  .topbar #openAssistant::after{content:'AI';font-size:12px}
  .topbar .actions .btn{flex:none;min-height:38px;padding:8px 10px;font-size:12px}
  .topbar .status-dot,.topbar #topStatus{display:none}
  .content{padding:16px 12px calc(92px + env(safe-area-inset-bottom));max-width:600px}
  .section-hero{margin-bottom:12px}
  .view>.section:first-of-type{margin-top:14px}
  .card{border-radius:8px;box-shadow:none}
  .quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .today-grid{grid-template-columns:1fr}
  .plan-grid,#nutrition .daygrid{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(176px,76%);grid-template-columns:none;gap:8px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x mandatory;padding-bottom:9px;scrollbar-width:thin}
  .plan-grid .plan-day,#nutrition .daygrid .day{scroll-snap-align:start;min-height:140px}
  #nutrition .daygrid{grid-auto-columns:minmax(175px,70%)}
  #nutrition .daygrid .day{min-height:155px}
  #nutrition{display:flex;flex-direction:column}
  #nutrition>.section-hero{order:0}
  #nutrition>.grid2{display:contents}
  #nutrition>.grid2>.card:last-child{order:1;margin:0 0 12px}
  #nutrition>#enteredFood{order:2}
  #nutrition>#foodEntry{order:3}
  #nutrition>.experience-grid{order:4}
  #nutrition>#nutritionDays{order:5}
  #nutrition>.grid2>.card:first-child{order:6;margin-top:12px}
  #nutrition>.section{order:7}
  #nutrition>.card:not(#foodEntry):not(#enteredFood):not(#nutritionInsights){order:8}
  #nutrition .foodrow{align-items:flex-start}
  #nutrition .foodrow .right{font-size:12px}
  #nutrition .next-meal{border-top:1px solid #2c3942;padding-top:12px}
  #nutrition .food-selection-layout{grid-template-columns:1fr}
  #nutrition .food-controls{display:grid;grid-template-columns:1fr}
  #nutrition .simple-food-macros{grid-template-columns:repeat(2,minmax(0,1fr))}
  #nutrition #foodEditor #foodAdvanced .food-editor-grid{grid-template-columns:1fr}
  .weekbar .select-row{width:100%}
  .weekbar .select-row select{max-width:100%}
  .recovery-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
  .gym-table{min-width:760px}
  .scroll:has(.gym-table){overflow-x:auto;-webkit-overflow-scrolling:touch}
  .toast{bottom:calc(78px + env(safe-area-inset-bottom));left:12px;right:12px}
  /* Long words, links and form controls never push the page wider than the screen. */
  .view{overflow-wrap:anywhere}
  .view select,.view input,.view textarea{max-width:100%}
  #trainingProfileCard .select-row{flex-wrap:wrap}
  #trainingProfileCard select{width:100%}
  /* Tables keep whole words and scroll sideways inside their card instead. */
  .view table,.view th,.view td{overflow-wrap:normal;word-break:normal}
  .workout-result,.workout-result>div,.explain-grid>*,#generatedWorkout,#workoutResults{min-width:0;max-width:100%}
  .step-table-wrap,#trainingProfileCard .step-table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .step-table th,.step-table td{padding:6px 6px}
  .step-table td.small{white-space:nowrap}
  .workout-result-head{flex-wrap:wrap}
  .workout-filter-actions{flex-wrap:wrap}
}
`;
