/* All horizontal coordinates are in the same 720 × 315 plan. Level 1 is the
   ground floor, 12 the top residential floor, and 13 its roof. */
(function(host){
  'use strict';
  const outline=[[37,119],[129,119],[129,48],[267,48],[267,37],[482,37],[482,61],[583,61],[583,112],[680,112],[680,215],[586,215],[586,275],[459,275],[459,285],[255,285],[255,274],[132,274],[132,213],[37,213]];
  const walls=[
    [128,119,128,147],[128,168,128,213],[128,148,153,148],[171,148,253,148],[275,148,319,148],[341,148,474,148],[499,148,583,148],
    [583,112,583,146],[583,174,583,215],[130,196,201,196],[222,196,291,196],[291,196,291,251],[291,275,291,283],
    [364,283,364,273],[364,252,364,196],[364,196,439,196],[460,196,582,196],
    [194,49,194,89],[194,110,194,147],[261,48,261,110],[261,130,261,148],[318,40,318,77],[318,95,318,146],
    [399,40,399,84],[399,103,399,147],[471,39,471,137],[192,197,192,228],[192,245,192,273],[259,197,259,234],
    [259,254,259,282],[433,197,433,240],[433,259,433,283],[496,197,496,225],[496,244,496,275],
    [259,87,318,87],[400,101,471,101],[567,92,582,92],[481,92,538,92],[293,251,308,251],[331,251,359,251]
  ];
  const corridors=[
    [116,150,133,165],[132,150,581,193],[580,151,600,171],
    [294,192,361,249],[311,247,328,267],[155,139,169,151],[255,139,273,151],
    [321,139,338,151],[476,139,496,151],[204,192,218,209],[442,192,458,209]
  ];
  const roofGeometry=[[38,120,679,212],[133,211,585,273],[256,272,458,282]];
  const roofPaths={A:[[320,260],[248,260],[151,241],[141,207],[119,160]],B:[[320,260],[404,254],[551,236],[568,206],[596,160]]};
  const navTrunk=[['A',119],['west-lobby',136],['west-door',162],['west-south',211],['mid-west',264],['mid-hall',299],['central-junction',329],['mid-east',366],['east-hall',410],['east-south',449],['east-door',486],['east-approach',515],['east-watch',555],['east-lobby',584],['B',596]];
  const navBranches=[['north-01',162,141,'west-door'],['south-06',211,203,'west-south'],['north-02',264,141,'mid-west'],['north-lift',329,141,'central-junction'],['north-04',486,141,'east-door'],['south-05',449,203,'east-south'],['central-lobby',329,215,'central-junction'],['central-vestibule',320,240,'central-lobby'],['central-entry',320,260,'central-vestibule']];
  const doors=[
    ['unit-01',[153,148],[171,148]],['unit-02',[253,148],[275,148]],['unit-03',[319,148],[341,148]],['unit-04',[474,148],[499,148]],
    ['unit-05',[439,196],[460,196]],['unit-06',[201,196],[222,196]],['stair-A',[128,147],[128,168]],['stair-B',[583,146],[583,174]],
    ['central-entry',[308,251],[331,251]],['grade-A',[37,197],[37,212]],['grade-B',[680,197],[680,212]]
  ].map(([id,a,b])=>({id,a,b,kind:id.startsWith('grade-')?'exit':id.startsWith('stair-')?'stair':'door'}));
  const flatApproaches={
    'north-01':[[152,74],[162,112],[162,141]],'north-02':[[216,108],[247,120],[265,120],[264,141]],
    'north-lift':[[303,111],[306,94],[316,91],[324,91],[329,112],[329,141]],
    'north-04':[[423,112],[447,128],[462,142],[479,142],[486,141]],
    'south-05':[[446,234],[449,220],[449,203]],'south-06':[[224,237],[217,226],[211,203]]
  };
  const stairs={
    A:{id:'A',hole:[44,134,115,191],topLanding:[99,135,120,190],midLanding:[44,135,57,190],entry:[119,160],near:101,far:55,exteriorDoor:[37,205],outside:[22,205]},
    B:{id:'B',hole:[600,134,671,191],topLanding:[595,135,615,190],midLanding:[657,135,671,190],entry:[596,160],near:614,far:659,exteriorDoor:[680,205],outside:[697,205]}
  };
  const landingY=[147,177];
  const floorCode=level=>String(Math.max(1,Math.min(12,Math.round(level)))).padStart(2,'0');
  function part(x,y,level,kind,id,extra={}){return {x,y,level,floor:floorCode(level),kind,nodeId:id,roof:false,outside:false,...extra};}
  function stairFlights(id,upper){
    const s=stairs[id];if(!s||!Number.isInteger(upper)||upper<2||upper>13)return [];
    return landingY.map((y,idx)=>{
      const x0=idx?s.far:s.near,x1=idx?s.near:s.far,high=upper-idx*.5,low=high-.5;
      const from=part(x0,y,high,'stair',`${id}:flight:${upper}:${idx}:start`,{stair:id}),to=part(x1,y,low,'stair',`${id}:flight:${upper}:${idx}:end`,{stair:id});
      const treads=Array.from({length:8},(_,i)=>{
        const a=x0+(x1-x0)*i/8,b=x0+(x1-x0)*(i+1)/8;
        return {rect:[Math.min(a,b),y-6.8,Math.max(a,b),y+6.8],level:high-(i+.5)/16};
      });
      return {id:`${id}-${upper}-${idx+1}`,width:13.6,from,to,treads};
    });
  }
  function stairRoute(id,upper){
    const s=stairs[id],flights=stairFlights(id,upper);if(!flights.length)return [];
    const [first,second]=flights;const side=id==='A'?1:-1;
    const p=(x,y,level,alias)=>part(x,y,level,'landing',`${id}:landing:${upper}:${alias}`,{stair:id});
    return [p(...s.entry,upper,'upper-door'),p(s.near+side*5,160,upper,'upper-turn'),first.from,first.to,
      p(s.far-side*5,147,upper-.5,'return-1'),p(s.far-side*5,177,upper-.5,'return-2'),second.from,second.to,
      p(s.near+side*5,160,upper-1,'lower-turn'),p(...s.entry,upper-1,'lower-door')];
  }
  function discharge(id){
    if(!stairs[id])return [];
    const path=id==='A'?[[119,160],[122,183],[119,200],[98,205],[61,205],[37,205],[22,205]]:
      [[596,160],[592,181],[596,200],[621,205],[654,205],[680,205],[697,205]];
    return path.map(([x,y],i)=>part(x,y,1,i===path.length-1?'outside':i===path.length-2?'exit-portal':'ground-corridor',`grade-${id}-${i}`,{exitId:id,outside:i===path.length-1}));
  }
  const groundZones={A:[[115,150,127,201],[96,198,122,209],[35,200,100,211],[15,198,38,215]],B:[[587,150,601,202],[592,197,625,209],[620,200,682,212],[679,198,705,215]]};
  function shellWalls(level){
    const out=[];
    outline.forEach((p,i)=>{
      const q=outline[(i+1)%outline.length];
      if(Number(level)===1&&p[0]===q[0]&&(p[0]===37||p[0]===680)){
        const y0=Math.min(p[1],q[1]),y1=Math.max(p[1],q[1]);out.push([p[0],y0,p[0],197],[p[0],212,p[0],y1]);
      }else out.push([...p,...q]);
    });
    return out;
  }
  function perimeter(level){return shellWalls(level);}
  const api={viewBox:[0,0,720,315],outline,walls,doors,corridors,stairs,roofGeometry,roofPaths,roofHolding:{x:320,y:260,level:13,floor:'12',roof:true},flatApproaches,navTrunk,navBranches,
    floorCode,stairFlights,stairRoute,discharge,groundZones,shellWalls,perimeter};
  host.EscapeBuildingLayout=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
