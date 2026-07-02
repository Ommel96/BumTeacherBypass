export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';
import { analyzeTextForToolHints } from './tool-analysis';
import { saveToolGaps } from './tool-gaps-store';
import type { GenericComponentProps } from './worksheet-schema';

export interface ProviderConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; models: string[] }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5'],
  },
  'ollama-cloud': {
    baseUrl: 'https://ollama.com',
    models: ['glm-5.1', 'glm-5', 'glm-4.7', 'gemma4', 'qwen3.5', 'qwen3-coder', 'deepseek-v4-pro', 'deepseek-v4-flash', 'minimax-m3', 'minimax-m2.7', 'minimax-m2.5', 'minimax-m2.1', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5', 'nemotron-3-ultra', 'nemotron-3-super', 'gpt-oss:120b', 'gemini-3-flash-preview'],
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8080/v1',
    models: [],
  },
};

export interface ProviderResponse {
  title: string;
  content: string;
  sections?: unknown[];
  [key: string]: unknown;
}

function repairTruncatedJSON(content: string): string | null {
  // Try to repair truncated JSON by closing open strings, arrays, and objects.
  // Strategy: scan backwards from the end, tracking what's open, and close it.
  let inStr = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let esc = false;

  // First, find the last position where the JSON is structurally valid up to
  // by scanning forward and tracking state.
  let lastCleanEnd = -1;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;

    // After a comma or complete value at top level, mark as a clean cut point
    if (braceDepth === 0 && bracketDepth === 0 && (ch === ',' || ch === '{' || ch === '[')) {
      lastCleanEnd = i;
    }
  }

  // If we never found a clean cut point, try after the last complete value
  if (lastCleanEnd < 0) {
    // Find the last } or ] at the deepest level we can close
    let cutIdx = content.length;
    // If we're in a string, cut at the last quote
    if (inStr) {
      const lastQuote = content.lastIndexOf('"');
      if (lastQuote > 0) cutIdx = lastQuote + 1;
    }
    // Trim trailing incomplete content (no comma, no closing bracket after last value)
    const truncated = content.substring(0, cutIdx).trimEnd();
    // Remove trailing comma if present
    let repaired = truncated.replace(/,\s*$/, '');
    // Close open structures
    repaired += '}'.repeat(Math.max(0, braceDepth));
    repaired += ']'.repeat(Math.max(0, bracketDepth));
    return repaired;
  }

  // Cut at the last clean point, remove trailing comma
  let repaired = content.substring(0, lastCleanEnd).replace(/,\s*$/, '');
  // Close any open arrays and objects
  // Recount depth at the cut point
  braceDepth = 0;
  bracketDepth = 0;
  inStr = false;
  esc = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
  }

  repaired += '}'.repeat(Math.max(0, braceDepth));
  repaired += ']'.repeat(Math.max(0, bracketDepth));
  return repaired;
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (e) {
      console.error('extractJSON: fence match found but JSON.parse failed. Content length:', fenceMatch[1].length, 'Last 200 chars:', fenceMatch[1].slice(-200));
    }
  }

  const greedyFenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*)\n\s*```/);
  if (greedyFenceMatch && greedyFenceMatch[1] !== fenceMatch?.[1]) {
    try {
      return JSON.parse(greedyFenceMatch[1].trim());
    } catch {}
  }

  // Handle unclosed code fences — model output may be truncated
  const unclosedFence = trimmed.match(/```(?:json)?\s*\n([\s\S]*)/);
  if (unclosedFence) {
    const content = unclosedFence[1].trim();
    // Try to find the matching closing brace
    const firstBrace = content.indexOf('{');
    if (firstBrace >= 0) {
      let depth = 0;
      let inStr = false;
      let esc = false;
      let lastValidClose = -1;
      for (let i = firstBrace; i < content.length; i++) {
        const ch = content[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) lastValidClose = i; }
        if (depth === 0) {
          try {
            return JSON.parse(content.substring(firstBrace, i + 1));
          } catch (e) {
            console.error('extractJSON: unclosed fence bracket match failed. Content length:', i + 1, 'Last 200 chars:', content.substring(firstBrace, i + 1).slice(-200));
            break;
          }
        }
      }
      // Truncated JSON — try to repair by closing open strings, arrays, and objects
      if (lastValidClose < 0) {
        // Find the last complete key-value pair before truncation
        const repaired = repairTruncatedJSON(content.substring(firstBrace));
        if (repaired) {
          try {
            return JSON.parse(repaired);
          } catch (e) {
            console.error('extractJSON: repair attempt failed. Last 200 chars:', repaired.slice(-200));
          }
        }
      }
      console.error('extractJSON: unclosed fence, no matching close brace found. Content may be truncated.');
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let startIdx = -1;
  if (firstBrace === -1 && firstBracket === -1) {
    throw new Error('No JSON object found in AI response');
  } else if (firstBrace === -1) {
    startIdx = firstBracket;
  } else if (firstBracket === -1) {
    startIdx = firstBrace;
  } else {
    startIdx = Math.min(firstBrace, firstBracket);
  }

  const openChar = trimmed[startIdx];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) depth++;
    else if (ch === closeChar) depth--;

    if (depth === 0) {
      try {
        return JSON.parse(trimmed.substring(startIdx, i + 1));
      } catch (e) {
        console.error('extractJSON: found brackets but JSON.parse failed, first 500 chars:', trimmed.substring(startIdx, startIdx + 500));
        break;
      }
    }
  }

  throw new Error(`Could not parse JSON from AI response (first 200 chars: ${trimmed.substring(0, 200)}...)`);
}

export class AIProvider {
  private config: ProviderConfig;
  private enrichmentConfig?: ProviderConfig;
  private reviewerConfig?: ProviderConfig;

  constructor(config: ProviderConfig, enrichmentConfig?: ProviderConfig, reviewerConfig?: ProviderConfig) {
    this.config = config;
    this.enrichmentConfig = enrichmentConfig;
    this.reviewerConfig = reviewerConfig;
  }

