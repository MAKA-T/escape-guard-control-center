(() => {
  const board=document.getElementById("incidentBoard"),strip=document.getElementById("bulletin");
  const item=document.getElementById("bulletinItem"),pause=document.getElementById("bulletinPause"),next=document.getElementById("bulletinNext");
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused=reduced.matches,pointerInside=false,currentId="",queue=[],lastFrame="",openFloors=0,lastRead=0;
  const lang=(en,zh)=>document.documentElement.lang.toLowerCase().startsWith("zh")?zh:en;
  const expectedLanguage=()=>document.documentElement.lang||"en";
  const scope=(tower,floor)=>(tower==="E"?lang("East","東座"):lang("West","西座"))+" F"+String(floor).padStart(2,"0");
  const services={
    sprinkler:["Sprinklers activated","分區噴淋已啟動"],
    fire:["Fire crew requested","已請求消防支援"],
    medical:["Medical team requested","已請求醫療支援"]
  };
  const zones={east:["East wing","東翼"],west:["West wing","西翼"],central:["Central lobby","中央大堂"],all:["Whole floor","整層"]};
  function pendingFloors(){
    let count=0;
    for(const tower of ["E","W"])for(let n=1;n<=12;n++){
      const snapshot=window.EscapeFloorRouting.snapshot(tower,String(n).padStart(2,"0"));
      if(snapshot.alerts.some(a=>a.status!=="resolved"))count++;
    }
    return count;
  }
  function metric(key,name,count){
    const tile=board.querySelector('[data-metric="'+key+'"]'),label=tile.querySelector("span"),number=tile.querySelector("strong");
    if(label.textContent!==name)label.textContent=name;
    if(number.textContent!==String(count))number.textContent=count;
  }
  function updateCounts(){
    const sample=window.EscapeEvacuation.shared.snapshot();
    if(Date.now()-lastRead>6000){openFloors=pendingFloors();lastRead=Date.now()}
    metric("inside",lang("People inside","樓內人數"),sample.counts.total-sample.counts.arrived);
    metric("pending",lang("Awaiting guidance","待引導人數"),sample.counts.needsAssistance);
    metric("floors",lang("Floors with alerts","有通報樓層"),openFloors);
    board.setAttribute("aria-label",lang("Estate totals","全苑數據看板"));
  }
  const responseRecords=()=>window.EscapeFireResponse?.snapshot().records||[];
  function refreshQueue(){
    const messages=(live?.bulletinEvents?.()||[]).filter(r=>r.kind!=="telemetry").map(r=>{
      const sensor=r.kind==="alarm"&&window.EscapeSensorReports.find(s=>s.source===r.source&&s.tower===r.tower&&s.floor===r.floor);
      return {id:r.id,time:r.time,area:r.tower&&r.floor?scope(r.tower,r.floor):lang("Estate","全苑"),
        text:sensor?lang(sensor.notesEn,sensor.notesZh):lang(r.en||r.label,r.zh||r.label)};
    });
    const responses=responseRecords().filter(r=>services[r.service]).map(r=>({
      id:"response-"+r.id,time:r.at,area:scope(r.tower,r.floor),text:[zones[r.zone]&&lang(...zones[r.zone]),lang(...services[r.service])].filter(Boolean).join(" · ")
    }));
    const ids=new Set();
    let items=[...responses,...messages].sort((a,b)=>b.time-a.time).filter(r=>{
      const key=r.area+"|"+r.text;
      if(ids.has(key))return false;
      ids.add(key);return true;
    }).slice(0,16);
    if(!items.length)items=[{id:"empty",area:"",text:lang("No current bulletins","目前沒有公示訊息"),time:0}];
    queue=items;
    // While paused, a new incident must not take the current item away from the reader.
    if(!items.some(r=>r.id===currentId)&&(!paused||!currentId))currentId=items[0].id;
  }
  function display(force=false){
    const entry=queue.find(r=>r.id===currentId)||(paused&&currentId&&!force?null:queue[0]);if(!entry)return;
    currentId=entry.id;
    const key=[entry.id,expectedLanguage(),entry.text].join("|");if(lastFrame===key)return;
    const previous=lastFrame;lastFrame=key;
    const time=item.querySelector("time");
    time.textContent=entry.time?new Date(entry.time).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}):"";
    item.querySelector("strong").textContent=entry.area;item.querySelector("span").textContent=entry.text;
    item.dataset.eventId=currentId;
    if(previous&&!reduced.matches)item.animate([{opacity:.2,transform:"translateY(9px)"},{opacity:1,transform:"translateY(0)"}],{duration:290,easing:"ease-out"});
  }
  function advance(){
    refreshQueue();const i=queue.findIndex(r=>r.id===currentId);
    currentId=queue[(i+1)%queue.length].id;display(true);
  }
  const icon=(path)=>'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="'+path+'"/></svg>';
  function localize(){
    strip.setAttribute("aria-label",lang("Incident bulletins","事件公示欄"));
    strip.querySelector(".bulletin-title b").textContent=lang("Incident bulletin","事件公示");
    document.getElementById("jumpFireResponse").textContent=lang("Fire response ↘","消防聯動 ↘");
    const label=paused?lang("Resume bulletin rotation","繼續輪播公示"):lang("Pause bulletin rotation","暫停輪播公示");
    pause.title=label;pause.setAttribute("aria-label",label);pause.setAttribute("aria-pressed",String(paused));
    pause.innerHTML=icon(paused?"M7 4.5 15 10l-8 5.5Z":"M7 5v10m6-10v10");
    const nextLabel=lang("Next bulletin","下一則公示");next.title=nextLabel;next.setAttribute("aria-label",nextLabel);
    next.innerHTML=icon("m8 5 5 5-5 5");
  }
  pause.onclick=()=>{paused=!paused;localize();if(!paused){refreshQueue();display(true)}};
  next.onclick=advance;
  document.getElementById("jumpFireResponse").onclick=()=>{
    const desk=document.querySelector('#controlRail [data-panel="desk"]');
    if(desk?.getAttribute("aria-expanded")==="false")desk.click();
    const response=document.getElementById("fireResponsePanel");
    response.scrollIntoView({block:"center",behavior:reduced.matches?"instant":"smooth"});
    response.querySelector('[data-service][aria-pressed="true"]')?.focus({preventScroll:true});
  };
  strip.onpointerenter=()=>{pointerInside=true};strip.onpointerleave=()=>{pointerInside=false};
  const synchronize=()=>{updateCounts();refreshQueue();display()};
  localize();synchronize();
  setInterval(()=>{if(!document.hidden)synchronize()},2000);
  setInterval(()=>{if(!paused&&!pointerInside&&!document.hidden&&!strip.contains(document.activeElement))advance()},6500);
  new MutationObserver(()=>{localize();synchronize()}).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  window.addEventListener("escape-access-change",()=>{lastRead=0;synchronize()});
  window.EscapeEvacuation.shared.subscribe(updateCounts);
  window.addEventListener("escape-fire-response-change",()=>{
    refreshQueue();
    if(!paused&&!pointerInside&&!strip.contains(document.activeElement))currentId=queue[0].id;
    display();
  });
})();
