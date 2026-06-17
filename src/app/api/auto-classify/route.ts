export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings-store';
import { getProviderConfigForRole } from '@/lib/providers-store';
import { listDocuments, updateDocumentCategory, slugify } from '@/lib/document-store';
import { AIProvider } from '@/lib/ai-provider';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { autoClassify } = body;

    if (typeof autoClassify === 'boolean') {
      saveSettings({ autoClassify });
    }

    const settings = getSettings();
    if (!settings.autoClassify) {
      return NextResponse.json({ ok: true, autoClassify: settings.autoClassify, classified: 0 });
    }

    const allDocs = listDocuments();
    const uncategorized = allDocs.filter(d => !d.module_number && !d.topic);

    if (uncategorized.length === 0) {
      return NextResponse.json({ ok: true, autoClassify: settings.autoClassify, classified: 0, message: 'No uncategorized documents.' });
    }

    const classifyConfig = getProviderConfigForRole('lightweight');
    const classifier = new AIProvider(classifyConfig);
    const knownModules = Array.from(new Set(allDocs.map(d => d.module_number).filter(Boolean)));

    let classified = 0;
    for (const doc of uncategorized.slice(0, 10)) {
      try {
        const { getPagesByDocument } = await import('@/lib/document-store');
        const pages = getPagesByDocument(doc.id);
        const rawText = pages.map(p => p.raw_text || p.content).join('\n');

        if (!rawText.trim()) continue;

        const classification = await classifier.classifyDocument(rawText, knownModules);
        let autoYear = doc.year;
        let autoSemester = doc.semester;
        let autoModule = slugify(classification.module_number || '');
        let autoTopic = slugify(classification.topic || '');

        if (autoModule) {
          const matchingDocs = allDocs.filter(d => d.module_number === autoModule);
          if (matchingDocs.length > 0 && !autoYear) {
            autoYear = matchingDocs[0].year;
            autoSemester = autoSemester || matchingDocs[0].semester;
          }
        }

        if (autoModule || autoTopic) {
          updateDocumentCategory(doc.id, autoYear, autoSemester, autoModule, autoTopic);
          classified++;
        }
      } catch (e) {
        console.error(`Classify error for doc ${doc.id}:`, e);
      }
    }

    return NextResponse.json({ ok: true, autoClassify: settings.autoClassify, classified });
  } catch (error) {
    console.error('Auto-classify error:', error);
    return NextResponse.json({ error: 'Failed to auto-classify' }, { status: 500 });
  }
}