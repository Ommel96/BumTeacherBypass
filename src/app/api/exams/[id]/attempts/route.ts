export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { getExam, saveAttempt, listAttempts, sanitizeExamData, openAnswerMatchesSolution, gradeDrawnLine, type GradedQuestion, type ExamQuestion } from '@/lib/exam-store';
import { AIProvider } from '@/lib/ai-provider';
import { getProviderConfigForRole } from '@/lib/providers-store';
import { getSettings } from '@/lib/settings-store';
import { mathEquals } from '@/lib/math-eval';

const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

function shortAnswerCorrect(q: Extract<ExamQuestion, { type: 'short' }>, answer: string): boolean {
  const candidates = [q.expected, ...(q.accept || [])];
  for (const expected of candidates) {
    if (normalize(answer) === normalize(expected)) return true;
    // Math equivalence — but never for pure digit strings unless explicitly
    // math-flagged: binary/hex answers like "0101" must keep leading zeros.
    const bothPureDigits = /^\d+$/.test(answer.trim()) && /^\d+$/.test(expected.trim());
    if ((q.math === true || !bothPureDigits) && q.math !== false && mathEquals(expected, answer) === true) return true;
  }
  return false;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json({ attempts: listAttempts(params.id) });
  } catch (error) {
    console.error('List attempts error:', error);
    return NextResponse.json({ error: 'Versuche konnten nicht geladen werden' }, { status: 500 });
  }
}

// Submit an attempt: grades deterministically (mc/tf/short) and via AI (open),
// stores the attempt, and returns the full corrected exam.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const exam = getExam(params.id);
    if (!exam) return NextResponse.json({ error: 'Prüfung nicht gefunden' }, { status: 404 });
    if (exam.status !== 'ready') return NextResponse.json({ error: 'Prüfung ist noch nicht bereit' }, { status: 409 });
    const examData = sanitizeExamData(JSON.parse(exam.exam_data));
    if (!examData) return NextResponse.json({ error: 'Prüfungsdaten ungültig' }, { status: 500 });

    const body = await request.json();
    const answers: Record<string, string> = {};
    if (body?.answers && typeof body.answers === 'object') {
      for (const [k, v] of Object.entries(body.answers)) answers[k] = String(v ?? '');
    }

    const graded: GradedQuestion[] = [];
    const openItems: Array<{ id: string; question: string; solution: string; criteria?: string; points: number; studentAnswer: string }> = [];

    for (const q of examData.questions) {
      const answer = answers[q.id] || '';
      switch (q.type) {
        case 'mc': {
          const idx = Number(answer);
          const correct = Number.isInteger(idx) && idx === q.correctIndex;
          graded.push({
            questionId: q.id, correct, pointsAwarded: correct ? q.points : 0, points: q.points,
            studentAnswer: Number.isInteger(idx) && q.options[idx] !== undefined ? q.options[idx] : '(keine Antwort)',
            correctAnswer: q.options[q.correctIndex],
            feedback: q.explanation,
          });
          break;
        }
        case 'tf': {
          const val = answer === 'true' ? true : answer === 'false' ? false : null;
          const correct = val === q.correct;
          graded.push({
            questionId: q.id, correct, pointsAwarded: correct ? q.points : 0, points: q.points,
            studentAnswer: val === null ? '(keine Antwort)' : val ? 'Wahr' : 'Falsch',
            correctAnswer: q.correct ? 'Wahr' : 'Falsch',
            feedback: q.explanation,
          });
          break;
        }
        case 'short': {
          const correct = answer.trim() !== '' && shortAnswerCorrect(q, answer);
          graded.push({
            questionId: q.id, correct, pointsAwarded: correct ? q.points : 0, points: q.points,
            studentAnswer: answer || '(keine Antwort)',
            correctAnswer: q.expected,
            feedback: q.solution,
          });
          break;
        }
        case 'open': {
          openItems.push({ id: q.id, question: q.question, solution: q.solution, criteria: q.criteria, points: q.points, studentAnswer: answer });
          break;
        }
        case 'draw': {
          const { correct, equation } = gradeDrawnLine(answer, q.expectedExpr);
          graded.push({
            questionId: q.id, correct, pointsAwarded: correct ? q.points : 0, points: q.points,
            studentAnswer: equation,
            correctAnswer: `\\( ${q.expectedExpr} \\)`,
            feedback: q.solution,
          });
          break;
        }
      }
    }

    // AI grading for open questions — one batched call
    if (openItems.length > 0) {
      const settings = getSettings();
      const provider = new AIProvider(
        getProviderConfigForRole('default'),
        settings.enrichmentProviderId ? getProviderConfigForRole('enrichment') : undefined,
        settings.reviewerProviderId ? getProviderConfigForRole('reviewer') : undefined,
      );
      // Two attempts at the AI batch — a single flaky response must not
      // zero out correct answers.
      let grades: Record<string, { points: number; feedback: string }> = {};
      try {
        grades = await provider.gradeOpenAnswers(openItems);
      } catch (err) {
        console.error('AI grading failed, retrying once:', err);
        try {
          grades = await provider.gradeOpenAnswers(openItems);
        } catch (err2) {
          console.error('AI grading retry failed:', err2);
        }
      }
      for (const item of openItems) {
        const q = examData.questions.find(x => x.id === item.id) as Extract<ExamQuestion, { type: 'open' }>;
        const g = grades[item.id];
        if (g) {
          graded.push({
            questionId: item.id, correct: g.points >= q.points, pointsAwarded: g.points, points: q.points,
            studentAnswer: item.studentAnswer || '(keine Antwort)',
            correctAnswer: q.solution, feedback: g.feedback, aiGraded: true,
          });
        } else if (openAnswerMatchesSolution(q.solution, item.studentAnswer)) {
          // Rescue: the answer matches the solution's final result mathematically
          graded.push({
            questionId: item.id, correct: true, pointsAwarded: q.points, points: q.points,
            studentAnswer: item.studentAnswer,
            correctAnswer: q.solution,
            feedback: 'Endergebnis korrekt — automatisch geprüft (KI-Bewertung war nicht verfügbar).',
          });
        } else {
          graded.push({
            questionId: item.id, correct: false, pointsAwarded: 0, points: q.points,
            studentAnswer: item.studentAnswer || '(keine Antwort)',
            correctAnswer: q.solution,
            feedback: 'Automatische Bewertung nicht verfügbar — vergleiche deine Antwort mit der Musterlösung.',
            aiGraded: true, gradingFailed: true,
          });
        }
      }
    }

    // Preserve exam question order in the graded output
    const order = new Map(examData.questions.map((q, i) => [q.id, i]));
    graded.sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0));

    const score = Math.round(graded.reduce((sum, g) => sum + g.pointsAwarded, 0) * 2) / 2;
    const maxScore = graded.reduce((sum, g) => sum + g.points, 0);
    const attempt = saveAttempt(params.id, answers, graded, score, maxScore);
    console.log(`Exam attempt graded: ${score}/${maxScore} for exam ${params.id}`);
    return NextResponse.json({ attempt, graded, score, maxScore });
  } catch (error) {
    console.error('Grade attempt error:', error);
    const msg = error instanceof Error ? error.message : 'Bewertung fehlgeschlagen';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
