// ─── School-level math expression engine ───
// Parses, evaluates, LaTeX-renders and compares expressions from basic arithmetic
// up to exponentials/logarithms. No dependencies, no eval() — a small recursive
// descent parser. Used for live math input previews and equivalence-based grading
// (a student answering 0,75 or 3/4 or 6/8 is right when the expected answer is 0.75).
//
// Supported: + - * / : ^ % ( ), decimal comma and point, implicit multiplication
// (2x, 3(x+1)), unary minus, constants pi/e, variables, functions sqrt, abs,
// exp, ln, log (base 10), log2, sin, cos, tan (radians).

type Node =
  | { kind: 'num'; value: number; raw: string }
  | { kind: 'var'; name: string }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node; style?: 'frac' | 'div' }
  | { kind: 'neg'; arg: Node }
  | { kind: 'pct'; arg: Node }
  | { kind: 'fn'; name: string; arg: Node };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token =
  | { t: 'num'; v: number; raw: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string };

function tokenize(input: string): Token[] | null {
  // Normalize: decimal commas, unicode operators, whitespace
  const s = input
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[·×]/g, '*')
    .replace(/÷/g, ':')
    .replace(/−/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/\s+/g, '');

  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      const m = s.slice(i).match(/^\d*\.?\d+/);
      if (!m) return null;
      tokens.push({ t: 'num', v: parseFloat(m[0]), raw: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-ZäöüÄÖÜ_]/.test(ch)) {
      const m = s.slice(i).match(/^[a-zA-ZäöüÄÖÜ_][a-zA-ZäöüÄÖÜ_0-9]*/);
      if (!m) return null;
      tokens.push({ t: 'ident', v: m[0] });
      i += m[0].length;
      continue;
    }
    if ('+-*/:^()%'.includes(ch)) {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    return null; // unknown character → not a math expression
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token | undefined { return this.tokens[this.pos++]; }

  parse(): Node | null {
    try {
      const node = this.expr();
      if (this.pos !== this.tokens.length) return null;
      return node;
    } catch {
      return null;
    }
  }

  private expr(): Node {
    let left = this.term();
    for (;;) {
      const tk = this.peek();
      if (tk?.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        this.next();
        left = { kind: 'bin', op: tk.v as '+' | '-', left, right: this.term() };
      } else break;
    }
    return left;
  }

  private term(): Node {
    let left = this.factor();
    for (;;) {
      const tk = this.peek();
      if (tk?.t === 'op' && (tk.v === '*' || tk.v === '/' || tk.v === ':')) {
        this.next();
        const right = this.factor();
        left = tk.v === '*'
          ? { kind: 'bin', op: '*', left, right }
          : { kind: 'bin', op: '/', left, right, style: tk.v === ':' ? 'div' : 'frac' };
      } else if (tk && (tk.t === 'num' || tk.t === 'ident' || (tk.t === 'op' && tk.v === '('))) {
        // Implicit multiplication: 2x, 3(x+1), (a)(b)
        left = { kind: 'bin', op: '*', left, right: this.factor() };
      } else break;
    }
    return left;
  }

  // Unary minus binds LOOSER than ^ (convention: -x^2 = -(x^2)),
  // and ^ is right-associative (2^3^2 = 2^9).
  private factor(): Node {
    const tk = this.peek();
    if (tk?.t === 'op' && (tk.v === '-' || tk.v === '+')) {
      this.next();
      return tk.v === '-' ? { kind: 'neg', arg: this.factor() } : this.factor();
    }
    return this.power();
  }

  private power(): Node {
    let base = this.postfix(this.primary());
    const tk = this.peek();
    if (tk?.t === 'op' && tk.v === '^') {
      this.next();
      base = { kind: 'bin', op: '^', left: base, right: this.factor() };
    }
    return base;
  }

  private postfix(node: Node): Node {
    let n = node;
    while (this.peek()?.t === 'op' && this.peek()?.v === '%') {
      this.next();
      n = { kind: 'pct', arg: n };
    }
    return n;
  }

  private primary(): Node {
    const tk = this.next();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') return { kind: 'num', value: tk.v, raw: tk.raw };
    if (tk.t === 'ident') {
      const name = tk.v;
      const lower = name.toLowerCase();
      if (FUNCTIONS[lower] && this.peek()?.t === 'op' && this.peek()?.v === '(') {
        this.next(); // consume '('
        const arg = this.expr();
        const close = this.next();
        if (!close || close.t !== 'op' || close.v !== ')') throw new Error('missing )');
        return { kind: 'fn', name: lower, arg };
      }
      return { kind: 'var', name };
    }
    if (tk.t === 'op' && tk.v === '(') {
      const inner = this.expr();
      const close = this.next();
      if (!close || close.t !== 'op' || close.v !== ')') throw new Error('missing )');
      return inner;
    }
    throw new Error(`unexpected token ${JSON.stringify(tk)}`);
  }
}

