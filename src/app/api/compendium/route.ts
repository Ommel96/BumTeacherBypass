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
  const { documentId, documentIds } = body;

  // Accept either a single documentId or an array of documentIds
  let docIds: string[];
  if (Array.isArray(documentIds) && documentIds.length > 0) {
    docIds = documentIds.filter(Boolean);
  } else if (documentId) {
    docIds = [documentId];
  } else {
    return NextResponse.json({ error: 'Missing documentId or documentIds' }, { status: 400 });
  }

  // Collect text from all related documents
  const docs = docIds.map(id => getDocument(id)).filter((d): d is NonNullable<typeof d> => d !== null && d !== undefined);
  if (docs.length === 0) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Use the first document's module/topic for all (they should share the same module/topic)
  const primaryDoc = docs[0]!;

  // Gather text from all related documents
  const allTexts: string[] = [];
  for (const doc of docs) {
    const pages = getPagesByDocument(doc.id);
    const text = pages.map(p => p.raw_text || p.content || '').filter(Boolean).join('\n');
    if (text.trim()) allTexts.push(text);
  }
  const rawText = allTexts.join('\n\n---\n\n');

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'No text content in documents' }, { status: 400 });
  }

  try {
    const config = getProviderConfigForRole('compendium');
    const provider = new AIProvider(config);

    const existingEntries = listCompendiumEntries(primaryDoc.module_number, primaryDoc.topic).map(e => ({
      title: e.title,
      content: e.content,
      keywords: e.keywords,
    }));

    const keywords = rawText.substring(0, 500).split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    let webResearch = '';
    try {
      webResearch = await researchTopic(keywords);
    } catch {}

    const generated = await provider.generateCompendiumEntries(rawText, primaryDoc.module_number, primaryDoc.topic, existingEntries, webResearch);

    const allDocIds = docIds.join(',');
    const upsertedIds: string[] = [];
    for (const entry of generated) {
      const id = upsertCompendiumEntry({
        id: '',
        module_number: primaryDoc.module_number,
        topic: primaryDoc.topic,
        title: entry.title,
        content: entry.content,
        keywords: (entry.keywords || []).join(','),
        interactive_examples: JSON.stringify(entry.interactive_examples || []),
        source_doc_ids: allDocIds,
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