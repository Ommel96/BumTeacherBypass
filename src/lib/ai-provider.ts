export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';
import { analyzeTextForToolHints } from './tool-analysis';
import { saveToolGaps } from './tool-gaps-store';
import type { GenericComponentProps } from './worksheet-schema';

export interface VisionImage {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

// Models known to support vision input. Used to decide whether to send images.
const VISION_CAPABLE_MODELS = [
  // OpenAI
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1', 'gpt-4.1-mini',
  // Anthropic
  'claude-3', 'claude-sonnet', 'claude-haiku', 'claude-opus',
  // Ollama Cloud / popular vision models
  'gemini', 'llava', 'bakllava', 'moondream', 'qwen2-vl', 'qwen2.5-vl', 'qwen-vl',
  'minicpm-v', 'internvl', 'glm-4', 'glm-4.5', 'glm-4.6', 'glm-5',
];

function modelSupportsVision(model: string): boolean {
  const lower = model.toLowerCase();
  return VISION_CAPABLE_MODELS.some(m => lower.includes(m));
}

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
  // Strategy: scan forward tracking state. Find the last position where we can
  // cleanly cut (after a comma, or after a properly matched ] or }), then close
  // all open structures from the inside out.
  let inStr = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let esc = false;

  let lastCleanEnd = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === '{') braceDepth++;
    else if (ch === '}') {
      // Mismatched: } inside an array — stop scanning, this is truncated junk
      if (bracketDepth > 0) break;
      braceDepth--;
      if (braceDepth >= 0) lastCleanEnd = i + 1;
      else break;
    }
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') {
      bracketDepth--;
      if (bracketDepth >= 0) lastCleanEnd = i + 1;
      else break;
    }
    else if (ch === ',') {
      lastCleanEnd = i;
    }
  }

  if (lastCleanEnd < 0) {
    // No clean boundary found — try to cut at the last quote if in a string
    let cutIdx = content.length;
    if (inStr) {
      const lastQuote = content.lastIndexOf('"');
      if (lastQuote > 0) cutIdx = lastQuote + 1;
    }
    const truncated = content.substring(0, cutIdx).trimEnd();
    let repaired = truncated.replace(/,\s*$/, '');
    // Count open structures for the fallback path
    const closeOrder: string[] = [];
    let is2 = false, es2 = false;
    for (let i = 0; i < truncated.length; i++) {
      const ch = truncated[i];
      if (es2) { es2 = false; continue; }
      if (ch === '\\' && is2) { es2 = true; continue; }
      if (ch === '"') { is2 = !is2; continue; }
      if (is2) continue;
      if (ch === '{') closeOrder.push('}');
      else if (ch === '}') closeOrder.pop();
      else if (ch === '[') closeOrder.push(']');
      else if (ch === ']') closeOrder.pop();
    }
    repaired += closeOrder.reverse().join('');
    return repaired;
  }

  // Cut at the last clean boundary
  let repaired = content.substring(0, lastCleanEnd).replace(/,\s*$/, '');

  // Track the order of opens to close them correctly (innermost first)
  const closeOrder: string[] = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\' && inStr2) { esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === '{') closeOrder.push('}');
    else if (ch === '}') closeOrder.pop();
    else if (ch === '[') closeOrder.push(']');
    else if (ch === ']') closeOrder.pop();
  }
  // Close in reverse order (innermost first)
  repaired += closeOrder.reverse().join('');

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

  // Truncated JSON — try to repair by closing open strings, arrays, and objects
  if (depth > 0) {
    const repaired = repairTruncatedJSON(trimmed.substring(startIdx));
    if (repaired) {
      try {
        return JSON.parse(repaired);
      } catch (e) {
        console.error('extractJSON: raw JSON repair attempt failed. Last 200 chars:', repaired.slice(-200));
      }
    }
  }

  throw new Error(`Could not parse JSON from AI response (first 200 chars: ${trimmed.substring(0, 200)}...)`);
}

// ─── Compendium interactive-example sanitization ───
// Models frequently emit examples with unknown primitive types, LaTeX wrapped in
// \(..\) delimiters inside raw-LaTeX fields, dangling flow-diagram edges, or
// forbidden quiz primitives. Invalid pieces would otherwise be stored and
// silently render as nothing, so they are normalized or dropped here.

const COMPENDIUM_PRIMITIVE_TYPES = new Set([
  'display', 'input', 'textarea', 'table', 'toggleGrid', 'dropdown', 'stepper', 'codeLine',
  'resetButton', 'row', 'col', 'repeat',
  'formulaDisplay', 'stepCalculator', 'flowDiagram', 'keyValueGrid', 'callout',
]);

// Unwrap "\( x \)" / "\[ x \]" / "$x$" / "$$x$$" around a raw-LaTeX field, but only
// when the delimiters span the whole string (mixed text+math is left for LatexText).
function unwrapMathDelimiters(value: string): string {
  const t = value.trim();
  const m = t.match(/^\\\(([\s\S]*)\\\)$/) || t.match(/^\\\[([\s\S]*)\\\]$/)
    || t.match(/^\$\$([\s\S]*)\$\$$/) || t.match(/^\$([\s\S]*)\$$/);
  if (m && !/\\[()[\]]|\$/.test(m[1])) return m[1].trim();
  return t;
}

function sanitizeCompendiumPrimitive(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (typeof p.type !== 'string' || !COMPENDIUM_PRIMITIVE_TYPES.has(p.type)) return null;

  if (typeof p.latex === 'string') p.latex = unwrapMathDelimiters(p.latex);
  if (Array.isArray(p.steps)) {
    p.steps = p.steps
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map(s => {
        const step = { ...s };
        if (typeof step.expression === 'string') step.expression = unwrapMathDelimiters(step.expression);
        return step;
      });
  }
  if (Array.isArray(p.children)) {
    p.children = p.children.map(sanitizeCompendiumPrimitive).filter(Boolean);
  }
  if (p.child) p.child = sanitizeCompendiumPrimitive(p.child) ?? undefined;

  if (p.type === 'flowDiagram') {
    const nodes = (Array.isArray(p.nodes) ? p.nodes : []).filter((n): n is Record<string, unknown> =>
      !!n && typeof n === 'object' && typeof (n as Record<string, unknown>).id === 'string' && typeof (n as Record<string, unknown>).label === 'string');
    if (nodes.length === 0) return null;
    const ids = new Set(nodes.map(n => n.id as string));
    p.nodes = nodes;
    p.edges = (Array.isArray(p.edges) ? p.edges : []).filter(e =>
      !!e && typeof e === 'object' && ids.has((e as Record<string, unknown>).from as string) && ids.has((e as Record<string, unknown>).to as string));
  }
  if (p.type === 'stepCalculator' && (!Array.isArray(p.steps) || p.steps.length === 0)) return null;
  if (p.type === 'formulaDisplay' && typeof p.latex !== 'string') return null;
  if (p.type === 'keyValueGrid' && (!Array.isArray(p.rows) || p.rows.length === 0)) return null;
  if (p.type === 'callout' && typeof p.content !== 'string') return null;
  if ((p.type === 'row' || p.type === 'col') && (!Array.isArray(p.children) || p.children.length === 0)) return null;

  return p;
}