  private buildStructurePrompt(): string {
    return `You are an educational worksheet structure generator for German vocational education (Lehrjahr/Modul/Arbeitsblatt).

PASS 1: Convert the raw document text into a structured worksheet JSON. Focus on ACCURATE STRUCTURE and CONTENT PRESERVATION. Do NOT add expected answers, checkGroups, interactive components, or hints yet — those will be added in Pass 2.

RESPOND WITH ONLY A JSON OBJECT. No markdown, no code fences.

JSON structure:
{
  "title": "worksheet title in German",
  "label": "optional module label, e.g. 'Modul 114 -- Codieren'",
  "subtitle": "optional subtitle",
  "sections": [
    {
      "type": "section" | "story" | "info" | "example",
      "number": "1",
      "title": "section title in German",
      "content": "the educational text content using **bold**, \`code\`, and line breaks",
      "fields": [
        {"id": "s1_f1", "label": "German label for the question", "type": "text|textarea", "placeholder": "optional hint text"}
      ],
      "table": {"id": "t1", "columns": [{"key": "k", "label": "Label", "editable": true|false}], "rows": [{"k": "given value"}]},
      "resets": ["s1_f1"]
    }
  ]
}

RULES:
1. GERMAN labels: use German for all labels, titles, placeholders
2. PRESERVE all educational content — every question, scenario, table, formula, example from the source
3. Every fill-in-the-blank question → "text" field with a unique id
4. Every open-ended/reflection question → "textarea" field (no expected answer needed)
5. Tables with editable cells for student answers, given values pre-filled
6. Number sections: "1", "2", "3" for exercises, "i", "ii" for info
7. Field IDs must be unique across the entire worksheet
8. Do NOT include checkGroups, expected answers, interactive components, or hints — those come in Pass 2
9. Do NOT add "interactive" type sections — use "section" with text fields for now`;
  }

