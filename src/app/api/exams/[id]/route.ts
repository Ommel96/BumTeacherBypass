export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getExam, deleteExam, listAttempts } from '@/lib/exam-store';
import { runExamGeneration } from '@/lib/exam-generator';
import { getLernziele } from '@/lib/lernziele-store';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const exam = getExam(params.id);
    if (!exam) return NextResponse.json({ error: 'Prüfung nicht gefunden' }, { status: 404 });
    let goalIds: string[] = [];
    try { goalIds = JSON.parse(exam.goal_ids); } catch {}
    return NextResponse.json({
      exam,
      goals: getLernziele(goalIds),
      attempts: listAttempts(params.id),
    });
  } catch (error) {
    console.error('Get exam error:', error);
    return NextResponse.json({ error: 'Prüfung konnte nicht geladen werden' }, { status: 500 });
  }
}

// Re-run generation for a failed (or stale) exam
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const exam = getExam(params.id);
    if (!exam) return NextResponse.json({ error: 'Prüfung nicht gefunden' }, { status: 404 });
    if (exam.status === 'generating') return NextResponse.json({ error: 'Wird bereits generiert' }, { status: 409 });
    runExamGeneration(params.id).catch(err => console.error('Background exam regeneration crashed:', err));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Regenerate exam error:', error);
    return NextResponse.json({ error: 'Neustart der Generierung fehlgeschlagen' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    deleteExam(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete exam error:', error);
    return NextResponse.json({ error: 'Prüfung konnte nicht gelöscht werden' }, { status: 500 });
  }
}