export function parseExpression(input: string): Node | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;
  return new Parser(tokens).parse();
}

function collectVars(node: Node, out: Set<string>): void {
  switch (node.kind) {
    case 'var': {
      if (!(node.name.toLowerCase() in CONSTANTS)) out.add(node.name.toLowerCase());
      break;
    }
    case 'bin': collectVars(node.left, out); collectVars(node.right, out); break;
    case 'neg': collectVars(node.arg, out); break;
    case 'pct': collectVars(node.arg, out); break;
    case 'fn': collectVars(node.arg, out); break;
  }
}

function evalNode(node: Node, vars: Record<string, number>): number {
  switch (node.kind) {
    case 'num': return node.value;
    case 'var': {
      const lower = node.name.toLowerCase();
      if (lower in CONSTANTS) return CONSTANTS[lower];
      if (lower in vars) return vars[lower];
      return NaN;
    }
    case 'bin': {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
      return NaN;
    }
    case 'neg': return -evalNode(node.arg, vars);
    case 'pct': return evalNode(node.arg, vars) / 100;
    case 'fn': {
      const f = FUNCTIONS[node.name];
      return f ? f(evalNode(node.arg, vars)) : NaN;
    }
  }
}

// ─── LaTeX rendering (for live input previews) ───

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 3, '^': 4 };

function nodePrec(node: Node): number {
  if (node.kind === 'bin') return PREC[node.op] ?? 5;
  if (node.kind === 'neg') return 1;
  return 5;
}

function toLatex(node: Node): string {
  switch (node.kind) {
    case 'num': return node.raw;
    case 'var': {
      const lower = node.name.toLowerCase();
      if (lower === 'pi') return '\\pi';
      return node.name.length > 1 ? `\\text{${node.name}}` : node.name;
    }
    case 'neg': {
      const inner = toLatex(node.arg);
      return nodePrec(node.arg) < 2 ? `-\\left(${inner}\\right)` : `-${inner}`;
    }
    case 'pct': return `${toLatex(node.arg)}\\,\\%`;
    case 'fn': {
      const arg = toLatex(node.arg);
      if (node.name === 'sqrt') return `\\sqrt{${arg}}`;
      if (node.name === 'abs') return `\\left|${arg}\\right|`;
      const known = ['exp', 'ln', 'log', 'sin', 'cos', 'tan'];
      const fname = known.includes(node.name) ? `\\${node.name}` : `\\operatorname{${node.name}}`;
      return `${fname}\\left(${arg}\\right)`;
    }
    case 'bin': {
      if (node.op === '/') {
        if (node.style === 'div') {
          const l = nodePrec(node.left) < 3 ? `\\left(${toLatex(node.left)}\\right)` : toLatex(node.left);
          const r = nodePrec(node.right) <= 3 ? `\\left(${toLatex(node.right)}\\right)` : toLatex(node.right);
          return `${l} \\div ${r}`;
        }
        return `\\frac{${toLatex(node.left)}}{${toLatex(node.right)}}`;
      }
      if (node.op === '^') {
        const base = (node.left.kind === 'num' || node.left.kind === 'var') ? toLatex(node.left) : `\\left(${toLatex(node.left)}\\right)`;
        return `${base}^{${toLatex(node.right)}}`;
      }
      if (node.op === '*') {
        const l = nodePrec(node.left) < 2 ? `\\left(${toLatex(node.left)}\\right)` : toLatex(node.left);
        const r = nodePrec(node.right) < 2 ? `\\left(${toLatex(node.right)}\\right)` : toLatex(node.right);
        return `${l} \\cdot ${r}`;
      }
      // + and -
      const l = toLatex(node.left);
      const rNeedsParens = node.op === '-' && nodePrec(node.right) <= 1;
      const r = rNeedsParens ? `\\left(${toLatex(node.right)}\\right)` : toLatex(node.right);
      return `${l} ${node.op} ${r}`;
    }
  }
}

/**
 * Convert user input (possibly "x = 3/4" or an equation) to LaTeX for preview.
 * Returns null when the input is not parseable as math.
 */
