# VoxNotes — Voice-Driven Notes & Management App

**Live App:** [locus-basanta.github.io/voxnotes](https://locus-basanta.github.io/voxnotes/)

**VoxNotes** is a fast, responsive, hands-free voice note-taking and management web application built with a warm paper-and-ink interface, the Web Speech API (SpeechRecognition & SpeechSynthesis), and Web Audio API.

## Features

- **Voice Command Management Engine:**
  - `Create note [title/content]` / `New note [content]` — instantly generates a categorized note.
  - `Read note [title]` / `Speak note [title]` — reads note title and body aloud using text-to-speech.
  - `Add to note [title] [text]` / `Append [title] [text]` — adds text to existing notes hands-free.
  - `Search [query]` / `Find [query]` — filters notes in real-time.
  - `Pin note [title]` / `Unpin note [title]` — toggles pinned priority.
  - `Delete note [title]` / `Remove note [title]` — deletes specified note.
  - `Clear search` / `Show all` — restores all notes.
  - `Export notes` — downloads notes as Markdown.
- **In-Editor Voice Dictation:**
  - Dictate directly into the note editor at the cursor with spoken punctuation support (`period`, `comma`, `question mark`, `new line`).
- **Reactive Audio Waveform:**
  - Real-time HTML5 Canvas soundwave visualizer that reacts when listening or speaking.
- **Mobile-First Responsive Design:**
  - Built with Tailwind CSS, strict 4px spacing, and slate dark theme.
  - Thumb-friendly bottom dock on mobile phones with floating voice action button.
  - Fluid grid (1 col on mobile, 2 on tablet, 3 on desktop).
- **Offline Local Storage:**
  - All notes and edits persist automatically in browser `localStorage`.
- **Export & Backup:**
  - One-click Markdown export backup.

## How to Run

Open `index.html` directly in any modern mobile or desktop browser (Chrome, Edge, Safari, Android WebView), or serve locally:

```bash
python3 -m http.server 3030 --directory projects/voice-notes
```
Then visit `http://localhost:3030`.
