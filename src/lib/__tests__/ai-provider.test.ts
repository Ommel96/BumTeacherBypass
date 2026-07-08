import { describe, it, expect } from 'vitest';
import { AIProvider, openAIChatCompat, extractAnthropicText, type ProviderConfig } from '../ai-provider';

const cfg: ProviderConfig = { provider: 'openai', apiKey: 'x', baseUrl: 'http://localhost', model: 'test' };

describe('openAIChatCompat — adaptive parameter handling', () => {
  it('swaps max_tokens → max_completion_tokens and drops temperature on 400s', async () => {
    const calls: Record<string, unknown>[] = [];
    const stub = { chat: { completions: { create: async (p: Record<string, unknown>) => {
      calls.push({ ...p });
      if ('max_tokens' in p) throw Object.assign(new Error("400 'max_tokens' is not supported"), { status: 400, param: 'max_tokens' });
      if ('temperature' in p) throw Object.assign(new Error("400 'temperature' does not support 0.2"), { status: 400, param: 'temperature' });
      return { choices: [{ message: { content: 'ok' } }] };
    } } } };
    const result = await openAIChatCompat(stub, { model: 'm', messages: [], temperature: 0.2, max_tokens: 16384 });
    expect(result.choices?.[0]?.message?.content).toBe('ok');
    const final = calls[calls.length - 1];
    expect(final.max_completion_tokens).toBe(16384);
    expect(final).not.toHaveProperty('max_tokens');
    expect(final).not.toHaveProperty('temperature');
  });

  it('propagates non-parameter errors (auth)', async () => {
    const stub = { chat: { completions: { create: async () => { throw Object.assign(new Error('401 Incorrect API key'), { status: 401 }); } } } };
    await expect(openAIChatCompat(stub, { model: 'm', messages: [] })).rejects.toThrow('401');
  });
});

describe('extractAnthropicText — thinking-model responses', () => {
  it('collects text blocks after thinking blocks', () => {
    expect(extractAnthropicText({ content: [
      { type: 'thinking' },
      { type: 'text', text: '{"a":' },
      { type: 'text', text: '1}' },
    ] })).toBe('{"a":1}');
  });
  it('handles classic responses and empty content', () => {
    expect(extractAnthropicText({ content: [{ type: 'text', text: 'hi' }] })).toBe('hi');
    expect(extractAnthropicText({ content: [{ type: 'thinking' }] })).toBe('');
    expect(extractAnthropicText({})).toBe('');
  });
});

describe('applyEnrichmentPatch', () => {
  const provider = new AIProvider(cfg);
  type ApplyFn = (w: unknown, p: unknown) => { sections: Array<Record<string, unknown>> };
  const apply = (provider as unknown as { applyEnrichmentPatch: ApplyFn }).applyEnrichmentPatch.bind(provider);

  const worksheet = {
    title: 'T',
    sections: [
      { type: 'section', number: '1', title: 'A', content: 'a', fields: [] },
      { type: 'section', number: '2', title: 'B', content: 'b', fields: [] },
    ],
  };

  it('merges patches by section number', () => {
    const merged = apply(worksheet, { sections: [{ number: '1', hints: [{ id: 'h', content: 'tip' }] }] });
    expect((merged.sections[0].hints as unknown[]).length).toBe(1);
    expect(merged.sections[1].hints).toBeUndefined();
  });

  it('appends "new": true sections as practice sections', () => {
    const merged = apply(worksheet, { sections: [
      { number: 'Z1', new: true, type: 'interactive', title: 'Wissens-Check', content: 'c',
        interactive: { type: 'choiceMatrix', props: { fieldId: 'z', columns: ['Wahr', 'Falsch'], rows: [{ question: 'Q', correctAnswers: ['Wahr'] }] } } },
    ] });
    expect(merged.sections).toHaveLength(3);
    expect(merged.sections[2].title).toBe('Wissens-Check');
    expect(merged.sections[2].type).toBe('interactive');
  });

  it('matches renumbered complete patches positionally', () => {
    const merged = apply(worksheet, { sections: [
      { number: 'A', hints: [{ id: 'h1', content: 'x' }] },
      { number: 'B', hints: [{ id: 'h2', content: 'y' }] },
    ] });
    expect((merged.sections[0].hints as unknown[]).length).toBe(1);
    expect((merged.sections[1].hints as unknown[]).length).toBe(1);
  });

  it('ignores sparse patches with unknown numbers', () => {
    const merged = apply(worksheet, { sections: [{ number: '99', hints: [{ id: 'h', content: 'x' }] }] });
    expect(merged.sections[0].hints).toBeUndefined();
    expect(merged.sections[1].hints).toBeUndefined();
    expect(merged.sections).toHaveLength(2);
  });
});
