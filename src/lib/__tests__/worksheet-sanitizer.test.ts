import { describe, it, expect } from 'vitest';
import { sanitizeInteractiveComponents, type WorksheetData } from '../worksheet-schema';

function ws(sections: unknown[]): WorksheetData {
  return { title: 'T', sections: sections as WorksheetData['sections'] };
}

describe('sanitizeInteractiveComponents', () => {
  it('recomputes wrong XOR solutions', () => {
    const { data, fixes } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'xorCalculator', props: { fieldId: 'x', inputA: '0101', inputB: '0011', solution: '1111' } } },
    ]));
    const props = (data.sections[0].interactive as { props: { solution: string } }).props;
    expect(props.solution).toBe('0110');
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('demotes components with non-binary XOR inputs', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'xorCalculator', props: { fieldId: 'x', inputA: 'hello', inputB: '0011' } } },
    ]));
    expect(data.sections[0].interactive).toBeUndefined();
    expect(data.sections[0].type).toBe('section');
  });

  it('maps choiceMatrix correctAnswers case-insensitively and drops unknowns', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'choiceMatrix', props: { fieldId: 'c', columns: ['Wahr', 'Falsch'], rows: [
        { question: 'Q1', correctAnswers: ['wahr'] },
        { question: 'Q2', correctAnswers: ['Richtig'] },
      ] } } },
    ]));
    const rows = (data.sections[0].interactive as { props: { rows: Array<{ correctAnswers: string[] }> } }).props.rows;
    expect(rows[0].correctAnswers).toEqual(['Wahr']);
    expect(rows[1].correctAnswers).toEqual([]);
  });

  it('adds missing dropdown options for correct answers', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'dropdownChoice', props: { fieldId: 'd', rows: [
        { question: 'Q', options: ['TCP', 'UDP'], correctAnswers: ['ICMP'] },
      ] } } },
    ]));
    const row = (data.sections[0].interactive as { props: { rows: Array<{ options: string[]; correctAnswers: string[] }> } }).props.rows[0];
    expect(row.options).toContain('ICMP');
    expect(row.correctAnswers).toEqual(['ICMP']);
  });

  it('pads pixelGrid solutions to width*height', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'pixelGrid', props: { fieldId: 'p', width: 4, height: 4, solution: [1, 0, 1] } } },
    ]));
    const sol = (data.sections[0].interactive as { props: { solution: number[] } }).props.solution;
    expect(sol).toHaveLength(16);
  });

  it('flips lz77 decode without decodeInput to encode', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'lz77Simulator', props: { fieldId: 'l', direction: 'decode', inputString: 'ABABAB' } } },
    ]));
    const props = (data.sections[0].interactive as { props: { direction: string } }).props;
    expect(props.direction).toBe('encode');
  });

  it('removes empty custom components', () => {
    const { data } = sanitizeInteractiveComponents(ws([
      { type: 'interactive', number: '1', content: '', interactive: { type: 'custom', props: { fieldId: 'g', layout: [] } } },
    ]));
    expect(data.sections[0].interactive).toBeUndefined();
  });
});
