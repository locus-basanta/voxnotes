// Node test suite for VoxNotes voice logic & command parser
const fs = require('fs');
const assert = require('assert');

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] || null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; }
};

// Mock SpeechSynthesis
global.window = {
  speechSynthesis: {
    speak: (u) => {},
    cancel: () => {}
  }
};

const DEFAULT_NOTES = [
  {
    id: 'note_1',
    title: 'Welcome to VoxNotes',
    content: 'Manage your thoughts and tasks entirely with your voice.',
    tag: 'Work',
    pinned: true,
    voiceCreated: false,
    createdAt: 1000,
    updatedAt: 1000
  },
  {
    id: 'note_2',
    title: 'Weekly Standup Agenda',
    content: '1. Review sprint roadmap.\n2. Fix latency.',
    tag: 'Todo',
    pinned: false,
    voiceCreated: true,
    createdAt: 2000,
    updatedAt: 2000
  }
];

let state = {
  notes: JSON.parse(JSON.stringify(DEFAULT_NOTES)),
  searchQuery: '',
  activeFilter: 'all'
};

function findNoteByFuzzyTitle(searchStr) {
  if (!searchStr) return null;
  const q = searchStr.toLowerCase().replace(/['"]/g, '').trim();

  let match = state.notes.find(n => n.title.toLowerCase() === q);
  if (match) return match;

  match = state.notes.find(n => n.title.toLowerCase().startsWith(q));
  if (match) return match;

  match = state.notes.find(n => n.title.toLowerCase().includes(q));
  if (match) return match;

  match = state.notes.find(n => {
    const words = n.title.toLowerCase().split(/\s+/);
    return words.some(w => w.includes(q) || q.includes(w));
  });

  return match || null;
}

function parseAppendCommand(phrase) {
  const match = phrase.toLowerCase().match(/^(?:add\s+to(?:\s+note)?|append(?:\s+to)?(?:\s+note)?)\s+(.+)$/i);
  if (!match) return null;
  const afterPrefix = phrase.substring(phrase.toLowerCase().indexOf(match[1]));

  const sortedNotes = [...state.notes].sort((a, b) => b.title.length - a.title.length);
  for (const n of sortedNotes) {
    const tLower = n.title.toLowerCase();
    const pLower = afterPrefix.toLowerCase();
    if (pLower.startsWith(tLower)) {
      const rest = afterPrefix.substring(tLower.length).trim();
      if (rest) return { note: n, text: rest };
    }
    const firstWord = n.title.split(/\s+/)[0].toLowerCase();
    if (pLower.startsWith(firstWord + ' ')) {
      const rest = afterPrefix.substring(firstWord.length).trim();
      if (rest) return { note: n, text: rest };
    }
  }

  const parts = afterPrefix.split(/\s+/);
  if (parts.length >= 2) {
    const candidateNote = findNoteByFuzzyTitle(parts[0]);
    if (candidateNote) {
      return { note: candidateNote, text: parts.slice(1).join(' ') };
    }
  }
  return null;
}

function handleSpokenInput(phrase) {
  const text = phrase.trim();
  const lower = text.toLowerCase();

  // Create
  const createMatch = lower.match(/^(?:create(?:\s+a)?\s+note|new\s+note|take(?:\s+a)?\s+note|make(?:\s+a)?\s+note|note)\s+(.+)$/i);
  if (createMatch) {
    const body = text.substring(text.indexOf(createMatch[1]));
    return createNoteFromVoice(body);
  }

  // Pin
  const pinMatch = lower.match(/^(pin|unpin)\s+(?:note\s+)?(.+)$/i);
  if (pinMatch) {
    const action = pinMatch[1].toLowerCase();
    const target = pinMatch[2].trim();
    const note = findNoteByFuzzyTitle(target);
    if (note) {
      note.pinned = action === 'pin';
      return { action: 'pin', note };
    }
    return null;
  }

  // Append / Add to note
  const appendRes = parseAppendCommand(phrase);
  if (appendRes) {
    appendRes.note.content += '\n' + appendRes.text;
    return { action: 'append', note: appendRes.note, text: appendRes.text };
  }

  // Delete
  const delMatch = lower.match(/^(?:delete|remove|trash|erase)\s+(?:note\s+)?(.+)$/i);
  if (delMatch) {
    const target = delMatch[1].trim();
    const note = findNoteByFuzzyTitle(target);
    if (note) {
      state.notes = state.notes.filter(n => n.id !== note.id);
      return { action: 'delete', deletedId: note.id };
    }
  }

  // Search
  const searchMatch = lower.match(/^(?:search(?:\s+for)?|find|look\s+for)\s+(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    state.searchQuery = query;
    return { action: 'search', query };
  }

  // Fallback
  return createNoteFromVoice(text);
}

function createNoteFromVoice(rawText) {
  const words = rawText.trim().split(/\s+/);
  let title = '';
  if (words.length <= 4) {
    title = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else {
    title = words.slice(0, 4).join(' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  let tag = 'Work';
  const lower = rawText.toLowerCase();
  if (lower.includes('buy') || lower.includes('todo') || lower.includes('grocery')) {
    tag = 'Todo';
  } else if (lower.includes('idea') || lower.includes('app')) {
    tag = 'Ideas';
  }

  const note = {
    id: 'note_' + Date.now(),
    title,
    content: rawText.trim(),
    tag,
    pinned: false,
    voiceCreated: true
  };
  state.notes.unshift(note);
  return { action: 'create', note };
}

// RUN TESTS
console.log('--- RUNNING VOXNOTES UNIT TESTS ---');

// Test 1: Fuzzy search title
const found = findNoteByFuzzyTitle('Standup');
assert.ok(found, 'Should find note with title containing Standup');
assert.strictEqual(found.id, 'note_2');
console.log('✓ Test 1: Fuzzy search passed');

// Test 2: Voice create note
const resCreate = handleSpokenInput('new note Buy sourdough bread and oat milk');
assert.strictEqual(resCreate.action, 'create');
assert.strictEqual(resCreate.note.tag, 'Todo', 'Should infer tag Todo from "buy"');
assert.ok(state.notes.length === 3, 'Notes array should have 3 items');
console.log('✓ Test 2: Voice creation & smart categorization passed');

// Test 3: Voice pin note
const resPin = handleSpokenInput('pin note Weekly Standup Agenda');
assert.strictEqual(resPin.action, 'pin');
assert.strictEqual(resPin.note.pinned, true);
console.log('✓ Test 3: Voice pin passed');

// Test 4: Voice search
const resSearch = handleSpokenInput('search sprint roadmap');
assert.strictEqual(resSearch.action, 'search');
assert.strictEqual(state.searchQuery, 'sprint roadmap');
console.log('✓ Test 4: Voice search passed');

// Test 5: Voice append
const resAppend = handleSpokenInput('add to note Welcome also verify sound wave');
assert.strictEqual(resAppend.action, 'append');
assert.ok(resAppend.note.content.includes('also verify sound wave'));
console.log('✓ Test 5: Voice append passed');

// Test 6: Voice delete
const resDel = handleSpokenInput('delete note Welcome');
assert.strictEqual(resDel.action, 'delete');
assert.ok(!state.notes.some(n => n.id === 'note_1'));
console.log('✓ Test 6: Voice delete passed');

// Test 7: Dictation punctuation cleanup test
const rawDictation = 'Hello world period how are you question mark new line I am good comma thanks';
const formatted = rawDictation
  .replace(/\s*\bperiod\b/gi, '.')
  .replace(/\s*\bcomma\b/gi, ',')
  .replace(/\s*\bquestion mark\b/gi, '?')
  .replace(/\s*\bexclamation mark\b/gi, '!')
  .replace(/\s*\bnew line\s*/gi, '\n')
  .replace(/\s*\bnew paragraph\s*/gi, '\n\n');
assert.strictEqual(formatted, 'Hello world. how are you?\nI am good, thanks');
console.log('✓ Test 7: Dictation punctuation parsing passed');

console.log('\nALL 7 TESTS PASSED SUCCESSFULLY! 🚀');
