export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { computeExamStats } from '@/lib/exam-store';

export async function GET() {
  try {
    return NextResponse.json(computeExamStats());
  } catch (error) {
    console.error('Exam stats error:', error);
    return NextResponse.json({ error: 'Statistik konnte nicht berechnet werden' }, { status: 500 });
  }
}
