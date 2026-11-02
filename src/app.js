/* VoxNotes: small, dependency-free note and voice controller. */
const VoxCore = (() => {
  const KEY = 'voxnotes_data_v2';
  const TAGS = ['Work', 'Personal', 'Ideas', 'Todo', 'Memo'];
  const normal = s => String(s).toLocaleLowerCase().replace(/[“”"']/g, '').replace(/[.!?]+$/g, '').trim();
  const words = s => String(s).trim().split(/\s+/).filter(Boolean).length;
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalizeNotes(raw) {
    if (!Array.isArray(raw)) throw new Error('Notebook data is not an array');
    const seen = new Set();
    return raw.map(n => {
      if (!n || typeof n.title !== 'string' || typeof n.content !== 'string' || typeof n.id !== 'string' || seen.has(n.id)) throw new Error('Notebook contains invalid notes');
      seen.add(n.id);
      return {...n, tag:TAGS.includes(n.tag) ? n.tag : 'Memo', pinned:!!n.pinned, voiceCreated:!!n.voiceCreated, createdAt:Number(n.createdAt) || Date.now(), updatedAt:Number(n.updatedAt) || Number(n.createdAt) || Date.now()};
    });
  }
  function load(storage) {
    const current = storage.getItem(KEY);
    const legacy = current === null ? storage.getItem('voxnotes_data_v1') : null;
    return current !== null || legacy !== null ? normalizeNotes(JSON.parse(current ?? legacy)) : null;
  }
  function find(notes, query) {
    const q = normal(query);
    if (!q) return null;
    const exact = notes.filter(n => normal(n.title) === q);
    if (exact.length === 1) return exact[0];
    const candidates = notes.filter(n => normal(n.title).includes(q));
    return candidates.length === 1 ? candidates[0] : null;
  }
  function punctuation(text) {
    return String(text).replace(/\s*\bnew paragraph\b\s*/gi,'\n\n').replace(/\s*\bnew line\b\s*/gi,'\n')
      .replace(/[ \t]*\bquestion mark\b/gi,'?').replace(/[ \t]*\bexclamation mark\b/gi,'!')
      .replace(/[ \t]*\bperiod\b/gi,'.').replace(/[ \t]*\bcomma\b/gi,',');
  }
  function appendMatch(notes, phrase) {
    const m = phrase.match(/^(?:add\s+to(?:\s+note)?|append(?:\s+to)?(?:\s+note)?)\s+(.+)$/i);
    if (!m) return null;
    const body = m[1].trim();
    // Prefer the full, longest title; only accept unambiguous short references.
    const full = [...notes].sort((a,b) => b.title.length-a.title.length).find(n => normal(body).startsWith(normal(n.title) + ' '));
    if (full) return {note:full, text:body.slice(full.title.length).trim()};
    const tokens = body.split(/\s+/);
    for (let i=tokens.length-1; i>0; i--) {
      const note = find(notes,tokens.slice(0,i).join(' '));
      if (note) return {note, text:tokens.slice(i).join(' ')};
    }
    return null;
  }
  function parse(text) {
    const t = String(text).trim();
    if (!t) return {action:'empty'};
    if (/^(help|commands|show commands)[.!?]?$/i.test(t)) return {action:'help'};
    if (/^(stop|pause|stop speaking|stop reading)[.!?]?$/i.test(t)) return {action:'stop'};
    if (/^(export|download|backup)\s+(?:all\s+)?notes[.!?]?$/i.test(t)) return {action:'export'};
    if (/^(clear search|show all|all notes|reset)[.!?]?$/i.test(t)) return {action:'clear'};
    let m=t.match(/^(?:create(?:\s+a)?\s+note|new\s+note|take(?:\s+a)?\s+note|make(?:\s+a)?\s+note|note)\s+(.+)$/i);
    if (m) return {action:'create', value:m[1]};
    m=t.match(/^(?:search(?:\s+for)?|find|look\s+for)\s+(.+)$/i);
    if (m) return {action:'search', value:m[1].replace(/[.!?]+$/,'')};
    m=t.match(/^(read|speak|play|open|edit|view|pin|unpin|delete|remove|trash|erase)\s+(?:note\s+)?(.+)$/i);
    if (m) return {action:({speak:'read',play:'read',edit:'open',view:'open',remove:'delete',trash:'delete',erase:'delete'})[m[1].toLowerCase()] || m[1].toLowerCase(), value:m[2]};
    if (/^(add\s+to|append)\b/i.test(t)) return {action:'append', value:t};
    m=t.match(/^tag\s+(?:note\s+)?(.+)\s+(work|personal|ideas|todo|memo)[.!?]?$/i);
    if (m) return {action:'tag', value:m[1], tag:TAGS.find(v=>v.toLowerCase()===m[2].toLowerCase())};
    // Do not turn an incomplete management command into an accidental note.
    if (/^(create|new|take|make|read|speak|open|edit|pin|unpin|delete|remove|tag|search|find)\b/i.test(t)) return {action:'incomplete'};
    return {action:'create', value:t};
  }
  function makeNote(content, voice=true) {
    const now=Date.now();
    const title=content.trim().split(/\s+/).slice(0,6).join(' ');
    const tag=/\b(buy|grocery|groceries|todo|task)\b/i.test(content) ? 'Todo' : /\b(idea|app|design)\b/i.test(content) ? 'Ideas' : /\b(home|family|travel)\b/i.test(content) ? 'Personal' : 'Memo';
    return {id:'note_'+(globalThis.crypto?.randomUUID?.() || now+'_'+Math.random().toString(36).slice(2)), title:title.charAt(0).toUpperCase()+title.slice(1), content:content.trim(), tag, pinned:false, voiceCreated:voice, createdAt:now, updatedAt:now};
  }
  return {KEY,TAGS,normal,words,escape,normalizeNotes,load,find,punctuation,appendMatch,parse,makeNote};
})();
if (typeof module !== 'undefined') module.exports=VoxCore;

if (typeof document !== 'undefined') (() => {
  'use strict';
  const C=VoxCore, $=id=>document.getElementById(id);
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const labels={all:'All notes',pinned:'Pinned',voice:'Voice notes',Todo:'To-do'};
  let notes=[], filter='all', query='', sort='updated', draft=null, initialDraft='', lastFocus=null;
  let storageReadable=true, deleted=null, toastTimer, pendingConfirm=null;
  let recognition=null, voicePhase='idle', voiceMode=null, voiceGeneration=0, speaking=false, utterance=null;
  const Speech=window.SpeechRecognition || window.webkitSpeechRecognition;
  function notify(message,undo=false) {
    clearTimeout(toastTimer); $('toastMessage').textContent=message; $('undoBtn').hidden=!undo; $('toast').hidden=false;
    if (!undo) toastTimer=setTimeout(()=>$('toast').hidden=true,6500);
  }
  function commit(next) {
    if (!storageReadable) { notify('Your stored notebook could not be read. Export a copy before changing browser storage.'); return false; }
    try { localStorage.setItem(C.KEY,JSON.stringify(next)); }
    catch(e) { $('storageStatus').textContent='Storage unavailable. Your changes have not been saved.'; notify('Could not save. Browser storage is full or unavailable. Keep the editor open and copy your text.'); return false; }
    notes=next; render(); return true;
  }
  function seed() {
    const now=Date.now();
    return [
      {id:'welcome',title:'A little room to think',content:'This is your notebook. A place for passing thoughts, plans, and things you don’t want to forget.\n\nTap Speak to capture a thought, or New note to write one down.',tag:'Memo',pinned:true,voiceCreated:false,createdAt:now,updatedAt:now},
      {id:'voice-guide',title:'Start with your voice',content:'“Create note Pick up coffee on the way home”\n“Search coffee”\n“Pin note Coffee”\n\nUse the voice guide for more shortcuts. These are example notes; you can edit or delete them.',tag:'Memo',pinned:false,voiceCreated:false,createdAt:now-1000,updatedAt:now-1000}
    ];
  }
  function load() {
    try { notes=C.load(localStorage) ?? seed(); }
    catch(e) { notes=[]; storageReadable=false; notify('Stored notes could not be read. The original data has been left untouched.'); $('storageStatus').textContent='Notebook could not be read. Original browser data has not been overwritten.'; }
    try { deleted=JSON.parse(localStorage.getItem('voxnotes_last_deleted') || 'null'); if (deleted) deleted=C.normalizeNotes([deleted])[0]; } catch(e) { deleted=null; }
  }
  function setFilter(value) { filter=value; render(); closeDrawer(); }
  function setSearch(value) { query=value; $('searchInput').value=value; render(); }
  function clearSearch() { query=''; filter='all'; $('searchInput').value=''; render(); }
  function render() {
    document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
    const title=labels[filter] || filter;
    $('pageTitle').textContent=query ? 'Search results' : title;
    $('breadcrumbLabel').textContent=title;
    $('pageSubtitle').textContent=query ? `Notes matching “${query}”` : filter==='all' ? 'A little room for everything on your mind.' : filter==='pinned' ? 'The thoughts you want to keep close.' : filter==='voice' ? 'Ideas that started with your voice.' : `A place for your ${title.toLowerCase()} notes.`;
    const pinned=notes.filter(n=>n.pinned).length, voice=notes.filter(n=>n.voiceCreated).length;
    for (const [id,value] of Object.entries({statTotal:notes.length,navTotal:notes.length,statPinned:pinned,navPinned:pinned,statVoice:voice,navVoice:voice,statWords:notes.reduce((sum,n)=>sum+C.words(n.content),0)})) $(id).textContent=value.toLocaleString();
    $('clearSearch').hidden=!query;
    const filtered=notes.filter(n=>(filter==='all' || (filter==='pinned' ? n.pinned : filter==='voice' ? n.voiceCreated : n.tag===filter)) && (!query || `${n.title} ${n.content} ${n.tag}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
      .sort((a,b)=>sort==='title' ? a.title.localeCompare(b.title) : sort==='created' ? b.createdAt-a.createdAt : b.updatedAt-a.updatedAt);
    const split=filter==='all' && !query;
    const pinnedNotes=split ? filtered.filter(n=>n.pinned) : [];
    const rest=split ? filtered.filter(n=>!n.pinned) : filtered;
    $('pinnedSection').hidden=!pinnedNotes.length;
    $('regularSection').hidden=!rest.length;
    $('pinnedGrid').innerHTML=pinnedNotes.map(card).join('');
    $('notesGrid').innerHTML=rest.map(card).join('');
    $('regularHeading').innerHTML=C.escape(query ? `${filtered.length} ${filtered.length===1?'note':'notes'} found` : sort==='title' ? 'In alphabetical order' : sort==='created' ? 'Recently created' : 'Recently edited')+'<span class="line" aria-hidden="true"></span>';
    $('emptyState').hidden=!!filtered.length;
    $('emptyTitle').textContent=query ? 'No notes match that thought' : filter==='all' ? 'Make room for a thought' : 'Nothing here just yet';
    $('emptyText').textContent=query ? 'Try a different word, or clear your search.' : filter==='all' ? 'Start with your voice, or write your first note.' : 'Create a note or choose another collection.';
    $('emptyAction').textContent=query ? 'Clear search' : 'Create a note';
  }
  function card(n) {
    const date=new Date(n.updatedAt), today=new Date();
    const time=date.toDateString()===today.toDateString() ? 'Today' : date.toLocaleDateString('en',{month:'short',day:'numeric'});
    return `<article class="note-card" data-id="${C.escape(n.id)}"><button class="note-open" data-note-action="open" aria-label="Edit ${C.escape(n.title)}"><span class="note-kicker">${C.escape(labels[n.tag] || n.tag)}${n.voiceCreated ? icon('wave')+'<span class="sr-only">Voice note</span>' : ''}</span><h3 class="note-title">${C.escape(n.title)}</h3><p class="note-preview">${C.escape(n.content || 'No content yet')}</p></button><footer class="note-footer"><time datetime="${date.toISOString()}" title="${C.escape(date.toLocaleString())}">${time}</time><div class="card-actions"><button class="icon-button ${n.pinned?'pin-on':''}" data-note-action="pin" aria-label="${n.pinned?'Unpin':'Pin'} ${C.escape(n.title)}" title="${n.pinned?'Unpin':'Pin'}" aria-pressed="${n.pinned}">${icon('pin')}</button><button class="icon-button" data-note-action="read" aria-label="Read ${C.escape(n.title)} aloud" title="Read aloud">${icon('speaker')}</button></div></footer></article>`;
  }
  function openEditor(note=null) {
    stopVoice(true); stopReading(); lastFocus=document.activeElement;
    draft=note ? {...note} : {...C.makeNote('',false), title:'',tag:C.TAGS.includes(filter) ? filter : 'Memo'};
    $('noteTitle').value=draft.title; $('noteContent').value=draft.content; $('noteTag').value=draft.tag;
    $('editorHeading').textContent=note ? 'Edit note' : 'New note';
    $('deleteNoteBtn').hidden=!note; initialDraft=signature();
    updateDraftUI(); $('editor').showModal(); document.body.style.overflow='hidden';
    $('noteTitle').focus();
  }
  function signature() { return JSON.stringify({title:$('noteTitle').value,content:$('noteContent').value,tag:$('noteTag').value,pinned:draft?.pinned,voiceCreated:draft?.voiceCreated}); }
  function dirty() { return !!draft && signature()!==initialDraft; }
  function updateDraftUI() {
    $('editorWords').textContent=`${C.words($('noteContent').value)} words`;
    $('editorPin').setAttribute('aria-pressed',String(!!draft?.pinned));
    $('editorPin').setAttribute('aria-label',draft?.pinned?'Unpin note':'Pin note');
    $('saveState').textContent=dirty() ? 'Unsaved changes' : notes.some(n=>n.id===draft?.id) ? 'Saved on this device' : 'Not saved yet';
  }
  function finishEditor() { stopVoice(true); stopReading(); $('editor').close(); document.body.style.overflow=''; draft=null; if (lastFocus?.isConnected) lastFocus.focus(); else $('newNoteBtn').focus(); }
  async function closeEditor() {
    if (pendingConfirm) return;
    if (dirty() && !(await confirmAction('Keep this thought?','You have unsaved changes. Save your note before closing, or discard this edit.','Discard changes','Keep editing'))) return;
    finishEditor();
  }
  function saveEditor() {
    if (!draft) return;
    stopVoice(true);
    const title=$('noteTitle').value.trim(), content=$('noteContent').value.trim();
    if (!title && !content) { notify('Add a title or a thought before saving.'); $('noteContent').focus(); return; }
    const n={...draft,title:title || content.split(/\s+/).slice(0,6).join(' '),content,tag:$('noteTag').value,updatedAt:Date.now()};
    const next=notes.some(v=>v.id===n.id) ? notes.map(v=>v.id===n.id ? n : v) : [n,...notes];
    if (commit(next)) { finishEditor(); notify('Note saved on this device'); }
    else $('saveState').textContent='Not saved — storage error';
  }
  function confirmAction(title,message,accept='Delete note',cancel='Keep note') {
    if (pendingConfirm) return Promise.resolve(false);
    stopVoice(true);
    $('confirmTitle').textContent=title; $('confirmMessage').textContent=message; $('confirmAccept').textContent=accept; $('confirmCancel').textContent=cancel;
    $('confirmDialog').showModal(); $('confirmCancel').focus();
    return new Promise(resolve=>pendingConfirm=resolve);
  }
  function resolveConfirm(ok) { $('confirmDialog').close(); const resolve=pendingConfirm; pendingConfirm=null; resolve?.(ok); }
  async function removeNote(note) {
    if (!note || !(await confirmAction('Delete this note?',`“${note.title}” will be removed from your notebook. You can undo this after deleting.`))) return;
    // Keep the recovery copy before attempting deletion.
    try { localStorage.setItem('voxnotes_last_deleted',JSON.stringify(note)); }
    catch(e) { notify('Could not create an undo copy. The note has not been deleted.'); return; }
    if (commit(notes.filter(n=>n.id!==note.id))) { deleted=note; if ($('editor').open) finishEditor(); notify('Note deleted',true); }
  }
  function undoDelete() {
    if (!deleted) return;
    if (notes.some(n=>n.id===deleted.id)) { $('undoBtn').hidden=true; return; }
    if (commit([deleted,...notes])) { deleted=null; try {localStorage.removeItem('voxnotes_last_deleted');}catch(e){} notify('Note restored'); }
  }
  function openHelp(example='') {
    stopVoice(true); if (!$('helpDialog').open) $('helpDialog').showModal();
    if (example) { $('commandInput').value=example; $('commandInput').focus(); }
  }
  function selectNote(q) {
    const n=C.find(notes,q);
    if (!n) notify(`No unique match for “${q}”. Try the full note title.`);
    return n;
  }
  function updateNote(note,changes,message) { if (commit(notes.map(n=>n.id===note.id ? {...n,...changes,updatedAt:Date.now()} : n))) notify(message); }
  async function command(text,fromVoice=true) {
    const cmd=C.parse(text); if (cmd.action==='empty') return;
    if (cmd.action==='help') return openHelp();
    if (cmd.action==='stop') { stopVoice(true); stopReading(); return; }
    if (cmd.action==='export') return exportNotes();
    if (cmd.action==='clear') return clearSearch();
    if (cmd.action==='incomplete') return notify('Include a note title or a thought. Open the voice guide for examples.');
    if (cmd.action==='search') { filter='all'; return setSearch(cmd.value); }
    if (cmd.action==='create') {
      const note=C.makeNote(cmd.value,fromVoice);
      if (commit([note,...notes])) { clearSearch(); notify(`Saved “${note.title}”`); }
      return;
    }
    if (cmd.action==='append') {
      const match=C.appendMatch(notes,cmd.value);
      if (!match) return notify('Could not identify that note. Use its full title followed by the text to add.');
      return updateNote(match.note,{content:match.note.content+'\n'+match.text},`Added to “${match.note.title}”`);
    }
    const note=selectNote(cmd.value); if (!note) return;
    switch(cmd.action) {
      case 'read': return readText(`${note.title}. ${note.content}`);
      case 'open': return openEditor(note);
      case 'pin': case 'unpin': return updateNote(note,{pinned:cmd.action==='pin'},cmd.action==='pin'?'Note pinned':'Note unpinned');
      case 'tag': return updateNote(note,{tag:cmd.tag},`Moved to ${labels[cmd.tag] || cmd.tag}`);
      case 'delete': return removeNote(note);
    }
  }
  function exportNotes() {
    if (!notes.length) return notify('Your notebook is empty');
    const md='# VoxNotes\n\n'+notes.map(n=>`## ${n.title}\n\n${n.tag}${n.pinned?' · Pinned':''} · ${new Date(n.updatedAt).toLocaleString()}\n\n${n.content}\n\n---`).join('\n\n');
    const url=URL.createObjectURL(new Blob([md],{type:'text/markdown;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download=`voxnotes-${new Date().toISOString().slice(0,10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
    notify('Notebook export requested. Check your downloads.');
  }
  function voiceUI() {
    const active=voicePhase==='listening', busy=voicePhase==='starting';
    $('capture').dataset.state=active?'listening':'idle';
    $('captureTitle').textContent=active ? voiceMode==='dictation'?'Your words, on the page':'Listening to your thought' : busy?'Opening your microphone…' : speaking?'A moment to listen':'Think it. Say it. Keep it.';
    if (!active && !busy && !speaking) $('captureHint').textContent=Speech ? 'Speak a thought or a command. We’ll take note.' : 'Voice isn’t supported here. You can still write or type commands.';
    $('mainMicBtn').innerHTML=icon(active?'stop':'mic')+`<span>${active?'Stop listening':busy?'Connecting…':'Start speaking'}</span>`;
    $('mainMicBtn').disabled=busy;
    $('mobileMicBtn').innerHTML=icon(speaking?'stop':active?'stop':'mic')+`<span>${speaking?'Stop audio':active?'Stop':busy?'Opening…':'Speak'}</span>`;
    $('mobileMicBtn').disabled=busy;
    $('dockLabel').textContent=active?'Listening…':speaking?'Reading your note':'A thought worth keeping?';
    $('dockHint').textContent=active?'Tap Stop when you’re finished':speaking?'Tap to stop playback':'Your voice is a good place to start';
    $('dictateBtn').innerHTML=icon(active && voiceMode==='dictation'?'stop':'mic')+`<span>${active && voiceMode==='dictation'?'Stop':'Dictate'}</span>`;
    $('dictateBtn').disabled=busy;
    $('editorVoiceTitle').textContent=active && voiceMode==='dictation'?'Listening to your words':'Give your keyboard a break';
    $('stopTtsBtn').hidden=!speaking;
  }
  function stopVoice(discard=false) {
    if (!recognition) return;
    const r=recognition;
    if (discard) { voiceGeneration++; recognition=null; voicePhase='idle'; voiceMode=null; r.abort(); voiceUI(); }
    else { r.stop(); }
  }
  function toggleVoice(mode='command') {
    if (speaking) { stopReading(); return; }
    if (voicePhase!=='idle') { stopVoice(); return; }
    if (!Speech) { openHelp(); notify('Speech recognition is unavailable in this browser. Try Chrome or Edge.'); return; }
    if (!window.isSecureContext) { notify('Microphone access needs HTTPS or localhost.'); return; }
    const r=new Speech(), generation=++voiceGeneration;
    recognition=r; voiceMode=mode; voicePhase='starting'; voiceUI();
    r.lang='en-US'; r.continuous=true; r.interimResults=true;
    r.onstart=()=>{ if (generation!==voiceGeneration) return; voicePhase='listening'; voiceUI(); $('captureHint').textContent='Listening… Your browser may use an online speech service.'; };
    r.onresult=event=>{
      if (generation!==voiceGeneration) return;
      for (let i=event.resultIndex;i<event.results.length;i++) {
        const result=event.results[i], text=result[0].transcript.trim();
        if (!result.isFinal) { $('captureHint').textContent=`Hearing: ${text}`; if (mode==='dictation') $('editorVoiceHint').textContent=`Hearing: ${text}`; }
        else if (mode==='dictation' && draft && $('editor').open) insertDictation(text);
        else if (mode==='command') command(text,true);
      }
    };
    r.onerror=event=>{
      if (generation!==voiceGeneration) return;
      const messages={'not-allowed':'Microphone permission was denied. Allow it in your browser’s site settings.','service-not-allowed':'Your browser’s speech service is unavailable. Try Chrome or Edge.','audio-capture':'No microphone was found. Check your device settings.','network':'Speech service could not connect. Check your connection and try again.','no-speech':'No speech detected. Tap Speak to try again.'};
      const message=messages[event.error] || 'Voice input stopped. Please try again.';
      voicePhase='idle'; voiceMode=null; recognition=null; voiceGeneration++; voiceUI();
      $('captureHint').textContent=message; $('editorVoiceHint').textContent=message; notify(message);
    };
    r.onend=()=>{ if (generation!==voiceGeneration) return; recognition=null; voicePhase='idle'; voiceMode=null; voiceUI(); $('editorVoiceHint').textContent='Dictate at your cursor. Say “new line” to format.'; };
    try { r.start(); } catch(e) { recognition=null; voicePhase='idle'; voiceMode=null; voiceUI(); notify('Could not start the microphone. Please try again.'); }
  }
  function insertDictation(text) {
    const area=$('noteContent'), start=area.selectionStart, end=area.selectionEnd;
    let value=C.punctuation(text);
    if (start>0 && !/\s$/.test(area.value.slice(0,start)) && !/^[.,!?\n]/.test(value)) value=' '+value;
    if (end<area.value.length && !/^\s/.test(area.value.slice(end)) && !/\s$/.test(value)) value+=' ';
    area.setRangeText(value,start,end,'end'); draft.voiceCreated=true;
    $('editorVoiceHint').textContent='Added to your note. Keep speaking, or tap Stop.'; updateDraftUI();
  }
  function stopReading() { window.speechSynthesis?.cancel(); speaking=false; utterance=null; voiceUI(); }
  function readText(text) {
    stopVoice(true); stopReading();
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return notify('Read aloud is not supported in this browser.');
    if (!text.trim()) return notify('There’s nothing to read yet.');
    const u=new SpeechSynthesisUtterance(text); utterance=u; u.rate=1; u.lang='en-US';
    u.onstart=()=>{ if (utterance!==u) return; speaking=true; voiceUI(); $('captureHint').textContent='Reading aloud. The microphone is off.'; };
    u.onend=()=>{ if (utterance!==u) return; speaking=false; utterance=null; voiceUI(); };
    u.onerror=e=>{ if (utterance!==u) return; speaking=false; utterance=null; voiceUI(); if (e.error!=='canceled') notify('Read aloud could not start. Check your browser’s speech settings.'); };
    window.speechSynthesis.speak(u);
  }
  function closeDrawer() { document.body.classList.remove('drawer-open'); $('menuBtn').setAttribute('aria-expanded','false'); $('sidebar').inert=window.innerWidth<768; }
  function openDrawer() { document.body.classList.add('drawer-open'); $('menuBtn').setAttribute('aria-expanded','true'); $('sidebar').inert=false; $('sidebar').querySelector('button').focus(); }
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{ closeDrawer(); b.dataset.action==='help'?openHelp():exportNotes(); }));
  document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>openHelp(b.dataset.example)));
  $('newNoteBtn').onclick=()=>openEditor();
  $('searchInput').oninput=e=>{query=e.target.value;render();}; $('clearSearch').onclick=clearSearch;
  $('sortSelect').onchange=e=>{sort=e.target.value;render();};
  $('emptyAction').onclick=()=>query?clearSearch():openEditor();
  $('notesArea').onclick=e=>{
    const button=e.target.closest('[data-note-action]'); if (!button) return;
    const note=notes.find(n=>n.id===button.closest('[data-id]').dataset.id); if (!note) return;
    if (button.dataset.noteAction==='open') openEditor(note);
    if (button.dataset.noteAction==='read') readText(`${note.title}. ${note.content}`);
    if (button.dataset.noteAction==='pin') {updateNote(note,{pinned:!note.pinned},note.pinned?'Note unpinned':'Note pinned'); document.querySelector(`[data-id="${CSS.escape(note.id)}"] [data-note-action=pin]`)?.focus();}
  };
  $('closeEditor').onclick=closeEditor; $('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
  $('saveNoteBtn').onclick=saveEditor;
  $('noteTitle').oninput=$('noteContent').oninput=$('noteTag').onchange=updateDraftUI;
  $('editorPin').onclick=()=>{draft.pinned=!draft.pinned;updateDraftUI();};
  $('editorRead').onclick=()=>speaking?stopReading():readText(`${$('noteTitle').value}. ${$('noteContent').value}`);
  $('deleteNoteBtn').onclick=()=>removeNote(notes.find(n=>n.id===draft?.id));
  $('dictateBtn').onclick=()=>toggleVoice('dictation');
  $('mainMicBtn').onclick=()=>toggleVoice('command'); $('mobileMicBtn').onclick=()=>toggleVoice('command'); $('stopTtsBtn').onclick=stopReading;
  $('closeHelp').onclick=()=>$('helpDialog').close();
  $('commandForm').onsubmit=e=>{e.preventDefault();const text=$('commandInput').value; $('helpDialog').close();$('commandInput').value='';command(text,false);};
  $('confirmAccept').onclick=()=>resolveConfirm(true); $('confirmCancel').onclick=()=>resolveConfirm(false);
  $('confirmDialog').addEventListener('cancel',e=>{e.preventDefault();resolveConfirm(false);});
  $('undoBtn').onclick=undoDelete; $('closeToast').onclick=()=>$('toast').hidden=true;
  $('menuBtn').onclick=()=>document.body.classList.contains('drawer-open')?closeDrawer():openDrawer();
  $('drawerBackdrop').onclick=()=>{closeDrawer();$('menuBtn').focus();};
  window.addEventListener('resize',()=>{ if (window.innerWidth>=768) closeDrawer(); else if (!document.body.classList.contains('drawer-open')) $('sidebar').inert=true; });
  window.addEventListener('keydown',e=>{
    if ((e.ctrlKey || e.metaKey) && e.key==='s' && $('editor').open) {e.preventDefault();saveEditor();}
    if (e.key==='Escape' && document.body.classList.contains('drawer-open')) {closeDrawer();$('menuBtn').focus();}
    if (e.key==='Tab' && document.body.classList.contains('drawer-open')) {
      const focusable=[...$('sidebar').querySelectorAll('a,button')], first=focusable[0], last=focusable.at(-1);
      if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
      if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    }
  });
  window.addEventListener('beforeunload',e=>{if (dirty()){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{ if (e.key===C.KEY && !draft) {load();render();} else if (e.key===C.KEY) notify('Notebook changed in another tab. Close this editor before reloading.'); });
  document.addEventListener('visibilitychange',()=>{ if (document.hidden) {stopVoice(true);stopReading();} });
  $('today').textContent=new Date().toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'});
  $('today').dateTime=new Date().toISOString().slice(0,10);
  load(); render(); closeDrawer(); voiceUI();
  if (deleted && !notes.some(n=>n.id===deleted.id)) notify('Your last deleted note can be restored',true);
})();
