export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile, updateDocumentStatus, updateDocumentCategory, listDocuments, getDocument, getPagesByDocument, slugify } from '@/lib/document-store';
import { extractTextFromPdf, extractTextFromDocx, isSupportedExtension, isSupportedMimeType } from '@/lib/parser';
import { processDocumentPages } from '@/lib/openai-processor';
import { getSettings } from '@/lib/settings-store';
import { getProviderConfigForRole, getProviderConfig } from '@/lib/providers-store';
import { AIProvider } from '@/lib/ai-provider';
import { upsertCompendiumEntry, listCompendiumEntries } from '@/lib/compendium-store';
import { researchTopic } from '@/lib/web-research';
import path from 'path';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const year = (formData.get('year') as string) || '';
    const semester = (formData.get('semester') as string) || '';
    const moduleNumber = (formData.get('module_number') as string) || '';
    const topic = (formData.get('topic') as string) || '';
    const providerIdOverride = formData.get('providerId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!isSupportedExtension(ext) && !isSupportedMimeType(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF or Word (.docx) file.' },
        { status: 400 }
      );
    }

    const settings = getSettings();
    const providerConfig = providerIdOverride
      ? getProviderConfig(providerIdOverride)
      : getProviderConfigForRole('default');

    if (!providerConfig.apiKey && providerConfig.provider !== 'ollama' && providerConfig.provider !== 'openai-compatible') {
      return NextResponse.json(
        { error: 'API key required. Configure a provider in Settings.' },
        { status: 400 }
      );
    }

    const { id, filePath } = await saveUploadedFile(file, { year, semester, module_number: moduleNumber, topic });

    const processingPromise = (async () => {
      let textPages: string[];
      try {
        if (ext === '.pdf' || file.type === 'application/pdf') {
          textPages = await extractTextFromPdf(filePath);
        } else {
          textPages = await extractTextFromDocx(filePath);
        }

        const rawText = textPages.join('\n');

        if (settings.autoClassify) {
          try {
            const allDocs = listDocuments();
            const knownModules = Array.from(new Set(allDocs.map(d => d.module_number).filter(Boolean)));
            const classifyConfig = getProviderConfigForRole('lightweight');
            const classifier = new AIProvider(classifyConfig);
            const classification = await classifier.classifyDocument(rawText, knownModules);

            let autoYear = year;
            let autoSemester = semester;
            let autoModule = slugify(moduleNumber || classification.module_number || '');
            let autoTopic = slugify(topic || classification.topic || '');

            if (autoModule) {
              const matchingDocs = allDocs.filter(d => d.module_number === autoModule);
              if (matchingDocs.length > 0 && !autoYear) {
                autoYear = matchingDocs[0].year;
                autoSemester = autoSemester || matchingDocs[0].semester;
              }
            }

            updateDocumentCategory(id, autoYear, autoSemester, autoModule, autoTopic);
          } catch (e) {
            console.error('Auto-categorization error:', e);
          }
        } else if (year || moduleNumber || topic) {
          updateDocumentCategory(id, year, semester, moduleNumber, topic);
        }

        if (textPages.length > 0 && !(textPages.length === 1 && textPages[0].trim() === '')) {
          await processDocumentPages(id, textPages, providerConfig);

          try {
            const doc = getDocument(id);
            if (doc?.module_number || doc?.topic) {
              const pages = getPagesByDocument(id);
              const rawText = pages.map(p => p.raw_text || p.content || '').filter(Boolean).join('\n');
              if (rawText.trim()) {
                const existingEntries = listCompendiumEntries(doc.module_number, doc.topic).map(e => ({
                  title: e.title,
                  content: e.content,
                  keywords: e.keywords,
                }));

                const keywords = rawText.substring(0, 500).split(/\s+/).filter(w => w.length > 4).slice(0, 5);
                let webResearch = '';
                try {
                  webResearch = await researchTopic(keywords);
                } catch (e) {
                  console.error('Web research error:', e);
                }

                const compendiumConfig = getProviderConfigForRole('compendium');
                const compendiumProvider = new AIProvider(compendiumConfig);
                const generated = await compendiumProvider.generateCompendiumEntries(rawText, doc.module_number, doc.topic, existingEntries, webResearch);
                for (const entry of generated) {
                  upsertCompendiumEntry({
                    id: '',
                    module_number: doc.module_number,
                    topic: doc.topic,
                    title: entry.title,
                    content: entry.content,
                    keywords: (entry.keywords || []).join(','),
                    source_doc_ids: id,
                  });
                }
              }
            }
          } catch (e) {
            console.error('Compendium generation error:', e);
          }
        } else {
          updateDocumentStatus(id, 'processed');
        }
      } catch (err) {
        console.error('Processing error:', err);
        updateDocumentStatus(id, 'error');
      }
    })();

    processingPromise.catch((err) => {
      console.error('Background processing error:', err);
    });

    return NextResponse.json({
      id,
      filename: file.name,
      status: 'processing',
      provider: providerConfig.provider,
      model: providerConfig.model,
      message: 'Document uploaded and processing started.',
    }, { status: 202 });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}