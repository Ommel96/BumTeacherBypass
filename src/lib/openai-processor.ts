import { v4 as uuidv4 } from 'uuid';
import { insertPage, updateDocumentStatus, updateProcessingStep } from './document-store';
import { AIProvider, type ProviderConfig } from './ai-provider';
import { getResolvedProviderConfig, getSettings } from './settings-store';
import { getProviderConfigForRole } from './providers-store';
import type { WorksheetData, WorksheetField, WorksheetSection, WorksheetCheckGroup, WorksheetHint } from './worksheet-schema';
import { validateWorksheetData, normalizeWorksheetData } from './worksheet-schema';
import { listCompendiumEntries } from './compendium-store';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function mergeTopLevelIntoSections(raw: Record<string, unknown>): WorksheetData {
  const data = raw as unknown as WorksheetData;
  const sections = data.sections || [];

  // Merge top-level checkGroups into sections by matching fieldId
  const topLevelCheckGroups = raw.checkGroups as WorksheetCheckGroup[] | undefined;
  if (topLevelCheckGroups && Array.isArray(topLevelCheckGroups) && topLevelCheckGroups.length > 0) {
    console.log(`Found ${topLevelCheckGroups.length} top-level checkGroups to merge into sections`);
    for (const cg of topLevelCheckGroups) {
      if (!cg.checks) continue;
      for (const check of cg.checks) {
        // Find the section that contains this field
        const sectionIdx = sections.findIndex(s => s.fields?.some(f => f.id === check.fieldId));
        if (sectionIdx >= 0) {
          const section = sections[sectionIdx] as WorksheetSection & { checkGroups?: WorksheetCheckGroup[] };
          if (!section.checkGroups) section.checkGroups = [];
          // Check if a checkGroup already covers this field
          const existingCg = section.checkGroups.find(existing =>
            existing.checks.some(c => c.fieldId === check.fieldId)
          );
          if (existingCg) {
            // Replace the existing check's expected if it was empty
            const existingCheck = existingCg.checks.find(c => c.fieldId === check.fieldId);
            if (existingCheck && (!existingCheck.expected || existingCheck.expected.trim() === '')) {
              existingCheck.expected = check.expected;
              if (check.hint) existingCheck.hint = check.hint;
            }
          } else {
            section.checkGroups.push(cg);
          }
        }
      }
    }
    // Remove from top level
    delete (data as unknown as Record<string, unknown>).checkGroups;
  }

  // Merge top-level hints into sections (distribute to interactive/section sections)
  const topLevelHints = raw.hints as WorksheetHint[] | undefined;
  if (topLevelHints && Array.isArray(topLevelHints) && topLevelHints.length > 0) {
    console.log(`Found ${topLevelHints.length} top-level hints to merge into sections`);
    for (const hint of topLevelHints) {
      // Try to match by hint content keywords to section title/content
      let bestSectionIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        const text = `${s.title || ''} ${s.content || ''}`.toLowerCase();
        const score = (hint.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 3 && text.includes(w)).length;
        if (score > bestScore) { bestScore = score; bestSectionIdx = i; }
      }
      if (bestSectionIdx >= 0) {
        const section = sections[bestSectionIdx] as WorksheetSection & { hints?: WorksheetHint[] };
        if (!section.hints) section.hints = [];
        if (!section.hints.some(h => h.id === hint.id || h.content === hint.content)) {
          section.hints.push(hint);
        }
      }
    }
    delete (data as unknown as Record<string, unknown>).hints;
  }

  return { ...data, sections: sections as WorksheetSection[] };
}

