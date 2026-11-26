/* First-person telemetry and published routes share the evacuation model's clock. */
(function () {
  "use strict";
  const palette = { auto: "#007665", manual: "#345DC1", pending: "#AB4B19" };
  const estateStyle = {manualPath:3.1,manualOpacity:.96,contextOpacity:.10,trail:6.4,contextTrail:1.5,contextTrailOpacity:.19,head:10.9,contextHead:4.2,arrival:6};
  const manualStyle = {manualPath:3.55,manualOpacity:.97,contextOpacity:.08,trail:8.4,contextTrail:1.4,contextTrailOpacity:.17,head:13.4,contextHead:3.8,arrival:5.8};
  const validStatus = value => Object.hasOwn(palette, value) ? value : null;
  const groupPending = person => person.kind === "assisted" && person.status === "waiting";
  function statusOf(person, route) {
    const source=route?.source||person.source;
    if (source === "automatic") return "auto";
    if (source === "manual") return "manual";
    if (source === "pending") return "pending";
    return person.kind === "regular" ? "auto" : groupPending(person) ? "pending" : "manual";
  }
  function collectTargets(records, category) {
    if (category !== "auto" && category !== "manual") return [];
    const exits = new Map();
    for (const { person, route } of records) {
      if (statusOf(person, route) !== category || !route?.exit || !route?.points.length) continue;
      const exit = route.exit;
      const key = [exit.tower,exit.id].join("/");
      if (!exits.has(key)) exits.set(key, { ...exit, level: exit.level ?? 1, personCount: 0, color: palette[category] });
      exits.get(key).personCount++;
    }
    return Array.from(exits.values());
  }
  function onFloor(person,floorScope) {
    return !person.outside && person.status!=="arrived" &&
      (!floorScope || (person.tower===floorScope.tower && person.floor===floorScope.floor));
  }
  function targetsFor(scenario, category, time, groupId, floorScope) {
    if (!category || category === "pending") return [];
    const current = scenario.sample(time);
    return collectTargets(current.people.filter(p=>(!groupId||p.groupId===groupId)&&onFloor(p,floorScope)).map(person => ({ person, route: scenario.routeForPerson?.(person.id, current.time) })), category);
  }
  function landingSequence(points) {
    const legs=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],id=a.stair||b.stair;
      if(!id||a.tower!==b.tower||a.level<b.level+.00001)continue;
      const last=legs.at(-1);
      if(last&&last.id===id&&last.tower===a.tower&&Math.abs(last.toLevel-a.level)<.001){
        last.toLevel=b.level;
      }else{
        legs.push({id,tower:a.tower,fromLevel:a.level,toLevel:b.level,anchor:{...a}});
      }
    }
    return legs;
  }
  function itinerariesFor(scenario, category="manual", time, groupId, floorScope) {
    const frame=scenario.sample(time), output=new Map();
    const groups=new Map(frame.groups.map(g=>[g.id,g]));
    for(const person of frame.people) {
      if(!onFloor(person,floorScope)||(groupId&&person.groupId!==groupId)||statusOf(person)!==category)continue;
      const route=scenario.routeForPerson(person.id,frame.time), group=groups.get(person.groupId);
      const start=route.points[0]||person;
      const origin={tower:start.tower,floor:start.floor,level:start.level,roof:!!start.roof,x:start.x,y:start.y,nodeId:start.nodeId};
      const stairs=landingSequence(route.points),exit=route.exit;
      const branchKey=[origin.tower,origin.level,...stairs.map(s=>[s.id,s.fromLevel,s.toLevel].join(".")),exit?.tower,exit?.id].join("/");
      // Automatic floor cohorts can reach different stairs. Keep their itineraries
      // separate even when both started on the same floor in the same tower.
      const key=category==="auto"?person.groupId+"/"+branchKey:person.groupId;
      if(!output.has(key)){
        const labelEn=group?.label||((person.tower==="E"?"East":"West")+" Tower · F"+origin.floor);
        const labelZh=group?.labelZh||((person.tower==="E"?"東座":"西座")+" · "+Number(origin.floor)+"樓");
        output.set(key,{key,groupId:person.groupId,labelEn,labelZh,memberCount:0,memberIds:[],origin,stairs:[],exits:[],branches:[],status:category});
      }
      const itinerary=output.get(key);
      itinerary.memberCount++;itinerary.memberIds.push(person.id);
      if(!route.points.length||!exit)continue;
      let branch=itinerary.branches.find(r=>r.key===branchKey);
      if(!branch) {
        branch={key:branchKey,origin,stairs,exit:{...exit},memberCount:0,memberIds:[]};
        itinerary.branches.push(branch);
        for(const step of stairs){
          if(!itinerary.stairs.some(s=>s.tower===step.tower&&s.id===step.id&&s.fromLevel===step.fromLevel&&s.toLevel===step.toLevel))itinerary.stairs.push(step);
        }
      }
      branch.memberCount++;branch.memberIds.push(person.id);
      let target=itinerary.exits.find(x=>x.id===exit.id&&x.tower===exit.tower);
      if(!target){target={...exit,personCount:0};itinerary.exits.push(target);}
      target.personCount++;
    }
    return Array.from(output.values());
  }

  // Draw line widths in screen pixels. Shared stair sections need only one strip,
  // even when many people were assigned to that same section.
  function segmentBatch(three, capacity, order) {
    const geom = new three.InstancedBufferGeometry();
    geom.setAttribute("position",new three.Float32BufferAttribute([0,-1,0, 0,1,0, 1,-1,0, 1,1,0],3));
    geom.setIndex([0,1,2,2,1,3]);
    let count = 0;
    const layout = { fromPoint:3, toPoint:3, ink:3, shape:4 };
    function allocate(size) {
      for (const [name,n] of Object.entries(layout)) {
        const next = new three.InstancedBufferAttribute(new Float32Array(size*n),n);
        next.setUsage(three.DynamicDrawUsage);
        if (geom.attributes[name]) next.array.set(geom.attributes[name].array);
        geom.setAttribute(name,next);
      }
      capacity = size;
    }
    allocate(capacity);
    const material = new three.ShaderMaterial({
      transparent:true, depthTest:false, depthWrite:false, side:three.DoubleSide,
      uniforms:{ frameSize:{value:new three.Vector2(1000,650)}, pixelScale:{value:1} },
      vertexShader:[
        "attribute vec3 fromPoint, toPoint, ink; attribute vec4 shape;",
        "uniform vec2 frameSize; uniform float pixelScale; varying vec3 hue; varying float alphav, lateral;",
        "void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(fromPoint,1.);",
        "vec4 b=projectionMatrix*modelViewMatrix*vec4(toPoint,1.);",
        "vec2 dir=(b.xy/b.w-a.xy/a.w)*frameSize; vec2 n=vec2(-dir.y,dir.x)/max(length(dir),.001);",
        "vec4 p=mix(a,b,position.x); float width=mix(shape.x,shape.y,position.x);",
        "p.xy+=n*position.y*width*pixelScale/frameSize*p.w; gl_Position=p;",
        "lateral=position.y;alphav=mix(shape.z,shape.w,position.x);hue=ink;}"].join("\n"),
      fragmentShader:[
        "varying vec3 hue; varying float alphav,lateral;",
        "void main(){float u=abs(lateral);float a=alphav*(1.-smoothstep(.82,1.,u));",
        "vec3 edge=mix(hue,hue*.40,smoothstep(.48,.70,u));",
        "vec3 casing=mix(edge,vec3(.965,.975,1.),.89*smoothstep(.73,.87,u));",
        "gl_FragColor=vec4(casing,a);",
        "#include <colorspace_fragment>",
        "}"].join("\n")
    });
    const mesh = new three.Mesh(geom,material);
    mesh.renderOrder=order; mesh.frustumCulled=false;
    mesh.onBeforeRender=renderer=>{
      renderer.getDrawingBufferSize(material.uniforms.frameSize.value);
      const ratio=renderer.getPixelRatio(), width=material.uniforms.frameSize.value.x/ratio;
      material.uniforms.pixelScale.value=ratio*Math.min(1,Math.max(.78,width/560));
    };
    function add(a,b,color,w0,w1,a0,a1) {
      if (!a||!b||a.distanceToSquared(b)<1e-9) return;
      if (count === capacity) allocate(capacity*2);
      const attr=geom.attributes;
      attr.fromPoint.setXYZ(count,a.x,a.y,a.z); attr.toPoint.setXYZ(count,b.x,b.y,b.z);
      attr.ink.setXYZ(count,color.r,color.g,color.b); attr.shape.setXYZW(count,w0,w1,a0,a1);
      count++;
    }
    function finish() {
      geom.instanceCount=count;
      for(const name of Object.keys(layout)) {
        const a=geom.attributes[name];
        a.clearUpdateRanges?.(); a.addUpdateRange?.(0,count*a.itemSize); a.needsUpdate=true;
      }
    }
    return { mesh,add,finish,clear(){count=0;}, get count(){return count;}, dispose(){geom.dispose(); material.dispose();} };
  }

  function personDots(three,count,density) {
    const geometry = new three.BufferGeometry();
    for (const [name,n] of Object.entries({position:3,ink:3,style:2})) {
      geometry.setAttribute(name,new three.BufferAttribute(new Float32Array(count*n),n).setUsage(three.DynamicDrawUsage));
    }
    const material=new three.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:false,uniforms:{pixelScale:{value:density||1}},
      vertexShader:[
        "attribute vec3 ink; attribute vec2 style; uniform float pixelScale; varying vec3 hue; varying float alphaV;",
        "void main(){hue=ink; alphaV=style.y; gl_PointSize=max(1.,style.x*pixelScale);",
        "gl_Position=style.x>.0 ? projectionMatrix*modelViewMatrix*vec4(position,1.) : vec4(0.,0.,2.,1.);}"].join("\n"),
      fragmentShader:[
        "varying vec3 hue; varying float alphaV;",
        "void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;",
        "vec3 body=mix(hue,vec3(.97,.98,.98),smoothstep(.64,.84,r));",
        "gl_FragColor=vec4(body,(1.-smoothstep(.83,.99,r))*alphaV);",
        "#include <colorspace_fragment>",
        "}"].join("\n")
    });
    const mesh=new three.Points(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=17;
    mesh.onBeforeRender=renderer=>{
      const ratio=renderer.getPixelRatio(), width=renderer.domElement.width/ratio;
      material.uniforms.pixelScale.value=ratio*Math.min(1,Math.max(.68,width/560));
    };
    return {mesh,set(i,p,color,size,opacity){
      const a=geometry.attributes;
      a.position.setXYZ(i,p?.x||0,p?.y||0,p?.z||0);a.ink.setXYZ(i,color.r,color.g,color.b);
      a.style.setXY(i,p?size:0,opacity);
    },finish(){for(const a of Object.values(geometry.attributes))a.needsUpdate=true;},dispose(){geometry.dispose();material.dispose();}};
  }

  // Screen-oriented chevrons inherit the projected downhill direction of their
  // physical flight, including when the operator orbits to the other side.
  function downhillMarkers(three) {
    const geometry=new three.InstancedBufferGeometry();
    geometry.setAttribute("position",new three.Float32BufferAttribute([-1,-1,0,-1,1,0,1,-1,0,1,1,0],3));
    geometry.setIndex([0,1,2,2,1,3]);
    for(const name of ["uphill","downhill","ink"]){
      geometry.setAttribute(name,new three.InstancedBufferAttribute(new Float32Array(3*96),3));
    }
    const material=new three.ShaderMaterial({
      transparent:true,depthTest:false,depthWrite:false,side:three.DoubleSide,
      uniforms:{viewport:{value:new three.Vector2()},scale:{value:1}},
      vertexShader:[
        "attribute vec3 uphill, downhill, ink; uniform vec2 viewport;uniform float scale;",
        "varying vec2 uvArrow;varying vec3 color;varying float visible;",
        "void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(uphill,1.);",
        "vec4 b=projectionMatrix*modelViewMatrix*vec4(downhill,1.);",
        "vec2 diff=(b.xy/b.w-a.xy/a.w)*viewport;float len=length(diff);",
        "vec2 d=diff/max(.001,len);vec2 ortho=vec2(-d.y,d.x);vec4 q=mix(a,b,.54);",
        "q.xy+=(position.x*d+position.y*ortho)*scale*13.8*q.w/viewport;",
        "gl_Position=q;uvArrow=position.xy;color=ink;visible=smoothstep(3.,8.,len/scale);}"].join("\n"),
      fragmentShader:[
        "varying vec2 uvArrow;varying vec3 color;varying float visible;",
        "float seg(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}",
        "void main(){vec2 p=vec2(uvArrow.x,abs(uvArrow.y));float d=seg(p,vec2(-.42,.51),vec2(.38,0.));",
        "float outer=1.-smoothstep(.23,.37,d);if(outer<.005)discard;",
        "vec3 inked=mix(color*.64,vec3(.99),smoothstep(.11,.23,d));",
        "gl_FragColor=vec4(inked,outer*visible);",
        "#include <colorspace_fragment>",
        "}"].join("\n")
    });
    const mesh=new three.Mesh(geometry,material);mesh.renderOrder=13;mesh.frustumCulled=false;
    geometry.instanceCount=0;
    mesh.onBeforeRender=renderer=>{
      renderer.getDrawingBufferSize(material.uniforms.viewport.value);
      const ratio=renderer.getPixelRatio(),w=material.uniforms.viewport.value.x/ratio;
      material.uniforms.scale.value=ratio*Math.min(1,Math.max(.72,w/530));
    };
    function set(flights,color){
      let n=0;
      for(const shaft of flights.values()){
        const byHeight=Array.from(shaft).sort((a,b)=>b[0]-a[0]);
        // One fixed cue roughly every four storeys. Adjacent heads can share
        // one cue because their published routes use the same run.
        let last=Infinity;
        for(const [level,[a,b]] of byHeight){
          if(level>last-3.9||n>=96)continue;
          const attr=geometry.attributes;
          attr.uphill.setXYZ(n,a.x,a.y,a.z);attr.downhill.setXYZ(n,b.x,b.y,b.z);
          attr.ink.setXYZ(n,color.r,color.g,color.b);
          last=level;n++;
        }
      }
      geometry.instanceCount=n;
      for(const name of ["uphill","downhill","ink"])geometry.attributes[name].needsUpdate=true;
    }
    return {mesh,set,get count(){return geometry.instanceCount;},dispose(){geometry.dispose();material.dispose();}};
  }

  function indexAt(times,value) {
    let lo=0, hi=times.length-1;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(times[mid]<=value)lo=mid;else hi=mid-1;}
    return lo;
  }
  function positionAt(path,local,dest) {
    const {durations,points}=path;
    const i=indexAt(durations,local);
    const a=points[i];
    if (!a) return null;
    if(i+1>=points.length || local<=durations[i]+.00001)return dest.copy(a);
    const b=points[i+1];
    if(!b)return null;
    const fraction=(local-durations[i])/Math.max(.00001,durations[i+1]-durations[i]);
    return dest.copy(a).lerp(b,Math.max(0,Math.min(1,fraction)));
  }
  const noRoute={source:"pending",points:[],timings:[],exit:null};
  function create(three,scenario,project,density,selectedGroup,options={}) {
    const group=new three.Group();
    const people=scenario.snapshot().people;
    const paths=segmentBatch(three,4096,10), trails=segmentBatch(three,1024,14);
    const dots=personDots(three,people.length,density), arrows=downhillMarkers(three), targetGroup=new three.Group();
    group.add(paths.mesh,trails.mesh,dots.mesh,arrows.mesh,targetGroup);
    const colors=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,new three.Color(v)]));
    const cache=new Map(),labels=[];
    let stage=validStatus(window.EscapeRouteFocus ? window.EscapeRouteFocus.status : options.filter);
    let focusGroupId=stage==="manual"?(window.EscapeRouteFocus ? window.EscapeRouteFocus.groupId||null : options.focusGroupId||null):null;
    let lastTime, records=[], targets=[], dirty=true, disposed=false;
    let visiblePeople=0, visibleTrails=0, fullPaths=0;
    const temps=[new three.Vector3(),new three.Vector3()];
    function isSubject(person,category) {
      if(stage)return category===stage&&(!focusGroupId||person.groupId===focusGroupId)&&onFloor(person,window.EscapeRouteFocus?.floorScope);
      return !!selectedGroup&&person.groupId===selectedGroup;
    }
    function getRecords(frame) {
      return frame.people.map(person=>{
        const key=[person.pathId,person.kind,person.status==="waiting",!stage||onFloor(person,window.EscapeRouteFocus?.floorScope)].join("|");
        let entry=cache.get(person.id);
        if(!entry||entry.key!==key){
          const route=scenario.routeForPerson?.(person.id,frame.time)||noRoute;
          entry={key,pathId:person.pathId,route,points:route.points.map(project),durations:route.timings||[]};
          cache.set(person.id,entry);dirty=true;
        }
        return { person,route:entry.route,path:entry,category:statusOf(person,entry.route) };
      });
    }
    function clearTargets(){
      for(const el of labels)el?.remove?.();
      labels.length=0;
      for(const obj of targetGroup.children.slice()){
        targetGroup.remove(obj);obj.geometry?.dispose();obj.material?.dispose();
      }
    }
    function showTargets(){
      clearTargets();
      const selected=records.filter(r=>isSubject(r.person,r.category));
      const category=stage || (selected.length?selected[0].category:null);
      targets=collectTargets(selected,category);
      for(const item of targets){
        const world=project({...item,level:item.level||1});
        if(!world)continue;
        item.point=world.clone();
        for(const [inner,outer,color] of [[.30,.57,"#F8FAFE"],[.35,.50,item.color]]){
          const ring=new three.Mesh(new three.RingGeometry(inner,outer,32),new three.MeshBasicMaterial({color,side:three.DoubleSide,depthTest:false,depthWrite:false,transparent:true,opacity:1}));
          ring.rotation.x=-Math.PI/2;ring.position.copy(world);ring.position.y+=.035;
          ring.renderOrder=inner===.30?15:16;targetGroup.add(ring);
        }
        const pin=new three.Mesh(new three.OctahedronGeometry(.16),new three.MeshBasicMaterial({color:item.color,depthTest:false,depthWrite:false}));
        pin.position.copy(world);pin.position.y+=.19;pin.renderOrder=16;targetGroup.add(pin);
        const anchor=world.clone();anchor.y+=.48;
        const lang=String(document.documentElement.lang||"").toLowerCase();
        const label=lang.startsWith("zh")
          ?(item.tower==="W"?"西座":"東座")+" · "+(item.labelZh||item.label)
          :(item.tower==="W"?"West":"East")+" · "+item.label;
        if(options.labelExit)labels.push(options.labelExit(anchor,label,{...item,category,status:category}));
      }
    }
    function rebuildPaths(){
      paths.clear(); fullPaths=0;
      const sections=new Map(),flights=new Map();
      let selectedColor=colors.auto;
      const manualFocus=stage==="manual",style=manualFocus?manualStyle:estateStyle;
      for(const {person,path,category,route} of records){
        if(!route.points.length||category==="pending")continue;
        const subject=isSubject(person,category);
        // With no selection the moving trails carry the ambient view. In a selected
        // view keep genuine start-to-exit paths sharp and other circulation subdued.
        if(!subject&&(!stage||stage==="pending"))continue;
        if(subject){fullPaths++;selectedColor=colors[category];}
        const width=subject?(category==="manual"?style.manualPath:2.7):.9;
        const opacity=subject?(category==="manual"?style.manualOpacity:.87):style.contextOpacity;
        for(let i=1;i<path.points.length;i++){
          const a=path.points[i-1], b=path.points[i];
          if(!a||!b)continue;
          const up=route.points[i-1],down=route.points[i],stair=up.stair||down.stair;
          if(manualFocus&&subject&&stair&&up.level>down.level+.12){
            const shaft=up.tower+"/"+stair;
            if(!flights.has(shaft))flights.set(shaft,new Map());
            flights.get(shaft).set(up.level,[a,b]);
          }
          const p=k=>[k.x.toFixed(3),k.y.toFixed(3),k.z.toFixed(3)].join(",");
          const pa=p(a), pb=p(b), key=pa<pb?pa+"|"+pb:pb+"|"+pa;
          const prev=sections.get(key);
          if(!prev || (!prev.subject&&subject))sections.set(key,{a,b,subject,width,opacity,color:colors[category]});
        }
      }
      for(const line of Array.from(sections.values()).sort((a,b)=>Number(a.subject)-Number(b.subject))){
        paths.add(line.a,line.b,line.color,line.width,line.width,line.opacity,line.opacity);
      }
      paths.finish();arrows.set(flights,selectedColor);showTargets();dirty=false;
    }
    function addTrail(record,time,focus,context) {
      const {route,path,category}=record, t=path.durations;
      if(t.length<2||t.length!==path.points.length)return;
      const elapsed=Math.min(t[t.length-1],Math.max(0,time-route.startTime));
      const windowSeconds=5.6, start=Math.max(0,elapsed-windowSeconds);
      if(elapsed-start<.005)return;
      const stops=[start,elapsed], firstIdx=indexAt(t,start);
      for(let i=firstIdx+1;i<t.length && t[i]<elapsed;i++)stops.push(t[i]);
      // Intermediate knots control the taper even on a long straight section.
      for(let i=1;i<7;i++)stops.push(start+(elapsed-start)*i/7);
      stops.sort((a,b)=>a-b);
      const ink=colors[category],style=stage==="manual"?manualStyle:estateStyle;
      const width=context?style.contextTrail:focus?style.trail:4.8;
      const alpha=context?style.contextTrailOpacity:focus?1:.89;
      let before=trails.count;
      for(let i=1;i<stops.length;i++){
        const ta=stops[i-1],tb=stops[i];if(tb-ta<.00001)continue;
        const a=positionAt(path,ta,temps[0]),b=positionAt(path,tb,temps[1]);
        // A point on either side of a clipped region is never joined through it.
        if(!a||!b)continue;
        const sa=Math.max(0,1-(elapsed-ta)/windowSeconds),sb=Math.max(0,1-(elapsed-tb)/windowSeconds);
        trails.add(a,b,ink,.30+width*sa,.30+width*sb,alpha*sa*sa,alpha*sb*sb);
      }
      if(trails.count>before)visibleTrails++;
    }
    function update(seconds) {
      if(disposed)return;
      const frame=scenario.sample(seconds);
      lastTime=frame.time; records=getRecords(frame);
      if(dirty)rebuildPaths();
      trails.clear();visiblePeople=0;visibleTrails=0;
      const style=stage==="manual"?manualStyle:estateStyle;
      records.forEach((record,i)=>{
        const {person,category}=record;
        const focus=isSubject(person,category);
        const context=!!stage&&!focus,moving=person.status==="moving" && category!=="pending";
        const point=project(person);
        const size=context?style.contextHead:focus?style.head*.8:6;
        const opacity=context?.20:focus?1:.88;
        dots.set(i,point,colors[category],moving?size:0,opacity);
        if(point&&moving)visiblePeople++;
        if(moving)addTrail(record,frame.time,focus,context);
      });
      trails.finish();dots.finish();
    }
    function filterChanged(e){
      const next=validStatus(e.detail?.status);
      const nextGroup=next==="manual"?(e.detail?.groupId??null):null;
      if(next===stage&&nextGroup===focusGroupId)return;
      stage=next;focusGroupId=nextGroup;dirty=true;update(lastTime);
    }
    window.addEventListener("escape-route-filter",filterChanged);
    const stopModel=scenario.subscribe?.(frame=>{
      // A dispatch at a paused clock must be visible before another animation
      // tick. Merely opening a group or selecting a filter retains the pose.
      if(!disposed&&frame.people.some(p=>cache.get(p.id)?.pathId!==p.pathId))update(frame.time);
    });
    function dispose(){
      disposed=true;window.removeEventListener("escape-route-filter",filterChanged);
      stopModel?.();
      clearTargets();paths.dispose();trails.dispose();dots.dispose();arrows.dispose();cache.clear();
    }
    function inspect(){return {filter:stage,groupId:focusGroupId,fullPaths,pathSegments:paths.count,downhillMarks:arrows.count,trailPeople:visibleTrails,trailSegments:trails.count,visiblePeople,time:lastTime,targets:targets.length};}
    update();
    return {group,update,dispose,count:people.length,getTargets:()=>targets.slice(),inspect};
  }
  window.EscapeFlowView={create,statusOf,onFloor,targetsFor,itinerariesFor,landingSequence};
})();
