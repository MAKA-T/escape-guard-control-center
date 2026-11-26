/* Geometry shared by the floor access editor and the group guidance desk. */
(function () {
  "use strict";
  const floors = new Map();
  const scenario = window.EscapeEvacuation.shared;

  function remember(snapshot) {
    const key = snapshot.tower + snapshot.floor;
    if (snapshot.edges.some(edge => edge.closed) ||
        snapshot.alerts.some(alert => alert.status !== "resolved") ||
        snapshot.exits.some(exit => !exit.active && !exit.custom)) {
      floors.set(key, snapshot);
    } else {
      floors.delete(key);
    }
  }

  function touchesEntrance(a,b,stair) {
    const opening = window.EscapeBuildingLayout.stairs[stair].entry;
    const at = p => Math.hypot(p.x-opening[0],p.y-opening[1]) < 2;
    if (a.level === 1 && (a.exitId === stair || b.exitId === stair) &&
        (a.kind === "exit-portal" || b.kind === "exit-portal")) return true;
    // A closed floor entrance does not close the flight behind its door.
    const hallSide = p => stair === "A" ? p.x > opening[0]+2 : p.x < opening[0]-2;
    return (at(a) && hallSide(b)) || (at(b) && hallSide(a));
  }

  function conflict(points) {
    if (!floors.size) return null;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i];
      if (a.tower!==b.tower || a.level!==b.level || !Number.isInteger(a.level) ||
          a.level>12 || a.roof || b.roof || (a.outside && b.outside)) continue;
      const snapshot=floors.get(a.tower+String(a.level).padStart(2,"0"));
      if (!snapshot) continue;
      const closed=snapshot.exits.find(exit=>!exit.active && !exit.custom && touchesEntrance(a,b,exit.id));
      if (closed || window.EscapeRouting.restrictedSegment(snapshot,a,b)) return snapshot;
    }
    return null;
  }

  function check(groupId,optionId) {
    const hit=scenario.remainingPaths(groupId,optionId).map(conflict).find(Boolean);
    if (!hit) return {ok:true};
    const place=(hit.tower==="E"?"東座":"西座")+" F"+hit.floor;
    return {ok:false,reasonZh:place+" 路段受限，請核對其他通道。",
      reasonEn:"Access restricted at "+(hit.tower==="E"?"East":"West")+" F"+hit.floor+". Check another passage."};
  }
  function reviewReleases() {
    for (const group of scenario.snapshot().groups) {
      const option=group.releaseOptionId || group.verifiedOptionId;
      if (option && group.status!=="arrived" && !check(group.id,option).ok)
        scenario.act(group.id,"withdrawAccess",{optionId:option});
    }
  }
  window.addEventListener("escape-access-change",event=>{
    if(!event.detail?.snapshot) return;
    remember(event.detail.snapshot);
    reviewReleases();
  });
  window.EscapeRouteGuard={check,conflict,initialize(planner){
    for(const tower of ["E","W"])
      for(let floor=1;floor<=12;floor++) remember(planner.snapshot(tower,String(floor).padStart(2,"0")));
    reviewReleases();
  }};
})();
