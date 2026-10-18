const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/navidrive.js`, 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const upcoming = { hidden: true, textContent: '' }, arrow = {}, card = {dataset:{}};
const context = vm.createContext({ document: { querySelector: s => s === '#nextManeuver' ? upcoming : s === '.turn-card' ? card : arrow } });
vm.runInContext(`
let maneuvers = [
 {type:'depart',startMeters:0,endMeters:400,instruction:'Start'},
 {type:'turn',modifier:'left',startMeters:400,endMeters:700,instruction:'Turn left'},
 {type:'turn',modifier:'right',startMeters:700,endMeters:1000,instruction:'Turn right'}
];
let rendered, guidanceApproach={route:null,step:null}, guidanceSpeed=null;
function updateJunctionGuidance() {}
function renderRoadGuidance(step) {rendered=step}
function formatMeters(m) {return Math.round(m)+' m'}
${extract('junctionSymbol')}
${extract('clearUpcomingGuidance')}
${extract('instructionForProgress')}
`, context);
let guidance = context.instructionForProgress(.1, 1000);
assert.equal(guidance.text, 'Continue along the current road');
assert.match(upcoming.textContent, /In 300 m · Turn left/);
assert.equal(arrow.textContent, '↑');
assert.equal(vm.runInContext('rendered', context), null);
guidance=context.instructionForProgress(.2,1000);
assert.equal(guidance.text,'Turn left');
assert.equal(guidance.distanceText,'In 200 m');
assert.equal(upcoming.hidden,true);
assert.equal(card.dataset.phase,'approach');
// Once revealed, stopped traffic or a small backward GPS drift must not hide it.
guidance=context.instructionForProgress(.14,1000);
assert.equal(guidance.text,'Turn left');
assert.equal(vm.runInContext('rendered.guidancePhase',context),'next');
guidance = context.instructionForProgress(.39, 1000);
assert.equal(guidance.text, 'Turn left');
assert.equal(guidance.distanceText, 'NOW');
assert.equal(arrow.textContent, '↰');
assert.equal(upcoming.hidden,true);
assert.equal(vm.runInContext('rendered.guidancePhase', context), 'now');
guidance = context.instructionForProgress(.42, 1000);
assert.equal(guidance.text, 'Continue along the current road');
assert.match(upcoming.textContent, /Turn right/);
assert.doesNotMatch(upcoming.textContent, /Turn left/);
vm.runInContext(`maneuvers[2].hdeGuidance={verified:true,instruction:'Take the signed local exit'}`,context);
guidance = context.instructionForProgress(.69, 1000);
assert.equal(guidance.text, 'Take the signed local exit');
context.instructionForProgress(1, 1000);
assert.equal(upcoming.hidden, true);
assert.equal(vm.runInContext('rendered',context),null);
vm.runInContext('maneuvers=[]',context);
guidance = context.instructionForProgress(.2, 1000);
assert.equal(guidance.text, 'Continue along the current road');
assert.equal(upcoming.hidden, true);
// Real road speed triggers details one minute ahead, independent of playback rate.
vm.runInContext(`maneuvers=[{type:'depart',startMeters:0,endMeters:2000,durationSeconds:200},{type:'turn',modifier:'left',startMeters:2000,endMeters:3000,instruction:'Exit left'}]; guidanceSpeed=20;`,context);
guidance=context.instructionForProgress(.2,3000);
assert.equal(guidance.text,'Continue along the current road');
assert.match(upcoming.textContent,/Prepare/);
guidance=context.instructionForProgress(.3,3000);
assert.equal(guidance.text,'Exit left');
assert.equal(upcoming.hidden,true);
console.log('PASS now/next separation, junction transition, passed turns, verified HDE, arrival and missing maneuvers');
