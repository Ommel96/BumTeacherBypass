import { describe, it, expect } from 'vitest';
import { mathEquals, exprToLatex, evaluateExpression, looksLikeMath } from '../math-eval';

describe('mathEquals — numeric equivalence', () => {
  const cases: Array<[string, string, boolean | null]> = [
    ['0.75', '3/4', true],
    ['0.75', '6/8', true],
    ['0.75', '0,75', true],
    ['0.75', '75%', true],
    ['12', '6:2*4', true],
    ['8', '2^3', true],
    ['1.4142135', 'sqrt(2)', true],   // truncated expected
    ['100000', '10^5', true],
    ['2/3', '0.67', true],            // rounded to student precision
    ['2/3', '0.6', false],            // badly rounded
    ['5', 'x=5', true],               // assignment stripped
    ['x=3', '3', true],
    ['0.75', '0.74', false],
    ['3', '5', false],
  ];
  it.each(cases)('mathEquals(%s, %s) = %s', (exp, giv, want) => {
    expect(mathEquals(exp, giv)).toBe(want);
  });
});

describe('mathEquals — algebraic equivalence', () => {
  const cases: Array<[string, string, boolean | null]> = [
    ['2x+2', '2(x+1)', true],
    ['2x+2', '2x+1', false],
    ['x^2-1', '(x-1)(x+1)', true],
    ['e^x', 'exp(x)', true],
    ['a*b', 'b*a', true],
    ['2^(x+1)', '2*2^x', true],
    ['ln(x)', 'log(x)', false],       // ln vs log10
  ];
  it.each(cases)('mathEquals(%s, %s) = %s', (exp, giv, want) => {
    expect(mathEquals(exp, giv)).toBe(want);
  });
});

describe('mathEquals — text falls back to null', () => {
  it.each([
    ['Bern', 'Zürich'],
    ['hallo welt', 'welt hallo'],
    ['TCP', 'UDP'],
  ])('mathEquals(%s, %s) = null', (a, b) => {
    expect(mathEquals(a, b)).toBeNull();
  });
});

describe('exprToLatex', () => {
  it.each([
    ['3/4', '\\frac{3}{4}'],
    ['2^10', '2^{10}'],
    ['sqrt(2)/2', '\\frac{\\sqrt{2}}{2}'],
    ['25%', '25\\,\\%'],
    ['6:2', '6 \\div 2'],
    ['x = 1/2', 'x = \\frac{1}{2}'],
  ])('%s → %s', (input, want) => {
    expect(exprToLatex(input)).toBe(want);
  });

  it('unary minus binds looser than power', () => {
    expect(exprToLatex('-(x+1)^2')).toBe('-\\left(x + 1\\right)^{2}');
  });

  it('returns null for non-math', () => {
    expect(exprToLatex('hallo!')).toBeNull();
  });
});

describe('evaluateExpression', () => {
  it('evaluates with variables', () => {
    expect(evaluateExpression('2x + 1', { x: 3 })).toBe(7);
    expect(evaluateExpression('2^x', { x: 10 })).toBe(1024);
  });
  it('returns null on parse failure or non-finite', () => {
    expect(evaluateExpression('##')).toBeNull();
    expect(evaluateExpression('1/0')).toBeNull();
  });
});

describe('looksLikeMath', () => {
  it('detects math signals and rejects prose', () => {
    expect(looksLikeMath('3/4')).toBe(true);
    expect(looksLikeMath('sqrt(2)')).toBe(true);
    expect(looksLikeMath('Bern')).toBe(false);
  });
});
