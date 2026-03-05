# BumTeacherBypass

Tired of being handed non-editable PDF worksheets? This repo contains interactive HTML versions that auto-save your answers locally.

## Structure

```
index.html                          ← Home: module overview
css/
  global.css                        ← Shared styles (navigation, cards, inputs, layout)
  worksheet.css                     ← Worksheet-specific styles (save indicator)
js/
  worksheet.js                      ← Auto-save/restore, hints, reset utilities
modules/
  114/                              ← Module 114: Codieren / Komprimieren / Verschlüsseln
    index.html                      ←   Topic listing
    codierung/                      ←   Topic: Codierung & Zahlensysteme
      index.html                    ←     Worksheet listing
```

## Navigation

**Home → Module → Topic → Worksheet**

Each level has its own `index.html` with cards linking to the next level. Breadcrumb navigation at the top of every page.

## Features

- **Auto-save**: All input fields automatically saved to `localStorage` after 800ms of inactivity
- **Restore on load**: Previously entered answers restored when reopening a worksheet
- **Hints**: Toggle hints per exercise
- **Reset**: Clear individual sections
- **No solution checking**: Fill in answers freely
- **Pure HTML/CSS/JS**: No build tools, no frameworks — just open the files

## How to use

1. Clone the repo
2. Open `index.html` in your browser (or use Live Server)
3. Navigate to a worksheet and start working

## Adding a new worksheet

1. Create the `.html` file in the appropriate topic folder
2. Link `css/global.css`, `css/worksheet.css`, and `js/worksheet.js`
3. Add a link card in the topic's `index.html`
4. Call `Worksheet.init('module-topic-name')` with a unique key

## Adding a new module

1. Create `modules/<number>/index.html` with topic cards
2. Add a module card in the root `index.html`
Tired of being handed non-editable papers? Don't you worry my child. In this repo I will upload all our exercises as interactive files which will be saved locally on your machine.
