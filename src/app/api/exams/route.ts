export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listExams, createPendingExam } from '@/lib/exam-store';
import { getLernziele } from '@/lib/lernziele-store';
import { runExamGeneration } from '@/lib/exam-generator';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleNumber = searchParams.get('module_number') || undefined;
    return NextResponse.json({ exams: listExams(moduleNumber) });
  } catch (error) {
    console.error('List exams error:', error);
    return NextResponse.json({ error: 'Prüfungen konnten nicht geladen werden' }, { status: 500 });
  }
}

// Create a new practice exam. Generation runs in the background — the row is
// returned immediately with status "generating" and the client polls.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const moduleNumber = String(body?.module_number || '').trim();
    const goalIds = Array.isArray(body?.goal_ids) ? body.goal_ids.map(String) : [];
    // Free-text goals (e.g. "Schwächen üben" from the statistics view)
    const goalTexts = Array.isArray(body?.goal_texts) ? body.goal_texts.map(String).map((g: string) => g.trim()).filter(Boolean) : [];
    if (!moduleNumber) return NextResponse.json({ error: 'module_number fehlt' }, { status: 400 });

    // Validate the ids exist before creating the row
    const goals = getLernziele(goalIds);

    const exam = createPendingExam(moduleNumber, goals.map(g => g.id), goalTexts);

    // Fire and forget — status/error land on the exam row
    runExamGeneration(exam.id).catch(err => console.error('Background exam generation crashed:', err));

    return NextResponse.json({ exam });
  } catch (error) {
    console.error('Create exam error:', error);
    const msg = error instanceof Error ? error.message : 'Prüfung konnte nicht erstellt werden';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
