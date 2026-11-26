/* Local event and message service. All recipients and receipts belong to this offline prototype. */
(function(){
  "use strict";
  const copyTypes={
    evacuation:["Evacuation alert","疏散警報","Evacuation alert for this area. Follow the building's emergency announcements.","本區已發布疏散警報，請留意樓宇緊急廣播。"],
    route:["Route notice","路線通知","Route information is being updated. Individual directions appear on the relevant masks.","路線資訊更新中，個別方向指示將在相關面罩上顯示。"],
    bulletin:["Situation update","情況更新","Building staff are checking the reported incident.","樓宇值班人員正在核查事故。"],
    custom:["Custom notice","自訂通知","",""]
  };
  const scoped={floor:["Selected floor","所選樓層"],tower:["Selected tower","所選樓棟"],estate:["Entire estate","整個屋苑"],device:["Selected mask","所選面罩"]};
  const storageKey="EscapeGuard.v153.operator.messages.v1";
  const vault=(()=>{try{return new URLSearchParams(location.search).get("example")==="guided"?null:localStorage;}catch{return null;}})();
  const savedNoticeKey=key=>key===storageKey||(key?.startsWith(storageKey+".")&&/^M-[0-9A-Z]{6,7}$/.test(key.slice(storageKey.length+1)));
  function clearSavedNotices(){
    if(!vault)return 0;
    const keys=[];
    for(let i=0;i<vault.length;i++){
      const key=vault.key(i);
      if(savedNoticeKey(key))keys.push(key);
    }
    for(const key of keys)vault.removeItem(key);
    return keys.length;
  }
  function node(tag,props={},text){
    const e=document.createElement(tag);
    for(const [key,val] of Object.entries(props)){
      if(key==="class")e.className=val;
      else if(key in e)e[key]=val;
      else e.setAttribute(key,val);
    }
    if(text!=null)e.textContent=text;
    return e;
  }
  const norm=id=>String(id||"").replace(/^EG-/i,"");
  const clock=t=>new Date(t).toLocaleTimeString("en-GB",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
  function mount({feed,broadcast,context,onInspect,onEvent}){
    const sensors=window.EscapeSensorReports||[];
    const signals=sensors.map(s=>({tower:s.tower,floor:s.floor,nodeId:s.nodeId,source:s.source,kind:"alarm",en:s.labelEn,zh:s.labelZh,notes:s.notesEn}));
    signals.push({tower:"E",floor:"02",nodeId:"east-watch",source:"CAM-02E",kind:"telemetry",en:"East-lobby camera frame",zh:"東翼大堂攝像頭影像"},
      {tower:"E",floor:"02",source:"UWB",kind:"telemetry",en:"Mask position report received",zh:"已收到面罩位置回報"});
    const text=(en,zh)=>context().lang==="zh"?zh:en;
    const towerName=t=>t==="E"?text("East Tower","東座"):text("West Tower","西座");
    const area=(t,f)=>towerName(t)+" / F"+f;
    let stopped=false,sequence=0,alarmOnly=false,held=false,newCount=0;
    let draft={type:"evacuation",scope:"floor",message:"",edited:false},confirm=null,showHistory=false;
    let lastLang="",lastContext="",confirmedScope="",records=[];
    function readRecords(){
      if(!vault)return records;
      try{
        const read=key=>{try{return JSON.parse(vault.getItem(key)||"null")}catch{return null}};
        const legacy=read(storageKey);
        const all=Array.isArray(legacy)?legacy.slice():[];
        for(let i=0;i<vault.length;i++){
          const key=vault.key(i);
          if(key!==storageKey&&savedNoticeKey(key)){const item=read(key);if(item)all.push(item)}
        }
        return all.filter(v=>Array.isArray(v?.targets)&&v.targets.length).sort((a,b)=>b.time-a.time);
      }catch(_){return records}
    }
    records=readRecords().slice(0,24);
    const now=Date.now(),events=[];
    function prep(s,t,additional={}){
      return {...s,...additional,source:s.source||"",id:additional.id||"obs-"+t+"-"+sequence++,observedAt:new Date(t).toISOString(),label:s.en||s.label||"",time:t};
    }
    signals.slice(0,4).forEach((s,i)=>events.unshift(prep(s,now-40000+i*8000)));
    const feedTitle=node("h3"),filter=node("button",{type:"button"}),follow=node("button",{type:"button"});
    const head=node("header"),controls=node("div",{class:"eg-feed-tools"});
    const stream=node("div",{class:"eg-stream",tabIndex:0,role:"region"});
    head.append(feedTitle,controls);controls.append(filter,follow);feed.classList.add("eg-live");feed.replaceChildren(head,stream);
    broadcast.classList.add("eg-broadcast");
    function feedHead(){
      feedTitle.textContent=text("Event feed","現場訊息");
      filter.textContent=alarmOnly?text("Alerts only","僅警報"):text("All events","全部事件");
      filter.setAttribute("aria-pressed",String(alarmOnly));
      follow.textContent=held?(newCount?"+"+newCount+" ":"")+text("Resume","繼續"):text("Pause","暫停");
      follow.setAttribute("aria-pressed",String(held));
      stream.setAttribute("aria-label",text("Incoming building events","樓宇事件紀錄"));
    }
    function drawFeed(){
      feedHead();
      const scroll=stream.scrollTop;
      const rows=events.filter(r=>!alarmOnly||r.kind==="alarm").slice(0,45).map(r=>{
        const inspect=Boolean(r.nodeId&&onInspect);
        const row=node(inspect?"button":"div",{class:"eg-feed-row"});if(inspect)row.type="button";
        row.dataset.alarm=String(r.kind==="alarm");row.dataset.eventSource=r.source;
        const body=node("span");body.append(node("strong",{},text(r.en||r.label,r.zh||r.label)),node("small",{},area(r.tower,r.floor)+" · "+r.source));
        const symbol=node("span",{class:"eventSourceGlyph"});
        symbol.innerHTML=window.EscapeDeskIcons.svg(r.kind==="broadcast"?"broadcast":window.EscapeDeskIcons.sensor(r.source));
        row.append(symbol,body,node("time",{},clock(r.time)));
        if(inspect)row.onclick=()=>onInspect({tower:r.tower,floor:r.floor,alertId:r.alertId||r.source,nodeId:r.nodeId,source:r.source,id:r.id});
        return row;
      });
      stream.replaceChildren(...rows);stream.scrollTop=held?scroll:0;
    }
    function addEvent(record,notify=true){
      events.unshift(record);events.splice(120);
      if(notify&&onEvent){
        const result=onEvent(record);
        if(typeof result==="string")record.alertId=result;
        else if(result?.alertId)record.alertId=result.alertId;
      }
      if(held){newCount++;feedHead()}else drawFeed();
    }
    filter.onclick=()=>{alarmOnly=!alarmOnly;drawFeed()};
    follow.onclick=()=>{held=!held;newCount=0;drawFeed()};
    stream.addEventListener("scroll",()=>{if(!held&&stream.scrollTop>5){held=true;newCount=0;feedHead()}});
    function persist(record){
      if(!vault){records.unshift(record);records.splice(24);return;}
      try{
        vault.setItem(storageKey+"."+record.id,JSON.stringify(record));
        const all=readRecords();records=all.slice(0,24);
        for(const old of all.slice(24))vault.removeItem(storageKey+"."+old.id);
      }catch(_){records.unshift(record);records.splice(24)}
    }
    function onStored(ev){
      if(!savedNoticeKey(ev.key))return;
      records=readRecords().slice(0,24);
      const history=broadcast.querySelector(".eg-history");if(history)history.replaceWith(historyArea());
    }
    window.addEventListener("storage",onStored);
    function selectedRecipients(scope,c){
      return (c.devices||[]).filter(d=>{
        if(scope==="estate")return true;
        if(scope==="device")return norm(d.id)===norm(c.selected);
        return d.tower===c.tower&&(scope==="tower"||d.floor===c.floor);
      });
    }
    function nameScope(scope,c){
      if(scope==="device")return "EG-"+norm(c.selected);
      if(scope==="estate")return text("Entire estate","整個屋苑");
      if(scope==="tower")return towerName(c.tower);
      return area(c.tower,c.floor);
    }
    function defaultBody(type){const t=copyTypes[type];return text(t[2],t[3])}
    function bodyValue(){return draft.edited?draft.message:defaultBody(draft.type)}
    function bindScope(){
      const {tower,floor,selected}=context();draft.location={tower,floor,selected};
    }
    function recipientsContext(){return {...context(),...draft.location}}
    function preview(){
      if(!draft.location)bindScope();
      const c=recipientsContext(),body=bodyValue().trim(),targets=selectedRecipients(draft.scope,c);
      if(!body||!targets.length)return;
      confirm={type:draft.type,scope:draft.scope,tower:c.tower,floor:c.floor,selected:c.selected,body,targets:targets.map(d=>({id:norm(d.id),status:d.status})),at:Date.now()};
      confirmedScope=nameScope(draft.scope,c);drawComposer();
    }
    function dispatch(){
      if(!confirm||stopped||window.EscapeConsoleReset?.isResetting)return;
      const p=confirm,c=recipientsContext(),now=Date.now();
      if(nameScope(p.scope,c)!==confirmedScope){confirm=null;drawComposer();return}
      const key=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6,"0");
      const record={id:"M-"+key,time:now,type:p.type,scope:p.scope,tower:p.tower,floor:p.floor,selected:p.selected,body:p.body,
        targets:p.targets.map((d,i)=>({id:d.id,ackAt:d.status==="stale"||d.status==="offline"||d.status==="exited"?null:now+1800+(i%7)*760}))};
      persist(record);
      confirm=null;showHistory=true;draft={type:"bulletin",scope:p.scope,message:"",edited:false};
      addEvent(prep({source:record.id,tower:record.tower,floor:record.floor,kind:"broadcast",en:"Notice sent to "+record.targets.length+" masks",zh:"通知已派送至 "+record.targets.length+" 部面罩"},now,{messageId:record.id}),true);
      drawComposer();
    }
    function receipt(r){
      const received=r.targets.filter(d=>d.ackAt&&d.ackAt<=Date.now()).length;
      return text(received+" received · "+(r.targets.length-received)+" pending",received+" 已接收 · "+(r.targets.length-received)+" 待回執");
    }
    function latestFor(id){
      const record=records.find(r=>r.targets.some(t=>t.id===norm(id)));
      if(!record)return null;
      const t=record.targets.find(t=>t.id===norm(id));
      return {id:record.id,body:record.body,received:Boolean(t.ackAt&&t.ackAt<=Date.now()),at:record.time};
    }
    function historyArea(){
      const block=node("div",{class:"eg-history"});
      const title=node("button",{class:"eg-log-head",type:"button"},text("Sent notices","已發通知")+" ("+records.length+") "+(showHistory?"▴":"▾"));title.onclick=()=>{showHistory=!showHistory;drawComposer()};
      block.append(title);
      if(showHistory)for(const r of records.slice(0,5)){
        const row=node("div",{class:"eg-log-row"});
        const s=node("div",{class:"eg-receipt-line"});
        const counts=node("span",{},receipt(r));counts.dataset.receipt=r.id;
        s.append(node("b",{},r.id+" · "+nameScope(r.scope,r)),counts);
        row.append(s,node("small",{},clock(r.time)+" · "+r.body));block.append(row);
      }
      return block;
    }
    function drawComposer(){
      const c=recipientsContext(),field=node("fieldset");
      field.append(node("h3",{},confirm?text("Check before sending","確認廣播內容"):text("Send a broadcast","發布廣播")));
      if(confirm){
        const recipient=node("div",{class:"eg-confirm-scope"});
        recipient.append(node("small",{},text("Recipients","接收範圍")),node("strong",{},confirmedScope),node("b",{},confirm.targets.length+text(" masks"," 部面罩")));
        field.append(recipient,node("div",{class:"eg-preview"},confirm.body));
        const actions=node("div",{class:"eg-actions"});
        const back=node("button",{class:"eg-back",type:"button"},text("Edit","返回編輯"));back.onclick=()=>{confirm=null;drawComposer()};
        const send=node("button",{class:"eg-main-action",type:"button"},text("Send notice","確認發送"));send.dataset.sendBroadcast="";send.onclick=dispatch;actions.append(back,send);field.append(actions);
      }else{
        const addSelect=(key,title,options)=>{
          const lab=node("label",{class:"eg-field",htmlFor:"eg-broadcast-"+key},title);
          const select=node("select",{id:"eg-broadcast-"+key});
          for(const [value,labels] of Object.entries(options)){
            const label=key==="scope"?nameScope(value,value===draft.scope?c:context()):text(labels[0],labels[1]);
            select.append(node("option",{value},label));
          }
          select.value=draft[key];select.onchange=()=>{draft[key]=select.value;if(key==="type")draft.edited=false;if(key==="scope"||!draft.location)bindScope();drawComposer()};field.append(lab,select);
        };
        addSelect("scope",text("Recipients","接收範圍"),scoped);
        addSelect("type",text("Notice type","通知類型"),copyTypes);
        const fieldId="eg-broadcast-message",areaText=node("textarea",{id:fieldId,maxLength:360,rows:2});areaText.value=bodyValue();
        field.append(node("label",{class:"eg-field",htmlFor:fieldId},text("Message","通知內容")),areaText);
        const targets=selectedRecipients(draft.scope,c),count=node("div",{class:"eg-scope-count"});
        count.append(node("small",{},text("Recipients in scope","範圍內面罩")),node("strong",{},String(targets.length)));field.append(count);
        if(draft.location&&nameScope(draft.scope,c)!==nameScope(draft.scope,context())){
          const change=node("button",{class:"eg-back",type:"button"},text("Use current selection","改用目前選取範圍"));change.onclick=()=>{bindScope();drawComposer()};field.append(change);
        }
        const enter=node("button",{class:"eg-main-action",type:"button",disabled:!areaText.value.trim()||!targets.length},text("Preview notice","預覽通知"));enter.dataset.previewBroadcast="";enter.onclick=preview;
        areaText.oninput=()=>{draft.message=areaText.value;draft.edited=true;if(!draft.location)bindScope();enter.disabled=!areaText.value.trim()||!targets.length};field.append(enter);
      }
      broadcast.replaceChildren(field,historyArea());
    }
    function update(){
      if(stopped)return;
      const c=context(),key=[c.tower,c.floor,norm(c.selected)].join("-");
      if(c.lang!==lastLang||key!==lastContext){
        if(confirm)confirmedScope=nameScope(confirm.scope,confirm);
        lastLang=c.lang;lastContext=key;drawFeed();drawComposer();
      }
    }
    let i=2;
    const timer=setInterval(()=>{
      const s=signals[(i++)%signals.length];
      addEvent(prep(s,Date.now()),true);
    },11500);
    let visibleAck="";
    const receipts=setInterval(()=>{
      broadcast.querySelectorAll("[data-receipt]").forEach(e=>{const r=records.find(v=>v.id===e.dataset.receipt);if(r)e.textContent=receipt(r)});
      const c=context(),last=latestFor(c.selected);
      const next=last?[norm(c.selected),last.id,last.received].join("/"):"";
      if(next!==visibleAck){
        visibleAck=next;
        if(last&&onEvent)onEvent({kind:"delivery",messageId:last.id,deviceId:norm(c.selected),received:last.received,tower:c.tower,floor:c.floor});
      }
    },1200);
    update();
    function destroy(){stopped=true;clearInterval(timer);clearInterval(receipts);window.removeEventListener("storage",onStored);feed.replaceChildren();broadcast.replaceChildren();}
    return {update,latestFor,records:()=>records.slice(),bulletinEvents:()=>events.slice(0,32).map(record=>({...record})),
      log(record){addEvent(prep({...record,kind:record.kind||"operator"},Date.now(),{alertId:record.alertId}),false);},
      destroy,clearForReload(){destroy();records=[];events.length=0;confirm=null;draft={};}};
  }
  window.EscapeLiveOps={mount,clearSavedNotices};
})();
