const truth=v=>v===true||/^(true|1|ano|yes|✓)$/i.test(String(v||''));
const sideOf=v=>{const s=String(v||'').trim().toUpperCase();return s==='L'||s==='P'||s==='R'?(s==='R'?'P':s):'';};
export function strengthSetOptions(set={}){
  const note=String(set.note||''),group=String(set.superset??note.match(/\[Supersérie ([A-F])\]/)?.[1]??'').trim().toUpperCase();
  // L/P: a set of one side of a one-sided exercise (gym-sides.js).
  const side=sideOf(set.side??note.match(/\[Strana ([LP])\]/)?.[1]);
  return {toFailure:set.toFailure==null?/\[Do selhání\]/.test(note):truth(set.toFailure),superset:/^[A-F]$/.test(group)?group:'',side};
}
export function strengthOptionNote(set){
  const options=strengthSetOptions(set),note=String(set.note||'').replace(/\s*\[(?:Do selhání|Supersérie [A-F]|Strana [LP])\]/g,'').trim();
  return [note,options.toFailure?'[Do selhání]':'',options.superset?'[Supersérie '+options.superset+']':'',options.side?'[Strana '+options.side+']':''].filter(Boolean).join(' ');
}