  private buildEnrichmentPrompt(structuredWorksheet: string, detectedTools?: string[], compendiumEntries?: Array<{ id: string; title: string; keywords: string }>): string {
    const toolsHint = detectedTools && detectedTools.length > 0
      ? `\n\nDETECTED RELEVANT TOOLS (the document content matches these interactive components — use them where appropriate):\n${detectedTools.map(t => `- ${t}`).join('\n')}`
      : '';

    const compendiumHint = compendiumEntries && compendiumEntries.length > 0
      ? `\n\nAVAILABLE COMPENDIUM ENTRIES (link to these in compendiumRefs using their id as "ref" and their title as "label"):\n${compendiumEntries.map(e => `- ref: "${e.id}", title: "${e.title}"`).join('\n')}`
      : '';

    return `You are enriching an educational worksheet. The structure (Pass 1) is given below. Return ONLY a PATCH JSON object with additions — do NOT repeat the full worksheet. Keep it compact.

INPUT WORKSHEET (Pass 1):
${structuredWorksheet}
${toolsHint}
${compendiumHint}

Return a JSON object with this EXACT structure (only include keys you actually change/add):
{
  "sections": [
    {
      "number": "1",
      "type": "interactive",
      "interactive": {"type": "lz77Simulator", "props": {...}},
      "removeTable": true,
      "addFields": [{"id": "s1_f1", "label": "Resultierender Code", "type": "text", "placeholder": "z.B. (0,0,a) ..."}],
      "checkGroups": [{"id": "cg1", "checks": [{"fieldId": "s1_f1", "expected": "correct answer", "hint": "German hint"}], "feedbackId": "fb1", "label": "Prüfen"}],
      "hints": [{"id": "h1", "label": "Tipp", "content": "German hint text"}],
      "compendiumRefs": [{"ref": "entry-id", "label": "German label"}]
    }
  ],
  "toolGaps": []
}

RULES:
- "number" MUST match the section number from the input worksheet
- Only include sections that have additions or changes
- "type": set to "interactive" if adding an interactive component, otherwise omit
- "interactive": the component definition (see types below)
- "removeTable": set to true if the section had a table that should be removed (interactive components render their own)
- "addFields": NEW text fields to add to this section (for interactive sections, add a "text" field for the student's final answer). Use unique IDs.
- "checkGroups": one per text field that needs an expected answer. "expected" MUST be the correct answer — NEVER empty. The "fieldId" must match an existing or newly added field.
- "hints": German hints that guide without giving away the answer
- "compendiumRefs": link to compendium entries by their exact id

CRITICAL: Every interactive section MUST have an "addFields" with at least one "text" field for the student's final answer, AND a matching checkGroup with the correct "expected" value.

INTERACTIVE COMPONENT TYPES:
- pixelGrid: {"type": "pixelGrid", "props": {"width": 8, "height": 8, "fieldId": "pg1", "encodingType": "rle|binary|none", "encodingDirection": "row|col", "solution": [0,1,...], "labels": {"rows": [...], "cols": [...]}}}
- bitVisualizer: {"type": "bitVisualizer", "props": {"bits": 8, "fieldId": "bv1", "labels": ["128","64",...], "showDecimal": true, "showHex": true}}
- truthTable: {"type": "truthTable", "props": {"inputs": ["A","B"], "outputLabel": "Q = A AND B", "fieldId": "tt1"}}
- encodingExercise: {"type": "encodingExercise", "props": {"encodingType": "binary|hex|ascii|rle|morse", "fromFormat": "Dezimal", "toFormat": "Binär", "examples": [...], "exercises": [...], "fieldId": "enc1"}}
- huffmanTreeBuilder: {"type": "huffmanTreeBuilder", "props": {"fieldId": "ht1", "initialString": "SCHAFFHAUSEN", "frequencyTable": {"S": 2, "C": 1}}}
- lz77Simulator (ENCODE): {"type": "lz77Simulator", "props": {"fieldId": "lz1", "inputString": "MUSTERRABARBAR", "bufferSize": 6, "lookaheadSize": 4, "stepByStep": true, "direction": "encode"}}
- lz77Simulator (DECODE): {"type": "lz77Simulator", "props": {"fieldId": "lz2", "inputString": "", "decodeInput": "(0,0,B) (0,0,A)...", "bufferSize": 6, "lookaheadSize": 4, "direction": "decode"}}
- lz78Simulator: {"type": "lz78Simulator", "props": {"fieldId": "lz3", "algorithm": "lz78", "direction": "encode", "inputString": "RADLADERMUSTER", "solution": [{"step": 1, "dictionaryEntry": "R", "output": "(0,R)"}]}}
- compressionTable: {"type": "compressionTable", "props": {"fieldId": "ct1", "algorithm": "lzw", "direction": "encode", "inputString": "ABABABA", "solution": [{"step": 1, "dictionaryEntry": "AB", "output": "65"}]}}
- xorCalculator: {"type": "xorCalculator", "props": {"fieldId": "xor1", "bits": 8, "inputA": "01001111", "inputB": "01000011", "solution": "00001100"}}
  Use when: XOR operations, bitwise XOR, exclusive-or, comparing two binary sequences bit by bit
- asymmetricFlow: {"type": "asymmetricFlow", "props": {"fieldId": "af1", "sender": "Alice", "receiver": "Bob", "message": "Hallo", "steps": [{"label": "Schritt", "description": "..."}]}}
  Use when: asymmetric encryption, public/private key exchange, Alice/Bob scenarios, RSA flow visualization
- choiceMatrix: {"type": "choiceMatrix", "props": {"fieldId": "cm1", "columns": ["Wahr", "Falsch"], "rows": [{"question": "Berlin ist die Hauptstadt von Deutschland.", "correctAnswers": ["Wahr"]}], "multipleSelection": false}}
  Use when: true/false questions, yes/no questions, multiple choice with clickable cells. Columns can be any values (Wahr/Falsch, Ja/Nein, A/B/C/D). Set multipleSelection: true when more than one answer per row is correct. correctAnswers contains the column values that are right.
- dropdownChoice: {"type": "dropdownChoice", "props": {"fieldId": "dc1", "rows": [{"question": "Welches Protokoll...", "options": ["TCP", "UDP", "ICMP"], "correctAnswers": ["TCP"]}], "multipleSelection": false}}
  Use when: questions where student picks from a dropdown list, or checkbox-style selection. Set multipleSelection: true for multi-select (renders checkboxes instead of dropdown). correctAnswers contains the option values that are right.
- custom: {"type": "custom", "props": {"fieldId": "gen1", "layout": [...primitives...]}}
  Use when: content needs an interactive component that none of the named types above can handle. Instead of emitting a toolGap, build a custom component from composable primitives. This is preferred over toolGaps — only emit a toolGap if the content truly cannot be expressed with the primitives below.

  PRIMITIVES (composable layout tree for "custom" components):
  - display: {"type": "display", "content": "text to show", "format": "text|code|mono"}
  - input: {"type": "input", "fieldId": "f1", "label": "German label", "placeholder": "hint", "inputType": "text|number", "maxLength": 1, "width": "2rem", "mono": true}
  - textarea: {"type": "textarea", "fieldId": "f2", "label": "German label", "rows": 3}
  - table: {"type": "table", "fieldId": "t1", "columns": [{"key": "col1", "label": "German", "editable": true}], "rows": [{"col1": "given value"}]}
  - toggleGrid: {"type": "toggleGrid", "fieldId": "tg1", "columns": ["Wahr", "Falsch"], "rows": [{"label": "German question", "correctAnswers": ["Wahr"]}], "multipleSelection": false}
  - dropdown: {"type": "dropdown", "fieldId": "dd1", "rows": [{"question": "German question", "options": ["A", "B", "C"], "correctAnswers": ["A"]}], "multipleSelection": false}
  - stepper: {"type": "stepper", "fieldId": "st1", "steps": [{"label": "Schritt 1", "description": "German desc", "inputPlaceholder": "Was passiert?"}]}
  - codeLine: {"type": "codeLine", "fieldId": "cl1", "cells": [{"value": "1010", "editable": false}, {"fieldId": "cl1_r1", "editable": true, "maxLength": 1, "width": "2rem"}]}
  - checkButton: {"type": "checkButton", "checks": [{"fieldId": "f1", "expected": "correct answer", "hint": "German hint"}], "feedbackId": "fb1", "label": "Prüfen"}
  - resetButton: {"type": "resetButton", "fieldIds": ["f1", "f2"], "label": "Zurücksetzen"}
  - solutionButton: {"type": "solutionButton", "fieldId": "f1", "solution": "the solution", "label": "Lösung anzeigen"}
  - row: {"type": "row", "children": [...primitives...], "gap": "0.5rem", "align": "center", "wrap": true}
  - col: {"type": "col", "children": [...primitives...], "gap": "0.5rem", "align": "stretch"}
  - repeat: {"type": "repeat", "fieldId": "rep1", "count": 4, "child": {...primitive...}, "fieldIdTemplate": "rep1_i{idx}", "labelTemplate": "Zeile {idx}", "startIndex": 1}

  Use "row" and "col" to compose primitives into layouts. Use "repeat" to duplicate a child N times with unique fieldIds (use {idx} in fieldIdTemplate for index substitution). Every "input" and "codeLine" editable cell gets its own fieldId. Add a "checkButton" with correct "expected" values for grading. Add a "resetButton" for clearing fields.

  Example — a binary addition exercise:
  {"type": "custom", "props": {"fieldId": "add1", "layout": [
    {"type": "display", "content": "Berechne: 01011 + 00110", "format": "code"},
    {"type": "row", "children": [
      {"type": "codeLine", "fieldId": "add1_a", "cells": [{"value": "01011", "editable": false}]},
      {"type": "display", "content": "+"},
      {"type": "codeLine", "fieldId": "add1_b", "cells": [{"value": "00110", "editable": false}]},
      {"type": "display", "content": "="},
      {"type": "codeLine", "fieldId": "add1_result", "cells": [{"fieldId": "add1_r0", "editable": true, "maxLength": 1, "width": "2rem"}, {"fieldId": "add1_r1", "editable": true, "maxLength": 1, "width": "2rem"}, {"fieldId": "add1_r2", "editable": true, "maxLength": 1, "width": "2rem"}, {"fieldId": "add1_r3", "editable": true, "maxLength": 1, "width": "2rem"}, {"fieldId": "add1_r4", "editable": true, "maxLength": 1, "width": "2rem"}]}
    ]},
    {"type": "row", "children": [
      {"type": "checkButton", "checks": [{"fieldId": "add1_r0", "expected": "1", "hint": "1+0=1"}, {"fieldId": "add1_r1", "expected": "0", "hint": "1+1=10, carry 1"}, {"fieldId": "add1_r2", "expected": "0", "hint": "0+1+carry1=10, carry 1"}, {"fieldId": "add1_r3", "expected": "0", "hint": "1+0+carry1=10, carry 1"}, {"fieldId": "add1_r4", "expected": "1", "hint": "0+0+carry1=1"}], "feedbackId": "add1_fb", "label": "Prüfen"},
      {"type": "resetButton", "fieldIds": ["add1_r0", "add1_r1", "add1_r2", "add1_r3", "add1_r4"], "label": "Zurücksetzen"}
    ]}
  ]}}

toolGaps: ONLY emit if content needs something the primitives above truly cannot express. Format: [{"name": "englishName", "reason": "German reason", "contentExample": "example", "suggestedProps": "description"}]

RESPOND WITH ONLY THE JSON PATCH. No markdown, no code fences. Start with { and end with }.`;
  }

