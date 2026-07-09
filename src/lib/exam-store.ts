import { v4 as uuidv4 } from 'uuid';
import getDb from './db';
import { mathEquals, evaluateExpression } from './math-eval';

// ─── Exam question format (AI-generated, stored as JSON in exams.exam_data) ───

// Optional coordinate-system display attached to any question ("read the graph")
export interface GraphSpec {
  functions?: Array<{ expr: string; label?: string }>;
  points?: Array<{ x: number; y: number; label?: string }>;
  xMin?: number; xMax?: number; yMin?: number; yMax?: number;
}

export type ExamQuestion =
  | { id: string; type: 'mc'; goal?: string; question: string; options: string[]; correctIndex: number; points: number; explanation?: string; graph?: GraphSpec }
  | { id: string; type: 'tf'; goal?: string; statement: string; correct: boolean; points: number; explanation?: string; graph?: GraphSpec }
  // Short answer, auto-graded (math-equivalence when math=true, else normalized string; accept = additional valid forms)
  | { id: string; type: 'short'; goal?: string; question: string; expected: string; accept?: string[]; math?: boolean; points: number; solution?: string; graph?: GraphSpec }
  // Free-form exercise, AI-graded against solution/criteria after submission.
  // math=true renders a Rechenweg line editor with live math preview.
  | { id: string; type: 'open'; goal?: string; question: string; solution: string; criteria?: string; points: number; math?: boolean; graph?: GraphSpec }
  // Student DRAWS a line into a coordinate system; graded against expectedExpr
  | { id: string; type: 'draw'; goal?: string; question: string; expectedExpr: string; xMin?: number; xMax?: number; yMin?: number; yMax?: number; points: number; solution?: string };

export interface ExamData {
  title: string;
  questions: ExamQuestion[];
}

export interface ExamRow {
  id: string;
  module_number: string;
  title: string;
  goal_ids: string;
  goal_texts: string;
  exam_data: string;
  status: 'generating' | 'ready' | 'error';
  error: string;
  created_at: string;
}

export interface GradedQuestion {
  questionId: string;
  correct: boolean;        // full points achieved
  pointsAwarded: number;
  points: number;
  studentAnswer: string;
  correctAnswer: string;   // display form of the right answer
  feedback?: string;       // explanation / AI feedback
  aiGraded?: boolean;
  gradingFailed?: boolean; // AI grading unavailable — solution shown, 0 awarded
}

export interface ExamAttemptRow {
  id: string;
  exam_id: string;
  answers: string;
  graded: string;
  score: number;
  max_score: number;
  created_at: string;
}

// ─── CRUD ───

export function createPendingExam(moduleNumber: string, goalIds: string[], goalTexts: string[]): ExamRow {
  const db = getDb();
  const id = uuidv4();
  db.prepare("INSERT INTO exams (id, module_number, title, goal_ids, goal_texts, exam_data, status) VALUES (?, ?, 'Probeprüfung wird erstellt…', ?, ?, '{}', 'generating')")
    .run(id, moduleNumber, JSON.stringify(goalIds), JSON.stringify(goalTexts));
  return db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as ExamRow;
}

export function finishExam(id: string, title: string, examData: ExamData): void {
  getDb().prepare("UPDATE exams SET title = ?, exam_data = ?, status = 'ready', error = '' WHERE id = ?")
    .run(title, JSON.stringify(examData), id);
}

export function failExam(id: string, error: string): void {
  getDb().prepare("UPDATE exams SET status = 'error', error = ? WHERE id = ?").run(error.substring(0, 500), id);
}

export function markGenerating(id: string): void {
  getDb().prepare("UPDATE exams SET status = 'generating', error = '' WHERE id = ?").run(id);
}

export function listExams(moduleNumber?: string): Array<ExamRow & { attempt_count: number; best_score: number | null; best_max: number | null; last_attempt: string | null }> {
  const db = getDb();
  const base = `
    SELECT e.*, COUNT(a.id) as attempt_count, MAX(a.score) as best_score,
           (SELECT max_score FROM exam_attempts WHERE exam_id = e.id ORDER BY score DESC LIMIT 1) as best_max,
           MAX(a.created_at) as last_attempt
    FROM exams e LEFT JOIN exam_attempts a ON a.exam_id = e.id
  `;
  if (moduleNumber) {
    return db.prepare(base + ' WHERE e.module_number = ? GROUP BY e.id ORDER BY e.created_at DESC').all(moduleNumber) as never;
  }
  return db.prepare(base + ' GROUP BY e.id ORDER BY e.created_at DESC').all() as never;
}

export function getExam(id: string): ExamRow | undefined {
  return getDb().prepare('SELECT * FROM exams WHERE id = ?').get(id) as ExamRow | undefined;
}

export function deleteExam(id: string): void {
  getDb().prepare('DELETE FROM exams WHERE id = ?').run(id);
}

export function saveAttempt(examId: string, answers: Record<string, string>, graded: GradedQuestion[], score: number, maxScore: number): ExamAttemptRow {
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO exam_attempts (id, exam_id, answers, graded, score, max_score) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, examId, JSON.stringify(answers), JSON.stringify(graded), score, maxScore);
  return db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id) as ExamAttemptRow;
}

