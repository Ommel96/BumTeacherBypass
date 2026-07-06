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

export interface HuffmanTreeProps {
  fieldId: string;
  initialString?: string;
  frequencyTable?: Record<string, number>;
  solution?: HuffmanTreeNode;
}

export interface HuffmanTreeNode {
  char?: string;
  freq: number;
  left?: HuffmanTreeNode;
  right?: HuffmanTreeNode;
  code?: string;
}

export interface LZ77SimulatorProps {
  fieldId: string;
  inputString: string;
  bufferSize: number;
  lookaheadSize: number;
  solution?: LZ77Triple[];
  stepByStep?: boolean;
  direction?: 'encode' | 'decode';
  decodeInput?: string;
}

export interface LZ77Triple {
  offset: number;
  length: number;
  nextChar: string;
}

export interface CompressionTableProps {
  fieldId: string;
  algorithm: 'lz77' | 'lz78' | 'lzw';
  direction: 'encode' | 'decode';
  inputString: string;
  bufferSize?: number;
  lookaheadSize?: number;
  solution?: CompressionTableRow[];
}

export interface CompressionTableRow {
  step: number;
  buffer?: string;
  lookahead?: string;
  output?: string;
  dictionaryEntry?: string;
  [key: string]: string | number | undefined;
}

export interface XorCalculatorProps {
  fieldId: string;
  bits?: number;
  inputA: string;
  inputB: string;
  solution?: string;
}

export interface AsymmetricFlowProps {
  fieldId: string;
  sender: string;
  receiver: string;
  message: string;
  steps?: Array<{ label: string; description: string }>;
}

export interface ChoiceMatrixRow {
  question: string;
  correctAnswers: string[];
}

export interface ChoiceMatrixProps {
  fieldId: string;
  columns: string[];
  rows: ChoiceMatrixRow[];
  multipleSelection?: boolean;
}

export interface DropdownChoiceRow {
  question: string;
  options: string[];
  correctAnswers: string[];
}

export interface DropdownChoiceProps {
  fieldId: string;
  rows: DropdownChoiceRow[];
  multipleSelection?: boolean;
}

// ─── Generic / custom component DSL ───
// A composable layout tree that the AI can assemble when no named component fits.
// The GenericComponent renderer interprets this tree using the existing useWorksheet hook.

export interface PrimitiveBase {
  id?: string;
}

export interface DisplayPrimitive extends PrimitiveBase {
  type: 'display';
  content: string;
  format?: 'text' | 'code' | 'mono';
  className?: string;
}

export interface InputPrimitive extends PrimitiveBase {
  type: 'input';
  fieldId: string;
  label?: string;
  placeholder?: string;
  inputType?: 'text' | 'number' | 'password';
  maxLength?: number;
  width?: string;
  mono?: boolean;
}

export interface TextareaPrimitive extends PrimitiveBase {
  type: 'textarea';
  fieldId: string;
  label?: string;
  placeholder?: string;
  rows?: number;
}

export interface TablePrimitive extends PrimitiveBase {
  type: 'table';
  columns: Array<{ key: string; label: string; editable?: boolean; width?: string }>;
  rows: Array<Record<string, string>>;
  fieldId: string;
}

export interface ToggleGridPrimitive extends PrimitiveBase {
  type: 'toggleGrid';
  fieldId: string;
  columns: string[];
  rows: Array<{ label: string; correctAnswers: string[] }>;
  multipleSelection?: boolean;
}

export interface DropdownPrimitive extends PrimitiveBase {
  type: 'dropdown';
  fieldId: string;
  rows: Array<{ question: string; options: string[]; correctAnswers: string[] }>;
  multipleSelection?: boolean;
}

export interface StepperPrimitive extends PrimitiveBase {
  type: 'stepper';
  fieldId: string;
  steps: Array<{ label: string; description?: string; inputPlaceholder?: string }>;
}

export interface CodeLinePrimitive extends PrimitiveBase {
  type: 'codeLine';
  fieldId: string;
  cells: Array<{ label?: string; fieldId?: string; editable: boolean; value?: string; width?: string; maxLength?: number }>;
}

export interface CheckButtonPrimitive extends PrimitiveBase {
  type: 'checkButton';
  checks: Array<{ fieldId: string; expected: string; hint?: string; opts?: { normalize?: boolean; contains?: boolean } }>;
  feedbackId: string;
  label?: string;
}

