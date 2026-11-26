/* Disclosure and navigation for the control-center shell. */
(function () {
  "use strict";
  const deviceButton = $("toggleDevice");
  const devicePanel = $("deviceMore");
  const activityButton = $("toggleActivity");
  const latestButton = $("latestEvent");
  const events = $("liveFeed");
  const desk = $("deskTitle");
  const mapSection=$("map").closest(".planarea");
  const monitoring=window.EscapeEvacuation?.shared;
  let deviceOpen = false;
  let activityOpen = false;
  let location = tower + floor;
  let device = selected;
  let metricSignature="";
  const query = new URLSearchParams(window.location.search);
  const isExample = query.get("example") === "guided";
  const startFocused = isExample && query.get("view") !== "overview";
  const resetDialog=$("resetDialog"),previewBand=$("previewNotice"),transferButton=$("transferExample");
  function reloadScenario(){
    const url=new URL(window.location.href);
    url.searchParams.set("lang",language);
    if(url.href===window.location.href)window.location.reload();
    else window.location.replace(url.href);
  }
  $("resetScenario").onclick=()=>{
    $("resetError").hidden=true;
    resetDialog.showModal();
  };
  $("confirmReset").onclick=()=>{
    if(window.EscapeConsoleReset.clearScenarioState().ok){reloadScenario();return;}
    $("resetError").textContent=T("Could not reset saved changes. Try again.","未能重置已儲存的變更，請再試一次。");
    $("resetError").hidden=false;
  };
  window.addEventListener("escape-console-reset-external",reloadScenario);
  function updatePreviewBand(){
    const plan=window.EscapePlanPreview.current;
    previewBand.hidden=!plan;
    if(!plan)return;
    previewBand.querySelector("b").textContent=T("Route preview","路線預覽");
    previewBand.querySelector("span").textContent=T("Dashed line · Not sent","虛線顯示 · 尚未發布");
    $("closePlanPreview").setAttribute("aria-label",T("Close route preview","關閉路線預覽"));
    $("closePlanPreview").title=$("closePlanPreview").getAttribute("aria-label");
  }
  window.addEventListener("escape-plan-preview",updatePreviewBand);
  $("closePlanPreview").onclick=()=>{
    window.EscapePlanPreview.clear();window.dispatchEvent(new Event("escape-plan-preview-closed"));
  };
  transferButton.onclick=()=>{
    focus="manual";focusedGroup=transferButton.dataset.groupId;updateMetrics();notifyFocus();
  };
  let focus = null;
  let focusedGroup = null;
  let localGuidance = false;
  const populationScope = document.getElementById("guidanceScope");
  populationScope.add(new Option("Estate","estate"));
  populationScope.add(new Option("Floor","floor"));
  function scopedFloor(){return localGuidance ? {tower,floor} : null;}
  const filterNames = {
    auto: ["Auto-assigned","已自動安排"],
    manual: ["Operator-guided","人工引導中"],
    pending: ["Needs action","待處理"]
  };
  const routeIcons={
    auto:"M4 17h6a4 4 0 0 0 4-4V8h5 M16 5l3 3-3 3 M4 14v6",
    manual:"M11 21V4 M11 5h7l3 3-3 3h-7 M11 12H6l-3 3 3 3h5",
    pending:"M8.6 3.5H15l4.8 4.8v7.4L15 20.5H8.6l-4.8-4.8V8.3z M12 7.3v5 M12 15v.5"
  };
  function routeIcon(key){
    const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),line=document.createElementNS(ns,"path");
    svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.classList.add("filter-symbol");
    line.setAttribute("d",routeIcons[key]);svg.append(line);return svg;
  }
  const summary = $("evacSummary");
  const buttons = new Map();
  const frame = mapSection.closest(".workspace");
  const rail = $("controlRail");
  const railButton = name => rail.querySelector('[data-panel="'+name+'"]');
  function showPanel(name,open) {
    frame.dataset[name] = open ? "open" : "closed";
    $(name === "directory" ? "deviceDirectory" : "dutySection").hidden = !open;
    railButton(name).setAttribute("aria-expanded",String(open));
    if (name === "directory") railButton("overview").setAttribute("aria-pressed",String(!open));
  }
  function revealDesk() { showPanel("desk",true); }
  rail.addEventListener("click",e=>{
    const choice=e.target.closest("[data-panel]")?.dataset.panel;
    if(choice==="directory" || choice==="desk"){
      showPanel(choice,frame.dataset[choice]!=="open");
      if(choice==="desk" && frame.dataset.desk==="open" && innerWidth<840) desk.scrollIntoView({block:"start"});
    } else if(choice==="overview"){
      showPanel("directory",false);
      setFocus(null);
      window.dispatchEvent(new Event("escape-estate-overview"));
    } else if(choice==="log"){
      revealDesk(); activityOpen=!activityOpen;activityDisclosure();
      if(activityOpen) events.scrollIntoView({block:"nearest"});
    }
  });
  $("closeDirectory").addEventListener("click",()=>{showPanel("directory",false);railButton("directory").focus()});
  $("jumpDesk").addEventListener("click",revealDesk);
  document.addEventListener("click",event=>{
    if (event.target.closest("[data-group-marker],[data-map-alert],[data-model-sensor]")) revealDesk();
    const chosen=event.target.closest("[data-group]")?.dataset.group;
    if(focus==="manual" && chosen && monitoring.snapshot().groups.some(g=>g.id===chosen&&!g.priority)){
      focusedGroup=chosen;
      updateMetrics();
      notifyFocus();
    }
  },true);
  for (const key of Object.keys(filterNames)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "evac-stat";
    button.dataset.key = key;
    button.setAttribute("aria-pressed","false");
    button.setAttribute("aria-controls","map routeSelection");
    button.append(routeIcon(key),document.createElement("span"),document.createElement("b"));
    button.addEventListener("click", () => setFocus(focus === key ? null : key));
    summary.append(button);
    buttons.set(key,button);
  }
  function setFocus(key) {
    if (key !== null && !buttons.has(key)) return;
    focus = key;
    const selectedState=key==="manual"?monitoring?.snapshot():null;
    focusedGroup=selectedState?.groups.find(g=>g.id===selectedState.selectedGroupId&&!g.priority)?.id||null;
    updateMetrics();
    notifyFocus();
  }
  function notifyFocus() {
    window.dispatchEvent(new CustomEvent("escape-route-filter", {detail:{status:focus,groupId:focusedGroup,floorScope:scopedFloor()}}));
  }
  window.EscapeRouteFocus = { get status() { return focus; }, get groupId() { return focusedGroup; }, get floorScope(){return scopedFloor();}, set: setFocus };
  populationScope.addEventListener("change",()=>{
    const chosen=focus;
    localGuidance=populationScope.value==="floor";
    if(localGuidance) inspectFloor(tower,floor);
    else window.dispatchEvent(new Event("escape-estate-overview"));
    setFocus(chosen);
  });
  window.addEventListener("escape-estate-overview",()=>{
    localGuidance=false;
    updateMetrics();
  });
  window.addEventListener("escape-observe-floor",()=>{
    localGuidance=true;
    updateMetrics();
  });
  $("routeGroup").addEventListener("change",event=>{
    focusedGroup=event.target.value||null;
    updateMetrics();
    notifyFocus();
  });
  $("clearRouteFocus").addEventListener("click", () => {
    const old = focus;
    setFocus(null);
    buttons.get(old)?.focus();
  });
  if (startFocused) focus = "manual";

  function levelName(level) {
    if(level===13) return T("Roof","天台");
    if(level===1) return T("Ground","地面");
    return Number.isInteger(level) ? "F"+String(level).padStart(2,"0") : "F"+Math.floor(level)+"–F"+Math.ceil(level);
  }
  function itineraryDetail(items) {
    const lines=[];
    for(const item of items) {
      for(const {origin,stairs,exit,memberCount} of item.branches) {
        const towerLabel=t=>t==="E"?T("East Tower","東座"):T("West Tower","西座");
        const parts=[towerLabel(origin.tower)+" · "+levelName(origin.level)];
        for(const [i,stair] of stairs.entries()){
          const transfer=i?levelName(stair.fromLevel)+T(" transfer to "," 轉 "):"";
          parts.push(transfer+T("Stair "+stair.id,stair.id+" 梯")+" ↓");
        }
        parts.push((origin.tower===exit.tower?"":towerLabel(exit.tower)+" · ")+T(exit.label,exit.labelZh));
        const branch=memberCount+T(" people · "," 人 · ")+parts.join("  →  ");
        if(!lines.includes(branch))lines.push(branch);
      }
    }
    return lines.join("\n");
  }

  function updateMetrics() {
    if (!monitoring) return;
    mapSection.dataset.mode="model";
    const sample=monitoring.snapshot();
    const range=scopedFloor();
    const people=sample.people.filter(p=>window.EscapeFlowView.onFloor(p,range));
    const counts={auto:0,manual:0,pending:0};
    for(const person of people) counts[window.EscapeFlowView.statusOf(person)]++;
    const {autoArrived,manualArrived}=sample.counts;
    const signature=JSON.stringify([tower,floor,localGuidance,counts,autoArrived,manualArrived,language,focus,focusedGroup,
      localGuidance?people.map(p=>p.id):null,sample.groups.map(g=>[g.status,g.releaseOptionId])]);
    if(signature===metricSignature)return;
    metricSignature=signature;
    const towerName=tower==="E"?T("East","東座"):T("West","西座");
    const localName=towerName+" F"+floor+(floor==="12"?T(" + roof","＋天台"):"");
    $("guidanceHeading").textContent=T("Guidance status","人員引導狀態");
    const exited=sample.people.filter(p=>p.outside||p.status==="arrived").length;
    $("guidanceTotal").textContent=localGuidance ? people.length+T(" on this floor"," 人在本層")
      : people.length+T(" inside"," 人在樓內")+(exited?T(" · "+exited+" exited"," · "+exited+" 人已離開"):"");
    populationScope.options[0].textContent=T("Entire estate","全苑");
    populationScope.options[1].textContent=localName;
    populationScope.setAttribute("aria-label",T("Population shown in the chart","人數統計範圍"));
    populationScope.value=localGuidance?"floor":"estate";
    const rangeName=localGuidance?localName:T("Entire estate","全苑");
    summary.setAttribute("aria-label",rangeName+" · "+people.length+T(" people, filter by guidance status"," 人，按引導狀態篩選"));
    for (const [key,button] of buttons) {
      const label = T(...filterNames[key]);
      const fraction=people.length ? counts[key]/people.length : 0;
      const band=$("guidanceBar").querySelector('[data-band="'+key+'"]');
      band.style.flexGrow=String(counts[key]);band.hidden=counts[key]===0;
      button.querySelector("b").textContent = counts[key];
      button.querySelector("span").textContent = label;
      button.setAttribute("aria-label",label+" · "+counts[key]+T(" people"," 人")+(people.length?" · "+Math.round(fraction*100)+"%":""));
      button.setAttribute("aria-pressed",String(focus === key));
      button.title=people.length?rangeName+" · "+counts[key]+" / "+people.length+" · "+Math.round(fraction*100)+"%":T("No one currently in this scope","目前這個範圍內無人");
    }
    $("routeSelection").hidden = !focus;
    const activeItineraries=window.EscapeFlowView.itinerariesFor(monitoring,"manual",sample.time,null,range);
    const transferGroup=activeItineraries.find(it=>it.branches.some(b=>b.stairs.some((s,i)=>i>0&&s.id!==b.stairs[i-1].id)));
    transferButton.hidden=!transferGroup;
    if(transferGroup){
      const branch=transferGroup.branches.find(b=>b.stairs.some((s,i)=>i>0&&s.id!==b.stairs[i-1].id));
      const idx=branch.stairs.findIndex((s,i)=>i>0&&s.id!==branch.stairs[i-1].id);
      const leg=branch.stairs[idx],from=branch.stairs[idx-1].id;
      transferButton.dataset.groupId=transferGroup.groupId;
      transferButton.textContent=T("Show stair transfer","查看換梯路線")+"　"+levelName(leg.fromLevel)+" · "+from+" → "+leg.id+"　"+branch.memberCount+T(" people"," 人");
    }
    $("routeGroup").hidden=true;
    if (!focus) return;
    const empty = counts[focus] === 0;
    const targets = window.EscapeFlowView.targetsFor(monitoring,focus,sample.time,null,range);
    const names = targets.map(e=>(e.tower ? (e.tower==="E"?T("East","東座"):T("West","西座"))+" · " : "")+(language==="zh"?e.labelZh:e.label)).filter(Boolean);
    const exits = [...new Set(names)].join(language==="zh"?"、":", ");
    $("routeFocusTitle").textContent = T(...filterNames[focus]);
    let detail;
    if (empty) {
      detail = localGuidance ? T("No one on this floor has this status.","本層目前無人屬於這個狀態。") : focus === "manual" ? T("No group has been issued an operator route yet.","目前尚未向任何群組發布人工路線。") : T("No people in this group.","目前無人屬於這個狀態。");
    } else if (focus === "pending") {
      detail = T("Waiting for a verified route.","等候核實路線。");
    } else if(focus==="manual"){
      const items=window.EscapeFlowView.itinerariesFor(monitoring,"manual",sample.time,null,range);
      if(focusedGroup && !items.some(item=>item.groupId===focusedGroup)){focusedGroup=null;notifyFocus()}
      const groupName=item=>T(item.labelEn,item.labelZh.replace("待援組","組"));
      const shown=focusedGroup?items.filter(item=>item.groupId===focusedGroup):items;
      if(shown.length===1){
        $("routeFocusTitle").textContent=groupName(shown[0])+" · "+shown[0].memberCount+T(" people"," 人");
      }
      const picker=$("routeGroup");
      picker.hidden=items.length<=1;
      if(!picker.hidden){
        picker.setAttribute("aria-label",T("Focus on a guided group","聚焦人工引導群組"));
        picker.replaceChildren(new Option(T("All guided groups","所有引導群組"),""),...items.map(item=>new Option(groupName(item),item.groupId)));
        picker.value=focusedGroup||"";
      }
      detail=itineraryDetail(shown);
    } else {
      detail = exits || T("Following the assigned route.","沿已發布路線移動。");
    }
    $("routeFocusDetail").textContent = detail;
    $("clearRouteFocus").textContent = T("Show all","顯示全部");
    $("guidedExample").hidden = !(focus==="manual" && empty && !isExample && !localGuidance);
    $("guidedExample").textContent = T("View a guided example","查看人工引導範例");
  }

  function deviceDisclosure() {
    deviceButton.textContent = deviceOpen ? T("Hide", "收起") : T("Details", "詳情");
    deviceButton.setAttribute("aria-expanded", String(deviceOpen));
    devicePanel.hidden = !deviceOpen;
  }

  function activityDisclosure() {
    activityButton.textContent = activityOpen ? T("Close log", "收起紀錄") : T("Event log", "事件紀錄");
    for (const button of [activityButton, latestButton]) {
      button.setAttribute("aria-expanded", String(activityOpen));
    }
    events.hidden = !activityOpen;
    railButton("log").setAttribute("aria-expanded",String(activityOpen));
  }

  function updateEvent() {
    const event = events.querySelector(".eg-feed-row");
    const summary = event?.querySelector("strong")?.textContent;
    const time = event?.querySelector("time")?.textContent;
    const scope = event?.querySelector("small")?.textContent;
    latestButton.hidden = !summary;
    if (!summary) return;
    const label = document.createElement("span");
    label.textContent = summary;
    const detail = document.createElement("small");
    detail.textContent = [scope, time].filter(Boolean).join(" · ");
    latestButton.replaceChildren(label,detail);
  }

  function updateShell() {
    const nextLocation = tower + floor;
    if (nextLocation === location && selected !== device) deviceOpen = true;
    location = nextLocation;
    device = selected;
    $("site").textContent = T("Harbour Court", "海港苑");
    $("headline").textContent = T("Evacuation monitor", "疏散總覽");
    $("sim").textContent = isExample ? T("Guided route example", "人工引導範例") : T("Simulated data", "模擬資料");
    $("resetScenario").querySelector("span").textContent=T("Reset scenario","重置場景");
    $("resetTitle").textContent=T("Reset this scenario?","重置這個場景？");
    $("resetBody").textContent=T("People, routes and alerts will return to their starting state. This will also clear broadcasts and delivery receipts from this session.","人員、路線及警報將回到起始狀態，本次的廣播與送達紀錄也會清除。");
    $("cancelReset").textContent=T("Cancel","取消");
    $("confirmReset").textContent=T("Reset scenario","重置場景");
    updatePreviewBand();
    $("terminalTitle").textContent = T("Masks", "面罩");
    $("jumpDesk").textContent = T("Jump to duty desk","跳到值班席");
    rail.setAttribute("aria-label",T("Workspace navigation","工作區導覽"));
    for(const [key,label] of Object.entries({overview:T("Overview","總覽"),directory:T("Directory","樓層面罩"),desk:T("Duty desk","值班席"),log:T("History","紀錄")})){
      const item=railButton(key);item.lastElementChild.textContent=label;item.title=label;
    }
    $("closeDirectory").setAttribute("aria-label",T("Close directory","收起樓層與面罩"));
    desk.textContent = T("Duty desk", "值班席");
    deviceDisclosure();
    activityDisclosure();
    updateEvent();
    updateMetrics();
    updateMapHeading();
  }

  const sceneNav=$("sceneNav"), sceneTower=$("sceneTower"), sceneFloor=$("sceneFloor");
  const cameraButtons=sceneNav.querySelectorAll("[data-camera-scope]");
  let sceneLanguage="";
  function inspectFloor(t,f) {
    if(focus) setFocus(null);
    window.dispatchEvent(new CustomEvent("escape-inspect-floor",{detail:{tower:t,floor:f}}));
  }
  sceneNav.addEventListener("click",event=>{
    const scope=event.target.closest("[data-camera-scope]")?.dataset.cameraScope;
    if(scope==="estate"){
      if(focus) setFocus(null);
      window.dispatchEvent(new Event("escape-estate-overview"));
    }else if(scope==="floor") inspectFloor(tower,floor);
  });
  sceneTower.addEventListener("change",()=>inspectFloor(sceneTower.value,sceneFloor.value));
  sceneFloor.addEventListener("change",()=>inspectFloor(sceneTower.value,sceneFloor.value));
  function updateMapHeading() {
    const viewport=$("modelViewport");
    const isFloor=viewport?.dataset.scope==="floor";
    // The renderer catches up on its next frame. Keep form controls on the
    // operator's latest selection if another floor is chosen in between.
    const t=tower, f=floor;
    if(sceneLanguage!==language){
      sceneLanguage=language;
      sceneTower.replaceChildren(new Option(T("East","東座"),"E"),new Option(T("West","西座"),"W"));
      const codes=Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
      sceneFloor.replaceChildren(...codes.map(n=>new Option(n==="01"?T("F01 · Ground","F01 · 地面"):"F"+n,n)));
      sceneTower.setAttribute("aria-label",T("Select tower","選擇座別"));
      sceneFloor.setAttribute("aria-label",T("Select floor","選擇樓層"));
      sceneNav.setAttribute("aria-label",T("3D building views","三維建築視圖"));
      cameraButtons[0].textContent=T("Estate","全苑");
      cameraButtons[1].textContent=T("Floor section","樓層剖視");
    }
    sceneTower.value=t; sceneFloor.value=String(f).padStart(2,"0");
    cameraButtons[0].setAttribute("aria-pressed",String(!isFloor));
    cameraButtons[1].setAttribute("aria-pressed",String(isFloor));
    $("sectionLocation").hidden=!isFloor;
    $("mapTitle").textContent=isFloor
      ? (t==="E"?T("East Tower","東座"):T("West Tower","西座"))+" / F"+sceneFloor.value
      : T("Estate view","全苑立體圖");
    updateMetrics();
  }
  new MutationObserver(updateMapHeading).observe($("map"),{subtree:true,attributes:true,attributeFilter:["data-scope","data-tower","data-floor"]});

  deviceButton.addEventListener("click", () => {
    deviceOpen = !deviceOpen;
    deviceDisclosure();
  });
  function toggleActivity() {
    activityOpen = !activityOpen;
    activityDisclosure();
  }
  activityButton.addEventListener("click", toggleActivity);
  latestButton.addEventListener("click", toggleActivity);

  document.addEventListener("click", event => {
    const choice = event.target.closest("[data-mask], [data-model-label], [data-floor], [data-tower]");
    if (choice?.matches("[data-mask]") || choice?.dataset.modelLabel?.startsWith("EG-")) {
      deviceOpen = true;
    } else if (choice?.matches("[data-floor], [data-tower]")) {
      deviceOpen = false;
    } else {
      return;
    }
    deviceDisclosure();
  }, true);
  new MutationObserver(updateShell).observe($("inspector"), {childList:true});
  new MutationObserver(updateEvent).observe(events, {childList:true,subtree:true});
  monitoring?.subscribe(updateMetrics);
  if(monitoring)setInterval(updateMetrics,1500);
  window.EscapeRouteGuard.initialize(window.EscapeFloorRouting);
  updateShell();
  if (startFocused) setFocus("manual");
  const initialSection=/^([EW])(0[1-9]|1[0-2])$/.exec(query.get("inspect")||"");
  if(initialSection) requestAnimationFrame(()=>inspectFloor(initialSection[1],initialSection[2]));
})();
