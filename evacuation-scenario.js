/* Fictional high-rise drill. Coordinates refer to the original 720 × 315 floor plan. */
(function (host) {
  'use strict';
  const layout = host.EscapeBuildingLayout || (typeof require==='function' ? require('./building-layout.js') : null);
  if(!layout) throw new Error('Load building-layout.js before the evacuation scenario.');
  const VERSION = 15303,LEGACY_VERSION=15002;
  const FLOOR = n => String(n).padStart(2, '0');
  const KEY = (tower, floor, name) => `${tower}:${FLOOR(floor)}:${name}`;
  const clone = v => JSON.parse(JSON.stringify(v));
  const geometry = layout.corridors, roofGeometry = layout.roofGeometry;
  const trunk=layout.navTrunk,branches=layout.navBranches;
  const incidents = [
    {id:'E02-D4',tower:'E',floor:'02',x:555,y:160,radius:42,heat:1.0,smoke:.87,phenomenon:'scripted-fire-seat',visualOrigin:{x:548,y:177},restrictedRadius:33,label:'East stair B approach',labelZh:'東座 B 梯入口'},
    {id:'E03-S2',tower:'E',floor:'03',x:569,y:163,radius:34,heat:0,smoke:.93,phenomenon:'smoke-layer',restrictedRadius:21,label:'East stair B landing',labelZh:'東座 B 梯平台'},
    {id:'E10-D7',tower:'E',floor:'10',x:533,y:163,radius:30,heat:.75,smoke:.61,phenomenon:'heated-layer',restrictedRadius:15,label:'Upper east corridor',labelZh:'東座高層東翼走廊'},
    {id:'W07-S3',tower:'W',floor:'07',x:475,y:176,radius:25,heat:0,smoke:.56,phenomenon:'smoke-layer',restrictedRadius:0,label:'West tower smoke observation',labelZh:'西座煙霧觀測點'}
  ].map(h=>({...h,level:Number(h.floor),intensity:Math.max(h.heat,h.smoke),simulated:true}));
  const groupDefinitions = [
    {id:'roof-east',label:'Roof access party',labelZh:'屋頂待援組',location:'East tower · roof access',locationZh:'東座 · 屋頂出入口',tower:'E',floor:'12',start:'roof-hold',roof:true,count:3,
      options:[
        {id:'west-roof-link',kind:'passage',label:'West roof service passage',labelZh:'屋頂西側工作通道',end:'A',roof:true,via:layout.roofPaths.A.slice(1,-1)},
        {id:'roof-east-hatch',kind:'exit',label:'Alternate east roof hatch',labelZh:'屋頂東側替代梯口',end:'B',roof:true,via:layout.roofPaths.B.slice(1,-1)}
      ]},
    {id:'upper-east',label:'East landing party',labelZh:'東翼平台待援組',location:'East tower · F10 east landing',locationZh:'東座 · 10 樓東翼平台',tower:'E',floor:'10',start:'east-hold',roof:false,count:3,
      options:[
        {id:'upper-stair-transfer',kind:'exit',label:'Alternate B landing door',labelZh:'B 梯平台替代門',end:'B',via:[[575,183],[580,174],[581,164],[589,157]]},
        {id:'east-shutter',kind:'passage',label:'Passage behind closed shutter',labelZh:'防火捲閘後通廊',end:'isolated-end',via:[[562,186]]}
      ]},
    {id:'upper-west',label:'Upper lobby party',labelZh:'高層門廳待援組',location:'West tower · F08 entrance lobby',locationZh:'西座 · 8 樓入口門廳',tower:'W',floor:'08',start:'central-entry',roof:false,count:2,
      options:[
        {id:'west-lobby-link',kind:'passage',label:'West-side lobby passage',labelZh:'門廳西側新通道',end:'mid-hall',via:[[320,244],[306,227],[305,197],[299,179]]},
        {id:'east-lobby-door',kind:'exit',label:'Alternate cross-corridor door',labelZh:'橫向走廊替代出口',end:'mid-east',via:[[320,245],[346,230],[351,207],[352,182]]}
      ]},
    {id:'east-transfer',label:'Stair transfer party',labelZh:'東座換梯組',location:'East tower · F09 east stair lobby',locationZh:'東座 · 9 樓東側樓梯門廳',tower:'E',floor:'09',start:'east-lobby',roof:false,count:5,
      options:[
        {id:'b-to-a-f04',kind:'passage',label:'Stair B to A via F04',labelZh:'沿 B 梯至 4 樓換 A 梯',checkpoints:[[9,'B'],[4,'B'],[4,'A']]},
        {id:'east-nine-cross',kind:'passage',label:'F09 west corridor to Stair A',labelZh:'沿 9 樓西向走廊到 A 梯',checkpoints:[[9,'A']]}
      ]},
    {id:'west-gallery',label:'South vestibule party',labelZh:'南側前室待援組',location:'West tower · F06 south vestibule',locationZh:'西座 · 6 樓南側前室',tower:'W',floor:'06',start:'central-entry',roof:false,count:3,
      options:[
        {id:'south-west-bypass',kind:'passage',label:'West side of the lobby to Stair A',labelZh:'經門廳西側繞往 A 梯',end:'mid-hall',via:[[320,244],[306,227],[305,197],[299,179]],after:[[6,'A']]},
        {id:'south-east-bypass',kind:'passage',label:'East side of the lobby to Stair B',labelZh:'經門廳東側繞往 B 梯',end:'mid-east',via:[[320,245],[346,230],[351,207],[352,182]],after:[[6,'B']]}
      ]}
  ];
  const byGroup = new Map(groupDefinitions.map(g=>[g.id,g]));
  const holdingPoints = {
    'roof-east':['Roof access holding point','屋頂出入口指定等候點'],
    'upper-east':['East landing holding point','東翼平台指定等候點'],
    'upper-west':['West entrance lobby holding point','西座入口門廳指定等候點'],
    'east-transfer':['East stair lobby','東側樓梯門廳'],
    'west-gallery':['South vestibule holding point','南側前室指定等候點']
  };
  const planar = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const pad = n => FLOOR(n);
  function point(tower,level,x,y,nodeId,extra={}) {
    return {tower,floor:layout.floorCode(level),level:Number(level),x,y,nodeId,kind:'corridor',roof:false,outside:false,...extra};
  }
  function covered(a,b,rectangles) {
    const parts=[];
    for(const r of rectangles){
      let lo=0,hi=1;
      for(const [p,v,min,max] of [[a.x,b.x-a.x,r[0],r[2]],[a.y,b.y-a.y,r[1],r[3]]]){
        if(Math.abs(v)<1e-8){if(p<min||p>max){hi=-1;break;}continue;}
        const t=(min-p)/v,u=(max-p)/v;lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));
      }
      if(lo<=hi)parts.push([lo,hi]);
    }
    let reach=0;for(const [lo,hi] of parts.sort((a,b)=>a[0]-b[0])){if(lo>reach+.00001)break;reach=Math.max(reach,hi);}
    return reach>=.99999;
  }
  function hitsRestriction(a,b){
    if(a.roof||b.roof||a.outside||b.outside)return false;
    const dx=b.x-a.x,dy=b.y-a.y;
    return incidents.some(h=>{
      if(h.tower!==a.tower||h.floor!==a.floor||!h.restrictedRadius)return false;
      const t=Math.max(0,Math.min(1,((h.x-a.x)*dx+(h.y-a.y)*dy)/(dx*dx+dy*dy||1)));
      return Math.hypot(h.x-a.x-t*dx,h.y-a.y-t*dy)<=h.restrictedRadius;
    });
  }
  const nodes=new Map(),links=new Map(),networkExits=new Set();
  function addNode(tower,floor,name,x,y,extra){
    const id=KEY(tower,floor,name),p=point(tower,floor,x,y,id,extra);
    nodes.set(id,p);links.set(id,[]);return p;
  }
  function join(a,b,kind='corridor'){
    if(!a||!b)return;
    if(kind==='corridor'&&(!covered(a,b,geometry)||hitsRestriction(a,b)))return;
    if(links.get(a.nodeId).some(e=>e[0]===b.nodeId))return;
    const weight=Math.hypot(planar(a,b),58*(a.level-b.level));
    links.get(a.nodeId).push([b.nodeId,weight]);links.get(b.nodeId).push([a.nodeId,weight]);
  }
  function detailedConnection(start,end,samples){
    let previous=start;
    for(const p of samples.slice(1,-1)){
      const landingHub=p.nodeId.endsWith('upper-turn')||p.nodeId.endsWith('lower-turn');
      const id=start.tower+':'+(landingHub?`${p.stair}:landing-hub:${p.level}`:p.nodeId);
      if(!nodes.has(id)){nodes.set(id,{...p,nodeId:id,tower:start.tower});links.set(id,[]);}
      const next=nodes.get(id);join(previous,next,'structural-path');previous=next;
    }
    join(previous,end,'structural-path');
  }
  function buildNetwork(){
    for(const t of ['E','W'])for(let f=1;f<=12;f++){
      const find=name=>nodes.get(KEY(t,f,name));
      for(const [name,x] of trunk)addNode(t,f,name,x,160);
      trunk.slice(1).forEach(([name],i)=>{
        // On East F10 the normal stair door remains closed pending a checked alternate entry.
        if(!(t==='E'&&f===10&&name==='B'))join(find(trunk[i][0]),find(name));
      });
      for(const [name,x,y,parent] of branches){addNode(t,f,name,x,y);if(!(t==='W'&&[6,8].includes(f)&&name==='central-lobby'))join(find(name),find(parent));}
      if(f>1)for(const stair of ['A','B']){
        if(t==='E'&&stair==='B'&&(f===2||f===3))continue;
        detailedConnection(find(stair),nodes.get(KEY(t,f-1,stair)),layout.stairRoute(stair,f));
      }
      if(f===1)for(const stair of ['A','B']){
        const path=layout.discharge(stair),end=path.at(-1);
        const out=addNode(t,1,'outside-'+stair,end.x,end.y,{outside:true,exitId:stair,kind:'outside'});
        detailedConnection(find(stair),out,path);networkExits.add(out.nodeId);
      }
      if(f===12)for(const stair of ['A','B']){
        const top=addNode(t,13,stair,...layout.stairs[stair].entry,{roof:true,kind:'roof',stair});
        detailedConnection(top,find(stair),layout.stairRoute(stair,13));
      }
    }
    addNode('E',12,'roof-hold',320,260,{roof:true,level:13,kind:'roof'});
    const pocket=addNode('E',10,'east-hold',570,185);
    join(pocket,nodes.get(KEY('E',10,'east-watch')));
    addNode('E',10,'isolated-end',554,187);
  }
  buildNetwork();
  const routeCache=new Map();
  function networkPath(start,destination=null){
    const key=start+'->'+(destination||'ground-exit');
    if(routeCache.has(key))return routeCache.get(key);
    if(!nodes.has(start))return null;
    const q=new Set([start]),dist=new Map([[start,0]]),previous=new Map();let result=null;
    while(q.size){
      let id=null;for(const n of q)if(id===null||dist.get(n)<dist.get(id))id=n;
      q.delete(id);
      if(destination?id===destination:networkExits.has(id)){
        const path=[id];while(previous.has(path[0]))path.unshift(previous.get(path[0]));
        result=path.map(k=>nodes.get(k));break;
      }
      for(const [next,cost] of links.get(id)){const d=dist.get(id)+cost;if(d<(dist.get(next)??Infinity)){dist.set(next,d);previous.set(next,id);q.add(next);}}
    }
    routeCache.set(key,result);return result;
  }
  function discharge(start){return networkPath(start);}
  function compactPath(points) {
    return points.filter((p,i)=>!i||p.nodeId!==points[i-1].nodeId);
  }
  function optionPath(g,o){
    const origin=nodes.get(KEY(g.tower,g.floor,g.start));
    let connector=[origin];
    if(o.via){
      const target=nodes.get(KEY(g.tower,o.roof?13:g.floor,o.end));
      const corner=o.via.map(([x,y],i)=>point(g.tower,o.roof?13:Number(g.floor),x,y,`${g.id}/${o.id}/${i}`,{roof:!!o.roof,kind:o.roof?'roof':'corridor'}));
      connector=[origin,...corner,target];
      for(let i=1;i<connector.length;i++){
        if(!covered(connector[i-1],connector[i],o.roof?roofGeometry:geometry)||hitsRestriction(connector[i-1],connector[i]))return null;
      }
    }
    for(const [f,place] of o.checkpoints||o.after||[]){
      const leg=networkPath(connector.at(-1).nodeId,KEY(g.tower,f,place));
      if(!leg)return null;
      connector.push(...leg.slice(1));
    }
    const tail=discharge(connector.at(-1).nodeId);if(!tail)return null;
    return compactPath([...connector,...tail.slice(1)]);
  }
  const candidates=new Map();
  for(const g of groupDefinitions)for(const o of g.options)candidates.set(o.id,optionPath(g,o));
  const occupants=[],regularPaths=new Map(),fleetUsed=new Map();
  function person(kind,groupId,tower,level,start,homeUnit){
    const ordinal=occupants.length,id='P'+pad(ordinal+1),key=tower+pad(level);
    if(!fleetUsed.has(key))fleetUsed.set(key,new Set());
    const used=fleetUsed.get(key),slots=Array.from({length:12},(_,i)=>i);
    const preferred=homeUnit?slots.filter(i=>Math.floor(i/2)+1===homeUnit):[];
    const index=[...preferred,...slots].find(i=>!used.has(i));
    if(index===undefined)throw new Error('More occupied masks than the floor inventory');
    used.add(index);
    const p={id,kind,mode:kind==='regular'?'auto':'manual',groupId,tower,floor:pad(level),start,ordinal,deviceId:key+pad(1+Math.floor(index/2))+(1+index%2)};
    occupants.push(p);return p;
  }
  const autoFloors={E:[2,3,4,5,6,7,8,9,10,11,12,5],W:[1,2,3,4,5,6,7,8,9,10,11,12]};
  const starts=['mid-hall','east-south','north-02','south-05','west-south','north-01','east-hall','mid-east','central-junction','south-06','north-04','mid-west'];
  function autoPerson(tower,f,place,useHomeUnit=false){
    const id=KEY(tower,f,place);
    const unit=place==='north-lift'?3:Number(place.match(/^(?:north|south)-(\d+)$/)?.[1])||null;
    const p=person('regular',tower==='E'?'regular-east':'regular-west',tower,f,id,useHomeUnit?unit:null);
    const path=discharge(id);if(!path)throw new Error('Missing initial simulated egress route: '+id);
    const approach=layout.flatApproaches[place];
    const insideFlat=approach?approach.slice(0,-1).map(([x,y],n)=>point(tower,f,x,y,p.id+':flat:'+n,{kind:'flat'})):[];
    regularPaths.set(p.id,[...insideFlat,...path]);
  }
  function addParty(g){
    for(let i=0;i<g.count;i++)person('assisted',g.id,g.tower,Number(g.floor),KEY(g.tower,g.floor,g.start));
  }
  // P01–P32 and their mask serials predate the expanded drill. Keep them
  // stable so a saved operator release still refers to the same residents.
  for(const [t,levels] of Object.entries(autoFloors))levels.forEach((f,i)=>autoPerson(t,f,starts[(i+(t==='W'?3:0))%starts.length]));
  groupDefinitions.slice(0,3).forEach(addParty);
  const households={
    E:[[1,'north-01'],[1,'central-lobby'],[3,'south-06'],[4,'north-02'],[4,'south-05'],[5,'central-entry'],
      [6,'north-04'],[6,'north-04'],[8,'south-05'],[9,'north-02'],[11,'south-06'],[12,'central-entry']],
    W:[[1,'north-02'],[2,'south-05'],[2,'south-06'],[3,'north-04'],[4,'north-01'],[5,'north-02'],
      [7,'south-05'],[8,'north-04'],[9,'central-entry'],[10,'north-02'],[10,'north-02'],[12,'south-06']]
  };
  for(const [tower,levels] of Object.entries(households))for(const [f,place] of levels)autoPerson(tower,f,place,true);
  groupDefinitions.slice(3).forEach(addParty);
  const partyMembers = g=>occupants.filter(p=>p.groupId===g.id);
  const startPoint = p=>{
    const o=p.kind==='regular'?regularPaths.get(p.id)[0]:nodes.get(p.start),i=p.ordinal;
    const dx=(i%3-1)*2.05,dy=((i*7)%5-2)*1.20;
    let scale=1,pos;
    do{pos={...o,x:o.x+dx*scale,y:o.y+dy*scale,nodeId:p.id+'-origin'};scale*=.5;}
    while(o.kind!=='flat'&&!covered(pos,o,o.roof?roofGeometry:geometry)&&scale>.01);
    return pos;
  };
  function preparePath(path,p,origin){
    const last=path[path.length-1],i=p.ordinal;
    const side=last.x<100?-1:1;
    const final={...last,x:last.x+side*(6+(i%4)*2.1),y:199+((i*5)%13),kind:'assembly',nodeId:'assembly-'+p.id};
    return [origin,...path,final].filter((v,i,all)=>!i||planar(v,all[i-1])>.00001||Math.abs(v.level-all[i-1].level)>.00001);
  }
  function duration(a,b,p){
    const speed=20+(p.ordinal*7%13);
    return Math.max(.02,Math.hypot(planar(a,b),58*(a.level-b.level))/((a.stair||b.stair)?speed*.83:speed));
  }
  function trajectory(path,p){
    const times=[0];for(let i=1;i<path.length;i++)times.push(times.at(-1)+duration(path[i-1],path[i],p));
    return {path,times,total:times.at(-1)};
  }
  const regularMotion=new Map();
  for(const p of occupants)if(p.kind==='regular') regularMotion.set(p.id,trajectory(preparePath(regularPaths.get(p.id),p,startPoint(p)),p));
  const personLookup=new Map(occupants.flatMap(p=>[[p.id,p],[p.deviceId,p],['EG-'+p.deviceId,p]]));
  function atTime(track,t){
    const {path,times,total}=track;
    if(t<=0)return {...path[0],progress:0,segment:0,status:'waiting'};
    if(t>=total)return {...path.at(-1),progress:1,segment:path.length-1,status:'arrived'};
    let i=0;while(times[i+1]<=t)i++;
    const a=path[i],b=path[i+1],u=(t-times[i])/(times[i+1]-times[i]);
    const level=a.level+(b.level-a.level)*u;
    return {...a,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,level,floor:layout.floorCode(level),
      roof:a.roof&&level>=12.999,outside:(a.outside||a.kind==='exit-portal')&&b.outside,progress:t/total,segment:i,status:'moving'};
  }
  function initial(){
    const groups={};for(const g of groupDefinitions)groups[g.id]={crewRequested:false,waitingVerified:false,verifiedOptionId:null,blockedOptions:[],originalBlocked:true,blockedReported:false,release:null,holds:{},log:[],events:[],releases:{},holdRecords:{},holdKey:null};
    return {version:VERSION,time:0,playing:true,selectedGroupId:null,groups};
  }
  function create(options={}){
    const guided=options.guidedExample===true,wall=options.now||(()=>Date.now());let storage=guided?null:options.storage;
    if(storage===undefined){try{storage=host.localStorage;}catch(_){storage=null;}}
    const storeKey=options.storageKey||'escape-guard:v153:evacuation:01';
    let state=initial(),needsInitialRelease=true;
    if(storage){try{
      const raw=JSON.parse(storage.getItem(storeKey)||'null'),legacy=raw?.version===LEGACY_VERSION;
      const expected=legacy?groupDefinitions.slice(0,3):groupDefinitions;
      if((legacy||raw?.version===VERSION)&&Number.isFinite(raw.time)&&expected.every(g=>{
        const st=raw.groups?.[g.id];return Array.isArray(st?.events)&&st.releases&&st.holdRecords;
      })){
        state={...state,...raw,version:VERSION,groups:{...state.groups,...raw.groups}};
        for(const st of Object.values(state.groups)){st.release=st.releases[st.releaseKey]||null;st.holds=st.holdRecords[st.holdKey]||{};}
        needsInitialRelease=legacy;
      }
    }catch(_){/* A private-window drill still runs. */}}
    let reference=wall(),lastSave=state.time,lastSignature=null,seeding=false;
    const listeners=new Set(),tracks=new Map();
    const clock=()=>state.time+(state.playing?Math.max(0,wall()-reference)/1000:0);
    function persist(){
      if(!guided&&host.EscapeConsoleReset?.isResetting)return;
      const t=clock();if(storage){try{
        const groups={};for(const [id,st] of Object.entries(state.groups)){const {release,holds,...records}=st;groups[id]={...records,releaseKey:release?.key||null};}
        storage.setItem(storeKey,JSON.stringify({...state,time:t,groups}));
      }catch(_){storage=null;}}
      lastSave=t;
    }
    function getTrack(p,r){
      if(!r||!r.paths[p.id])return null;
      const key=r.key+'|'+p.id;if(!tracks.has(key))tracks.set(key,trajectory(r.paths[p.id],p));return tracks.get(key);
    }
    function groupAt(st,t){
      const events=st.events;
      if(!events.length||t>=events.at(-1).at)return st;
      let event=null;for(const item of events){if(item.at>t)break;event=item;}
      return {crewRequested:event?.crewRequested||false,waitingVerified:event?.waitingVerified||false,verifiedOptionId:event?.verifiedOptionId||null,
        blockedOptions:event?.blockedOptions||[],originalBlocked:true,blockedReported:event?.blockedReported||false,release:st.releases[event?.releaseKey]||null,
        holds:st.holdRecords[event?.holdKey]||{},log:st.log.filter(e=>e.time<=t),events,releases:st.releases};
    }
    function record(st,t){
      if(st.release)st.releases[st.release.key]=st.release;
      const event={at:t,crewRequested:st.crewRequested,waitingVerified:st.waitingVerified,verifiedOptionId:st.verifiedOptionId,blockedOptions:[...st.blockedOptions],
        blockedReported:st.blockedReported,releaseKey:st.release?.key||null,holdKey:st.holdKey};
      st.events.push(event);
    }
    function motionAt(p,t){
      if(p.kind==='regular')return {track:regularMotion.get(p.id),start:(p.ordinal*17)%12-9,key:'auto-'+p.id,source:'automatic',hold:null};
      const st=groupAt(state.groups[p.groupId],t),hold=st.holds[p.id];let r=st.release;
      if(hold?.arrived&&!r?.paths[p.id]){
        r=Object.values(st.releases).filter(v=>v.at<=t&&v.paths[p.id]).at(-1);
      }
      const track=getTrack(p,r);
      return {track,start:track?r.at+(r.delays[p.id]||0):null,key:track?r.key+'-'+p.id:'hold-'+p.id,source:track?'manual':'pending',hold};
    }
    function readPerson(p,t){
      const motion=motionAt(p,t),tr=motion.track,hold=motion.hold;
      const pt=tr?atTime(tr,t-motion.start):hold?{...hold.point,status:hold.arrived?'arrived':'waiting',progress:hold.arrived?1:0,segment:0}:{...startPoint(p),status:'waiting',progress:0,segment:0};
      const path=tr?tr.path:[pt];
      return {...p,...pt,kind:p.kind,waypointKind:pt.kind,space:pt.kind,path,pathId:motion.key,source:motion.source,
        trail:tr?[...path.slice(0,pt.segment),{...pt}]:[pt],role:p.kind};
    }
    function routeForPerson(id,t=clock()){
      const p=personLookup.get(id);if(!p)return null;const m=motionAt(p,t),tr=m.track;
      const portal=tr?.path.find(n=>n.kind==='exit-portal'),exitId=portal?.exitId||tr?.path.at(-1)?.exitId||null;
      const xy=exitId?layout.stairs[exitId].exteriorDoor:null;
      const exit=xy?{id:exitId,label:'Ground exit '+exitId,labelZh:'地面出口 '+exitId,tower:p.tower,floor:'01',level:1,x:xy[0],y:xy[1],nodeId:`${p.tower}:grade-${exitId}-5`}:null;
      return {personId:p.id,deviceId:p.deviceId,tower:p.tower,groupId:p.groupId,source:m.source,routeId:m.key,status:tr?'available':'pending',points:tr?.path||[],timings:tr?.times||[],
        startTime:m.start,duration:tr?.total||0,endTime:tr?m.start+tr.total:null,exitId,exitLabel:exit?.label||null,exit,destination:tr?.path.at(-1)||null};
    }
    function readGroups(people,t){return groupDefinitions.map(g=>{
      const st=groupAt(state.groups[g.id],t),members=people.filter(p=>p.groupId===g.id),origin=nodes.get(KEY(g.tower,g.floor,g.start));
      const arrivedCount=members.filter(p=>p.status==='arrived').length;
      const status=arrivedCount===g.count?'arrived':st.release?'moving':st.verifiedOptionId?'verified':st.waitingVerified?'waiting':'priority';
      const priority=!['moving','arrived'].includes(status);
      const at=st.release||Object.keys(st.holds).length?members.find(p=>p.status!=='arrived')||members[0]:origin;
      const [holdingPointLabel,holdingPointLabelZh]=holdingPoints[g.id];
      const holdingPointAvailable=members.filter(p=>p.status!=='arrived').every(p=>p.tower===origin.tower&&p.floor===origin.floor&&p.roof===origin.roof&&planar(p,origin)<=12);
      const options=g.options.map(o=>({id:o.id,kind:o.kind,label:o.label,labelZh:o.labelZh,available:!st.blockedOptions.includes(o.id)&&!!candidates.get(o.id),blocked:st.blockedOptions.includes(o.id)}));
      return {id:g.id,label:g.label,labelZh:g.labelZh,location:g.location,locationZh:g.locationZh,tower:at.tower,floor:at.floor,level:at.level,x:at.x,y:at.y,roof:at.roof,
        origin:{...origin},holdingPoint:{...origin,label:holdingPointLabel,labelZh:holdingPointLabelZh},holdingPointLabel,holdingPointLabelZh,holdingPointAvailable,
        count:g.count,size:g.count,members:members.map(p=>p.id),arrivedCount,priority,needsAttention:priority,status,options,
        crewRequested:st.crewRequested,waitingVerified:st.waitingVerified,originalBlocked:st.originalBlocked,blockedReported:st.blockedReported,
        verifiedOptionId:st.verifiedOptionId,releaseOptionId:st.release?.optionId||null,log:st.log.slice()};
    });}
    function read(t){
      const time=Number.isFinite(t)?t:clock(),people=occupants.map(p=>readPerson(p,time)),groups=readGroups(people,time);
      const assisted=people.filter(p=>p.kind==='assisted'),priorityIds=new Set(groups.filter(g=>g.priority).map(g=>g.id));
      const autoArrived=people.filter(p=>p.kind==='regular'&&p.status==='arrived').length,manualArrived=assisted.filter(p=>p.status==='arrived').length;
      const needsAssistance=assisted.filter(p=>priorityIds.has(p.groupId)&&p.status!=='arrived').length;
      const counts={total:people.length,registeredMasks:288,regular:people.length-assisted.length,assisted:assisted.length,autoAssigned:people.length-assisted.length,
        manualGuided:assisted.length-needsAssistance,needsAssistance,priorityPeople:needsAssistance,priorityGroups:priorityIds.size,autoArrived,manualArrived,arrived:autoArrived+manualArrived,
        moving:people.filter(p=>p.status==='moving').length,waiting:people.filter(p=>p.status==='waiting').length};
      return {time,playing:state.playing,simulation:true,example:guided?'guided':null,people,groups,counts,selectedGroupId:state.selectedGroupId,hazards:incidents};
    }
    function notify(s){for(const fn of listeners)fn(s);}
    const signature=s=>[s.counts.arrived,...s.groups.map(g=>g.status+'/'+g.arrivedCount)].join('|');
    function changed(){if(!seeding)persist();const s=read();lastSignature=signature(s);if(!seeding)notify(s);return s;}
    function routeFromHold(p,g,o,hold){
      const primary=candidates.get(o.id);if(!primary)return null;
      if(!hold)return preparePath(primary,p,startPoint(p));
      if(hold.arrived)return null;
      if(!hold.segmentEnds?.length)return preparePath(primary,p,hold.point);
      // Resume from the person's actual interpolated position, through one of the adjacent accepted waypoints.
      const adjacent=hold.segmentEnds.slice().reverse();
      for(const edgePoint of adjacent){
        const cut=primary.findIndex(n=>n.nodeId===edgePoint.nodeId);
        if(cut>=0)return preparePath(primary.slice(cut),p,hold.point);
      }
      for(const edgePoint of adjacent){
        if(!nodes.has(edgePoint.nodeId))continue;
        // Preserve the explicitly chosen stair/exit from the current position.
        // Checkpoints above the group have already been passed.
        const checkpoints=(o.checkpoints||o.after||[]).filter(([f])=>f<=hold.point.level);
        const ids=checkpoints.map(([f,id])=>KEY(g.tower,f,id));
        ids.push(primary.at(-1).nodeId);
        const route=[edgePoint];
        for(const id of ids){
          const leg=networkPath(route.at(-1).nodeId,id);
          if(!leg){route.length=0;break;}
          route.push(...leg.slice(1));
        }
        if(route.length)return preparePath(route,p,hold.point);
      }
      // On an interrupted temporary passage its already-traversed part provides a contiguous return to its origin.
      if(hold.returnToOrigin?.length){return preparePath([...hold.returnToOrigin,...primary],p,hold.point);}
      return null;
    }
    // Return only the untravelled portion of a released route. A closure behind
    // a group must not withdraw the instructions it still needs ahead.
    function partyPaths(g,option,t){
      const st=state.groups[g.id],paths=[];
      for(const p of partyMembers(g)){
        const live=readPerson(p,t);
        if(live.status==='arrived')continue;
        if(st.release?.optionId===option.id){
          const {tower,floor,level,x,y,nodeId,stair,exitId,roof,outside,waypointKind}=live;
          paths.push({personId:p.id,points:[{tower,floor,level,x,y,nodeId,stair,exitId,roof,outside,kind:waypointKind},...live.path.slice(live.segment+1)]});
        }else{
          const points=routeFromHold(p,g,option,st.holds[p.id]);
          if(!points?.length||!points.at(-1).outside||points.at(-1).level!==1)return null;
          paths.push({personId:p.id,points});
        }
      }
      return paths;
    }
    function remainingPaths(groupId,optionId){
      const g=byGroup.get(groupId),st=state.groups[groupId];
      const option=g?.options.find(o=>o.id===optionId);
      if(!option||!st)return [];
      return (partyPaths(g,option,clock())||[]).map(p=>p.points);
    }
    function previewRoute(groupId,optionId,t=clock()){
      const g=byGroup.get(groupId);if(!g)return {ok:false,code:'unknown-group'};
      const option=g.options.find(o=>o.id===optionId);if(!option)return {ok:false,code:'unknown-option'};
      const st=state.groups[groupId];
      if(st.release&&st.release.optionId!==optionId)return {ok:false,code:'already-moving'};
      if(st.blockedOptions.includes(optionId)||!candidates.get(optionId))return {ok:false,code:'no-route'};
      const paths=partyPaths(g,option,t);
      if(!paths)return {ok:false,code:'no-route'};
      if(!paths.length)return {ok:false,code:'already-arrived'};
      if(!seeding&&paths.some(p=>host.EscapeRouteGuard?.conflict(p.points)))return {ok:false,code:'no-route'};
      return {ok:true,paths,tower:g.tower,floor:paths[0].points[0].floor};
    }
    function captureGroup(g,t){
      const st=state.groups[g.id],holds={};
      for(const p of partyMembers(g)){
        const live=readPerson(p,t),path=live.path,i=live.segment;
        const {x,y,level,floor,roof,outside,tower,nodeId,waypointKind,stair,exitId}=live;
        holds[p.id]={point:{x,y,level,floor,roof,outside,tower,nodeId,kind:waypointKind,stair,exitId},arrived:live.status==='arrived',
          segmentEnds:[path[i],path[i+1]].filter(Boolean),returnToOrigin:path.slice(0,i+1).reverse()};
      }
      st.holdKey='hold-'+st.events.length+'-'+t;st.holdRecords[st.holdKey]=holds;st.holds=holds;st.release=null;st.verifiedOptionId=null;
    }
    function act(groupId,type,data={}){
      const g=byGroup.get(groupId),st=state.groups[groupId];const no=code=>({ok:false,code,snapshot:read()});
      if(!g||!st)return no('unknown-group');const t=clock(),current=read(t).groups.find(x=>x.id===groupId);
      if(current.status==='arrived')return no('already-arrived');
      const option=g.options.find(o=>o.id===data.optionId);
      if(type==='requestCrew'){
        if(st.crewRequested)return {ok:true,code:'already-requested',snapshot:read()};st.crewRequested=true;
      }
      else if(type==='wait'){
        if(data.confirmed!==true)return no('confirmation-required');
        if(st.release)return no('already-moving');if(!current.holdingPointAvailable)return no('outside-designated-hold');st.waitingVerified=true;st.verifiedOptionId=null;
      }else if(type==='withdrawAccess'){
        if(!option||(!st.release&&!st.verifiedOptionId))return no('no-active-route');
        if(st.release?.optionId===option.id)captureGroup(g,t);
        else if(st.verifiedOptionId!==option.id)return no('no-active-route');
        st.verifiedOptionId=null;
      }else if(type==='blocked'){
        if(data.confirmed!==true)return no('confirmation-required');
        if(data.optionId&&!option)return no('unknown-option');
        st.blockedReported=true;
        if(option){
          if(st.release?.optionId===option.id)captureGroup(g,t);
          if(st.verifiedOptionId===option.id)st.verifiedOptionId=null;
          if(!st.blockedOptions.includes(option.id))st.blockedOptions.push(option.id);
        }else if(!st.release){st.verifiedOptionId=null;}
      }else if(type==='verify'||type==='publish'){
        if(st.release)return no('already-moving');if(!option)return no('unknown-option');
        if(type==='verify'&&data.confirmed!==true)return no('confirmation-required');
        if(st.blockedOptions.includes(option.id)||!candidates.get(option.id))return no('no-route');
        const preview=previewRoute(groupId,option.id,t);if(!preview.ok)return no(preview.code);
        if(type==='verify')st.verifiedOptionId=option.id;
        else{
          if(st.verifiedOptionId!==option.id)return no('verification-required');
          const paths={},delays={};
          preview.paths.forEach(({personId,points},i)=>{paths[personId]=points;delays[personId]=i*.76;});
          st.release={optionId:option.id,key:groupId+'-'+option.id+'-'+t.toFixed(3)+'-'+st.log.length,at:t,paths,delays};
        }
      }else return no('unknown-action');
      st.log.push({action:type,optionId:data.optionId||null,time:t,...(t<0?{preSession:true}:{})});record(st,t);
      return {ok:true,code:'ok',snapshot:changed()};
    }
    function seedTransfer(){
      const resumeTime=state.time,wasPlaying=state.playing;
      state.playing=false;seeding=true;
      state.time=-7;
      const checked=act('east-transfer','verify',{optionId:'b-to-a-f04',confirmed:true});
      state.time=-4;
      if(!checked.ok||!act('east-transfer','publish',{optionId:'b-to-a-f04'}).ok)throw new Error('Missing initial B–F04–A transfer');
      state.time=resumeTime;state.playing=wasPlaying;reference=wall();seeding=false;
    }
    function startExample(){
      if(!guided)return;seeding=true;state.playing=false;state.time=0;
      const checked=act('roof-east','verify',{optionId:'west-roof-link',confirmed:true});
      if(!checked.ok||!act('roof-east','publish',{optionId:'west-roof-link'}).ok)throw new Error('Guided example route is unavailable');
      state.time=5;reference=wall();state.playing=true;seeding=false;
    }
    if(needsInitialRelease)seedTransfer();
    startExample();
    return {snapshot:()=>read(),routeForPerson,remainingPaths,
      previewRoute(groupId,optionId){
        const result=previewRoute(groupId,optionId);
        if(!result.ok)return result;
        // A UI renderer may interpolate or annotate its points. Keep its copy
        // independent of both the physical graph and an already issued route.
        return {...result,paths:result.paths.map(row=>({...row,points:row.points.map(p=>({...p}))}))};
      },
      personAt(id,t=clock()){const p=personLookup.get(id);return p?readPerson(p,t):null;},
      listPeople(){return occupants.map(p=>({...p,initial:startPoint(p)}));},sample(t){const s=read(t);if(!Number.isFinite(t)){const sig=signature(s);if(sig!==lastSignature){lastSignature=sig;notify(s);}if(s.time-lastSave>=12)persist();}return s;},
      select(id){if(id!==null&&!byGroup.has(id))return {ok:false,code:'unknown-group',snapshot:read()};if(id===state.selectedGroupId)return {ok:true,code:'ok',snapshot:read()};state.selectedGroupId=id;return {ok:true,code:'ok',snapshot:changed()};},act,
      subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
      reset(){state=initial();reference=wall();lastSave=0;tracks.clear();seedTransfer();startExample();return changed();},
      pause(){state.time=clock();reference=wall();state.playing=false;return changed();},
      play(){if(!state.playing){reference=wall();state.playing=true;}return changed();},save:persist};
  }
  const example=new URLSearchParams(host.location?.search||'').get('example')==='guided';
  const shared=create({guidedExample:example});host.EscapeEvacuation={create,shared};
  if(host.addEventListener)host.addEventListener('pagehide',()=>shared.save());
  if(typeof module!=='undefined'&&module.exports)module.exports={create,shared};
})(typeof window==='undefined'?globalThis:window);
