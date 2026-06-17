export interface CompendiumRef {
  ref: string;
  label: string;
}

export interface WorksheetField {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  placeholder?: string;
  compendiumRef?: CompendiumRef;
}

export interface WorksheetTableColumn {
  key: string;
  label: string;
  editable: boolean;
  placeholder?: string;
}

export interface WorksheetTable {
  id: string;
  columns: WorksheetTableColumn[];
  rows: Array<Record<string, string>>;
}

export interface WorksheetCheck {
  fieldId: string;
  expected: string;
  hint?: string;
  opts?: { normalize?: boolean; contains?: boolean };
}

export interface WorksheetCheckGroup {
  id: string;
  checks: WorksheetCheck[];
  feedbackId: string;
  label?: string;
}

export interface WorksheetHint {
  id: string;
  label?: string;
  content: string;
}

export interface PixelGridProps {
  width: number;
  height: number;
  solution?: number[];
  labels?: { rows?: string[]; cols?: string[] };
  encodingType?: 'rle' | 'binary' | 'none';
  encodingDirection?: 'row' | 'col';
  fieldId: string;
}

export interface BitVisualizerProps {
  bits: number;
  labels?: string[];
  fieldId: string;
  showDecimal?: boolean;
  showHex?: boolean;
}

export interface TruthTableProps {
  inputs: string[];
  outputLabel: string;
  rows?: Array<Record<string, string>>;
  fieldId: string;
}

export interface EncodingExerciseProps {
  encodingType: 'binary' | 'hex' | 'ascii' | 'rle' | 'morse';
  fromFormat: string;
  toFormat: string;
  examples?: Array<{ input: string; output: string }>;
  exercises?: Array<{ input: string; expected?: string; fieldId: string }>;
  fieldId: string;
}

export type InteractiveComponent = 
  | { type: 'pixelGrid'; props: PixelGridProps }
  | { type: 'bitVisualizer'; props: BitVisualizerProps }
  | { type: 'truthTable'; props: TruthTableProps }
  | { type: 'encodingExercise'; props: EncodingExerciseProps };

export interface WorksheetSection {
  type: 'section' | 'story' | 'info' | 'example' | 'interactive';
  number?: string | number;
  title?: string;
  content: string;
  fields?: WorksheetField[];
  table?: WorksheetTable;
  checkGroups?: WorksheetCheckGroup[];
  resets?: string[];
  hints?: WorksheetHint[];
  compendiumRefs?: CompendiumRef[];
  interactive?: InteractiveComponent;
}

export interface WorksheetData {
  title: string;
  label?: string;
  subtitle?: string;
  sections: WorksheetSection[];
}

export function validateWorksheetData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not an object'] };
  }

  const d = data as Record<string, unknown>;

  if (typeof d.title !== 'string' || !d.title.trim()) {
    errors.push('Missing or empty title');
  }

  if (!Array.isArray(d.sections)) {
    errors.push('Missing or invalid sections array');
    return { valid: false, errors };
  }

  for (let i = 0; i < d.sections.length; i++) {
    const s = d.sections[i] as Record<string, unknown>;
    if (!['section', 'story', 'info', 'example', 'interactive'].includes(s.type as string)) {
      errors.push(`Section ${i}: invalid type "${s.type}"`);
    }
    if (typeof s.content !== 'string') {
      errors.push(`Section ${i}: missing content`);
    }
    if (s.type === 'section' && !s.title) {
      errors.push(`Section ${i}: section type requires title`);
    }
    if (s.type === 'interactive' && !s.interactive) {
      errors.push(`Section ${i}: interactive type requires interactive property`);
    }
    if (s.interactive && typeof s.interactive === 'object' && !['pixelGrid', 'bitVisualizer', 'truthTable', 'encodingExercise'].includes((s.interactive as Record<string, unknown>).type as string)) {
      errors.push(`Section ${i}: invalid interactive type "${(s.interactive as Record<string, unknown>).type}"`);
    }
    if (s.fields && !Array.isArray(s.fields)) {
      errors.push(`Section ${i}: fields must be an array`);
    }
    if (s.checkGroups && !Array.isArray(s.checkGroups)) {
      errors.push(`Section ${i}: checkGroups must be an array`);
    }
  }

  return { valid: errors.length === 0, errors };
}