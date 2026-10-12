// The ride and run reviews of a day, compact, for the AI coach.
import { buildRideReview } from "./ride-review.js";
import { buildRunReview } from "./run-review.js";
import { cached } from "./api-cache.js";
import { rideIntervals } from "./activity-detail.js";

// The recorded intervals of a day's completed rides and runs, keyed by activity id (one
// small Intervals.icu request per ride, cached).
export const isRideType=a=>/^(Ride|VirtualRide|EBikeRide|Cycling|MountainBikeRide|GravelRide|Run|VirtualRun|TrailRun|Treadmill)$/i.test(a?.type||'');
export async function rideDetailsFor(env,ctx,training){
  return Object.fromEntries(await Promise.all((training?.completed||[]).filter(isRideType).slice(0,3).map(a=>{
    const id=String(a.payload?.id||String(a.id).replace(/^activity:/,''));
    return cached(env,ctx,'ride-intervals:'+id,()=>rideIntervals(env,id),{ttl:21600}).then(x=>[a.id,x],()=>[a.id,null]);
  })));
}
// The same ride and run reviews the Today screen shows, compact, for the AI coach.
export async function rideReviewsForCoach(env,ctx,training,date,wellness,thresholds=null){
  const rides=(training?.completed||[]).filter(isRideType).slice(0,3);if(!rides.length)return [];
  const details=await rideDetailsFor(env,ctx,training).catch(()=>({})),rows=Array.isArray(wellness)?wellness:[],latest=rows.filter(r=>String(r.id||'')<=date).at(-1)||{};
  const tsb=latest.ctl!=null&&latest.atl!=null?Number(latest.ctl)-Number(latest.atl):null;
  return rides.map(a=>{
    const plan=(training.matched||[]).find(m=>String(m.actualId)===String(a.id))?.planned||null;
    const input={activity:a,detail:details[a.id],plan,wellness:rows,fitness:{tsb},date},r=/run|treadmill/i.test(a.type||'')?buildRunReview({...input,thresholdPace:thresholds?.runThresholdPace}):buildRideReview(input);
    return {date,type:a.type||null,name:a.name||null,plan:plan?.name||null,verdict:r.verdict,target:r.target,blocks:r.table,findings:Object.fromEntries(r.sections.map(x=>[x.kind,x.items]))};
  });
}
