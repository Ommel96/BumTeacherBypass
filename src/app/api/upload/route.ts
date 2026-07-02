export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile, updateDocumentStatus, updateDocumentCategory, updateProcessingStep, updateProcessingTimings, listDocuments, getDocument, getPagesByDocument, slugify } from '@/lib/document-store';
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
    const providerModelParam = (formData.get('providerModel') as string) || '';
    const enrichmentModelParam = (formData.get('enrichmentModel') as string) || '';
    const reviewerModelParam = (formData.get('reviewerModel') as string) || '';

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
    let providerConfig: import('@/lib/ai-provider').ProviderConfig;
    if (providerModelParam) {
      const [pid, modelOverride] = providerModelParam.includes(':') ? providerModelParam.split(':') : [providerModelParam, undefined];
      providerConfig = getProviderConfig(pid);
      if (modelOverride) providerConfig.model = modelOverride;
    } else {
      providerConfig = getProviderConfigForRole('default');
    }

    let enrichmentConfig: import('@/lib/ai-provider').ProviderConfig | undefined;
    if (enrichmentModelParam) {
      const [pid, modelOverride] = enrichmentModelParam.includes(':') ? enrichmentModelParam.split(':') : [enrichmentModelParam, undefined];
      enrichmentConfig = getProviderConfig(pid);
      if (modelOverride) enrichmentConfig.model = modelOverride;
    }

    let reviewerConfig: import('@/lib/ai-provider').ProviderConfig | undefined;
    if (reviewerModelParam) {
      const [pid, modelOverride] = reviewerModelParam.includes(':') ? reviewerModelParam.split(':') : [reviewerModelParam, undefined];
      reviewerConfig = getProviderConfig(pid);
      if (modelOverride) reviewerConfig.model = modelOverride;
    }

    if (!providerConfig.apiKey && providerConfig.provider !== 'ollama' && providerConfig.provider !== 'openai-compatible') {
      return NextResponse.json(
        { error: 'API key required. Configure a provider in Settings.' },
        { status: 400 }
      );
    }

    const { id, filePath } = await saveUploadedFile(file, { year, semester, module_number: moduleNumber, topic });

    // Mark as processing immediately so the frontend shows the loading tracker
    updateDocumentStatus(id, 'processing');
    updateProcessingStep(id, 'extracting');

    const processingPromise = (async () => {
      const timings: Record<string, number> = {};
      const startTime = Date.now();
      let textPages: string[];
      try {
        updateProcessingStep(id, 'extracting');
        const t0 = Date.now();
        if (ext === '.pdf' || file.type === 'application/pdf') {
          textPages = await extractTextFromPdf(filePath);
        } else {
          textPages = await extractTextFromDocx(filePath);
        }
        timings.extracting = Date.now() - t0;
        updateProcessingTimings(id, timings);

        const rawText = textPages.join('\n');

        if (settings.autoClassify) {
          updateProcessingStep(id, 'classifying');
          const t1 = Date.now();
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
          timings.classifying = Date.now() - t1;
          updateProcessingTimings(id, timings);
        } else if (year || moduleNumber || topic) {
          updateDocumentCategory(id, year, semester, moduleNumber, topic);
        }

        if (textPages.length > 0 && !(textPages.length === 1 && textPages[0].trim() === '')) {
          const doc = getDocument(id);
          let compendiumEntries: Array<{ id: string; title: string; keywords: string }> = [];

          if (doc?.module_number || doc?.topic) {
            updateProcessingStep(id, 'compendium');
            const t2 = Date.now();
            try {
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
                  interactive_examples: JSON.stringify(entry.interactive_examples || []),
                  source_doc_ids: id,
                });
              }

              const allEntries = listCompendiumEntries(doc.module_number, doc.topic);
              compendiumEntries = allEntries.map(e => ({ id: e.id, title: e.title, keywords: e.keywords }));
              console.log(`Compendium: generated ${generated.length} entries, ${compendiumEntries.length} total available for enrichment`);
            } catch (e) {
              console.error('Compendium generation error:', e);
            }
            timings.compendium = Date.now() - t2;
            updateProcessingTimings(id, timings);
          } else {
            console.log(`Compendium: skipped — no module_number or topic (module=${doc?.module_number}, topic=${doc?.topic})`);
          }

          await processDocumentPages(id, textPages, providerConfig, enrichmentConfig, compendiumEntries, reviewerConfig, timings, (updated) => updateProcessingTimings(id, updated));
        } else {
          updateDocumentStatus(id, 'processed');
        }
        timings.total = Date.now() - startTime;
        updateProcessingTimings(id, timings);
      } catch (err) {
        console.error('Processing error:', err);
        timings.total = Date.now() - startTime;
        updateProcessingTimings(id, timings);
        updateDocumentStatus(id, 'error');
        updateProcessingStep(id, 'error');
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