function sanitizeInteractiveExamples(raw: unknown): Array<{ label: string; component: { type: 'custom'; props: GenericComponentProps } }> {
  if (!Array.isArray(raw)) return [];
  const result: Array<{ label: string; component: { type: 'custom'; props: GenericComponentProps } }> = [];
  raw.forEach((ex, exIndex) => {
    if (!ex || typeof ex !== 'object') return;
    const e = ex as Record<string, unknown>;
    const component = e.component as Record<string, unknown> | undefined;
    const props = component?.props as Record<string, unknown> | undefined;
    if (!component || component.type !== 'custom' || !props || !Array.isArray(props.layout)) return;
    const layout = props.layout.map(sanitizeCompendiumPrimitive).filter(Boolean);
    if (layout.length === 0) return;
    let fieldId = typeof props.fieldId === 'string' && props.fieldId ? props.fieldId : `ex${exIndex + 1}`;
    if (!fieldId.startsWith('comp_')) fieldId = `comp_${fieldId}`;
    result.push({
      label: typeof e.label === 'string' && e.label ? e.label : `Beispiel ${exIndex + 1}`,
      component: { type: 'custom', props: { ...props, fieldId, layout } as unknown as GenericComponentProps },
    });
  });
  return result;
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
9. Do NOT add "interactive" type sections — use "section" with text fields for now
10. WORKED EXAMPLES vs TASKS: if the document SHOWS a solved example (task together with its solution), use type "example" and keep the complete worked solution in "content" — do NOT add input fields to it. Only genuine student tasks (unanswered in the document) get fields. Do not invent extra tasks that are not in the document.`;
  }

  private buildEnrichmentPrompt(structuredWorksheet: string, detectedTools?: string[], compendiumEntries?: Array<{ id: string; title: string; keywords: string; content?: string }>, rawText?: string): string {
    const toolsHint = detectedTools && detectedTools.length > 0
      ? `\n\nDETECTED TOOL HINTS (keyword-based suggestions only — they may be false positives. Use a suggested component ONLY if a section genuinely asks the student to perform that task):\n${detectedTools.map(t => `- ${t}`).join('\n')}`
      : '';

    const compendiumHint = compendiumEntries && compendiumEntries.length > 0
      ? `\n\nAVAILABLE COMPENDIUM ENTRIES (link to these in compendiumRefs using their id as "ref" and their title as "label"; use their CONTENT as ground truth for quiz answers you generate):\n${compendiumEntries.map(e => `- ref: "${e.id}", title: "${e.title}"${e.content ? `\n  content: ${e.content.substring(0, 400).replace(/\n/g, ' ')}` : ''}`).join('\n')}`
      : '';

    const rawSection = rawText
      ? `\n\nORIGINAL DOCUMENT TEXT (source of truth — compute expected answers, inputStrings, and solutions from THIS text, not from memory):\n${rawText.substring(0, 6000)}`
      : '';

    return `You are enriching an educational worksheet. The structure (Pass 1) is given below. Return ONLY a PATCH JSON object with additions — do NOT repeat the full worksheet. Keep it compact.

YOUR MISSION: the result must be a BETTER learning experience than the source document, not a copy of it. Paper worksheets ask students to write text into blank lines; this app can grade answers, simulate algorithms, and give instant feedback — use that. A worksheet that ends up as only textareas is a FAILURE: that is just the paper worksheet again.

INPUT WORKSHEET (Pass 1):
${structuredWorksheet}
${rawSection}
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
    },
    {
      "number": "Z1",
      "new": true,
      "type": "interactive",
      "title": "Wissens-Check: SSL/TLS",
      "content": "Teste dein Wissen aus diesem Arbeitsblatt.",
      "interactive": {"type": "choiceMatrix", "props": {"fieldId": "z1_cm", "columns": ["Wahr", "Falsch"], "rows": [{"question": "TLS 1.3 ist die aktuellste TLS-Version.", "correctAnswers": ["Wahr"]}], "multipleSelection": false}},
      "hints": [{"id": "z1_h1", "label": "Tipp", "content": "German hint"}]
    }
  ],
  "toolGaps": []
}

