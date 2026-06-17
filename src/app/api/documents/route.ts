export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, listDocumentsByCategory } from '@/lib/document-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const semester = searchParams.get('semester');
    const moduleNumber = searchParams.get('module_number');
    const topic = searchParams.get('topic');

    if (year || semester || moduleNumber || topic) {
      const docs = listDocumentsByCategory(
        year || undefined,
        semester || undefined,
        moduleNumber || undefined,
        topic || undefined
      );
      return NextResponse.json({ documents: docs });
    }

    const docs = listDocuments();
    return NextResponse.json({ documents: docs });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }
}