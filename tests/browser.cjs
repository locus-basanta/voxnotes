const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const BASE=process.env.TEST_URL || 'http://127.0.0.1:3030';
const key='voxnotes_data_v2';
const fixture=[
 ['n1','Notes for a slower Sunday','Take a walk before the city wakes up.\nFind a quiet table, order coffee, and spend an hour with the book I keep meaning to finish.','Personal',true,false],
 ['n2','A better first five minutes','Start the next project meeting with the problem, not the slides.\n\nLeave space for questions before we start offering solutions.','Work',true,true],
 ['n3','Little things to pick up','Coffee beans\nOat milk\nFresh flowers for the kitchen','Todo',false,true],
 ['n4','An idea for the notebook','What if capturing a thought felt as natural as leaving yourself a voice message? Fewer steps. More room to think.','Ideas',false,false],
 ['n5','The next weekend away','A room with a view of the hills. Early mornings, a good breakfast, and no particular plan for the afternoon.','Personal',false,true],
 ['n6','A line worth remembering','Pay attention to what you pay attention to.','Memo',false,false]
].map((n,i)=>({id:n[0],title:n[1],content:n[2],tag:n[3],pinned:n[4],voiceCreated:n[5],createdAt:Date.now()-i*86400000,updatedAt:Date.now()-i*3600000}));
let checks=0;
function pass(name){checks++;console.log('PASS',name);}
async function run(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(({fixture,key})=>{
   if(!localStorage.getItem('_test_seeded')){localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('_test_seeded','yes');}
   window.SpeechRecognition=class {
     constructor(){window._speech=this;}
     start(){this.onstart?.();}
     stop(){this.onend?.();}
     abort(){this.onend?.();}
     emit(text){const r=[{transcript:text}];r.isFinal=true;this.onresult({resultIndex:0,results:[r]});}
   };
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(u){window._utterance=u;u.onstart?.();}}});
 },{fixture,key});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const external=[];page.on('request',r=>{if(!r.url().startsWith(BASE) && !r.url().startsWith('data:'))external.push(r.url());});
 await page.goto(BASE); await page.locator('.note-card').first().waitFor();
 assert.equal(await page.locator('.note-card').count(),6);pass('Existing notebook preserved');
 fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
 for(const [width,height,label] of [[1440,1000,'desktop'],[768,1024,'tablet'],[390,844,'phone'],[320,700,'small-phone'],[1024,768,'laptop']]){
   await page.setViewportSize({width,height});
   const dimensions=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
   assert.ok(dimensions.width<=width,`${label} horizontal overflow ${JSON.stringify(dimensions)}`);
   if(['desktop','tablet','phone'].includes(label)) await page.screenshot({path:path.join(__dirname,`../artifacts/voxnotes-${label}.png`),fullPage:label==='desktop'});
   await page.getByRole('button',{name:'New note',exact:true}).click();
   const box=await page.locator('#editor').boundingBox(); assert.ok(box.x>=0 && box.x+box.width<=width+1);
   await page.locator('#saveNoteBtn').scrollIntoViewIfNeeded();assert.ok(await page.locator('#saveNoteBtn').isVisible());
   await page.getByRole('button',{name:'Close editor',exact:true}).click();
   pass(`Responsive workspace and editor at ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'),'true');
 await page.locator('.sidebar [data-filter="Ideas"]').click();
 assert.equal(await page.locator('.note-card').count(),1);
 assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'),'false'); pass('Mobile drawer and category navigation');
 await page.locator('.mobile-filters [data-filter="all"]').click();
 await page.locator('#searchInput').fill('flowers');assert.equal(await page.locator('.note-card').count(),1);
 await page.locator('#searchInput').fill('zzzzzz');assert.equal(await page.locator('#emptyState').isVisible(),true);
 await page.locator('#emptyAction').click();assert.equal(await page.locator('.note-card').count(),6);pass('Search and contextual empty state');
 await page.getByRole('button',{name:'New note',exact:true}).click();
 await page.locator('#noteTitle').fill('Grocery');await page.locator('#noteContent').fill('Coffee beans');await page.locator('#noteTag').selectOption('Todo');
 await page.locator('#editorPin').click();await page.locator('#saveNoteBtn').click();
 assert.equal(await page.locator('.note-card').count(),7);pass('Create, categorize and pin a new note');
 await page.reload();assert.equal(await page.locator('.note-card').count(),7);pass('Notes persist after reload');
 await page.getByRole('button',{name:'Edit Grocery',exact:true}).click();
 await page.locator('#noteContent').fill('Do not lose this edit');await page.locator('#closeEditor').click();
 assert.ok(await page.locator('#confirmDialog').isVisible());await page.locator('#confirmCancel').click();assert.ok(await page.locator('#editor').isVisible());
 await page.locator('#closeEditor').click();await page.locator('#confirmAccept').click();assert.equal(await page.locator('#editor').isVisible(),false);pass('Unsaved edits have a discard safeguard');
 await page.getByRole('button',{name:'Edit Grocery',exact:true}).click();
 await page.locator('#noteContent').evaluate(el=>{el.focus();el.setSelectionRange(el.value.length,el.value.length);});
 await page.locator('#dictateBtn').click();await page.evaluate(()=>window._speech.emit('and oat milk period new line Get bread'));
 assert.equal(await page.locator('#noteContent').inputValue(),'Coffee beans and oat milk.\nGet bread');
 await page.evaluate(()=>window._speech.onerror({error:'network'}));
 assert.equal(await page.locator('#dictateBtn').innerText(),'Dictate');
 assert.ok((await page.locator('#editorVoiceHint').innerText()).includes('connect'));
 await page.locator('#saveNoteBtn').click();pass('New-note dictation, punctuation, and network error reset (mock speech)');
 await page.locator('#mobileMicBtn').click();await page.evaluate(()=>window._speech.emit('Add to note Grocery Also get tea'));
 await page.locator('#mobileMicBtn').click();
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 assert.ok(stored.find(n=>n.title==='Grocery').content.endsWith('Also get tea'));pass('Spoken append uses the real command controller (mock speech)');
 await page.locator('#mobileMicBtn').click();await page.evaluate(()=>window._speech.emit('Delete note Grocery'));
 assert.ok(await page.locator('#confirmDialog').isVisible());
 await page.locator('#confirmAccept').click();assert.equal(await page.locator('.note-card').count(),6);
 await page.locator('#undoBtn').click();assert.equal(await page.locator('.note-card').count(),7);pass('Voice deletion confirms first; Undo restores the note');
 await page.getByRole('button',{name:'Open voice guide',exact:true}).click();
 await page.locator('#commandInput').fill('Create note <img src=x onerror=alert(1)>');await page.locator('#commandForm button').click();
 assert.equal(await page.locator('.note-card img').count(),0);pass('Typed commands cannot inject HTML');
 await page.getByRole('button',{name:'Read Grocery aloud',exact:true}).click();
 assert.equal(await page.locator('#mobileMicBtn').innerText(),'Stop audio');
 await page.locator('#mobileMicBtn').click();assert.equal(await page.locator('#mobileMicBtn').innerText(),'Speak');pass('Read-aloud stop control (mock synthesis)');
 await page.getByRole('button',{name:'New note',exact:true}).click();await page.locator('#noteTitle').fill('Must not claim saved');
 await page.evaluate(()=>{window._originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
 await page.locator('#saveNoteBtn').click();assert.equal(await page.locator('#editor').isVisible(),true);assert.ok((await page.locator('#saveState').innerText()).includes('storage error'));
 await page.evaluate(()=>Storage.prototype.setItem=window._originalSet);
 await page.locator('#closeEditor').click();await page.locator('#confirmAccept').click();pass('Storage failure keeps unsaved text in the editor');
 await page.setViewportSize({width:1440,height:1000});
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;
 await download.saveAs(path.join(__dirname,'../artifacts/export-test.md'));assert.ok(fs.readFileSync(path.join(__dirname,'../artifacts/export-test.md'),'utf8').includes('Coffee beans'));pass('Markdown export downloads successfully');
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(external.length,0,external.join('\n'));pass('No browser exceptions or external/CDN requests');
 const corruptContext=await browser.newContext();
 await corruptContext.addInitScript(()=>localStorage.setItem('voxnotes_data_v2','{broken'));
 const corrupt=await corruptContext.newPage();await corrupt.goto(BASE);assert.equal(await corrupt.evaluate(()=>localStorage.getItem('voxnotes_data_v2')),'{broken');assert.ok((await corrupt.locator('#storageStatus').innerText()).includes('not been overwritten'));pass('Corrupt data is not replaced with sample notes');
 await corruptContext.close();await context.close();await browser.close();console.log(`${checks} browser checks passed`);
}
run().catch(e=>{console.error(e);process.exit(1);});
