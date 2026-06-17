export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDocument, getPagesByDocument, deleteDocument, updateDocumentCategory } from '@/lib/document-store';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const pages = getPagesByDocument(params.id);
    return NextResponse.json({ document: doc, pages });
  } catch (error) {
    console.error('Get document error:', error);
    return NextResponse.json({ error: 'Failed to get document' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const body = await request.json();
    const { year, semester, module_number, topic } = body;

    updateDocumentCategory(params.id, year || '', semester || '', module_number || '', topic || '');
    const updated = getDocument(params.id);

    return NextResponse.json({ document: updated });
  } catch (error) {
    console.error('Update document error:', error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    await deleteDocument(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}