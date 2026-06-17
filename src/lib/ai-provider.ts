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

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  // Try to find the outermost { ... } or [ ... ]
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

  // For objects, find the matching closing brace
  if (trimmed[startIdx] === '{') {
    let depth = 0;
    for (let i = startIdx; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      else if (trimmed[i] === '}') depth--;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.substring(startIdx, i + 1));
        } catch {
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

  async processPage(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
    switch (this.config.provider) {
      case 'openai':
        return this.processWithOpenAI(rawText, pageNumber, totalPages);
      case 'anthropic':
        return this.processWithAnthropic(rawText, pageNumber, totalPages);
      case 'ollama':
        return this.processWithOllama(rawText, pageNumber, totalPages);
      case 'ollama-cloud':
        return this.processWithOllamaCloud(rawText, pageNumber, totalPages);
      case 'openai-compatible':
        return this.processWithOpenAICompatible(rawText, pageNumber, totalPages);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an educational worksheet generator. Your job is to take raw text from a PDF/document and convert it into an interactive worksheet with input fields, check buttons, hints, and tables — similar to worksheets used in German vocational education (Lehrjahr, Modul, Arbeitsblatt).

IMPORTANT: You must respond with ONLY a JSON object. No markdown, no code fences, no explanation — just the raw JSON object.

The JSON object must contain:
- "title": string — the worksheet title (e.g. "Zahlensysteme", "Morse Code & Huffman Codierung")
- "label": string — optional module/section label (e.g. "Modul 114 -- Codieren")
- "subtitle": string — optional subtitle
- "sections": array of section objects, each with:
  - "type": "section" | "story" | "info" | "example"
    - "story": introductory text block (like a story/scenario)
    - "info": informational note/hint box
    - "example": example calculation/demonstration block
    - "section": main exercise section with interactive elements
  - "number": string or number (optional) — section number like "1", "2", "i", "ii"
  - "title": string (optional) — section title
  - "content": string — the main text content in plain markdown-like format. You can use **bold**, *italic*, \`code\`, and line breaks.
  - "fields": array of input fields (only for type "section"):
    - "id": string — unique field ID, use pattern like "s1_answer1", "s2_explanation", "t1-r1-dec"
    - "label": string — label for the field
    - "type": "text" | "textarea"
    - "placeholder": string (optional)
    - "compendiumRef": object (optional) — link to compendium entry: { "ref": "keyword-slug", "label": "Descriptive Label" }. ref is a lowercase slug matching the topic/concept, label is a short German description of what the reference covers.
  - "table": table object (optional, for section type only):
    - "id": string — table identifier
    - "columns": array of { "key": string, "label": string, "editable": boolean, "placeholder"?: string }
    - "rows": array of objects where keys match column keys, values are pre-filled data (empty string for editable cells)
  - "checkGroups": array of check groups (optional, for section type):
    - "id": string — group ID
    - "checks": array of { "fieldId": string, "expected": string, "hint"?: string, "opts"?: { "normalize"?: boolean, "contains"?: boolean } }
    - "feedbackId": string — ID for the feedback message
    - "label": string (optional) — button label, defaults to "Prüfen"
  - "resets": array of field IDs to reset (optional)
  - "hints": array of hint objects (optional):
    - "id": string — unique hint ID like "hint1"
    - "label": string (optional) — button text, defaults to "Tipp anzeigen"
    - "content": string — hint text in markdown-like format
  - "compendiumRefs": array of objects (optional) — links to compendium reference entries. Each object: { "ref": "keyword-slug", "label": "Short German label" }. ref is a lowercase slug matching the topic/concept, label is a short German description like "LZ77 Kompression" or "Dezimal-binär Umrechnung".

KEY RULES:
1. Convert every exercise/question into an interactive field with a check mechanism
2. Use German language for labels and UI elements (Prüfen, Zurücksetzen, Tipp anzeigen, etc.)
3. Every fill-in-the-blank must have an expected answer in a checkGroup
4. Tables should have editable cells for student answers and pre-filled "given" values
5. Hints should guide students without giving away the answer directly
6. Preserve all educational content — questions, scenarios, tables, formulas
 7. Field IDs must be unique across the entire worksheet
 8. For free-text reflection questions (open-ended opinions, explanations), include a field with type "textarea" but NO checkGroup
 9. Number sections sequentially: "1", "2", "3" for exercises, "i", "ii" for info sections
 10. CRITICAL: Every "text" type field (not textarea) MUST have a matching check in a checkGroup. A field with type "text" is a fill-in-the-blank with a correct answer — it MUST have an expected value. If you create a "text" field, you MUST also create a checkGroup containing a check for that fieldId.

Example of a good section:
{
  "type": "section",
  "number": "1",
  "title": "Dezimal in Binär umrechnen",
  "content": "Wandeln Sie die folgenden Dezimalzahlen in Binärzahlen um.",
  "fields": [
    {"id": "s1_dec42", "label": "42 als Binärzahl", "type": "text", "placeholder": "z.B. 101010"},
    {"id": "s1_dec255", "label": "255 als Binärzahl", "type": "text", "placeholder": "..."}
  ],
  "checkGroups": [
    {
      "id": "cg1",
      "checks": [
        {"fieldId": "s1_dec42", "expected": "101010", "hint": "42 = 32 + 8 + 2"},
        {"fieldId": "s1_dec255", "expected": "11111111", "hint": "255 = 128+64+32+16+8+4+2+1"}
      ],
      "feedbackId": "fb1"
    }
  ],
  "resets": ["s1_dec42", "s1_dec255"],
  "hints": [
    {"id": "hint1", "content": "Teilen Sie die Zahl wiederholt durch 2 und notieren Sie die Reste von unten nach oben."}
  ]
}`;
  }

  private async processWithOpenAI(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });

    const completion = await client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: `Page ${pageNumber} of ${totalPages}:\n\n${rawText}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    return extractJSON(responseText) as ProviderResponse;
  }

  private async processWithAnthropic(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
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
        system: this.buildSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: `Page ${pageNumber} of ${totalPages}:\n\n${rawText}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(900000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    return extractJSON(text) as ProviderResponse;
  }

  private async processWithOllama(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: `Page ${pageNumber} of ${totalPages}:\n\n${rawText}` },
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
    const text = data.message?.content || '{}';
    return extractJSON(text) as ProviderResponse;
  }

  private async processWithOllamaCloud(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
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
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: `Page ${pageNumber} of ${totalPages}:\n\n${rawText}` },
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
            return extractJSON(fullContent) as ProviderResponse;
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

    return extractJSON(fullContent) as ProviderResponse;
  }

  private async processWithOpenAICompatible(rawText: string, pageNumber: number, totalPages: number): Promise<ProviderResponse> {
    const OpenAI = await import('openai');
    const client = new OpenAI.default({
      apiKey: this.config.apiKey || 'not-needed',
      baseURL: this.config.baseUrl,
    });

    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt() },
      { role: 'user' as const, content: `Page ${pageNumber} of ${totalPages}:\n\n${rawText}` },
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

    const responseText = completion.choices[0]?.message?.content || '{}';
    return extractJSON(responseText) as ProviderResponse;
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