function ensureCheckGroups(data: WorksheetData): WorksheetData {
  let cgCounter = 0;
  let checkCounter = 0;
  const sections = data.sections.map(section => {
    if ((section.type !== 'section' && section.type !== 'interactive') || !section.fields || section.fields.length === 0) return section;

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
  providerConfig?: ProviderConfig,
  enrichmentOverride?: ProviderConfig,
  compendiumEntries?: Array<{ id: string; title: string; keywords: string }>,
  reviewerOverride?: ProviderConfig,
  timings?: Record<string, number>,
  onTimingsUpdate?: (timings: Record<string, number>) => void
): Promise<void> {
  const settings = getSettings();
  const structureConfig = providerConfig || getProviderConfigForRole('default');
  const enrichmentConfig = enrichmentOverride
    || (settings.enrichmentProviderId ? getProviderConfigForRole('enrichment') : undefined);
  const reviewerConfig = reviewerOverride
    || (settings.reviewerProviderId ? getProviderConfigForRole('reviewer') : undefined);

  if (!structureConfig.apiKey && structureConfig.provider !== 'ollama' && structureConfig.provider !== 'openai-compatible') {
    await updateDocumentStatus(documentId, 'error');
    throw new Error('API key required. Configure a provider in Settings.');
  }

  const effectiveReviewerConfig = settings.enableReview ? reviewerConfig : undefined;
  const provider = new AIProvider(structureConfig, enrichmentConfig, effectiveReviewerConfig);
  await updateDocumentStatus(documentId, 'processing');
  const passTimings: Record<string, number> = { pass1: 0, pass2: 0, pass3: 0 };

  try {
    for (let i = 0; i < pages.length; i++) {
      const rawText = pages[i];

      try {
        let currentStep: string | null = null;
        let stepStartTime = Date.now();
        const result = await provider.processPage(rawText, i + 1, pages.length, compendiumEntries, (step) => {
          const now = Date.now();
          if (currentStep && (currentStep === 'pass1' || currentStep === 'pass2' || currentStep === 'pass3')) {
            const elapsed = now - stepStartTime;
            passTimings[currentStep] = (passTimings[currentStep] || 0) + elapsed;
          }
          currentStep = step;
          stepStartTime = now;
          if (timings) {
            timings.pass1 = passTimings.pass1;
            timings.pass2 = passTimings.pass2;
            timings.pass3 = passTimings.pass3;
            onTimingsUpdate?.(timings);
          }
          updateProcessingStep(documentId, `${step}_page${i + 1}`);
        });

        if (currentStep && (currentStep === 'pass1' || currentStep === 'pass2' || currentStep === 'pass3')) {
          passTimings[currentStep] = (passTimings[currentStep] || 0) + (Date.now() - stepStartTime);
        }

        let worksheetData: WorksheetData | null = null;
        const raw = result as unknown as Record<string, unknown>;
        if (raw.title && Array.isArray(raw.sections)) {
          // Merge any top-level checkGroups/hints into sections before normalizing
          const merged = mergeTopLevelIntoSections(raw);
          const normalized = normalizeWorksheetData(merged);
          const validation = validateWorksheetData(normalized);
          const sectionTypes = normalized.sections.map((s: WorksheetSection) => s.type);
          const checkGroupCounts = normalized.sections.map((s: WorksheetSection) => (s as WorksheetSection & { checkGroups?: unknown[] }).checkGroups?.length || 0);
          const interactiveCount = normalized.sections.filter((s: WorksheetSection) => s.type === 'interactive').length;
          if (validation.valid) {
            worksheetData = ensureCheckGroups(normalized);
            const emptyExpected = (worksheetData.sections as WorksheetSection[]).flatMap((s: WorksheetSection) =>
              (s.checkGroups || []).flatMap(cg => cg.checks.filter(c => !c.expected || c.expected.trim() === ''))
            );
            if (emptyExpected.length > 0) {
              console.warn(`Page ${i + 1}: WARNING — ${emptyExpected.length} checkGroups have empty expected values. Reviewer may not have run or failed.`);
            }
            console.log(`Page ${i + 1}: Successfully generated worksheet with ${normalized.sections.length} sections (types: ${sectionTypes.join(', ')}, checkGroups per section: ${checkGroupCounts.join(', ')}, interactive: ${interactiveCount})`);
          } else {
            console.warn(`Page ${i + 1}: AI response had title/sections but failed validation:`, validation.errors);
            worksheetData = ensureCheckGroups(normalized);
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
    updateProcessingStep(documentId, 'done');
  } catch (error) {
    console.error('Error processing document:', error);
    await updateDocumentStatus(documentId, 'error');
    updateProcessingStep(documentId, 'error');
    throw error;
  }
}

export async function regeneratePage(
  rawText: string,
  pageNumber: number,
  totalPages: number,
  providerConfig?: ProviderConfig,
  enrichmentOverride?: ProviderConfig,
  compendiumEntries?: Array<{ id: string; title: string; keywords: string }>,
  reviewerOverride?: ProviderConfig,
  timings?: Record<string, number>,
  onTimingsUpdate?: (timings: Record<string, number>) => void
): Promise<{ title: string; content: string; worksheet_data: string | null }> {
  const settings = getSettings();
  const structureConfig = providerConfig || getProviderConfigForRole('default');
  const enrichmentConfig = enrichmentOverride
    || (settings.enrichmentProviderId ? getProviderConfigForRole('enrichment') : undefined);
  const reviewerConfig = reviewerOverride
    || (settings.reviewerProviderId ? getProviderConfigForRole('reviewer') : undefined);
  const effectiveReviewerConfig = settings.enableReview ? reviewerConfig : undefined;
  const provider = new AIProvider(structureConfig, enrichmentConfig, effectiveReviewerConfig);
  const passTimings: Record<string, number> = { pass1: 0, pass2: 0, pass3: 0 };

  let currentStep: string | null = null;
  let stepStartTime = Date.now();
  const result = await provider.processPage(rawText, pageNumber, totalPages, compendiumEntries, (step) => {
    const now = Date.now();
    if (currentStep && (currentStep === 'pass1' || currentStep === 'pass2' || currentStep === 'pass3')) {
      const elapsed = now - stepStartTime;
      passTimings[currentStep] = (passTimings[currentStep] || 0) + elapsed;
    }
    currentStep = step;
    stepStartTime = now;
    if (timings) {
      timings.pass1 = passTimings.pass1;
      timings.pass2 = passTimings.pass2;
      timings.pass3 = passTimings.pass3;
      onTimingsUpdate?.(timings);
    }
  });

  if (currentStep && (currentStep === 'pass1' || currentStep === 'pass2' || currentStep === 'pass3')) {
    passTimings[currentStep] = (passTimings[currentStep] || 0) + (Date.now() - stepStartTime);
  }
  if (timings) {
    timings.pass1 = passTimings.pass1;
    timings.pass2 = passTimings.pass2;
    timings.pass3 = passTimings.pass3;
  }

  let worksheetData: WorksheetData | null = null;
  const raw = result as unknown as Record<string, unknown>;
  if (raw.title && Array.isArray(raw.sections)) {
    const merged = mergeTopLevelIntoSections(raw);
    const normalized = normalizeWorksheetData(merged);
    const validation = validateWorksheetData(normalized);
    if (validation.valid) {
      worksheetData = ensureCheckGroups(normalized);
    } else {
      console.warn('Regenerate: AI response failed validation:', validation.errors);
      worksheetData = ensureCheckGroups(normalized);
    }
  }

  return {
    title: worksheetData?.title || result.title || `Page ${pageNumber}`,
    content: result.content || (worksheetData ? '' : `<p>${escapeHtml(rawText)}</p>`),
    worksheet_data: worksheetData ? JSON.stringify(worksheetData) : null,
  };
}