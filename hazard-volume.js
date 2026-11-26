/* Qualitative drill overlay. Its distances are floor-plan units and its time is
   playback time. The named seat belongs to the scenario, not to a detector. */
(function (host) {
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const number=(n,fallback)=>Number.isFinite(n)?n:fallback;
  const insideRect=(x,y,[l,t,r,b])=>x>=l&&x<=r&&y>=t&&y<=b;
  function inPolygon(x,y,polygon){
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,ay]=polygon[i],[bx,by]=polygon[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
  }
  function wallDistance(x,y,[a,b,c,d]){
    const dx=c-a,dy=d-b,t=clamp(((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(x-a-t*dx,y-b-t*dy);
  }
  function reading(report={},tower,floor){
    const name=String(report.source||report.id||report.label||'').toUpperCase();
    if(/(?:^|[-\s])S\d+\b|SMOKE|煙感|煙霧/.test(name))return {phenomenon:'smoke-layer',heat:0,smoke:.68};
    if(report.phenomenon)return {phenomenon:report.phenomenon,heat:report.heat||0,smoke:report.smoke||0,visualOrigin:report.visualOrigin};
    // A logged detector alone never establishes a point ignition source.
    if(tower==='E'&&String(floor).padStart(2,'0')==='02'&&/^D4\b/.test(name))return {phenomenon:'heated-layer',heat:.46,smoke:0};
    return {phenomenon:'none',heat:0,smoke:0};
  }
  function profile(report,sample,tower,level){
    const base=reading(report,tower,level),s=sample||base;
    const type=base.phenomenon==='smoke-layer'?'smoke-layer':s.phenomenon||base.phenomenon;
    const seat=type==='scripted-fire-seat'&&!!(s.visualOrigin||report.visualOrigin)&&!!(s.simulated||report.simulated);
    const smokeOnly=type==='smoke-layer';
    const heat=smokeOnly?0:clamp(Number(s.heat)||0,0,1),smoke=clamp(Number(s.smoke)||0,0,1);
    const source=seat?(s.visualOrigin||report.visualOrigin):report;
    const x=number(source.x,number(s.x,NaN)),y=number(source.y,number(s.y,NaN));
    const size=clamp(number(s.radius,number(report.radius,32)),19,64);
    return {x,y,heat,smoke,seat,type:seat?'scripted-fire-seat':heat?'heated-layer':smoke?'smoke-layer':'none',
      initialReach:size*(seat?1.76:smokeOnly?1.60:1.30),maxReach:size*(seat?3.70:smoke>.8?3.55:2.75),
      heatReach:size*(seat?1.37:1.09),seed:Math.abs(x*.11+y*.37)%21};
  }
  // Dijkstra on occupied air cells. Blocking solid boundaries before the search
  // makes a room accessible only through a plan opening. A closed exterior or
  // stair void is excluded independently of the radial spread from the origin.
  function fieldMap(cfg,layout){
    const step=3,extentX=cfg.maxReach/.88+9,extentY=cfg.maxReach+9;
    const minX=Math.floor((cfg.x-extentX)/step)*step,minY=Math.floor((cfg.y-extentY)/step)*step;
    const w=Math.ceil((cfg.x+extentX-minX)/step)+1,h=Math.ceil((cfg.y+extentY-minY)/step)+1;
    const clear=new Uint8Array(w*h),dist=new Float32Array(w*h).fill(Infinity);
    const boundaries=layout.walls.concat(layout.shellWalls(2)).filter(([x1,y1,x2,y2])=>Math.max(x1,x2)>=minX-3&&Math.min(x1,x2)<=minX+w*step+3&&Math.max(y1,y2)>=minY-3&&Math.min(y1,y2)<=minY+h*step+3);
    const shafts=Object.values(layout.stairs);let start=-1,nearest=Infinity;
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const x=minX+i*step,y=minY+j*step,index=j*w+i;
      if(!inPolygon(x,y,layout.outline)||shafts.some(s=>insideRect(x,y,s.hole)&&!insideRect(x,y,s.topLanding)))continue;
      if(boundaries.some(seg=>wallDistance(x,y,seg)<=step*.54))continue;
      clear[index]=1;const near=Math.hypot(x-cfg.x,y-cfg.y);if(near<nearest){nearest=near;start=index;}
    }
    const heap=[];
    function push(value,id){
      let k=heap.length;const rec=[value,id];heap.push(rec);
      while(k>0){const up=(k-1)>>1;if(heap[up][0]<=value)break;heap[k]=heap[up];k=up;}heap[k]=rec;
    }
    function pop(){
      const top=heap[0],tail=heap.pop();if(heap.length){let k=0;
        while(k*2+1<heap.length){let next=k*2+1;if(next+1<heap.length&&heap[next+1][0]<heap[next][0])next++;
          if(heap[next][0]>=tail[0])break;heap[k]=heap[next];k=next;}heap[k]=tail;
      }return top;
    }
    if(start>=0&&nearest<=step*2){dist[start]=0;push(0,start);}
    const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(heap.length){
      const [d,idx]=pop();if(d>dist[idx]+1e-4||d>cfg.maxReach+step)continue;
      const ix=idx%w,iy=Math.floor(idx/w);
      for(const [dx,dy] of directions){const nx=ix+dx,ny=iy+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
        const next=ny*w+nx;if(!clear[next]||(dx&&dy&&(!clear[iy*w+nx]||!clear[ny*w+ix])))continue;
        const axial=dx<0?.88:dx>0?1.08:1.06;
        const cost=d+(dx&&dy?step*Math.SQRT2:step)*axial;if(cost>dist[next]-1e-4||cost>cfg.maxReach+step)continue;
        dist[next]=cost;push(cost,next);
      }
    }
    const bytes=new Uint8Array(w*h*4),maximum=cfg.maxReach+step*2;
    for(let k=0;k<w*h;k++){const hit=Number.isFinite(dist[k]);bytes[4*k]=hit?Math.round(254*Math.min(1,dist[k]/maximum)):255;
      bytes[4*k+1]=hit?255:0;bytes[4*k+2]=0;bytes[4*k+3]=255;}
    return {w,h,step,minX,minY,maximum,dist,bytes};
  }
  function clockState(seconds,reduced){
    const t=Math.max(0,number(seconds,0));return {grow:1-Math.exp(-t/54),phase:reduced?0:t%16384};
  }
  const cache=new WeakMap();
  function mappedFloor(cfg,layout){
    let maps=cache.get(layout);if(!maps){maps=new Map();cache.set(layout,maps);}
    const key=[cfg.x,cfg.y,cfg.maxReach].join('/');
    if(!maps.has(key)){if(maps.size>=10)maps.delete(maps.keys().next().value);maps.set(key,fieldMap(cfg,layout));}
    return maps.get(key);
  }
  const vertex=`varying vec3 pBox;
    void main(){pBox=position+vec3(.5);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const fragment=`
    varying vec3 pBox;
    uniform sampler2D field;
    uniform vec2 groundSpan,groundMin,origin;
    uniform vec3 worldSpan;
    uniform float maxDist,initialReach,maxReach,heatReach,hot,soot,isSeat,growth,phase,seed,ceilingHeight;
    float wave(vec2 p,float h){
      return .55*sin(p.x*.086+p.y*.047+h*3.7+seed-phase*.32)+.28*sin(-p.x*.148+p.y*.065-h*5.0+phase*.48)+.17*sin(p.x*.231-p.y*.118+h*8.9+seed*2.1-phase*.23);
    }
    void main(){
      vec3 forward=-vec3(viewMatrix[0][2],viewMatrix[1][2],viewMatrix[2][2]);
      vec3 ray=normalize(forward/worldSpan);
      vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))/max(abs(ray),vec3(.00001));
      vec3 limits=(step(vec3(0.),ray)-pBox)*inv;
      float through=min(limits.x,min(limits.y,limits.z));if(through<.00005)discard;
      float delta=through/float(FIELD_STEPS),ds=length(ray*worldSpan)*delta/ceilingHeight,reach=mix(initialReach,maxReach,growth);
      vec4 accum=vec4(0.);float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
      for(int i=0;i<FIELD_STEPS;i++){
        vec3 p=pBox+ray*delta*(float(i)+.19+.62*jitter);
        vec2 map=texture2D(field,clamp(p.xz,vec2(0.),vec2(1.))).rg;
        if(map.g<.70)continue;
        float geo=map.r*maxDist*(255./254.);
        if(geo>reach+5.)continue;
        vec2 xy=groundMin+p.xz*groundSpan,offset=xy-origin;
        float h=p.y,wrinkle=wave(offset,h);
        float edge=1.-smoothstep(reach*.79,reach+1.,geo);
        float cap=1.-smoothstep(.94,1.,h);
        float skew=h*h,mid=sin(h*3.14159);vec2 drift=vec2(-8.5*skew+3.4*sin(h*8.4-phase*.46+seed)*mid,3.1*skew+2.0*sin(phase*.31-h*9.)*mid);
        vec2 centred=offset-drift;
        float radius=(5.3+11.9*pow(h,.77))*(.90+.10*growth)*(1.+.19*wrinkle);
        float radial=length(centred*vec2(.97,1.03));
        float plume=isSeat*exp(-pow(radial/max(radius,1.),2.)*1.45)*smoothstep(.012,.07,h)*cap;
        float thermalFall=exp(-pow(geo/max(heatReach*(.79+.21*growth),1.),1.17));
        float ceilingBand=.75+.10*min(1.,geo/max(heatReach,1.))-.033*wrinkle;
        float ceilingJet=smoothstep(ceilingBand,ceilingBand+.115,h)*cap*thermalFall*edge;
        float thermal=hot*(plume*(1.23-.39*h)+ceilingJet*(.72+.34*growth));
        float smokeCore=isSeat*exp(-pow(radial/(radius*1.52),2.)*1.16)*smoothstep(.22,.58,h)*(.40+.15*wrinkle);
        float roll=.5+.5*sin(offset.x*.10-offset.y*.054+seed+phase*.16);
        float layerBase=.78-.18*growth-.14*(1.-min(1.,geo/(reach+1.)))-.085*wrinkle-.030*roll;
        float upper=smoothstep(layerBase-.055,layerBase+.07,h)*cap;
        float mixDensity=soot*(upper*edge*exp(-geo/(reach*.88))*(.76+.18*wrinkle)+smokeCore*cap);
        float dh=thermal*6.65,dm=mixDensity*5.65,density=dh+dm;
        if(density<.005)continue;
        float warm=clamp(plume*(1.12-.30*h)+ceilingJet,0.,1.);
        vec3 thermalColor=mix(vec3(.30,.025,.005),vec3(.99,.19,.010),smoothstep(.05,.64,warm));
        thermalColor=mix(thermalColor,vec3(1.,.67,.17),smoothstep(.64,.98,warm));
        vec3 smokeColor=mix(vec3(.014,.020,.022),vec3(.154,.165,.177),clamp(.15+h*.32+.34*wrinkle,0.,1.));
        float alpha=1.-exp(-density*ds);vec3 col=(thermalColor*dh+smokeColor*dm)/density;
        accum.rgb+=(1.-accum.a)*alpha*col;accum.a+=(1.-accum.a)*alpha;
        if(accum.a>.93)break;
      }
      if(accum.a<.012)discard;gl_FragColor=vec4(accum.rgb/accum.a,min(.89,accum.a));
      #include <colorspace_fragment>
    }`;
  function createField(three,options){
    const {report={},sample,tower,level,at,site=false,reducedMotion=false,layer='all'}=options;
    const group=new three.Group(),cfg=profile(report,sample,tower,level);group.name='Drill field / '+String(report.id||report.label||level);
    const resources=[];let uniforms=null;
    const hot=layer==='smoke'?0:cfg.heat,soot=layer==='heat'?0:cfg.smoke;
    if((hot||soot)&&Number.isFinite(cfg.x)&&Number.isFinite(cfg.y)&&host.EscapeBuildingLayout&&typeof at==='function'){
      const map=mappedFloor(cfg,host.EscapeBuildingLayout);
      const height=number(options.floorHeight,site?1.74:3),minX=map.minX-map.step/2,minY=map.minY-map.step/2,spanX=map.w*map.step,spanY=map.h*map.step;
      const texture=new three.DataTexture(map.bytes,map.w,map.h,three.RGBAFormat);texture.minFilter=three.LinearFilter;texture.magFilter=three.LinearFilter;
      texture.unpackAlignment=1;texture.generateMipmaps=false;texture.needsUpdate=true;
      const corner=at(minX,minY,Number(level)),far=at(minX+spanX,minY+spanY,Number(level));
      const dx=far.x-corner.x,dz=far.z-corner.z;
      const floorClearance=.039,ceiling=.935,fieldHeight=height*(ceiling-floorClearance);
      uniforms={field:{value:texture},groundSpan:{value:new three.Vector2(spanX,spanY)},groundMin:{value:new three.Vector2(minX,minY)},origin:{value:new three.Vector2(cfg.x,cfg.y)},
        worldSpan:{value:new three.Vector3(dx,fieldHeight,dz)},maxDist:{value:map.maximum},initialReach:{value:cfg.initialReach},maxReach:{value:cfg.maxReach},heatReach:{value:cfg.heatReach},
        hot:{value:hot},soot:{value:soot},isSeat:{value:cfg.seat?1:0},growth:{value:0},phase:{value:0},seed:{value:cfg.seed},ceilingHeight:{value:height}};
      const material=new three.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,defines:{FIELD_STEPS:site?22:36},side:three.FrontSide,transparent:true,depthWrite:false,toneMapped:false});
      const geometry=new three.BoxGeometry(1,1,1),mesh=new three.Mesh(geometry,material);
      mesh.position.set((corner.x+far.x)/2,corner.y+height*(ceiling+floorClearance)/2,(corner.z+far.z)/2);mesh.scale.set(dx,fieldHeight,dz);mesh.renderOrder=7;
      group.add(mesh);resources.push(geometry,material,texture);
      group.userData.field={kind:cfg.type,source:[cfg.x,cfg.y],floor:Number(level),heat:hot,smoke:soot,ceiling,grid:[map.w,map.h]};
    }
    return {group,update(seconds){if(uniforms){const time=clockState(seconds,reducedMotion);uniforms.growth.value=time.grow;uniforms.phase.value=time.phase;}},dispose(){for(const r of resources)r.dispose();group.clear();}};
  }
  const api={createField,reading,profile,fieldMap,clockState};host.EscapeHazardVolume=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