export function listAttempts(examId: string): ExamAttemptRow[] {
  return getDb().prepare('SELECT * FROM exam_attempts WHERE exam_id = ? ORDER BY created_at DESC').all(examId) as ExamAttemptRow[];
}

// ─── Drawing questions: deterministic grading ───

export function drawnLineEquation(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return '(keine Zeichnung)';
  const [a, b] = pts;
  if (Math.abs(b.x - a.x) < 1e-9) return `x = ${a.x}`;
  const m = (b.y - a.y) / (b.x - a.x);
  const c = a.y - m * a.x;
  const r = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  return `y = ${r(m)}x ${c >= 0 ? '+' : '-'} ${r(Math.abs(c))}`;
}

/** Grade a drawn line (JSON point array) against the expected function. */
export function gradeDrawnLine(answerJson: string, expectedExpr: string): { correct: boolean; equation: string } {
  let pts: Array<{ x: number; y: number }> = [];
  try {
    const parsed = JSON.parse(answerJson || '[]');
    if (Array.isArray(parsed)) pts = parsed.filter(p => typeof p?.x === 'number' && typeof p?.y === 'number');
  } catch {}
  const equation = drawnLineEquation(pts);
  if (pts.length < 2 || Math.abs(pts[1].x - pts[0].x) < 1e-9) return { correct: false, equation };
  const m = (pts[1].y - pts[0].y) / (pts[1].x - pts[0].x);
  const c = pts[0].y - m * pts[0].x;
  let samples = 0;
  let maxDelta = 0;
  for (const x of [-4, -2, 0, 2, 4]) {
    const want = evaluateExpression(expectedExpr, { x });
    if (want === null) continue;
    samples++;
    maxDelta = Math.max(maxDelta, Math.abs(m * x + c - want));
  }
  return { correct: samples >= 3 && maxDelta <= 0.35, equation };
}

// ─── Fallback grading for open questions ───
// When AI grading is unavailable, compare the student's answer against the
// final expressions of the model solution via math equivalence. Rescues the
// common case "answer equals the solution's end result" (y=3x+1 vs h(x)=3x+1).

export function extractFinalExpressions(solution: string): string[] {
  const cleaned = solution.replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, ' ');
  const candidates: string[] = [];
  const re = /=\s*([^=.;\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const c = m[1].trim().replace(/[.,;:!?]+$/, '').trim();
    // Structured expressions only — bare numbers/single letters match too easily
    if (c.length >= 2 && !/^\d+([.,]\d+)?$/.test(c)) candidates.push(c);
  }
  return candidates.slice(-4);
}

export function openAnswerMatchesSolution(solution: string, answer: string): boolean {
  if (!answer.trim()) return false;
  for (const candidate of extractFinalExpressions(solution)) {
    if (mathEquals(candidate, answer) === true) return true;
  }
  return false;
}

// ─── Statistics: per-goal performance across all attempts ───

export interface GoalStat { goal: string; pointsAwarded: number; points: number; pct: number }
export interface ModuleStats {
  module_number: string;
  attempts: number;
  pointsAwarded: number;
  points: number;
  avgPct: number;
  goals: GoalStat[];
}

