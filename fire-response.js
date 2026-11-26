/* Local command receipts for the Escape Guard concept console. */
(function () {
  "use strict";
  const panel=document.getElementById("fireResponsePanel");
  const guided=new URLSearchParams(location.search).get("example")==="guided";
  const prefix="EscapeGuard.v153.response.",stampKey="escape-guard:v153:normal:reset-generation";
  let vault=null;
  if(!guided){try{vault=window.localStorage;}catch{/* Actions remain local to the page. */}}
  function generation(){try{return vault?.getItem(stampKey)||"";}catch{return "";}}
  const loadedGeneration=generation();
  const services={
    sprinkler:{en:"Sprinklers",zh:"分區噴淋",verb:["Activate sprinklers","啟動分區噴淋"],done:["Sprinklers active","噴淋已啟動"],
      icon:'<path d="M4 7h7V4h4v3h5m-8 0v3l-3 3h8l-3-3V7M5.5 17l-1.2 2m6-2-.5 2m6-2 .8 2m2.6-3 1.5 1.8"/>'},
    fire:{en:"Fire crew",zh:"消防隊",verb:["Request a fire crew","請求消防隊支援"],done:["Fire crew requested","已請求消防隊支援"],
      icon:'<path d="M4 7h10v9H3V9a2 2 0 0 1 1-2Zm10 3h3l3 3v3h-6M6 5h9M6 10h5m-5 3h5"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>'},
    medical:{en:"Medical team",zh:"醫療隊",verb:["Request a medical team","請求醫療隊支援"],done:["Medical team requested","已請求醫療隊支援"],
      icon:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-4 3v7m-3.5-3.5h7"/>'}
  };
  const zones={west:["West wing","西翼"],central:["Central lobby","中央大堂"],east:["East wing","東翼"],all:["Whole floor","整層"]};
  const records=new Map(),drafts=new Map();
  let service="sprinkler",review=null,receipt=null,stopped=false,committing=false,localOnly=!vault&&!guided;
  const zh=()=>document.documentElement.lang.toLowerCase().startsWith("zh");
  const t=(en,cn)=>zh()?cn:en;
  const paired=p=>t(p[0],p[1]);
  const validTower=x=>x==="E"||x==="W";
  const validFloor=x=>typeof x==="string"&&/^(?:0[1-9]|1[0-2])$/.test(x);
  function recordKey(r){return prefix+[r.service,r.tower,r.floor,r.zone].join(".");}
  function isRecord(r){
    return r&&Object.hasOwn(services,r.service)&&validTower(r.tower)&&validFloor(r.floor)&&Object.hasOwn(zones,r.zone)&&
      (r.service!=="sprinkler"||r.zone!=="all")&&Number.isFinite(r.at)&&r.at>0;
  }
  function canEdit(){return !stopped&&(guided||(!window.EscapeConsoleReset?.isResetting&&loadedGeneration===generation()));}
  function readSaved(){
    if(!vault||!canEdit())return;
    let saved=[];
    try{
      for(let i=0;i<vault.length;i++){
        const key=vault.key(i);if(!key?.startsWith(prefix))continue;
        try{
          const row=JSON.parse(vault.getItem(key));
          if(isRecord(row)&&row.generation===loadedGeneration&&key===recordKey(row))
            saved.push({...row,id:key.slice(prefix.length)});
        }catch{/* Ignore an incomplete receipt. */}
      }
    }catch{return;}
    if(!localOnly)records.clear();
    for(const row of saved)records.set(row.id,row);
  }
  function snapshot(){
    const items=Array.from(records.values(),r=>({id:r.id,service:r.service,tower:r.tower,floor:r.floor,zone:r.zone,at:r.at})).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
    const count=id=>items.filter(r=>r.service===id).length;
    return {sprinklersActive:count("sprinkler"),fireRequests:count("fire"),medicalRequests:count("medical"),records:items};
  }
  function changed(){window.dispatchEvent(new CustomEvent("escape-fire-response-change",{detail:snapshot()}));}
  function clearForReload(){
    const owned=[];
    if(vault){for(let i=0;i<vault.length;i++){const key=vault.key(i);if(key?.startsWith(prefix))owned.push(key);}
      for(const key of owned)vault.removeItem(key);}
    stopped=true;review=null;receipt=null;records.clear();render();changed();return owned.length;
  }
  function current(id=service){
    if(!drafts.has(id)){
      const tower=document.querySelector("#towers [aria-pressed=true]")?.dataset.tower;
      const floor=document.querySelector("#floors [aria-pressed=true]")?.dataset.floor;
      drafts.set(id,{service:id,tower:validTower(tower)?tower:"E",floor:validFloor(floor)?floor:"02",zone:id==="sprinkler"?"east":"all"});
    }
    return drafts.get(id);
  }
  function matching(scope){
    return Array.from(records.values()).find(r=>r.service===scope.service&&r.tower===scope.tower&&r.floor===scope.floor&&
      (r.zone===scope.zone||r.zone==="all"||scope.zone==="all"));
  }
  const towerName=id=>id==="E"?t("East tower","東座"):t("West tower","西座");
  const locationLabel=r=>towerName(r.tower)+" · F"+r.floor+" · "+paired(zones[r.zone]);
  const timeLabel=at=>new Date(at).toLocaleTimeString(zh()?"zh-HK":"en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  const icon=id=>'<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+services[id].icon+'</svg>';
  function announce(text){const live=panel?.querySelector(".response-live");if(live)live.textContent=text;}
  function option(id,text,active){return '<option value="'+id+'"'+(active===id?' selected':'')+'>'+text+'</option>';}
  function render(focusTarget){
    if(!panel)return;
    let body=panel.querySelector(".response-content");
    if(!body){
      panel.classList.add("response-station");
      panel.innerHTML='<div class="response-content"></div><span class="response-live" aria-live="polite" aria-atomic="true"></span>';
      body=panel.querySelector(".response-content");
    }
    const s=current(),existing=matching(s),record=receipt||existing,counts=snapshot();
    const nums={sprinkler:counts.sprinklersActive,fire:counts.fireRequests,medical:counts.medicalRequests};
    let html='<div class="response-title"><h2>'+t("Fire response","消防聯動")+'</h2><small>'+t("Local simulation","本地模擬")+'</small></div>';
    html+='<div class="response-services" role="group" aria-label="'+t("Response service","選擇聯動項目")+'">'+Object.keys(services).map(id=>{
      const name=zh()?services[id].zh:services[id].en;
      return '<button type="button" data-service="'+id+'" aria-pressed="'+(service===id)+'" aria-label="'+name+'">'+icon(id)+'<span>'+name+'</span>'+
        (nums[id]?'<b aria-label="'+t("Recorded","已記錄")+' '+nums[id]+'">'+nums[id]+'</b>':'')+'</button>';
    }).join("")+'</div>';
    if(stopped){
      html+='<p class="response-note">'+t("Resetting console…","正在重設控制台…")+'</p>';
    }else if(review){
      html+='<div class="response-review"><small>'+t("Review simulation","核對模擬指令")+'</small><strong>'+paired(services[service].verb)+'</strong>'+
        '<p>'+locationLabel(review)+'</p><div><button type="button" data-response-action="back">'+t("Back","返回")+'</button>'+
        '<button class="response-primary" type="button" data-response-action="confirm">'+t("Confirm","確認")+'</button></div></div>';
    }else{
      html+='<div class="response-scope"><label>'+t("Tower","樓座")+'<select id="responseTower">'+["E","W"].map(id=>option(id,towerName(id),s.tower)).join("")+'</select></label>'+
        '<label>'+t("Floor","樓層")+'<select id="responseFloor">'+Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0")).map(id=>option(id,"F"+id,s.floor)).join("")+'</select></label>'+
        '<label>'+t("Area","區域")+'<select id="responseZone">'+Object.keys(zones).filter(id=>id!=="all"||service!=="sprinkler").map(id=>option(id,paired(zones[id]),s.zone)).join("")+'</select></label></div>';
      if(record){
        html+='<div class="response-receipt"><b>'+paired(services[record.service].done)+'</b><span>'+locationLabel(record)+'</span><small>'+
          t("Simulation receipt","模擬回執")+' · '+timeLabel(record.at)+'</small></div>';
        if(existing&&existing.zone!==s.zone){
          const note=existing.zone==="all"?t("This area is covered by the whole-floor request.","整層請求已涵蓋此區。"):
            t("One area already has a request. Select another area to extend coverage.","已有一區提出請求。可選其他區域增派支援。");
          html+='<p class="response-note">'+note+'</p>';
        }
      }
      if(!existing)html+='<button type="button" class="response-primary response-review-button" data-response-action="review">'+t("Review request","核對指令")+' <span aria-hidden="true">›</span></button>';
    }
    if(localOnly)html+='<p class="response-note">'+t("Receipt stored in this tab.","回執保留於本分頁。")+'</p>';
    body.innerHTML=html;
    if(focusTarget)body.querySelector(focusTarget)?.focus({preventScroll:true});
  }
  function chooseScope(){
    if(review||!canEdit())return;
    const tower=panel.querySelector("#responseTower")?.value,floor=panel.querySelector("#responseFloor")?.value,zone=panel.querySelector("#responseZone")?.value;
    if(!validTower(tower)||!validFloor(floor)||!Object.hasOwn(zones,zone)||(zone==="all"&&service==="sprinkler"))return;
    drafts.set(service,{service,tower,floor,zone});review=null;receipt=null;
  }
  function commitReview(target){
    if(review!==target||!canEdit())return;
    readSaved();
    const duplicate=matching(target);
    if(duplicate){review=null;receipt=duplicate;render();announce(t("Already recorded","已有回執"));return;}
    const row={...target,at:Date.now(),generation:loadedGeneration};
    row.id=recordKey(row).slice(prefix.length);
    if(vault){
      try{vault.setItem(recordKey(row),JSON.stringify(row));}
      catch{localOnly=true;}
    }
    records.set(row.id,row);receipt=row;review=null;render('[data-service="'+service+'"]');
    announce(paired(services[service].done)+" · "+locationLabel(row));changed();
  }
  async function confirm(){
    if(!review||committing||!canEdit())return;
    const target=review;committing=true;
    const action=panel.querySelector('[data-response-action="confirm"]');
    if(action){action.disabled=true;action.setAttribute("aria-busy","true");}
    try{
      // Whole-floor requests and wing requests share this lock, so two duty
      // tabs cannot both confirm an overlapping dispatch.
      if(vault&&navigator.locks?.request){
        const key=prefix+[target.service,target.tower,target.floor].join(".");
        await navigator.locks.request(key,()=>commitReview(target));
      }else commitReview(target);
    }catch{announce(t("Confirmation unavailable. Review the request again.","暫時無法確認，請重新核對指令。"));}
    finally{committing=false;if(action?.isConnected){action.disabled=false;action.removeAttribute("aria-busy");}}
  }
  if(panel){
    panel.addEventListener("change",event=>{
      if(!["responseTower","responseFloor","responseZone"].includes(event.target.id))return;
      chooseScope();render("#"+event.target.id);
    });
    panel.addEventListener("click",event=>{
      const b=event.target.closest("button");if(!b||!canEdit())return;
      if(b.dataset.service&&Object.hasOwn(services,b.dataset.service)){
        service=b.dataset.service;review=null;receipt=null;readSaved();render('[data-service="'+service+'"]');return;
      }
      if(b.dataset.responseAction==="review"){chooseScope();readSaved();if(matching(current())){render();return;}review={...current()};render('[data-response-action="confirm"]');}
      if(b.dataset.responseAction==="back"){review=null;render('[data-response-action="review"]');}
      if(b.dataset.responseAction==="confirm")confirm();
    });
    let currentLanguage=document.documentElement.lang;
    new MutationObserver(()=>{
      if(currentLanguage!==document.documentElement.lang){currentLanguage=document.documentElement.lang;render();}
    }).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  }
  window.addEventListener("storage",ev=>{
    if(!vault||!canEdit()||(ev.key!==null&&!ev.key?.startsWith(prefix)))return;
    receipt=null;readSaved();render();changed();
  });
  window.addEventListener("escape-console-reset-external",()=>{stopped=true;records.clear();review=null;receipt=null;render();changed();});
  window.EscapeFireResponse={snapshot,clearForReload};
  readSaved();render();changed();
})();
