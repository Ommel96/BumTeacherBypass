# BumTeacherBypass — Developer Guide

> For student setup instructions, see [README.md](README.md).

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Express.js 4.21, Node 20+ |
| Database | better-sqlite3 (WAL mode, busy_timeout=5000) |
| Security | helmet, cors, express-rate-limit (120/min), morgan |
| Frontend | Pure HTML/CSS/JS — no framework, no build step |
| Fonts | Google Fonts: Crimson Pro, JetBrains Mono, DM Sans |
| Docker | Multi-stage node:20-alpine, non-root user `btb` |
| Port | 3847 |

## Project Structure

```
server.js                          Express server + SQLite REST API
package.json                       Dependencies and scripts
Dockerfile                         Multi-stage build, non-root user, HEALTHCHECK
docker-compose.yml                 Port 3847, volume db-data, resource limits (256M, 1 CPU)
docker-entrypoint.sh               Ensures data dir is writable
.env.example                       PORT=3847
.systemprompt                      Full project context for AI assistants (gitignored)

public/                            Static frontend (served by Express)
├── index.html                     Home — Lehrjahr 1-4
├── css/
│   ├── global.css                 Shared styles (~700 lines)
│   ├── worksheet.css              Save indicator, export bar, print styles
│   └── morse-code.css             Morse-specific styles
├── js/
│   └── worksheet.js               Client-side IIFE module (~300 lines)
├── year-{1..4}/
│   ├── index.html                 Year page (Semester 1 & 2 links)
│   └── semester-{1,2}/
│       └── index.html             Semester page (module listings)
└── year-1/semester-2/
    ├── 114/                       Module 114: Codieren / Komprimieren / Verschlüsseln
    │   ├── index.html             Module topics
    │   ├── codierung/
    │   │   ├── index.html         Worksheet listing (3 worksheets)
    │   │   ├── morse-code.html    Morse Code & Huffmann worksheet
    │   │   ├── zahlensysteme.html 10.2.1 Number systems theory + exercises
    │   │   ├── uebung-zahlensysteme.html  10.2.6 Conversion exercise
    │   │   └── assets/            Extracted images
    │   └── bitoperatoren/
    │       ├── index.html         Worksheet listing
    │       └── uebungen-bitoperatoren.html  10.3.1 Bit operations
    └── 164/                       Module 164: Datenbanken erstellen und Daten einfügen
        ├── index.html             Module topics
        └── assoziationen/
            ├── index.html         Worksheet listing
            ├── vertiefungsfragen.html     12.1.1 — open-ended, no solution check
            └── zusammenfassung-unnn.html  12.1.2 — UN/NN tables, with solution check

files/                             Source DOCX/PDF originals (not served)
data/                              SQLite DB at runtime (gitignored, Docker volume)
```

## Navigation Hierarchy

```
Home (Lehrjahr 1-4)
  └── Year X
        └── Semester X
              └── Module XXX
                    └── Topic
                          └── Worksheet
```

Path pattern: `public/year-{N}/semester-{N}/{module}/{topic}/{worksheet}.html`

## Database

**Schema:**
```sql
CREATE TABLE worksheet_data (
  worksheet  TEXT NOT NULL,
  field_id   TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (worksheet, field_id)
);
```

No user column — each student runs their own local instance. Data persists in a Docker volume (`db-data` → `/app/data/worksheets.db`).

**API endpoints:**

| Method | Route | Body / Response |
|---|---|---|
| POST | `/api/worksheet/:key` | `{ fields: { id: value, ... } }` → upserts all fields |
| GET | `/api/worksheet/:key` | → `{ fields: { id: value, ... } }` |
| DELETE | `/api/worksheet/:key` | → deletes all fields for that worksheet |

## Dual Persistence

Answers are saved in two ways:
1. **localStorage** — instant, survives page reloads
2. **SQLite API** — durable, 800ms debounced, survives `docker compose down`

On page load, the SQLite data takes priority. If the API is unreachable, localStorage is used as fallback.

## Client Module (worksheet.js)

IIFE exposing a global `Worksheet` object:

| Function | Purpose |
|---|---|
| `init(key)` | Restore fields, bind auto-save, create save indicator + export button |
| `saveAll()` | Save all fields to localStorage + API |
| `restoreAll()` | Load from API (fallback: localStorage), populate fields |
| `exportPDF()` | Trigger `window.print()` |
| `checkField(fieldId, expected, feedbackId, hint)` | Check a single field |
| `checkFields(checks[], feedbackId)` | Batch check multiple fields |
| `toggleHint(id)` | Show/hide a hint element |
| `resetFields(ids[])` | Clear specific fields and re-save |

