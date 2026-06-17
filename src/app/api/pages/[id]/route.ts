export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, updatePageContent, updatePageTitle, updatePageWorksheetData, getPagesByDocument } from '@/lib/document-store';
import { regeneratePage } from '@/lib/openai-processor';
import { getProviderConfigForRole, getProviderConfig } from '@/lib/providers-store';

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

    const providerConfig = getProviderConfigForRole('default');
    const allPages = getPagesByDocument(page.document_id);
    const result = await regeneratePage(page.raw_text, page.page_number, allPages.length, providerConfig);

    updatePageContent(params.id, result.content);
    updatePageTitle(params.id, result.title);
    updatePageWorksheetData(params.id, result.worksheet_data);

    return NextResponse.json({
      page: {
        ...page,
        content: result.content,
        title: result.title,
        worksheet_data: result.worksheet_data,
      },
    });
  } catch (error) {
    console.error('Regenerate page error:', error);
    return NextResponse.json({ error: 'Failed to regenerate page' }, { status: 500 });
  }
}