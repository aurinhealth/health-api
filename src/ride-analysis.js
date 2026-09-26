const number=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function analyzeRide(activity,streams=[]){
  const time=streams.find(s=>s.type==='time')?.data||[],watts=streams.find(s=>s.type==='watts')?.data||[],hr=streams.find(s=>s.type==='heartrate')?.data||[],cad=streams.find(s=>s.type==='cadence')?.data||[];
  const ftp=number(activity.icu_ftp),np=number(activity.icu_weighted_avg_watts??activity.icu_normalized_watts??activity.icu_weighted_average_watts),zones=[0,0,0,0,0,0,0],bounds=[.55,.75,.9,1.05,1.2,1.5],blocks=[];
  let seconds=0,power=0,coasting=0,cadenceSum=0,cadenceSeconds=0,block=null;const halves=[{p:0,h:0,t:0},{p:0,h:0,t:0}],mid=(number(time.at(-1))||number(activity.elapsed_time)||0)/2;
  for(let i=0;i<watts.length-1;i++){
    const t=number(time[i]),next=number(time[i+1]),p=number(watts[i]),dt=t!=null&&next!=null?next-t:null;
    if(p==null||p<0||dt==null||dt<=0||dt>30){if(block){blocks.push(block);block=null;}continue;}
    seconds+=dt;power+=p*dt;if(p===0)coasting+=dt;
    const c=number(cad[i]);if(p>0&&c>0){cadenceSum+=c*dt;cadenceSeconds+=dt;}
    if(ftp>0){const ratio=p/ftp;let z=bounds.findIndex(b=>ratio<=b);if(z<0)z=6;zones[z]+=dt;
      if(ratio>=.88&&ratio<=1.05){if(!block)block={start:t,seconds:0,power:0};block.seconds+=dt;block.power+=p*dt;}else if(block){blocks.push(block);block=null;}
      const h=number(hr[i]);if(ratio>=.6&&ratio<=.75&&h>0){const half=halves[t<mid?0:1];half.p+=p*dt;half.h+=h*dt;half.t+=dt;}
    }
  }
  if(block)blocks.push(block);
  const average=seconds?power/seconds:number(activity.icu_average_watts??activity.average_watts),drift=halves.every(h=>h.t>=600)?(1-(halves[1].p/halves[1].h)/(halves[0].p/halves[0].h))*100:null;
  return {source:'intervals.icu',powerSeconds:seconds,averageWatts:average,normalizedWatts:np,ftp,intensity:np&&ftp?np/ftp:null,variability:np&&average?np/average:null,coastingPercent:seconds?coasting/seconds*100:null,pedalingCadence:cadenceSeconds?cadenceSum/cadenceSeconds:null,zones:ftp>0&&seconds?zones.map((s,i)=>({zone:i+1,seconds:s,percent:s/seconds*100})):[],steadyBlocks:blocks.filter(b=>b.seconds>=120).map(b=>({start:b.start,minutes:b.seconds/60,watts:b.power/b.seconds})).slice(0,12),aerobicDrift:drift,driftMinutes:halves.map(h=>h.t/60)};
}
export function rideReviewSections(a){
  const f=(v,d=0)=>Number(v).toFixed(d),sections=[];
  if(a.averageWatts!=null)sections.push({label:'Výkon a intenzita',text:'Průměr '+f(a.averageWatts)+' W'+(a.normalizedWatts!=null?' · normalizovaný výkon '+f(a.normalizedWatts)+' W':'')+(a.intensity!=null?' · IF '+f(a.intensity,2):'')+(a.variability!=null?' · variabilita '+f(a.variability,2):'')+'.'+(a.intensity!=null?' IF porovnává náročnost jízdy s tvým FTP, ne splnění předepsaných intervalů.':'')});
  if(a.zones.length)sections.push({label:'Čas v pásmech výkonu',text:a.zones.map(z=>'Z'+z.zone+': '+f(z.seconds/60)+' min ('+f(z.percent)+' %)').join(' · ')+'. Zóny jsou odvozené z FTP '+f(a.ftp)+' W; nezaměňují se s tepovými zónami.'});
  if(a.coastingPercent!=null)sections.push({label:'Šlapání a technika',text:'Bez výkonu '+f(a.coastingPercent)+' % zaznamenaného času'+(a.pedalingCadence!=null?' · kadence při šlapání '+f(a.pedalingCadence)+' ot./min':'')+'. Nulový výkon zahrnuje sjezdy a případné zastávky; sám o sobě není chyba provedení.'});
  if(a.steadyBlocks.length)sections.push({label:'Souvislé pracovní úseky',text:a.steadyBlocks.map(b=>f(b.minutes,1)+' min při '+f(b.watts)+' W').join(' · ')+'. Jde o úseky nejméně 2 min v pásmu 88–105 % FTP, rozpoznané z výkonového streamu. Srovnání s plánem vyžaduje stejný intervalový předpis.'});
  if(a.aerobicDrift!=null)sections.push({label:'Aerobní stabilita',text:'Změna poměru výkon/tep mezi první a druhou polovinou: '+f(a.aerobicDrift,1)+' %. Porovnávám pouze vzorky při 60–75 % FTP, alespoň 10 min v každé polovině. Změnu může ovlivnit únava, teplo nebo hydratace; není to diagnóza.'});
  if(a.zones.length){const hard=a.zones.slice(3).reduce((s,z)=>s+z.seconds,0),above=a.zones.slice(4).reduce((s,z)=>s+z.seconds,0);sections.push({label:'Tréninkový dopad a další krok',text:hard/a.powerSeconds>.15?'Jízda nebyla pouze lehká vytrvalost: '+f(hard/60)+' min proběhlo v Z4 a výše, z toho '+f(above/60)+' min nad 105 % FTP. Má smíšený vytrvalostní a intenzivní stimul. K následující dlouhé jízdě už nepřidávej další intenzitu; drž lehké tempo a uprav délku podle ranního spánku, tepu a pocitu v nohách.':'Převažovala nižší intenzita. Hlavním stimulem je vytrvalostní objem; postupný progres sleduj podle výkonu při podobném tepu, ne podle samotného skóre dokončení.'});}
  return sections;
}
