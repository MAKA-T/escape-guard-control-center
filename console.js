"use strict";
const $ = id => document.getElementById(id);
const pair=(english,chinese)=>language==="zh"?chinese:english;
const towerList=["E","W"],floorsList=Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
const deskPaths={
 incidents:'<path d="M9 4h6m-7 2H5v15h14V6h-3M9 10h6m-6 4h4"/>',
 groups:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
 access:'<path d="M3 20h18M6 20V4h12v16m-10 0V6l7 2v12m-3-6h.1"/>',
 broadcast:'<path d="M3 10h4l10-5v14L7 14H3zm4 4 2 6h3l-2-5m9-5a4 4 0 0 1 0 4"/>',
 smoke:'<path d="M3 10h4c3 0 3-4 6-4h2m-10 8h5c3 0 4-4 7-4h3M5 18h6c3 0 4-4 7-4h3"/>',
 heat:'<path d="M9 14V6a3 3 0 0 1 6 0v8a5 5 0 1 1-6 0zm3-5v8m5-10h3m-3 4h2"/>',
 flame:'<path d="M13 3c1 4-2 6-3 8-1-1-2-2-2-3-2 3-4 5-3 9 1 3 3 4 7 4s7-3 7-7c0-4-2-7-6-11z"/>',
 camera:'<path d="M3 7h12v9H3zm12 3 6-3v9l-6-3M7 17v3h6"/>',
 signal:'<path d="M3 16h4l3-9 4 12 2-6h5"/>',
 report:'<path d="M5 3h11l3 3v15H5zm9 1v4h4M8 12h8m-8 4h6"/>'
};
window.EscapeDeskIcons={svg(kind){return '<svg class="deskGlyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(deskPaths[kind]||deskPaths.report)+'</svg>';},
 sensor(source){return source==="D4"?"flame":source==="D7"?"heat":/^S\d/.test(source)?"smoke":/^CAM|camera/i.test(source)?"camera":source==="UWB"?"signal":"report";}};
const signalCopy={
 D4:["East stair B approach","東座 B 梯入口","Heat and smoke reported near Stair B. The ignition point has not been confirmed.","B 梯入口出現熱量及煙霧訊號，起火位置待現場核實。"],
 S2:["East stair B landing","東座 B 梯平台","Smoke reported at the east stair landing.","東座樓梯平台錄得煙霧訊號。"],
 D7:["Upper east corridor","東座高層東翼走廊","The detector recorded elevated heat and smoke in the corridor.","走廊探測器錄得熱量及煙霧上升。"],
 S3:["West corridor","西座走廊","A smoke signal was reported. Passage conditions are unconfirmed.","探頭錄得煙霧訊號，通道狀況待核實。"]
};
window.EscapeSensorReports=(window.EscapeEvacuation?.shared.snapshot().hazards||[]).map(h=>{
 const code=h.id.split("-").at(-1),copy=signalCopy[code];
 return {id:h.id,tower:h.tower,floor:h.floor,x:h.x,y:h.y,source:code,labelEn:code+" · "+copy[0],labelZh:code+" · "+copy[1],notesEn:copy[2],notesZh:copy[3]};
});
const names=t=>t==="E"?pair("East Tower","東座"):pair("West Tower","西座");
const apartments=[[152,73],[216,108],[303,111],[423,111],[443,234],[224,237]];
const reportPositions=[[299,182],[328,155],[409,171],[454,187],[515,158]];
// Each simulated unit has two individually addressable masks; coordinates are floor-plan units.
const estate={};
for(const t of towerList){
 estate[t]={};
 for(const f of floorsList){
  estate[t][f]=[];
  for(let n=0;n<12;n++){
   const unit=String(1+Math.floor(n/2)).padStart(2,"0"),slot=n%2+1,id=t+f+unit+slot;
   let status="standby",pos=[apartments[Math.floor(n/2)][0]+(slot-1)*10,apartments[Math.floor(n/2)][1]];
   if(t==="E"&&f==="02"){
    if(n<4){status="moving";pos=reportPositions[n]}else if(n===4){status="stale";pos=reportPositions[n]}else if(n===5){status="exited";pos=[null,null]}
   }
   if(!(t==="E"&&f==="02")){
    if(n===0||n===1||((+f%3)===0&&n===2)){status="moving";pos=reportPositions[n]}
    if(n===11&&(+f%2)===0){status="stale";pos=reportPositions[4]}
    if(n===10&&(+f%4)===0){status="exited";pos=[null,null]}
   }
   estate[t][f].push([id,status,pos[0],pos[1],t,f,t+"-"+f+unit,slot,n]);
  }
 }
}
const deviceCatalog=Object.values(estate).flatMap(byFloor=>Object.values(byFloor).flat());

const states={standby:["Standby","待機"],wearing:["Holding","等候中"],moving:["Moving","移動中"],exited:["Exited","已離開"],stale:["Stale","失聯"]};
let tower="E",floor="02",selected="E02011",language=new URLSearchParams(location.search).get("lang")==="zh"?"zh":"en",directoryScope="floor";
const stateName=k=>pair(...states[k]),serial=id=>"EG-"+id;
let wearerRecords=new Map();
function refreshWearers(){wearerRecords=new Map((window.EscapeEvacuation?.shared.snapshot().people||[]).map(p=>[p.deviceId,p]));}
function actual(d){
 const wearer=wearerRecords.get(d[0]);if(!wearer)return d;
 const r=d.slice();r[1]=wearer.status==="arrived"?"exited":wearer.status==="waiting"?"wearing":"moving";
 if(wearer.floor===d[5]&&wearer.status!=="arrived"){r[2]=wearer.x;r[3]=wearer.y;}else{r[2]=null;r[3]=null;}
 return r;
}
const sessionTime=Date.now();
const relativeTime=seconds=>new Date(sessionTime-seconds*1000).toLocaleTimeString("en-GB",{hour12:false});
const deviceTime=d=>relativeTime(d[1]==="stale"?183:d[1]==="exited"?58:19);
const recordsForFloor=()=>estate[tower][floor].map(actual);
const el=(id,en,zh)=>$(id).textContent=pair(en,zh);
function renderDirectory(){
 const d=recordsForFloor().find(r=>r[0]===selected);
 const tile=r=>{const tip=serial(r[0])+' · '+r[6]+' · '+stateName(r[1]);return '<button data-mask="'+r[0]+'" class="deviceitem tile '+r[1]+(r[0]===selected?' selected':'')+'" aria-pressed="'+(r[0]===selected)+'" aria-label="'+tip+'" title="'+tip+'">'+(r[0]===selected?'✓':'')+'</button>'};
 if(directoryScope==="floor"){
  $("terminals").className="unitgrid";
  $("terminals").innerHTML=apartments.map((a,i)=>'<div class="flat"><span>'+pair("Unit ","住戶 ")+String(i+1).padStart(2,"0")+'</span><div>'+recordsForFloor().slice(2*i,2*i+2).map(tile).join("")+'</div></div>').join("");
 }else{
  $("terminals").className="fullgrid";
  $("terminals").innerHTML=towerList.map(t=>'<section><b>'+names(t)+'</b>'+floorsList.map(f=>'<div class="fleetrow"><span>F'+f+'</span>'+estate[t][f].map(actual).map(tile).join("")+'</div>').join("")+'</section>').join("");
 }
 const wearer=wearerRecords.get(d[0]);
 const position=wearer?'<span>'+pair("Live location · ","即時位置 · ")+names(wearer.tower)+' / '+(wearer.status==="arrived"?pair("Ground exit","地面出口"):wearer.roof?pair("Roof","天台"):'F'+wearer.floor)+'</span>':'';
 $("unitdetail").innerHTML='<strong>'+serial(d[0])+'</strong><span>'+pair("Registered · ","登記位置 · ")+names(tower)+' / F'+floor+' / '+pair("Unit ","住戶 ")+d[6].slice(-2)+' / '+pair("Mask ","面罩 ")+d[7]+'</span>'+position+'<span>'+stateName(d[1])+'  ·  '+pair("Last signal ","最後訊號 ")+deviceTime(d)+'</span>';
}
const allDevices=()=>deviceCatalog.map(actual).map(([id,status,x,y,t,f,household,slot])=>({id:serial(id),tower:t,floor:f,household,slot,status,x:x??null,y:y??null}));
