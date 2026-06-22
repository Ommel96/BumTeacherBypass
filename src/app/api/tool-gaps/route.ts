export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getToolGaps } from '@/lib/tool-gaps-store';

export async function GET() {
  try {
    const gaps = getToolGaps();
    return NextResponse.json({ gaps });
  } catch (error) {
    console.error('Tool gaps read error:', error);
    return NextResponse.json({ gaps: [] });
  }
}

export async function DELETE() {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'data', 'tool-gaps.json');
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear tool gaps' }, { status: 500 });
  }
}