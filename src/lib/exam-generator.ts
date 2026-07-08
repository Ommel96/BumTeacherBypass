import { getExam, finishExam, failExam, markGenerating, listExams, sanitizeExamData } from './exam-store';
import { getLernziele } from './lernziele-store';
import { listDocumentsByCategory, getPagesByDocument } from './document-store';
import { listCompendiumEntries } from './compendium-store';
import { AIProvider } from './ai-provider';
import { getProviderConfigForRole } from './providers-store';
import { getSettings } from './settings-store';

/**
 * Generate (or re-generate) an exam in the background. Reads goal ids/texts
 * from the exam row, gathers module context, calls the AI, and writes the
 * result — or a readable error — back onto the row.
 */
export async function runExamGeneration(examId: string): Promise<void> {
  const exam = getExam(examId);
  if (!exam) return;
  markGenerating(examId);

  try {
    let goalIds: string[] = [];
    let goalTexts: string[] = [];
    try { goalIds = JSON.parse(exam.goal_ids); } catch {}
    try { goalTexts = JSON.parse(exam.goal_texts); } catch {}
    const goals = [...getLernziele(goalIds).map(g => g.goal), ...goalTexts];

    // Context: excerpts from the module's documents + compendium
    const docs = listDocumentsByCategory(undefined, undefined, exam.module_number, undefined);
    const excerpts: string[] = [];
    for (const doc of docs.slice(0, 6)) {
      for (const page of getPagesByDocument(doc.id).slice(0, 2)) {
        if (page.raw_text?.trim()) excerpts.push(`[${doc.filename}] ${page.raw_text.substring(0, 1200)}`);
      }
    }
    for (const entry of listCompendiumEntries(exam.module_number).slice(0, 4)) {
      excerpts.push(`[Kompendium: ${entry.title}] ${entry.content.substring(0, 800)}`);
    }

    if (goals.length === 0 && excerpts.length === 0) {
      failExam(examId, 'Dieses Modul hat weder Lernziele noch Unterlagen — bitte zuerst Lernziele hinzufügen oder Dokumente hochladen.');
      return;
    }

    const settings = getSettings();
    const provider = new AIProvider(
      getProviderConfigForRole('default'),
      settings.enrichmentProviderId ? getProviderConfigForRole('enrichment') : undefined,
      settings.reviewerProviderId ? getProviderConfigForRole('reviewer') : undefined,
    );

    const existingTitles = listExams(exam.module_number)
      .filter(e => e.id !== examId && e.status === 'ready')
      .map(e => e.title)
      .slice(0, 8);

    const raw = await provider.generateExam(goals, exam.module_number, excerpts.join('\n\n'), existingTitles);
    const examData = sanitizeExamData(raw);
    if (!examData) {
      failExam(examId, 'Die KI hat keine gültige Prüfung erzeugt — bitte erneut versuchen.');
      return;
    }
    finishExam(examId, examData.title, examData);
    console.log(`Exam generated: "${examData.title}" (${examData.questions.length} questions) for module ${exam.module_number}`);
  } catch (error) {
    console.error('Exam generation error:', error);
    failExam(examId, error instanceof Error ? error.message : 'Generierung fehlgeschlagen');
  }
}
