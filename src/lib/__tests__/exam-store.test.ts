import { describe, it, expect } from 'vitest';
import { sanitizeExamData } from '../exam-store';

describe('sanitizeExamData', () => {
  it('accepts a valid mixed exam and preserves questions', () => {
    const data = sanitizeExamData({
      title: 'Test',
      questions: [
        { id: 'q1', type: 'mc', question: 'Q?', options: ['a', 'b', 'c'], correctIndex: 1, points: 2 },
        { id: 'q2', type: 'tf', statement: 'S.', correct: true, points: 1 },
        { id: 'q3', type: 'short', question: 'K?', expected: '42', math: true, points: 2 },
        { id: 'q4', type: 'open', question: 'O?', solution: 'Lösung', points: 4 },
      ],
    });
    expect(data).not.toBeNull();
    expect(data!.questions).toHaveLength(4);
    expect(data!.title).toBe('Test');
  });

  it('drops invalid questions: out-of-range correctIndex, missing fields, unknown types', () => {
    const data = sanitizeExamData({
      questions: [
        { id: 'bad1', type: 'mc', question: 'Q?', options: ['a', 'b'], correctIndex: 5, points: 2 },
        { id: 'bad2', type: 'tf', statement: 'S.', correct: 'yes', points: 1 },
        { id: 'bad3', type: 'short', question: 'K?', expected: '', points: 2 },
        { id: 'bad4', type: 'essay', question: 'E?', points: 3 },
        { id: 'ok', type: 'tf', statement: 'S.', correct: false, points: 1 },
      ],
    });
    expect(data).not.toBeNull();
    expect(data!.questions).toHaveLength(1);
    expect(data!.questions[0].id).toBe('ok');
  });

  it('returns null when nothing survives', () => {
    expect(sanitizeExamData({ questions: [] })).toBeNull();
    expect(sanitizeExamData('nonsense')).toBeNull();
    expect(sanitizeExamData(null)).toBeNull();
  });

  it('deduplicates ids and clamps points', () => {
    const data = sanitizeExamData({
      questions: [
        { id: 'q', type: 'tf', statement: 'A', correct: true, points: 99 },
        { id: 'q', type: 'tf', statement: 'B', correct: false, points: -3 },
      ],
    });
    expect(data!.questions[0].id).not.toBe(data!.questions[1].id);
    expect(data!.questions[0].points).toBeLessThanOrEqual(10);
    expect(data!.questions[1].points).toBeGreaterThan(0);
  });
});
