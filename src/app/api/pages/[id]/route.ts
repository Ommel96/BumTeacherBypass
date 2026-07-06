export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, updatePageContent, updatePageTitle, updatePageWorksheetData, getPagesByDocument, getDocument, updateDocumentStatus, updateProcessingStep, updateProcessingTimings } from '@/lib/document-store';
import { regeneratePage } from '@/lib/openai-processor';
import { getProviderConfigForRole, getProviderConfig } from '@/lib/providers-store';
import { listCompendiumEntries } from '@/lib/compendium-store';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const page = getPage(params.id);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }
    return NextResponse.json({ page });
  } catch (error) {
    console.error('Get page error:', error);
    return NextResponse.json({ error: 'Failed to get page' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { content, worksheet_data } = body;

    const page = getPage(params.id);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (typeof content === 'string') {
      updatePageContent(params.id, content);
    }
    if (worksheet_data !== undefined) {
      updatePageWorksheetData(params.id, worksheet_data);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Update page error:', error);
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const page = getPage(params.id);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { enrichmentModel, reviewerModel } = body as { enrichmentModel?: string; reviewerModel?: string };

    let providerConfig = getProviderConfigForRole('default');
    if (body.providerModel && typeof body.providerModel === 'string') {
      const [pid, modelOverride] = body.providerModel.includes(':') ? body.providerModel.split(':') : [body.providerModel, undefined];
      providerConfig = getProviderConfig(pid);
      if (modelOverride) providerConfig.model = modelOverride;
    }

    let enrichmentConfig: import('@/lib/ai-provider').ProviderConfig | undefined;
    if (enrichmentModel) {
      const [pid, modelOverride] = enrichmentModel.includes(':') ? enrichmentModel.split(':') : [enrichmentModel, undefined];
      enrichmentConfig = getProviderConfig(pid);
      if (modelOverride) enrichmentConfig.model = modelOverride;
    } else {
      const settings = await import('@/lib/settings-store').then(m => m.getSettings());
      if (settings.enrichmentProviderId) {
        enrichmentConfig = getProviderConfigForRole('enrichment');
      }
    }

    let reviewerConfig: import('@/lib/ai-provider').ProviderConfig | undefined;
    if (reviewerModel) {
      const [pid, modelOverride] = reviewerModel.includes(':') ? reviewerModel.split(':') : [reviewerModel, undefined];
      reviewerConfig = getProviderConfig(pid);
      if (modelOverride) reviewerConfig.model = modelOverride;
    } else {
      const settings = await import('@/lib/settings-store').then(m => m.getSettings());
      if (settings.reviewerProviderId) {
        reviewerConfig = getProviderConfigForRole('reviewer');
      }
    }

    const allPages = getPagesByDocument(page.document_id);

    let compendiumEntries: Array<{ id: string; title: string; keywords: string; content?: string }> = [];
    try {
      const doc = getDocument(page.document_id);
      if (doc?.module_number || doc?.topic) {
        const entries = listCompendiumEntries(doc.module_number, doc.topic);
        compendiumEntries = entries.map(e => ({ id: e.id, title: e.title, keywords: e.keywords, content: e.content }));
      }
    } catch {}

    updateDocumentStatus(page.document_id, 'processing');
    updateProcessingStep(page.document_id, 'pass1');
    updateProcessingTimings(page.document_id, {});

    const timings: Record<string, number> = {};

    (async () => {
      try {
        const result = await regeneratePage(page.raw_text, page.page_number, allPages.length, providerConfig, enrichmentConfig, compendiumEntries, reviewerConfig, timings, (updated) => updateProcessingTimings(page.document_id, updated));

        updatePageContent(params.id, result.content);
        updatePageTitle(params.id, result.title);
        updatePageWorksheetData(params.id, result.worksheet_data);

        timings.total = Object.values(timings).reduce((a, b) => a + b, 0);
        updateProcessingTimings(page.document_id, timings);
        updateDocumentStatus(page.document_id, 'processed');
        updateProcessingStep(page.document_id, 'done');
      } catch (err) {
        console.error('Regenerate page error:', err);
        updateDocumentStatus(page.document_id, 'error');
        updateProcessingStep(page.document_id, 'error');
      }
    })();

    return NextResponse.json({ ok: true, status: 'processing' });
  } catch (error) {
    console.error('Regenerate route error:', error);
    return NextResponse.json({ error: 'Failed to regenerate page' }, { status: 500 });
  }
}