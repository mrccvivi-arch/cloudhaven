import { loop } from "../previews/forgotten-space/loop-layout.js";
import { REALM_EXIT } from "./forgotten-portal.js";

const levels=[0,0,0,0,8,8,18,18,18,18,11,11,3.2,3.2,3.2,-7.1,-7.1,-18,-18,-18,-18,-9,-9,0,0,0];
const route=loop.map(([x,z],i)=>({x,y:levels[i],z}));
const distances=[0];
for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];
  distances.push(distances.at(-1)+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z));
}
const entrance={x:-7,y:0,z:17};

export function returnHeading(player,yaw) {
  let next=REALM_EXIT;
  if(Math.abs(player.y)<1.6 && Math.hypot(player.x-entrance.x,player.z-entrance.z)<23){
    // Both ways around the central terrace approach the rose from solid ground.
    if(player.z<9)next={x:-18,z:15};
  }else{
    let best=Infinity, segment=0, at=0, approach;
    for(let i=0;i<route.length-1;i++){
      const a=route[i],b=route[i+1], dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
      const u=Math.max(0,Math.min(1,((player.x-a.x)*dx+(player.y-a.y)*dy*2+(player.z-a.z)*dz)/(dx*dx+dy*dy*2+dz*dz)));
      const x=a.x+u*dx,y=a.y+u*dy,z=a.z+u*dz;
      const gap=Math.hypot(player.x-x,(player.y-y)*2.6,player.z-z);
      if(gap<best){
        best=gap;
        segment=i;
        approach={x,z};
        at=distances[i]+u*(distances[i+1]-distances[i]);
      }
    }
    const backward=at<=distances.at(-1)/2;
    next=best>4.4?approach:route[segment+(backward?0:1)];
    if(Math.hypot(next.x-player.x,next.z-player.z)<2.25){
      next=route[segment+(backward?-1:2)]??REALM_EXIT;
    }
  }
  return (Math.atan2(next.z-player.z,next.x-player.x)+yaw+Math.PI/2)*180/Math.PI;
}
