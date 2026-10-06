// Interface language: Czech (the source language of the app) or English.
// The lw-lang cookie (cs | en) holds an explicit choice; without it the device
// language decides (Czech or Slovak → cs, anything else → en). Picking the
// device's own language clears the cookie, like the Vzhled switch.
//
// The app is written in Czech. In English, /app/i18n-en.js translates the page
// in the browser: exact texts from EN, then texts with numbers through
// EN_TEMPLATES (numbers become {n}), then word patterns (weekdays, units).
// Anything without a translation stays Czech.
import {EN, EN_TEMPLATES, EN_PATTERNS} from './i18n-en.js';
import {assetVersion, scriptCacheControl} from './asset-version.js';

export const LANGS = ['cs', 'en'];

let englishBody = null;
function englishScriptBody() { return englishBody ??= `window.LW_EN=${JSON.stringify(EN)};window.LW_EN_TPL=${JSON.stringify(EN_TEMPLATES)};window.LW_EN_PATTERNS=${JSON.stringify(EN_PATTERNS)};${translator}`; }
function EN_VERSION() { return assetVersion(englishScriptBody()); }

// The translator, served with the dictionary. It skips what people typed
// (the text inside textareas, contenteditable) and anything marked data-no-i18n;
// a textarea's placeholder is still translated.
const translator = `(function(){
var D=window.LW_EN||{},T=window.LW_EN_TPL||{},NUM=/\\d+(?:[.,:]\\d+)*/g,P=(window.LW_EN_PATTERNS||[]).map(function(p){return [new RegExp(p[0],p[2]||'gu'),p[1]];}),root=document.documentElement;
var ATTRS=['placeholder','title','aria-label','alt'],LETTER=/[A-Za-zÀ-ž]/;
function tr(s){var t=s.trim();if(!t||!LETTER.test(t))return null;var hit=Object.prototype.hasOwnProperty.call(D,t)?D[t]:null;
 if(hit==null){var nums=t.match(NUM);if(nums){var key=t.replace(NUM,'{n}');if(Object.prototype.hasOwnProperty.call(T,key)){var k=0;hit=T[key].replace(/\\{n\\}/g,function(){return nums[k++];});}}}
 if(hit==null){var r=t;for(var i=0;i<P.length;i++)r=r.replace(P[i][0],P[i][1]);if(r===t)return null;hit=r;}
 if(hit===t)return null;return s.slice(0,s.length-s.trimStart().length)+hit+s.slice(s.trimEnd().length);}
function skip(el){return !el||el.closest&&el.closest('textarea,[contenteditable],[data-no-i18n],script,style');}
function text(n){if(skip(n.parentElement))return;var v=tr(n.nodeValue);if(v!=null)n.nodeValue=v;}
function attrs(el){if(skip(el.tagName==='TEXTAREA'?el.parentElement:el))return;for(var i=0;i<ATTRS.length;i++){var a=el.getAttribute(ATTRS[i]);if(a){var v=tr(a);if(v!=null)el.setAttribute(ATTRS[i],v);}}
 if(el.tagName==='INPUT'&&(el.type==='button'||el.type==='submit')&&el.value){var w=tr(el.value);if(w!=null)el.value=w;}}
function walk(node){if(node.nodeType===3){text(node);return;}if(node.nodeType!==1&&node.nodeType!==11)return;if(node.nodeType===1){attrs(node);if(skip(node))return;}
 if(node.tagName==='TEMPLATE'){walk(node.content);return;}
 var w=document.createTreeWalker(node,5),n;while(n=w.nextNode()){if(n.nodeType===3)text(n);else if(n.tagName==='TEMPLATE')walk(n.content);else attrs(n);}}
function start(){walk(document.body);root.classList.remove('i18n-wait');
 new MutationObserver(function(list){for(var i=0;i<list.length;i++){var m=list[i];if(m.type==='characterData')text(m.target);else if(m.type==='attributes')attrs(m.target);else for(var j=0;j<m.addedNodes.length;j++)walk(m.addedNodes[j]);}})
 .observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
 var t=document.title,v=tr(t);if(v!=null)document.title=v;}
if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();`;

// Runs in <head> before the first paint. In English the page stays hidden
// until the first translation pass (or a short timeout), so Czech never flashes.
export const langBoot = `<script>(function(){try{var r=document.documentElement,m=document.cookie.match(/(?:^|; )lw-lang=(cs|en)/),
d=((navigator.languages&&navigator.languages[0])||navigator.language||'cs').toLowerCase(),dev=/^(cs|sk)\\b/.test(d)?'cs':'en',l=m?m[1]:dev;
r.lang=l;r.dataset.deviceLang=dev;if(l==='en'){r.classList.add('i18n-wait');setTimeout(function(){r.classList.remove('i18n-wait');},1500);
var s=document.createElement('script');s.src='/app/i18n-en.js?v=${EN_VERSION()}';document.head.appendChild(s);}}catch(e){}})();</script>
<style>.i18n-wait body{visibility:hidden}</style>`;

export function englishScript(url) {
  return new Response(englishScriptBody(), {status:200, headers:{'content-type':'text/javascript; charset=utf-8', 'cache-control':scriptCacheControl(url, EN_VERSION())}});
}

// For AI replies: the assistant answers in the interface language.
export function replyLanguageNote(env) {
  return String(env?.INTERFACE_LANGUAGE || 'cs').toLowerCase().startsWith('en')
    ? '\n\nThe athlete uses the app in English: write every user-facing text (answer, reasons, labels) in English, regardless of the language of these instructions or the data.'
    : '';
}
