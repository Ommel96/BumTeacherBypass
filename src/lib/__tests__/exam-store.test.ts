import { describe, it, expect } from 'vitest';
import { sanitizeExamData, openAnswerMatchesSolution } from '../exam-store';

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

describe('openAnswerMatchesSolution — grading rescue', () => {
  const solution = '1. Steigung: \\( m = \\frac{10-4}{3-1} = 3 \\). 2. Gleichung: \\( y = 3x + b \\). 3. Einsetzen: \\( 4 = 3 \\cdot 1 + b \\Rightarrow b = 1 \\). 4. Funktionsgleichung: \\( h(x) = 3x + 1 \\).';

  it('accepts the final result in any equivalent form', () => {
    expect(openAnswerMatchesSolution(solution, 'y=3x+1')).toBe(true);
    expect(openAnswerMatchesSolution(solution, 'h(x)=3x+1')).toBe(true);
    expect(openAnswerMatchesSolution(solution, '3x+1')).toBe(true);
  });

  it('rejects wrong or empty answers', () => {
    expect(openAnswerMatchesSolution(solution, 'y=3x+2')).toBe(false);
    expect(openAnswerMatchesSolution(solution, 'keine Ahnung')).toBe(false);
    expect(openAnswerMatchesSolution(solution, '')).toBe(false);
  });

  it('does not match bare intermediate numbers', () => {
    // "m = 3" appears in the solution but "3" alone must not earn full credit
    expect(openAnswerMatchesSolution(solution, '3')).toBe(false);
  });
});
