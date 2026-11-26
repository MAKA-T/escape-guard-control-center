"use strict";
const guidedDesk=new URLSearchParams(location.search).get("example")==="guided";
const deskStorage=(()=>{try{return guidedDesk?null:localStorage}catch{return null}})();
const resetStampKey="escape-guard:v153:normal:reset-generation";
const readResetStamp=()=>{try{return deskStorage?.getItem(resetStampKey)||""}catch{return ""}};
const loadedResetStamp=readResetStamp();
let localResetStarted=false,lastResetResult=null;
window.EscapeConsoleReset={
 get isResetting(){const stamp=readResetStamp();return localResetStarted||stamp!==loadedResetStamp||stamp.startsWith("clearing:")},
 clearScenarioState(){
  if(lastResetResult?.ok)return lastResetResult;
  localResetStarted=true;
  const result={ok:false,mode:guidedDesk?"guided":"normal",removed:0,errors:[]};
  const generation=window.crypto?.randomUUID?.()||Date.now()+"-"+Math.random().toString(36).slice(2);
  try{
   if(deskStorage)deskStorage.setItem(resetStampKey,"clearing:"+generation);
   result.removed+=P.clearForReload();
   result.removed+=window.EscapeLiveOps?.clearSavedNotices()||0;
   const responseRemoved=window.EscapeFireResponse?.clearForReload();
   if(Number.isInteger(responseRemoved))result.removed+=responseRemoved;
   const evacuationKey="escape-guard:v153:evacuation:01";
   if(deskStorage&&deskStorage.getItem(evacuationKey)!==null){deskStorage.removeItem(evacuationKey);result.removed++;}
   if(deskStorage)deskStorage.setItem(resetStampKey,"ready:"+generation);
   live?.clearForReload?.();
   result.ok=true;
  }catch(error){result.errors.push(String(error?.message||error));}
  lastResetResult=result;return result;
 }
};
window.addEventListener("storage",event=>{
 if(deskStorage&&event.key===resetStampKey&&event.newValue?.startsWith("ready:")&&event.newValue!==loadedResetStamp&&!localResetStarted){
  localResetStarted=true;live?.clearForReload?.();window.dispatchEvent(new Event("escape-console-reset-external"));
 }
});
const P=window.EscapeRouting.create({storageKey:"escape-guard:v153:routes:",storage:deskStorage,canWrite:()=>!window.EscapeConsoleReset.isResetting});
window.EscapeFloorRouting=P;
const T=pair, esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const byId=(arr,id)=>(arr||[]).find(v=>v.id===id);
const langName=v=>language==="zh"?(v?.zh||v?.en||v):(v?.en||v?.zh||v);
const pad=n=>String(n).padStart(2,"0");
const seedOf=x=>window.EscapeSensorReports.find(r=>r.source===x?.source&&r.labelEn===x?.label);
const textName=x=>{const seed=seedOf(x);return seed?T(seed.labelEn,seed.labelZh):String(langName(x?.label)||x?.id||"").replace(/-/g," ")};
const displayExit=(exit,s)=>{const x=byId(s.exits,exit);return x?.custom?textName(x):exit==="A"?T("Stairwell A","A 樓梯"):exit==="B"?T("Stairwell B","B 樓梯"):exit||"—"};
const field=(id,title,control)=>'<label class="field" for="'+id+'"><span>'+title+'</span>'+control+'</label>';
const input=(id,value,max=65)=>'<input id="'+id+'" value="'+esc(value)+'" maxlength="'+max+'" autocomplete="off">';
const select=(id,options,value)=>'<select id="'+id+'">'+options.map(([key,txt])=>'<option value="'+esc(key)+'" '+(String(key)===String(value)?'selected':'')+'>'+esc(txt)+'</option>').join("")+'</select>';
const check=(id,text,on=false)=>'<label class="confirm"><input type="checkbox" id="'+id+'" '+(on?'checked':'')+'>'+text+'</label>';
const btn=(action,txt,primary=false,disabled=false)=>'<button type="button" data-cmd="'+action+'" class="'+(primary?'opPrimary':'subBtn')+'" '+(disabled?'disabled':'')+'>'+txt+'</button>';
const opt=(s)=>s.nodes.map(n=>[n.id,textName(n)]);
const get=id=>$(id)?.value||"",isOn=id=>Boolean($(id)?.checked);
const clock=()=>new Date().toLocaleTimeString("en-GB",{hour12:false});
const floorKey=()=>tower+floor;
let tab="alerts",tool="",activeAlert=null,note="",pickMode="inspect",trace=[],pickedNode="",pickedEdge="",formDraft={},modelController=null;
let inboxFloor=null,inboxCursor="E02";
let snapshot=P.snapshot(tower,floor);
let assistanceView="queue",groupDecision="",groupOption="",groupFieldChecked=false,groupNotice="",groupSubscription=null,lastGroupSelection=null;
let deskPlan=null;
function dismissPlan(){
 if(deskPlan)window.EscapePlanPreview?.clear();
 deskPlan=null;groupFieldChecked=false;
 if(formDraft){delete formDraft.verified;delete formDraft.checkedDraft;}
}
function groupPlanStamp(g,optionId){
 const floors=new Set();
 for(const path of groupService().remainingPaths(g.id,optionId))for(const point of path){
  floors.add(point.tower+pad(Math.min(12,Math.max(1,Math.floor(point.level)))));
 }
 return [...g.members].sort().join("|")+"@"+[...floors].sort().map(k=>k+"."+P.snapshot(k[0],k.slice(1)).revision).join("/");
}
const matchesGroupPlan=(g,id)=>deskPlan?.kind==="group"&&deskPlan.groupId===g.id&&deskPlan.optionId===id;
function planNotes(plan){
 if(!plan)return "";
 const info=plan.info;
 const fields=[["origin",T("From","起點")],["transfer",T("Stairs","使用樓梯")],["exit",T("Destination","目的地")]]
   .map(([k,l])=>[l,language==="zh"?info[k+"Zh"]:info[k+"En"]]).filter(([,v])=>typeof v==="string"&&v);
 const description=T(info.descriptionEn||"",info.descriptionZh||info.descriptionEn||"");
 let h='<div class="planNotes"><strong>'+T("3D route preview","三維路線預覽")+'</strong>';
 if(fields.length===3||(!description&&fields.length))h+='<dl>'+fields.map(([label,v])=>'<div><dt>'+label+'</dt><dd>'+esc(v)+'</dd></div>').join("")+'</dl>';
 else if(description)h+='<p>'+esc(description)+'</p>';
 if(plan.kind==="group"){
  const profile=T(info.profileEn||"",info.profileZh||info.profileEn||"");
  if(profile)h+='<small class="planProfile">'+esc(profile)+'</small>';
  if(Number.isInteger(info.peopleCount))h+='<small class="planAudience">'+info.peopleCount+' '+T("people in this group","位組員")+'</small>';
 }
 return h+'</div>';
}
const groupService=()=>window.EscapeEvacuation?.shared;
function floorDevices(){
 const tracked=new Set((groupService()?.listPeople?.()||[]).map(p=>p.deviceId));
 return recordsForFloor().filter(d=>!tracked.has(d[0])&&(d[1]==="moving"||d[1]==="stale")).map(d=>({id:d[0],x:d[2],y:d[3],status:d[1],observedAt:deviceTime(d)}));
}
const openAlerts=s=>s.alerts.filter(a=>a.status!=="resolved");
const actualRoute=(s,who,preferDraft=true)=>{const p=preferDraft&&s.draft&&s.draft.status!=="stale"?s.draft:s.published;return p?.routes?.find(r=>r.deviceId===who)||p?.routes?.[0]||p?.previewRoute||null};
function summarize(){return towerList.flatMap(t=>floorsList.map(f=>{const s=P.snapshot(t,f);return {tower:t,floor:f,alerts:openAlerts(s).map(a=>({...a,x:byId(s.nodes,a.nodeId)?.x,y:byId(s.nodes,a.nodeId)?.y}))}})).filter(x=>x.alerts.length)}
function stateForModel(s,sums){const p=s.published;return {tower,floor,selected:serial(selected),phase:p?'published':openAlerts(s).length?'review':'ready',published:Boolean(p),revision:p?.id||s.revision,affectedIds:p?.deviceIds?.map(serial)||[],acknowledgedIds:p?.dispatches?.filter(a=>a.status==="acknowledged").map(a=>serial(a.deviceId))||[],workspaceSnapshot:s,floorGraph:s,pickedNode,pickedEdge,trace:trace.slice(),pickMode:scenePickMode(),summaries:sums,displayRoute:tool==="report"?actualRoute(s,selected,false):null}}
function scenePickMode(){return ({edge:"edge",exit:"node",origin:"node",draw:"point"})[pickMode]||null;}
function sceneEvent(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}));}
function locate(extra={}){sceneEvent("escape-inspect-floor",{tower,floor,...extra});}
function setTool(next){dismissPlan();tool=next;formDraft={};pickMode="inspect";trace=[];pickedNode="";pickedEdge="";note=""}
function selectFloor(f,t=tower,frame=true){
 f=String(f).replace(/^[FL]/i,"").padStart(2,"0");if(!estate[t]?.[f])return;
 if(assistanceView==="group"&&(f!==floor||t!==tower)){assistanceView="queue";groupService()?.select(null)}
 if(f!==floor||t!==tower){tower=t;floor=f;selected=estate[t][f][0][0];activeAlert=null;setTool("")}
 render();if(frame)locate();
}
function chooseMask(id){
 id=String(id).replace(/^EG-/,"");const d=deviceCatalog.find(x=>x[0]===id);if(!d)return;
 if(tower!==d[4]||floor!==d[5]){setTool("");activeAlert=null;if(assistanceView==="group"){assistanceView="queue";groupService()?.select(null)}}
 tower=d[4];floor=d[5];selected=id;
 if(tab==="map"&&tool==="preview"){
  if(P.snapshot(tower,floor).draft?.routes.some(r=>r.deviceId===id)){openFloorPlan(id);return;}
  dismissPlan();
 }
 render();locate({deviceId:id});
}
function saveFields(){for(const i of $("inspector").querySelectorAll("input[id],select[id]"))formDraft[i.id]=i.type==="checkbox"?i.checked:i.value}
function fm(key,defaultValue=""){return Object.hasOwn(formDraft,key)?formDraft[key]:defaultValue}
function action(type,data,message=""){
 const res=P.act(tower,floor,type,data);
 if(!res.ok){note=err(res.code);return false}
 snapshot=res.snapshot;note=message;
 if(["edge","exit","exitStatus","passage","alert","alertStatus"].includes(type))sceneEvent("escape-access-change",{tower,floor,type,snapshot});
 return true
}
function err(code){
 const errors={NO_ROUTE:["No route is available for this selection.","沒有可用路線。"],STALE_DRAFT:["The floor map changed. Generate a new draft.","樓層地圖已變更，請重新產生草稿。"]};
 return errors[code]?T(...errors[code]):T("The change could not be applied. ","未能套用此變更。")+String(code||"").replaceAll("_"," ").toLowerCase();
}
function render(){
 if(inboxFloor&&(inboxFloor.t!==tower||inboxFloor.f!==floor))inboxFloor=null;
 const prev=document.activeElement?.matches("button:focus-visible")?document.activeElement:null;
 const keep=prev?.id?"#"+CSS.escape(prev.id):prev?.dataset?.mask?'button[data-mask="'+CSS.escape(prev.dataset.mask)+'"]':null;
 document.documentElement.lang=language==="zh"?"zh-Hant":"en";snapshot=P.snapshot(tower,floor);const s=snapshot,sums=summarize();
 el("consoleName","Control Center","樓宇總控中心");el("sim","Local simulated feeds","本地模擬資料");el("lang","繁中","English");
 el("site","Harbour Court  /  Residential estate","海港苑  /  住宅屋苑");el("headline","Estate operations","屋苑總控");
 $("fleetCount").textContent=deviceCatalog.length;$("fleetText").textContent=T("Registered masks","已登記面罩");
 el("floorTitle","Floors","樓層");el("terminalTitle","Mask directory","面罩目錄");el("deskTitle","Operator desk","值班席");$("listSum").textContent="";
 $("towers").innerHTML=towerList.map(t=>'<button class="towerchoice '+(t===tower?'active':'')+'" data-tower="'+t+'" aria-pressed="'+(t===tower)+'">'+names(t)+'</button>').join("");
 $("floors").innerHTML=floorsList.map(f=>'<button class="flooritem '+(floor===f?'selected':'')+'" data-floor="'+f+'" aria-pressed="'+(floor===f)+'">F'+f+(sums.some(l=>l.tower===tower&&l.floor===f)?'<i class="incidentmark"></i>':'')+'</button>').join("");
 $("scopechoice").innerHTML=['floor','estate'].map(d=>'<button data-dir="'+d+'" class="'+(d===directoryScope?'active':'')+'" aria-pressed="'+(d===directoryScope)+'">'+(d==="floor"?T("This floor · 12","本層 · 12"):T("Estate · 288","全苑 · 288"))+'</button>').join("");
 refreshWearers();$("statuskey").innerHTML=Object.keys(states).map(k=>'<span><i class="tile '+k+'"></i>'+stateName(k)+'</span>').join("");renderDirectory();
 $("mapKicker").textContent=T("3D hazard view","三維風險視圖");
 $("mapTitle").textContent=names(tower)+' / F'+floor;
 $("legend").textContent=T("Simulated hazard layers","模擬風險圖層");
 $("mapNote").textContent=scenePickMode()?T("Select a location in the 3D floor","在三維樓層選取位置"):T("Drag to orbit · Scroll to zoom","拖曳旋轉 · 滾動縮放");
 $("counts").innerHTML=Object.keys(states).map(k=>'<div class="metric"><b>'+recordsForFloor().filter(d=>d[1]===k).length+'</b><span>'+stateName(k)+'</span></div>').join("");
 renderHUD(s);renderCamera(s);renderWorkspace(s);$("feedback").textContent=note;
 {
  let div=$("modelViewport");if(!div){div=document.createElement("div");div.id="modelViewport";$("map").replaceChildren(div)}
  if(!modelController){modelController=window.EscapeBuilding3D.mount(div,{tower,floor,devices:allDevices(),onTower:t=>selectFloor(floor,t),onFloor:(f,t)=>selectFloor(f,t||tower,false),onDevice:chooseMask,onIncident:(t,f,id)=>openIncident(t,f,id)})}
  modelController.setTower?.(tower);modelController.setFloor(floor);modelController.setState(stateForModel(s,sums));modelController.resize();
 }
 if(keep)document.querySelector(keep)?.focus({preventScroll:true});live?.update?.();
}
function renderHUD(s){
 const d=recordsForFloor().find(d=>d[0]===selected),assignment=s.assignments?.[selected],lastDispatch=s.published?.dispatches?.find(x=>x.deviceId===selected);
 const rec=assignment?{status:!assignment.active?"held":assignment.acknowledgedAt?"acknowledged":"sent"}:lastDispatch;
 const r=assignment||s.published?.routes?.find(x=>x.deviceId===selected);
 let title,detail,mark,active=false;
 if(d[1]==="standby"){title=T("Docked and ready","已入座待機");detail=T("No active wearer session.","目前沒有佩戴紀錄。");mark="○"}
 else if(d[1]==="exited"){title=T("Exit confirmed","已確認離開建築");detail=T("Recorded at the ground-floor egress checkpoint.","由地面出口核對點確認。");mark="✓"}
 else if(d[1]==="stale"){title=T("Device status unknown","面罩現況未明");detail=T("Last known position. No current display report.","僅有最後位置，尚無畫面回報。");mark="?"}
 else if(rec?.status==="acknowledged"&&r?.exitId){title=T("Proceed to ","前往")+displayExit(r.exitId,s);detail=(language==="en"?"前往 ":"Proceed to ")+displayExit(r.exitId,s)+' · '+T("Receipt confirmed","已收到回執");mark="↗";active=true}
 else if(rec?.status==="sent"||rec?.status==="pending"){title=T("Awaiting receipt","等候面罩回執");detail=T("Delivery sent. The new cue is unconfirmed.","修訂已派送，尚待確認新指引。");mark="…"}
 else if(openAlerts(s).length||rec?.status==="held"){title=T("Guidance paused","指引暫停");detail=T("No current direction confirmed for this mask.","此面罩暫無經確認的方向提示。");mark="Ⅱ"}
 else{title=T("Wearer session active","面罩已啟用");detail=T("Position report available on this floor.","已收到本層的位置回報。");mark="●"}
 const wearer=wearerRecords.get(selected);
 if(wearer){
  const route=groupService().routeForPerson(wearer.id);
  if(wearer.status==="arrived"){title=T("Ground exit reached","已抵達地面出口");detail=route?.exit?names(route.exit.tower)+' / '+T("Ground exit ","地面出口 ")+route.exit.id:"";mark="✓";active=false}
  else if(wearer.source==="pending"){title=T("Awaiting assistance","等候協助");detail=T("The duty desk has not released a route for this group.","值班席尚未向此組發布路線。");mark="Ⅱ";active=false}
  else if(route?.exit){title=T("Ground exit ","地面出口 ")+route.exit.id;detail=names(route.exit.tower)+' / '+(wearer.source==="manual"?T("Operator-guided","人工引導中"):T("Auto-assigned","已自動安排"));mark="↗";active=true}
 }
 const msg=live?.latestFor?.(selected);
 $("maskDisplay").innerHTML='<div class="tagline"><b>'+T("In-mask display","面罩內顯示")+'</b><span>'+serial(d[0])+' / '+stateName(d[1])+'</span></div><div class="hudmain"><div class="hudicon '+(active?'approved':'')+'">'+mark+'</div><div><strong>'+esc(title)+'</strong><span>'+esc(detail)+'</span></div></div>'+(msg?'<div class="lastBroadcast"><b>'+T("Broadcast","廣播")+' · '+(msg.received?T("Received","已接收"):T("Pending","待接收"))+'</b> '+esc(msg.body)+'</div>':"");
}
const sourceNames={detector:["Detector","探測器"],camera:["Camera","攝像頭"],staff:["Staff","值班人員"],firefighter:["Fire crew","消防人員"]};
const statusNames={open:["Open","待核查"],active:["Open","待核查"],reviewed:["Reviewed","已核查"],resolved:["Resolved","已解除"],draft:["Draft","草稿"],stale:["Stale","待重新計算"],sent:["Sent","已發送"],acknowledged:["Received","已回執"],pending:["Pending","待回執"],held:["Held","已暫停"]};
const stname=k=>statusNames[k]?T(...statusNames[k]):k||T("Open","待核查");
const small=(txt)=>'<p class="opHelp">'+esc(txt)+'</p>';
const subhead=(name,tail="")=>'<div class="ophead"><h2>'+name+'</h2>'+tail+'</div>';
const pathTitle=(r,s)=>r?.status==="routed"||r?.exitId?displayExit(r.exitId,s):T("No connected exit","沒有相連出口");
const optsByEdge=s=>s.edges.map(e=>[e.id,textName(byId(s.nodes,e.a))+" → "+textName(byId(s.nodes,e.b))]);
function workspaceHead(title){return '<div class="scopeLine">'+names(tower)+' / F'+floor+'</div>'+subhead(title)}
function toolListRow(cmd,title,desc){return '<button class="toolrow" data-cmd="'+cmd+'"><span><b>'+title+'</b><small>'+desc+'</small></span><i>›</i></button>'}
function renderWorkspace(s){
 const labels={alerts:T("Incidents","事件"),routes:T("Groups","群組"),map:T("Access","通道"),broadcast:T("Broadcast","廣播")};
 const icons={alerts:"incidents",routes:"groups",map:"access",broadcast:"broadcast"};
 $("workspaceTabs").innerHTML=Object.keys(labels).map(k=>'<button data-tab="'+k+'" aria-pressed="'+(tab===k)+'" class="'+(tab===k?'active':'')+'">'+EscapeDeskIcons.svg(icons[k])+'<span>'+labels[k]+'</span></button>').join("");
 $("workspaceTabs").setAttribute("aria-label",T("Operator workspaces","值班工作區"));
 $("broadcastPanel").hidden=tab!=="broadcast";$("inspector").hidden=tab==="broadcast";
 if(tab==="routes")drawGroupOnly();
 else $("inspector").innerHTML=tab==="alerts"?(activeAlert||tool==="addAlert"?renderAlerts(s):incidentInbox()):tab==="map"?(["draft","preview","report"].includes(tool)?renderRoutes(s):renderMap(s)):"";
}
function groupLabel(item){
 if(language!=="zh")return item.label||item.id;
 const label=item.labelZh||item.label;
 return (item.status==="moving"||item.status==="arrived")?label.replace("待援組","組"):label;
}
function groupPlace(g){return language==="zh"?(g.locationZh||g.location):(g.location||"")}
function holdingPoint(g){return (language==="zh"?g.holdingPointLabelZh:g.holdingPointLabel)||groupPlace(g)}
const needsAssistance=g=>!["moving","arrived"].includes(g.status);
function groupIcon(g){
 const paths=g.id==="roof-east"?'<path d="m2 10 10-7 10 7M5 9v10h14V9M8 19v-6h5"/>':g.id==="upper-west"?'<path d="M3 18h5v-4h5v-4h7M4 8h8m-4-3 3 3-3 3"/>':'<path d="M4 19V5h9v14m0-10h6v10M7 8h3m-3 4h3m-5 7h17"/>';
 return '<svg class="groupType" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
}
function groupStatus(g){
 if(g.status==="arrived")return T("At safe point","已到安全點");
 if(g.status==="moving")return T("Operator-guided","人工引導中");
 if(g.status==="verified")return T("Passage verified · release pending","通道已核實，待發布");
 if(g.status==="waiting"||g.waitingVerified)return T("Holding point confirmed","已在指定區等候");
 if(g.crewRequested)return T("Crew requested","已請求增援");
 return T("Needs action","待處理");
}
function groupFloor(g){return names(g.tower)+(g.roof?T(" / Roof"," / 天台"):' / F'+String(g.floor).padStart(2,"0"))}
function groupRow(g){
 const cls=needsAssistance(g)?"priority":g.status==="moving"?"guided":"arrived";
 return '<button type="button" data-group="'+esc(g.id)+'" class="groupRow '+cls+'">'+groupIcon(g)+'<span class="groupRowTitle"><strong>'+esc(groupLabel(g))+'</strong><small>'+esc(groupFloor(g))+' · '+esc(groupStatus(g))+'</small></span><span class="groupSize">'+esc(g.count)+'<small>'+T("people","人")+'</small></span><span class="groupChevron" aria-hidden="true">›</span></button>';
}
function simpleDecisionGroup(g,decision){
 const actions=[
  ["requestCrew",T("Request rescue crew","請求增派救援")],
  ["wait",T("Use designated holding point","安排指定位置等候")],
  ["blocked",T("Original exit still blocked","原出口仍受阻")],
  ["verify",T("Verify an alternative route","核驗替代通道")]
 ];
 if(g.verifiedOptionId)actions.push(["publish",T("Release verified route","發布已核實路線")]);
 const current=actions.some(([id])=>id===decision)?decision:g.verifiedOptionId?"publish":"verify";
 let body='<label class="groupField"><span>'+T("Operator decision","值班決策")+'</span><select id="groupDecision">'+actions.map(([id,label])=>'<option value="'+id+'" '+(id===current?'selected':'')+'>'+esc(label)+'</option>').join("")+'</select></label>';
 let command,description="",blocked=false;
 if(current==="requestCrew"){command=T("Request rescue crew","請求增派救援");description=g.crewRequested?T("The crew request is logged. This group still needs assistance.","增援請求已登記，此組仍待處理。"):T("Send the group’s location and headcount to the response team.","將此組的位置及人數交給救援團隊。");blocked=g.crewRequested}
 else if(current==="wait"){
  command=T("Confirm holding point","確認等候位置");blocked=g.holdingPointAvailable===false;
  description=blocked?T("The group is outside its designated holding point.","此組尚未到達指定等候位置。"):T("Designated point · ","指定位置 · ")+holdingPoint(g);
 }
 else if(current==="blocked"){command=T("Record blocked exit","記錄出口仍受阻");description=T("Keep the original exit closed for this group.","保留此組原出口的受阻標記。")}
 else if(current==="verify"){
  const options=g.options||[],available=options.filter(o=>o.available!==false&&window.EscapeRouteGuard?.check?.(g.id,o.id)?.ok!==false);
  const chosen=available.find(o=>o.id===groupOption)||available[0];
  body+='<label class="groupField"><span>'+T("Route to verify","待核實路線")+'</span><select id="groupOption" '+(!available.length?'disabled':'')+'>'+options.map(o=>'<option value="'+esc(o.id)+'" '+(available.includes(o)?'':'disabled')+' '+(o.id===chosen?.id?'selected':'')+'>'+esc(groupLabel(o))+(available.includes(o)?'':T(" · unavailable"," · 受限"))+'</option>').join("")+'</select></label>';
   if(!chosen)return body+small(T("No connected alternative is available.","尚無相連的可用替代路線。"));
   if(!matchesGroupPlan(g,chosen.id))return body+previewGroupButton(g.id);
   body+=planNotes(deskPlan);
   command=T("Confirm route review","確認路線核驗");description=T("Guidance is sent after you publish.","發布後才向此組傳送指引。");
 }else{
  command=T("Publish to this group","發布至此組");
  const chosen=(g.options||[]).find(o=>o.id===g.verifiedOptionId);
   if(chosen&&!matchesGroupPlan(g,chosen.id))return body+previewGroupButton(g.id);
   body+=planNotes(deskPlan);
   description=chosen?T("Reviewed route · ","已核實路線 · ")+groupLabel(chosen):T("Verify an alternative before release.","發布前請先核實替代路線。");blocked=!chosen||!deskPlan?.reviewed||chosen.available===false||window.EscapeRouteGuard?.check?.(g.id,chosen.id)?.ok===false
 }
 if(description)body+='<p class="groupHelp">'+esc(description)+'</p>';
 if(["wait","verify","blocked"].includes(current)){
  const txt=current==="wait"?T("Field staff confirmed this point for this group.","現場人員已核實此組可在這個指定位置等候。"):current==="verify"?T("Fire crew confirmed the connection and exit.","消防人員已核實通道連接及出口。"):T("The field team rechecked the original exit.","現場人員已覆查原出口。");
  body+='<label class="groupConsent"><input id="groupFieldConfirmed" type="checkbox" '+(groupFieldChecked?'checked':'')+'>'+txt+'</label>';blocked=blocked||!groupFieldChecked;
 }
 body+='<button type="button" class="opPrimary groupAction" data-group-action="'+current+'" data-group-target="'+esc(g.id)+'" '+(blocked?'disabled':'')+'>'+esc(command)+'</button>';
  if(matchesGroupPlan(g,deskPlan?.optionId))body+=btn("cancelGroupPlan",T("Cancel preview","取消預覽"));
 return body;
}
function previewGroupButton(id){
 return '<button type="button" class="opPrimary" data-group-action="preview" data-group-target="'+esc(id)+'">'+T("Preview route in 3D","在三維中預覽路線")+'</button>';
}
function groupDetails(g){
 const active=needsAssistance(g);
 let h='<div class="groupDetail" data-active-party="'+esc(g.id)+'" data-release-option="'+esc(g.releaseOptionId||"")+'"><button type="button" class="groupBack" data-group-nav="queue">‹ '+T("All groups","所有群組")+'</button><div class="groupDetailHead">'+groupIcon(g)+'<div><span>'+esc(groupFloor(g))+'</span><h2>'+esc(groupLabel(g))+'</h2></div></div>';
 const point=groupPlace(g).split("·").at(-1).trim().replace(/^F\d+\s+/i,"").replace(/^\d+\s*樓\s*/,"");
 h+='<div class="groupFacts"><strong>'+esc(g.count)+' '+T("people","人")+'</strong><span>'+esc(point)+'</span></div><div class="groupState '+(active?'priority':'guided')+'"><i aria-hidden="true">'+(active?'!':g.status==="arrived"?'✓':'↗')+'</i><span><b>'+esc(groupStatus(g))+'</b>'+(active&&g.originalBlocked?'<small>'+T("Original exit blocked · guidance paused","原出口受阻 · 指引暫停")+'</small>':'')+'</span></div>';
 if(active&&g.crewRequested&&groupStatus(g)!==T("Crew requested","已請求增援"))h+='<p class="groupHistory">'+T("Rescue crew requested","已請求增援")+'</p>';
 if(groupNotice)h+='<p class="groupNotice" role="status">'+esc(groupNotice)+'</p>';
 const data=groupService().snapshot(),members=data.people.filter(p=>p.groupId===g.id);
 h+='<details class="recipientRoster"><summary>'+T("Recipient masks","接收面罩")+' <b>'+members.length+'</b></summary><p>'+members.map(p=>esc(serial(p.deviceId))).join(' · ')+'</p></details>';
 if(active)h+=simpleDecisionGroup(g,groupDecision);
 else{
  const route=(g.options||[]).find(o=>o.id===g.releaseOptionId);if(route)h+='<div class="groupReleased"><span>'+T("Released route","已發布路線")+'</span><b>'+esc(groupLabel(route))+'</b></div>';
  if(g.status==="moving")h+='<details class="optionalField"><summary>'+T("Report a blocked route","回報已發布路線受阻")+'</summary>'+check("withdrawConfirmed",T("Field staff confirmed that this route is blocked.","現場人員已確認該路線受阻。"))+'<button type="button" class="subBtn" data-group-action="withdraw" data-group-target="'+esc(g.id)+'">'+T("Withdraw this group’s route","撤回此組路線")+'</button></details>';
 }
 return h+'</div>';
}
function groupSummary(data){
 const gs=data.groups||[],waiting=gs.filter(needsAssistance),moving=gs.filter(g=>g.status==="moving"),arrived=gs.filter(g=>g.status==="arrived");
 const priorityRank=g=>g.status==="verified"?0:g.status==="waiting"?3:g.crewRequested?2:1;
 waiting.sort((a,b)=>priorityRank(a)-priorityRank(b));
 const n=data.counts.needsAssistance;
 let h='<div class="assistanceIntro"><h2>'+T("Assistance queue","援助群組")+'</h2></div><p class="queueScope">'+(language==="zh"?waiting.length+' 組 · '+n+' 人待處理':waiting.length+' '+(waiting.length===1?'group':'groups')+' · '+n+' '+(n===1?'person needs':'people need')+' attention')+'</p>';
 if(waiting.length)h+='<div class="groupQueue">'+waiting.map(groupRow).join("")+'</div>';
 else h+='<p class="groupHelp">'+T("The assistance queue is clear.","目前沒有待處理群組。")+'</p>';
 if(moving.length||arrived.length)h+='<div class="groupProgress"><h3>'+T("Guidance follow-up","引導進度")+'</h3>'+moving.concat(arrived).map(groupRow).join("")+'</div>';
 return h;
}
function renderAssistance(s){
 const service=groupService();if(!service)return renderAlerts(s);
 const data=service.snapshot(),g=(data.groups||[]).find(g=>g.id===data.selectedGroupId);
 if(assistanceView==="group"&&g)return groupDetails(g);
 return groupSummary(data);
}
function clearGroupDraft(){dismissPlan();groupDecision="";groupOption="";groupFieldChecked=false;groupNotice=""}
function drawGroupOnly(){
 if(tab!=="routes")return;
 const panel=$("inspector"),markup=renderAssistance(snapshot);
 if(panel._groupMarkup===markup&&panel.firstElementChild===panel._groupElement)return;
 const before=panel.querySelector("[data-active-party]");
 const rosterOpen=before?.querySelector(".recipientRoster")?.open;
 const withdrawalOpen=before?.querySelector(".optionalField")?.open,checked=isOn("withdrawConfirmed");
 const focused=panel.contains(document.activeElement)?document.activeElement.id:"";
 panel.innerHTML=markup;panel._groupMarkup=markup;panel._groupElement=panel.firstElementChild;
 const after=panel.querySelector("[data-active-party]");
 if(!before||!after||before.dataset.activeParty!==after.dataset.activeParty)return;
 if(rosterOpen&&after.querySelector(".recipientRoster"))after.querySelector(".recipientRoster").open=true;
 if(withdrawalOpen&&before.dataset.releaseOption===after.dataset.releaseOption&&$("withdrawConfirmed")){
  $("withdrawConfirmed").closest("details").open=true;$("withdrawConfirmed").checked=checked;
 }
 if(focused)$(focused)?.focus({preventScroll:true});
}
function showAssistancePage(page){
 assistanceView=page==="floor"?"floor":"queue";clearGroupDraft();setTool("");
 if(groupService()?.snapshot().selectedGroupId)groupService().select(null);
 render();
}
function onGroupChange(){
 const service=groupService(),d=service?.snapshot();if(!d)return;
 const g=d.groups.find(v=>v.id===d.selectedGroupId),changed=d.selectedGroupId!==lastGroupSelection;
 lastGroupSelection=d.selectedGroupId;
 if(changed&&g){
  tab="routes";assistanceView="group";clearGroupDraft();setTool("");
  tower=g.tower;floor=String(g.floor).padStart(2,"0");
  const person=(d.people||[]).find(p=>p.groupId===g.id&&p.deviceId),candidate=String(person?.deviceId||"").replace(/^EG-/,"");
  selected=(estate[tower]?.[floor]||[]).find(row=>row[0]===candidate)?.[0]||estate[tower][floor][0][0];
  render();return;
 }
 if(changed&&!g&&assistanceView==="group"){assistanceView="queue";clearGroupDraft()}
 refreshWearers();renderDirectory();renderHUD(snapshot);
 drawGroupOnly();
}
function openAssistanceGroup(id){
 const service=groupService();if(!service)return;
 const g=service.snapshot().groups.find(g=>g.id===id);if(!g)return;
 if(service.snapshot().selectedGroupId===id){clearGroupDraft();assistanceView="group";tab="routes";render();return}
 service.select(id);
}
function dispatchAssistance(id,type){
 const service=groupService(),g=service?.snapshot().groups.find(x=>x.id===id);if(!g||service.snapshot().selectedGroupId!==id)return;
 if(type==="withdraw"){
  if(g.status!=="moving"||!g.releaseOptionId||!isOn("withdrawConfirmed")){$("feedback").textContent=T("Confirm the field report before withdrawing guidance.","請核實現場通報後再撤回指引。");return}
  const result=service.act(id,"blocked",{optionId:g.releaseOptionId,confirmed:true});
  if(result.ok){clearGroupDraft();groupNotice=T("Guidance withdrawn for this group.","已撤回此組的指引。");live?.log?.({tower:g.tower,floor:g.floor,source:"Desk",en:"Group route withdrawn · "+g.label,zh:"已撤回群組路線 · "+g.labelZh});drawGroupOnly();}
  return;
 }
 if(!needsAssistance(g))return;
 const selectedAction=get("groupDecision");
 if(type==="preview"){
  const optionId=selectedAction==="publish"?g.verifiedOptionId:get("groupOption");
  const option=g.options.find(o=>o.id===optionId),guard=window.EscapeRouteGuard?.check(id,optionId);
  dismissPlan();groupNotice="";
  if(!option?.available||guard?.ok===false){groupNotice=T(guard?.reasonEn||"This route is unavailable.",guard?.reasonZh||"這條路線目前受限。");drawGroupOnly();return;}
  const info=window.EscapePlanPreview?.show({kind:"group",groupId:id,optionId});
  if(info?.ok){deskPlan={kind:"group",groupId:id,optionId,info,stamp:groupPlanStamp(g,optionId),reviewed:false};groupOption=optionId;groupDecision="verify";}
  else groupNotice=T("The 3D route could not be shown. Choose another route.","無法顯示此路線的三維預覽，請另選路線。");
  drawGroupOnly();return;
 }
 if(type!==selectedAction)return;
 if(["wait","blocked","verify"].includes(type)&&!isOn("groupFieldConfirmed"))return;
 const data=type==="verify"?{optionId:get("groupOption"),confirmed:true}:type==="publish"?{optionId:g.verifiedOptionId}:["wait","blocked"].includes(type)?{confirmed:true}:{};
 const guard=window.EscapeRouteGuard;
 if(["verify","publish"].includes(type)&&(!matchesGroupPlan(g,data.optionId)||deskPlan.stamp!==groupPlanStamp(g,data.optionId)||(type==="publish"&&!deskPlan.reviewed))){
  dismissPlan();groupNotice=T("Conditions changed. Preview the route again.","狀況已有變更，請重新預覽路線。");drawGroupOnly();return;
 }
 if(guard&&["verify","publish"].includes(type)){
  const match=guard.check?.(id,data.optionId);
  if(match?.ok===false){groupNotice=T(match.reasonEn||"This connection is restricted.",match.reasonZh||"此通道已受限制。");drawGroupOnly();return}
 }
 const result=service.act(id,type,data);
 if(!result.ok){groupNotice=T("The group’s conditions changed. Check the current route before continuing.","此組狀態已變更，請先核對當前路線。");drawGroupOnly();return}
 if(type==="verify"){deskPlan.reviewed=true;groupFieldChecked=false;groupDecision="publish";groupNotice="";}
 else clearGroupDraft();
 if(type==="blocked")groupNotice=T("Original exit recorded as blocked. No direction sent.","已記錄原出口仍受阻，此組未收到方向指引。");
 if(type==="wait")groupNotice=T("Holding point recorded for this group.","已記錄此組的等候位置。");
 if(type==="publish")window.EscapeRouteFocus?.set?.("manual",id);
 if(live?.log)live.log({tower:g.tower,floor:g.floor,source:"Desk",en:groupLabel(g)+" · "+({publish:"Route sent to "+g.count+" people",verify:"Field route verified",requestCrew:"Crew requested",wait:"Holding point confirmed",blocked:"Original exit blocked"})[type],zh:(g.labelZh||g.label)+" · "+({publish:"已向 "+g.count+" 位組員發布路線",verify:"已核實通道",requestCrew:"已請求增援",wait:"已確認等候位置",blocked:"原出口受阻"})[type]});
 drawGroupOnly();
}
function connectAssistance(){
 if(groupSubscription||!groupService())return;
 groupSubscription=groupService().subscribe(onGroupChange);onGroupChange();
}
function floorSignalChart(reports){
 const locations=new Map();
 for(const r of reports){
  const key=r.t+r.f,counts=locations.get(key)||{open:0,reviewed:0};
  counts[r.status==="reviewed"?"reviewed":"open"]++;locations.set(key,counts);
 }
 const chartName=T("Reports by floor","樓層通報分布");
 let markup='<section class="floorSignal" aria-label="'+chartName+'"><h3>'+chartName+'</h3><div class="signalLegend"><span><i class="signalMark signalPending"></i>'+T("To verify","待核實")+'</span><span><i class="signalMark signalVerified"></i>'+T("Confirmed","已核實")+'</span><span><i class="signalMark signalQuiet"></i>'+T("None open","無未結案通報")+'</span></div>';
 markup+='<div class="signalPlot" role="toolbar" aria-label="'+T("Filter reports by floor","按樓層篩選通報")+'" aria-description="'+T("Left and right change floors. Up and down change towers. Enter selects a floor.","左右鍵切換樓層，上下鍵切換住宅座，按 Enter 選取樓層。")+'">';
 const position=(row,col,band)=>' style="--small-row:'+(row+3*band)+';--small-col:'+col+';--wide-row:'+row+';--wide-col:'+(col===1?1:col+6*band)+'"';
 for(let band=0;band<2;band++){
  for(let j=0;j<6;j++)markup+='<span class="signalTick '+(band?'nextSignalBand':'')+'" aria-hidden="true"'+position(1,j+2,band)+'>'+pad(j+6*band+1)+'</span>';
  towerList.forEach((towerCode,towerIndex)=>{
   const row=towerIndex+2;
   markup+='<span class="signalTower '+(band?'signalRepeated':'')+'" aria-hidden="true"'+position(row,1,band)+'>'+ (towerCode==="E"?T("East","東座"):T("West","西座"))+'</span>';
   for(let j=0;j<6;j++){
    const floorCode=pad(j+6*band+1),key=towerCode+floorCode,counts=locations.get(key)||{open:0,reviewed:0};
    const state=counts.open&&counts.reviewed?"mixed":counts.open?"pending":counts.reviewed?"verified":"quiet";
    const active=inboxFloor?.t===towerCode&&inboxFloor?.f===floorCode;
    const info=(counts.open||counts.reviewed)?[counts.open?counts.open+T(" to verify"," 則待核實"):"",counts.reviewed?counts.reviewed+T(" confirmed"," 則已核實"):""].filter(Boolean).join(", "):T("No open reports","無未結案通報");
    const name=names(towerCode)+" F"+floorCode+" · "+info;
    markup+='<button type="button" id="signal-'+key+'" data-signal-floor="'+key+'" data-signal-state="'+state+'" aria-pressed="'+active+'" aria-label="'+esc(name)+'" title="'+esc(name)+'" tabindex="'+(inboxCursor===key?'0':'-1')+'"'+position(row,j+2,band)+'>'+(counts.open?'<i class="signalMark signalPending"></i>':'')+(counts.reviewed?'<i class="signalMark signalVerified"></i>':'')+(state==="quiet"?'<i class="signalMark signalQuiet"></i>':'')+'</button>';
   }
  });
 }
 return markup+'</div></section>';
}
function selectInboxFloor(key){
 if(key===null){inboxFloor=null;render();window.dispatchEvent(new Event("escape-estate-overview"));return}
 const t=key[0],f=key.slice(1);if(!estate[t]?.[f])return;
 inboxCursor=key;inboxFloor={t,f};activeAlert=null;setTool("");selectFloor(f,t);
 sceneEvent("escape-observe-floor",{tower:t,floor:f});
}
function incidentInbox(){
 const reports=towerList.flatMap(t=>floorsList.flatMap(f=>P.snapshot(t,f).alerts.map(a=>({...a,t,f}))));
 const rows=reports.filter(r=>r.status!=="resolved").sort((a,b)=>Number(a.status==="reviewed")-Number(b.status==="reviewed")||String(b.observedAt).localeCompare(String(a.observedAt)));
 function row(r){
  const open=r.status==="open";
  const status=open?T("To verify","待核實"):r.status==="reviewed"?T("Confirmed","已核實"):stname(r.status);
  return '<button class="incidentRow" data-incident="'+esc(r.id)+'" data-at-tower="'+r.t+'" data-at-floor="'+r.f+'"><span class="incidentGlyph '+(open?'attention':'')+'" aria-hidden="true">'+EscapeDeskIcons.svg(EscapeDeskIcons.sensor(r.source))+'</span><span><strong>'+esc(textName(r))+'</strong><small>'+names(r.t)+' / F'+r.f+'</small></span><i>'+esc(status)+' ›</i></button>';
 }
 const matches=r=>!inboxFloor||(r.t===inboxFloor.t&&r.f===inboxFloor.f);
 const visible=rows.filter(matches);
 let html='<div class="deskSectionTitle"><h2>'+T("Incident inbox","事件收件匣")+'</h2><span>'+visible.length+'</span></div>';
  html+=floorSignalChart(rows);
  if(inboxFloor)html+='<div class="signalScope"><strong>'+names(inboxFloor.t)+' / F'+inboxFloor.f+'</strong><button type="button" data-cmd="clearInboxFloor">'+T("All floors","全部樓層")+' <span aria-hidden="true">×</span></button></div>';
  html+=visible.length?visible.map(row).join(""):small(inboxFloor?T("No open reports on this floor.","此樓層目前沒有未結案通報。"):T("No open reports across the estate.","全苑目前沒有未結案通報。"));
  const closed=reports.filter(r=>r.status==="resolved"&&matches(r));
 if(closed.length)html+='<details class="optionalField"><summary>'+T("Closed reports","已結案通報")+' ('+closed.length+')</summary>'+closed.map(row).join("")+'</details>';
 const waiting=groupService()?.snapshot().counts.priorityGroups||0;
 if(waiting)html+='<button type="button" class="groupSignalLink" data-tab="routes"><span><b>'+T("Groups awaiting assistance","等候協助的群組")+'</b></span><span>'+waiting+' ›</span></button>';
 return html+btn("addAlert",T("Log observation","記錄現場觀察"));
}
function openIncident(t,f,id){
 f=String(f).padStart(2,"0");if(!estate[t]?.[f])return;
 if(groupService()?.snapshot().selectedGroupId)groupService().select(null);
 if(tower!==t||floor!==f){tower=t;floor=f;selected=estate[t][f][0][0];}
 tab="alerts";setTool("");const list=P.snapshot(t,f).alerts;
 const code=window.EscapeSensorReports.find(r=>r.id===id&&r.tower===t&&r.floor===f)?.source;
 const alert=byId(list,id)||list.find(a=>code&&a.source===code)||[...list].reverse().find(a=>a.status!=="resolved");
 activeAlert=alert?.id||null;pickedNode=alert?.nodeId||"";render();locate({nodeId:pickedNode,alertId:activeAlert});
}
function renderAlerts(s){
 if(tool==="addAlert"){
  return workspaceHead(T("Log an observation","記錄現場觀察"))
   +field("alarmLabel",T("Report title","通報標題"),input("alarmLabel",fm("alarmLabel")))
   +field("source",T("Source","來源"),select("source",Object.entries(sourceNames).map(([k,v])=>[k,T(...v)]),fm("source","detector")))
   +field("alarmNode",T("Location","位置"),select("alarmNode",opt(s),pickedNode||fm("alarmNode","east-watch")))
   +btn("pickAlarm",T("Select in 3D","從三維樓層選取"))
   +field("alarmNotes",T("Observation","觀察紀錄"),input("alarmNotes",fm("alarmNotes")))
   +btn("createAlert",T("Save report","儲存通報"),true)+btn("cancel",T("Cancel","取消"));
 }
 const alerts=[...s.alerts].reverse();
 const a=byId(alerts,activeAlert)||alerts.find(item=>item.status==="open")||alerts[0];
 if(!a)return workspaceHead(T("Alerts","警報"))+small(T("No reports on this floor.","本層暫無通報。"))+btn("addAlert",T("Log an observation","記錄現場觀察"),true);
 const time=a.observedAt?.includes("T")?new Date(a.observedAt).toLocaleTimeString("en-GB",{hour12:false}):a.observedAt||"—";
 const src=sourceNames[a.source]?T(...sourceNames[a.source]):a.source||T("Observation","觀察");
 let h='<button class="groupBack" data-cmd="inbox">‹ '+T("Incident inbox","事件收件匣")+'</button>'+workspaceHead(esc(textName(a)));
 const camera=sourceCamera(),point=textName(byId(s.nodes,a.nodeId));
 h+='<div class="evidenceMeta"><span>'+esc(src)+' · '+esc(time)+'</span><b>'+esc(stname(a.status))+'</b></div>';
 const seed=seedOf(a),notes=seed&&language==="zh"?String(a.notes||"").replace(seed.notesEn,seed.notesZh):a.notes;
 h+='<button type="button" data-cmd="evidence" class="incidentEvidence"><img src="'+camera.src+'" alt=""><span>'+esc(camera.id)+' · '+T("Floor camera","樓層鏡頭")+' ↗</span></button><p class="incidentNote">'+esc(notes||point)+'</p>'+btn("locateIncident",T("Locate in 3D","在三維場景定位"));
 if(a.status==="open"||tool==="editAlert"){
  h+='<div data-review-id="'+esc(a.id)+'">'+field("alarmState",T("Field assessment","現場判斷"),select("alarmState",[["reviewed",T("Confirm hazard","確認風險")],["blocked",T("Confirm and restrict a passage","確認並限制通道")],["dismissed",T("Dismiss false alarm","排除誤報")],["resolved",T("Close after on-site clearance","現場核實後解除")]],fm("alarmState",a.status==="resolved"?"resolved":"reviewed")));
  if(fm("alarmState","reviewed")==="blocked"){
    const e=s.edges.find(x=>(x.a===a.nodeId||x.b===a.nodeId)&&!x.closed);
    h+=field("incidentEdge",T("Affected segment","受影響路段"),select("incidentEdge",optsByEdge(s),pickedEdge||fm("incidentEdge",e?.id)));
  }
  h+='<details class="optionalField" '+(fm("reviewNoteOpen",false)?'open':'')+'><summary>'+T("Add a review note","補充核驗記錄")+'</summary>'+field("reviewNote",T("Note","記錄"),input("reviewNote",fm("reviewNote")))+'</details>'+btn("saveAlert",T("Confirm review","確認核驗"),true)+'</div>';
 }else{
  h+=btn("editAlert",T("Update assessment","更新現場判斷"),true);
 }
 return h;
}
function heldReason(reason){
 const why={"stale-position":["Last position is stale","最後位置已逾時"],"unavailable-position":["Position unavailable","暫無可靠位置"],"no-route":["No connected exit","沒有相連的可用出口"],"new-alert":["Route affected by an alert","路線受警報影響"],"segment-closed":["A route segment closed","路段已封閉"]};
 return why[reason]?T(...why[reason]):T("Floor conditions changed","樓層狀態已變更");
}
function routeOverview(r,s){
 if(!r)return "";
 const routed=r.status==="routed"&&r.exitId;
 return '<div class="opRouteHero"><span>'+esc(r.deviceId?serial(r.deviceId):T("Map preview","地圖預覽"))+'</span><h3>'+esc(routed?displayExit(r.exitId,s):T("Guidance held","已暫停指引"))+'</h3><p>'+esc(routed?(r.nodeIds.length-1)+' '+T("segments","段")+' · '+r.distance+' '+T("plan units","圖面單位"):heldReason(r.reason))+'</p></div>';
}
function renderRouteReport(s){
 const p=s.published;
 const reports=p.dispatches||[],r=p.routes?.find(x=>x.deviceId===selected)||p.routes?.[0];
 const received=reports.filter(x=>x.status==="acknowledged").length,sent=reports.filter(x=>x.status==="sent"||x.status==="pending").length,held=reports.filter(x=>x.status==="held").length;
 let h=workspaceHead(T("Delivery report","派送回執"))+routeOverview(r,s);
 h+='<div class="opNumbers"><span><b>'+received+'</b>'+T("received","已接收")+'</span><span><b>'+sent+'</b>'+T("awaiting receipt","待回執")+'</span><span><b>'+held+'</b>'+T("held","已暫停")+'</span></div>';
 h+='<div class="receiptList">'+reports.map(x=>'<button data-mask="'+esc(x.deviceId)+'" class="receipt '+(selected===x.deviceId?'selected':'')+'"><b>'+esc(serial(x.deviceId))+'</b><span class="opReceipt '+(x.status==="held"?'hold':'')+'">'+esc(x.status==="held"?heldReason(x.reason):stname(x.status))+'</span></button>').join("")+'</div>';
 const who=reports.find(x=>x.deviceId===selected);
 if(who?.status==="sent")h+=btn("ack",T("Simulate receipt","模擬接收回執"));
 return h+btn("draft",T("Calculate another route","計算其他路線"),true);
}
function floorScopeStamp(){return floorDevices().map(d=>d.id+"/"+d.status).sort().join("|");}
function openFloorPlan(deviceId){
 const s=P.snapshot(tower,floor),d=s.draft;
 setTool("preview");if(!d){render();return;}
 const routes=d.routes||[];
 const route=routes.find(r=>r.deviceId===deviceId)||routes.find(r=>r.deviceId===selected&&r.status==="routed")||routes.find(r=>r.status==="routed")||routes[0]||d.previewRoute;
 const who=route?.deviceId||null;
 if(who&&estate[tower][floor].some(row=>row[0]===who))selected=who;
 render();locate();
 if(d.status==="stale"||d.status==="published")return;
 const info=route?.status==="routed"?window.EscapePlanPreview?.show({kind:"floor",tower,floor,snapshot:s,deviceId:who}):null;
 if(info?.ok)deskPlan={kind:"floor",tower,floor,deviceId:who,draftId:d.id,revision:s.revision,scope:floorScopeStamp(),info};
 else if(route?.status==="routed")note=T("The 3D preview could not be shown. Reopen the preview before publishing.","無法顯示三維路線，請重新開啟預覽後再發布。");
 renderWorkspace(s);$("feedback").textContent=note;
}
function renderRoutes(s){
 const d=s.draft,p=s.published;
 if(tool==="report"&&p)return renderRouteReport(s);
 if(tool!=="preview"||!d){
  let h=workspaceHead(T("Route planning","規劃路線"));
  h+=field("dest",T("Destination","目的地"),select("dest",[["",T("Nearest available exit","最近可用出口")],...s.exits.filter(e=>e.available!==false&&e.active!==false).map(e=>[e.id,displayExit(e.id,s)])],fm("dest",d?.preferredExitId||"")));
  const devices=floorDevices(),moving=devices.filter(x=>x.status==="moving").length,stale=devices.filter(x=>x.status==="stale").length;
  h+='<div class="opRouteScope"><span>'+T("Floor scope","本層範圍")+'</span><strong>'+moving+' '+T("moving","部移動中")+(stale?' · '+stale+' '+T("stale","部失聯"):'')+'</strong></div>';
   h+=btn("generate",T("Calculate and preview in 3D","計算並在三維中預覽"),true);
  if(d&&d.status!=="published"&&d.status!=="stale")h+=btn("preview",d.automatic?T("View recalculated preview","查看重算預覽"):T("View saved preview","查看已有預覽"));
  if(p)h+=btn("report",T("Last delivery report","最近派送回執"));
  return h+btn("cancel",T("Back to access tools","返回通道工具"));
 }
 const rs=d.routes||[],r=rs.find(x=>x.deviceId===selected)||rs[0]||d.previewRoute,valid=rs.filter(x=>x.status==="routed"),blocked=rs.filter(x=>x.status!=="routed");
 const previewed=deskPlan?.kind==="floor"&&deskPlan.draftId===d.id&&deskPlan.deviceId===(r?.deviceId||null)&&deskPlan.revision===s.revision;
 let h=workspaceHead(T("Route preview","路線預覽"));
 if(rs.length)h+=field("planMask",T("Inspect mask route","選取面罩路線"),select("planMask",rs.map(x=>[x.deviceId,serial(x.deviceId)+(x.status==="routed"?"":" · "+T("Held","暫停"))]),r?.deviceId));
 h+=previewed?planNotes(deskPlan):routeOverview(r,s);
 if(r?.nodeIds?.length){
  const hops=r.nodeIds.map(id=>textName(byId(s.nodes,id)));
  h+='<details class="optionalField"><summary>'+T("Show route segments","查看沿途節點")+'</summary><p>'+esc(hops.join(" → "))+'</p></details>';
 }
 h+='<div class="opRouteScope"><span>'+T("Ready to send","可派送")+'</span><strong>'+valid.length+' / '+rs.length+' '+T("masks","部面罩")+'</strong></div>';
 if(blocked.length){
  const stale=blocked.filter(x=>x.reason==="stale-position").length;
  const lines=[];if(stale)lines.push(stale+' '+T("held · stale position","部因位置逾時而暫停"));
  if(blocked.length>stale)lines.push((blocked.length-stale)+' '+T("held · no route or position","部因無路線或位置而暫停"));
  h+='<p class="opHeld">'+esc(lines.join(" / "))+'</p>';
 }
 if(d.status==="stale")return h+small(T("Floor conditions changed. Recalculate before sending.","樓層狀態已變更，請重新計算。"))+btn("draft",T("Recalculate route","重新計算"),true);
 if(d.status==="published")return h+btn("report",T("Open delivery report","查看派送回執"),true);
 if(!valid.length)return h+small(T("No mask can receive a direction from this preview.","這份預覽沒有可接收方向指引的面罩。"))+btn("discardPlan",T("Discard draft","捨棄草稿"));
 if(!previewed)return h+small(T("Open a connected mask route in 3D to review this draft.","請選取可通行的面罩路線並在三維中預覽，以覆核此草稿。"))+btn("preview",T("Open 3D preview","開啟三維預覽"),true)+btn("discardPlan",T("Discard draft","捨棄草稿"));
 const checked=fm("verified",false)&&fm("checkedDraft","")===d.id;
 h+='<div id="routeRelease" data-draft-id="'+esc(d.id)+'">'+check("verified",T("I checked the route and destination.","我已核對路線及目的地。"),checked)+btn("publish",T("Confirm and publish","確認並發布"),true,!checked)+'</div>';
 return h+btn("discardPlan",T("Change destination or cancel","更改目的地或取消"));
}