  private buildReviewPrompt(enrichedWorksheet: string, compendiumEntries?: Array<{ id: string; title: string }>): string {
    const compendiumInfo = compendiumEntries && compendiumEntries.length > 0
      ? `\n\nAVAILABLE COMPENDIUM ENTRIES (validate compendiumRefs "ref" against these IDs):\n${compendiumEntries.map(e => `- ${e.id}: ${e.title}`).join('\n')}`
      : '';

    return `You are a quality reviewer for educational worksheets in German. You are given a worksheet that has already been structured (Pass 1) and enriched (Pass 2). Your job in Pass 3 is to REVIEW the worksheet and fix ALL issues.

Check for these problems and fix ALL that you find:

1. EMPTY EXPECTED VALUES: Every check in a checkGroup MUST have a non-empty "expected" value containing the correct answer. If any are empty, compute the correct answer from the worksheet content and fill it in. This is the MOST IMPORTANT check — empty expected values make the "Prüfen" button useless.

2. MISSING CHECKGROUPS: Every "text" field (NOT textarea) MUST have a checkGroup. If any text fields lack a checkGroup, add one with the correct expected answer.

3. INTERACTIVE COMPONENT CORRECTNESS:
   - Every section with type "interactive" MUST have an "interactive" property with a valid type (pixelGrid, bitVisualizer, truthTable, encodingExercise, huffmanTreeBuilder, lz77Simulator, lz78Simulator, compressionTable, xorCalculator, asymmetricFlow, choiceMatrix, dropdownChoice, custom)
   - For custom components: verify every "input" and "codeLine" editable cell has a unique fieldId. Verify every "checkButton" has correct "expected" values. Verify "row"/"col" children are valid primitives. Verify "repeat" has a valid "count" and "fieldIdTemplate" with {idx} substitution.
   - For lz77Simulator: if the task is DECODING (giving triples to decode), the props MUST include "direction": "decode" and "decodeInput" with the triple string. If the task is ENCODING, use "direction": "encode" with "inputString"
   - For lz77Simulator/lz78Simulator/compressionTable: the section should NOT have a "table" property (the component renders its own table). Remove any stale "table" from interactive sections
   - Verify "inputString" matches the actual word from the original document content, not a made-up word
   - Verify "bufferSize" and "lookaheadSize" match what the document specifies

4. ORPHANED/DUPLICATE FIELD IDs: Every field should have a unique "id" across the entire worksheet. Remove or rename duplicates.

5. MISSING COMPENDIUM REFS: If a section discusses a topic that has compendium entries, add compendiumRefs. If compendium refs exist but the "ref" doesn't match any compendium entry ID, fix it.${compendiumInfo}

6. MISSING HINTS: If a section has difficult content but no hints, add at least one German hint.

7. FORMATTING: Ensure all text content uses proper German spelling and grammar.

8. CHECKGROUP HINTS: Each check should have a meaningful "hint" in German that guides without giving away the answer.

9. EMPTY CONTENT: Every section MUST have a "content" string. If missing or null, set to "".

RESPOND WITH ONLY THE COMPLETE CORRECTED JSON OBJECT. No markdown, no code fences, no explanation. The JSON must start with { and end with }.

INPUT WORKSHEET (enriched, may have issues):
${enrichedWorksheet}`;
  }

