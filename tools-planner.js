/* Offline operator drill. All geometry is in the 720 × 315 residential plan. */
(function (root) {
  'use strict';
  const SIZE = { width: 720, height: 315 };
  const apartmentPositions = [[152,73],[216,108],[303,111],[423,111],[443,234],[224,237]];
  const observations = [[299,182],[328,155],[409,171],[454,187],[515,158]];
  // Boundaries follow the corridor and the open portions of the original wall strokes.
  const walkable = [
    [116,150,133,165], [132,150,581,193], [580,151,600,171],
    [294,192,361,249], [311,247,328,267],
    [155,139,169,151], [255,139,273,151], [321,139,338,151], [476,139,496,151],
    [204,192,218,209], [442,192,458,209]
  ];
  const d4Zone = [[504,132],[578,132],[612,126],[612,203],[569,216],[505,202]];
  const trunk = [
    ['west-stair',119,'Stair A'],['west-lobby',136,'West lobby'],['west-door',162,'West junction'],
    ['west-south',211,'West south junction'],['mid-west',264,'West hall'],['mid-hall',299,'Middle hall'],
    ['central-junction',329,'Central junction'],['mid-east',366,'Middle east hall'],['east-hall',410,'East hall'],
    ['east-south',449,'East south junction'],['east-door',486,'East doorway'],['east-approach',515,'East approach'],
    ['east-watch',555,'D4 approach'],['east-lobby',584,'East lobby'],['east-stair',596,'Stair B']
  ];
  const branches = [
    ['north-01',162,141,'Northwest doorway','west-door'],['south-06',211,203,'Southwest doorway','west-south'],
    ['north-02',264,141,'North central doorway','mid-west'],['north-lift',329,141,'Lift lobby threshold','central-junction'],
    ['north-04',486,141,'Northeast doorway','east-door'],['south-05',449,203,'Southeast doorway','east-south'],
    ['central-lobby',329,215,'Central lobby','central-junction'],['central-vestibule',320,240,'Entrance vestibule','central-lobby'],
    ['central-entry',320,260,'Central entry threshold','central-vestibule']
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const between = (n,a,b) => n >= a-1e-7 && n <= b+1e-7;
  const length = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const xy = pair => ({x:pair[0],y:pair[1]});
  const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && between(p.x,0,720) && between(p.y,0,315);
  const inside = p => validPoint(p) && walkable.some(([x,y,r,b]) => between(p.x,x,r) && between(p.y,y,b));
  const cross = (p,q,r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  function project(p,a,b) {
    const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));
    return {x:a.x+t*x,y:a.y+t*y};
  }
  function intersects(a,b,c,d) {
    const ca=cross(a,b,c),da=cross(a,b,d),ac=cross(c,d,a),bc=cross(c,d,b);
    if (ca*da < 0 && ac*bc < 0) return true;
    return [[a,b,c,ca],[a,b,d,da],[c,d,a,ac],[c,d,b,bc]].some(([p,q,r,v]) => Math.abs(v)<1e-7 && between(r.x,Math.min(p.x,q.x),Math.max(p.x,q.x)) && between(r.y,Math.min(p.y,q.y),Math.max(p.y,q.y)));
  }
  function interval(a,b,rect) {
    let lo=0,hi=1;
    for (const [p,delta,min,max] of [[a.x,b.x-a.x,rect[0],rect[2]],[a.y,b.y-a.y,rect[1],rect[3]]]) {
      if (!delta) { if (!between(p,min,max)) return null; continue; }
      const left=(min-p)/delta,right=(max-p)/delta;
      lo=Math.max(lo,Math.min(left,right)); hi=Math.min(hi,Math.max(left,right));
      if(lo>hi+1e-8) return null;
    }
    return [lo,hi];
  }
  function inCorridor(a,b) {
    if (!inside(a)||!inside(b)) return false;
    let through=0;
    const ranges=walkable.map(rect=>interval(a,b,rect)).filter(Boolean).sort((u,v)=>u[0]-v[0]);
    for(const [start,end] of ranges) { if(start>through+1e-7) break; through=Math.max(through,end); }
    return through>=1-1e-7;
  }
  function inPolygon(pt,polygon) {
    let hit=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=xy(polygon[j]),b=xy(polygon[i]);
      if(length(pt,project(pt,a,b))<1e-7) return true;
      if ((a.y>pt.y)!==(b.y>pt.y) && pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
    }
    return hit;
  }
  function hitsZone(a,b,zone) {
    if(zone.type==='circle') return length(zone,project(zone,a,b))<=zone.radius;
    const poly=zone.points;
    return inPolygon(a,poly)||inPolygon(b,poly)||poly.some((p,i)=>intersects(a,b,xy(p),xy(poly[(i+1)%poly.length])));
  }
  function fold(tower,floor) {
    const t=String(tower).toUpperCase(),f=Number(floor);
    if(!['E','W'].includes(t)||!Number.isInteger(f)||f<1||f>12) throw new Error('invalid-floor');
    return [t,String(f).padStart(2,'0')];
  }
  function base(tower,floor) {
    const nodes=trunk.map(([id,x,label])=>({id,x,y:160,label,custom:false}));
    const edges=[];
    const link=(a,b)=>edges.push({id:a+'--'+b,a,b,closed:false,custom:false});
    trunk.slice(1).forEach((part,index)=>link(trunk[index][0],part[0]));
    for(const [id,x,y,label,parent] of branches) { nodes.push({id,x,y,label,custom:false}); link(parent,id); }
    const devices=Array.from({length:12},(_,i)=>{
      const unit=String(Math.floor(i/2)+1).padStart(2,'0'),slot=i%2+1,id=tower+floor+unit+slot;
      const demo=tower==='E'&&floor==='02',status=demo&&i<4?'moving':demo&&i===4?'stale':demo&&i===5?'exited':'standby';
      const [x,y]=status==='exited'?[null,null]:demo&&i<5?observations[i]:[apartmentPositions[Math.floor(i/2)][0]+(slot-1)*10,apartmentPositions[Math.floor(i/2)][1]];
      return {id,tower,floor,unit,slot,status,x,y,observedAt:status==='stale'?'14:31:42':status==='moving'?'14:32:18':null};
    });
    return {version:1,tower,floor,revision:0,nodes,edges,devices,alerts:[],draft:null,published:null,assignments:{},history:[],
      exits:[{id:'A',label:'Stair A',nodeId:'west-stair',active:true,custom:false},{id:'B',label:'Stair B',nodeId:'east-stair',active:true,custom:false}]};
  }
  function need(test,code) { if(!test) throw new Error(code); }
  function labelText(value,fallback,limit=80) { return String(value||fallback).slice(0,limit); }
  const nodeOf=(s,id)=>s.nodes.find(n=>n.id===id);
  const activeAlerts=s=>s.alerts.filter(a=>a.status!=='resolved');
  function obstruction(s,a,b,skipId) {
    if(activeAlerts(s).some(al=>hitsZone(a,b,al.zone))) return true;
    return s.edges.some(edge=>{
      if(!edge.closed||edge.id===skipId) return false;
      const start=nodeOf(s,edge.a),end=nodeOf(s,edge.b),len=length(start,end);
      // Keep junctions available to an independently checked, diverging passage.
      const trim=Math.min(.35,9/len),p={x:start.x+(end.x-start.x)*trim,y:start.y+(end.y-start.y)*trim},q={x:end.x+(start.x-end.x)*trim,y:end.y+(start.y-end.y)*trim};
      const distance=Math.min(length(p,project(p,a,b)),length(q,project(q,a,b)),length(a,project(a,p,q)),length(b,project(b,p,q)));
      return intersects(a,b,p,q)||distance<Math.min(5.0,len*.12);
    });
  }
  function edgeFlags(s,e) {
    const a=nodeOf(s,e.a),b=nodeOf(s,e.b),by=activeAlerts(s).filter(al=>hitsZone(a,b,al.zone)).map(al=>al.id);
    const parent=e.parentEdgeId&&s.edges.find(v=>v.id===e.parentEdgeId);
    return {blockedByAlert:by.length>0,alertIds:by,blocked:!!(e.closed||(parent&&parent.closed)||by.length||obstruction(s,a,b,e.id))};
  }
  function nearest(s,p,max,usable=false) {
    if(!validPoint(p)) return null;
    let found=null,distance=max;
    for(const n of s.nodes) {
      const dist=length(p,n);
      if(dist<=distance&&(!usable||(inCorridor(p,n)&&!obstruction(s,p,n)))){found=n;distance=dist;}
    }
    return found;
  }
  function nearestEdge(s,p,max,usable=false) {
    let found=null,distance=max;
    if(!validPoint(p)) return null;
    for(const e of s.edges) {
      const a=nodeOf(s,e.a),b=nodeOf(s,e.b),spot=project(p,a,b),d=length(p,spot);
      if(d<distance&&(!usable||(!edgeFlags(s,e).blocked&&inCorridor(p,spot)&&!obstruction(s,p,spot)))){found={edge:e,spot};distance=d;}
    }
    return found;
  }
  function route(s,start,preferred) {
    const exits=s.exits.filter(e=>e.active&&(!preferred||e.id===preferred)), dist=new Map(), prior=new Map();
    if(!start) return {status:'unreachable',exitId:null,nodeIds:[],distance:null};
    const adj=new Map(s.nodes.map(n=>[n.id,[]]));
    for(const e of s.edges){if(edgeFlags(s,e).blocked)continue;const a=nodeOf(s,e.a),b=nodeOf(s,e.b),cost=length(a,b);adj.get(e.a).push([e.b,cost]);adj.get(e.b).push([e.a,cost]);}
    const open=new Set([start.id]);dist.set(start.id,0);
    while(open.size){
      const id=Array.from(open).reduce((best,k)=>dist.get(k)<dist.get(best)?k:best);
      open.delete(id);
      const end=exits.find(e=>e.nodeId===id);
      if(end&&!obstruction(s,nodeOf(s,id),nodeOf(s,id))){
        const nodeIds=[id];while(prior.has(nodeIds[0]))nodeIds.unshift(prior.get(nodeIds[0]));
        return {status:'routed',exitId:end.id,nodeIds,distance:Math.round(dist.get(id)*10)/10};
      }
      for(const [next,cost] of adj.get(id)||[]){const via=dist.get(id)+cost;if(via<(dist.get(next)??Infinity)){dist.set(next,via);prior.set(next,id);open.add(next);}}
    }
    return {status:'unreachable',exitId:null,nodeIds:[],distance:null};
  }
  function stillConnected(s,assignment) {
    const end=s.exits.find(e=>e.id===assignment.exitId&&e.active);
    if(!end||!assignment.nodeIds?.length||obstruction(s,nodeOf(s,end.nodeId),nodeOf(s,end.nodeId)))return false;
    return assignment.nodeIds.slice(1).every((id,i)=>s.edges.some(e=>
      ((e.a===id&&e.b===assignment.nodeIds[i])||(e.b===id&&e.a===assignment.nodeIds[i]))&&!edgeFlags(s,e).blocked));
  }
  function invalidate(s,reason,changedDevices=[]) {
    s.revision++;
    if(s.draft){s.draft.status='stale';s.draft.staleReason=reason;}
    const held=[];
    for(const [id,r] of Object.entries(s.assignments||{})){
      if(!r.active||(!changedDevices.includes(id)&&stillConnected(s,r)))continue;
      r.active=false;r.holdReason=reason;held.push(id);
    }
    if(s.published&&held.length){
      for(const d of s.published.dispatches){if(held.includes(d.deviceId)){d.previousStatus=d.status;d.status='held';d.reason=reason;}}
      s.published.withdrawnDeviceIds=[...new Set([...(s.published.withdrawnDeviceIds||[]),...held])];
      if(s.published.dispatches.every(d=>d.status==='held'))s.published.status='held';
      s.published.holdReason=reason;
    }
  }
  function snapshot(s) {
    const out=clone(s);
    out.edges=out.edges.map(e=>({...e,...edgeFlags(s,e)}));
    out.exits=out.exits.map(e=>({...e,available:e.active&&!obstruction(s,nodeOf(s,e.nodeId),nodeOf(s,e.nodeId))}));
    out.routes=out.draft?.routes||out.published?.routes||[];out.distanceUnit='plan units';
    return out;
  }
  function create(options={}) {
    const memory=new Map(),storage=options.storage||null,prefix=options.storageKey||'escape-guard:v147:routing:1:';
    let serial=0;
    const makeId=label=>label+'-'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+(++serial).toString(36)+'-'+Math.random().toString(36).slice(2,7));
    const now=()=>typeof options.now==='function'?options.now():new Date().toISOString();
    function get(t,f){
      const [tower,floor]=fold(t,f),key=prefix+tower+floor;
        if(storage){try{const raw=storage.getItem(key);if(raw){const s=JSON.parse(raw);if(s.version===1&&s.tower===tower&&s.floor===floor){if(!s.assignments)s.assignments={};memory.set(key,s);return s;}}}catch(_){/* Memory still supports the complete drill. */}}
      if(!memory.has(key))memory.set(key,base(tower,floor));return memory.get(key);
    }
    function save(s){if(options.canWrite&&!options.canWrite())throw Error('scenario-reset');const key=prefix+s.tower+s.floor;memory.set(key,s);if(storage){try{storage.setItem(key,JSON.stringify(s));}catch(_){/* Storage may be disabled by the browser. */}}}
    function clearForReload(){
      let removed=0;
      for(const tower of ['E','W'])for(let floor=1;floor<=12;floor++){
        const key=prefix+tower+String(floor).padStart(2,'0');
        if(storage&&storage.getItem(key)!==null){storage.removeItem(key);removed++;}
      }
      memory.clear();return removed;
    }
    function pointNode(s,p,required){
      need(inside(p),'outside-walkable-area');need(!obstruction(s,p,p),'hazard-or-closed-segment');
      const snap=nearest(s,p,9,true);if(snap)return snap;
      const onEdge=nearestEdge(s,p,6,true);
      if(required&&!onEdge)throw new Error('anchor-to-corridor-node');
      const coord=onEdge?onEdge.spot:p;
      const existing=nearest(s,coord,2,true);if(existing)return existing;
      const n={id:makeId('waypoint'),label:'Verified waypoint',x:coord.x,y:coord.y,custom:true};s.nodes.push(n);
      if(onEdge){for(const id of [onEdge.edge.a,onEdge.edge.b])s.edges.push({id:makeId('link'),a:id,b:n.id,custom:true,closed:false,parentEdgeId:onEdge.edge.id});}
      return n;
    }
    function temporaryExit(s,node,label){
      need(!s.exits.some(e=>e.active&&e.nodeId===node.id),'exit-already-exists');
      const e={id:makeId('exit'),label:labelText(label,'Temporary exit'),nodeId:node.id,active:true,custom:true};s.exits.push(e);return e;
    }
    function observe(s,records){
      need(Array.isArray(records),'invalid-devices');const changed=[],moved=[];
      for(const rec of records){
        const d=s.devices.find(i=>i.id===rec.id);need(d,'device-not-on-floor');
        const status=rec.status||d.status;need(['moving','stale','standby','exited'].includes(status),'invalid-device-status');
        const x=Object.hasOwn(rec,'x')?rec.x:d.x,y=Object.hasOwn(rec,'y')?rec.y:d.y;
        need(validPoint({x,y})||((status==='exited'||status==='stale')&&x==null&&y==null),'invalid-position');
        const time=rec.observedAt??d.observedAt;
        if(d.x!==x||d.y!==y||d.status!==status)moved.push(d.id);
        if(moved.includes(d.id)||d.observedAt!==time){Object.assign(d,{x,y,status,observedAt:time});changed.push(d.id);}
      }
      if(changed.length)invalidate(s,'device-observations-changed',moved);return changed.length>0;
    }
    function buildDraft(s,data,automatic=false){
      if(data.devices)observe(s,data.devices);
      const preferred=data.preferredExitId||null,start=data.startNodeId?nodeOf(s,data.startNodeId):null;
      need(!data.startNodeId||start,'unknown-start');need(!preferred||s.exits.some(e=>e.id===preferred&&e.active),'unknown-exit');
      const requestedIds=data.devices?data.devices.map(d=>d.id):data.requestedIds||null;
      const routes=[];
      for(const d of s.devices){
        if((requestedIds&&!requestedIds.includes(d.id))||!['moving','stale'].includes(d.status))continue;
        const first=d.status==='moving'?nearest(s,d,52,true):null,r=route(s,first,preferred),last=s.assignments[d.id];
        if(last?.active&&data.includeUnchanged!==true&&r.status==='routed'&&r.exitId===last.exitId&&r.nodeIds.join('|')===last.nodeIds.join('|'))continue;
        const reason=r.status==='routed'?null:d.status==='stale'?'stale-position':!first?'unavailable-position':'no-route';
        routes.push({...r,deviceId:d.id,startNodeId:first?.id||null,reason});
      }
      need(routes.length||start,'no-affected-devices');
      const d={id:makeId('draft'),revision:s.revision,status:'draft',routes,deviceIds:routes.map(r=>r.deviceId),requestedIds,
        startNodeId:start?.id||null,preferredExitId:preferred,previewRoute:start?route(s,start,preferred):null,automatic,createdAt:now(),previousDraftId:s.draft?.id||null};
      if(s.draft){s.supersededDraftIds=[...(s.supersededDraftIds||[]),s.draft.id].slice(-32);}
      s.draft=d;return d;
    }
    function act(t,f,type,data={}){
      let current;
      try{
        current=get(t,f);if(options.canWrite&&!options.canWrite()&&type!=='refresh')return {ok:false,code:'scenario-reset',snapshot:snapshot(current)};
        let s=clone(current);let resultId=null;
        if(type==='refresh')return {ok:true,code:'refreshed',snapshot:snapshot(current)};
        if(type==='reset'){s=base(s.tower,s.floor);save(s);return {ok:true,code:'reset',snapshot:snapshot(s)};}
        if(type==='discardDraft'){
          need(s.draft&&s.draft.id===data.draftId&&s.draft.status!=='published','stale-draft');
          s.draft=null;save(s);return {ok:true,code:'discarded',snapshot:snapshot(s)};
        }
        if(typeof data.expectedRevision==='number')need(data.expectedRevision===s.revision,'revision-changed');
        if(type==='alert'){
          const n=nodeOf(s,data.nodeId);need(n,'select-node');
          const label=labelText(data.label,'Reported hazard');const isD4=/\bD4\b/i.test(label)&&data.nodeId==='east-watch';
          const a={id:makeId('alert'),nodeId:n.id,x:n.x,y:n.y,label,status:'open',source:labelText(data.source,'operator'),notes:labelText(data.notes,''),observedAt:data.observedAt||now(),zone:isD4?{type:'polygon',points:clone(d4Zone)}:{type:'circle',x:n.x,y:n.y,radius:16}};
          s.alerts.push(a);invalidate(s,'new-alert');resultId=a.id;
        }else if(type==='alertStatus'){
          const a=s.alerts.find(v=>v.id===data.alertId);need(a,'unknown-alert');need(['reviewed','resolved','open'].includes(data.status),'invalid-alert-status');
          if(a.status!==data.status){a.status=data.status;a.updatedAt=data.observedAt||now();if(data.notes)a.notes=labelText(data.notes,'');invalidate(s,'alert-updated');}resultId=a.id;
        }else if(type==='edge'){
          need(data.confirmed===true,'confirmation-required');const edge=s.edges.find(e=>e.id===data.edgeId);need(edge,'select-edge');need(typeof data.closed==='boolean','invalid-edge-status');
          if(edge.closed!==data.closed){edge.closed=data.closed;invalidate(s,edge.closed?'corridor-closed':'corridor-reopened');}resultId=edge.id;
        }else if(type==='exit'){
          need(data.confirmed===true,'confirmation-required');const node=data.nodeId?nodeOf(s,data.nodeId):pointNode(s,{x:data.x,y:data.y},true);
          need(node,'select-node');need(!obstruction(s,node,node),'hazard-or-closed-segment');const exit=temporaryExit(s,node,data.label);invalidate(s,'verified-exit-added');resultId=exit.id;
        }else if(type==='exitStatus'){
          need(data.confirmed===true,'confirmation-required');const exit=s.exits.find(e=>e.id===data.exitId);need(exit,'unknown-exit');need(typeof data.active==='boolean','invalid-exit-status');
          if(exit.active!==data.active){exit.active=data.active;invalidate(s,'exit-changed');}resultId=exit.id;
        }else if(type==='passage'){
          need(data.confirmed===true,'confirmation-required');const points=data.points;
          need(Array.isArray(points)&&points.length>=2&&points.length<=96,'need-continuous-points');
          need(points.every(inside),'outside-walkable-area');
          for(let i=1;i<points.length;i++){need(inCorridor(points[i-1],points[i]),'wall-crossing');need(!obstruction(s,points[i-1],points[i]),'hazard-or-closed-segment');}
          const verts=points.map((p,i)=>pointNode(s,p,i===0||(i===points.length-1&&!data.exit)));
          const links=[];let run=0;
          for(let i=1;i<verts.length;i++){
            const a=verts[i-1],b=verts[i];if(a.id===b.id)continue;
            need(inCorridor(a,b),'wall-crossing');need(!obstruction(s,a,b),'hazard-or-closed-segment');
            const exists=s.edges.some(e=>(e.a===a.id&&e.b===b.id)||(e.a===b.id&&e.b===a.id));
            if(!exists){const edge={id:makeId('passage'),a:a.id,b:b.id,custom:true,closed:false,label:labelText(data.label,'Verified passage')};s.edges.push(edge);links.push(edge.id);}
            run+=length(a,b);
          }
          need(run>=3,'passage-too-short');need(links.length||data.exit,'passage-already-present');
          resultId=data.exit?temporaryExit(s,verts[verts.length-1],data.label).id:links[0];invalidate(s,'verified-passage-added');
        }else if(type==='observe'){
          observe(s,data.devices);
        }else if(type==='draft'){
          resultId=buildDraft(s,data).id;
        }else if(type==='review'||type==='publish'){
          const d=s.draft;need(!(s.supersededDraftIds||[]).includes(data.draftId),'stale-draft');need(d&&data.draftId===d.id,'unknown-draft');need(d.revision===s.revision&&d.status!=='stale','stale-draft');
          need(d.routes.some(r=>r.status==='routed')||(type==='review'&&d.previewRoute?.status==='routed'),'no-available-route');
          if(type==='review'){need(data.confirmed===true,'confirmation-required');need(d.status==='draft'||d.status==='reviewed','already-published');d.status='reviewed';d.reviewedAt=now();}
          else{need(d.status==='reviewed','review-required');const sent=now();d.status='published';
            s.published={...clone(d),publishedAt:sent,status:'published',dispatches:d.routes.map(r=>({deviceId:r.deviceId,status:r.status==='routed'?'sent':'held',reason:r.reason,acknowledgedAt:null}))};
            for(const r of d.routes){s.assignments[r.deviceId]={...clone(r),active:r.status==='routed',releaseId:d.id,issuedAt:sent,acknowledgedAt:null};}
          }
          resultId=d.id;
        }else if(type==='ack'){
          const assigned=s.assignments[data.deviceId];need(s.published&&(s.published.status==='published'||assigned?.active),'no-active-release');
          need(assigned?.active&&!assigned.acknowledgedAt&&(!data.releaseId||data.releaseId===assigned.releaseId),'receipt-unavailable');
          assigned.acknowledgedAt=now();const item=s.published.dispatches.find(d=>d.deviceId===data.deviceId);
          if(item){item.status='acknowledged';item.acknowledgedAt=assigned.acknowledgedAt;}resultId=data.deviceId;
        }else throw new Error('unknown-operation');
        if(['exit','passage','exitStatus'].includes(type)&&s.revision!==current.revision){
          const old=s.draft,preferred=old?.preferredExitId;
          buildDraft(s,{requestedIds:old?.requestedIds,startNodeId:old?.startNodeId||'central-junction',
            preferredExitId:s.exits.some(e=>e.id===preferred&&e.active)?preferred:null},true);
        }
        s.history.push({type,id:resultId,at:now(),revision:s.revision});s.history=s.history.slice(-80);save(s);return {ok:true,code:'ok',id:resultId,snapshot:snapshot(s)};
      }catch(e){return {ok:false,code:e.message,snapshot:current?snapshot(current):null};}
    }
    return {snapshot(t,f){return snapshot(get(t,f));},act,clearForReload,
      nearestNode(t,f,x,y,max=28){const item=nearest(get(t,f),{x,y},max);return item?clone(item):null;},
      nearestEdge(t,f,x,y,max=18){const found=nearestEdge(get(t,f),{x,y},max);return found?{...found.edge,...edgeFlags(get(t,f),found.edge)}:null;},
      resetAll(){for(const t of ['E','W'])for(let f=1;f<=12;f++)act(t,f,'reset');}
    };
  }
  const api={create,viewBox:SIZE,walkable:clone(walkable),restrictedSegment:obstruction};
  root.EscapeRouting=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
