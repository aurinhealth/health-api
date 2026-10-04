const truth=v=>v===true||/^(true|1|ano|yes|✓)$/i.test(String(v||''));
export function strengthSetOptions(set={}){
  const note=String(set.note||''),group=String(set.superset??note.match(/\[Supersérie ([A-F])\]/)?.[1]??'').trim().toUpperCase();
  return {toFailure:set.toFailure==null?/\[Do selhání\]/.test(note):truth(set.toFailure),superset:/^[A-F]$/.test(group)?group:''};
}
export function strengthOptionNote(set){
  const options=strengthSetOptions(set),note=String(set.note||'').replace(/\s*\[(?:Do selhání|Supersérie [A-F])\]/g,'').trim();
  return [note,options.toFailure?'[Do selhání]':'',options.superset?'[Supersérie '+options.superset+']':''].filter(Boolean).join(' ');
}