  async processPage(rawText: string, pageNumber: number, totalPages: number, compendiumEntries?: Array<{ id: string; title: string; keywords: string }>, onStep?: (step: string) => void): Promise<ProviderResponse> {
    onStep?.('pass1');
    const structureResult = await this.callProvider(this.buildStructurePrompt(), `Page ${pageNumber} of ${totalPages}:\n\n${rawText}`);
    const structured = extractJSON(structureResult) as ProviderResponse;
    console.log(`Pass 1 (structure): ${structured?.sections?.length || 0} sections, title: "${structured?.title || 'N/A'}"`);

    if (!structured || !structured.title || !Array.isArray(structured.sections) || structured.sections.length === 0) {
      console.error('Pass 1 (structure) produced invalid result. Raw response (first 500 chars):', structureResult.substring(0, 500));
      return structured || { title: `Page ${pageNumber}`, content: '', sections: [] };
    }

    const structuredStr = JSON.stringify(structured, null, 2);
    const detectedTools = analyzeTextForToolHints(rawText);
    if (detectedTools.length > 0) {
      console.log(`Detected tools for page ${pageNumber}: ${detectedTools.map(t => t.type).join(', ')}`);
    }
    const enrichmentPrompt = this.buildEnrichmentPrompt(structuredStr, detectedTools.map(t => t.type), compendiumEntries);
    const enrichmentCfg = this.enrichmentConfig || this.config;

    onStep?.('pass2');
    let enrichedResult: string;
    try {
      enrichedResult = await this.callProviderWithConfig(enrichmentCfg, enrichmentPrompt, 'Return only the JSON patch with additions for this worksheet.');
    } catch (err) {
      console.error('Pass 2 (enrichment) API call failed, using Pass 1 result:', err);
      return structured;
    }

    try {
      const patch = extractJSON(enrichedResult) as {
        sections?: Array<Record<string, unknown>>;
        toolGaps?: Array<{ name: string; reason: string; contentExample: string; suggestedProps: string }>;
        title?: string;
      };

      // Detect if the model returned a full worksheet instead of a patch.
      // A patch has compact sections with "number" but no "content".
      // A full worksheet has "title" + sections with "content" + "type".
      const patchSections = patch?.sections || [];
      const looksLikeFullWorksheet = patch.title && patchSections.some(s => s.content && s.type);
      const normalizeNum = (n: unknown) => String(n).replace(/[.\s]/g, '');
      const originalNums = new Set((structured.sections || []).map(s => normalizeNum((s as Record<string, unknown>).number)));
      const anyPatchNumMatches = patchSections.some(ps => originalNums.has(normalizeNum(ps.number)));

      if (looksLikeFullWorksheet || (!anyPatchNumMatches && patchSections.length > 0)) {
        console.log(`Pass 2: model returned full worksheet instead of patch — using it directly (${patchSections.length} sections)`);
        const fullResult = { ...patch, toolGaps: undefined } as unknown as ProviderResponse;
        if (patch.toolGaps && Array.isArray(patch.toolGaps) && patch.toolGaps.length > 0) {
          saveToolGaps(patch.toolGaps.map(g => ({ ...g, detectedAt: new Date().toISOString() })));
        }

        if (this.reviewerConfig) {
          onStep?.('pass3');
          try {
            const reviewPrompt = this.buildReviewPrompt(JSON.stringify(fullResult, null, 2), compendiumEntries);
            const reviewResult = await this.callProviderWithConfig(this.reviewerConfig, reviewPrompt, 'Review and fix this worksheet for correctness and completeness.');
            const reviewed = extractJSON(reviewResult) as ProviderResponse;
            if (reviewed && reviewed.title && Array.isArray(reviewed.sections) && reviewed.sections.length > 0) {
              return reviewed;
            }
            console.error('Pass 3 (review) produced invalid result, using Pass 2 full worksheet');
          } catch (err) {
            console.error('Pass 3 (review) failed, using Pass 2 full worksheet:', err);
          }
        }

        return fullResult;
      }

      console.log(`Pass 2 (enrichment patch): ${patchSections.length} section patches, checkGroups: ${patchSections.map(s => Array.isArray(s.checkGroups) ? (s.checkGroups as unknown[]).length : 0).join(', ')}, interactive: ${patchSections.filter(s => s.interactive).length}`);

      // Apply patch to structured worksheet
      const merged = this.applyEnrichmentPatch(structured, patch);
      const mergedSections = merged.sections as Array<Record<string, unknown>>;
      console.log(`Pass 2 (merged): ${mergedSections.length} sections, types: ${mergedSections.map(s => s.type).join(', ')}, checkGroups: ${mergedSections.map(s => Array.isArray(s.checkGroups) ? (s.checkGroups as unknown[]).length : 0).join(', ')}`);

      if (patch.toolGaps && Array.isArray(patch.toolGaps) && patch.toolGaps.length > 0) {
        saveToolGaps(patch.toolGaps.map(g => ({
          ...g,
          detectedAt: new Date().toISOString(),
        })));
        console.log(`Detected ${patch.toolGaps.length} tool gap(s): ${patch.toolGaps.map(g => g.name).join(', ')}`);
      }

      if (this.reviewerConfig) {
        onStep?.('pass3');
        try {
          const reviewPrompt = this.buildReviewPrompt(JSON.stringify(merged, null, 2), compendiumEntries);
          console.log(`Pass 3 (review): starting review of ${mergedSections.length} sections`);
          const reviewResult = await this.callProviderWithConfig(this.reviewerConfig, reviewPrompt, 'Review and fix this worksheet for correctness and completeness.');
          const reviewed = extractJSON(reviewResult) as ProviderResponse;
          if (reviewed && reviewed.title && Array.isArray(reviewed.sections) && reviewed.sections.length > 0) {
            const reviewedSections = reviewed.sections as Array<Record<string, unknown>>;
            const reviewCGs = reviewedSections.map(s => Array.isArray(s.checkGroups) ? (s.checkGroups as unknown[]).length : 0);
            const reviewInteractive = reviewedSections.filter(s => s.type === 'interactive').length;
            console.log(`Pass 3 (review): ${reviewedSections.length} sections, checkGroups: ${reviewCGs.join(', ')}, interactive: ${reviewInteractive}`);
            return reviewed;
          }
          console.error('Pass 3 (review) produced invalid result, using Pass 2 merged result');
        } catch (err) {
          console.error('Pass 3 (review) failed, using Pass 2 merged result:', err);
        }
      }

      return merged;
    } catch (err) {
      console.error('Pass 2 (enrichment) JSON parse failed, using Pass 1 result:', err);
    }

    return structured;
  }

