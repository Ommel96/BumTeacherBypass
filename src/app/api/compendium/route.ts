export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { listCompendiumEntries, searchCompendium, upsertCompendiumEntry, getCompendiumEntry } from '@/lib/compendium-store';
import { getDocument, getPagesByDocument } from '@/lib/document-store';
import { AIProvider } from '@/lib/ai-provider';
import { getProviderConfigForRole } from '@/lib/providers-store';
import { researchTopic } from '@/lib/web-research';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const moduleNumber = searchParams.get('module_number');
  const topic = searchParams.get('topic');
  const q = searchParams.get('q');

  if (q) {
    const results = searchCompendium(q);
    return NextResponse.json(results);
  }

  const entries = listCompendiumEntries(moduleNumber || undefined, topic || undefined);
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { documentId } = body;

  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
  }

  const doc = getDocument(documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const pages = getPagesByDocument(documentId);
  const rawText = pages.map(p => p.raw_text || p.content || '').filter(Boolean).join('\n');

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'No text content in document' }, { status: 400 });
  }

  try {
    const config = getProviderConfigForRole('compendium');
    const provider = new AIProvider(config);

    const existingEntries = listCompendiumEntries(doc.module_number, doc.topic).map(e => ({
      title: e.title,
      content: e.content,
      keywords: e.keywords,
    }));

    const keywords = rawText.substring(0, 500).split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    let webResearch = '';
    try {
      webResearch = await researchTopic(keywords);
    } catch {}

    const generated = await provider.generateCompendiumEntries(rawText, doc.module_number, doc.topic, existingEntries, webResearch);

    const upsertedIds: string[] = [];
    for (const entry of generated) {
      const id = upsertCompendiumEntry({
        id: '',
        module_number: doc.module_number,
        topic: doc.topic,
        title: entry.title,
        content: entry.content,
        keywords: (entry.keywords || []).join(','),
        source_doc_ids: documentId,
      });
      upsertedIds.push(id);
    }

    const results = upsertedIds.map(id => getCompendiumEntry(id)).filter(Boolean);
    return NextResponse.json({ generated: results });
  } catch (error) {
    console.error('Error generating compendium entries:', error);
    return NextResponse.json({ error: 'Failed to generate compendium entries' }, { status: 500 });
  }
}