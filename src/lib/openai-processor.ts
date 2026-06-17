import { v4 as uuidv4 } from 'uuid';
import { insertPage, updateDocumentStatus } from './document-store';
import { AIProvider, type ProviderConfig } from './ai-provider';
import { getResolvedProviderConfig } from './settings-store';
import type { WorksheetData, WorksheetField, WorksheetSection, WorksheetCheckGroup } from './worksheet-schema';
import { validateWorksheetData } from './worksheet-schema';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function ensureCheckGroups(data: WorksheetData): WorksheetData {
  let cgCounter = 0;
  let checkCounter = 0;
  const sections = data.sections.map(section => {
    if (section.type !== 'section' || !section.fields || section.fields.length === 0) return section;

    const textFields = section.fields.filter((f: WorksheetField) => f.type !== 'textarea');
    if (textFields.length === 0) return section;

    const existingChecks = (section.checkGroups || []).flatMap((cg: WorksheetCheckGroup) => cg.checks);
    const coveredFieldIds = new Set(existingChecks.map(c => c.fieldId));
    const orphanedFields = textFields.filter((f: WorksheetField) => !coveredFieldIds.has(f.id));

    if (orphanedFields.length === 0) return section;

    const cgId = `auto-cg-${++cgCounter}`;
    const fbId = `auto-fb-${cgCounter}`;
    const newChecks = orphanedFields.map(f => ({
      fieldId: f.id,
      expected: '',
      hint: 'Prüfe dein Ergebnis sorgfältig.',
      opts: { normalize: true },
    }));
    orphanedFields.forEach(() => checkCounter++);

    return {
      ...section,
      checkGroups: [...(section.checkGroups || []), {
        id: cgId,
        checks: newChecks,
        feedbackId: fbId,
        label: 'Prüfen',
      }],
    };
  });

  if (cgCounter > 0) {
    console.log(`Auto-created ${cgCounter} checkGroups for ${checkCounter} orphaned text fields`);
  }

  return { ...data, sections: sections as WorksheetSection[] };
}

export async function processDocumentPages(
  documentId: string,
  pages: string[],
  providerConfig?: ProviderConfig
): Promise<void> {
  const config = providerConfig || getResolvedProviderConfig();

  if (!config.apiKey && config.provider !== 'ollama' && config.provider !== 'openai-compatible') {
    await updateDocumentStatus(documentId, 'error');
    throw new Error('API key required. Configure a provider in Settings.');
  }

  const provider = new AIProvider(config);
  await updateDocumentStatus(documentId, 'processing');

  try {
    for (let i = 0; i < pages.length; i++) {
      const rawText = pages[i];

      try {
        const result = await provider.processPage(rawText, i + 1, pages.length);

        let worksheetData: WorksheetData | null = null;
        const raw = result as unknown as Record<string, unknown>;
        if (raw.title && Array.isArray(raw.sections)) {
          const validation = validateWorksheetData(raw);
          if (validation.valid) {
            worksheetData = ensureCheckGroups(raw as unknown as WorksheetData);
            console.log(`Page ${i + 1}: Successfully generated worksheet with ${(raw.sections as unknown[]).length} sections`);
          } else {
            console.warn(`Page ${i + 1}: AI response had title/sections but failed validation:`, validation.errors);
          }
        } else {
          console.warn(`Page ${i + 1}: AI response missing title or sections. Got keys: ${Object.keys(raw).join(', ')}`);
        }

        const content = result.content || (worksheetData ? '' : `<p>${escapeHtml(rawText)}</p>`);

        insertPage({
          id: uuidv4(),
          document_id: documentId,
          page_number: i + 1,
          title: worksheetData?.title || result.title || `Page ${i + 1}`,
          content,
          raw_text: rawText,
          worksheet_data: worksheetData ? JSON.stringify(worksheetData) : null,
        });
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
        insertPage({
          id: uuidv4(),
          document_id: documentId,
          page_number: i + 1,
          title: `Page ${i + 1}`,
          content: `<p>${escapeHtml(rawText)}</p>`,
          raw_text: rawText,
          worksheet_data: null,
        });
      }
    }

    await updateDocumentStatus(documentId, 'processed');
  } catch (error) {
    console.error('Error processing document:', error);
    await updateDocumentStatus(documentId, 'error');
    throw error;
  }
}

export async function regeneratePage(
  rawText: string,
  pageNumber: number,
  totalPages: number,
  providerConfig?: ProviderConfig
): Promise<{ title: string; content: string; worksheet_data: string | null }> {
  const config = providerConfig || getResolvedProviderConfig();
  const provider = new AIProvider(config);
  const result = await provider.processPage(rawText, pageNumber, totalPages);

  let worksheetData: WorksheetData | null = null;
  const raw = result as unknown as Record<string, unknown>;
  if (raw.title && Array.isArray(raw.sections)) {
    const validation = validateWorksheetData(raw);
    if (validation.valid) {
      worksheetData = raw as unknown as WorksheetData;
    } else {
      console.warn('Regenerate: AI response failed validation:', validation.errors);
    }
  }

  return {
    title: worksheetData?.title || result.title || `Page ${pageNumber}`,
    content: result.content || (worksheetData ? '' : `<p>${escapeHtml(rawText)}</p>`),
    worksheet_data: worksheetData ? JSON.stringify(worksheetData) : null,
  };
}