export function exprToLatex(input: string): string | null {
  const parts = input.split('=');
  if (parts.length > 2) return null;
  const rendered: string[] = [];
  for (const part of parts) {
    const node = parseExpression(part);
    if (!node) return null;
    rendered.push(toLatex(node));
  }
  return rendered.join(' = ');
}

// ─── Equivalence-based grading ───

function stripAssignment(input: string): string {
  // "x = 3/4" or "f(x) = 3x+1" → right-hand side (single leading assignment only)
  const m = input.match(/^\s*[a-zA-ZäöüÄÖÜ_][a-zA-ZäöüÄÖÜ_0-9]*(?:\s*\([a-zA-ZäöüÄÖÜ_][a-zA-ZäöüÄÖÜ_0-9]*\))?\s*=\s*(.+)$/);
  return m ? m[1] : input;
}

function decimalPlaces(raw: string): number | null {
  const m = raw.trim().replace(',', '.').match(/^-?\d+(?:\.(\d+))?$/);
  if (!m) return null;
  return m[1] ? m[1].length : 0;
}

/**
 * Compare two answers for mathematical equivalence.
 * Returns true/false when both parse as math, or null when either side is not
 * parseable (caller should fall back to string comparison).
 *
 * - No variables: numeric comparison. When the student gave a plain rounded
 *   decimal, accept it at the precision they used (0.67 for 2/3).
 * - With variables: sampled equivalence at several points (2(x+1) equals 2x+2).
 */
export function mathEquals(expected: string, given: string): boolean | null {
  // Pure text ("Bern", "TCP") parses as variables — bail out early so callers
  // fall back to string comparison instead of sampling nonsense.
  if (!looksLikeMath(expected) || !looksLikeMath(given)) return null;

  const expNode = parseExpression(stripAssignment(expected));
  const givNode = parseExpression(stripAssignment(given));
  if (!expNode || !givNode) return null;

  const vars = new Set<string>();
  collectVars(expNode, vars);
  collectVars(givNode, vars);

  if (vars.size === 0) {
    const e = evalNode(expNode, {});
    const g = evalNode(givNode, {});
    if (!isFinite(e) || !isFinite(g)) return null;
    // Plain decimals are compared at their own precision: the student's side
    // gets rounding tolerance (0.67 for 2/3), the AI-written expected side gets
    // one-ulp tolerance since AI answers are sometimes truncated, not rounded
    // (1.4142135 for sqrt(2)).
    const placesGiven = decimalPlaces(stripAssignment(given));
    const placesExp = decimalPlaces(stripAssignment(expected));
    let tol = 0;
    if (placesGiven !== null && placesGiven > 0) tol = Math.max(tol, 0.5 * Math.pow(10, -placesGiven));
    if (placesExp !== null && placesExp > 0) tol = Math.max(tol, 0.99 * Math.pow(10, -placesExp));
    if (tol > 0) return Math.abs(e - g) <= tol + 1e-12;
    const strictTol = Math.max(1e-9, Math.abs(e) * 1e-9);
    return Math.abs(e - g) <= strictTol;
  }

  // Sampled equivalence for expressions with variables
  const names = Array.from(vars);
  let validSamples = 0;
  for (let i = 0; i < 24 && validSamples < 8; i++) {
    const sample: Record<string, number> = {};
    for (let v = 0; v < names.length; v++) {
      // Deterministic pseudo-random points, avoiding 0/1 special cases
      sample[names[v]] = ((i * 7 + v * 13 + 3) % 17) / 3.1 - 2.3;
    }
    const e = evalNode(expNode, sample);
    const g = evalNode(givNode, sample);
    if (!isFinite(e) || !isFinite(g)) continue;
    validSamples++;
    const tol = Math.max(1e-6, Math.abs(e) * 1e-6);
    if (Math.abs(e - g) > tol) return false;
  }
  return validSamples >= 3 ? true : null;
}

/**
 * Evaluate an expression at given variable values (e.g. f(x) plotting).
 * Returns null when unparseable or non-finite.
 */
export function evaluateExpression(input: string, vars: Record<string, number> = {}): number | null {
  const node = parseExpression(stripAssignment(input));
  if (!node) return null;
  const lowered: Record<string, number> = {};
  for (const [k, v] of Object.entries(vars)) lowered[k.toLowerCase()] = v;
  const result = evalNode(node, lowered);
  return isFinite(result) ? result : null;
}

/** Heuristic: does this string look like it is meant as math at all? */
export function looksLikeMath(s: string): boolean {
  return /[0-9]/.test(s) || /[+\-*/^=%:()]|sqrt|\\frac|\bpi\b/.test(s);
}