  private applyEnrichmentPatch(worksheet: ProviderResponse, patch: { sections?: Array<Record<string, unknown>> }): ProviderResponse {
    const sections = (worksheet.sections || []) as Array<Record<string, unknown>>;
    const patchSections = patch.sections || [];

    // Build a lookup by normalized section number
    const normalizeNum = (n: unknown) => String(n).replace(/[.\s]/g, '');
    const patchByNumber = new Map<string, Record<string, unknown>>();
    for (const ps of patchSections) {
      const num = normalizeNum(ps.number);
      if (num) patchByNumber.set(num, ps);
    }

    // Track which patch sections were applied
    const matchedPatchNums = new Set<string>();

    const mergedSections = sections.map(section => {
      const num = normalizeNum(section.number);
      const patchSection = patchByNumber.get(num);
      if (!patchSection) return section;
      matchedPatchNums.add(num);

      const merged = { ...section };

      // Change type if specified
      if (patchSection.type) {
        merged.type = patchSection.type;
      }

      // Add interactive component
      if (patchSection.interactive) {
        merged.interactive = patchSection.interactive;
      }

      // Remove table if requested
      if (patchSection.removeTable) {
        delete merged.table;
      }

      // Add new fields (append, don't replace)
      if (patchSection.addFields && Array.isArray(patchSection.addFields)) {
        const existingFields = (merged.fields || []) as unknown[];
        merged.fields = [...existingFields, ...patchSection.addFields];
      }

      // Append checkGroups (don't replace — Pass 1 may have some from ensureCheckGroups)
      if (patchSection.checkGroups && Array.isArray(patchSection.checkGroups)) {
        const existing = Array.isArray(merged.checkGroups) ? merged.checkGroups : [];
        merged.checkGroups = [...existing, ...patchSection.checkGroups];
      }

      // Append hints
      if (patchSection.hints && Array.isArray(patchSection.hints)) {
        const existing = Array.isArray(merged.hints) ? merged.hints : [];
        merged.hints = [...existing, ...patchSection.hints];
      }

      // Append compendiumRefs
      if (patchSection.compendiumRefs && Array.isArray(patchSection.compendiumRefs)) {
        const existing = Array.isArray(merged.compendiumRefs) ? merged.compendiumRefs : [];
        merged.compendiumRefs = [...existing, ...patchSection.compendiumRefs];
      }

      return merged;
    });

    // Log unmatched patch sections for diagnostics
    for (const ps of patchSections) {
      const num = normalizeNum(ps.number);
      if (num && !matchedPatchNums.has(num)) {
        console.warn(`Pass 2 (patch): section number "${num}" not found in worksheet sections [${sections.map(s => normalizeNum(s.number)).join(', ')}] — patch ignored for this section`);
      }
    }

    return { ...worksheet, sections: mergedSections };
  }

  private async callProvider(systemPrompt: string, userMessage: string): Promise<string> {
    return this.callProviderWithConfig(this.config, systemPrompt, userMessage);
  }

  private async callProviderWithConfig(config: ProviderConfig, systemPrompt: string, userMessage: string, maxRetries = 2): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        switch (config.provider) {
          case 'openai':
            return await this.callOpenAI(config, systemPrompt, userMessage);
          case 'anthropic':
            return await this.callAnthropic(config, systemPrompt, userMessage);
          case 'ollama':
            return await this.callOllama(config, systemPrompt, userMessage);
          case 'ollama-cloud':
            return await this.callOllamaCloud(config, systemPrompt, userMessage);
          case 'openai-compatible':
            return await this.callOpenAICompatible(config, systemPrompt, userMessage);
          default:
            throw new Error(`Unknown provider: ${config.provider}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isRetryable = lastError.message.includes('429') || lastError.message.includes('503') || lastError.message.includes('timeout') || lastError.message.includes('ECONNRESET') || lastError.message.includes('socket hang up');
        if (!isRetryable || attempt === maxRetries) throw lastError;
        const delay = (attempt + 1) * 3000;
        console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError!;
  }

  private async callOpenAI(config: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 16384,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  private async callAnthropic(config: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(900000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '{}';
  }

  private async callOllama(config: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        format: 'json',
        options: { num_predict: 32768 },
      }),
      signal: AbortSignal.timeout(900000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.message?.content || '{}';
  }

  private async callOllamaCloud(config: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        format: 'json',
        options: { num_predict: 32768 },
      }),
      signal: AbortSignal.timeout(900000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama Cloud API error: ${response.status} ${err}`);
    }