Gathered field types: `input[type=text]`, `input[type=number]`, `textarea`, `select`

## Conventions

- **Language:** All UI text in German with proper umlauts (ä ö ü — never ae oe ue)
- **No emojis** — use SVG icons or text labels
- **Solution checking** only for exercises with definitive answers (selects, exact-match). Open-ended text fields get hints, not check buttons.
- **Worksheet key format:** `{module}-{topic}-{worksheet}` — e.g. `114-codierung-morse-code`
- **Breadcrumbs** include the full path: Home / Lehrjahr / Semester / Modul / Thema / Arbeitsblatt
- **CSS paths** use relative `../../..` based on depth from `public/`

## Adding a New Worksheet

1. **Source file** — place the original PDF/DOCX in `files/`
2. **Extract content** — use LibreOffice headless, pdftotext, or python-docx to get text/images
3. **Create HTML** at `public/year-X/semester-X/{module}/{topic}/{worksheet}.html`
   - Include CSS/JS with correct relative paths for the depth
   - Add full breadcrumb navigation
   - Call `Worksheet.init('{module}-{topic}-{worksheet}')` in a `<script>` block
   - Wire up event listeners for check/reset/hint buttons
4. **Add worksheet card** to the topic's `index.html`
5. **If new module/topic**, create the intermediate `index.html` pages and link from the semester page

### Worksheet HTML template (depth = 6 levels from public/)

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Worksheet Title</title>
  <link rel="stylesheet" href="../../../../../css/global.css" />
  <link rel="stylesheet" href="../../../../../css/worksheet.css" />
</head>
<body>
  <header>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../../../../../">Home</a>
      <span aria-hidden="true">/</span>
      <a href="../../../../">Lehrjahr X</a>
      <span aria-hidden="true">/</span>
      <a href="../../../">Semester X</a>
      <span aria-hidden="true">/</span>
      <a href="../../">Modul XXX</a>
      <span aria-hidden="true">/</span>
      <a href="../">Topic Name</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Worksheet Title</span>
    </nav>
    <h1>Worksheet Title</h1>
  </header>

  <main>
    <!-- Sections with inputs, selects, textareas -->
  </main>

  <script src="../../../../../js/worksheet.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      Worksheet.init('xxx-topic-worksheet');
    });
  </script>
</body>
</html>
```

## Adding a New Module

1. Create `public/year-X/semester-X/{module}/index.html` — topic listing page
2. Add a module card to the semester's `index.html`
3. Create topic folders with their own `index.html` worksheet listings

## Development

```bash
# Install dependencies locally (for IDE support)
npm install

# Run without Docker
npm run dev          # node --watch server.js

# Run with Docker
docker compose up -d --build

# View logs
docker compose logs -f

# Rebuild after changes
docker compose up -d --build

# Full reset (destroys saved data)
docker compose down -v && docker compose up -d --build
```

## Correct Answers Reference

Keep this updated when adding worksheets with solution checking.

### Module 114 — Morse Code
- Decode answer: `chuck norris kann ein feuer entfachen, indem er zwei eiswuerfel aneinander reibt.`
  - "eiswuerfel" stays without umlaut — the morse alphabet has no ü

### Module 114 — Zahlensysteme (10.2.1, 10.2.6)
- All conversion answers are definitive — see `checkTable1()`, `checkTable2()`, `checkLinux()` in zahlensysteme.html
- Exercise 10.2.6 answers: Zahl1(B7,267,10110111), Zahl2(141,8D,215), Zahl3(75,113,1001011), Zahl4(1022,3FE,1776), Zahl5(2050,802,100000000010)
- Linux permissions: 700, 740, 750, 777

### Module 114 — Bitoperatoren (10.3.1)
- All arithmetic, logic, shift, and LED answers verified — see check functions in uebungen-bitoperatoren.html
- LED einschalten uses OR, LED ausschalten uses AND

### Module 164 — UN/NN (12.1.2)
| Relationship | FK NN | FK UN |
|---|---|---|
| 1-c | Not Null (nein→ja) | Unique (ja→nein) |
| c-c | Nullable (ja→nein) | Unique (ja→nein) |
| 1-mc | Not Null (nein→ja) | Not Unique (nein→ja) |
| c-mc | Nullable (ja→nein) | Not Unique (nein→ja) |
| mc-mc | Both FKs: Not Null, Not Unique |
