const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/navidrive.js`, 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const upcoming = { hidden: true, textContent: '' }, arrow = {};
const context = vm.createContext({ document: { querySelector: s => s === '#nextManeuver' ? upcoming : arrow } });
vm.runInContext(`
let maneuvers = [
 {type:'depart',startMeters:0,endMeters:400,instruction:'Start'},
 {type:'turn',modifier:'left',startMeters:400,endMeters:700,instruction:'Turn left'},
 {type:'turn',modifier:'right',startMeters:700,endMeters:1000,instruction:'Turn right'}
];
let rendered;
function updateJunctionGuidance() {}
function renderRoadGuidance(step) {rendered=step}
function formatMeters(m) {return Math.round(m)+' m'}
${extract('junctionSymbol')}
${extract('clearUpcomingGuidance')}
${extract('instructionForProgress')}
`, context);
let guidance = context.instructionForProgress(.1, 1000);
assert.equal(guidance.text, 'Continue along the current road');
assert.match(upcoming.textContent, /NEXT · In 300 m — Turn left/);
assert.equal(arrow.textContent, '↑');
assert.equal(vm.runInContext('rendered.guidancePhase', context), 'next');
guidance = context.instructionForProgress(.39, 1000);
assert.equal(guidance.text, 'Turn left');
assert.equal(guidance.distanceText, 'NOW');
assert.equal(arrow.textContent, '↰');
assert.match(upcoming.textContent, /NEXT · In 310 m — Turn right/);
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
console.log('PASS now/next separation, junction transition, passed turns, verified HDE, arrival and missing maneuvers');
