import fs from 'fs/promises';
import path from 'path';

export async function extractTextFromPdf(
  filePath: string
): Promise<string[]> {
  const pdfParse = (await import('pdf-parse')).default;
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  const fullText = data.text;

  const pages = fullText.split(/\f/).filter((p: string) => p.trim().length > 0);

  if (pages.length === 0 && fullText.trim()) {
    const lines = fullText.split('\n');
    const linesPerPage = Math.max(1, Math.ceil(lines.length / Math.max(1, Math.ceil(lines.length / 40))));
    const chunked: string[] = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      const chunk = lines.slice(i, i + linesPerPage).join('\n');
      if (chunk.trim()) chunked.push(chunk);
    }
    return chunked.length > 0 ? chunked : [fullText];
  }

  return pages.length > 0 ? pages : [fullText];
}

export async function extractTextFromDocx(
  filePath: string
): Promise<string[]> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  const fullText = result.value;

  const paragraphs = fullText
    .split(/\n{2,}/)
    .filter((p: string) => p.trim().length > 0);

  if (paragraphs.length <= 3) {
    return [fullText];
  }

  const pages: string[] = [];
  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / Math.max(1, Math.ceil(paragraphs.length / 8))));

  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunk = paragraphs.slice(i, i + chunkSize).join('\n\n');
    if (chunk.trim()) pages.push(chunk);
  }

  return pages.length > 0 ? pages : [fullText];
}

export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function isSupportedMimeType(mimeType: string): boolean {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ].includes(mimeType);
}

export function isSupportedExtension(ext: string): boolean {
  return ['.pdf', '.docx', '.doc'].includes(ext);
}