RULES:
- "number" MUST match the section number from the input worksheet — EXCEPT for sections with "new": true, which are APPENDED as additional practice sections (use numbers "Z1", "Z2", ...)
- Only include sections that have additions or changes
- "type": set to "interactive" if adding an interactive component, otherwise omit
- "interactive": the component definition (see types below)
- "removeTable": set to true if the section had a table that should be removed (interactive components render their own)
- "addFields": NEW text fields to add to this section (for interactive sections, add a "text" field for the student's final answer). Use unique IDs.
- "checkGroups": one per text field that needs an expected answer. "expected" MUST be the correct answer — NEVER empty. The "fieldId" must match an existing or newly added field.
- COMPUTE every "expected" value by actually SOLVING the task step by step. For tasks FROM the document, use the exact words/values from the ORIGINAL DOCUMENT TEXT — never swap in substitutes. If unsure, still provide your best computed answer; never leave "expected" empty.
- "hints": German hints that guide without giving away the answer
- "compendiumRefs": link to compendium entries by their exact id

CRITICAL: Every interactive section MUST have an "addFields" with at least one "text" field for the student's final answer, AND a matching checkGroup with the correct "expected" value.

ENRICHMENT STRATEGY — decide per section, in this order:
1. UPGRADE document tasks: if a task matches a component below (encode this string, XOR these bits, fill this truth table), use that component with ALL parameters taken from the document. Never swap the document's data for invented data in an existing task.
2. Interactive task but no named component fits? → build a "custom" component from the primitives.
3. Theory sections, explorative tasks ("probiert aus...", "recherchiert..."), and open questions: KEEP them as they are (textarea is correct there) — but ADD a gradable companion as a NEW section ("new": true): a "Wissens-Check" quiz (choiceMatrix/dropdownChoice, 3-6 questions) or a "Zusatzübung" practice exercise on the same topic. Base correct answers on the compendium content, the document, and solid domain knowledge — factually correct, unambiguous, at Berufsschule level.
4. Inventing SMALL practice data (a short word to encode, two bytes to XOR, a mini scenario) is EXPLICITLY ALLOWED in these NEW "Z" sections — that is their purpose. It stays FORBIDDEN inside the document's own tasks.
5. TARGET: at least one checkable interactive element per major topic of the worksheet. Do not bolt a mismatched simulator onto a topic (no LZ77 simulator on an HTTPS worksheet) — when no algorithm fits, a knowledge quiz always fits.

SELF-CHECK before emitting: for every solution you provide (xorCalculator "solution", lz78/compressionTable "solution" rows, pixelGrid "solution", checkGroup "expected", quiz "correctAnswers"), actually compute or verify the answer step by step. A wrong stored answer marks correct student answers as wrong — this is the worst possible defect.

INTERACTIVE COMPONENT TYPES:
- pixelGrid: {"type": "pixelGrid", "props": {"width": 8, "height": 8, "fieldId": "pg1", "encodingType": "rle|binary|none", "encodingDirection": "row|col", "solution": [0,1,...], "labels": {"rows": [...], "cols": [...]}}}
  Use when: the document asks the student to encode/decode a PIXEL IMAGE (RLE or binary). Take the actual image/grid from the document; "solution" must have exactly width×height entries.
- bitVisualizer: {"type": "bitVisualizer", "props": {"bits": 8, "fieldId": "bv1", "labels": ["128","64",...], "showDecimal": true, "showHex": true}}
  Use when: the task is about bit positions/place values of a byte, or interactive decimal↔binary conversion.
- truthTable: {"type": "truthTable", "props": {"inputs": ["A","B"], "outputLabel": "Q = A AND B", "fieldId": "tt1"}}
  Use when: the task is filling in a truth table for a specific logic gate or boolean expression from the document.
- encodingExercise: {"type": "encodingExercise", "props": {"encodingType": "binary|hex|ascii|rle|morse", "fromFormat": "Dezimal", "toFormat": "Binär", "examples": [...], "exercises": [...], "fieldId": "enc1"}}
  Use when: converting between number systems or codes with CONCRETE values from the document as "exercises".
- huffmanTreeBuilder: {"type": "huffmanTreeBuilder", "props": {"fieldId": "ht1", "initialString": "SCHAFFHAUSEN", "frequencyTable": {"S": 2, "C": 1}}}
  Use when: the task builds a Huffman tree. Take initialString or frequencyTable from the document; the frequency table must match the string.
- lz77Simulator (ENCODE): {"type": "lz77Simulator", "props": {"fieldId": "lz1", "inputString": "MUSTERRABARBAR", "bufferSize": 6, "lookaheadSize": 4, "stepByStep": true, "direction": "encode"}}
- lz77Simulator (DECODE): {"type": "lz77Simulator", "props": {"fieldId": "lz2", "inputString": "", "decodeInput": "(0,0,B) (0,0,A)...", "bufferSize": 6, "lookaheadSize": 4, "direction": "decode"}}
  Use when: the document contains an LZ77 encode/decode task. inputString/decodeInput, bufferSize and lookaheadSize MUST come from the document.
- lz78Simulator: {"type": "lz78Simulator", "props": {"fieldId": "lz3", "algorithm": "lz78", "direction": "encode", "inputString": "RADLADERMUSTER", "solution": [{"step": 1, "dictionaryEntry": "R", "output": "(0,R)"}]}}
- compressionTable: {"type": "compressionTable", "props": {"fieldId": "ct1", "algorithm": "lzw", "direction": "encode", "inputString": "ABABABA", "solution": [{"step": 1, "dictionaryEntry": "AB", "output": "65"}]}}
  Use when: LZ78/LZW tasks with the exact input string from the document; compute the "solution" table step by step for that string.
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

  VISUALIZATION PRIMITIVES (for explaining/demonstrating inside a custom component — combine them with the input primitives above):
  - formulaDisplay: {"type": "formulaDisplay", "latex": "C = M^e \\bmod N", "caption": "German caption", "display": "block"} — beautifully rendered LaTeX formula
  - stepCalculator: {"type": "stepCalculator", "title": "German title", "interactive": true, "steps": [{"label": "German", "expression": "N = 3 \\cdot 11 = 33", "result": "N = 33"}]} — step-by-step worked demonstration; use it to SHOW the method before the student's own task
  - keyValueGrid: {"type": "keyValueGrid", "title": "German title", "rows": [{"key": "Parameter", "value": "\\(e = 7\\)", "highlight": true}], "columns": ["Parameter", "Wert"]} — structured parameter/property table
  - callout: {"type": "callout", "variant": "info|warning|success|tip", "title": "German title", "content": "German text with \\(math\\)"} — highlighted note box for tips and pitfalls
  - flowDiagram: {"type": "flowDiagram", "direction": "horizontal", "nodes": [{"id": "a", "label": "German, \\(math\\) ok", "shape": "box|circle|diamond", "highlight": true}], "edges": [{"from": "a", "to": "b", "label": "German"}]} — process/relationship diagram

  Use "row" and "col" to compose primitives into layouts. Use "repeat" to duplicate a child N times with unique fieldIds (use {idx} in fieldIdTemplate for index substitution). Every "input" and "codeLine" editable cell gets its own fieldId. Add a "checkButton" with correct "expected" values for grading. Add a "resetButton" for clearing fields.

  CUSTOM COMPONENT DESIGN RULES:
  - Recommended structure: short intro ("display" or "callout") → optional worked demo ("stepCalculator" with DIFFERENT data than the task) → the student's task (input/codeLine/table/toggleGrid) → one "row" with checkButton + resetButton at the end
  - All static text (labels, questions, display content, table cells) supports inline LaTeX \\(...\\) — use it for every formula, variable, and unit
  - Single-character answers: input with maxLength 1 and width "2rem"; group related inputs in a "row"
  - Every editable field must be covered by exactly ONE checkButton check with the correct expected value — no orphan fields, no double-checked fields
  - Do not mix the demo and the task: the stepCalculator shows the method, the student then applies it to the actual task data from the document

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

  private buildReviewPrompt(enrichedWorksheet: string, compendiumEntries?: Array<{ id: string; title: string }>, rawText?: string): string {
    const compendiumInfo = compendiumEntries && compendiumEntries.length > 0
      ? `\n\nAVAILABLE COMPENDIUM ENTRIES (validate compendiumRefs "ref" against these IDs):\n${compendiumEntries.map(e => `- ${e.id}: ${e.title}`).join('\n')}`
      : '';

    const rawSection = rawText
      ? `\n\nORIGINAL DOCUMENT TEXT (source of truth — verify expected answers, inputStrings, and parameters against THIS text):\n${rawText.substring(0, 6000)}\n`
      : '';

    return `You are a quality reviewer for educational worksheets in German. You are given a worksheet that has already been structured (Pass 1) and enriched (Pass 2). Your job in Pass 3 is to REVIEW the worksheet and fix ALL issues.
${rawSection}

Check for these problems and fix ALL that you find:

1. EMPTY EXPECTED VALUES: Every check in a checkGroup MUST have a non-empty "expected" value containing the correct answer. If any are empty, compute the correct answer from the worksheet content and fill it in. This is the MOST IMPORTANT check — empty expected values make the "Prüfen" button useless.

2. MISSING CHECKGROUPS: Every "text" field (NOT textarea) MUST have a checkGroup. If any text fields lack a checkGroup, add one with the correct expected answer.

3. INTERACTIVE COMPONENT CORRECTNESS:
   - Every section with type "interactive" MUST have an "interactive" property with a valid type (pixelGrid, bitVisualizer, truthTable, encodingExercise, huffmanTreeBuilder, lz77Simulator, lz78Simulator, compressionTable, xorCalculator, asymmetricFlow, choiceMatrix, dropdownChoice, custom)
   - For custom components: verify every "input" and "codeLine" editable cell has a unique fieldId. Verify every "checkButton" has correct "expected" values. Verify "row"/"col" children are valid primitives. Verify "repeat" has a valid "count" and "fieldIdTemplate" with {idx} substitution.
   - For lz77Simulator: if the task is DECODING (giving triples to decode), the props MUST include "direction": "decode" and "decodeInput" with the triple string. If the task is ENCODING, use "direction": "encode" with "inputString"
   - For lz77Simulator/lz78Simulator/compressionTable: the section should NOT have a "table" property (the component renders its own table). Remove any stale "table" from interactive sections
   - Verify "inputString" matches the actual word from the ORIGINAL DOCUMENT TEXT, not a made-up word
   - Verify "bufferSize" and "lookaheadSize" match what the document specifies
   - COMPONENT FIT: if a component does not match its section's topic (wrong algorithm, LZ77 simulator on an HTTPS worksheet), replace it with a fitting component or plain fields
   - ADDED PRACTICE SECTIONS ("Wissens-Check", "Zusatzübung", numbers like "Z1"): these are INTENTIONAL enrichment beyond the source document — do NOT remove them. Verify every quiz answer is factually correct and unambiguous; fix wrong or debatable ones. Small invented practice data is fine there; inside the document's ORIGINAL tasks the document's own data must be used.
   - RECOMPUTE all stored solutions step by step (xorCalculator "solution" = inputA XOR inputB, lz78/compressionTable "solution" rows, pixelGrid "solution") and fix any that are wrong

4. ORPHANED/DUPLICATE FIELD IDs: Every field should have a unique "id" across the entire worksheet. Remove or rename duplicates.

5. MISSING COMPENDIUM REFS: If a section discusses a topic that has compendium entries, add compendiumRefs. If compendium refs exist but the "ref" doesn't match any compendium entry ID, fix it.${compendiumInfo}

6. MISSING HINTS: If a section has difficult content but no hints, add at least one German hint.

7. FORMATTING: Ensure all text content uses proper German spelling and grammar.

8. CHECKGROUP HINTS: Each check should have a meaningful "hint" in German that guides without giving away the answer.

9. EMPTY CONTENT: Every section MUST have a "content" string. If missing or null, set to "".

10. WRONG EXPECTED VALUES: Re-compute each "expected" value by solving the task yourself using the ORIGINAL DOCUMENT TEXT. If your computed answer differs from the stored one, replace it with the correct answer.

11. MISSING INTERACTIVITY: if the worksheet contains NO checkable element at all (no checkGroups, no self-checking component — only textareas), ADD one new section titled "Wissens-Check" at the end: a choiceMatrix or dropdownChoice with 3-6 factually correct questions about the worksheet's topic. This app exists to turn passive worksheets into interactive learning — a worksheet with nothing to check has failed that goal.

NEVER REMOVE CONTENT: Your output must contain EVERY section, field, interactive component, and hint from the input — fixed, not deleted. You may only remove exact duplicates. Dropping content is a failure.

RESPOND WITH ONLY THE COMPLETE CORRECTED JSON OBJECT. No markdown, no code fences, no explanation. The JSON must start with { and end with }.

INPUT WORKSHEET (enriched, may have issues):
${enrichedWorksheet}`;
  }

  async processPage(rawText: string, pageNumber: number, totalPages: number, compendiumEntries?: Array<{ id: string; title: string; keywords: string; content?: string }>, onStep?: (step: string) => void, images?: VisionImage[], compendiumPromise?: Promise<Array<{ id: string; title: string; keywords: string; content?: string }>>): Promise<ProviderResponse> {
    onStep?.('pass1');
    const structureResult = await this.callProvider(this.buildStructurePrompt(), `Page ${pageNumber} of ${totalPages}:\n\n${rawText}`, images);
    let structured: ProviderResponse;
    try {
      structured = extractJSON(structureResult) as ProviderResponse;
    } catch (parseErr) {
      console.error(`Pass 1 (structure): JSON parse failed for page ${pageNumber}. Using fallback. Error:`, parseErr instanceof Error ? parseErr.message : parseErr);
      return { title: `Page ${pageNumber}`, content: '', sections: [] };
    }
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

    // Await compendium entries if provided as a promise (runs concurrently with pass 1)
    let effectiveCompendiumEntries = compendiumEntries;
    if (compendiumPromise) {
      try {
        effectiveCompendiumEntries = await compendiumPromise;
        console.log(`Page ${pageNumber}: compendium entries ready (${effectiveCompendiumEntries?.length || 0} entries) for enrichment`);
      } catch (e) {
        console.error(`Page ${pageNumber}: compendium promise rejected, using fallback entries:`, e);
      }
    }

    const enrichmentPrompt = this.buildEnrichmentPrompt(structuredStr, detectedTools.map(t => t.type), effectiveCompendiumEntries, rawText);
    const enrichmentCfg = this.enrichmentConfig || this.config;

    onStep?.('pass2');
    let enrichedResult: string;
    try {
      enrichedResult = await this.callProviderWithConfig(enrichmentCfg, enrichmentPrompt, 'Return only the JSON patch with additions for this worksheet.');
    } catch (err) {
      console.error('Pass 2 (enrichment) API call failed, using Pass 1 result:', err);
      return structured;
    }

    type EnrichmentPatch = {
      sections?: Array<Record<string, unknown>>;
      toolGaps?: Array<{ name: string; reason: string; contentExample: string; suggestedProps: string }>;
      title?: string;
    };

    let patch: EnrichmentPatch;
    try {
      patch = extractJSON(enrichedResult) as EnrichmentPatch;
    } catch (parseErr) {
      // One corrective retry — a failed Pass 2 means a worksheet with no answers at all,
      // which is the single biggest quality cliff.
      console.error('Pass 2 (enrichment) JSON parse failed, retrying once:', parseErr instanceof Error ? parseErr.message : parseErr);
      try {
        enrichedResult = await this.callProviderWithConfig(enrichmentCfg, enrichmentPrompt, 'Your previous response was not valid JSON. Return ONLY the JSON patch object — no markdown, no explanation. Start with { and end with }.');
        patch = extractJSON(enrichedResult) as EnrichmentPatch;
      } catch (retryErr) {
        console.error('Pass 2 (enrichment) retry also failed, using Pass 1 result:', retryErr);
        return structured;
      }
    }

    try {

      // Detect if the model returned a full worksheet instead of a patch.
      // A patch has compact sections with "number" but no "content".
      // A full worksheet has "title" + sections with "content" + "type".
      const patchSections = patch?.sections || [];
      // "new": true sections are appended practice sections — their presence means
      // this is a patch, not a full-worksheet response, even though they carry content.
      const hasAppendSections = patchSections.some(s => s.new === true);
      const looksLikeFullWorksheet = !hasAppendSections && patch.title && patchSections.some(s => s.content && s.type);
      const normalizeNum = (n: unknown) => String(n).replace(/[.\s]/g, '');
      const originalNums = new Set((structured.sections || []).map(s => normalizeNum((s as Record<string, unknown>).number)));
      const anyPatchNumMatches = patchSections.some(ps => originalNums.has(normalizeNum(ps.number)) || ps.new === true);
      // Renumbered but complete patch (one entry per section) — merge positionally instead
      // of misinterpreting it as a full worksheet.
      const patchIsPositional = !anyPatchNumMatches && patchSections.length === (structured.sections?.length || 0);

      if (looksLikeFullWorksheet || (!anyPatchNumMatches && patchSections.length > 0 && !patchIsPositional)) {
        console.log(`Pass 2: model returned full worksheet instead of patch — using it directly (${patchSections.length} sections)`);
        const fullResult = { ...patch, toolGaps: undefined } as unknown as ProviderResponse;
        if (patch.toolGaps && Array.isArray(patch.toolGaps) && patch.toolGaps.length > 0) {
          saveToolGaps(patch.toolGaps.map(g => ({ ...g, detectedAt: new Date().toISOString() })));
        }

        if (this.reviewerConfig) {
          onStep?.('pass3');
          try {
            const reviewPrompt = this.buildReviewPrompt(JSON.stringify(fullResult, null, 2), compendiumEntries, rawText);
            const reviewResult = await this.callProviderWithConfig(this.reviewerConfig, reviewPrompt, 'Review and fix this worksheet for correctness and completeness.');
            const reviewed = extractJSON(reviewResult) as ProviderResponse;
            if (reviewed && reviewed.title && Array.isArray(reviewed.sections) && reviewed.sections.length > 0 && this.reviewPreservesContent(fullResult, reviewed)) {
              return reviewed;
            }
            console.error('Pass 3 (review) produced invalid or lossy result, using Pass 2 full worksheet');
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
          const reviewPrompt = this.buildReviewPrompt(JSON.stringify(merged, null, 2), compendiumEntries, rawText);
          console.log(`Pass 3 (review): starting review of ${mergedSections.length} sections`);
          const reviewResult = await this.callProviderWithConfig(this.reviewerConfig, reviewPrompt, 'Review and fix this worksheet for correctness and completeness.');
          const reviewed = extractJSON(reviewResult) as ProviderResponse;
          if (reviewed && reviewed.title && Array.isArray(reviewed.sections) && reviewed.sections.length > 0 && this.reviewPreservesContent(merged, reviewed)) {
            const reviewedSections = reviewed.sections as Array<Record<string, unknown>>;
            const reviewCGs = reviewedSections.map(s => Array.isArray(s.checkGroups) ? (s.checkGroups as unknown[]).length : 0);
            const reviewInteractive = reviewedSections.filter(s => s.type === 'interactive').length;
            console.log(`Pass 3 (review): ${reviewedSections.length} sections, checkGroups: ${reviewCGs.join(', ')}, interactive: ${reviewInteractive}`);
            return reviewed;
          }
          console.error('Pass 3 (review) produced invalid or lossy result, using Pass 2 merged result');
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

  // Count the load-bearing pieces of a worksheet so a Pass 3 rewrite that silently
  // drops content can be detected and rejected.
  private worksheetStats(ws: unknown): { sections: number; fields: number; interactive: number; nonEmptyExpected: number } {
    const sections = (ws && typeof ws === 'object' && Array.isArray((ws as Record<string, unknown>).sections))
      ? (ws as Record<string, unknown>).sections as Array<Record<string, unknown>>
      : [];
    let fields = 0, interactive = 0, nonEmptyExpected = 0;
    for (const s of sections) {
      if (Array.isArray(s.fields)) fields += s.fields.length;
      if (s.type === 'interactive' || s.interactive) interactive++;
      if (Array.isArray(s.checkGroups)) {
        for (const cg of s.checkGroups as Array<Record<string, unknown>>) {
          if (Array.isArray(cg.checks)) {
            nonEmptyExpected += (cg.checks as Array<Record<string, unknown>>).filter(c => typeof c.expected === 'string' && (c.expected as string).trim() !== '').length;
          }
        }
      }
    }
    return { sections: sections.length, fields, interactive, nonEmptyExpected };
  }

  private reviewPreservesContent(before: unknown, after: unknown): boolean {
    const b = this.worksheetStats(before);
    const a = this.worksheetStats(after);
    // Fields may shrink by 1 (legitimate duplicate removal); everything else must not shrink.
    const ok = a.sections >= b.sections && a.interactive >= b.interactive && a.fields >= b.fields - 1 && a.nonEmptyExpected >= b.nonEmptyExpected;
    if (!ok) {
      console.warn(`Pass 3 (review) rejected due to content loss — sections ${b.sections}→${a.sections}, fields ${b.fields}→${a.fields}, interactive ${b.interactive}→${a.interactive}, filled expected ${b.nonEmptyExpected}→${a.nonEmptyExpected}`);
    }
    return ok;
  }

  private applyEnrichmentPatch(worksheet: ProviderResponse, patch: { sections?: Array<Record<string, unknown>> }): ProviderResponse {
    const sections = (worksheet.sections || []) as Array<Record<string, unknown>>;
    const allPatchSections = patch.sections || [];
    // Patch sections flagged "new" are appended as additional practice sections
    // (Wissens-Check / Zusatzübung) instead of being merged into existing ones.
    const appendPatches = allPatchSections.filter(ps => ps.new === true);
    const patchSections = allPatchSections.filter(ps => ps.new !== true);

    // Build a lookup by normalized section number
    const normalizeNum = (n: unknown) => String(n).replace(/[.\s]/g, '');
    const patchByNumber = new Map<string, Record<string, unknown>>();
    for (const ps of patchSections) {
      const num = normalizeNum(ps.number);
      if (num) patchByNumber.set(num, ps);
    }
    const sectionNums = new Set(sections.map(s => normalizeNum(s.number)));
    // Positional fallback is only safe when the patch covers every section (model
    // renumbered but kept the order); sparse patches must match by number.
    const allowPositional = patchSections.length === sections.length;

    // Track which patch sections were applied
    const matchedPatchNums = new Set<string>();

    const mergedSections = sections.map((section, idx) => {
      const num = normalizeNum(section.number);
      let patchSection = patchByNumber.get(num);
      if (!patchSection && allowPositional) {
        const candidate = patchSections[idx];
        if (candidate && !sectionNums.has(normalizeNum(candidate.number))) {
          console.log(`Pass 2 (patch): section "${num}" matched positionally (patch numbered "${normalizeNum(candidate.number)}")`);
          patchSection = candidate;
        }
      }
      if (!patchSection) return section;
      matchedPatchNums.add(normalizeNum(patchSection.number));

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

    // Append AI-generated practice sections
    const validTypes = new Set(['section', 'story', 'info', 'example', 'interactive']);
    const appendedSections = appendPatches.map(ps => ({
      type: typeof ps.type === 'string' && validTypes.has(ps.type) ? ps.type : 'section',
      number: ps.number,
      title: ps.title,
      content: typeof ps.content === 'string' ? ps.content : '',
      fields: Array.isArray(ps.addFields) ? ps.addFields : (Array.isArray(ps.fields) ? ps.fields : []),
      checkGroups: Array.isArray(ps.checkGroups) ? ps.checkGroups : [],
      hints: Array.isArray(ps.hints) ? ps.hints : [],
      compendiumRefs: Array.isArray(ps.compendiumRefs) ? ps.compendiumRefs : undefined,
      interactive: ps.interactive,
    }));
    if (appendedSections.length > 0) {
      console.log(`Pass 2 (patch): appended ${appendedSections.length} new practice section(s): ${appendedSections.map(s => String(s.title || s.number || '?')).join(' | ')}`);
    }

    return { ...worksheet, sections: [...mergedSections, ...appendedSections] };
  }

  // Targeted repair pass: when checks end up with empty "expected" values (Pass 2/3
  // failed or auto-created checkGroups), ask the model to solve just those questions
  // against the original document text. Returns a fieldId → answer map.
  async fillEmptyExpectedValues(worksheet: Record<string, unknown>, rawText: string): Promise<Record<string, { expected: string; hint?: string }>> {
    const sections = Array.isArray(worksheet.sections) ? worksheet.sections as Array<Record<string, unknown>> : [];
    const missing: Array<{ fieldId: string; label: string; sectionTitle: string; sectionContent: string }> = [];
    for (const s of sections) {
      const checkGroups = Array.isArray(s.checkGroups) ? s.checkGroups as Array<Record<string, unknown>> : [];
      const fields = Array.isArray(s.fields) ? s.fields as Array<Record<string, unknown>> : [];
      for (const cg of checkGroups) {
        for (const c of (Array.isArray(cg.checks) ? cg.checks as Array<Record<string, unknown>> : [])) {
          if (typeof c.fieldId === 'string' && c.fieldId && (typeof c.expected !== 'string' || c.expected.trim() === '')) {
            const field = fields.find(f => f.id === c.fieldId);
            missing.push({
              fieldId: c.fieldId,
              label: String(field?.label || field?.placeholder || ''),
              sectionTitle: String(s.title || ''),
              sectionContent: String(s.content || '').substring(0, 800),
            });
          }
        }
      }
    }
    if (missing.length === 0) return {};

    const prompt = `You are computing correct answers for a German vocational-education worksheet. The questions below have empty expected answers — solve each one using the ORIGINAL DOCUMENT TEXT and the section context.

ORIGINAL DOCUMENT TEXT:
${rawText.substring(0, 6000)}

QUESTIONS WITH MISSING ANSWERS:
${missing.map(m => `- fieldId: "${m.fieldId}" — Frage/Label: "${m.label}" (Abschnitt: "${m.sectionTitle}")\n  Kontext: ${m.sectionContent}`).join('\n')}

RULES:
- Actually SOLVE each task step by step — do not guess.
- Keep "expected" short and exact; it is compared against the student's input (trimmed, case-insensitive).
- Add a short German "hint" that guides without revealing the answer.
- If a question genuinely has no single correct answer (open reflection), omit it.

Respond with ONLY a JSON object: {"answers": [{"fieldId": "...", "expected": "...", "hint": "..."}]}`;

    try {
      const cfg = this.reviewerConfig || this.enrichmentConfig || this.config;
      const responseText = await this.callProviderWithConfig(cfg, prompt, 'Return only the JSON object with the answers.');
      const parsed = extractJSON(responseText) as { answers?: Array<{ fieldId?: string; expected?: string; hint?: string }> };
      const map: Record<string, { expected: string; hint?: string }> = {};
      for (const a of parsed?.answers || []) {
        if (a && typeof a.fieldId === 'string' && typeof a.expected === 'string' && a.expected.trim()) {
          map[a.fieldId] = { expected: a.expected.trim(), hint: typeof a.hint === 'string' ? a.hint : undefined };
        }
      }
      console.log(`fillEmptyExpectedValues: resolved ${Object.keys(map).length}/${missing.length} empty expected values`);
      return map;
    } catch (err) {
      console.error('fillEmptyExpectedValues failed:', err);
      return {};
    }
  }

  private async callProvider(systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    return this.callProviderWithConfig(this.config, systemPrompt, userMessage, images);
  }

  private async callProviderWithConfig(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[], maxRetries = 2): Promise<string> {
    // Only send images to models that support vision
    const effectiveImages = images && images.length > 0 && modelSupportsVision(config.model) ? images : undefined;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        switch (config.provider) {
          case 'openai':
            return await this.callOpenAI(config, systemPrompt, userMessage, effectiveImages);
          case 'anthropic':
            return await this.callAnthropic(config, systemPrompt, userMessage, effectiveImages);
          case 'ollama':
            return await this.callOllama(config, systemPrompt, userMessage, effectiveImages);
          case 'ollama-cloud':
            return await this.callOllamaCloud(config, systemPrompt, userMessage, effectiveImages);
          case 'openai-compatible':
            return await this.callOpenAICompatible(config, systemPrompt, userMessage, effectiveImages);
          default:
            throw new Error(`Unknown provider: ${config.provider}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Node's fetch wraps network errors as "fetch failed" with the real code
        // (EAI_AGAIN, ECONNREFUSED, …) on error.cause — check both places.
        const causeCode = String((lastError as { cause?: { code?: string } }).cause?.code || '');
        const isRetryable = lastError.message.includes('429') || lastError.message.includes('503') || lastError.message.includes('timeout') || lastError.message.includes('ECONNRESET') || lastError.message.includes('socket hang up') || lastError.message.includes('fetch failed')
          || ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(causeCode);
        if (!isRetryable || attempt === maxRetries) throw lastError;
        const delay = (attempt + 1) * 3000;
        console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError!;
  }

  private async callOpenAI(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const userContent = images && images.length > 0
      ? [
          ...images.map(img => ({ type: 'image_url' as const, image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 16384,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  private async callAnthropic(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    const userContent = images && images.length > 0
      ? [
          ...images.map(img => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 } })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;
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
        messages: [{ role: 'user', content: userContent }],
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

  private async callOllama(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    const userContent = images && images.length > 0
      ? [
          ...images.map(img => ({ type: 'image_url' as const, image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
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

  private async callOllamaCloud(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const userContent = images && images.length > 0
      ? [
          ...images.map(img => ({ type: 'image_url' as const, image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
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

  private async callOpenAICompatible(config: ProviderConfig, systemPrompt: string, userMessage: string, images?: VisionImage[]): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({
      apiKey: config.apiKey || 'not-needed',
      baseURL: config.baseUrl,
    });

    const userContent = images && images.length > 0
      ? [
          ...images.map(img => ({ type: 'image_url' as const, image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
          { type: 'text' as const, text: userMessage },
        ]
      : userMessage;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
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
- Use LaTeX for ALL mathematical formulas: inline \( formula \) or display \[ formula \]

INTERACTIVE EXAMPLES: For each entry, add 0-3 interactive examples that VISUALIZE the concept for the student. These are demonstrations, NOT exercises — the student should be able to see how the concept works, not be tested on it. Use the "custom" component with the composable primitives below. Each example has a German "label" and a "component" with type "custom".

MATH FORMATTING: Use LaTeX notation in ALL content (both compendium text and interactive examples):
- Inline math: \\( formula \\) — e.g. \\( C = M^e \\bmod N \\)
- Display math: \\[ formula \\] — e.g. \\[ N = p \\cdot q \\]
- Use proper LaTeX commands: \\cdot, \\bmod, \\equiv, \\pmod{}, \\times, \\varphi, \\sum, \\prod, \\frac{}{}, ^{}, _{}, \\sqrt{}, \\log, \\ln, \\gcd, \\text{}
- Subscripts: \\( x_2 \\), Superscripts: \\( 2^{10} \\)
- DELIMITER RULE: the "latex" property (formulaDisplay) and "expression" property (stepCalculator steps) take RAW LaTeX WITHOUT \\(...\\) delimiters, e.g. "latex": "C = M^e \\bmod N". All TEXT properties (content, label, key, value, caption, node labels) are plain text where math must be wrapped in \\(...\\).
- JSON ESCAPING: inside JSON strings every LaTeX backslash must be doubled — write "N = p \\\\cdot q" so it parses to N = p \\cdot q. Never emit a single backslash before a LaTeX command in JSON.

KEY DIFFERENCE from worksheet interactive components: Compendium examples are DEMONSTRATIONS, not exercises.
- Show the concept visually, don't test the student
- Use "stepCalculator" to walk through a computation step by step
- Use "formulaDisplay" to render important formulas beautifully
- Use "flowDiagram" to show processes, data flow, or relationships
- Use "keyValueGrid" to display structured key-value information
- Use "callout" for important notes, tips, or warnings
- Do NOT use "checkButton" — these are not quizzes
- Do NOT use "solutionButton" — show the solution directly in a display or stepCalculator

VISUALIZATION PRIMITIVES for custom components (use these for compendium examples):
- formulaDisplay: {"type": "formulaDisplay", "latex": "C = M^e \\bmod N", "caption": "Verschlüsselung", "display": "block"}
  Renders a LaTeX formula. Use "block" for centered display, "inline" for inline.
- stepCalculator: {"type": "stepCalculator", "title": "RSA mit kleinen Zahlen", "interactive": true, "steps": [{"label": "Wähle Primzahlen", "expression": "p = 3, q = 11", "result": ""}, {"label": "Berechne N", "expression": "N = p \\cdot q = 3 \\cdot 11 = 33", "result": "N = 33"}, ...]}
  Walks through a computation step by step. Set "interactive": true for a reveal-one-at-a-time mode.
- flowDiagram: {"type": "flowDiagram", "direction": "horizontal", "nodes": [{"id": "alice", "label": "Alice", "shape": "box"}, {"id": "key", "label": "\\(e, N\\)", "shape": "circle", "highlight": true}], "edges": [{"from": "alice", "to": "key", "label": "sendet"}]}
  Visualizes processes, data flow, or relationships between concepts.
- keyValueGrid: {"type": "keyValueGrid", "title": "Schlüsselwerte", "rows": [{"key": "Öffentlicher Schlüssel", "value": "\\(e = 7, N = 33\\)", "highlight": true}, {"key": "Privater Schlüssel", "value": "\\(d = 3\\)"}], "columns": ["Parameter", "Wert"]}
  Displays structured key-value pairs in a table.
- callout: {"type": "callout", "variant": "tip", "title": "Wichtig", "content": "Der private Schlüssel \\(d\\) muss geheim bleiben!"}
  Highlighted info box. Variants: "info", "warning", "success", "tip".
- display: {"type": "display", "content": "Text mit \\(LaTeX\\) inline", "format": "text|code|mono"}
  Simple text display. Content can contain inline LaTeX \\(...\\).
- row: {"type": "row", "children": [...primitives...], "gap": "0.5rem", "align": "center", "wrap": true}
- col: {"type": "col", "children": [...primitives...], "gap": "0.5rem"}

STANDARD PRIMITIVES (also available, but prefer visualization primitives above):
- input: {"type": "input", "fieldId": "ex1_f1", "label": "German label", "placeholder": "hint", "inputType": "text|number", "mono": true}
- codeLine: {"type": "codeLine", "fieldId": "ex1_cl1", "cells": [{"value": "1010", "editable": false}, {"fieldId": "ex1_r1", "editable": true, "maxLength": 1, "width": "2rem"}]}
- resetButton: {"type": "resetButton", "fieldIds": ["ex1_f1"], "label": "Zurücksetzen"}
- toggleGrid: {"type": "toggleGrid", "fieldId": "ex1_tg1", "columns": ["Wahr", "Falsch"], "rows": [{"label": "Question", "correctAnswers": ["Wahr"]}], "multipleSelection": false}
- dropdown: {"type": "dropdown", "fieldId": "ex1_dd1", "rows": [{"question": "Question", "options": ["A", "B"], "correctAnswers": ["A"]}], "multipleSelection": false}

Example interactive example for an RSA entry (DEMONSTRATION, not exercise):
{"label": "RSA Schlüsselerzeugung – Beispiel mit p=3, q=11", "component": {"type": "custom", "props": {"fieldId": "comp_rsa_ex1", "layout": [
  {"type": "keyValueGrid", "title": "Gewählte Parameter", "rows": [
    {"key": "p (Primzahl 1)", "value": "3"},
    {"key": "q (Primzahl 2)", "value": "11"},
    {"key": "e (öffentlicher Exponent)", "value": "7", "highlight": true}
  ]},
  {"type": "stepCalculator", "title": "Schlüsselerzeugung Schritt für Schritt", "interactive": true, "steps": [
    {"label": "Modul berechnen", "expression": "N = p \\cdot q = 3 \\cdot 11 = 33", "result": "N = 33"},
    {"label": "Eulersche φ-Funktion", "expression": "\\varphi(N) = (p-1)(q-1) = 2 \\cdot 10 = 20", "result": "φ = 20"},
    {"label": "Privaten Schlüssel d finden", "expression": "1 = e \\cdot d \\bmod \\varphi \\Rightarrow 1 = 7 \\cdot d \\bmod 20", "result": "d = 3"},
    {"label": "Verifizierung", "expression": "7 \\cdot 3 = 21 \\equiv 1 \\pmod{20}", "result": "✓ Korrekt"}
  ]},
  {"type": "formulaDisplay", "latex": "C = M^e \\bmod N, \\quad M = C^d \\bmod N", "caption": "Ver- und Entschlüsselung mit dem Schlüsselpaar", "display": "block"},
  {"type": "stepCalculator", "title": "Verschlüsselung von M=2", "interactive": true, "steps": [
    {"label": "Klartext", "expression": "M = 2"},
    {"label": "Verschlüsseln", "expression": "C = M^e \\bmod N = 2^7 \\bmod 33 = 128 \\bmod 33", "result": "C = 29"},
    {"label": "Entschlüsseln", "expression": "M = C^d \\bmod N = 29^3 \\bmod 33 = 24389 \\bmod 33", "result": "M = 2 ✓"}
  ]},
  {"type": "callout", "variant": "tip", "title": "Sicherheit", "content": "Ein Angreifer muss \\(p\\) und \\(q\\) aus \\(N\\) faktorisieren. Bei grossen Primzahlen (2048 Bit) ist dies praktisch unmöglich."}
]}}

Example for a flow diagram (asymmetric encryption):
{"label": "Asymmetrische Verschlüsselung", "component": {"type": "custom", "props": {"fieldId": "comp_asym_ex1", "layout": [
  {"type": "flowDiagram", "direction": "horizontal", "nodes": [
    {"id": "alice", "label": "Alice (Sender)", "shape": "box"},
    {"id": "pubkey", "label": "Öffentl. Schlüssel \\(e, N\\)", "shape": "circle"},
    {"id": "cipher", "label": "Geheimtext \\(C\\)", "shape": "diamond"},
    {"id": "bob", "label": "Bob (Empfänger)", "shape": "box"},
    {"id": "privkey", "label": "Privater Schlüssel \\(d\\)", "shape": "circle", "highlight": true}
  ], "edges": [
    {"from": "alice", "to": "pubkey", "label": "verschlüsselt mit"},
    {"from": "pubkey", "to": "cipher"},
    {"from": "cipher", "to": "bob"},
    {"from": "bob", "to": "privkey", "label": "entschlüsselt mit"}
  ]}
]}}

IMPORTANT for interactive examples:
- Field IDs MUST be unique and prefixed with "comp_" to avoid collisions with worksheet fields
- Keep examples self-contained and visually rich
- These are DEMONSTRATIONS — show the concept, don't test the student
- Use SMALL, CONCRETE numbers the student can verify by hand (e.g. p=3, q=11 — not 2048-bit values). Every stepCalculator step must show actual numbers being computed, and each step must follow from the previous one.
- Take the example values from the DOCUMENT when it contains a worked example — students recognize them from class.
- stepCalculator: 3-8 steps; each step's "result" states the concrete outcome. flowDiagram: 3-7 nodes with SHORT labels (max ~4 words; inline \\(...\\) math allowed). keyValueGrid: use for parameters/properties, not for sequential steps.
- Prefer visualization primitives (formulaDisplay, stepCalculator, flowDiagram, keyValueGrid, callout) over basic primitives
- 0 examples if the topic is purely theoretical with no formulas or processes. 1-3 for topics with computations, formulas, processes, or relationships.

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
          "label": "LZ77 Kodierung Schritt für Schritt",
          "component": {"type": "custom", "props": {"fieldId": "comp_lz77_ex1", "layout": [...]}}
        }
      ]
    }
  ]
}

Document text:
${rawText.substring(0, 8000)}`;

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
        interactive_examples: sanitizeInteractiveExamples(entry.interactive_examples),
      })).filter(e => e.title && e.content);
      console.log(`Compendium: generated ${result.length} entries from ${entries.length} raw entries (response length: ${responseText.length})`);
      return result;
    } catch (error) {
      console.error('generateCompendiumEntries error:', error);
      return [];
    }
  }
}