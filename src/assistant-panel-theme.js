export const assistantPanelTheme=String.raw`
/* A chat anchored to its launcher, with a fixed composer and scrollable history. */
dialog.assistant-dialog{position:fixed;inset:auto 24px 82px auto;margin:0;padding:0;width:430px;max-width:calc(100vw - 32px);height:min(710px,calc(100dvh - 116px));max-height:calc(100dvh - 116px);box-sizing:border-box;border:1px solid #3b504b;border-radius:22px;background:#11191f;color:#edf5f1;box-shadow:0 18px 64px #0008;overflow:hidden;z-index:40}
dialog.assistant-dialog[open]{display:flex;flex-direction:column}
body.gym-mode-open dialog.assistant-dialog{z-index:150}.gm-assistant{font-size:12px;padding:7px 12px;margin:0 0 12px}
.assistant-panel-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #2d3a40;background:#182620;flex:none}
.assistant-panel-header h3{margin:0;font-size:17px}.assistant-panel-header small{display:block;color:#b2c8bc;margin-top:4px}.assistant-panel-header .btn{padding:7px 11px;border-radius:50%;width:36px;height:36px}
.assistant-dialog #assistantStatus{padding:8px 18px;border:0;border-radius:0;background:#151f26;font-size:12px;color:#b6c6c9;flex:none;line-height:1.5}
.assistant-context{padding:9px 18px;background:#1b2a25;border-bottom:1px solid #30433a;font-size:12px;line-height:1.5;color:#bce4ce;overflow-wrap:anywhere;flex:none}
.assistant-quick-actions{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:#172126;flex:none}
.assistant-quick{padding:7px 10px;border:1px solid #3e574a;border-radius:16px;background:#20342a;color:#cce8d8;font:inherit;font-size:12px;line-height:1.4;cursor:pointer;touch-action:manipulation}.assistant-quick:disabled{opacity:.55;cursor:default}
.assistant-scroll{overflow-y:auto;overscroll-behavior:contain;min-height:0;flex:1;padding:16px;scroll-behavior:smooth;scrollbar-width:thin}
.assistant-dialog .coach-turn{border:1px solid #2a383f;border-radius:16px 16px 16px 4px;margin:0 20px 14px 0;padding:11px 14px;background:#19232b;overflow-wrap:anywhere}
.assistant-dialog .coach-turn>strong{font-size:12px;color:#9ec6b7}
.assistant-dialog .coach-turn.user{background:#254035;border-color:#355747;border-radius:16px 16px 4px 16px;margin-left:36px;margin-right:0}
.coach-message{font-size:13px;line-height:1.65}.coach-message p{white-space:normal;margin:6px 0}.coach-message h4{font-size:14px;line-height:1.5;margin:12px 0 6px}.coach-message h4:first-child{margin-top:7px}.coach-message ul,.coach-message ol{padding-left:19px;margin:8px 0}.coach-message li{margin:6px 0}.coach-message strong{color:#e5f4ec}
.assistant-welcome{text-align:center;padding:32px 12px;color:#aebfc0;font-size:13px;line-height:1.7}.assistant-welcome span{display:block;font-size:27px;color:#99e6c3;margin-bottom:12px}.assistant-welcome strong{display:block;color:#e1f3e9;font-size:18px}
.assistant-dialog #assistantForm{display:flex;gap:8px;align-items:flex-end;padding:12px;background:#172126;border-top:1px solid #304047;flex:none;margin:0}
.assistant-dialog #assistantForm .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.assistant-dialog #assistantMessage{box-sizing:border-box;flex:1;min-width:0;width:100%;height:44px;min-height:44px;max-height:144px;resize:none;overflow-y:hidden;margin:0;padding:11px 13px;line-height:20px;font-size:14px;border:1px solid #40534e;border-radius:22px;background:#10191e;color:#edf7f2;scrollbar-width:thin}
.assistant-dialog #assistantMessage:focus{border-color:#92e9c4;outline:none;box-shadow:0 0 0 2px #92e9c418}
.assistant-dialog #assistantForm .assistant-send{flex:none;display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;background:#92e9c4;color:#10271e;border:1px solid #92e9c4;box-shadow:none}
.assistant-send svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.assistant-dialog #assistantForm .assistant-send:disabled{background:#2a343b;border-color:#344149;color:#75848d;opacity:1;cursor:default}
.assistant-typing{display:flex;align-items:center;gap:5px;padding:8px 12px 18px;color:#9eb2ac}.assistant-typing>span{width:5px;height:5px;border-radius:50%;background:#99e6c3;animation:assistant-pulse 1.2s infinite}.assistant-typing>span:nth-child(2){animation-delay:.15s}.assistant-typing>span:nth-child(3){animation-delay:.3s}.assistant-typing small{font-size:12px;margin-left:5px}
@keyframes assistant-pulse{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.assistant-retry{padding:12px;border:1px solid #815849;border-radius:12px;margin-bottom:12px;font-size:12px}.assistant-retry p{margin:0 0 8px}
.assistant-dialog .coach-action{padding:14px;margin:10px 0;border-color:#40564c;background:#1b2b24}.assistant-dialog .coach-action>strong{font-size:13px;line-height:1.5}.assistant-dialog .coach-action p{font-size:12px;line-height:1.65;margin:8px 0 12px}.assistant-dialog .select-row{gap:7px}.assistant-dialog .select-row .btn{font-size:12px;white-space:normal;padding:8px 10px}.assistant-dialog .week-proposal-list{font-size:12px}.assistant-dialog .week-proposal-list>div{background:#18272b;border:1px solid #2d4145}.assistant-dialog .week-proposal-list span{color:#b6d5c8}.assistant-week-tools{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.assistant-week-tools .btn{font-size:12px}
.assistant-fab{background:#203c31;color:#baf4d8;border-color:#4e8b70}.assistant-fab.is-open{border-color:#99e6c3}
.gym-focus-builder .gym-figures [data-muscle][aria-pressed="true"]{fill:#84f2bf;stroke:#ebfff5;stroke-width:2;filter:drop-shadow(0 0 4px #72dda4aa)}.gym-focus-choices button[aria-pressed="true"]{background:#26553e;border:2px solid #8df0bd;color:#eafff3;box-shadow:0 0 0 1px #8df0bd33}.gym-focus-choices button[aria-pressed="true"]:after{content:'✓';float:right;color:#adffd1;font-weight:800}.gym-set-options{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0}.gym-set-options label{display:flex;align-items:center;gap:6px;font-size:12px;color:#b9d7c8}.gym-set-options input[type=checkbox]{accent-color:#88e5bd;width:17px;height:17px}.gym-superset-select{background:#192a25;color:#c9f6e0;border:1px solid #527763;border-radius:7px;padding:6px;font-size:12px;max-width:110px}.gym-set-badge{display:inline-block;font-size:12px;color:#ffd4aa;border:1px solid #715641;border-radius:6px;padding:2px 5px;margin-left:5px}.gm-body .gym-set-options{justify-content:center}.gym-table .gym-options-cell{min-width:130px}.gym-table .gym-options-cell label{display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:5px}.gym-table .gym-options-cell input[type=checkbox]{width:16px;height:16px;accent-color:#8deac8}

@media(max-width:700px){
  dialog.assistant-dialog{inset:auto 10px calc(138px + env(safe-area-inset-bottom)) 10px;width:auto;max-width:none;height:min(650px,calc(100dvh - 158px - env(safe-area-inset-bottom)));max-height:calc(100dvh - 158px - env(safe-area-inset-bottom));border-radius:20px}
  .assistant-panel-header{padding:14px 16px}.assistant-panel-header h3{font-size:16px}.assistant-panel-header small{font-size:12px}
  .assistant-scroll{padding:12px}.assistant-dialog #assistantForm{padding:10px}
  .assistant-dialog #assistantMessage{font-size:16px}
  .assistant-fab{left:16px;right:auto;bottom:calc(84px + env(safe-area-inset-bottom));max-width:calc(100vw - 106px)}
  .assistant-dialog .coach-turn{padding:10px 12px;margin-right:16px}.assistant-dialog .coach-turn.user{margin-left:24px;margin-right:0}
}
@media(prefers-reduced-motion:reduce){.assistant-scroll{scroll-behavior:auto}.assistant-typing>span{animation:none;opacity:.7}}
.assistant-head-actions{display:flex;gap:6px;align-items:center;flex:none}
.assistant-panel-header .assistant-head-btn{width:auto;border-radius:18px;font-size:12px;padding:6px 11px;white-space:nowrap}
.assistant-history{position:absolute;left:0;right:0;top:72px;bottom:0;z-index:5;background:#121a17;overflow:auto;padding:14px 16px;border-top:1px solid #2d3a40}
.assistant-history-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.assistant-history ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.assistant-history li{display:flex;gap:6px;align-items:stretch;border:1px solid #2d3a40;border-radius:10px;background:#18221e}
.assistant-history li.current{border-color:#7fd1a8}
.assistant-chat-open{flex:1;min-width:0;display:grid;gap:2px;text-align:left;background:none;border:0;color:#eef4f0;font:inherit;padding:10px 12px;cursor:pointer}
.assistant-chat-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.assistant-chat-open small{color:#93a39b;font-size:12px}
.assistant-chat-delete{background:none;border:0;color:#93a39b;padding:0 12px;cursor:pointer;font-size:14px}.assistant-chat-delete:hover{color:#ff8a8a}
.assistant-history-note{margin-top:12px}
@media(max-width:700px){.assistant-panel-header .assistant-head-btn{padding:6px 9px}.assistant-history{top:62px}}
.assistant-new-note{margin:10px 4px 0;font-size:12px;color:#93a39b;text-align:center}
.coach-proposals{margin-top:12px;display:grid;gap:10px}
.coach-turn .coach-action{margin:0;border:1px solid #40564c;border-radius:12px}
.coach-visual{margin-top:10px}.coach-visual.gym-detail{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.coach-visual .gym-detail-figure{max-width:200px;margin:0 auto}.coach-visual .gym-detail-figure svg{width:100%;height:auto;max-height:150px}
.coach-visual .gym-detail-figure p,.coach-visual .gym-figure-legend{display:none}
.coach-visual .gym-compact{margin:0;padding-left:18px;font-size:12px}.coach-visual .gym-compact li{margin:3px 0}
.coach-visual .workout-facts{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 0;font-size:12px}.coach-visual .workout-facts div{display:flex;gap:4px}.coach-visual .workout-facts dd{margin:0;font-weight:700}
.coach-replies{display:flex;flex-wrap:wrap;gap:6px}.coach-reply-hint{margin:0;color:#93a39b}
.coach-visuals{display:grid;gap:8px;margin-top:10px}.coach-vis{padding:10px 12px;border:1px solid #33463d;border-radius:12px;background:#15201b}
.cv-title{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#93a39b;margin-bottom:6px}
.cv-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:6px}.cv-stats span{display:block;font-size:12px;color:#93a39b}.cv-stats strong{font-size:15px}
.cv-line{display:block;width:100%;height:36px;margin-top:6px}.cv-note{display:block;font-size:12px;color:#7f8f87}
.cv-bar{display:grid;grid-template-columns:72px 1fr auto;gap:8px;align-items:center;font-size:12px;margin:4px 0}.cv-bar i{height:7px;border-radius:4px;background:#26332d;overflow:hidden}.cv-bar b{display:block;height:100%;background:#7fd6a6;border-radius:4px}.cv-bar small{color:#93a39b;white-space:nowrap}
.cv-cols{display:flex;align-items:flex-end;gap:5px;height:48px;margin-top:8px}.cv-cols i{flex:1;background:#6b8fd6;border-radius:3px 3px 0 0;min-height:3px}
.cv-item{display:grid;grid-template-columns:22px 1fr;gap:2px 6px;margin:4px 0;font-size:13px}.cv-item small{grid-column:2;color:#93a39b;font-size:12px}
.cv-zone{display:grid;grid-template-columns:28px 1fr auto;gap:6px;font-size:12px;padding:2px 0}.cv-zone small{color:#c6d4cc}
`;
