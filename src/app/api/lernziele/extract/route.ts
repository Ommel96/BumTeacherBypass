export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { extractTextFromPdf, extractTextFromDocx, getFileExtension } from '@/lib/parser';
import { AIProvider } from '@/lib/ai-provider';
import { getProviderConfigForRole } from '@/lib/providers-store';

// Upload a PDF/Word/Text file containing Lernziele → returns extracted goal
// suggestions (the client reviews them before saving via POST /api/lernziele).
export async function POST(request: NextRequest) {
  let tmpPath: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Keine Datei erhalten' }, { status: 400 });

    const ext = getFileExtension(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    let rawText = '';

    if (ext === '.txt' || ext === '.md') {
      rawText = buffer.toString('utf-8');
    } else {
      const tmpDir = path.join(os.tmpdir(), 'btb-lernziele');
      await mkdir(tmpDir, { recursive: true });
      tmpPath = path.join(tmpDir, `${uuidv4()}${ext}`);
      await writeFile(tmpPath, buffer);
      if (ext === '.pdf') {
        rawText = (await extractTextFromPdf(tmpPath)).join('\n');
      } else if (ext === '.docx' || ext === '.doc') {
        rawText = (await extractTextFromDocx(tmpPath)).join('\n');
      } else {
        return NextResponse.json({ error: 'Nur PDF, Word oder Textdateien' }, { status: 400 });
      }
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Kein Text in der Datei gefunden' }, { status: 400 });
    }

    const provider = new AIProvider(getProviderConfigForRole('lightweight'));
    const goals = await provider.extractLernziele(rawText);
    if (goals.length === 0) {
      return NextResponse.json({ error: 'Keine Lernziele in der Datei erkannt' }, { status: 422 });
    }
    return NextResponse.json({ goals });
  } catch (error) {
    console.error('Extract lernziele error:', error);
    const msg = error instanceof Error ? error.message : 'Extraktion fehlgeschlagen';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tmpPath) unlink(tmpPath).catch(() => {});
  }
}
