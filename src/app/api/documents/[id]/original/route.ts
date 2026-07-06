export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/document-store';
import { DATA_DIR } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = getDocument(params.id);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const files = fs.readdirSync(UPLOAD_DIR);
    const match = files.find(f => f.startsWith(params.id));

    if (!match) {
      return NextResponse.json({ error: 'Original file not found' }, { status: 404 });
    }

    const filePath = path.join(UPLOAD_DIR, match);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(match).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
    };

    const contentType = mimeTypes[ext] || doc.mime_type || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${doc.filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Get original file error:', error);
    return NextResponse.json({ error: 'Failed to get original file' }, { status: 500 });
  }
}