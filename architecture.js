/* The structural cutaway and the evacuation paths use the same plan in building-layout.js. */
(() => {
  "use strict";
  function create({three, layout, group, keep, material, at, focus, pickFloor, dimensions}) {
    const boxes = new Map(), strokes = new Map(), slabShapes = new Map();
    const cube = keep(new three.BoxGeometry(1, 1, 1));
    const identity = new three.Quaternion();
    const faceTints=[], faceted=new Map(), normals=cube.getAttribute("normal");
    for(let i=0;i<normals.count;i++){
      const top=normals.getY(i)>.5,side=Math.abs(normals.getX(i))>.5;
      const value=top?1:side?.73:.85;
      faceTints.push(value,value,value);
    }
    cube.setAttribute("color",new three.Float32BufferAttribute(faceTints,3));
    const {planX,planZ,height}=dimensions;

    function brick(tower, rect, low, high, mat) {
      const [ax, ay, bx, by] = rect;
      const center = at(tower, (ax + bx) / 2, (ay + by) / 2, (low + high) / 2);
      const size = new three.Vector3(Math.abs(bx - ax) * planX, (high - low) * height, Math.abs(by - ay) * planZ);
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
      if (!boxes.has(mat)) boxes.set(mat, []);
      boxes.get(mat).push(new three.Matrix4().compose(center, identity, size));
    }
    function stroke(start, end, color, opacity) {
      const key = color + "/" + opacity;
      if (!strokes.has(key)) strokes.set(key, {color, opacity, vertices: []});
      strokes.get(key).vertices.push(start.x,start.y,start.z,end.x,end.y,end.z);
    }
    function rectLine(tower, rect, level, color, opacity) {
      const [ax,ay,bx,by] = rect;
      const corners = [[ax,ay],[bx,ay],[bx,by],[ax,by]];
      for (let i = 0; i < corners.length; i++) {
        stroke(at(tower,...corners[i],level),at(tower,...corners[(i+1)%4],level),color,opacity);
      }
    }
    function wall(tower, ends, level, rise, wallMaterial, thickness) {
      const [ax,ay,bx,by] = ends, pad = thickness / 2;
      brick(tower,[Math.min(ax,bx)-(ax===bx?pad:0), Math.min(ay,by)-(ay===by?pad:0),
        Math.max(ax,bx)+(ax===bx?pad:0), Math.max(ay,by)+(ay===by?pad:0)],level,level+rise,wallMaterial);
    }
    function frame(tower, a, b, level, rise, mat, width) {
      for (const [x,y] of [a,b]) brick(tower,[x-width,y-width,x+width,y+width],level,level+rise,mat);
      const [ax,ay] = a, [bx,by] = b;
      brick(tower,[Math.min(ax,bx)-width,Math.min(ay,by)-width,Math.max(ax,bx)+width,Math.max(ay,by)+width],
        level+rise-.036,level+rise,mat);
    }
    function plate(tower, level, color, opacity, detailed) {
      const hasWells = level > 1;
      const key = String(hasWells);
      if (!slabShapes.has(key)) {
        const shape = new three.Shape();
        layout.outline.forEach(([x,y],i)=>shape[i?"lineTo":"moveTo"](x*planX,-y*planZ));
        shape.closePath();
        if (hasWells) for (const stair of Object.values(layout.stairs)) {
          const [l,n,r,s] = stair.hole;
          const hole = new three.Path();
          [[l,n],[l,s],[r,s],[r,n]].forEach(([x,y],i)=>hole[i?"lineTo":"moveTo"](x*planX,-y*planZ));
          hole.closePath();
          shape.holes.push(hole);
        }
        const geometry = keep(new three.ExtrudeGeometry(shape,{depth:height*.043,bevelEnabled:false,curveSegments:1}));
        geometry.rotateX(-Math.PI/2);
        slabShapes.set(key,geometry);
      }
      const slab = new three.Mesh(slabShapes.get(key),material(color,opacity,true));
      slab.position.copy(at(tower,0,0,level-.044));
      slab.renderOrder=1;group.add(slab);
      if(level<=12) pickFloor(slab,tower,level);
      for(let i=0;i<layout.outline.length;i++){
        const a=layout.outline[i], b=layout.outline[(i+1)%layout.outline.length];
        stroke(at(tower,...a,level-.006),at(tower,...b,level-.006),0x5c586c,detailed?.52:(focus?.21:.32));
      }
    }
    function stair(tower, id, upperLevel, detailed, showFlights) {
      const core = layout.stairs[id], stairTint = 0x827d91;
      const stepMat = material(stairTint,detailed?.83:(focus?.28:.42),true);
      const platformMat = material(0xa9a2ae,detailed?.80:(focus?.31:.42),true);
      brick(tower,core.topLanding,upperLevel-.041,upperLevel,platformMat);
      if(upperLevel<=1||!showFlights) return;
      brick(tower,core.midLanding,upperLevel-.54,upperLevel-.5,platformMat);
      const flights=layout.stairFlights(id,upperLevel);
      for(const flight of flights){
        for(const tread of flight.treads) brick(tower,tread.rect,tread.level-.079,tread.level,stepMat);
        // Both stringers follow the same run as the tread geometry and the moving people.
        const from=flight.from, to=flight.to, dx=to.x-from.x, dy=to.y-from.y, len=Math.hypot(dx,dy);
        if(!len)continue;
        const sideOffset=(flight.width/2-1.5)/len;
        for(const sign of [-1,1]){
          const sx=-dy*sideOffset*sign,sy=dx*sideOffset*sign;
          stroke(at(tower,from.x+sx,from.y+sy,from.level+.16),at(tower,to.x+sx,to.y+sy,to.level+.16),0x545467,detailed?.65:(focus?.20:.36));
        }
        if(detailed)for(const tread of flight.treads){
          const [x1,y1,x2,y2]=tread.rect;
          if(Math.abs(dx)>Math.abs(dy)){
            const x=dx>0?x1:x2;
            stroke(at(tower,x,y1,tread.level+.004),at(tower,x,y2,tread.level+.004),0xdedbe1,.87);
          }else{
            const y=dy>0?y1:y2;
            stroke(at(tower,x1,y,tread.level+.004),at(tower,x2,y,tread.level+.004),0xdedbe1,.87);
          }
        }
      }
      if(detailed)rectLine(tower,core.hole,upperLevel+.005,0x666476,.58);
    }
    function gradeExit(tower,id) {
      const core=layout.stairs[id], [x,y]=core.exteriorDoor;
      const portal=layout.doors.find(d=>d.id==="grade-"+id);
      const a=portal?.a||[x,y-7],b=portal?.b||[x,y+7];
      frame(tower,a,b,1,.73,material(0x4d6863,.82,true),1.55);
      for(const rect of layout.groundZones[id])
        brick(tower,rect,1.001,1.008,material(0xa5b2ae,.50,true));
    }
    function fitOut(tower,level) {
      // Keep furnishings against internal room edges, clear of the six mapped door approaches.
      const furniture=[[141,103,149,126],[201,61,229,73],[270,56,294,68],
        [411,52,436,64],[464,250,489,263],[235,249,253,261]];
      const base=material(0xa9a1ad,.88,true),seat=material(0xe5e1da,.97,true),back=material(0xbdb6c2,.90,true);
      for(const rect of furniture){
        const [x,y,xx,yy]=rect;
        brick(tower,rect,level+.025,level+.10,base);
        brick(tower,[x+.7,y+.7,xx-.7,yy-.7],level+.10,level+.15,seat);
        if(xx-x>yy-y)brick(tower,[x,y,xx,y+2.7],level+.08,level+.235,back);
        else brick(tower,[x,y,x+2.7,yy],level+.08,level+.235,back);
      }
    }
    function cutDeck(tower,level){
      plate(tower,level,0xa9a7b2,.12,false);
      for(const core of Object.values(layout.stairs))
        brick(tower,core.topLanding,level-.041,level,material(0xa8a5b4,.45,true));
    }
    function aboveLanding(tower,upper,roof){
      // The section removes the storey above. The upper return flight remains
      // attached to this landing and identifies which way continues upward.
      if(roof){for(const id of ["A","B"])stair(tower,id,upper,false,true);return;}
      for(const id of ["A","B"]){
        const core=layout.stairs[id],flight=layout.stairFlights(id,upper)[1];
        if(!flight)continue;
        brick(tower,core.midLanding,upper-.54,upper-.5,material(0xb9b3bf,.47,true));
        for(const t of flight.treads)
          brick(tower,t.rect,t.level-.068,t.level,material(0xa6a2b3,.59,true));
        const {from,to}=flight;
        stroke(at(tower,from.x,from.y+6.25,from.level+.15),at(tower,to.x,to.y+6.25,to.level+.15),0x756e80,.50);
      }
    }
    function doorsAndFittings(tower,level) {
      const leaf=material(0xa4a0b0,.48,true),sill=material(0xded9ce,.76,true);
      for(const d of layout.doors){
        if(d.kind==="exit")continue;
        const [a,b]=[d.a,d.b],horizontal=a[1]===b[1];
        const inward=horizontal?(a[1]<170?-1:1):(a[0]<350?-1:1);
        const reach=Math.min(17,Math.hypot(b[0]-a[0],b[1]-a[1])*.78);
        const l=horizontal?[a[0],a[1],a[0]+1.9,a[1]+inward*reach]:
          [a[0],a[1],a[0]+inward*reach,a[1]+1.9];
        brick(tower,l,level+.005,level+.48,leaf);
        const threshold=horizontal?[a[0],a[1]-1.5,b[0],b[1]+1.5]:[a[0]-1.5,a[1],b[0]+1.5,b[1]];
        brick(tower,threshold,level+.012,level+.016,sill);
      }
      // Lift enclosure and landing jambs stay inside the recess along the northern bay.
      for(const x of [345,371]){
        brick(tower,[x-8,45,x+8,47],level,level+.51,material(0x928d9d,.67,true));
        brick(tower,[x-8.6,47,x-7,63],level,level+.49,material(0xb0adba,.53,true));
        brick(tower,[x+7,47,x+8.6,63],level,level+.49,material(0xb0adba,.53,true));
        brick(tower,[x-7,63,x+7,64.2],level,level+.42,material(0xbcc0c6,.59,true));
        stroke(at(tower,x,64.4,level),at(tower,x,64.4,level+.42),0x786f82,.52);
      }
      const serviceUnit=material(0xb9b3bb,.79,true),finish=material(0xe1dbd2,.86,true);
      for(const [x,y,w,d] of [[179,58,8,17],[251,56,6,21],[308,52,6,16],[462,49,6,17],[482,237,11,6],[244,204,10,6]]){
        brick(tower,[x,y,x+w,y+d],level+.02,level+.23,serviceUnit);
        brick(tower,[x-.3,y-.3,x+w+.3,y+d+.3],level+.23,level+.25,finish);
      }
      if(level===1){
        brick(tower,[297,225,303,243],level+.02,level+.26,serviceUnit);
        brick(tower,[297,225,303,243],level+.26,level+.285,finish);
      }
    }
    function rooftop(tower,level){
      const curb=material(0xaaa4b3,.53,true),top=material(0xc7c3cd,.69,true);
      for(const [x,y] of [[348,68],[388,78]]){
        brick(tower,[x-10,y-7,x+10,y+7],level,level+.12,curb);
        brick(tower,[x-10.5,y-7.5,x+10.5,y+7.5],level+.12,level+.14,top);
        for(let k=-5;k<=5;k+=5)stroke(at(tower,x+k,y-4,level+.145),at(tower,x+k,y+4,level+.145),0x676175,.54);
      }
    }
    function floor(tower,level,detailed=false,showFlights=true){
      const roof=level===13;
      plate(tower,level,roof?0xc9c5cf:0xb3b0bc,detailed?.60:(focus?.15:.22),detailed);
      if(!roof) {
        if(detailed){fitOut(tower,level);doorsAndFittings(tower,level);}
        const column=material(0x736d82,detailed?.53:(focus?.16:.21),true);
        for(const [x,y] of [[134,121],[265,52],[477,65],[579,117],[580,209],[462,271],[258,270],[135,209]]){
          brick(tower,[x-1.7,y-1.7,x+1.7,y+1.7],level,level+(detailed?.62:.99),column);
        }
        for(const segment of layout.shellWalls(level)) {
          wall(tower,segment,level,detailed?.55:.87,material(0x888499,detailed?.27:(focus?.039:.071),true),2.6);
        }
        for(const segment of layout.walls){
          wall(tower,segment,level,detailed?.54:.53,material(0x837e90,detailed?.32:(focus?.052:.078),true),2.3);
          if(detailed)stroke(at(tower,segment[0],segment[1],level+.54),
            at(tower,segment[2],segment[3],level+.54),0x666071,.45);
        }
        const corridor=layout.corridors;
        for (const rect of corridor) {
          brick(tower,rect,level+.003,level+.009,material(0xfaf8f1,detailed?.77:(focus?.17:.25),true));
        }
        for(const door of layout.doors){
          if(door.kind==="exit")continue;
          if(detailed||door.kind==="stair"){
            frame(tower,door.a,door.b,level,detailed?.68:.6,material(0x625d75,detailed?.69:.25,true),detailed?1.1:1);
          }
        }
      }else{
        rooftop(tower,level);
        for(const path of Object.values(layout.roofPaths)){
          for(let i=1;i<path.length;i++){
            const a=path[i-1],b=path[i];
            stroke(at(tower,...a,level+.014),at(tower,...b,level+.014),0x777186,.28);
          }
        }
      }
      for(const id of ["A","B"]){
        stair(tower,id,level,detailed,showFlights);
        if(level===1)gradeExit(tower,id);
        if(roof){
          const core=layout.stairs[id],r=core.hole;
          // Frame the protected roof opening on the side where the service walk arrives.
          for(const [x,y] of [[r[0],r[1]],[r[0],r[3]],[r[2],r[1]],[r[2],r[3]]])
            brick(tower,[x-1.2,y-1.2,x+1.2,y+1.2],level,level+.42,material(0x5d596e,.60,true));
          rectLine(tower,r,level+.42,0x696578,.55);
          const inset=core.entry[0]<(r[0]+r[2])/2?r[2]:r[0];
          wall(tower,[inset,r[1],inset,r[3]],level,.42,material(0x928b9b,.32,true),1.8);
        }
      }
    }
    function finish(){
      for(const [mat,matrices] of boxes){
        if(!faceted.has(mat)){const copy=keep(mat.clone());copy.vertexColors=true;faceted.set(mat,copy);}
        const batch=keep(new three.InstancedMesh(cube,faceted.get(mat),matrices.length));
        matrices.forEach((m,i)=>batch.setMatrixAt(i,m));
        batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();
        batch.renderOrder=2;group.add(batch);
      }
      for(const {color,opacity,vertices} of strokes.values()){
        const geometry=keep(new three.BufferGeometry());
        geometry.setAttribute("position",new three.Float32BufferAttribute(vertices,3));
        const mat=keep(new three.LineBasicMaterial({color,opacity,transparent:true,depthWrite:false}));
        const lines=new three.LineSegments(geometry,mat);
        lines.renderOrder=3;group.add(lines);
      }
    }
    return {floor,finish,cutDeck,aboveLanding};
  }
  window.EscapeArchitecture={create};
})();
