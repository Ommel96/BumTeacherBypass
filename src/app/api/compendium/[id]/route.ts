export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCompendiumEntry, upsertCompendiumEntry, deleteCompendiumEntry, listCompendiumEntries } from '@/lib/compendium-store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getCompendiumEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const related = listCompendiumEntries(entry.module_number, entry.topic)
    .filter(e => e.id !== id)
    .slice(0, 5);

  return NextResponse.json({ ...entry, related });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const existing = getCompendiumEntry(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  upsertCompendiumEntry({
    id: existing.id,
    module_number: existing.module_number,
    topic: existing.topic,
    title: existing.title,
    content: body.content ?? existing.content,
    keywords: body.keywords ?? existing.keywords,
    interactive_examples: body.interactive_examples ?? existing.interactive_examples,
    source_doc_ids: body.source_doc_ids ?? existing.source_doc_ids,
  });

  return NextResponse.json(getCompendiumEntry(id));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getCompendiumEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  deleteCompendiumEntry(id);
  return NextResponse.json({ ok: true });
}