export interface ResetButtonPrimitive extends PrimitiveBase {
  type: 'resetButton';
  fieldIds: string[];
  label?: string;
}

export interface SolutionButtonPrimitive extends PrimitiveBase {
  type: 'solutionButton';
  fieldId: string;
  solution: string;
  label?: string;
}

export interface RowPrimitive extends PrimitiveBase {
  type: 'row';
  children: GenericPrimitive[];
  gap?: string;
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
}

export interface ColPrimitive extends PrimitiveBase {
  type: 'col';
  children: GenericPrimitive[];
  gap?: string;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface RepeatPrimitive extends PrimitiveBase {
  type: 'repeat';
  fieldId: string;
  count: number;
  child: GenericPrimitive;
  labelTemplate?: string;
  fieldIdTemplate?: string;
  startIndex?: number;
}

// ─── Compendium visualization primitives ───
// These are designed for DEMONSTRATION, not exercise.
// They let the AI generate rich visual explanations for the compendium.

export interface FormulaDisplayPrimitive extends PrimitiveBase {
  type: 'formulaDisplay';
  latex: string;        // KaTeX-rendered formula, e.g. "C = M^e \\bmod N"
  caption?: string;      // Optional German caption below the formula
  // "display" = block-level centered, "inline" = inline within text
  display?: 'block' | 'inline';
}

export interface StepCalculatorPrimitive extends PrimitiveBase {
  type: 'stepCalculator';
  title?: string;
  steps: Array<{
    label: string;           // German description, e.g. "Berechne N = p · q"
    expression: string;       // KaTeX expression, e.g. "N = 3 \\cdot 11 = 33"
    result?: string;          // Final result as plain text, e.g. "N = 33"
  }>;
  // Optional: a "reveal" button so students can step through one at a time
  interactive?: boolean;
}

export interface FlowDiagramPrimitive extends PrimitiveBase {
  type: 'flowDiagram';
  nodes: Array<{
    id: string;
    label: string;           // German label, can contain inline LaTeX \(...\)
    shape?: 'box' | 'circle' | 'diamond';
    highlight?: boolean;       // Highlight this node (e.g. the "secret" key)
  }>;
  edges: Array<{
    from: string;             // node id
    to: string;                // node id
    label?: string;            // Optional label on the arrow
  }>;
  // Layout direction: "horizontal" (left→right) or "vertical" (top→bottom)
  direction?: 'horizontal' | 'vertical';
}

export interface KeyValueGridPrimitive extends PrimitiveBase {
  type: 'keyValueGrid';
  title?: string;
  rows: Array<{
    key: string;        // German label, e.g. "Öffentlicher Schlüssel"
    value: string;       // Value, can contain inline LaTeX
    highlight?: boolean;  // Highlight this row
  }>;
  columns?: [string, string];  // Optional custom column headers
}

export interface CalloutPrimitive extends PrimitiveBase {
  type: 'callout';
  variant: 'info' | 'warning' | 'success' | 'tip';
  title?: string;
  content: string;       // Can contain inline LaTeX
}

export type GenericPrimitive =
  | DisplayPrimitive
  | InputPrimitive
  | TextareaPrimitive
  | TablePrimitive
  | ToggleGridPrimitive
  | DropdownPrimitive
  | StepperPrimitive
  | CodeLinePrimitive
  | CheckButtonPrimitive
  | ResetButtonPrimitive
  | SolutionButtonPrimitive
  | RowPrimitive
  | ColPrimitive
  | RepeatPrimitive
  | FormulaDisplayPrimitive
  | StepCalculatorPrimitive
  | FlowDiagramPrimitive
  | KeyValueGridPrimitive
  | CalloutPrimitive;

export interface GenericComponentProps {
  fieldId: string;
  layout: GenericPrimitive[];
}

export type InteractiveComponent =
  | { type: 'pixelGrid'; props: PixelGridProps }
  | { type: 'bitVisualizer'; props: BitVisualizerProps }
  | { type: 'truthTable'; props: TruthTableProps }
  | { type: 'encodingExercise'; props: EncodingExerciseProps }
  | { type: 'huffmanTreeBuilder'; props: HuffmanTreeProps }
  | { type: 'lz77Simulator'; props: LZ77SimulatorProps }
  | { type: 'lz78Simulator'; props: CompressionTableProps }
  | { type: 'compressionTable'; props: CompressionTableProps }
  | { type: 'xorCalculator'; props: XorCalculatorProps }
  | { type: 'asymmetricFlow'; props: AsymmetricFlowProps }
  | { type: 'choiceMatrix'; props: ChoiceMatrixProps }
  | { type: 'dropdownChoice'; props: DropdownChoiceProps }
  | { type: 'custom'; props: GenericComponentProps };

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

export function normalizeWorksheetData(data: WorksheetData): WorksheetData {
  const sections = data.sections.map(section => {
    let s = { ...section };
    if (s.type === 'interactive' && !s.interactive) {
      s = { ...s, type: 'section' as const };
    }
    if (typeof s.content !== 'string') {
      s = { ...s, content: '' };
    }
    if (!s.fields) {
      s = { ...s, fields: [] };
    }
    return s;
  });
  return { ...data, sections };
}

// ─── Interactive component sanitization ───
// AI-generated components frequently contain machine-checkable mistakes: wrong XOR
// solutions, correctAnswers that match no column/option, pixelGrid solutions of the
// wrong length, LZ77 decode tasks without decode input, missing fieldIds. Everything
// that can be verified deterministically is fixed here; components that are broken
// beyond repair are removed (the section falls back to its text fields) so students
// never see an unsolvable exercise.
export function sanitizeInteractiveComponents(data: WorksheetData): { data: WorksheetData; fixes: string[] } {
  const fixes: string[] = [];
  let idCounter = 0;
  const normKey = (v: string) => v.trim().toLowerCase();

  const sections = data.sections.map((section, si) => {
    if (!section.interactive) return section;
    const s = { ...section };
    const comp = s.interactive as InteractiveComponent;
    const props = { ...(comp.props as unknown as Record<string, unknown>) };
    const label = `section ${s.number ?? si + 1}`;

    const demote = (reason: string): WorksheetSection => {
      fixes.push(`${label}: removed ${comp.type} component — ${reason}`);
      delete s.interactive;
      if (s.type === 'interactive') s.type = 'section';
      return s;
    };

    if (typeof props.fieldId !== 'string' || !props.fieldId) {
      props.fieldId = `iact_${si + 1}_${++idCounter}`;
      fixes.push(`${label}: generated missing fieldId for ${comp.type}`);
    }

    switch (comp.type) {
      case 'xorCalculator': {
        const a = String(props.inputA ?? '').trim();
        const b = String(props.inputB ?? '').trim();
        if (!/^[01]+$/.test(a) || !/^[01]+$/.test(b)) return demote('inputA/inputB are not binary strings');
        const len = Math.max(a.length, b.length);
        const pa = a.padStart(len, '0');
        const pb = b.padStart(len, '0');
        if (pa !== a || pb !== b) {
          props.inputA = pa;
          props.inputB = pb;
          fixes.push(`${label}: padded XOR inputs to ${len} bits`);
        }
        const correct = Array.from({ length: len }, (_, i) => (pa[i] === pb[i] ? '0' : '1')).join('');
        if (props.solution !== correct) {
          if (props.solution) fixes.push(`${label}: corrected XOR solution "${props.solution}" → "${correct}"`);
          props.solution = correct;
        }
        props.bits = len;
        break;
      }
      case 'choiceMatrix': {
        const columns = Array.isArray(props.columns) ? (props.columns as unknown[]).map(String) : [];
        const rows = Array.isArray(props.rows) ? (props.rows as Array<Record<string, unknown>>) : [];
        if (columns.length < 2 || rows.length === 0) return demote('needs at least 2 columns and 1 row');
        const colByNorm = new Map(columns.map(c => [normKey(c), c]));
        props.rows = rows.map((row, ri) => {
          const answers = (Array.isArray(row.correctAnswers) ? row.correctAnswers : []).map(String);
          const mapped = answers.map(ans => colByNorm.get(normKey(ans))).filter((v): v is string => v !== undefined);
          if (mapped.length !== answers.length) {
            fixes.push(`${label}: choiceMatrix row ${ri + 1} had correctAnswers not matching any column — dropped invalid entries`);
          }
          return { ...row, correctAnswers: mapped };
        });
        if ((props.rows as Array<{ correctAnswers: string[] }>).every(r => r.correctAnswers.length === 0)) {
          return demote('no row has a valid correct answer');
        }
        break;
      }
      case 'dropdownChoice': {
        const rows = Array.isArray(props.rows) ? (props.rows as Array<Record<string, unknown>>) : [];
        if (rows.length === 0) return demote('no rows');
        props.rows = rows.map((row, ri) => {
          const options = (Array.isArray(row.options) ? row.options : []).map(String);
          const answers = (Array.isArray(row.correctAnswers) ? row.correctAnswers : []).map(String);
          const optByNorm = new Map(options.map(o => [normKey(o), o]));
          const mapped: string[] = [];
          for (const ans of answers) {
            const hit = optByNorm.get(normKey(ans));
            if (hit) {
              mapped.push(hit);
            } else {
              options.push(ans);
              mapped.push(ans);
              fixes.push(`${label}: dropdownChoice row ${ri + 1} — correct answer "${ans}" was missing from options, added it`);
            }
          }
          return { ...row, options, correctAnswers: mapped };
        });
        break;
      }
      case 'pixelGrid': {
        const width = Number(props.width) || 0;
        const height = Number(props.height) || 0;
        if (width <= 0 || height <= 0) return demote('invalid width/height');
        if (Array.isArray(props.solution)) {
          const expectedLen = width * height;
          const sol = (props.solution as unknown[]).map(v => (Number(v) ? 1 : 0));
          if (sol.length !== expectedLen) {
            props.solution = sol.length > expectedLen
              ? sol.slice(0, expectedLen)
              : [...sol, ...Array(expectedLen - sol.length).fill(0)];
            fixes.push(`${label}: pixelGrid solution length ${sol.length} adjusted to ${expectedLen} (${width}×${height})`);
          } else {
            props.solution = sol;
          }
        }
        break;
      }
      case 'lz77Simulator': {
        const inputString = String(props.inputString ?? '').trim();
        const decodeInput = String(props.decodeInput ?? '').trim();
        if (props.direction === 'decode' && !decodeInput) {
          if (inputString) {
            props.direction = 'encode';
            fixes.push(`${label}: lz77 decode task without decodeInput — switched to encode`);
          } else {
            return demote('lz77 decode without decodeInput or inputString');
          }
        } else if (props.direction !== 'decode' && !inputString) {
          if (decodeInput) {
            props.direction = 'decode';
            fixes.push(`${label}: lz77 encode task without inputString — switched to decode`);
          } else {
            return demote('lz77 without inputString');
          }
        }
        if (!Number(props.bufferSize) || Number(props.bufferSize) <= 0) props.bufferSize = 6;
        if (!Number(props.lookaheadSize) || Number(props.lookaheadSize) <= 0) props.lookaheadSize = 4;
        break;
      }
      case 'lz78Simulator':
      case 'compressionTable': {
        if (!String(props.inputString ?? '').trim()) return demote(`${comp.type} without inputString`);
        break;
      }
      case 'huffmanTreeBuilder': {
        const hasString = !!String(props.initialString ?? '').trim();
        const freq = props.frequencyTable;
        const hasFreq = !!freq && typeof freq === 'object' && Object.keys(freq as object).length > 0;
        if (!hasString && !hasFreq) return demote('huffmanTreeBuilder without initialString or frequencyTable');
        break;
      }
      case 'custom': {
        if (!Array.isArray(props.layout) || (props.layout as unknown[]).length === 0) return demote('custom component without layout');
        break;
      }
    }

    s.interactive = { ...comp, props } as unknown as InteractiveComponent;
    return s;
  });

  return { data: { ...data, sections }, fixes };
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
      if (s.type === 'interactive') {
        (d.sections as Record<string, unknown>[])[i] = { ...s, content: '' };
      } else {
        errors.push(`Section ${i}: missing content`);
      }
    }
    if (s.type === 'section' && !s.title) {
      errors.push(`Section ${i}: section type requires title`);
    }
    if (s.interactive && typeof s.interactive === 'object' && !['pixelGrid', 'bitVisualizer', 'truthTable', 'encodingExercise', 'huffmanTreeBuilder', 'lz77Simulator', 'lz78Simulator', 'compressionTable', 'xorCalculator', 'asymmetricFlow', 'choiceMatrix', 'dropdownChoice', 'custom'].includes((s.interactive as Record<string, unknown>).type as string)) {
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