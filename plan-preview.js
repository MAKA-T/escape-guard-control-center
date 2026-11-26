// Candidate geometry is transient. Publishing and validating a route belong to the duty desk.
(() => {
  let current=null;
  const floorName=(n,zh)=>n===13?(zh?"天台":"Roof"):n===1?(zh?"地面":"Ground"):"F"+String(Math.round(n)).padStart(2,"0");
  const towerName=(t,zh)=>t==="E"?(zh?"東座":"East"):(zh?"西座":"West");
  const pair=(en,zh)=>({en,zh});
  function clear(){
    if(!current)return;
    current=null;
    window.dispatchEvent(new CustomEvent("escape-plan-preview",{detail:null}));
  }
  function floorCandidate(req){
    const s=req.snapshot,d=s?.draft;
    if(!d||!["draft","reviewed"].includes(d.status)||d.revision!==s.revision)return {ok:false,reason:"stale-draft"};
    const route=d.routes.find(r=>req.deviceId?r.deviceId===req.deviceId:r.status==="routed");
    const exit=s.exits.find(e=>e.active&&e.id===route?.exitId);
    if(!exit||route.status!=="routed")return {ok:false,reason:"no-route"};
    const nodes=route.nodeIds.map(id=>s.nodes.find(n=>n.id===id));
    if(!nodes.length||nodes.some(n=>!n)||exit.nodeId!==nodes.at(-1).id)return {ok:false,reason:"no-route"};
    for(let i=1;i<nodes.length;i++){
      const a=nodes[i-1].id,b=nodes[i].id;
      if(!s.edges.some(e=>!e.closed&&!e.blocked&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a))))return {ok:false,reason:"no-route"};
    }
    const points=nodes.map(n=>({x:n.x,y:n.y,tower:req.tower,level:Number(req.floor)}));
    const name=exit.custom?pair(exit.label,exit.label):pair("Stair "+exit.id+" entrance",exit.id+" 梯入口");
    return {ok:true,tower:req.tower,floor:req.floor,paths:[{personId:route.deviceId,points}],endName:name};
  }
  function routeProfile(path,plan){
    const pts=path.points,first=pts[0],legs=window.EscapeFlowView.landingSequence(pts);
    const portal=pts.find(p=>p.kind==="exit-portal")||pts.at(-1);
    const origin=pair(towerName(first.tower,false)+" · "+floorName(first.level,false),towerName(first.tower,true)+" "+floorName(first.level,true));
    const exit=plan.endName||pair("Ground exit "+portal.exitId,"地面出口 "+portal.exitId);
    const transfers=legs.slice(1).filter((x,i)=>x.id!==legs[i].id);
    const via=(zh)=>legs.map((leg,i)=>i===0?(zh?leg.id+" 梯":"Stair "+leg.id):
      floorName(leg.fromLevel,zh)+(zh?" 轉 "+leg.id+" 梯":" transfer to "+leg.id)).join(" → ");
    const descent=Math.round(legs.reduce((sum,leg)=>sum+leg.fromLevel-leg.toLevel,0)*10)/10;
    const changes=transfers.length;
    const profile=pair(descent+" levels down · "+(changes===0?"no stair change":changes+" stair "+(changes===1?"change":"changes")),
      "下降 "+descent+" 層 · "+(changes===0?"全程同一樓梯":"換梯 "+changes+" 次"));
    return {origin,exit,via:pair(via(false),via(true)),profile,transfers,portal,first};
  }
  function show(req){
    const result=req.kind==="group"?window.EscapeEvacuation.shared.previewRoute(req.groupId,req.optionId):floorCandidate(req);
    if(!result.ok||!result.paths?.length){clear();return {ok:false,reason:result.code||result.reason||"no-route"}}
    const profiles=result.paths.map(path=>routeProfile(path,result)),first=profiles[0];
    const join=(key,lang)=>[...new Set(profiles.map(p=>p[key][lang]).filter(Boolean))].join(lang==="zh"?"、":" / ");
    const description=lang=>[...new Set(profiles.map(p=>[p.origin[lang],p.via[lang],p.exit[lang]].filter(Boolean).join(" → ")))].join(" / ");
    const anchors=[{type:"start",point:first.first,label:first.origin}];
    for(const profile of profiles){
      for(const leg of profile.transfers)anchors.push({type:"transfer",point:leg.anchor,label:pair(floorName(leg.fromLevel,false)+" · Change to "+leg.id,floorName(leg.fromLevel,true)+" 轉 "+leg.id+" 梯")});
      anchors.push({type:"end",point:profile.portal,label:profile.exit});
    }
    const seen=new Set();
    current={ok:true,kind:req.kind,groupId:req.groupId,optionId:req.optionId,deviceId:req.deviceId,tower:result.tower,floor:result.floor,
      paths:result.paths,peopleCount:result.paths.length,descriptionEn:description("en"),descriptionZh:description("zh"),
      originEn:join("origin","en"),originZh:join("origin","zh"),transferEn:join("via","en"),transferZh:join("via","zh"),
      profileEn:join("profile","en"),profileZh:join("profile","zh"),
      exitEn:join("exit","en"),exitZh:join("exit","zh"),
      anchors:anchors.filter(a=>{const k=[a.type,a.point.tower,a.label.en].join("|");if(seen.has(k))return false;seen.add(k);return true})};
    window.dispatchEvent(new CustomEvent("escape-plan-preview",{detail:current}));
    return current;
  }
  function draw(three,plan,project,group,keep,callout,zh){
    const pieces=[],seen=new Set(),up=new three.Vector3(0,1,0),delta=new three.Vector3();
    const unit=.52,gap=.19;
    for(const {points} of plan.paths){
      let phase=0;
      for(let i=1;i<points.length;i++){
        const a=project(points[i-1]),b=project(points[i]);
        if(!a||!b)continue;
        const distance=a.distanceTo(b);
        if(distance<.0001)continue;
        const key=[a.toArray().join(","),b.toArray().join(",")].sort().join("|");
        if(!seen.has(key)){
          seen.add(key);
          for(let pos=-phase;pos<distance;pos+=unit+gap){
            const from=Math.max(0,pos),to=Math.min(distance,pos+unit);
            if(to<=from)continue;
            const start=a.clone().lerp(b,from/distance),end=a.clone().lerp(b,to/distance);
            const direction=delta.subVectors(end,start).normalize();
            pieces.push(new three.Matrix4().compose(start.lerp(end,.5),new three.Quaternion().setFromUnitVectors(up,direction),new three.Vector3(.058,to-from,.058)));
          }
        }
        phase=(phase+distance)%(unit+gap);
      }
    }
    if(pieces.length){
      const geom=keep(new three.CylinderGeometry(1,1,1,6));
      const mat=keep(new three.MeshBasicMaterial({color:0x694aa9,depthTest:false,depthWrite:false,transparent:true,opacity:.96}));
      const mesh=new three.InstancedMesh(geom,mat,pieces.length);
      pieces.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.renderOrder=200;mesh.frustumCulled=false;
      group.add(mesh);keep(mesh);
    }
    for(const a of plan.anchors){
      const pos=project(a.point);if(!pos)continue;
      const label=callout(pos,zh?a.label.zh:a.label.en,a.type==="start"?"origin":a.type==="end"?"exit":"stair",{category:"manual",side:a.type==="transfer"?-1:1});
      label.classList.add("preview-anchor");label.dataset.previewAnchor=a.type;
    }
  }
  window.EscapePlanPreview={show,clear,draw,get current(){return current}};
})();
