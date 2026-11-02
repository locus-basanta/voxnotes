// Tests import the actual application core, not a duplicated implementation.
const assert=require('node:assert/strict');
const C=require('./src/app.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
const notes=[{id:'a',title:'Grocery',content:'Coffee',tag:'Todo',pinned:false,voiceCreated:false,createdAt:1,updatedAt:1},{id:'b',title:'Weekend plans',content:'Walk',tag:'Personal',createdAt:2,updatedAt:2},{id:'c',title:'Weekend ideas',content:'Books',tag:'Ideas',createdAt:3,updatedAt:3}];
test('Preserves case in created thoughts',()=>assert.deepEqual(C.parse('Create note Buy COFFEE'),{action:'create',value:'Buy COFFEE'}));
test('Search command',()=>assert.deepEqual(C.parse('Search for coffee.'),{action:'search',value:'coffee'}));
test('Read and edit aliases',()=>{assert.equal(C.parse('Speak note Grocery').action,'read');assert.equal(C.parse('Edit note Grocery').action,'open');});
test('Pin, unpin and delete',()=>{for(const a of ['pin','unpin','delete']) assert.equal(C.parse(`${a} note Grocery`).action,a);});
test('Tag command',()=>assert.deepEqual(C.parse('Tag note Grocery Personal'),{action:'tag',value:'Grocery',tag:'Personal'}));
test('Missing keyword arguments',()=>assert.equal(C.parse('pin').action,'incomplete'));
test('Ordinary speech creates a note',()=>assert.equal(C.parse('Remember the camera charger').action,'create'));
test('Exact and unique partial title lookup',()=>{assert.equal(C.find(notes,'grocery.').id,'a');assert.equal(C.find(notes,'plans').id,'b');});
test('Ambiguous note title is never silently selected',()=>assert.equal(C.find(notes,'weekend'),null));
test('Unknown title is not approximated destructively',()=>assert.equal(C.find(notes,'eggs'),null));
test('Append retains all text',()=>{const m=C.appendMatch(notes,'Add to note Grocery Also get oat milk');assert.equal(m.note.id,'a');assert.equal(m.text,'Also get oat milk');});
test('Multi-word append title',()=>{const m=C.appendMatch(notes,'Append to note Weekend plans Charge camera');assert.equal(m.note.id,'b');assert.equal(m.text,'Charge camera');});
test('Punctuation and paragraph formatting',()=>assert.equal(C.punctuation('Hello world period How are you question mark new line I am good comma thanks new paragraph Next'), 'Hello world. How are you?\nI am good, thanks\n\nNext'));
test('Content is HTML escaped',()=>assert.equal(C.escape('<img src=x onerror="bad()">'), '&lt;img src=x onerror=&quot;bad()&quot;&gt;'));
test('Existing v2 notebook remains unchanged',()=>{const s={getItem:k=>k===C.KEY?JSON.stringify(notes):null};assert.equal(C.load(s).length,3);});
test('Legacy v1 is read if no v2 exists',()=>{const s={getItem:k=>k==='voxnotes_data_v1'?JSON.stringify(notes):null};assert.equal(C.load(s)[0].id,'a');});
test('An empty saved notebook is not replaced by samples',()=>assert.deepEqual(C.load({getItem:k=>k===C.KEY?'[]':null}),[]));
test('Malformed data fails without overwriting it',()=>{assert.throws(()=>C.load({getItem:()=>'{broken'}));assert.throws(()=>C.normalizeNotes({}));});
test('Rapidly created notes have unique IDs',()=>assert.notEqual(C.makeNote('One').id,C.makeNote('Two').id));
test('Category inference and word counting',()=>{assert.equal(C.makeNote('Buy coffee').tag,'Todo');assert.equal(C.words('  One\nTwo  '),2);});
console.log(`${passed} core tests passed`);