export function computeExamStats(): { modules: ModuleStats[]; recent: Array<{ exam_id: string; exam_title: string; module_number: string; score: number; max_score: number; created_at: string }> } {
  const db = getDb();
  const exams = db.prepare("SELECT * FROM exams WHERE status = 'ready'").all() as ExamRow[];
  const byModule = new Map<string, { attempts: number; pointsAwarded: number; points: number; goals: Map<string, { awarded: number; total: number }> }>();
  const recent: Array<{ exam_id: string; exam_title: string; module_number: string; score: number; max_score: number; created_at: string }> = [];

  for (const exam of exams) {
    let questions: ExamQuestion[] = [];
    try { questions = (JSON.parse(exam.exam_data)?.questions || []) as ExamQuestion[]; } catch { continue; }
    const goalByQ = new Map(questions.map(q => [q.id, (q.goal || 'Allgemein').trim() || 'Allgemein']));
    const attempts = listAttempts(exam.id);
    if (attempts.length === 0) continue;

    if (!byModule.has(exam.module_number)) {
      byModule.set(exam.module_number, { attempts: 0, pointsAwarded: 0, points: 0, goals: new Map() });
    }
    const mod = byModule.get(exam.module_number)!;

    for (const attempt of attempts) {
      recent.push({ exam_id: exam.id, exam_title: exam.title, module_number: exam.module_number, score: attempt.score, max_score: attempt.max_score, created_at: attempt.created_at });
      mod.attempts++;
      let graded: GradedQuestion[] = [];
      try { graded = JSON.parse(attempt.graded); } catch { continue; }
      for (const g of graded) {
        mod.pointsAwarded += g.pointsAwarded;
        mod.points += g.points;
        const goal = goalByQ.get(g.questionId) || 'Allgemein';
        if (!mod.goals.has(goal)) mod.goals.set(goal, { awarded: 0, total: 0 });
        const gs = mod.goals.get(goal)!;
        gs.awarded += g.pointsAwarded;
        gs.total += g.points;
      }
    }
  }

  recent.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const modules: ModuleStats[] = Array.from(byModule.entries()).map(([module_number, m]) => ({
    module_number,
    attempts: m.attempts,
    pointsAwarded: m.pointsAwarded,
    points: m.points,
    avgPct: m.points > 0 ? Math.round((m.pointsAwarded / m.points) * 100) : 0,
    goals: Array.from(m.goals.entries())
      .map(([goal, g]) => ({ goal, pointsAwarded: g.awarded, points: g.total, pct: g.total > 0 ? Math.round((g.awarded / g.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct),
  })).sort((a, b) => a.module_number.localeCompare(b.module_number));

  return { modules, recent: recent.slice(0, 10) };
}

// ─── Validation of AI-generated exams ───

function clampRange(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 100 ? n : fallback;
}

function sanitizeGraphSpec(raw: unknown): GraphSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  const functions = (Array.isArray(g.functions) ? g.functions : [])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map(f => ({ expr: String(f.expr || ''), label: typeof f.label === 'string' ? f.label : undefined }))
    .filter(f => f.expr && [-2, 0, 2].some(x => evaluateExpression(f.expr, { x }) !== null));
  const points = (Array.isArray(g.points) ? g.points : [])
    .filter((pt): pt is Record<string, unknown> => !!pt && typeof pt === 'object')
    .map(pt => ({ x: Number(pt.x), y: Number(pt.y), label: typeof pt.label === 'string' ? pt.label : undefined }))
    .filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y));
  if (functions.length === 0 && points.length === 0) return undefined;
  return {
    functions: functions.length > 0 ? functions : undefined,
    points: points.length > 0 ? points : undefined,
    xMin: clampRange(g.xMin, -10), xMax: clampRange(g.xMax, 10),
    yMin: clampRange(g.yMin, -10), yMax: clampRange(g.yMax, 10),
  };
}

export function sanitizeExamData(raw: unknown): ExamData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const questionsRaw = Array.isArray(data.questions) ? data.questions : [];
  const questions: ExamQuestion[] = [];
  const seenIds = new Set<string>();

  questionsRaw.forEach((q, i) => {
    if (!q || typeof q !== 'object') return;
    const item = q as Record<string, unknown>;
    let id = typeof item.id === 'string' && item.id ? item.id : `q${i + 1}`;
    while (seenIds.has(id)) id = `${id}_x`;
    const points = Math.max(0.5, Math.min(10, Number(item.points) || 1));
    const goal = typeof item.goal === 'string' ? item.goal : undefined;
    const graph = sanitizeGraphSpec(item.graph);

    switch (item.type) {
      case 'mc': {
        const options = (Array.isArray(item.options) ? item.options : []).map(String).filter(Boolean);
        const correctIndex = Number(item.correctIndex);
        if (typeof item.question !== 'string' || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return;
        questions.push({ id, type: 'mc', goal, question: item.question, options, correctIndex, points, explanation: typeof item.explanation === 'string' ? item.explanation : undefined, graph });
        break;
      }
      case 'tf': {
        if (typeof item.statement !== 'string' || typeof item.correct !== 'boolean') return;
        questions.push({ id, type: 'tf', goal, statement: item.statement, correct: item.correct, points, explanation: typeof item.explanation === 'string' ? item.explanation : undefined, graph });
        break;
      }
      case 'short': {
        if (typeof item.question !== 'string' || typeof item.expected !== 'string' || !item.expected.trim()) return;
        questions.push({
          id, type: 'short', goal, question: item.question, expected: item.expected,
          accept: Array.isArray(item.accept) ? item.accept.map(String).filter(Boolean) : undefined,
          math: item.math === true, points,
          solution: typeof item.solution === 'string' ? item.solution : undefined,
          graph,
        });
        break;
      }
      case 'open': {
        if (typeof item.question !== 'string' || typeof item.solution !== 'string' || !item.solution.trim()) return;
        questions.push({ id, type: 'open', goal, question: item.question, solution: item.solution, criteria: typeof item.criteria === 'string' ? item.criteria : undefined, points, math: item.math === true, graph });
        break;
      }
      case 'draw': {
        const expectedExpr = typeof item.expectedExpr === 'string' ? item.expectedExpr : '';
        // Expression must evaluate at at least one sample point
        const evaluable = [-2, 0, 2].some(x => evaluateExpression(expectedExpr, { x }) !== null);
        if (typeof item.question !== 'string' || !expectedExpr || !evaluable) return;
        questions.push({
          id, type: 'draw', goal, question: item.question, expectedExpr, points,
          xMin: clampRange(item.xMin, -10), xMax: clampRange(item.xMax, 10),
          yMin: clampRange(item.yMin, -10), yMax: clampRange(item.yMax, 10),
          solution: typeof item.solution === 'string' ? item.solution : undefined,
        });
        break;
      }
      default: return;
    }
    seenIds.add(id);
  });

  if (questions.length === 0) return null;
  return { title: typeof data.title === 'string' && data.title ? data.title : 'Probeprüfung', questions };
}
