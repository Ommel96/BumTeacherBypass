import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './db';

const TOOL_GAPS_FILE = path.join(DATA_DIR, 'tool-gaps.json');

export interface ToolGap {
  name: string;
  reason: string;
  contentExample: string;
  suggestedProps: string;
  documentId?: string;
  detectedAt: string;
}

export function saveToolGaps(gaps: ToolGap[]): void {
  const existing = getToolGaps();
  const merged = [...existing, ...gaps];
  const dir = path.dirname(TOOL_GAPS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOOL_GAPS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
}

export function getToolGaps(): ToolGap[] {
  try {
    if (!fs.existsSync(TOOL_GAPS_FILE)) return [];
    const data = fs.readFileSync(TOOL_GAPS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}