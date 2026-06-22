export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

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

function extractJSON(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
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

  if (trimmed[startIdx] === '{') {
    let depth = 0;
    for (let i = startIdx; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      else if (trimmed[i] === '}') depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.substring(startIdx, i + 1));
        } catch (e) {
          console.error('extractJSON: found braces but JSON.parse failed, first 500 chars:', trimmed.substring(startIdx, startIdx + 500));
          break;
        }
      }
    }
  }

  throw new Error(`Could not parse JSON from AI response (first 200 chars: ${trimmed.substring(0, 200)}...)`);
}

export class AIProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
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

  private buildEnrichmentPrompt(structuredWorksheet: string): string {
    return `You are enriching an educational worksheet with solutions and interactive components. The worksheet structure has already been created in Pass 1. Your job in Pass 2 is to ADD:
1. Expected answers via checkGroups for every "text" field
2. Interactive components (pixelGrid, bitVisualizer, truthTable, encodingExercise) where the content calls for them
3. Helpful hints
4. Compendium reference links

RESPOND WITH ONLY THE COMPLETE JSON OBJECT (the full worksheet with your additions). No markdown, no code fences.

INPUT WORKSHEET (Pass 1 output):
${structuredWorksheet}

YOUR TASK — Add these to the worksheet:

A) CHECKGROUPS: For every "text" type field (NOT textarea), add a checkGroup with the expected answer:
- "id": group id like "cg1", "cg2"
- "checks": array of {"fieldId": "matching field id", "expected": "the correct answer", "hint": "optional German hint"}
- "feedbackId": unique id like "fb1"
- "label": optional, defaults to "Prüfen"
Example: field "s1_dec42" with label "42 als Binärzahl" → checkGroup with check {"fieldId": "s1_dec42", "expected": "101010", "hint": "42 = 32+8+2"}

B) INTERACTIVE COMPONENTS — When the content involves these topics, REPLACE text fields with interactive widgets:
- Pixel images, RLE encoding, binary grids → add "interactive" section with pixelGrid:
  {"type": "pixelGrid", "props": {"width": 8, "height": 8, "fieldId": "pg1", "encodingType": "rle|binary|none", "encodingDirection": "row|col", "solution": [0,1,...], "labels": {"rows": [...], "cols": [...]}}}
- Bit manipulation, binary values → add "interactive" section with bitVisualizer:
  {"type": "bitVisualizer", "props": {"bits": 8, "fieldId": "bv1", "labels": ["128","64",...], "showDecimal": true, "showHex": true}}
- Truth tables, logic gates (AND, OR, NOT, XOR) → add "interactive" section with truthTable:
  {"type": "truthTable", "props": {"inputs": ["A","B"], "outputLabel": "Q = A AND B", "fieldId": "tt1"}}
  Then add checkGroups for the truth table outputs (fieldId format: "tt1_r0", "tt1_r1", etc.)
- Format conversion (binary↔decimal↔hex, ASCII, Morse, RLE) → add "interactive" section with encodingExercise:
  {"type": "encodingExercise", "props": {"encodingType": "binary|hex|ascii|rle|morse", "fromFormat": "Dezimal", "toFormat": "Binär", "examples": [...], "exercises": [...], "fieldId": "enc1"}}

C) HINTS — Add hints that guide without giving away the answer:
{"id": "hint1", "label": "optional button text", "content": "hint text in German"}

D) COMPENDIUM REFS — Link to reference topics:
{"ref": "lowercase-slug", "label": "Short German label"}

IMPORTANT:
- Change section type from "section" to "interactive" when adding an interactive component
- Keep ALL existing fields, content, and structure from Pass 1
- Every "text" field MUST have a matching check in a checkGroup
- "textarea" fields should NOT have checkGroups
- Return the COMPLETE worksheet JSON, not just the additions`;
  }

  async processPage(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
    const structureResult = await this.callProvider(this.buildStructurePrompt(), `Page ${pageNumber} of ${totalPages}:\n\n${rawText}`);
    const structured = extractJSON(structureResult) as ProviderResponse;

    const structuredStr = JSON.stringify(structured, null, 2);
    const enrichmentPrompt = this.buildEnrichmentPrompt(structuredStr);

    let enrichedResult: string;
    try {
      enrichedResult = await this.callProvider(enrichmentPrompt, 'Add solutions, interactive components, hints, and compendium refs to this worksheet.');
    } catch (err) {
      console.error('Pass 2 (enrichment) failed, using Pass 1 result:', err);
      return structured;
    }

    try {
      const enriched = extractJSON(enrichedResult) as ProviderResponse;
      if (enriched && enriched.title && Array.isArray(enriched.sections)) {
        return enriched;
      }
    } catch (err) {
      console.error('Pass 2 (enrichment) JSON parse failed, using Pass 1 result:', err);
    }

    return structured;
  }

  private async callProvider(systemPrompt: string, userMessage: string): Promise<string> {
    switch (this.config.provider) {
      case 'openai':
        return this.callOpenAI(systemPrompt, userMessage);
      case 'anthropic':
        return this.callAnthropic(systemPrompt, userMessage);
      case 'ollama':
        return this.callOllama(systemPrompt, userMessage);
      case 'ollama-cloud':
        return this.callOllamaCloud(systemPrompt, userMessage);
      case 'openai-compatible':
        return this.callOpenAICompatible(systemPrompt, userMessage);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  private async callOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
    const completion = await client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return completion.choices[0]?.message?.content || '{}';
  }

  private async callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 8192,
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

  private async callOllama(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        format: 'json',
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

  private async callOllamaCloud(systemPrompt: string, userMessage: string): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        format: 'json',
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

  private async callOpenAICompatible(systemPrompt: string, userMessage: string): Promise<string> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({
      apiKey: this.config.apiKey || 'not-needed',
      baseURL: this.config.baseUrl,
    });

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: this.config.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
    } catch {
      completion = await client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: 0.2,
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

  async generateCompendiumEntries(rawText: string, moduleNumber: string, topic: string, existingEntries: Array<{ title: string; content: string; keywords: string }> = [], webResearch: string = ''): Promise<Array<{ title: string; content: string; keywords: string[] }>> {
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

Module: ${moduleNumber}, Topic: ${topic}
${existingSection}${webSection}

Respond with ONLY a JSON object:
{
  "entries": [
    {
      "title": "LZ77 Kompression",
      "content": "### Sliding-Window-Verfahren\\nExplanation...\\n\\n### Kodierungsverfahren\\nExplanation...",
      "keywords": ["lz77", "sliding-window", "kompression", "dekodierung"]
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
          const completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0.2 });
          responseText = completion.choices[0]?.message?.content || '[]';
          break;
        }
        case 'anthropic': {
          const res = await fetch(`${this.config.baseUrl.replace(/\/v1$/, '')}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: this.config.model, max_tokens: 4096, system: prompt, messages: [{ role: 'user', content: 'Extract knowledge topics from this document and create compendium entries.' }] }),
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
            completion = await client.chat.completions.create({ model: this.config.model, messages, response_format: { type: 'json_object' }, temperature: 0.2 });
          } catch {
            completion = await client.chat.completions.create({ model: this.config.model, messages, temperature: 0.2 });
          }
          responseText = completion.choices[0]?.message?.content || '[]';
          break;
        }
      }

      const parsed = extractJSON(responseText);
      const entries = Array.isArray(parsed) ? parsed : (parsed && Array.isArray((parsed as Record<string, unknown>).entries) ? (parsed as Record<string, unknown>).entries as Record<string, unknown>[] : []);
      return entries.map((entry: Record<string, unknown>) => ({
        title: String(entry.title || ''),
        content: String(entry.content || ''),
        keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String) : [],
      })).filter(e => e.title && e.content);
    } catch (error) {
      console.error('generateCompendiumEntries error:', error);
      return [];
    }
  }
}