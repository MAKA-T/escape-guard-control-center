/* Escape Guard Control Center. Local Three.js scene in the same plan coordinates as the floor map. */
(function () {
  "use strict";
  const levels = Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
  const pitch = 3.0, unit = 0.032;
  const estateScale={planX:.037,planZ:.033,height:1.74};
  const detailScale={planX:unit,planZ:unit,height:pitch};
  const xOf = x => (x - 359) * unit;
  const zOf = y => (y - 161) * unit;
  function mount(container, options) {
    const three = window.THREE;
    const zh = () => document.documentElement.lang.toLowerCase().startsWith("zh");
    let alive = true;
    let engine;
    try { engine = new three.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true}); }
    catch (_) {
      const notice = document.createElement("div");
      notice.style.cssText = "height:100%;display:grid;place-content:center;text-align:center;color:#34323b;background:#eeecf0;padding:24px";
      notice.textContent = zh() ? "請在瀏覽器開啟硬件加速以顯示三維樓宇。面罩目錄和值班席仍可操作。" : "Enable browser hardware acceleration to see the 3D building. The mask directory and duty desk are available.";
      container.replaceChildren(notice);
      const noOp = () => {};
      return {setFloor:noOp,setDevices:noOp,setState:noOp,resize:noOp,resetView:noOp,destroy:()=>notice.remove()};
    }
    engine.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    engine.outputColorSpace = three.SRGBColorSpace;
    engine.setClearColor(0xeeedf1, 1);
    const scene = new three.Scene();
    function paintTexture(size, paint){
      const surface=document.createElement("canvas");surface.width=size;surface.height=size;
      const context=surface.getContext("2d");paint(context,size);
      const texture=new three.CanvasTexture(surface);texture.colorSpace=three.SRGBColorSpace;return texture;
    }
    const backdrop=paintTexture(512,(context,n)=>{
      const glow=context.createRadialGradient(n*.45,n*.33,n*.03,n*.5,n*.50,n*.73);
      glow.addColorStop(0,"#f8f7f4");glow.addColorStop(.58,"#efedf0");glow.addColorStop(1,"#e3e2e8");
      context.fillStyle=glow;context.fillRect(0,0,n,n);
    });
    scene.background=backdrop;
    const shadowMap=paintTexture(128,(context,n)=>{
      const shadow=context.createRadialGradient(n*.5,n*.5,0,n*.5,n*.5,n*.5);
      shadow.addColorStop(0,"rgba(65,58,78,.49)");shadow.addColorStop(.53,"rgba(77,69,91,.30)");shadow.addColorStop(1,"rgba(80,74,86,0)");
      context.fillStyle=shadow;context.fillRect(0,0,n,n);
    });
    scene.add(new three.HemisphereLight(0xfff9f0,0x88837c,2.35));
    const sideLight = new three.DirectionalLight(0xffeee2,1.85);
    sideLight.position.set(-6,13,8); scene.add(sideLight);
    const fillLight = new three.DirectionalLight(0xc3cbcd,0.9);
    fillLight.position.set(8,6,-4); scene.add(fillLight);
    const camera = new three.OrthographicCamera(-15,15,6,-6,0.1,140);
    const group = new three.Group(); scene.add(group);
    const grid = new three.GridHelper(42,8,0xa49fab,0xaaa4af);
    grid.material.transparent=true;grid.material.opacity=.13;grid.material.depthWrite=false;
    grid.position.y=-3.8; scene.add(grid);
    let floor = options.floor || "02", tower=options.tower||"E", devices = options.devices || [], state = {};
    let site=true, layer="all", picker="inspect", floorFocus=null, focusWorld=null, floorGraph=null;
    let fields=[];
    const layout=window.EscapeBuildingLayout;
    let statusFilter=window.EscapeRouteFocus?.status||null;
    let focusTowers=new Set();
    let focusGroupId=window.EscapeRouteFocus?.groupId||null, manualItineraries=[];

    const evacuation=window.EscapeEvacuation?.shared;
    let planPreview=window.EscapePlanPreview?.current||null;
    function changePreview(event){
      planPreview=event.detail;
      if(planPreview){
        site=planPreview.kind==="group";tower=planPreview.tower;
        floor=storeyCode(planPreview.floor)||floor;floorFocus=null;picker="inspect";resetView();
      }
      dirty=true;schedule();
    }
    function dismissPreview(){
      if(!planPreview)return;
      window.EscapePlanPreview.clear();
      window.dispatchEvent(new Event("escape-plan-preview-closed"));
    }
    window.addEventListener("escape-plan-preview",changePreview);
    let flows=null, frozen=window.matchMedia("(prefers-reduced-motion: reduce)").matches, frozenTime;
    let updatedAt=0;
    const homeZoom=1.13;
    let yaw=.43, elevation=.67, zoom=homeZoom;
    let width = 360, height = 280, frame=0, dirty = true;
    let pickables=[], labels=[], disposables=[], observedKey="";
    const canvas = engine.domElement;
    canvas.style.cssText="display:block;width:100%;height:100%;touch-action:none;cursor:grab";
    canvas.tabIndex=0;canvas.setAttribute("role","img");
    const overlay=document.createElement("div");
    overlay.style.cssText="position:absolute;inset:0;overflow:hidden;pointer-events:none;user-select:none";
    const toolbar=document.createElement("div");toolbar.className="map-camera-tools";
    const layerBar=document.createElement("div");layerBar.className="volume-switch";layerBar.setAttribute("role","group");
    const dock=document.createElement("div");dock.className="map-control-dock";
    const legendBox=document.createElement("div");legendBox.className="map-key-box";
    const legendToggle=document.createElement("button");legendToggle.className="map-key-toggle";legendToggle.type="button";
    const volumeLegend=document.createElement("div");volumeLegend.className="volume-legend";volumeLegend.id="buildingMapKey";
    legendToggle.setAttribute("aria-controls",volumeLegend.id);
    let keyOpen=false;
    function updateMapKey(){
      const compact=width<800,open=keyOpen&&compact;
      dock.dataset.compact=String(compact);legendToggle.hidden=!compact;
      volumeLegend.hidden=compact&&!open;
      legendToggle.setAttribute("aria-expanded",String(open));
      legendToggle.textContent=zh()?"圖例":"Map key";
      toolbar.setAttribute("role","group");toolbar.setAttribute("aria-label",zh()?"視角控制":"View controls");
    }
    legendToggle.onclick=()=>{keyOpen=!keyOpen;updateMapKey();schedule()};
    legendBox.addEventListener("keydown",e=>{if(e.key==="Escape"&&keyOpen){keyOpen=false;updateMapKey();legendToggle.focus();schedule()}});
    legendBox.append(legendToggle,volumeLegend);dock.append(legendBox,toolbar);
    container.style.position="relative";container.style.overflow="hidden";container.replaceChildren(canvas,overlay,layerBar,dock);
    const annotationObserver=new ResizeObserver(()=>schedule());
    const layerButtons=new Map();
    for(const key of ["all","heat","smoke"]){
      const button=document.createElement("button");button.type="button";button.dataset.layer=key;
      button.onclick=()=>{if(layer!==key){layer=key;dirty=true;schedule()}};
      layerBar.append(button);layerButtons.set(key,button);
    }
    function hazardScale(kind){
      const heat=kind==="heat";
      const name=heat?(zh()?"相對熱強度":"Relative heat"):(zh()?"煙層濃度":"Smoke density");
      const lower=heat?(zh()?"較低":"Lower"):(zh()?"稀薄":"Light");
      const upper=heat?(zh()?"較高":"Higher"):(zh()?"濃密":"Dense");
      const scale=document.createElement("div"),heading=document.createElement("b"),range=document.createElement("div");
      const low=document.createElement("small"),ramp=document.createElement("i"),high=document.createElement("small");
      scale.className="hazard-key-scale";scale.dataset.fieldScale=kind;scale.setAttribute("role","img");
      scale.setAttribute("aria-label",name+" · "+lower+(zh()?"至":" to ")+upper);
      heading.textContent=name;range.className="hazard-key-range";
      low.textContent=lower;high.textContent=upper;ramp.setAttribute("aria-hidden","true");
      range.append(low,ramp,high);scale.append(heading,range);return scale;
    }
    function updateLayers(){
      const names=zh()?{all:"綜合",heat:"高溫",smoke:"煙霧"}:{all:"Combined",heat:"Heat",smoke:"Smoke"};
      layerBar.setAttribute("aria-label",zh()?"風險顯示圖層":"Hazard layers");
      for(const [key,button] of layerButtons){button.textContent=names[key];button.setAttribute("aria-pressed",String(layer===key))}
      const items=[],scales=document.createElement("div"),symbols=document.createElement("div");
      scales.className="hazard-key-scales";symbols.className="map-symbol-keys";
      if(layer!=="smoke")scales.append(hazardScale("heat"));
      if(layer!=="heat")scales.append(hazardScale("smoke"));
      if(!statusFilter)items.push(["report",zh()?"探測器警報":"Detector alert"]);
      if(!site&&!statusFilter&&layer!=="smoke"&&evacuation?.snapshot().hazards.some(h=>h.tower===tower&&h.floor===floor&&h.simulated&&h.visualOrigin&&h.phenomenon==="scripted-fire-seat"))
        items.push(["origin",zh()?"模擬火源":"Simulated source"]);
      if(evacuation&&statusFilter!=="pending"){
        const name=statusFilter==="manual"?(zh()?"人工引導路線":"Operator route"):
          statusFilter==="auto"?(zh()?"自動疏散路線":"Automatic route"):(zh()?"疏散光點":"People");
        items.push(["people",name]);
      }
      if(evacuation&&(!statusFilter||statusFilter==="pending"))items.push(["assistance",zh()?"待處理":"Needs action"]);
      symbols.append(...items.map(([kind,text])=>{
        const item=document.createElement("span");const icon=document.createElement("i");icon.className=kind;
        const shape={report:"detector",origin:"flame",assistance:"group"}[kind];
        if(shape){
          icon.className="map-symbol-key";
          icon.style.cssText="display:inline-flex;width:15px;height:15px;color:"+(kind==="report"?"#57535f":"#a65022");
          icon.append(makeGlyph(shape));
        }
        if(kind==="people")icon.style.cssText=statusFilter==="manual"?"background:#345dc1":"background:#007665";
        item.append(icon,document.createTextNode(text));return item;
      }));
      volumeLegend.replaceChildren(scales,symbols);
      updateMapKey();
    }
    const action=(symbol,fn)=>{
      const b=document.createElement("button");
      b.type="button"; b.textContent=symbol;
      b.style.cssText="border:1px solid #d5d1d7;background:#fffffff7;color:#373540;border-radius:13px;min-width:30px;height:29px;padding:0 7px;line-height:1;font:600 15px Arial;cursor:pointer;box-shadow:0 2px 5px #35313f09";
      b.addEventListener("click",event=>{event.stopPropagation();fn()});toolbar.append(b);return b;
    };
    const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
    const setZoom=v=>{zoom=clamp(v,0.65,2.8);schedule()};
    const buttons=[action("−",()=>setZoom(zoom/1.18)),action("+",()=>setZoom(zoom*1.18)),action("⤾",()=>rotate(0.26,0)),action("⌂",resetView)];
    const motion=evacuation?action("",()=>{
      frozen=!frozen;frozenTime=frozen?evacuation.sample().time:undefined;
      updateMotion();schedule();
    }):null;
    if(motion)motion.classList.add("motion-toggle");
    function updateMotion(){
      if(!motion)return;
      motion.textContent=frozen?"▶":"Ⅱ";
      motion.title=frozen?(zh()?"播放疏散動效":"Play evacuation animation"):(zh()?"暫停疏散動效":"Pause evacuation animation");
      motion.setAttribute("aria-label",motion.title);
      motion.setAttribute("aria-pressed",String(!frozen));
    }
    function rotate(dx,dy){yaw+=dx;elevation=clamp(elevation+dy,0.22,1.29);schedule()}
    function resetView(){yaw=site?.43:.57;elevation=site?.67:.75;zoom=homeZoom;schedule()}
    function keep(v){disposables.push(v);return v}
    const matCache=new Map();
    function material(color,opacity=1,flat=false){
      const key=color+"-"+opacity+"-"+flat;
      if(!matCache.has(key)){
        const config={color,opacity,transparent:opacity<1,depthWrite:opacity>=1,side:opacity<1?three.FrontSide:three.DoubleSide};
        matCache.set(key, keep(flat?new three.MeshBasicMaterial(config):new three.MeshStandardMaterial({...config,roughness:.88,metalness:.05})));
      }
      return matCache.get(key);
    }
    function mesh(geometry,mat,position){
      const m=new three.Mesh(keep(geometry),mat);
      if(position)m.position.copy(position); group.add(m);return m;
    }
    function world(x,h,y){return new three.Vector3(xOf(x),h,zOf(y))}
    function poly(points,base,depth,mat){
      const shape=new three.Shape();points.forEach(([x,z],i)=>shape[i?"lineTo":"moveTo"](xOf(x),-zOf(z)));shape.closePath();
      const obj=mesh(new three.ExtrudeGeometry(shape,{depth,bevelEnabled:false}),mat);
      obj.rotation.x=-Math.PI/2;obj.position.y=base;return obj;
    }
    function line(points,color,opacity=1){
      const geometry=keep(new three.BufferGeometry().setFromPoints(points));
      const lineMat=keep(new three.LineBasicMaterial({color,transparent:opacity<1,opacity}));
      const obj=new three.Line(geometry,lineMat);group.add(obj);return obj;
    }
    function tag(anchor,caption,kind,handler){
      const e=document.createElement(handler?"button":"span");
      if(handler){e.type="button";e.addEventListener("click",event=>{event.stopPropagation();handler()})}
      e.textContent=caption; e.dataset.modelLabel=caption;
      const styles={floor:"color:#484552;background:#f7f5f8ed;border:1px solid #cbc8d0",
        selection:"color:#783b17;background:#ffebdc;border:1px solid #dcb996",
        zone:"color:#854316;background:#ffefdfef;border:1px solid #d8a579",
        stair:"color:#464454;background:#f9f6f9ed;border:1px solid #b8b0c3",
        exit:"color:#07584c;background:#e5f2edfa;border:1px solid #67a798;box-shadow:0 2px 5px #12392d1a"};
      e.style.cssText="position:absolute;top:0;left:0;white-space:nowrap;letter-spacing:.035em;font:600 10px/1.1 Arial,sans-serif;padding:3px 6px;border-radius:7px;pointer-events:"+(handler?"auto;cursor:pointer":"none")+";"+styles[kind];
      overlay.append(e);labels.push({e,anchor,kind});annotationObserver.observe(e);
      return e;
    }
    const glyphs={
      home:"M1.8 7.5 8 2.3l6.2 5.2M3.7 6.5v7.2h8.6V6.5M6.6 13.7V9.6h2.8v4.1",
      mask:"M2.2 5.8c2.3-.6 4.1-.9 5.8-.9s3.6.3 5.8.9l-.5 4.4c-.2.9-.8 1.3-1.7 1.3h-1.1L8 9.7l-2.5 1.8H4.3c-.9 0-1.5-.5-1.6-1.3zM4.7 7.6h2m2.6 0h2",
      detector:"M2.2 7.8h11.6l-.8 2H3zM5.2 10v1.5h5.6V10M5.5 5.4c.3-.7.8-1 1.2-1.6m2.1 1.7c.5-.8 1-1.1 1.3-1.9",
      flame:"M9.2 1.3c.9 2.5-.7 3.4-.5 5.3 1.2-.3 2-1.1 2.2-2.2 2 2 2.7 4 2.3 6.1-.4 2.2-2.4 4.1-5.1 4.1-3.2 0-5.4-2-5.4-4.9 0-2.2 1.4-3.8 3.2-5.4-.2 1 .2 1.9.8 2.2C7.3 4.2 7.7 3 9.2 1.3Z",
      stair:"M1.4 12.5h3.2V9.2h3.1V6h3.1V2.8h3.6",
      exit:"M8.3 2.2H3.4v11.6h4.9M6.6 8h7.1m-2.8-2.8L13.7 8l-2.8 2.8",
      group:"M7.8 5.6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0Zm-5.7 6.8v-.9c0-1.7 1.4-3 3-3h2.4c1.7 0 3 1.3 3 3v.9M2.8 6.1a1.1 1.1 0 1 0-.9 1.8M10.2 7.1a1.1 1.1 0 1 0-.4-1.9M13.1 2.2v4m0 1.5v.3",
      layers:"m1.6 6.5 6.4-3.4 6.4 3.4L8 9.9zM2.5 9.7 8 12.5l5.5-2.8",
      pin:"M8 14s4.2-4 4.2-7.4a4.2 4.2 0 1 0-8.4 0C3.8 10 8 14 8 14Zm0-9.1a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z"};
    function makeGlyph(name){
      const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg"),path=document.createElementNS(ns,"path");
      svg.setAttribute("viewBox","0 0 16 16");svg.setAttribute("width",14);svg.setAttribute("height",14);
      svg.setAttribute("aria-hidden","true");path.setAttribute("d",glyphs[name]);path.setAttribute("fill","none");
      path.setAttribute("stroke","currentColor");path.setAttribute("stroke-width",1.55);
      path.setAttribute("stroke-linecap","round");path.setAttribute("stroke-linejoin","round");svg.append(path);
      return svg;
    }
    function asSymbol(mark,name,caption,expanded=false,description=caption){
      const svg=makeGlyph(name),text=document.createElement("span");text.textContent=caption;
      mark.replaceChildren(svg,text);mark.dataset.glyph=name;mark.setAttribute("aria-label",description);mark.removeAttribute("title");
      mark.style.cssText+=";display:inline-flex;gap:4px;align-items:center;justify-content:center;min-width:19px;min-height:19px;padding:2px 3px;box-sizing:border-box;line-height:1.05;border-radius:7px;letter-spacing:0;isolation:isolate";
      const set=open=>{if(text.hidden===!open&&mark.dataset.expanded===String(open))return;text.hidden=!open;mark.dataset.expanded=String(open);mark.style.zIndex=open?"6":"";schedule();};
      set(expanded);mark.onpointerenter=()=>set(true);mark.onfocus=()=>set(true);
      mark.onpointerleave=()=>set(expanded||document.activeElement===mark);mark.onblur=()=>set(expanded||mark.matches(":hover"));
      return mark;
    }
    function sensorCode(a){return String(a?.source||"")+" "+String(a?.label||"")+" "+String(a?.id||"");}
    function detectorId(a){return sensorCode(a).toUpperCase().match(/(?:^|[^A-Z0-9])([DS][0-9]+)\b/)?.[1]||"";}
    function pick(obj,fn,edit=false){obj.userData.activate=fn;obj.userData.editPick=edit;pickables.push(obj)}
    function activePicking(){return !site&&picker!=="inspect";}
    function sendPick(kind,id,x,y){
      const detail={kind,id,tower,floor,x,y};
      if(kind==="node")detail.nodeId=id;
      if(kind==="edge")detail.edgeId=id;
      window.dispatchEvent(new CustomEvent("escape-map-pick",{detail}));
    }
    function storeyCode(value){
      const n=Number(String(value??"").replace(/^F/i,""));
      return Number.isInteger(n)&&n>=1&&n<=12?String(n).padStart(2,"0"):null;
    }
    function inspectFloor(data={}){
      const level=storeyCode(data.floor),block=data.tower;
      if(!level||!["E","W"].includes(block))return;
      if(statusFilter)window.EscapeRouteFocus?.set(null);
      const entering=site;
      tower=block;floor=level;site=false;
      floorFocus=(data.nodeId||data.edgeId||data.alertId||data.deviceId)?{...data}:null;
      if(entering)resetView();
      dirty=true;schedule();
    }
    function setPickMode(data={}){
      const key=data.mode||"inspect";
      const mapped=["node","exit","origin","alert"].includes(key)?"node":["point","draw"].includes(key)?"point":key==="edge"?"edge":"inspect";
      if(mapped!=="inspect"&&(site||data.floor&&storeyCode(data.floor)!==floor||data.tower&&data.tower!==tower))
        inspectFloor({tower:data.tower||tower,floor:data.floor||floor});
      if(picker===mapped)return;
      picker=mapped;dirty=true;schedule();
    }
    const onInspect=e=>{dismissPreview();inspectFloor(e.detail)};
    const onPick=e=>setPickMode(e.detail);
    window.addEventListener("escape-inspect-floor",onInspect);
    window.addEventListener("escape-map-pick-mode",onPick);
    function selectStorey(block,level){
      if(statusFilter)window.EscapeRouteFocus?.set(null);
      inspectFloor({tower:block,floor:level});options.onFloor?.(level,block);
    }
    function sitePosition(block,x,y,level) {
      const west=block==="W";
      return new three.Vector3((west?-14.25:14.25)+(x-359)*estateScale.planX,-11.6+(level-1)*estateScale.height,
        (west?-2.1:2.1)+(y-161)*estateScale.planZ);
    }
    function at(block,x,y,level) {
      return site?sitePosition(block,x,y,level):world(x,(level-Number(floor))*pitch,y);
    }
    function project(p){
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
      const level=Number.isFinite(p.level)?p.level:(p.roof?13:Number(p.floor));
      if(!Number.isFinite(level))return null;
      if(!site){
        const selected=Number(floor),low=Math.max(1,selected-1),high=selected===12?13:selected;
        if(p.tower!==tower||level<low-1e-6||level>high+1e-6)return null;
      }
      const marker=at(p.tower,p.x,p.y,level);
      // Elevate all moving points uniformly above the surface, including pitched flights.
      marker.y+=site?.115:.16;
      return marker;
    }
    function mapCallout(anchor,caption,kind,meta={}){
      const label=tag(anchor.clone(),caption,"exit"),entry=labels[labels.length-1];
      const colors=kind==="origin"?["#ffffff","#364867","#9aabc2"]:kind==="stair"?
        ["#fbfbfd","#484858","#a6a5b2"]:meta.category==="manual"?["#e7edfc","#2e4898","#8299d7"]:["#e9f3ec","#185247","#72a892"];
      label.style.cssText+=";display:inline-flex;align-items:center;gap:4px;font:600 10px/1.2 Arial,sans-serif;letter-spacing:.01em;padding:3px 6px;border-radius:10px;background:"+colors[0]+";color:"+colors[1]+";border:1px solid "+colors[2]+";box-shadow:0 1px 4px #38394414";
      const ns="http://www.w3.org/2000/svg",icon=document.createElementNS(ns,"svg"),path=document.createElementNS(ns,"path");
      icon.setAttribute("width",12);icon.setAttribute("height",12);icon.setAttribute("viewBox","0 0 16 16");icon.setAttribute("aria-hidden","true");
      path.setAttribute("d",kind==="origin"?"M8 14s4.3-4.3 4.3-7.5A4.3 4.3 0 0 0 3.7 6.5C3.7 9.7 8 14 8 14ZM9.3 6.5a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 1 1 2.6 0Z":
        kind==="stair"?"M1.4 12.5h3.2V9.2h3.1V6h3.1V2.8h3.6":"M8.3 2.2H3.4v11.6h4.9M6.6 8h7.1m-2.8-2.8L13.7 8l-2.8 2.8");
      path.setAttribute("fill","none");path.setAttribute("stroke","currentColor");path.setAttribute("stroke-width",1.5);path.setAttribute("stroke-linejoin","round");path.setAttribute("stroke-linecap","round");
      icon.append(path);label.prepend(icon);label.dataset.routeStage=kind;label.title=caption;
      const stem=document.createElement("i");
      stem.style.cssText="position:absolute;left:0;top:0;height:1px;transform-origin:0 50%;pointer-events:none;background:"+colors[2];
      overlay.prepend(stem);entry.stem=stem;entry.side=meta.side||(meta.id==="A"?-1:1);entry.kind=kind;
      return label;
    }
    function itineraryCallouts(time){
      const stairLabels=new Map();
      const towerName=t=>t==="W"?(zh()?"西座":"West"):(zh()?"東座":"East");
      function pin(anchor,ink,radius){
        const mat=keep(new three.MeshBasicMaterial({color:ink,depthTest:false,depthWrite:false}));
        const p=mesh(new three.SphereGeometry(radius,10,8),mat,anchor);p.renderOrder=17;
      }
      for(const it of manualItineraries){
        const p=it.origin,origin=project(p);
        if(!origin)continue;
        const t=towerName(p.tower),level=p.roof||p.level>12?(zh()?"天台":"roof"):(zh()?Number(p.floor)+" 樓":"F"+p.floor);
        const text=zh()?t+level+"起點":t+" "+level+" start";
        const mark=mapCallout(origin,text,"origin",{side:1});
        mark.dataset.routeOrigin=it.groupId;mark.dataset.routeGroups=it.groupId;
        mark.dataset.tower=p.tower;mark.dataset.level=p.level;
        pin(origin,0x405ea3,.105);
        for(const stair of it.stairs){
          const id=stair.tower+"/"+stair.id;
          if(stairLabels.has(id)){stairLabels.get(id).groups.add(it.groupId);continue;}
          // Find a real tread midway through this run so the start and the stair
          // can be called out separately, even from an unrotated elevation.
          const route=evacuation.routeForPerson(it.memberIds[0],time);
          const middle=(stair.fromLevel+stair.toLevel)/2;
          const points=route.points.filter(v=>v.stair===stair.id&&v.tower===stair.tower&&v.kind==="stair"&&
            v.level<=Math.max(stair.fromLevel,stair.toLevel)&&v.level>=Math.min(stair.fromLevel,stair.toLevel));
          const target=points.reduce((best,v)=>!best||Math.abs(v.level-middle)<Math.abs(best.level-middle)?v:best,null)||stair.anchor;
          const anchor=project(target);if(!anchor)continue;
          const part=zh()?towerName(stair.tower)+" "+stair.id+" 梯":towerName(stair.tower)+" · Stair "+stair.id;
          const label=mapCallout(anchor,part,"stair",{side:stair.id==="A"?-1:1});
          label.dataset.routeStair=stair.id;label.dataset.tower=stair.tower;label.dataset.level=target.level;
          pin(anchor,0x67657a,.10);
          stairLabels.set(id,{label,groups:new Set([it.groupId])});
        }
      }
      for(const item of stairLabels.values())item.label.dataset.routeGroups=Array.from(item.groups).join(" ");
    }
    function evacuationLayers(){
      if(!evacuation)return;
      const snapshot=evacuation.snapshot();
      if(statusFilter==="manual"){
        if(site&&!planPreview)itineraryCallouts(snapshot.time);
      }else focusTowers.clear();
      if(statusFilter&&statusFilter!=="manual")for(const p of snapshot.people){
        const auto=String(p.groupId).startsWith("regular");
        const category=auto?"auto":p.path?.length>1?"manual":"pending";
        if(category===statusFilter)focusTowers.add(p.tower);
      }
      for(const hazard of snapshot.hazards){
        if(!site&&(hazard.tower!==tower||hazard.floor!==floor))continue;
        const loc=project(hazard);if(!loc)continue;
        haze(hazard,hazard.tower,hazard.floor,hazard);
      }
      for(const entry of snapshot.groups){
        if(planPreview)break;
        if(!site&&(entry.tower!==tower||entry.floor!==floor))continue;
        const loc=project(entry);if(!loc)continue;
        const isSelected=entry.id===snapshot.selectedGroupId;
        const needsAction=entry.priority===true||["priority","waiting","verified"].includes(entry.status);
        if(!needsAction&&!isSelected)continue;
        const matchesFilter=!statusFilter||(needsAction?statusFilter==="pending":statusFilter==="manual");
        if(!matchesFilter)continue;
        if(!needsAction&&statusFilter==="manual")continue;
        const total=entry.size||entry.count;
        const point=loc.clone().add(new three.Vector3(.08,site?.92:.74,0));
        line([loc,point],needsAction?0xeea170:0x74c8aa,.64);
        const label=(needsAction?"! ":"› ")+total+(entry.roof?(zh()?" · 天台":" · Roof"):" · F"+entry.floor);
        const indicator=tag(point,label,needsAction?"zone":"selection",()=>evacuation.select(entry.id));
        indicator.dataset.groupMarker=entry.id;
        indicator.classList.add("evac-marker",needsAction?"needs-action":"group-guided");
        asSymbol(indicator,"group",label,isSelected, (zh()?entry.labelZh:entry.label)+" · "+total+(zh()?" 人":" people"));
        indicator.setAttribute("aria-current",String(isSelected));
        indicator.setAttribute("aria-label",(zh()?entry.labelZh:entry.label)+" · "+total+(zh()?" 人":" people"));
      }
      if(window.EscapeFlowView&&!planPreview){
        const labelExit=(point,text,meta={})=>{
          if(site&&statusFilter==="manual"){
            const label=mapCallout(project(meta)||point,text,"exit",meta);
            label.dataset.routeExit=meta.id||text;label.dataset.tower=meta.tower||"";
            label.dataset.status="manual";label.classList.add("route-exit-label");
            label.dataset.routeGroups=manualItineraries.filter(it=>it.exits.some(ex=>ex.id===meta.id&&ex.tower===meta.tower)).map(it=>it.groupId).join(" ");
            return label;
          }
          const label=tag(point.clone(),text,"exit");
          label.dataset.routeExit=meta.id||text;
          label.dataset.tower=meta.tower||"";
          label.dataset.status=meta.category||"";
          if(meta.category==="manual")
            label.style.cssText+=";background:#e8edfcf7;color:#2e4898;border-color:#8299d7";
          label.classList.add("route-exit-label");
          const stem=document.createElement("i");
          stem.style.cssText="position:absolute;left:0;top:0;height:1px;transform-origin:0 50%;pointer-events:none;background:"+
            (meta.category==="manual"?"#7285b8":"#659a88");
          overlay.prepend(stem);
          labels[labels.length-1].stem=stem;
          return label;
        };
        flows=window.EscapeFlowView.create(three,evacuation,project,engine.getPixelRatio(),snapshot.selectedGroupId,
          {filter:statusFilter,focusGroupId,site,labelExit});
        group.add(flows.group);
      }
    }
    function haze(report,block,level,reading){
      const volumes=window.EscapeHazardVolume;
      if(!volumes?.createField)return;
      const sample=reading||volumes.reading?.(report,block,level)||report;
      const when=(x,y,l)=>at(block,x,y,l);
      const field=volumes.createField(three,{report,sample,tower:block,level:Number(level),layer,site,
        at:when,floorHeight:site?estateScale.height:detailScale.height,reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches});
      if(!field?.group)return;
      keep(field);fields.push(field);group.add(field.group);
    }
    function reportMarker(report,location,scale,inspect){
      const id=detectorId(report),sensor=!!id;
      const foot=location.clone(),stemTop=location.clone();stemTop.y+=scale*1.1;
      if(sensor){
        const body=mesh(new three.CylinderGeometry(scale*.75,scale*.92,scale*.5,12),material(0x726f7c,.85,true),foot);
        pick(body,inspect);
      }
      const caption=sensor?(zh()?id+" 探測器":"Detector "+id):String(report.label||report.id).slice(0,32);
      const t=tag(stemTop,caption,"zone",inspect);
      t.dataset.detector=id||report.id;t.dataset.modelSensor=report.id;t.dataset.mapAlert=report.id;
      if(sensor)t.style.cssText+=";background:#f6f6fa;border-color:#a6a2ad;color:#57535f";
      const targeted=!site&&floorFocus?.alertId===report.id&&!floorFocus?.visualSource;
      asSymbol(t,sensor?"detector":"pin",caption,targeted,
        sensor?id+" · Detector / 探測器":caption);
    }
    function structure(){
      return window.EscapeArchitecture.create({three,layout,group,keep,material,at,dimensions:site?estateScale:detailScale,focus:statusFilter,
        pickFloor:(slab,block,level)=>pick(slab,()=>selectStorey(block,String(level).padStart(2,"0")))});
    }
    function campus(){
      const building=structure(), ground=-11.6;
      grid.position.y=ground-.19;grid.scale.setScalar(1.45);
      mesh(new three.BoxGeometry(60,.10,18),material(0xaaa6b1,statusFilter?.085:.115,true),new three.Vector3(0,ground-.18,0));
      const reports=state.summaries||[];
      for(const block of ["W","E"]){
        const foot=sitePosition(block,361,165,1);
        const shadowMaterial=keep(new three.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity:.81}));
        const shadow=mesh(new three.PlaneGeometry(30,14),shadowMaterial,new three.Vector3(foot.x+.52,ground-.104,foot.z+.35));
        shadow.rotation.x=-Math.PI/2;
        for(let level=1;level<=13;level++){
          building.floor(block,level);
        }
        for(const report of reports.filter(r=>r.tower===block)){
          const level=Number(report.floor);
          for(const item of report.alerts.filter(a=>a.status!=="resolved")){
            const point=at(block,Number.isFinite(item.x)?item.x:360,Number.isFinite(item.y)?item.y:160,level+.47);
            if(!evacuation)haze(item,block,report.floor);
            if(!statusFilter)reportMarker(item,point,.22,()=>{
              inspectFloor({tower:block,floor:report.floor,nodeId:item.nodeId,alertId:item.id});
              options.onIncident?.(block,report.floor,item.id);
            });
          }
        }
        const title=zh()?(block==="E"?"東座":"西座"):(block==="E"?"EAST TOWER":"WEST TOWER");
        if(!manualItineraries.length||focusTowers.has(block))
          tag(at(block,block==="E"?488:300,block==="E"?80:130,13.85),title,"floor",()=>{tower=block;dirty=true;options.onTower?.(block);schedule()});
        if(block===tower&&!statusFilter){
          const t=tag(at(block,172,238,Number(floor)+.5),"F"+floor,"selection",()=>selectStorey(block,floor));
          asSymbol(t,"layers","F"+floor,false,(zh()?"查看樓層 ":"Inspect floor ")+floor);
        }
      }
      building.finish();
    }
    function graphTarget(point,caption,kind,id,activate,chosen=false){
      const mark=tag(point,caption,"stair",activate);
      mark.dataset[kind==="node"?"mapNode":"mapEdge"]=id;
      mark.dataset.selectedPick=String(chosen);mark.setAttribute("aria-label",caption);
      mark.style.cssText+=";padding:2px 3px;border-radius:"+(kind==="edge"?"5":"10")+"px;border:1px solid #95877b;background:"+(chosen?"#ffe5cd":"#fffef9f5")+";color:#4e4239;box-shadow:0 1px 3px #37322e24;cursor:crosshair;display:inline-flex;align-items:center;justify-content:center;gap:3px";
      const dot=document.createElement("i"),text=document.createElement("span");
      dot.style.cssText="display:block;flex:none;width:"+(kind==="edge"?7:4)+"px;height:"+(kind==="edge"?2:4)+"px;background:#a96c41;border-radius:3px";
      text.textContent=caption;mark.replaceChildren(dot,text);
      const show=open=>{if(mark.dataset.expanded===String(open))return;text.hidden=!open;mark.dataset.expanded=String(open);schedule()};
      show(chosen);mark.onpointerenter=()=>show(true);mark.onpointerleave=()=>show(chosen||document.activeElement===mark);
      mark.onfocus=()=>show(true);mark.onblur=()=>show(chosen||mark.matches(":hover"));
      return mark;
    }
    function emphasize(point,caption){
      const r=mesh(new three.TorusGeometry(.26,.033,6,28),material(0xe39147,.96,true),point);
      r.rotation.x=-Math.PI/2;
      focusWorld=point.clone();
      if(caption){
        const label=tag(point.clone().add(new three.Vector3(0,.47,0)),caption,"selection");
        label.dataset.floorFocus=caption;
      }
    }
    function floorSymbols(level,base){
      if(activePicking())return;
      const graph=floorGraph,d=Number(level);
      const labels=layout.doors.filter(o=>o.id.startsWith("unit-"));
      const activeDevice=devices.find(device=>device.id===state.selected);
      for(let i=0;i<labels.length;i++){
        const door=labels[i],num=String(i+1).padStart(2,"0"),code=tower+"-"+level+num;
        const list=devices.filter(device=>device.household===code);
        const x=(door.a[0]+door.b[0])/2,y=door.a[1]+(door.a[1]<170?-15:15);
        const device=list.find(row=>row.id===state.selected)||list[0];
        const label=tag(world(x,base+.33,y),level+num,"stair",device?()=>options.onDevice?.(device.id):null);
        label.dataset.floorUnit=code;label.setAttribute("aria-label",(zh()?"單位 ":"Unit ")+code+(device?" · "+device.id:""));
        label.title=label.getAttribute("aria-label");
        label.style.cssText+=";font-size:8px;line-height:1.05;letter-spacing:.04em;padding:2px 3px;color:#625f6e;background:#f6f4f3cf;border-color:#c8c4ccb5";
        const details=(zh()?"單位 ":"Unit ")+code+" · "+list.length+(zh()?" 台面罩":" masks");
        const selectedUnit=activeDevice?.household===code;
        if(selectedUnit)label.style.cssText+=";border-color:#b99373;color:#714a2a";
        asSymbol(label,"home",code,false,details);
        label.style.minWidth="15px";label.style.minHeight="15px";label.style.padding="1px 2px";
        label.firstElementChild.setAttribute("width",12);label.firstElementChild.setAttribute("height",12);
      }
      for(const id of ["A","B"]){
        const core=layout.stairs[id],nodeId=id==="A"?"west-stair":"east-stair",[x,y]=core.entry;
        const info=graph?.exits.find(ex=>ex.id===id),shown=info?.active!==false;
        const text=(zh()?id+" 梯":"Stair "+id)+(shown?"":(zh()?" · 停用":" · Held"));
        const button=tag(world(x,base+.93,y-6),text,"stair",()=>{floorFocus={nodeId,label:text};dirty=true;schedule();sendPick("exit",id,x,y);});
        button.dataset.stair=id;button.dataset.floorNode=nodeId;button.title=text+" · "+
          (d===12?(zh()?"上達天台":"Up to roof"):(zh()?"上達 F":"Up to F")+String(d+1).padStart(2,"0"))+
          (d===1?"":" / "+(zh()?"下達 F":"Down to F")+String(d-1).padStart(2,"0"));
        asSymbol(button,"stair",text,floorFocus?.nodeId===nodeId,button.title);
        if(d===1){
          const [ex,ey]=core.exteriorDoor;
          const gate=tag(world(ex,base+.59,ey+4),zh()?"地面出口 "+id:"Ground exit "+id,"exit",()=>{floorFocus={xy:[ex,ey],label:zh()?"地面出口 "+id:"Ground exit "+id};dirty=true;schedule();sendPick("exit",id,ex,ey);});
          gate.dataset.groundExit=id;gate.title=gate.textContent;gate.style.cssText+=";font-size:9px";
          asSymbol(gate,"exit",gate.textContent,false,(tower==="E"?(zh()?"東座 ":"East · "):(zh()?"西座 ":"West · "))+gate.textContent);
        }
      }
      if(d===12){
        const rooftop=layout.stairs.B.topLanding,[x0,y0,x1,y1]=rooftop;
        const r=tag(world((x0+x1)/2,base+pitch+.37,(y0+y1)/2),zh()?"天台入口":"Roof access","floor");
        r.dataset.roofAccess="13";asSymbol(r,"stair",r.textContent,true);
      }
      const hazard=evacuation?.snapshot().hazards?.filter(h=>h.tower===tower&&h.floor===level)||[];
      const reportedIds=new Set((graph?.alerts||[]).filter(a=>a.status!=="resolved").map(detectorId));
      for(const h of hazard){
        const code=detectorId(h),match=graph?.alerts.find(a=>detectorId(a)===code);
        if(!reportedIds.has(code)){
          reportMarker({...h,source:code},world(h.x,base+1.04,h.y),.15,()=>options.onIncident?.(tower,floor,h.id));
        }
        if(!h.simulated||!h.visualOrigin||h.phenomenon!=="scripted-fire-seat"||layer==="smoke")continue;
        const {x,y}=h.visualOrigin, caption=zh()?"模擬火源":"Simulated source";
        const inspect=()=>{
          options.onIncident?.(tower,floor,match?.id||h.id);
          floorFocus={alertId:match?.id||h.id,visualSource:true,xy:[x,y]};dirty=true;schedule();
        };
        const mark=tag(world(x,base+.23,y),caption,"zone",inspect);
        mark.dataset.fireSource=h.id;mark.dataset.relatedSensor=code;mark.style.cssText+=";background:#fff0e3;color:#a65022;border-color:#d49a73";
        asSymbol(mark,"flame",caption,!!floorFocus?.visualSource,"Simulated fire source / 模擬火源 · "+code);
      }
    }
    function floorOperations(base){
      const snap=floorGraph;
      if(!snap||snap.tower!==tower||snap.floor!==floor)return;
      const points=new Map(snap.nodes.map(n=>[n.id,n]));
      let selectedNode=floorFocus?.xy?null:(floorFocus?.nodeId||state.pickedNode);
      if(!selectedNode&&!floorFocus?.visualSource&&floorFocus?.alertId)selectedNode=snap.alerts.find(a=>a.id===floorFocus.alertId)?.nodeId;
      const selectedEdge=state.pickedEdge||floorFocus?.edgeId;
      const focusNode=points.get(selectedNode);
      if(focusNode&&!activePicking())emphasize(world(focusNode.x,base+.16,focusNode.y),floorFocus?.alertId||floorFocus?.label?null:focusNode.label);
      else if(floorFocus?.xy&&!activePicking())emphasize(world(floorFocus.xy[0],base+.19,floorFocus.xy[1]));
      if(picker==="node"||picker==="point")for(const n of snap.nodes){
        const worldPoint=world(n.x,base+.22,n.y);
        graphTarget(worldPoint,n.label||n.id,"node",n.id,()=>sendPick("node",n.id,n.x,n.y),selectedNode===n.id);
      }
      for(const a of snap.alerts.filter(x=>x.status!=="resolved")){
        const p=points.get(a.nodeId);if(!p)continue;
        const shape=a.zone?.type==="polygon"?a.zone.points:Array.from({length:16},(_,i)=>[p.x+Math.cos(i*Math.PI/8)*15,p.y+Math.sin(i*Math.PI/8)*15]);
        const colored=poly(shape,base+.04,.045,material(0xcc834a,.12,true));
        const inspect=()=>{floorFocus={nodeId:p.id,alertId:a.id};dirty=true;schedule();options.onIncident?.(tower,floor,a.id)};
        pick(colored,inspect);
        line([...shape,shape[0]].map(([x,z])=>world(x,base+.12,z)),0xdd9e69,.55);
        if(!evacuation)haze({...a,x:p.x,y:p.y},tower,floor);
        if(!activePicking())reportMarker(a,world(p.x,base+1.07,p.y),.15,inspect);
      }
      const stroke=(a,b,color,thickness,opacity=1,activation=null)=>{
        const v1=world(a.x,base+.13,a.y),v2=world(b.x,base+.13,b.y),dir=v2.clone().sub(v1);
        if(dir.length()<.001)return;
        const ribbon=mesh(new three.CylinderGeometry(thickness,thickness,dir.length(),5),material(color,opacity,true),v1.clone().lerp(v2,.5));
        ribbon.quaternion.setFromUnitVectors(new three.Vector3(0,1,0),dir.normalize());
        if(activation)pick(ribbon,activation,true);
      };
      for(const e of snap.edges){
        const a=points.get(e.a),b=points.get(e.b);if(!a||!b)continue;
        const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,choose=()=>sendPick("edge",e.id,cx,cy);
        if(picker==="edge"){
          const selected=selectedEdge===e.id;
          stroke(a,b,selected?0xef994d:(e.closed||e.blocked)?0xbb6041:0x7d8291,selected?.077:.041,selected?.95:.60,choose);
          graphTarget(world(cx,base+.27,cy),(a.label||a.id)+" → "+(b.label||b.id),"edge",e.id,choose,selected);
        }else if(selectedEdge===e.id){stroke(a,b,0xd08d58,.060,.93);focusWorld=world(cx,base+.2,cy);}
        if(e.closed||e.blocked){
          const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
          stroke({x:x-3,y:y-3},{x:x+3,y:y+3},0xe88752,.026);
          stroke({x:x-3,y:y+3},{x:x+3,y:y-3},0xe88752,.026);
        }else if(e.custom)stroke(a,b,0x8faea7,.035);
      }
      for(const e of snap.exits.filter(e=>e.custom)){
        const p=points.get(e.nodeId);if(!p)continue;
        const frame=mesh(new three.TorusGeometry(.23,.045,5,20),material(0xffaa68,1,true),world(p.x,base+.22,p.y));
        frame.rotation.x=Math.PI/2;
        const custom=tag(world(p.x,base+.88,p.y),String(e.label).slice(0,22),"stair",()=>sendPick("exit",e.id,p.x,p.y));
        custom.dataset.customExit=e.id;
        if(!e.active){custom.style.cssText+=";color:#766962;background:#e4dcd6";frame.material=material(0x877971,.70,true);}
        asSymbol(custom,"exit",e.label+(e.active?"":zh()?" · 停用":" · Closed"),true);
      }
      const trace=(state.trace||[]).map(p=>typeof p==="string"?points.get(p):p?.nodeId?points.get(p.nodeId)||p:p).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
      for(let i=1;i<trace.length;i++)stroke(trace[i-1],trace[i],0xcf8146,.069,.94);
      for(const p of trace){
        const m=mesh(new three.TorusGeometry(.112,.032,5,18),material(0xbd753e,.94,true),world(p.x,base+.22,p.y));m.rotation.x=Math.PI/2;
      }
      const draft=snap.draft&&["draft","reviewed"].includes(snap.draft.status)&&snap.draft.revision===snap.revision;
      const path=planPreview?null:state.displayRoute;
      const routes=path?.nodeIds?.length&&path.nodeIds.slice(1).every((id,i)=>snap.edges.some(e=>!e.closed&&!e.blocked&&
        ((e.a===path.nodeIds[i]&&e.b===id)||(e.b===path.nodeIds[i]&&e.a===id))))?[path]:[];
      const segments=new Set();
      for(const r of routes)for(let i=1;i<r.nodeIds.length;i++){
        const key=[r.nodeIds[i-1],r.nodeIds[i]].sort().join("~");if(segments.has(key))continue;segments.add(key);
        const a=points.get(r.nodeIds[i-1]),b=points.get(r.nodeIds[i]);if(!a||!b)continue;
        if(!draft)stroke(a,b,0xf99b4b,.052);
        else{
          const count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/8));
          const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
          for(let j=0;j<count;j++)stroke(at(j/count),at((j+.64)/count),0xffbd82,.045);
        }
      }
    }
    function rebuild(){
      updatedAt=0;
      annotationObserver.disconnect();for(const el of [layerBar,volumeLegend,toolbar,legendToggle])annotationObserver.observe(el);
      flows?.dispose();flows=null;fields=[];focusWorld=null;
      floorGraph=state.workspaceSnapshot||state.floorGraph||state.planner;
      group.clear();for(const d of disposables)d.dispose();disposables=[];matCache.clear();pickables=[];labels=[];overlay.replaceChildren();
      const current=levels.indexOf(floor);
      manualItineraries=[];
      if(statusFilter==="manual"&&evacuation){
        manualItineraries=window.EscapeFlowView.itinerariesFor?.(evacuation,"manual",evacuation.snapshot().time,focusGroupId)||[];
        focusTowers.clear();
        for(const it of manualItineraries){focusTowers.add(it.origin.tower);for(const ex of it.exits)focusTowers.add(ex.tower);}
      }
      container.dataset.scope=site?"estate":"floor";
      container.dataset.tower=tower;container.dataset.floor=floor;container.dataset.picker=picker;
      if(site)campus();
      else{
      grid.position.y=-3.34;grid.scale.setScalar(1);
      const building=structure(),selectedLevel=Number(floor);
      // Leave the volume above the selected floor open so primary paths and stair entrances are visible.
      if(selectedLevel>1)building.cutDeck(tower,selectedLevel-1);
      building.floor(tower,selectedLevel,true);
      building.aboveLanding(tower,selectedLevel+1,selectedLevel===12);
      building.finish();
      levels.forEach((level,index)=>{
        if(index>current||current-index>1)return;
        const base=(index-current)*pitch,active=level===floor;
        if(!active){
          const flag=tag(world(30,base+.14,193),"F"+level,"floor",()=>options.onFloor?.(level,tower));
          asSymbol(flag,"layers","F"+level,false,(zh()?"下層平台 ":"Lower landing F")+level);
        }
        if(!active)return;
        floorSymbols(level,base);
        floorOperations(base);
        if(activePicking())return;
        const device=devices.find(d=>d.id===state.selected&&d.tower===tower&&d.floor===level);
        // Docked masks share the handle on the apartment door. The only
        // independent device badge shown is a chosen, reported wearer location.
        if(device&&["moving","stale"].includes(device.status)&&Number.isFinite(device.x)&&Number.isFinite(device.y)){
          const p=world(device.x,base+.26,device.y),title=device.id;
          const mark=tag(p,title,"selection",()=>options.onDevice?.(device.id));
          mark.dataset.selectedDevice=device.id;
          asSymbol(mark,"mask",title,Boolean(floorFocus?.deviceId),title+" · "+(zh()?"面罩位置":"Mask position"));
          if(floorFocus?.deviceId)focusWorld=p;
        }
      });}
      evacuationLayers();
      container.dataset.preview=planPreview?.kind||"";
      if(planPreview)window.EscapePlanPreview.draw(three,planPreview,project,group,keep,mapCallout,zh());
      const desc=zh()?"兩座十二層住宅。拖曳旋轉、捲動縮放，點樓層查看面罩。":"Two twelve-storey residential towers. Drag to orbit, scroll to zoom, or select a floor to inspect masks.";
      canvas.setAttribute("aria-label",desc); canvas.title=desc;
      const names=zh()?["縮小","放大","旋轉","重設視角"]:["Zoom out","Zoom in","Orbit","Reset view"];
      buttons.forEach((b,i)=>{b.title=names[i];b.setAttribute("aria-label",names[i])});
      updateLayers();
      updateMotion();
      dirty=false;
    }
    // All DOM labels and map tools share one screen-space occupancy grid. The 3D
    // anchor stays on its actual object when the caption moves out of a cluster.
    let previousLayout=null;
    function controlRect(element,viewport){
      if(element.hidden)return null;
      const b=element.getBoundingClientRect();
      if(!b.width||!b.height)return null;
      const sx=width/viewport.width,sy=height/viewport.height;
      return {left:(b.left-viewport.left)*sx,right:(b.right-viewport.left)*sx,
        top:(b.top-viewport.top)*sy,bottom:(b.bottom-viewport.top)*sy};
    }
    function priority(e){
      if(document.activeElement===e)return 0;
      if(e.matches(":hover"))return 1;
      if(e.dataset.expanded==="true"||e.dataset.selectedPick==="true")return 2;
      if(e.dataset.routeStage||e.dataset.routeExit)return 3;
      if(e.dataset.glyph==="group"||e.dataset.glyph==="flame")return 4;
      if(e.dataset.glyph==="detector"||e.dataset.glyph==="exit"||e.dataset.glyph==="stair")return 5;
      return e.dataset.floorUnit?8:7;
    }
    function collides(b,others,pad){
      return others.some(a=>b.left<a.right+pad&&b.right>a.left-pad&&b.top<a.bottom+pad&&b.bottom>a.top-pad);
    }
    function placeLabel(item,occupied){
      const {entry,x,y,w,h}=item,e=entry.e;
      const side=entry.side||(e.dataset.routeExit==="A"?-1:1);
      const isCallout=Boolean(entry.stem);
      const preferredLeft=isCallout?(side<0?x-w-13:x+13):x-w/2;
      const preferredTop=isCallout?y-h/2:y-h;
      const inset=4,pad=2.5,maxLeft=width-w-inset,maxTop=height-h-inset;
      if(maxLeft<inset||maxTop<inset)return null;
      function candidate(dx,dy){
        const left=clamp(preferredLeft+dx,inset,maxLeft),top=clamp(preferredTop+dy,inset,maxTop);
        const b={left,top,right:left+w,bottom:top+h};
        return collides(b,occupied,pad)?null:b;
      }
      let result=candidate(0,0);if(result)return result;
      // Start with short offsets. A narrow elevation can put several distinct
      // doors or edit handles on the same projected pixel.
      const preferredAngle=isCallout?(side<0?Math.PI:0):-Math.PI/2;
      for(let radius=6;radius<=112;radius+=6){
        for(let i=0;i<16;i++){
          const a=preferredAngle+(i%2?-1:1)*Math.ceil(i/2)*Math.PI/8;
          result=candidate(radius*Math.cos(a),radius*Math.sin(a));if(result)return result;
        }
      }
      // An exhaustive fallback also covers browser text enlargement and the
      // diagram passing close to the fixed tool rail after an orbit.
      let best=null,cost=Infinity;
      for(let top=inset;top<=maxTop;top+=5){
        for(let left=inset;left<=maxLeft;left+=5){
          const d=Math.hypot(left-preferredLeft,top-preferredTop);
          if(d>=cost)continue;
          const box={left,right:left+w,top,bottom:top+h};
          if(!collides(box,occupied,pad)){best=box;cost=d;}
        }
      }
      return best;
    }
    function positionLeader(item,b){
      const {entry,x,y}=item;
      const endX=clamp(x,b.left,b.right),endY=clamp(y,b.top,b.bottom);
      const dx=endX-x,dy=endY-y,dist=Math.hypot(dx,dy);
      let line=entry.stem||entry.symbolStem;
      if(dist<5){if(line)line.hidden=true;return;}
      if(!line){
        line=document.createElement("i");line.setAttribute("aria-hidden","true");
        line.style.cssText="position:absolute;left:0;top:0;height:1px;background:#817c86a0;transform-origin:left center;pointer-events:none;";
        overlay.prepend(line);entry.symbolStem=line;
      }
      line.hidden=false;line.style.width=dist.toFixed(1)+"px";
      line.style.transform="translate("+x.toFixed(1)+"px,"+y.toFixed(1)+"px) rotate("+Math.atan2(dy,dx)+"rad)";
    }
    function positionLabels(){
      const controls=[layerBar,legendToggle,volumeLegend,toolbar],bounds=container.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const reserved=controls.map(el=>controlRect(el,bounds)).filter(Boolean);
      const entries=[],compact=width<=520;
      const signature=[width,height,...reserved.flatMap(o=>[o.left,o.top,o.right,o.bottom].map(Math.round))];
      for(const entry of labels){
        const e=entry.e,leader=entry.stem||entry.symbolStem;
        if(!e.isConnected){leader?.remove();continue;}
        const p=entry.anchor.clone().project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;
        const focused=e===document.activeElement;
        if(!focused&&(x<0||x>width||y<0||y>height||p.z < -1||p.z>1)){
          e.style.visibility="hidden";if(leader)leader.hidden=true;continue;
        }
        const edit=Boolean(e.dataset.mapNode||e.dataset.mapEdge);
        if(e.tagName==="BUTTON"&&(edit||e.dataset.glyph)&&entry.smallSize!==compact){
          const size=compact?(edit?22:26):(edit?15:e.dataset.floorUnit?15:19);
          e.style.minWidth=size+"px";e.style.minHeight=size+"px";entry.smallSize=compact;
        }
        const max=Math.max(72,Math.min(175,Math.floor(width*.51)));
        if(entry.maxWidth!==max){entry.maxWidth=max;e.style.maxWidth=max+"px";}
        const w=e.offsetWidth,h=e.offsetHeight,rank=priority(e);
        entries.push({entry,x,y,w,h,rank});
        signature.push(e.dataset.mapNode||e.dataset.mapEdge||e.dataset.modelLabel,x.toFixed(1),y.toFixed(1),w,h,rank);
      }
      const key=signature.join("|");
      if(previousLayout?.labels===labels&&previousLayout.key===key)return;
      previousLayout={labels,key};
      for(const item of entries.sort((a,b)=>a.rank-b.rank)){
        const e=item.entry.e,b=placeLabel(item,reserved);
        e.style.visibility=b?"visible":"hidden";
        if(!b){
          const line=item.entry.stem||item.entry.symbolStem;if(line)line.hidden=true;
          continue;
        }
        reserved.push(b);
        e.style.transform="translate("+b.left.toFixed(1)+"px,"+b.top.toFixed(1)+"px)";
        positionLeader(item,b);
      }
    }
    function draw(){
      frame=0;if(!alive)return;
      if(dirty)rebuild();
      const now=performance.now();
      if((flows||fields.length)&&(updatedAt===0||now-updatedAt>30)){
        const t=frozen?(frozenTime??=evacuation?.sample().time??0):(evacuation?.sample().time??now/1000);
        flows?.update(t);for(const field of fields)field.update(t);updatedAt=now;
      }
      const aspect=width/height;
      const radius=site?68:35,centre=site?-.8:.24,pitchAngle=site?elevation*.81:elevation;
      camera.position.set(radius*Math.cos(pitchAngle)*Math.sin(yaw),centre+radius*Math.sin(pitchAngle),radius*Math.cos(pitchAngle)*Math.cos(yaw));
      camera.lookAt(0,centre,0);camera.updateMatrixWorld();
      let cx=0,cy=0,extent=Math.max(6.85,12.6/aspect)/zoom;
      if(site){
        const bounds=new three.Box2();
        const include=(x,y,z)=>{
          const q=new three.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
          bounds.expandByPoint(new three.Vector2(q.x,q.y));
        };
        const one=planPreview?.kind==="group"?planPreview.tower:statusFilter&&focusTowers.size===1?[...focusTowers][0]:null;
        for(const block of ["W","E"]){
          if(one&&block!==one)continue;
          for(const x of [5,712])for(const y of [18,293]){
            const low=sitePosition(block,x,y,.37),high=sitePosition(block,x,y,13.35);
            include(low.x,low.y,low.z);include(high.x,high.y,high.z);
          }
          const top=sitePosition(block,380,105,14.18);include(top.x,top.y,top.z);
        }
        if(one){
          // Preserve a little of the adjacent tower as context while framing every storey of this route.
          const edge=sitePosition(one==="E"?"W":"E",one==="E"?620:100,165,3);
          include(edge.x,edge.y,edge.z);
        }
        cx=(bounds.max.x+bounds.min.x)/2;cy=(bounds.max.y+bounds.min.y)/2;
        const usableY=Math.max(.61,1-(statusFilter?85:64)/height),usableX=Math.max(.72,1-(statusFilter?95:52)/width);
        extent=Math.max((bounds.max.y-bounds.min.y)/(2*usableY),(bounds.max.x-bounds.min.x)/(2*aspect*usableX))*homeZoom/zoom;
      }else{
        const bounds=new three.Box2(),current=Number(floor);
        const low=Math.max(1,current-1)-.13,high=current===12?13.56:current+.81;
        for(const [x,y] of layout.outline){
          for(const level of [low,high]){
            const point=at(tower,x,y,level).applyMatrix4(camera.matrixWorldInverse);
            bounds.expandByPoint(new three.Vector2(point.x,point.y));
          }
        }
        cx=(bounds.max.x+bounds.min.x)/2;cy=(bounds.max.y+bounds.min.y)/2;
        if(focusWorld&&!activePicking()){
          const target=focusWorld.clone().applyMatrix4(camera.matrixWorldInverse);
          cx+=(target.x-cx)*.17;cy+=(target.y-cy)*.12;
        }
        const spaceX=Math.max(.76,1-38/width),spaceY=Math.max(.60,1-74/height);
        extent=Math.max((bounds.max.y-bounds.min.y)/(2*spaceY),(bounds.max.x-bounds.min.x)/(2*aspect*spaceX))*homeZoom/zoom;
      }
      Object.assign(camera,{left:cx-extent*aspect,right:cx+extent*aspect,top:cy+extent,bottom:cy-extent});
      camera.updateProjectionMatrix();
      engine.render(scene,camera);
      positionLabels();
      if((flows||fields.length)&&!frozen)schedule();
    }
    function schedule(){if(alive&&!frame)frame=requestAnimationFrame(draw)}
    function resize(){
      width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);
      updateMapKey();engine.setSize(width,height,false);schedule();
    }
    const ro=new ResizeObserver(resize);ro.observe(container);
    const ray=new three.Raycaster();let drag=null;
    canvas.onpointerdown=e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor="grabbing"};
    canvas.onpointermove=e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
      drag.moved=true;rotate(-(dx-drag.dx)*.009,(dy-drag.dy)*.006);drag.dx=dx;drag.dy=dy;
    };
    function end(e,cancel){
      if(!drag||drag.id!==e.pointerId)return;
      if(!cancel&&!drag.moved){
        const r=canvas.getBoundingClientRect();ray.setFromCamera(new three.Vector2((e.clientX-r.left)/width*2-1,1-(e.clientY-r.top)/height*2),camera);
        const editing=activePicking(),pool=editing?pickables.filter(o=>o.userData.editPick):pickables;
        const hit=ray.intersectObjects(pool,false)[0];
        if(hit)hit.object.userData.activate();
        else if(editing&&picker==="point"){
          const landing=ray.ray.intersectPlane(new three.Plane(new three.Vector3(0,1,0),-.13),new three.Vector3());
          if(landing){
            const x=Math.round((landing.x/unit+359)*10)/10,y=Math.round((landing.z/unit+161)*10)/10;
            if(x>=0&&x<=720&&y>=0&&y<=315)sendPick("point",null,x,y);
          }
        }
      }
      drag=null;canvas.style.cursor="grab";
    }
    canvas.onpointerup=e=>end(e,false);canvas.onpointercancel=e=>end(e,true);
    canvas.addEventListener("wheel",e=>{e.preventDefault();setZoom(zoom*Math.exp(clamp(-e.deltaY*.0015,-.45,.45)))},{passive:false});
    canvas.onkeydown=e=>{
      const actions={ArrowLeft:()=>rotate(-.15,0),ArrowRight:()=>rotate(.15,0),ArrowUp:()=>rotate(0,.1),ArrowDown:()=>rotate(0,-.1),"+":()=>setZoom(zoom*1.18),"-":()=>setZoom(zoom/1.18),Home:resetView};
      if(actions[e.key]){e.preventDefault();actions[e.key]()}
    };
    function onRouteFilter(event){
      if(event.detail?.status)dismissPreview();
      statusFilter=event.detail?.status||null;
      focusGroupId=statusFilter==="manual"?(event.detail?.groupId||null):null;
      if(statusFilter){
        const local=event.detail?.floorScope;
        if(local){tower=local.tower;floor=local.floor;}
        site=!local;floorFocus=null;picker="inspect";resetView();
      }
      dirty=true;updatedAt=0;schedule();
    }
    function showEstate(){dismissPreview();site=true;floorFocus=null;picker="inspect";dirty=true;resetView();}
    window.addEventListener("escape-estate-overview",showEstate);
    window.addEventListener("escape-route-filter",onRouteFilter);
    const stopListening=evacuation?.subscribe(()=>{
      if(frozen)frozenTime=evacuation.sample().time;
      updatedAt=0;dirty=true;schedule();
    });
    resize();
    return {
      setFloor(value){if(levels.includes(value)&&floor!==value){floor=value;dirty=true;schedule()}},
      setTower(value){if((value==="E"||value==="W")&&tower!==value){tower=value;dirty=true;schedule()}},
      setDevices(value){devices=value;dirty=true;schedule()},
      setState(value){
        const key=JSON.stringify([value,zh()]);
        if(key!==observedKey){
          if(value.pickMode!==undefined)setPickMode({mode:value.pickMode,tower:value.tower,floor:value.floor});
          state=value;observedKey=key;dirty=true;schedule();
        }
      },
      resize,resetView,inspectFloor,
      destroy(){alive=false;cancelAnimationFrame(frame);window.removeEventListener("escape-plan-preview",changePreview);window.removeEventListener("escape-estate-overview",showEstate);window.removeEventListener("escape-route-filter",onRouteFilter);window.removeEventListener("escape-inspect-floor",onInspect);window.removeEventListener("escape-map-pick-mode",onPick);stopListening?.();ro.disconnect();annotationObserver.disconnect();flows?.dispose();for(const d of disposables)d.dispose();grid.geometry.dispose();grid.material.dispose();backdrop.dispose();shadowMap.dispose();engine.dispose();engine.forceContextLoss();container.replaceChildren()}
    };
  }
  window.EscapeBuilding3D={mount};
})();