function sourceCamera(){
 const east=tower==="E"&&floor==="02";
 return {id:"CAM-"+floor+tower,src:east?"camera-east.png":"camera-clear.png"};
}
function renderCamera(s){
 const {id:cam,src}=sourceCamera();
 const title=names(tower)+" / F"+floor+" · "+T("Lobby camera","大堂攝像頭");
 $("cameraThumb").innerHTML='<img src="'+src+'" alt=""><span><b>'+cam+'</b><small>'+T("Floor camera","樓層攝像頭")+' ↗</small></span>';
 $("cameraFull").src=src;$("cameraFull").alt=title;$("cameraHeading").textContent=cam+' · '+title;
 $("cameraCaption").textContent=T("Illustrative building-camera still from the selected floor.","所選樓層的物業攝像頭示意畫面。");
}
function renderMap(s){
 if(!tool||tool==="mapUpdated"){
  let h=workspaceHead(T("Floor access","樓層通道"));
  if(tool==="mapUpdated"&&s.draft)h+=btn("previewUpdated",T("Preview recalculated route","預覽已重算的路線"),true);
  const closed=s.edges.filter(e=>e.closed).length,extra=s.exits.filter(e=>e.custom&&e.active!==false).length;
  h+='<div class="opMapChoices">'+toolListRow("edgeTool",T("Restrict a passage","標記通道限制"),closed?closed+' '+T("currently restricted","段已限制"):T("Close or reopen a segment.","封閉或重開一段路。"))+toolListRow("exitTool",T("Add a temporary exit","新增臨時出口"),extra?extra+' '+T("temporary exits on this floor","個本層臨時出口"):T("Place a fire crew–confirmed exit.","標記消防人員已確認的出口。"))+'</div>';
  return h+toolListRow("drawTool",T("Connect a passage","連接通道"),T("Place verified bends on the 3D floor.","在三維樓層標記已核實的轉折。"))+toolListRow("exitStatusTool",T("Set exit availability","設定出口狀態"),T("Close or reopen a mapped exit.","封閉或重開已標記的出口。"))+'<div class="floorDispatch">'+toolListRow("draft",T("Floor mask dispatch","樓層面罩派送"),T("Preview routes for independently reporting masks.","預覽本層獨立回報面罩的路線。"))+'</div>';
 }
 if(tool==="edgeTool"){
  const id=pickedEdge||fm("segment",s.edges[0]?.id),e=byId(s.edges,id);
  return workspaceHead(T("Passage restriction","通道限制"))+small(T("Select a corridor in the 3D floor or choose its endpoints below.","在三維樓層選取通道，或從下方選擇兩端節點。"))+field("segment",T("Segment","通道路段"),select("segment",optsByEdge(s),id))+'<div class="dataPair"><span>'+T("Current state","目前狀態")+'</span><b>'+(e?.closed?T("Restricted","已限制"):e?.blockedByAlert?T("Under alert","受警報影響"):T("Open","開放"))+'</b></div>'+check("fieldConfirm",T("Field team confirmed this change.","現場人員已確認此變更。"),fm("fieldConfirm",false))+btn("setEdge",e?.closed?T("Reopen segment","重開路段"):T("Restrict segment","限制路段"),true)+btn("cancel",T("Cancel","取消"));
 }
 if(tool==="exitStatusTool"){
  const id=fm("accessExit",s.exits[0]?.id),ex=byId(s.exits,id);
  return workspaceHead(T("Exit availability","出口狀態"))+field("accessExit",T("Mapped exit","已標記出口"),select("accessExit",s.exits.map(e=>[e.id,displayExit(e.id,s)]),id))+small(ex?.active?T("Currently open.","目前開放。"):T("Currently closed.","目前已封閉。"))+check("fieldConfirm",T("Field staff checked this exit.","現場人員已核實此出口。"),fm("fieldConfirm",false))+btn("changeExit",ex?.active?T("Close exit","封閉出口"):T("Reopen exit","重開出口"),true)+btn("cancel",T("Back","返回"));
 }
 if(tool==="exitTool"){
  const node=pickedNode||fm("exitNode","");
  return workspaceHead(T("Temporary exit","臨時出口"))+small(T("Place an exit on a connected junction after on-site confirmation.","在現場確認後，於相連節點上標記出口。"))+field("exitLabel",T("Exit name","出口名稱"),input("exitLabel",fm("exitLabel")))+field("exitNode",T("Connection point","連接位置"),select("exitNode",[["",T("Pick a junction","選取節點")],...opt(s)],node))+check("fieldConfirm",T("Fire crew confirmed this temporary exit.","消防人員已確認此臨時出口。"),fm("fieldConfirm",false))+btn("saveExit",T("Add temporary exit","新增臨時出口"),true)+btn("cancel",T("Cancel","取消"));
 }
 if(tool==="drawTool"){
  const end=Boolean(fm("createsExit",false));
  return workspaceHead(T("Connect a passage","連接通道"))+small(T("Select a junction, mark the bends in 3D, then select the far junction or confirmed temporary exit.","從一個節點開始，在三維樓層標記轉折，再連到另一個節點或已核實的臨時出口。"))+field("passLabel",T("Passage name","通道名稱"),input("passLabel",fm("passLabel")))+check("createsExit",T("End at a new temporary exit","終點為新增臨時出口"),end)+field("pointChoice",T("Add an existing junction","加入既有節點"),select("pointChoice",[["",T("Select a junction…","選取節點…")],...opt(s)],""))+'<div class="dataPair"><span>'+trace.length+' '+T("points placed","個已放置點")+'</span>'+btn("undoPoint",T("Undo point","撤銷上一點"),false,!trace.length)+'</div>'+check("fieldConfirm",end?T("Fire crew confirmed the passage and exit.","消防人員已確認通道及出口。"):T("Field team confirmed this passage.","現場人員已確認此通道。"),fm("fieldConfirm",false))+btn("savePassage",T("Save passage","儲存通道"),true,trace.length<2)+btn("cancel",T("Cancel","取消"));
 }
 return workspaceHead(T("Floor map tools","樓層地圖工具"))+btn("cancel",T("Back","返回"));
}
function mapPicked(kind,v){
 if(kind==="node"&&["exitTool","addAlert"].includes(tool)){if(!byId(snapshot.nodes,v))return;saveFields();pickedNode=v;formDraft.fieldConfirm=false;render();return}
 if(kind==="edge"&&tool==="edgeTool"){saveFields();pickedEdge=v;formDraft.fieldConfirm=false;render();return}
 if(tool==="drawTool"&&(kind==="point"||kind==="node")){
  saveFields();const n=kind==="node"?byId(snapshot.nodes,v):v;
  if(n&&Number.isFinite(n.x)&&Number.isFinite(n.y)){
   const p={x:n.x,y:n.y};if(trace.length&&Math.hypot(p.x-trace.at(-1).x,p.y-trace.at(-1).y)<3)return;
   trace.push(p);formDraft.fieldConfirm=false;note="";render()
  }return
 }
 if(kind==="exit"&&tab==="map"&&["draft","exitStatusTool"].includes(tool)){saveFields();formDraft[tool==="draft"?"dest":"accessExit"]=v;formDraft.fieldConfirm=false;render()}
}
function copyAlertExample(t,f,node,label,source,notes){
 if(!P.snapshot(t,f).alerts.some(a=>a.label===label))P.act(t,f,"alert",{nodeId:node,label,source,observedAt:relativeTime(42),notes});
}
let live=null;
function persistResult(cmd,newTool,message){
 if(!cmd)return;setTool(newTool);note=message;render();
}
function regenerate(prior){
 const devices=floorDevices(),allowed=new Set(devices.map(d=>d.id));
 if(snapshot.draft&&snapshot.draft.id!==prior.draft?.id&&snapshot.draft.status==="draft"&&snapshot.draft.deviceIds.every(id=>allowed.has(id)))return T(" Draft recalculated. Review before publishing."," 已重算路線草稿，請在發布前覆核。");
 const preference=prior.draft?.preferredExitId;
 const a=P.act(tower,floor,"draft",{devices,startNodeId:"central-entry",...(preference?{preferredExitId:preference}:{})});
 if(a.ok)snapshot=a.snapshot;
 return a.ok?T(" Draft recalculated. Review before publishing."," 已重算路線草稿，請在發布前覆核。"):T(" Generate a new draft after checking connectivity."," 請檢查通道連接，再重新計算草稿。");
}
function doCommand(cmd){
 const s=snapshot;
 if(cmd==="cancelGroupPlan"){clearGroupDraft();groupDecision="verify";drawGroupOnly();return;}
 if(cmd==="clearInboxFloor"){selectInboxFloor(null);$("signal-"+inboxCursor)?.focus({preventScroll:true});return}
 if(cmd==="evidence"){$("cameraModal").showModal();return}
 if(cmd==="inbox"){tab="alerts";activeAlert=null;setTool("");render();return}
 if(cmd==="locateIncident"){const a=byId(s.alerts,activeAlert);if(a)locate({alertId:a.id,nodeId:a.nodeId});return}
 if(cmd==="previewUpdated"||cmd==="preview"){tab="map";openFloorPlan();return}
 if(cmd==="discardPlan"){const d=P.snapshot(tower,floor).draft;if(d&&d.status!=="published")P.act(tower,floor,"discardDraft",{draftId:d.id});setTool("draft");render();return;}
 if(["addAlert","editAlert","draft","preview","report","edgeTool","exitTool","exitStatusTool","drawTool","cancel"].includes(cmd)){
  if(cmd==="editAlert"&&!activeAlert)activeAlert=[...s.alerts].reverse().find(a=>a.status==="open")?.id||[...s.alerts].reverse()[0]?.id;
  setTool(cmd==="cancel"?"":cmd);
  pickMode=cmd==="edgeTool"?"edge":cmd==="exitTool"?"exit":cmd==="drawTool"?"draw":cmd==="addAlert"?"origin":"inspect";
  if(cmd==="edgeTool")pickedEdge=s.edges[0]?.id||"";
  if(cmd==="exitStatusTool")pickedNode=s.exits[0]?.nodeId||"";
  render();
  if(["edgeTool","exitTool","drawTool","draft","preview","addAlert","exitStatusTool"].includes(cmd))locate();
  sceneEvent("escape-map-pick-mode",{tower,floor,mode:scenePickMode()});return
 }
 if(cmd==="refreshData"){action("refresh",{},T("Floor records refreshed at ","已重新讀取樓層紀錄 ")+clock());render();return}
 if(cmd==="pickAlarm"){saveFields();pickMode="origin";note=T("Select the reported junction in 3D.","請在三維樓層選取通報位置。");render();locate();sceneEvent("escape-map-pick-mode",{tower,floor,mode:"node"});return}
 if(cmd==="createAlert"){
  const label=get("alarmLabel").trim(),nodeId=get("alarmNode");
  if(!label||!nodeId){$("feedback").textContent=T("Enter a report title and location.","請輸入通報標題及位置。");return}
  const ids=s.alerts.map(a=>a.id);if(action("alert",{nodeId,label,source:get("source"),notes:get("alarmNotes").trim(),observedAt:clock()})){
   activeAlert=snapshot.alerts.find(a=>!ids.includes(a.id))?.id;persistResult(true,"",T("Alert recorded.","警報已記錄。"));locate({nodeId,alertId:activeAlert});
   live?.log?.({tower,floor,source:"Desk",kind:"report",en:"Observation logged · "+label,zh:"已記錄現場觀察 · "+label,nodeId,alertId:activeAlert})
  }else $("feedback").textContent=note;return
 }
 if(cmd==="saveAlert"){
  const id=$("inspector").querySelector("[data-review-id]")?.dataset.reviewId,a=byId(s.alerts,id);if(!a)return;
  const outcome=get("alarmState"),edge=get("incidentEdge"),addition=get("reviewNote").trim();
  if(outcome==="blocked"&&(!edge||!action("edge",{edgeId:edge,closed:true,confirmed:true}))){$("feedback").textContent=note;return}
  const message=outcome==="dismissed"?T("False alarm dismissed","已排除誤報"):outcome==="resolved"?T("Hazard cleared on site","現場風險已解除"):outcome==="blocked"?T("Passage restricted","已限制通道"):T("Hazard confirmed","已確認風險");
  const notes=[a.notes,message,addition].filter(Boolean).join(" / ");
  activeAlert=id;const saved=action("alertStatus",{alertId:id,status:["dismissed","resolved"].includes(outcome)?"resolved":"reviewed",observedAt:clock(),notes});
  if(saved)live?.log?.({tower,floor,source:"Desk",en:message,zh:message,nodeId:a.nodeId,alertId:id});
  persistResult(saved,"",message);$("feedback").textContent=note;return
 }
 if(cmd==="generate"){const preferredExitId=get("dest");if(action("draft",{devices:floorDevices(),startNodeId:"central-entry",...(preferredExitId?{preferredExitId}:{})}))openFloorPlan();$("feedback").textContent=note;return}
 if(cmd==="publish"){
  const id=$("routeRelease")?.dataset.draftId;
  const current=P.snapshot(tower,floor);
  if(!isOn("verified")||!id||deskPlan?.draftId!==id||current.draft?.id!==id||current.revision!==deskPlan.revision||current.draft.status==="stale"||deskPlan.scope!==floorScopeStamp()){
   dismissPlan();render();$("feedback").textContent=T("Conditions changed. Open the current route preview before sending.","狀況已變更，請先重新開啟目前的路線預覽。");return;
  }
  const permitted=new Set(floorDevices().map(d=>d.id));
  if(s.draft.deviceIds.some(d=>!permitted.has(d))){$("feedback").textContent=T("The recipient scope changed. Calculate a new floor route.","接收範圍已變更，請重新計算樓層路線。");return}
  if(action("review",{draftId:id,confirmed:true}))persistResult(action("publish",{draftId:id}),"report","");
  $("feedback").textContent=note;return
 }
 if(cmd==="ack"){action("ack",{deviceId:selected},T("A simulated device acknowledgement was received.","已收到模擬面罩回執。"));render();return}
 if(cmd==="undoPoint"){saveFields();trace.pop();render();return}
 if(["saveExit","savePassage","setEdge","changeExit"].includes(cmd)){
  if(!isOn("fieldConfirm")){$("feedback").textContent=T("Record field confirmation before applying this change.","套用變更前，請先確認現場核實結果。");return}
  if(!s.devices?.length)P.act(tower,floor,"observe",{devices:floorDevices()});
  let good;
  if(cmd==="saveExit"){const label=get("exitLabel").trim(),nodeId=get("exitNode");if(!label||!nodeId){$("feedback").textContent=T("Enter the exit name and select a junction.","請填寫出口名稱並選擇節點。");return}good=action("exit",{nodeId,label,confirmed:true})}
  if(cmd==="setEdge"){const edgeId=get("segment"),e=byId(s.edges,edgeId);good=e&&action("edge",{edgeId,closed:!e.closed,confirmed:true})}
  if(cmd==="changeExit"){const exitId=get("accessExit"),ex=byId(s.exits,exitId);good=ex&&action("exitStatus",{exitId,active:!ex.active,confirmed:true})}
  if(cmd==="savePassage"){const label=get("passLabel").trim();if(!label){$("feedback").textContent=T("Name the passage.","請為通道命名。");return}good=action("passage",{label,points:trace.map(p=>({...p})),exit:isOn("createsExit"),confirmed:true})}
  if(good){const extra=regenerate(s);persistResult(true,"mapUpdated",T("Floor access updated.","樓層通道狀態已更新。")+extra);sceneEvent("escape-map-pick-mode",{tower,floor,mode:null})}else $("feedback").textContent=note;return
 }
}
document.addEventListener("click",e=>{
 const b=e.target.closest("button,[data-mask]");if(!b||b.closest("#modelViewport,#liveFeed,#broadcastPanel,#cameraModal"))return;
 if(b.dataset.group){openAssistanceGroup(b.dataset.group);return}
 if(b.dataset.groupNav){showAssistancePage(b.dataset.groupNav);return}
 if(b.dataset.groupAction){dispatchAssistance(b.dataset.groupTarget,b.dataset.groupAction);return}
 if(b.id==="cameraThumb"){$("cameraModal").showModal();return}
 if(b.id==="lang"){saveFields();language=language==="en"?"zh":"en";render();return}
 if(b.dataset.signalFloor){selectInboxFloor(b.dataset.signalFloor);$("signal-"+inboxCursor)?.focus({preventScroll:true});return}
 if(b.dataset.tower){selectFloor(floor,b.dataset.tower);return}if(b.dataset.floor){selectFloor(b.dataset.floor);return}
 if(b.dataset.mask){chooseMask(b.dataset.mask);return}if(b.dataset.dir){directoryScope=b.dataset.dir;saveFields();render();return}
 if(b.dataset.incident){openIncident(b.dataset.atTower,b.dataset.atFloor,b.dataset.incident);return}
 if(b.dataset.tab){tab=b.dataset.tab;setTool("");activeAlert=null;assistanceView="queue";if(groupService()?.snapshot().selectedGroupId)groupService().select(null);render();sceneEvent("escape-map-pick-mode",{tower,floor,mode:null});return}
 if(b.dataset.cmd)doCommand(b.dataset.cmd);
});
document.addEventListener("keydown",event=>{
 const current=event.target.closest?.("[data-signal-floor]");
 if(!current)return;
 const key=current.dataset.signalFloor,t=key[0],level=Number(key.slice(1));let next;
 switch(event.key){
  case "ArrowLeft":next=t+pad(Math.max(1,level-1));break;
  case "ArrowRight":next=t+pad(Math.min(12,level+1));break;
  case "ArrowUp":next="E"+pad(level);break;
  case "ArrowDown":next="W"+pad(level);break;
  case "Home":next=t+"01";break;
  case "End":next=t+"12";break;
  default:return;
 }
 event.preventDefault();current.tabIndex=-1;inboxCursor=next;
 const target=$("signal-"+next);target.tabIndex=0;target.focus();
});
document.addEventListener("change",e=>{
 const id=e.target.id;
 if(id==="groupDecision"){dismissPlan();groupDecision=get(id);groupOption="";groupNotice="";drawGroupOnly();$("groupDecision")?.focus({preventScroll:true});return}
 if(id==="groupOption"){dismissPlan();groupOption=get(id);groupNotice="";drawGroupOnly();$("groupOption")?.focus({preventScroll:true});return}
 if(id==="groupFieldConfirmed"){groupFieldChecked=isOn(id);drawGroupOnly();$("groupFieldConfirmed")?.focus({preventScroll:true});return}
 if(id==="planMask"){openFloorPlan(get(id));$("planMask")?.focus({preventScroll:true});return}
 if(id==="alertList"){activeAlert=get(id);setTool("");render();return}
 if(id==="alarmState"){saveFields();const a=byId(snapshot.alerts,activeAlert);pickedEdge=get(id)==="blocked"?snapshot.edges.find(e=>(e.a===a?.nodeId||e.b===a?.nodeId)&&!e.closed)?.id||"":"";render();if(pickedEdge)locate({edgeId:pickedEdge});return}
 if(id==="incidentEdge"){saveFields();pickedEdge=get(id);render();locate({edgeId:pickedEdge});return}
 if(id==="accessExit"){saveFields();pickedNode=byId(snapshot.exits,get(id))?.nodeId||"";formDraft.fieldConfirm=false;render();locate({nodeId:pickedNode});return}
 if(id==="verified"){formDraft.verified=isOn("verified");formDraft.checkedDraft=$("routeRelease")?.dataset.draftId||"";const send=$("routeRelease")?.querySelector("[data-cmd=publish]");if(send)send.disabled=!formDraft.verified;return}
 if(id==="segment"){saveFields();pickedEdge=get(id);formDraft.fieldConfirm=false;render();return}
 if(id==="exitNode"||id==="alarmNode"){saveFields();pickedNode=get(id);render();return}
 if(id==="pointChoice"&&get(id)){mapPicked("node",get(id));return}
 if(id==="createsExit"){saveFields();render()}
});
window.addEventListener("escape-map-pick",e=>{
 const d=e.detail||{};if(d.tower!==tower||String(d.floor).padStart(2,"0")!==floor)return;
 const v=d.kind==="point"?{x:d.x,y:d.y}:d.id||d.nodeId||d.edgeId;
 if(v!=null)mapPicked(d.kind,v);
});
window.addEventListener("escape-plan-preview-closed",()=>{
 if(!deskPlan)return;
 deskPlan=null;groupFieldChecked=false;delete formDraft.verified;delete formDraft.checkedDraft;
 if(tab==="routes"){groupNotice=T("Preview closed. Open it again to confirm this route.","預覽已關閉；請重新開啟以確認此路線。");drawGroupOnly();}
 else if(tab==="map"&&tool==="preview")renderWorkspace(P.snapshot(tower,floor));
});
window.addEventListener("storage",event=>{
 if(window.EscapeConsoleReset?.isResetting||!deskStorage)return;
 const match=/^escape-guard:v153:routes:([EW])(0[1-9]|1[0-2])$/.exec(event.key||"");
 if(match)sceneEvent("escape-access-change",{tower:match[1],floor:match[2],type:"external",snapshot:P.snapshot(match[1],match[2])});
});
window.addEventListener("escape-access-change",event=>{
 const d=event.detail;if(!deskPlan||!d?.snapshot)return;
 if(deskPlan.kind==="floor"){
  if(d.tower!==deskPlan.tower||d.floor!==deskPlan.floor||d.snapshot.revision===deskPlan.revision)return;
  dismissPlan();if(tab==="map"&&tool==="preview"){snapshot=P.snapshot(tower,floor);renderWorkspace(snapshot);}
 }else{
  const g=groupService().snapshot().groups.find(item=>item.id===deskPlan.groupId);
  if(g&&groupPlanStamp(g,deskPlan.optionId)===deskPlan.stamp)return;
  dismissPlan();groupNotice=T("Conditions changed. Preview a route again.","狀況已變更，請重新預覽路線。");drawGroupOnly();
 }
});
window.addEventListener("escape-inspect-floor",e=>{
 const d=e.detail||{},f=String(d.floor||"").padStart(2,"0");
 if(estate[d.tower]?.[f]&&(tower!==d.tower||floor!==f))selectFloor(f,d.tower,false);
});
window.addEventListener("escape-estate-overview",()=>{
 if(!inboxFloor)return;
 inboxFloor=null;
 if(tab==="alerts"&&!activeAlert&&!tool)renderWorkspace(snapshot);
});
for(const sensor of window.EscapeSensorReports){
 const nearest=sensor.source==="D4"?"east-watch":P.nearestNode(sensor.tower,sensor.floor,sensor.x,sensor.y)?.id;
 if(nearest){sensor.nodeId=nearest;copyAlertExample(sensor.tower,sensor.floor,nearest,sensor.labelEn,sensor.source,sensor.notesEn);}
}
connectAssistance();
document.addEventListener("DOMContentLoaded",()=>{connectAssistance();drawGroupOnly()},{once:true});
render();
function inspectLive(r){
 if(!estate[r.tower]?.[r.floor])return;tower=r.tower;floor=r.floor;selected=estate[tower][floor][0][0];
 const ss=P.snapshot(tower,floor);
 const match=byId(ss.alerts,r.alertId)||[...ss.alerts].reverse().find(a=>r.nodeId&&a.nodeId===r.nodeId);
 if(match)openIncident(tower,floor,match.id);else{tab="alerts";activeAlert=null;setTool("");render();locate({nodeId:r.nodeId})}
}
function receiveEvent(r){
 if(r?.kind==="broadcast"||r?.kind==="delivery"){renderHUD(snapshot);return}
 if(r?.kind!=="alarm"||!r.nodeId||!estate[r.tower]?.[r.floor])return;
 const ss=P.snapshot(r.tower,r.floor),previous=[...ss.alerts].reverse().find(x=>x.nodeId===r.nodeId&&x.source===r.source);
 if(previous)return previous.id;
 const result=P.act(r.tower,r.floor,"alert",{nodeId:r.nodeId,label:r.label,source:r.source,notes:r.notes||"",observedAt:r.observedAt});
 if(result.ok)sceneEvent("escape-access-change",{tower:r.tower,floor:r.floor,type:"alert",snapshot:result.snapshot});
 if(!tool&&((tab==="alerts"&&!activeAlert)||!$("inspector").contains(document.activeElement)))render();
 return result.id;
}
if(window.EscapeLiveOps){
 live=window.EscapeLiveOps.mount({feed:$("liveFeed"),broadcast:$("broadcastPanel"),context:()=>({tower,floor,selected,lang:language,devices:allDevices(),snapshot:P.snapshot(tower,floor)}),onInspect:inspectLive,onEvent:receiveEvent});live.update?.();
}
