import { describe, it, expect } from 'vitest';
import { extractJSON } from '../ai-provider';

describe('extractJSON — LaTeX escape repair', () => {
  it('repairs invalid escapes like \\( and \\frac in otherwise valid JSON', () => {
    const broken = String.raw`{"content": "Schnittpunkt mit \( f(x) = -\frac{2}{3}x - 4 \)?"}`;
    const parsed = extractJSON(broken) as { content: string };
    expect(parsed.content).toBe(String.raw`Schnittpunkt mit \( f(x) = -\frac{2}{3}x - 4 \)?`);
  });

  it('repairs silent corruption: \\times and \\neq parsing as tab/newline', () => {
    const silent = String.raw`{"a": "3 \times 4 \neq 13"}`;
    const parsed = extractJSON(silent) as { a: string };
    expect(parsed.a).toBe(String.raw`3 \times 4 \neq 13`);
  });

  it('leaves correct JSON untouched (double backslashes, real newlines/tabs)', () => {
    const good = String.raw`{"a": "\\frac{1}{2}", "b": "Zeile1\nZeile2", "c": "Tab\there"}`;
    const parsed = extractJSON(good) as { a: string; b: string; c: string };
    expect(parsed.a).toBe('\\frac{1}{2}');
    expect(parsed.b).toBe('Zeile1\nZeile2');
    expect(parsed.c).toBe('Tab\there');
  });

  it('keeps genuine newlines before command-like German words', () => {
    const nl = String.raw`{"a": "wird\nnotiert und\nneu berechnet"}`;
    const parsed = extractJSON(nl) as { a: string };
    expect(parsed.a).toBe('wird\nnotiert und\nneu berechnet');
  });
});

describe('extractJSON — extraction strategies', () => {
  it('parses fenced JSON', () => {
    expect(extractJSON('```json\n{"x": 1}\n```')).toEqual({ x: 1 });
  });

  it('parses JSON embedded in prose', () => {
    expect(extractJSON('Here is the result: {"x": 2} — done.')).toEqual({ x: 2 });
  });

  it('repairs truncated JSON (incomplete tail may be dropped, valid prefix survives)', () => {
    const truncated = '{"title": "Test", "sections": [{"a": 1}, {"b": 2}';
    const parsed = extractJSON(truncated) as { title: string };
    expect(parsed).toBeTypeOf('object');
    expect(parsed.title).toBe('Test');
  });

  it('throws on hopeless input', () => {
    expect(() => extractJSON('no json here at all')).toThrow();
  });
});
