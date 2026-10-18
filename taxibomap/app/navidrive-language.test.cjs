const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(`${__dirname}/navidrive.js`,'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\nfunction ',start+1))}
const context=vm.createContext({});
vm.runInContext(extract('signLanguages')+'\n'+extract('drivingInstruction'),context);
const names=context.signLanguages('中環及灣仔繞道 Central–Wan Chai Bypass');
assert.equal(names.chinese,'中環及灣仔繞道');
assert.equal(names.english,'Central–Wan Chai Bypass');
assert.equal(context.signLanguages('Airport').chinese,'');
assert.equal(context.drivingInstruction({type:'turn',modifier:'left',name:'彌敦道 Nathan Road'}),'向左轉，駛入彌敦道');
assert.match(context.drivingInstruction({type:'off ramp',modifier:'slight left',exits:'8'}),/靠左駛出，走 8 號出口/);
assert.equal(context.drivingInstruction({type:'roundabout'}),'駛入迴旋處');
assert.equal(context.drivingInstruction({type:'turn',hdeGuidance:{verified:true,instruction:'Keep left after the tunnel'}}),'Keep left after the tunnel');
console.log('PASS Chinese maneuvers, bilingual sign names, English-only names and verified HDE preservation');
