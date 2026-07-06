import fs from 'fs/promises';
import path from 'path';

/**
 * Extract page images from a PDF file using pdfjs-dist + @napi-rs/canvas.
 * Returns base64-encoded PNG images for each page (or null if rendering fails).
 *
 * This is used to provide vision content to AI models that support it,
 * for PDFs that contain images, diagrams, or other non-text content.
 */

export interface PdfPageImage {
  pageNumber: number;
  base64: string;
  mediaType: 'image/png';
}

/**
 * Check if a PDF page has little extractable text — a heuristic for
 * "this page is probably image-based and would benefit from vision".
 */
export function pageNeedsVision(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 50) return true;
  // Very few words relative to a typical text page
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length < 20;
}

/**
 * Render specific pages of a PDF to PNG images.
 * @param filePath Path to the PDF file
 * @param pageNumbers 1-indexed page numbers to render
 * @param scale Render scale (higher = more detail, larger payload). Default 1.5.
 * @returns Array of rendered page images, or empty array if rendering fails.
 */
export async function renderPdfPages(
  filePath: string,
  pageNumbers: number[],
  scale: number = 1.5,
): Promise<PdfPageImage[]> {
  if (pageNumbers.length === 0) return [];

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('@napi-rs/canvas');

    const dataBuffer = await fs.readFile(filePath);
    const data = new Uint8Array(dataBuffer);

    const loadingTask = pdfjs.getDocument({
      data,
      // Disable worker in Node — use legacy build
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const images: PdfPageImage[] = [];

    for (const pageNum of pageNumbers) {
      if (pageNum < 1 || pageNum > pdf.numPages) continue;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // pdfjs expects a canvas context with specific properties
        // @napi-rs/canvas context is compatible but TypeScript types differ from DOM CanvasRenderingContext2D
        await page.render({
          canvasContext: context as any,
          viewport,
        } as any).promise;

        const pngBuffer = canvas.toBuffer('image/png');
        const base64 = pngBuffer.toString('base64');
        images.push({
          pageNumber: pageNum,
          base64,
          mediaType: 'image/png',
        });

        page.cleanup();
      } catch (err) {
        console.error(`PDF vision: failed to render page ${pageNum}:`, err);
      }
    }

    await (pdf as any).destroy?.();
    return images;
  } catch (err) {
    console.error('PDF vision: failed to init pdfjs:', err);
    return [];
  }
}

/**
 * Render pages that have little text content (likely image-based).
 * Returns base64 PNG images for those pages.
 */
export async function renderImageBasedPages(
  filePath: string,
  pageTexts: string[],
  maxPages: number = 5,
): Promise<Map<number, PdfPageImage>> {
  const pagesToRender: number[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    if (pageNeedsVision(pageTexts[i])) {
      pagesToRender.push(i + 1); // 1-indexed
      if (pagesToRender.length >= maxPages) break;
    }
  }

  if (pagesToRender.length === 0) return new Map();

  console.log(`PDF vision: rendering ${pagesToRender.length} image-based page(s): ${pagesToRender.join(', ')}`);
  const images = await renderPdfPages(filePath, pagesToRender);
  return new Map(images.map(img => [img.pageNumber, img]));
}