const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, 'navidrive.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}
// Load the production animation and geometry without starting the application.
const motion = source.slice(source.indexOf('function routeBearing('), source.indexOf('\ninitializeNavigation();'));
const geometry = ['pointAtProgress', 'distanceMeters', 'bearingBetween', 'buildCumulativeDistances'].map(extract).join('\n');
const context = vm.createContext({ assert, console });
vm.runInContext(`
let now=0, queue=new Map(), seq=0;
const performance={now:()=>now};
const requestAnimationFrame=fn=>{queue.set(++seq,fn);return seq;};
const cancelAnimationFrame=id=>queue.delete(id);
let liveMotionFrame=null, displayedVehicle=null, lastFixTime=null, followingVehicle=true;
let camera=0;
const map={getBearing:()=>camera};
const vehicleMarker={setLngLat(){return this},setRotation(){return this}};
function followVehicle(p,b){camera=b;}
let activeLine=[{latitude:22.3,longitude:114.2},{latitude:22.3005,longitude:114.2},{latitude:22.3005,longitude:114.2005}];
${geometry}
let cumulative=buildCumulativeDistances(activeLine);
${motion}
function advance(ms){const end=now+ms;while(now<end){now=Math.min(end,now+16);const batch=[...queue.values()];queue.clear();batch.forEach(fn=>fn(now));}}
function fix(progress){animateLiveVehicle(pointAtProgress(activeLine,cumulative,progress),routeBearing(progress),progress);}
fix(0.1);advance(1000);fix(0.9);
for(let i=0;i<60;i++){advance(16);const p=displayedVehicle;
  assert.ok(Math.abs(p.longitude-114.2)<1e-9 || Math.abs(p.latitude-22.3005)<1e-9,'arrow cut across bend');
  assert.ok(Number.isFinite(p.bearing));
}
advance(2000);assert.ok(Math.abs(displayedVehicle.progress-.9)<1e-9);
assert.ok(Math.abs(displayedVehicle.bearing-90)<1,'arrow should point along eastbound road');
assert.ok(Math.abs(camera-90)<1,'camera settles independently');
console.log('PASS bend-following, local heading, camera settling');
// Interrupted animation continues from the displayed route position.
fix(.4);advance(100);const before=displayedVehicle.progress;fix(.6);advance(16);
assert.ok(Math.abs(displayedVehicle.progress-before)<.03);advance(2000);
console.log('PASS interrupted updates');
const raw={latitude:22.302,longitude:114.202};
animateLiveVehicle(raw,180);advance(2000);
assert.equal(displayedVehicle.latitude,raw.latitude);assert.equal(displayedVehicle.line,null);
assert.equal(displayedVehicle.bearing,180);
console.log('PASS off-route GPS stays off route');
advance(6000);fix(.2);advance(16);assert.equal(displayedVehicle.progress,.2);
const oldLine=activeLine;activeLine=oldLine.map(p=>({...p}));fix(.8);advance(16);
assert.equal(displayedVehicle.line,activeLine);assert.equal(displayedVehicle.progress,.8);
console.log('PASS GPS reacquisition and replacement route do not animate false journeys');
`, context);