    if (!response.body) {
      throw new Error('Ollama Cloud: No response body');
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.message?.content) {
            fullContent += chunk.message.content;
          }
          if (chunk.done) {
            reader.cancel();
            return fullContent || '{}';
          }
        } catch {}
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      try {
        const chunk = JSON.parse(remaining);
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
        }
      } catch {}
    }

    return fullContent || '{}';
  }

  private async callOpenAICompatible(config: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseUrl,
    });

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: config.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 16384,
      });
    } catch {
      completion = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 16384,
      });
    }

    return completion.choices[0]?.message?.content || '{}';
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      switch (this.config.provider) {
        case 'openai': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
          await client.models.list();
          return { ok: true };
        }
        case 'anthropic': {
          const res = await fetch(`${this.config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: this.config.model,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
          });
          if (res.ok || res.status === 400) return { ok: true };
          const err = await res.text();
          return { ok: false, error: `HTTP ${res.status}` };
        }
        case 'ollama': {
          const res = await fetch(`${this.config.baseUrl}/api/tags`);
          if (res.ok) return { ok: true };
          return { ok: false, error: `HTTP ${res.status}` };
        }
        case 'ollama-cloud': {
          const headers: Record<string, string> = {};
          if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
          }
          const res = await fetch(`${this.config.baseUrl}/api/tags`, { headers });
          if (res.ok) return { ok: true };
          const err = await res.text();
          return { ok: false, error: `HTTP ${res.status}: ${err}` };
        }
        case 'openai-compatible': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({
            apiKey: this.config.apiKey || 'not-needed',
            baseURL: this.config.baseUrl,
          });
          await client.models.list();
          return { ok: true };
        }
        default:
          return { ok: false, error: 'Unknown provider' };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async classifyDocument(rawText: string, existingModules: string[]): Promise<{ module_number: string; topic: string; title: string }> {
    const prompt = `You are a document classifier for a Swiss vocational education system (Lehrjahr/Modul). Given the raw text from a document, extract:
1. module_number: the module number (e.g. "114", "164", "105"). Only use one of these known modules if it clearly matches: ${existingModules.join(', ')}. If unsure, return empty string.
2. topic: a short lowercase topic slug (e.g. "codierung", "assoziationen", "bitoperatoren"). If unsure, return empty string.
3. title: a short descriptive title for this document in German (e.g. "Zahlensysteme", "Übung Bitoperatoren").

Respond with ONLY a JSON object: {"module_number":"...","topic":"...","title":"..."}

Document text (first 1500 chars):
${rawText.substring(0, 1500)}`;

    const messages = [
      { role: 'system' as const, content: prompt },
      { role: 'user' as const, content: 'Classify this document.' },
    ];

    try {
      let responseText = '';

      switch (this.config.provider) {
        case 'openai': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
          const completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0 });
          responseText = completion.choices[0]?.message?.content || '{}';
          break;
        }
        case 'anthropic': {
          const res = await fetch(`${this.config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: this.config.model, max_tokens: 256, system: prompt, messages: [{ role: 'user', content: 'Classify this document.' }] }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) throw new Error(`Anthropic classify error: ${res.status}`);
          const data = await res.json();
          responseText = data.content?.[0]?.text || '{}';
          break;
        }
        case 'ollama':
        case 'ollama-cloud': {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
          const res = await fetch(`${this.config.baseUrl}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: this.config.model, messages, stream: false, format: 'json' }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) throw new Error(`Ollama classify error: ${res.status}`);
          const data = await res.json();
          responseText = data.message?.content || '{}';
          break;
        }
        case 'openai-compatible': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey: this.config.apiKey || 'not-needed', baseURL: this.config.baseUrl });
          let completion;
          try {
            completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0 });
          } catch {
            completion = await client.chat.completions.create({ model: this.config.model, messages, temperature: 0 });
          }
          responseText = completion.choices[0]?.message?.content || '{}';
          break;
        }
      }

      const parsed = extractJSON(responseText) as { module_number?: string; topic?: string; title?: string };
      return {
        module_number: parsed.module_number || '',
        topic: parsed.topic || '',
        title: parsed.title || '',
      };
    } catch {
      return { module_number: '', topic: '', title: '' };
    }
  }

  async generateCompendiumEntries(rawText: string, moduleNumber: string, topic: string, existingEntries: Array<{ title: string; content: string; keywords: string }> = [], webResearch: string = ''): Promise<Array<{ title: string; content: string; keywords: string[]; interactive_examples: Array<{ label: string; component: { type: 'custom'; props: GenericComponentProps } }> }>> {
    const existingSection = existingEntries.length > 0
      ? `\n\nEXISTING COMPENDIUM ENTRIES (already covered — do NOT duplicate this content, only ADD new information or sub-sections that are missing):\n${existingEntries.map(e => `--- ${e.title} ---\nKeywords: ${e.keywords}\n${e.content.substring(0, 500)}...`).join('\n\n')}`
      : '';

    const webSection = webResearch
      ? `\n\nADDITIONAL RESEARCH from Wikipedia (use this to enrich and expand entries with supplementary knowledge):\n${webResearch.substring(0, 3000)}`
      : '';

    const prompt = `You are creating a reference compendium for Swiss vocational education (Lehrjahr/Modul). Given raw text from educational documents, existing compendium entries, and web research, create or update compendium entries.

IMPORTANT RULES:
1. Consolidate closely related sub-topics into a SINGLE entry with multiple sections. For example, instead of separate entries for "LZ77 Dekodierung", "LZ77 Kompressionsverfahren", create ONE entry titled "LZ77 Kompression" with ### sub-sections.
2. If EXISTING ENTRIES are provided, ONLY add NEW sub-sections or entries that cover topics NOT already present. Do not repeat existing content.
3. Use the WEB RESEARCH to enrich entries with additional context, examples, and explanations beyond what the document provides.
4. Each entry should be comprehensive — a student should be able to learn the topic from the compendium alone.

For each major concept or topic area, create a compendium entry with:
- A descriptive German title for the OVERALL topic
- A thorough explanation with sub-sections (using ### headings) for each sub-topic
- Key terms/keywords for search — include ALL relevant sub-topic keywords
- Examples where helpful (from document AND web research)
- Important formulas, rules, or procedures
- Use markdown-like formatting: **bold**, \`code\`, ### headings, | tables |

INTERACTIVE EXAMPLES: For each entry, add 0-3 interactive examples that VISUALIZE the concept for the student. These are demonstrations, NOT exercises — the student should be able to see how the concept works, not be tested on it. Use the "custom" component with the composable primitives below. Each example has a German "label" and a "component" with type "custom".

KEY DIFFERENCE from worksheet interactive components: Compendium examples are DEMONSTRATIONS, not exercises.
- Use "solutionButton" to pre-fill the correct answer so students can see it
- Use "display" with "format": "code" to show the worked-out solution
- Do NOT use "checkButton" — these are not quizzes
- Do NOT require the student to type the correct answer
- Instead, show the input, show the solution, and let the student explore
- If using "input" fields, pre-fill them or show the solution via "solutionButton"
- Keep examples simple and self-contained

PRIMITIVES for custom components (same as worksheet enrichment):
- display: {"type": "display", "content": "text", "format": "text|code|mono"}
- input: {"type": "input", "fieldId": "ex1_f1", "label": "German label", "placeholder": "hint", "inputType": "text|number", "maxLength": 1, "width": "2rem", "mono": true}
- codeLine: {"type": "codeLine", "fieldId": "ex1_cl1", "cells": [{"value": "1010", "editable": false}, {"fieldId": "ex1_r1", "editable": true, "maxLength": 1, "width": "2rem"}]}
- checkButton: {"type": "checkButton", "checks": [{"fieldId": "ex1_f1", "expected": "correct answer", "hint": "German hint"}], "feedbackId": "ex1_fb1", "label": "Prüfen"}
- resetButton: {"type": "resetButton", "fieldIds": ["ex1_f1"], "label": "Zurücksetzen"}
- solutionButton: {"type": "solutionButton", "fieldId": "ex1_f1", "solution": "the solution", "label": "Lösung anzeigen"}
- row: {"type": "row", "children": [...primitives...], "gap": "0.5rem", "align": "center", "wrap": true}
- col: {"type": "col", "children": [...primitives...], "gap": "0.5rem"}
- toggleGrid: {"type": "toggleGrid", "fieldId": "ex1_tg1", "columns": ["Wahr", "Falsch"], "rows": [{"label": "German question", "correctAnswers": ["Wahr"]}], "multipleSelection": false}
- dropdown: {"type": "dropdown", "fieldId": "ex1_dd1", "rows": [{"question": "German question", "options": ["A", "B", "C"], "correctAnswers": ["A"]}], "multipleSelection": false}

Example interactive example for a binary conversion entry (DEMONSTRATION, not exercise):
{"label": "Dezimal zu Binär", "component": {"type": "custom", "props": {"fieldId": "comp_ex1", "layout": [
  {"type": "display", "content": "Wandle 42 in eine Binärzahl um:", "format": "text"},
  {"type": "row", "children": [
    {"type": "input", "fieldId": "comp_ex1_ans", "label": "Dezimal 42 → Binär", "placeholder": "z.B. 101010", "mono": true},
    {"type": "solutionButton", "fieldId": "comp_ex1_ans", "solution": "101010", "label": "Lösung anzeigen"}
  ]},
  {"type": "display", "content": "42 = 32 + 8 + 2 = 101010₂", "format": "code"}
]}}

IMPORTANT for interactive examples:
- Field IDs MUST be unique and prefixed with "comp_" to avoid collisions with worksheet fields
- Keep examples simple and self-contained
- These are DEMONSTRATIONS — show the solution, don't test the student
- Use "solutionButton" to reveal answers, NOT "checkButton"
- Include a "resetButton" where appropriate
- 0 examples if the topic is purely theoretical (e.g. history, definitions). 1-3 for topics with computations, conversions, or logic.

Module: ${moduleNumber}, Topic: ${topic}
${existingSection}${webSection}

Respond with ONLY a JSON object:
{
  "entries": [
    {
      "title": "LZ77 Kompression",
      "content": "### Sliding-Window-Verfahren\\nExplanation...\\n\\n### Kodierungsverfahren\\nExplanation...",
      "keywords": ["lz77", "sliding-window", "kompression", "dekodierung"],
      "interactive_examples": [
        {
          "label": "LZ77 Kodierung Üben",
          "component": {"type": "custom", "props": {"fieldId": "comp_lz77_ex1", "layout": [...]}}
        }
      ]
    }
  ]
}

Document text:
${rawText.substring(0, 4000)}`;

    const messages = [
      { role: 'system' as const, content: prompt },
      { role: 'user' as const, content: 'Extract knowledge topics from this document and create compendium entries.' },
    ];

    try {
      let responseText = '';

      switch (this.config.provider) {
        case 'openai': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
          const completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 16384 });
          responseText = completion.choices[0]?.message?.content || '[]';
          break;
        }
        case 'anthropic': {
          const res = await fetch(`${this.config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: this.config.model, max_tokens: 16384, system: prompt, messages: [{ role: 'user', content: 'Extract knowledge topics from this document and create compendium entries.' }] }),
            signal: AbortSignal.timeout(120000),
          });
          if (!res.ok) throw new Error(`Anthropic compendium error: ${res.status}`);
          const data = await res.json();
          responseText = data.content?.[0]?.text || '{}';
          break;
        }
        case 'ollama':
        case 'ollama-cloud': {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
          const res = await fetch(`${this.config.baseUrl}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: this.config.model, messages, stream: false, format: 'json' }),
            signal: AbortSignal.timeout(120000),
          });
          if (!res.ok) throw new Error(`Ollama compendium error: ${res.status}`);
          const data = await res.json();
          responseText = data.message?.content || '{}';
          break;
        }
        case 'openai-compatible': {
          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey: this.config.apiKey || 'not-needed', baseURL: this.config.baseUrl });
          let completion;
          try {
            completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 16384 });
          } catch {
            completion = await client.chat.completions.create({ model: this.config.model, messages, temperature: 0.2, max_tokens: 16384 });
          }
          responseText = completion.choices[0]?.message?.content || '[]';
          break;
        }
      }

      const parsed = extractJSON(responseText);
      if (!parsed || (typeof parsed === 'object' && !Array.isArray(parsed) && !(parsed as Record<string, unknown>).entries)) {
        console.error('Compendium: extractJSON returned unexpected structure:', typeof parsed, Array.isArray(parsed));
        console.error('Compendium response (first 500 chars):', responseText.substring(0, 500));
      }
      const entries = Array.isArray(parsed) ? parsed : (parsed && Array.isArray((parsed as Record<string, unknown>).entries) ? (parsed as Record<string, unknown>).entries as Record<string, unknown>[] : []);
      const result = entries.map((entry: Record<string, unknown>) => ({
        title: String(entry.title || ''),
        content: String(entry.content || ''),
        keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String) : [],
        interactive_examples: Array.isArray(entry.interactive_examples) ? entry.interactive_examples as Array<{ label: string; component: { type: 'custom'; props: GenericComponentProps } }> : [],
      })).filter(e => e.title && e.content);
      console.log(`Compendium: generated ${result.length} entries from ${entries.length} raw entries (response length: ${responseText.length})`);
      return result;
    } catch (error) {
      console.error('generateCompendiumEntries error:', error);
      return [];
    }
  }
}