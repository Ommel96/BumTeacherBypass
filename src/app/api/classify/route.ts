export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getProviderConfigForRole } from '@/lib/providers-store';
import { listDocuments, updateDocumentCategory, slugify } from '@/lib/document-store';
import { AIProvider } from '@/lib/ai-provider';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const text = formData.get('text') as string | null;

    if (!file && !text) {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
    }

    let rawText = text || '';
    if (file && !rawText) {
      const { extractTextFromPdf, extractTextFromDocx } = await import('@/lib/parser');
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.toLowerCase().split('.').pop() || '';
      const tmpPath = `/tmp/classify-${Date.now()}.${ext}`;
      const fs = await import('fs');
      fs.writeFileSync(tmpPath, buffer);
      try {
        if (ext === 'pdf') {
          rawText = (await extractTextFromPdf(tmpPath)).join('\n');
        } else {
          rawText = (await extractTextFromDocx(tmpPath)).join('\n');
        }
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }

    if (!rawText.trim()) {
      return NextResponse.json({ module_number: '', topic: '', title: '', year: '', semester: '' });
    }

    const classifyConfig = getProviderConfigForRole('lightweight');

    if (!classifyConfig.apiKey && classifyConfig.provider !== 'ollama') {
      return NextResponse.json({ error: 'No API key configured' }, { status: 400 });
    }

    const allDocs = listDocuments();
    const knownModules = Array.from(new Set(allDocs.map(d => d.module_number).filter(Boolean)));

    const classifier = new AIProvider(classifyConfig);
    const classification = await classifier.classifyDocument(rawText.substring(0, 1500), knownModules);

    const normalizedModule = slugify(classification.module_number || '');
    const normalizedTopic = slugify(classification.topic || '');

    let year = '';
    let semester = '';
    if (normalizedModule) {
      const matchingDocs = allDocs.filter(d => d.module_number === normalizedModule);
      if (matchingDocs.length > 0) {
        year = matchingDocs[0].year;
        semester = matchingDocs[0].semester;
      }
    }

    return NextResponse.json({
      module_number: normalizedModule,
      topic: normalizedTopic,
      title: classification.title || '',
      year,
      semester,
    });
  } catch (error) {
    console.error('Classify error:', error);
    return NextResponse.json({ module_number: '', topic: '', title: '', year: '', semester: '' });
  }
}