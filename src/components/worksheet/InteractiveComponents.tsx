'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useWorksheet } from './WorksheetProvider';
import { Latex, LatexText } from '@/components/katex-renderer';
import { exprToLatex, looksLikeMath, evaluateExpression } from '@/lib/math-eval';
import type { PixelGridProps, BitVisualizerProps, TruthTableProps, EncodingExerciseProps, HuffmanTreeProps, LZ77SimulatorProps, LZ77Triple, CompressionTableProps, XorCalculatorProps, AsymmetricFlowProps, ChoiceMatrixProps, DropdownChoiceProps, GenericComponentProps, GenericPrimitive, DisplayPrimitive, InputPrimitive, TextareaPrimitive, TablePrimitive, ToggleGridPrimitive, DropdownPrimitive, StepperPrimitive, CodeLinePrimitive, CheckButtonPrimitive, ResetButtonPrimitive, SolutionButtonPrimitive, RowPrimitive, ColPrimitive, RepeatPrimitive, FormulaDisplayPrimitive, StepCalculatorPrimitive, FlowDiagramPrimitive, KeyValueGridPrimitive, CalloutPrimitive, MathInputPrimitive, MathStepsPrimitive, FunctionGraphPrimitive } from '@/lib/worksheet-schema';

export function PixelGrid({ props }: { props: PixelGridProps }) {
  const { fields, setFieldValue, checkField, feedbacks } = useWorksheet();
  const { width, height, solution, labels, encodingType = 'none', encodingDirection = 'row', fieldId } = props;

  const totalCells = width * height;
  const savedValue = fields[fieldId] || '';
  const grid = useMemo(() => {
    if (savedValue) {
      try {
        const parsed = JSON.parse(savedValue);
        if (Array.isArray(parsed) && parsed.length === totalCells) return parsed.map(Number);
      } catch {}
    }
    return new Array(totalCells).fill(0);
  }, [savedValue, totalCells]);

  const isDragging = useRef(false);
  const dragMode = useRef<0 | 1>(0);
  const [dragCount, setDragCount] = useState(0);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const applyCell = useCallback((index: number, value: 0 | 1) => {
    const next = [...grid];
    next[index] = value;
    setFieldValue(fieldId, JSON.stringify(next));
  }, [grid, fieldId, setFieldValue]);

  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragMode.current = grid[index] === 1 ? 0 : 1;
    setDragCount(1);
    setCursorPos({ x: e.clientX, y: e.clientY });
    applyCell(index, dragMode.current);
  }, [grid, applyCell]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) {
      setCursorPos({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    setDragCount(0);
    setCursorPos(null);
  }, []);

  const resetGrid = useCallback(() => {
    const cleared = new Array(totalCells).fill(0);
    setFieldValue(fieldId, JSON.stringify(cleared));
  }, [totalCells, fieldId, setFieldValue]);

  const showSolution = useCallback(() => {
    if (!solution) return;
    const solutionGrid = solution.length === totalCells ? [...solution] : new Array(totalCells).fill(0);
    setFieldValue(fieldId, JSON.stringify(solutionGrid));
  }, [solution, totalCells, fieldId, setFieldValue]);

  const encodeRLE = useCallback((data: number[]): string => {
    if (data.length === 0) return '';
    const result: number[] = [];
    let current = data[0];
    let count = 1;
    for (let i = 1; i < data.length; i++) {
      if (data[i] === current && count < 9) {
        count++;
      } else {
        result.push(count, current);
        current = data[i];
        count = 1;
      }
    }
    result.push(count, current);
    return result.join('');
  }, []);

  const encodeBinary = useCallback((data: number[]): string => {
    return data.join('');
  }, []);

  const getRowData = useCallback((rowIdx: number): number[] => {
    return grid.slice(rowIdx * width, (rowIdx + 1) * width);
  }, [grid, width]);

  const getColData = useCallback((colIdx: number): number[] => {
    const col: number[] = [];
    for (let row = 0; row < height; row++) {
      col.push(grid[row * width + colIdx]);
    }
    return col;
  }, [grid, width, height]);

  const getEncoding = useCallback((data: number[]): string => {
    if (encodingType === 'rle') return encodeRLE(data);
    if (encodingType === 'binary') return encodeBinary(data);
    return '';
  }, [encodingType, encodeRLE, encodeBinary]);

  const fb = feedbacks[fieldId];

  return (
    <div className="pixel-grid-container" onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onPointerMove={handlePointerMove}>
      {dragCount > 0 && cursorPos && (
        <div className="pixel-drag-counter" style={{ left: cursorPos.x, top: cursorPos.y - 30 }}>
          {dragCount}
        </div>
      )}
      <div className="pixel-grid-wrapper" style={{ display: 'inline-block' }}>
        <table className="pixel-grid-table" style={{ borderCollapse: 'collapse' }}>
          <thead>
            {labels?.cols && (
              <tr>
                <th className="pixel-grid-col-label" />
                {labels.cols.map((label, i) => (
                  <th key={i} className="pixel-grid-col-label">{label}</th>
                ))}
              </tr>
            )}
            {!labels?.cols && encodingType !== 'none' && (
              <tr>
                <th className="pixel-grid-col-label" />
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} className="pixel-grid-col-label">{i + 1}</th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {Array.from({ length: height }, (_, rowIdx) => (
              <tr key={rowIdx}>
                <td className="pixel-grid-row-label">{labels?.rows?.[rowIdx] ?? rowIdx + 1}</td>
                {Array.from({ length: width }, (_, colIdx) => {
                  const idx = rowIdx * width + colIdx;
                  const isOn = grid[idx] === 1;
                  return (
                    <td key={colIdx}>
                      <button
                        type="button"
                        className={`pixel-cell ${isOn ? 'pixel-on' : 'pixel-off'}`}
                        onPointerDown={(e) => handlePointerDown(idx, e)}
                        onPointerEnter={() => {
                          if (isDragging.current && grid[idx] !== dragMode.current) {
                            setDragCount(c => c + 1);
                            applyCell(idx, dragMode.current);
                          }
                        }}
                        aria-label={`Zelle ${rowIdx + 1},${colIdx + 1}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {encodingType !== 'none' && (
          <div className="pixel-encoding-section">
            <div className="pixel-encoding-label">
              {encodingType === 'rle' ? 'RLE-Kodierung' : 'Binärkodierung'} ({encodingDirection === 'col' ? 'Spaltenweise' : 'Zeilenweise'}):
            </div>
            <div className="pixel-encoding-rows">
              {encodingDirection === 'row'
                ? Array.from({ length: height }, (_, rowIdx) => (
                    <div key={rowIdx} className="pixel-encoding-row">
                      <span className="pixel-encoding-row-label">
                        {labels?.rows?.[rowIdx] ?? `Zeile ${rowIdx + 1}`}:
                      </span>
                      <code className="pixel-encoding-value">{getEncoding(getRowData(rowIdx))}</code>
                    </div>
                  ))
                : Array.from({ length: width }, (_, colIdx) => (
                    <div key={colIdx} className="pixel-encoding-row">
                      <span className="pixel-encoding-row-label">
                        {labels?.cols?.[colIdx] ?? `Spalte ${colIdx + 1}`}:
                      </span>
                      <code className="pixel-encoding-value">{getEncoding(getColData(colIdx))}</code>
                    </div>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={resetGrid} className="pixel-reset-btn">
          Zurücksetzen
        </button>
        {solution && (
          <button
            type="button"
            onClick={showSolution}
            className="pixel-solution-btn"
          >
            Lösung anzeigen
          </button>
        )}
      </div>

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

export function BitVisualizer({ props }: { props: BitVisualizerProps }) {
  const { fields, setFieldValue, checkField } = useWorksheet();
  const { bits, labels, fieldId, showDecimal = true, showHex = true } = props;

  const savedValue = fields[fieldId] || '';
  const bitValues = useMemo(() => {
    if (savedValue) {
      const parsed = savedValue.padStart(bits, '0').split('').map(Number);
      if (parsed.length === bits && parsed.every(b => b === 0 || b === 1)) return parsed;
    }
    return new Array(bits).fill(0);
  }, [savedValue, bits]);

  const toggleBit = useCallback((index: number) => {
    const next = [...bitValues];
    next[index] = next[index] === 1 ? 0 : 1;
    setFieldValue(fieldId, next.join(''));
  }, [bitValues, fieldId, setFieldValue]);

  const decimalValue = useMemo(() => {
    return bitValues.reduce((acc, bit, i) => acc + bit * Math.pow(2, bits - 1 - i), 0);
  }, [bitValues, bits]);

  const hexValue = useMemo(() => {
    return decimalValue.toString(16).toUpperCase();
  }, [decimalValue]);

  const resetBits = useCallback(() => {
    const cleared = new Array(bits).fill(0);
    setFieldValue(fieldId, cleared.join(''));
  }, [bits, fieldId, setFieldValue]);

  return (
    <div className="bit-visualizer-container">
      <div className="bit-grid">
        <div className="bit-values">
          {bitValues.map((bit, i) => (
            <div key={i} className="bit-cell">
              <div className="bit-label">{labels?.[i] ?? String(bits - 1 - i)}</div>
              <button
                type="button"
                className={`bit-toggle ${bit ? 'bit-on' : 'bit-off'}`}
                onClick={() => toggleBit(i)}
              >
                {bit}
              </button>
            </div>
          ))}
        </div>
        {(showDecimal || showHex) && (
          <div className="bit-results">
            {showDecimal && (
              <div className="bit-result-row">
                <span className="bit-result-label">Dezimal:</span>
                <code className="bit-result-value">{decimalValue}</code>
              </div>
            )}
            {showHex && (
              <div className="bit-result-row">
                <span className="bit-result-label">Hexadezimal:</span>
                <code className="bit-result-value">{hexValue}</code>
              </div>
            )}
          </div>
        )}
      </div>
      <button type="button" onClick={resetBits} className="pixel-reset-btn" style={{ marginTop: '0.5rem' }}>
        Zurücksetzen
      </button>
    </div>
  );
}

export function TruthTableBuilder({ props }: { props: TruthTableProps }) {
  const { fields, setFieldValue, checkField, feedbacks } = useWorksheet();
  const { inputs, outputLabel, rows, fieldId } = props;

  const inputCombinations = useMemo(() => {
    const n = inputs.length;
    const total = Math.pow(2, n);
    const combos: Array<Record<string, string>> = [];
    for (let i = 0; i < total; i++) {
      const row: Record<string, string> = {};
      inputs.forEach((input, j) => {
        row[input] = String((i >> (n - 1 - j)) & 1);
      });
      combos.push(row);
    }
    return combos;
  }, [inputs]);

  const tableRows = rows || inputCombinations;

  const outputFieldId = `${fieldId}_output`;

  const handleOutputChange = useCallback((rowIdx: number, value: string) => {
    setFieldValue(`${fieldId}_r${rowIdx}`, value);
  }, [fieldId, setFieldValue]);

  return (
    <div className="truth-table-container">
      <div style={{ overflowX: 'auto' }}>
        <table className="edit-table truth-table">
          <thead>
            <tr>
              {inputs.map(input => (
                <th key={input} className="truth-input-header">{input}</th>
              ))}
              <th className="truth-output-header">{outputLabel}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri}>
                {inputs.map(input => (
                  <td key={input} className="truth-input-cell">{row[input] ?? '0'}</td>
                ))}
                <td>
                  <select
                    value={fields[`${fieldId}_r${ri}`] || ''}
                    onChange={e => handleOutputChange(ri, e.target.value)}
                    className="truth-output-select"
                  >
                    <option value="">—</option>
                    <option value="0">0</option>
                    <option value="1">1</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EncodingExercise({ props }: { props: EncodingExerciseProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { encodingType, fromFormat, toFormat, examples = [], exercises = [], fieldId } = props;

  return (
    <div className="encoding-exercise-container">
      {examples.length > 0 && (
        <div className="encoding-examples">
          <div className="encoding-examples-title">Beispiele:</div>
          {examples.map((ex, i) => (
            <div key={i} className="encoding-example-row">
              <code className="encoding-example-input">{ex.input}</code>
              <span className="encoding-arrow">→</span>
              <code className="encoding-example-output">{ex.output}</code>
            </div>
          ))}
        </div>
      )}
      {exercises.length > 0 && (
        <div className="encoding-exercises">
          <div className="encoding-exercises-title">Aufgaben:</div>
          {exercises.map((ex, i) => {
            const exFieldId = ex.fieldId || `${fieldId}_ex${i}`;
            const fb = feedbacks[exFieldId];
            return (
              <div key={i} className="encoding-exercise-row">
                <code className="encoding-exercise-input">{ex.input}</code>
                <span className="encoding-arrow">→</span>
                <input
                  type="text"
                  value={fields[exFieldId] || ''}
                  onChange={e => setFieldValue(exFieldId, e.target.value)}
                  placeholder={`${toFormat} eingeben...`}
                  className={`encoding-exercise-input-field ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                />
                {fb && <span className={`encoding-feedback ${fb.type}`}>{fb.type === 'success' ? '✓' : '✗'}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HuffmanTreeBuilder({ props }: { props: HuffmanTreeProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { fieldId, initialString, frequencyTable, solution } = props;

  const freq = useMemo(() => {
    if (frequencyTable) return frequencyTable;
    const str = initialString || 'SCHAFFHAUSEN';
    const counts: Record<string, number> = {};
    for (const ch of str) {
      counts[ch] = (counts[ch] || 0) + 1;
    }
    return counts;
  }, [frequencyTable, initialString]);

  const sortedChars = useMemo(() => {
    return Object.entries(freq).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  }, [freq]);

  const savedValue = fields[fieldId] || '';
  const assignments = useMemo(() => {
    if (savedValue) {
      try {
        const parsed = JSON.parse(savedValue);
        if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, string>;
      } catch {}
    }
    return {};
  }, [savedValue]);

  const handleCodeChange = useCallback((char: string, value: string) => {
    const next = { ...assignments, [char]: value };
    setFieldValue(fieldId, JSON.stringify(next));
  }, [assignments, fieldId, setFieldValue]);

  const fb = feedbacks[fieldId];

  return (
    <div className="huffman-tree-container">
      <div className="huffman-freq-table">
        <div className="huffman-freq-title">Häufigkeitstabelle</div>
        <table className="edit-table huffman-freq-edit-table">
          <thead>
            <tr>
              <th>Zeichen</th>
              {sortedChars.map(([ch]) => <th key={ch}>{ch}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="huffman-freq-label">Häufigkeit</td>
              {sortedChars.map(([ch, count]) => <td key={ch} className="huffman-freq-value">{count}</td>)}
            </tr>
            <tr>
              <td className="huffman-freq-label">Code</td>
              {sortedChars.map(([ch]) => (
                <td key={ch}>
                  <input
                    type="text"
                    value={assignments[ch] || ''}
                    onChange={e => handleCodeChange(ch, e.target.value)}
                    placeholder="0/1"
                    className={`huffman-code-input ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {solution && (
        <div className="huffman-solution-section">
          <button type="button" onClick={() => {
            const sol: Record<string, string> = {};
            const assignCodes = (node: typeof solution, prefix: string) => {
              if (node.char) { sol[node.char] = prefix; return; }
              if (node.left) assignCodes(node.left, prefix + '0');
              if (node.right) assignCodes(node.right, prefix + '1');
            };
            assignCodes(solution, '');
            setFieldValue(fieldId, JSON.stringify(sol));
          }} className="pixel-solution-btn">
            Lösung anzeigen
          </button>
        </div>
      )}

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

function parseLZ77Triples(input: string): Array<{ offset: number; length: number; nextChar: string }> {
  const triples: Array<{ offset: number; length: number; nextChar: string }> = [];
  const regex = /\((\d+),(\d+),([^)]*)\)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    triples.push({ offset: parseInt(match[1], 10), length: parseInt(match[2], 10), nextChar: match[3] });
  }
  return triples;
}

function LZ77Decoder({ fieldId, decodeInput, bufferSize, lookaheadSize, solution }: {
  fieldId: string;
  decodeInput: string;
  bufferSize: number;
  lookaheadSize: number;
  solution?: LZ77Triple[];
}) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();

  const triples = useMemo(() => parseLZ77Triples(decodeInput), [decodeInput]);

  const decodedResult = useMemo(() => {
    let output = '';
    const bufferHistory: Array<{ buffer: string; output: string }> = [];
    for (const t of triples) {
      if (t.offset === 0 && t.length === 0) {
        output += t.nextChar;
      } else {
        const start = output.length - t.offset;
        const matched = output.substring(start, start + t.length);
        output += matched + t.nextChar;
      }
      const bufferSizeActual = Math.min(bufferSize, output.length);
      const buffer = output.substring(output.length - bufferSizeActual);
      bufferHistory.push({ buffer, output: t.nextChar ? `(${t.offset},${t.length},${t.nextChar})` : `(${t.offset},${t.length},)` });
    }
    return { output, bufferHistory };
  }, [triples, bufferSize]);

  return (
    <div className="lz77-simulator-container">
      <div className="lz77-input-display">
        <div className="lz77-input-label">Eingabe (Tripel):</div>
        <code className="compression-input-string">{decodeInput}</code>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
        <table className="edit-table lz77-steps-table">
          <thead>
            <tr>
              <th>Schritt</th>
              <th>Triple</th>
              <th>Puffer</th>
              <th>Ausgabe</th>
            </tr>
          </thead>
          <tbody>
            {triples.map((t, i) => {
              const bufferFieldId = `${fieldId}_step${i}_buffer`;
              const outputFieldId = `${fieldId}_step${i}_output`;
              const fbBuffer = feedbacks[bufferFieldId];
              const fbOutput = feedbacks[outputFieldId];
              const expectedBuffer = decodedResult.bufferHistory[i]?.buffer || '';
              const expectedOutput = decodedResult.bufferHistory[i]?.output || '';
              return (
                <tr key={i}>
                  <td className="lz77-step-num">{i + 1}</td>
                  <td><code>({t.offset},{t.length},{t.nextChar || ''})</code></td>
                  <td>
                    <input
                      type="text"
                      value={fields[bufferFieldId] || ''}
                      onChange={e => setFieldValue(bufferFieldId, e.target.value)}
                      placeholder="..."
                      className={`encoding-exercise-input-field ${fbBuffer ? (fbBuffer.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={fields[outputFieldId] || ''}
                      onChange={e => setFieldValue(outputFieldId, e.target.value)}
                      placeholder="..."
                      className={`encoding-exercise-input-field ${fbOutput ? (fbOutput.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
          Dekodierter Text:
        </label>
        <input
          type="text"
          value={fields[`${fieldId}_result`] || ''}
          onChange={e => setFieldValue(`${fieldId}_result`, e.target.value)}
          placeholder="Vollständiger dekodierter Text"
          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
        />
      </div>

      {solution && (
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" onClick={() => {
            triples.forEach((_, i) => {
              setFieldValue(`${fieldId}_step${i}_buffer`, decodedResult.bufferHistory[i]?.buffer || '');
              setFieldValue(`${fieldId}_step${i}_output`, decodedResult.bufferHistory[i]?.output || '');
            });
            setFieldValue(`${fieldId}_result`, decodedResult.output);
          }} className="pixel-solution-btn">Lösung anzeigen</button>
        </div>
      )}

      <button type="button" onClick={() => {
        triples.forEach((_, i) => {
          setFieldValue(`${fieldId}_step${i}_buffer`, '');
          setFieldValue(`${fieldId}_step${i}_output`, '');
        });
        setFieldValue(`${fieldId}_result`, '');
      }} className="pixel-reset-btn" style={{ marginTop: '0.75rem' }}>Zurücksetzen</button>

      {feedbacks[fieldId] && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${feedbacks[fieldId].type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {feedbacks[fieldId].msg}
        </div>
      )}
    </div>
  );
}

export function LZ77Simulator({ props }: { props: LZ77SimulatorProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { fieldId, inputString, bufferSize, lookaheadSize, solution, stepByStep = true, direction = 'encode', decodeInput } = props;

  const savedStep = useMemo(() => {
    const v = fields[fieldId] || '0';
    return parseInt(v, 10) || 0;
  }, [fields, fieldId]);

  const steps = useMemo(() => {
    const result: Array<{ buffer: string; lookahead: string; output: string; offset: number; length: number; nextChar: string }> = [];
    let pos = 0;
    while (pos < inputString.length) {
      const bufferStart = Math.max(0, pos - bufferSize);
      const buffer = inputString.substring(bufferStart, pos);
      const lookahead = inputString.substring(pos, pos + lookaheadSize);
      let bestOffset = 0;
      let bestLength = 0;
      for (let i = buffer.length - 1; i >= 0; i--) {
        let len = 0;
        while (len < lookahead.length && pos + len < inputString.length) {
          const bufIdx = (i + len) % buffer.length;
          if (buffer[bufIdx] === lookahead[len]) {
            len++;
          } else {
            break;
          }
        }
        if (len > bestLength) {
          bestLength = len;
          bestOffset = buffer.length - i;
        }
      }
      const nextChar = pos + bestLength < inputString.length ? inputString[pos + bestLength] : '';
      result.push({
        buffer,
        lookahead,
        output: bestLength > 0 ? `(${bestOffset},${bestLength},${nextChar})` : `(0,0,${inputString[pos]})`,
        offset: bestLength > 0 ? bestOffset : 0,
        length: bestLength,
        nextChar: bestLength > 0 ? nextChar : inputString[pos],
      });
      pos += bestLength + 1;
    }
    return result;
  }, [inputString, bufferSize, lookaheadSize]);

  if (direction === 'decode') {
    return <LZ77Decoder fieldId={fieldId} decodeInput={decodeInput || inputString} bufferSize={bufferSize} lookaheadSize={lookaheadSize} solution={solution} />;
  }

  const fb = feedbacks[fieldId];

  return (
    <div className="lz77-simulator-container">
      <div className="lz77-input-display">
        <div className="lz77-input-label">Eingabe:</div>
        <div className="lz77-input-chars">
          {inputString.split('').map((ch, i) => (
            <span key={i} className={`lz77-char ${i < savedStep ? 'lz77-char-processed' : i < (steps[savedStep]?.buffer.length || 0) + (steps[savedStep - 1]?.buffer.length || 0) ? 'lz77-char-buffer' : i < (steps[savedStep]?.lookahead.length || 0) + (steps[savedStep]?.buffer.length || 0) + (steps[savedStep - 1]?.buffer.length || 0) ? 'lz77-char-lookahead' : ''}`}>{ch}</span>
          ))}
        </div>
      </div>

      {stepByStep && steps.length > 0 && (
        <div className="lz77-steps-section">
          <div className="lz77-steps-title">Schritt-für-Schritt</div>
          <table className="edit-table lz77-steps-table">
            <thead>
              <tr>
                <th>Schritt</th>
                <th>Puffer</th>
                <th>Vorschau</th>
                <th>Ausgabe</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, i) => (
                <tr key={i} className={i === savedStep - 1 ? 'lz77-step-active' : ''}>
                  <td className="lz77-step-num">{i + 1}</td>
                  <td><code className="lz77-step-buffer">{step.buffer || '—'}</code></td>
                  <td><code className="lz77-step-lookahead">{step.lookahead}</code></td>
                  <td><code className="lz77-step-output">{step.output}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lz77-step-controls">
            <button type="button" onClick={() => setFieldValue(fieldId, String(Math.max(0, savedStep - 1)))} disabled={savedStep <= 0} className="pixel-reset-btn">← Zurück</button>
            <span className="lz77-step-indicator">Schritt {savedStep} / {steps.length}</span>
            <button type="button" onClick={() => setFieldValue(fieldId, String(Math.min(steps.length, savedStep + 1)))} disabled={savedStep >= steps.length} className="pixel-solution-btn">Weiter →</button>
          </div>
        </div>
      )}

      {!stepByStep && (
        <div className="lz77-result-table">
          <table className="edit-table lz77-steps-table">
            <thead>
              <tr><th>Schritt</th><th>Puffer</th><th>Vorschau</th><th>Ausgabe</th></tr>
            </thead>
            <tbody>
              {steps.map((step, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><code>{step.buffer || '—'}</code></td>
                  <td><code>{step.lookahead}</code></td>
                  <td><code>{step.output}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {solution && (
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" onClick={() => {
            setFieldValue(fieldId, JSON.stringify(solution));
          }} className="pixel-solution-btn">Lösung anzeigen</button>
        </div>
      )}

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

export function LZ78Simulator({ props }: { props: CompressionTableProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { fieldId, algorithm, direction, inputString, bufferSize, lookaheadSize, solution } = props;

  const steps = useMemo(() => {
    if (algorithm === 'lz78' && direction === 'decode') return computeLZ78DecodeSteps(inputString);
    if (algorithm === 'lz78') return computeLZ78Steps(inputString);
    if (algorithm === 'lzw' && direction === 'decode') return computeLZWDecodeSteps(inputString);
    if (algorithm === 'lzw') return computeLZWSteps(inputString);
    if (algorithm === 'lz77' && direction === 'decode') return computeLZ77DecodeSteps(inputString);
    return computeLZ77Steps(inputString, bufferSize || 6, lookaheadSize || 4);
  }, [algorithm, direction, inputString, bufferSize, lookaheadSize]);

  const editableFields = useMemo(() => {
    const result: string[] = [];
    steps.forEach((_, i) => {
      result.push(`${fieldId}_step${i}_output`);
      if (algorithm === 'lz78' || algorithm === 'lzw') {
        result.push(`${fieldId}_step${i}_dict`);
      }
    });
    return result;
  }, [steps, fieldId, algorithm]);

  return (
    <div className="compression-table-container">
      <div className="compression-algorithm-badge">
        {algorithm === 'lz77' ? 'LZ77' : algorithm === 'lz78' ? 'LZ78' : 'LZW'} — {direction === 'encode' ? 'Kodierung' : 'Dekodierung'}
      </div>

      <div className="compression-input-display">
        <span className="compression-input-label">Eingabe:</span>
        <code className="compression-input-string">{inputString}</code>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="edit-table compression-edit-table">
          <thead>
            <tr>
              <th>Schritt</th>
              {(algorithm === 'lz77') && <th>Puffer</th>}
              {(algorithm === 'lz77') && <th>Triple</th>}
              {(algorithm === 'lz78' || algorithm === 'lzw') && <th>{direction === 'decode' ? 'Eingabe' : 'Wortteil'}</th>}
              <th>Ausgabe</th>
              {(algorithm === 'lz78' || algorithm === 'lzw') && <th>Wörterbuch</th>}
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const outputFieldId = `${fieldId}_step${i}_output`;
              const dictFieldId = `${fieldId}_step${i}_dict`;
              const fb = feedbacks[outputFieldId];
              return (
                <tr key={i}>
                  <td className="compression-step-num">{i + 1}</td>
                  {algorithm === 'lz77' && <td><code>{step.buffer || '—'}</code></td>}
                  {algorithm === 'lz77' && <td><code>{step.lookahead || ''}</code></td>}
                  {(algorithm === 'lz78' || algorithm === 'lzw') && <td><code>{step.dictionaryEntry || ''}</code></td>}
                  <td>
                    <input
                      type="text"
                      value={fields[outputFieldId] || ''}
                      onChange={e => setFieldValue(outputFieldId, e.target.value)}
                      placeholder="..."
                      className={`encoding-exercise-input-field ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                    />
                  </td>
                  {(algorithm === 'lz78' || algorithm === 'lzw') && (
                    <td>
                      <input
                        type="text"
                        value={fields[dictFieldId] || ''}
                        onChange={e => setFieldValue(dictFieldId, e.target.value)}
                        placeholder="..."
                        className="encoding-exercise-input-field"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {direction === 'decode' && (
        <div style={{ marginTop: '0.75rem' }}>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
            Dekodierter Text:
          </label>
          <input
            type="text"
            value={fields[`${fieldId}_result`] || ''}
            onChange={e => setFieldValue(`${fieldId}_result`, e.target.value)}
            placeholder="Vollständiger dekodierter Text"
            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
          />
        </div>
      )}

      {solution && (
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" onClick={() => {
            solution.forEach((step, i) => {
              setFieldValue(`${fieldId}_step${i}_output`, step.output || '');
              if (step.dictionaryEntry) setFieldValue(`${fieldId}_step${i}_dict`, step.dictionaryEntry);
            });
            if (direction === 'decode') {
              const fullText = steps.map(s => String(s.output || '')).join('');
              setFieldValue(`${fieldId}_result`, fullText);
            }
          }} className="pixel-solution-btn">Lösung anzeigen</button>
        </div>
      )}

      <button type="button" onClick={() => {
        steps.forEach((_, i) => {
          setFieldValue(`${fieldId}_step${i}_output`, '');
          setFieldValue(`${fieldId}_step${i}_dict`, '');
        });
        setFieldValue(`${fieldId}_result`, '');
      }} className="pixel-reset-btn" style={{ marginTop: '0.75rem' }}>Zurücksetzen</button>

      {feedbacks[fieldId] && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${feedbacks[fieldId].type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {feedbacks[fieldId].msg}
        </div>
      )}
    </div>
  );
}

export function CompressionTable(props: { props: CompressionTableProps }) {
  return <LZ78Simulator props={props.props} />;
}

function computeLZ77Steps(inputString: string, bufferSize: number, lookaheadSize: number): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  let pos = 0;
  while (pos < inputString.length) {
    const bufferStart = Math.max(0, pos - bufferSize);
    const buffer = inputString.substring(bufferStart, pos);
    const lookahead = inputString.substring(pos, pos + lookaheadSize);
    let bestOffset = 0;
    let bestLength = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      let len = 0;
      while (len < lookahead.length && pos + len < inputString.length) {
        const bufIdx = (i + len) % buffer.length;
        if (buffer[bufIdx] === lookahead[len]) len++;
        else break;
      }
      if (len > bestLength) { bestLength = len; bestOffset = buffer.length - i; }
    }
    const nextChar = pos + bestLength < inputString.length ? inputString[pos + bestLength] : '';
    result.push({
      step: result.length + 1,
      buffer: buffer || '—',
      lookahead,
      output: bestLength > 0 ? `(${bestOffset},${bestLength},${nextChar})` : `(0,0,${inputString[pos]})`,
    });
    pos += bestLength + 1;
  }
  return result;
}

function computeLZ78Steps(inputString: string): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  const dictionary: Record<number, string> = { 0: '' };
  let pos = 0;
  let dictIdx = 1;
  while (pos < inputString.length) {
    let currentIdx = 0;
    let currentStr = '';
    let bestMatch = '';
    let bestIdx = 0;
    for (const [idx, entry] of Object.entries(dictionary)) {
      const idxNum = Number(idx);
      if (idxNum === 0) continue;
      const matchStr = entry + inputString[pos + entry.length];
      if (inputString.substring(pos, pos + matchStr.length) === matchStr && matchStr.length > bestMatch.length) {
        bestMatch = matchStr;
        bestIdx = idxNum;
      }
    }
    if (bestMatch.length > 0) {
      const nextChar = pos + bestMatch.length < inputString.length ? inputString[pos + bestMatch.length] : '';
      result.push({
        step: result.length + 1,
        dictionaryEntry: bestMatch,
        output: `(${bestIdx},${nextChar})`,
      });
      dictionary[dictIdx++] = bestMatch + nextChar;
      pos += bestMatch.length + 1;
    } else {
      const char = inputString[pos];
      result.push({
        step: result.length + 1,
        dictionaryEntry: char,
        output: `(0,${char})`,
      });
      dictionary[dictIdx++] = char;
      pos++;
    }
  }
  return result;
}

function computeLZWSteps(inputString: string): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  const dictionary: Record<string, number> = {};
  for (let i = 0; i < 256; i++) dictionary[String.fromCharCode(i)] = i;
  let nextCode = 256;
  let current = inputString[0];
  for (let i = 1; i < inputString.length; i++) {
    const combined = current + inputString[i];
    if (dictionary[combined] !== undefined) {
      current = combined;
    } else {
      result.push({
        step: result.length + 1,
        dictionaryEntry: combined,
        output: String(dictionary[current]),
      });
      dictionary[combined] = nextCode++;
      current = inputString[i];
    }
  }
  result.push({
    step: result.length + 1,
    dictionaryEntry: current,
    output: String(dictionary[current]),
  });
  return result;
}

function parseLZ78Pairs(input: string): Array<{ index: number; char: string }> {
  const pairs: Array<{ index: number; char: string }> = [];
  const regex = /\((\d+)\s*,\s*([^)]*)\)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    pairs.push({ index: parseInt(match[1], 10), char: match[2].trim() });
  }
  return pairs;
}

function computeLZ78DecodeSteps(inputString: string): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  const dictionary: Record<number, string> = { 0: '' };
  const pairs = parseLZ78Pairs(inputString);
  let dictIdx = 1;
  let output = '';
  for (const pair of pairs) {
    const entry = dictionary[pair.index] || '';
    const decoded = entry + pair.char;
    result.push({
      step: result.length + 1,
      dictionaryEntry: decoded,
      output: decoded,
      dictIndex: dictIdx,
    });
    dictionary[dictIdx++] = decoded;
    output += decoded;
  }
  return result;
}

function parseLZ77DecodeTriples(input: string): Array<{ offset: number; length: number; nextChar: string }> {
  const triples: Array<{ offset: number; length: number; nextChar: string }> = [];
  const regex = /\((\d+)\s*,\s*(\d+)\s*,\s*([^)]*)\)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    triples.push({ offset: parseInt(match[1], 10), length: parseInt(match[2], 10), nextChar: match[3].trim() });
  }
  return triples;
}

function computeLZ77DecodeSteps(inputString: string): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  const triples = parseLZ77DecodeTriples(inputString);
  let output = '';
  for (const t of triples) {
    let stepOutput = '';
    if (t.offset === 0 && t.length === 0) {
      stepOutput = t.nextChar;
    } else {
      const start = output.length - t.offset;
      const matched = output.substring(start, start + t.length);
      stepOutput = matched + (t.nextChar === '-' ? '' : t.nextChar);
    }
    result.push({
      step: result.length + 1,
      buffer: output,
      lookahead: `(${t.offset},${t.length},${t.nextChar})`,
      output: stepOutput,
    });
    output += stepOutput;
  }
  return result;
}

function computeLZWDecodeSteps(inputString: string): Array<Record<string, string | number | undefined>> {
  const result: Array<Record<string, string | number | undefined>> = [];
  const dictionary: Record<number, string> = {};
  for (let i = 0; i < 256; i++) dictionary[i] = String.fromCharCode(i);
  let nextCode = 256;
  const codes = inputString.match(/\d+/g)?.map(Number) || [];
  let prevEntry = '';
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    let entry: string;
    if (dictionary[code] !== undefined) {
      entry = dictionary[code];
    } else if (code === nextCode && prevEntry) {
      entry = prevEntry + prevEntry[0];
    } else {
      entry = '?';
    }
    result.push({
      step: result.length + 1,
      dictionaryEntry: i > 0 ? prevEntry + entry[0] : entry,
      output: entry,
      dictIndex: nextCode,
    });
    if (i > 0) {
      dictionary[nextCode++] = prevEntry + entry[0];
    }
    prevEntry = entry;
  }
  return result;
}

export function XorCalculator({ props }: { props: XorCalculatorProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { fieldId, bits = 8, inputA, inputB, solution } = props;

  const aBits = inputA.padStart(bits, '0').slice(0, bits).split('');
  const bBits = inputB.padStart(bits, '0').slice(0, bits).split('');
  const expectedResult = aBits.map((b, i) => (b === bBits[i] ? '0' : '1')).join('');

  const resultFieldId = `${fieldId}_result`;
  const userResult = fields[resultFieldId] || '';
  const fb = feedbacks[resultFieldId];

  return (
    <div className="xor-calculator-container" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="edit-table" style={{ minWidth: `${bits * 3}rem` }}>
          <thead>
            <tr>
              {Array.from({ length: bits }, (_, i) => (
                <th key={i} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{bits - 1 - i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {aBits.map((b, i) => (
                <td key={i} style={{ textAlign: 'center', padding: '0.4rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>{b}</td>
              ))}
            </tr>
            <tr>
              {bBits.map((b, i) => (
                <td key={i} style={{ textAlign: 'center', padding: '0.4rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>{b}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={bits} style={{ textAlign: 'center', padding: '0.2rem', fontSize: '1.2rem', color: 'var(--accent)' }}>⊕ XOR</td>
            </tr>
            <tr>
              {Array.from({ length: bits }, (_, i) => {
                const stepFieldId = `${fieldId}_bit${i}`;
                const stepFb = feedbacks[stepFieldId];
                return (
                  <td key={i} style={{ textAlign: 'center', padding: '0.2rem' }}>
                    <input
                      type="text"
                      maxLength={1}
                      value={fields[stepFieldId] || ''}
                      onChange={e => setFieldValue(stepFieldId, e.target.value.replace(/[^01]/g, ''))}
                      className={`encoding-exercise-input-field ${stepFb ? (stepFb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                      style={{ width: '2rem', textAlign: 'center', padding: '0.3rem', fontSize: '1.1rem', fontWeight: 600 }}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
          Resultat:
        </label>
        <input
          type="text"
          value={userResult}
          onChange={e => setFieldValue(resultFieldId, e.target.value.replace(/[^01]/g, ''))}
          placeholder={`${bits} Bits`}
          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
        />
      </div>

      {solution && (
        <div style={{ marginTop: '0.5rem' }}>
          <button type="button" onClick={() => {
            expectedResult.split('').forEach((b, i) => setFieldValue(`${fieldId}_bit${i}`, b));
            setFieldValue(resultFieldId, expectedResult);
          }} className="pixel-solution-btn">Lösung anzeigen</button>
        </div>
      )}

      <button type="button" onClick={() => {
        for (let i = 0; i < bits; i++) setFieldValue(`${fieldId}_bit${i}`, '');
        setFieldValue(resultFieldId, '');
      }} className="pixel-reset-btn" style={{ marginTop: '0.5rem' }}>Zurücksetzen</button>

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

export function AsymmetricFlowVisualizer({ props }: { props: AsymmetricFlowProps }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const { fieldId, sender, receiver, message, steps } = props;

  const defaultSteps = steps || [
    { label: 'Schlüsselgenerierung', description: `${sender} und ${receiver} erzeugen jeweils ein Schlüsselpaar (Public Key + Private Key).` },
    { label: 'Public Key Austausch', description: `${sender} und ${receiver} tauschen ihre öffentlichen Schlüssel aus.` },
    { label: 'Verschlüsselung', description: `${sender} verschlüsselt die Nachricht mit dem Public Key von ${receiver}.` },
    { label: 'Übertragung', description: `Die verschlüsselte Nachricht wird an ${receiver} gesendet.` },
    { label: 'Entschlüsselung', description: `${receiver} entschlüsselt die Nachricht mit seinem Private Key.` },
  ];

  const currentStepFieldId = `${fieldId}_step`;
  const currentStep = parseInt(fields[currentStepFieldId] || '0', 10) || 0;
  const fb = feedbacks[fieldId];

  return (
    <div className="asymmetric-flow-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>{sender}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Absender</div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--accent-light)', color: 'var(--accent-dark)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>Public Key 🔓</div>
            <div style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>Private Key 🔑</div>
          </div>
        </div>
        <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>→</div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>{receiver}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Empfänger</div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--accent-light)', color: 'var(--accent-dark)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>Public Key 🔓</div>
            <div style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>Private Key 🔑</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Nachricht:</div>
        <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', color: 'var(--text)' }}>{message}</code>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        {defaultSteps.map((s, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem', opacity: isActive ? 1 : isDone ? 0.6 : 0.4 }}>
              <div style={{ flexShrink: 0, width: '1.75rem', height: '1.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, background: isDone ? 'var(--success-bg)' : isActive ? 'var(--accent)' : 'var(--surface)', color: isDone ? 'var(--success)' : isActive ? 'white' : 'var(--text-muted)', border: `2px solid ${isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--border)'}` }}>
                {isDone ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isActive ? 'var(--accent-dark)' : 'var(--text)' }}>{s.label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.description}</div>
                {isActive && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <input
                      type="text"
                      value={fields[`${fieldId}_step${i}`] || ''}
                      onChange={e => setFieldValue(`${fieldId}_step${i}`, e.target.value)}
                      placeholder="Was passiert hier?"
                      className="w-full px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => setFieldValue(currentStepFieldId, String(Math.max(0, currentStep - 1)))} disabled={currentStep <= 0} className="pixel-reset-btn" style={{ opacity: currentStep <= 0 ? 0.5 : 1 }}>← Zurück</button>
        <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Schritt {currentStep} / {defaultSteps.length}</span>
        <button type="button" onClick={() => setFieldValue(currentStepFieldId, String(Math.min(defaultSteps.length, currentStep + 1)))} disabled={currentStep >= defaultSteps.length} className="pixel-solution-btn" style={{ opacity: currentStep >= defaultSteps.length ? 0.5 : 1 }}>Weiter →</button>
      </div>

      {currentStep >= defaultSteps.length && (
        <div style={{ padding: '0.75rem', background: 'var(--success-bg)', borderRadius: '8px', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
            <strong>Ergebnis:</strong> {receiver} hat die Nachricht erfolgreich mit seinem Private Key entschlüsselt: <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{message}</code>
          </div>
        </div>
      )}

      <button type="button" onClick={() => {
        setFieldValue(currentStepFieldId, '0');
        for (let i = 0; i < defaultSteps.length; i++) setFieldValue(`${fieldId}_step${i}`, '');
      }} className="pixel-reset-btn">Zurücksetzen</button>

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

export function ChoiceMatrix({ props }: { props: ChoiceMatrixProps }) {
  const { fields, setFieldValue } = useWorksheet();
  const { fieldId, columns, rows, multipleSelection = false } = props;

  const getSelected = (rowIdx: number): string[] => {
    const raw = fields[`${fieldId}_r${rowIdx}`] || '';
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  };

  const setSelected = (rowIdx: number, vals: string[]) => {
    setFieldValue(`${fieldId}_r${rowIdx}`, JSON.stringify(vals));
  };

  const toggleCell = (rowIdx: number, col: string) => {
    const selected = getSelected(rowIdx);
    let next: string[];
    if (selected.includes(col)) {
      next = selected.filter(c => c !== col);
    } else if (multipleSelection) {
      next = [...selected, col];
    } else {
      next = [col];
    }
    setSelected(rowIdx, next);
  };

  const checkFieldId = `${fieldId}_check`;

  const checkAll = () => {
    let allCorrect = true;
    rows.forEach((row, rowIdx) => {
      const selected = getSelected(rowIdx);
      const correct = row.correctAnswers;
      const isCorrect = selected.length === correct.length && correct.every(c => selected.includes(c));
      if (!isCorrect) allCorrect = false;
      setFieldValue(`${fieldId}_r${rowIdx}_fb`, isCorrect ? 'correct' : 'wrong');
    });
    setFieldValue(checkFieldId, allCorrect ? 'ok' : 'fail');
  };

  const fb = fields[checkFieldId];

  return (
    <div className="choice-matrix-container" style={{ overflowX: 'auto' }}>
      <table className="edit-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', minWidth: '12rem' }}>Frage</th>
            {columns.map(col => (
              <th key={col} style={{ textAlign: 'center', minWidth: '4rem' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const selected = getSelected(rowIdx);
            const rowFb = fields[`${fieldId}_r${rowIdx}_fb`];
            return (
              <tr key={rowIdx}>
                <td style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>
                  {row.question}
                </td>
                {columns.map(col => {
                  const isSelected = selected.includes(col);
                  const isCorrect = row.correctAnswers.includes(col);
                  let cellClass = 'choice-matrix-cell';
                  if (rowFb === 'correct' || rowFb === 'wrong') {
                    if (isSelected && isCorrect) cellClass += ' choice-correct';
                    else if (isSelected && !isCorrect) cellClass += ' choice-wrong';
                    else if (!isSelected && isCorrect) cellClass += ' choice-missed';
                  } else if (isSelected) {
                    cellClass += ' choice-selected';
                  }
                  return (
                    <td key={col} style={{ textAlign: 'center', padding: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => toggleCell(rowIdx, col)}
                        className={cellClass}
                      >
                        {isSelected ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" onClick={checkAll} className="pixel-solution-btn">Prüfen</button>
        <button type="button" onClick={() => {
          rows.forEach((_, rowIdx) => {
            setFieldValue(`${fieldId}_r${rowIdx}`, JSON.stringify([]));
            setFieldValue(`${fieldId}_r${rowIdx}_fb`, '');
          });
          setFieldValue(checkFieldId, '');
        }} className="pixel-reset-btn">Zurücksetzen</button>
        {multipleSelection && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mehrere Antworten möglich</span>
        )}
      </div>

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb === 'ok' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb === 'ok' ? 'Alle korrekt!' : 'Noch nicht ganz richtig. Überprüfe die markierten Felder.'}
        </div>
      )}
    </div>
  );
}

export function DropdownChoice({ props }: { props: DropdownChoiceProps }) {
  const { fields, setFieldValue } = useWorksheet();
  const { fieldId, rows, multipleSelection = false } = props;

  const checkFieldId = `${fieldId}_check`;

  const getSelected = (rowIdx: number): string[] => {
    if (!multipleSelection) {
      const v = fields[`${fieldId}_r${rowIdx}`] || '';
      return v ? [v] : [];
    }
    const raw = fields[`${fieldId}_r${rowIdx}`] || '';
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  };

  const setSelected = (rowIdx: number, vals: string[]) => {
    if (!multipleSelection) {
      setFieldValue(`${fieldId}_r${rowIdx}`, vals[0] || '');
    } else {
      setFieldValue(`${fieldId}_r${rowIdx}`, JSON.stringify(vals));
    }
  };

  const checkAll = () => {
    let allCorrect = true;
    rows.forEach((row, rowIdx) => {
      const selected = getSelected(rowIdx);
      const correct = row.correctAnswers;
      const isCorrect = selected.length === correct.length && correct.every(c => selected.includes(c));
      if (!isCorrect) allCorrect = false;
      setFieldValue(`${fieldId}_r${rowIdx}_fb`, isCorrect ? 'correct' : 'wrong');
    });
    setFieldValue(checkFieldId, allCorrect ? 'ok' : 'fail');
  };

  const fb = fields[checkFieldId];

  return (
    <div className="dropdown-choice-container">
      <table className="edit-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', minWidth: '14rem' }}>Frage</th>
            <th style={{ textAlign: 'left', minWidth: '12rem' }}>Antwort{multipleSelection ? 'en' : ''}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const rowFb = fields[`${fieldId}_r${rowIdx}_fb`];
            const selected = getSelected(rowIdx);
            const selectClass = `w-full px-3 py-2 border rounded-lg bg-[var(--input-bg)] text-sm outline-none transition-all ${
              rowFb === 'correct' ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]' :
              rowFb === 'wrong' ? 'border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)]' :
              'border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]'
            }`;
            return (
              <tr key={rowIdx}>
                <td style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>
                  {row.question}
                </td>
                <td style={{ padding: '0.4rem' }}>
                  {multipleSelection ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {row.options.map(opt => {
                        const isSelected = selected.includes(opt);
                        const isCorrect = row.correctAnswers.includes(opt);
                        let optClass = 'px-3 py-1.5 border rounded-lg text-sm cursor-pointer transition-all text-left ';
                        if (rowFb === 'correct' || rowFb === 'wrong') {
                          if (isSelected && isCorrect) optClass += 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]';
                          else if (isSelected && !isCorrect) optClass += 'border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)]';
                          else if (!isSelected && isCorrect) optClass += 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]';
                          else optClass += 'border-[var(--border)] text-[var(--text-muted)]';
                        } else {
                          optClass += isSelected ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]';
                        }
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              let next: string[];
                              if (isSelected) next = selected.filter(s => s !== opt);
                              else next = [...selected, opt];
                              setSelected(rowIdx, next);
                              setFieldValue(`${fieldId}_r${rowIdx}_fb`, '');
                            }}
                            className={optClass}
                          >
                            <span style={{ display: 'inline-block', width: '1.25rem' }}>{isSelected ? '☑' : '☐'}</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={fields[`${fieldId}_r${rowIdx}`] || ''}
                      onChange={e => {
                        setFieldValue(`${fieldId}_r${rowIdx}`, e.target.value);
                        setFieldValue(`${fieldId}_r${rowIdx}_fb`, '');
                      }}
                      className={selectClass}
                    >
                      <option value="">— Bitte wählen —</option>
                      {row.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" onClick={checkAll} className="pixel-solution-btn">Prüfen</button>
        <button type="button" onClick={() => {
          rows.forEach((_, rowIdx) => {
            setSelected(rowIdx, []);
            setFieldValue(`${fieldId}_r${rowIdx}_fb`, '');
          });
          setFieldValue(checkFieldId, '');
        }} className="pixel-reset-btn">Zurücksetzen</button>
      </div>

      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb === 'ok' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb === 'ok' ? 'Alle korrekt!' : 'Noch nicht ganz richtig. Überprüfe die markierten Felder.'}
        </div>
      )}
    </div>
  );
}

// ─── GenericComponent: renders a composable layout tree from primitives ───

interface WkCtx {
  fields: Record<string, string>;
  setFieldValue: (id: string, value: string) => void;
  resetFields: (ids: string[]) => void;
  checkFields: (checks: Array<{ fieldId: string; expected: string; hint?: string; opts?: { normalize?: boolean; contains?: boolean } }>, feedbackId: string) => void;
  feedbacks: Record<string, { type: 'success' | 'error'; msg: string }>;
}

function renderDisplay(p: DisplayPrimitive) {
  if (p.format === 'code' || p.format === 'mono') {
    // Multi-line code blocks need block layout with preserved whitespace
    if (p.content.includes('\n')) {
      return (
        <pre key={p.id} className={p.className} style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem 0.8rem', margin: 0, overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {p.content}
        </pre>
      );
    }
    return <code key={p.id} className={p.className} style={{ fontFamily: 'JetBrains Mono, monospace' }}>{p.content}</code>;
  }
  return <div key={p.id} className={p.className}><LatexText text={p.content} /></div>;
}

function renderInput(p: InputPrimitive, ctx: WkCtx) {
  const fb = ctx.feedbacks[p.fieldId];
  return (
    <div key={p.id || p.fieldId} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {p.label && <label className="block text-sm font-medium text-[var(--text)]"><LatexText text={p.label} /></label>}
      <input
        type={p.inputType || 'text'}
        value={ctx.fields[p.fieldId] || ''}
        onChange={e => ctx.setFieldValue(p.fieldId, e.target.value)}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        className={`px-3 py-2 border rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all ${p.mono ? 'font-mono' : ''} ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : 'border-[var(--border)]'}`}
        style={p.width ? { width: p.width } : undefined}
      />
      {fb && <span className={`text-xs ${fb.type === 'success' ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>{fb.msg}</span>}
    </div>
  );
}

function renderTextarea(p: TextareaPrimitive, ctx: WkCtx) {
  return (
    <div key={p.id || p.fieldId} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {p.label && <label className="block text-sm font-medium text-[var(--text)]"><LatexText text={p.label} /></label>}
      <textarea
        value={ctx.fields[p.fieldId] || ''}
        onChange={e => ctx.setFieldValue(p.fieldId, e.target.value)}
        placeholder={p.placeholder}
        rows={p.rows || 3}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
      />
    </div>
  );
}

function renderTable(p: TablePrimitive, ctx: WkCtx) {
  return (
    <div key={p.id} style={{ overflowX: 'auto' }}>
      <table className="edit-table">
        <thead>
          <tr>
            {p.columns.map(col => <th key={col.key} style={col.width ? { width: col.width } : undefined}><LatexText text={col.label} /></th>)}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row, ri) => (
            <tr key={ri}>
              {p.columns.map(col => {
                const cellFieldId = `${p.fieldId}_r${ri}_${col.key}`;
                if (col.editable) {
                  const fb = ctx.feedbacks[cellFieldId];
                  return (
                    <td key={col.key}>
                      <input
                        type="text"
                        value={ctx.fields[cellFieldId] || ''}
                        onChange={e => ctx.setFieldValue(cellFieldId, e.target.value)}
                        placeholder="..."
                        className={`encoding-exercise-input-field ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                      />
                    </td>
                  );
                }
                return <td key={col.key} className="given-cell"><LatexText text={row[col.key] ?? ''} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderToggleGrid(p: ToggleGridPrimitive, ctx: WkCtx) {
  const { fieldId, columns, rows, multipleSelection = false } = p;

  const getSelected = (rowIdx: number): string[] => {
    const raw = ctx.fields[`${fieldId}_r${rowIdx}`] || '';
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  };

  const toggleCell = (rowIdx: number, col: string) => {
    const selected = getSelected(rowIdx);
    let next: string[];
    if (selected.includes(col)) { next = selected.filter(c => c !== col); }
    else if (multipleSelection) { next = [...selected, col]; }
    else { next = [col]; }
    ctx.setFieldValue(`${fieldId}_r${rowIdx}`, JSON.stringify(next));
  };

  const checkAll = () => {
    let allCorrect = true;
    rows.forEach((row, rowIdx) => {
      const selected = getSelected(rowIdx);
      const correct = row.correctAnswers;
      const isCorrect = selected.length === correct.length && correct.every(c => selected.includes(c));
      if (!isCorrect) allCorrect = false;
      ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, isCorrect ? 'correct' : 'wrong');
    });
    ctx.setFieldValue(`${fieldId}_check`, allCorrect ? 'ok' : 'fail');
  };

  const fb = ctx.fields[`${fieldId}_check`];

  return (
    <div key={p.id} style={{ overflowX: 'auto' }}>
      <table className="edit-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', minWidth: '12rem' }}>{''}</th>
            {columns.map(col => <th key={col} style={{ textAlign: 'center', minWidth: '4rem' }}><LatexText text={col} /></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const selected = getSelected(rowIdx);
            const rowFb = ctx.fields[`${fieldId}_r${rowIdx}_fb`];
            return (
              <tr key={rowIdx}>
                <td style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.9rem' }}><LatexText text={row.label} /></td>
                {columns.map(col => {
                  const isSelected = selected.includes(col);
                  const isCorrect = row.correctAnswers.includes(col);
                  let cellClass = 'choice-matrix-cell';
                  if (rowFb === 'correct' || rowFb === 'wrong') {
                    if (isSelected && isCorrect) cellClass += ' choice-correct';
                    else if (isSelected && !isCorrect) cellClass += ' choice-wrong';
                    else if (!isSelected && isCorrect) cellClass += ' choice-missed';
                  } else if (isSelected) { cellClass += ' choice-selected'; }
                  return (
                    <td key={col} style={{ textAlign: 'center', padding: '0.25rem' }}>
                      <button type="button" onClick={() => toggleCell(rowIdx, col)} className={cellClass}>
                        {isSelected ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={checkAll} className="pixel-solution-btn">Prüfen</button>
        <button type="button" onClick={() => {
          rows.forEach((_, rowIdx) => { ctx.setFieldValue(`${fieldId}_r${rowIdx}`, JSON.stringify([])); ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, ''); });
          ctx.setFieldValue(`${fieldId}_check`, '');
        }} className="pixel-reset-btn">Zurücksetzen</button>
      </div>
      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium ${fb === 'ok' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb === 'ok' ? 'Alle korrekt!' : 'Noch nicht ganz richtig.'}
        </div>
      )}
    </div>
  );
}

function renderDropdown(p: DropdownPrimitive, ctx: WkCtx) {
  const { fieldId, rows, multipleSelection = false } = p;

  const getSelected = (rowIdx: number): string[] => {
    if (!multipleSelection) { const v = ctx.fields[`${fieldId}_r${rowIdx}`] || ''; return v ? [v] : []; }
    const raw = ctx.fields[`${fieldId}_r${rowIdx}`] || ''; try { return JSON.parse(raw) as string[]; } catch { return []; }
  };
  const setSelected = (rowIdx: number, vals: string[]) => ctx.setFieldValue(`${fieldId}_r${rowIdx}`, multipleSelection ? JSON.stringify(vals) : (vals[0] || ''));

  const checkAll = () => {
    let allCorrect = true;
    rows.forEach((row, rowIdx) => {
      const selected = getSelected(rowIdx);
      const isCorrect = selected.length === row.correctAnswers.length && row.correctAnswers.every(c => selected.includes(c));
      if (!isCorrect) allCorrect = false;
      ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, isCorrect ? 'correct' : 'wrong');
    });
    ctx.setFieldValue(`${fieldId}_check`, allCorrect ? 'ok' : 'fail');
  };

  const fb = ctx.fields[`${fieldId}_check`];

  return (
    <div key={p.id}>
      <table className="edit-table">
        <thead><tr><th style={{ textAlign: 'left', minWidth: '14rem' }}>Frage</th><th style={{ textAlign: 'left', minWidth: '12rem' }}>Antwort{multipleSelection ? 'en' : ''}</th></tr></thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const selected = getSelected(rowIdx);
            const rowFb = ctx.fields[`${fieldId}_r${rowIdx}_fb`];
            const selectClass = `w-full px-3 py-2 border rounded-lg bg-[var(--input-bg)] text-sm outline-none transition-all ${rowFb === 'correct' ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]' : rowFb === 'wrong' ? 'border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)]' : 'border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]'}`;
            return (
              <tr key={rowIdx}>
                <td style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.9rem' }}><LatexText text={row.question} /></td>
                <td style={{ padding: '0.4rem' }}>
                  {multipleSelection ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {row.options.map(opt => {
                        const isSelected = selected.includes(opt);
                        const isCorrect = row.correctAnswers.includes(opt);
                        let optClass = 'px-3 py-1.5 border rounded-lg text-sm cursor-pointer transition-all text-left ';
                        if (rowFb === 'correct' || rowFb === 'wrong') {
                          if (isSelected && isCorrect) optClass += 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]';
                          else if (isSelected && !isCorrect) optClass += 'border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)]';
                          else if (!isSelected && isCorrect) optClass += 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]';
                          else optClass += 'border-[var(--border)] text-[var(--text-muted)]';
                        } else {
                          optClass += isSelected ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]';
                        }
                        return (
                          <button key={opt} type="button" onClick={() => {
                            let next: string[]; if (isSelected) next = selected.filter(s => s !== opt); else next = [...selected, opt];
                            setSelected(rowIdx, next); ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, '');
                          }} className={optClass}>
                            <span style={{ display: 'inline-block', width: '1.25rem' }}>{isSelected ? '☑' : '☐'}</span><LatexText text={opt} />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={ctx.fields[`${fieldId}_r${rowIdx}`] || ''}
                      onChange={e => { ctx.setFieldValue(`${fieldId}_r${rowIdx}`, e.target.value); ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, ''); }}
                      className={selectClass}
                    >
                      <option value="">— Bitte wählen —</option>
                      {row.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={checkAll} className="pixel-solution-btn">Prüfen</button>
        <button type="button" onClick={() => { rows.forEach((_, rowIdx) => { setSelected(rowIdx, []); ctx.setFieldValue(`${fieldId}_r${rowIdx}_fb`, ''); }); ctx.setFieldValue(`${fieldId}_check`, ''); }} className="pixel-reset-btn">Zurücksetzen</button>
      </div>
      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium ${fb === 'ok' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb === 'ok' ? 'Alle korrekt!' : 'Noch nicht ganz richtig.'}
        </div>
      )}
    </div>
  );
}

function renderStepper(p: StepperPrimitive, ctx: WkCtx) {
  const { fieldId, steps } = p;
  const currentStep = parseInt(ctx.fields[`${fieldId}_step`] || '0', 10) || 0;
  const fb = ctx.feedbacks[fieldId];

  return (
    <div key={p.id}>
      <div style={{ marginBottom: '1rem' }}>
        {steps.map((s, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem', opacity: isActive ? 1 : isDone ? 0.6 : 0.4 }}>
              <div style={{ flexShrink: 0, width: '1.75rem', height: '1.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, background: isDone ? 'var(--success-bg)' : isActive ? 'var(--accent)' : 'var(--surface)', color: isDone ? 'var(--success)' : isActive ? 'white' : 'var(--text-muted)', border: `2px solid ${isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--border)'}` }}>
                {isDone ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isActive ? 'var(--accent-dark)' : 'var(--text)' }}><LatexText text={s.label} /></div>
                {s.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><LatexText text={s.description} /></div>}
                {isActive && s.inputPlaceholder && (
                  <input type="text" value={ctx.fields[`${fieldId}_step${i}`] || ''} onChange={e => ctx.setFieldValue(`${fieldId}_step${i}`, e.target.value)} placeholder={s.inputPlaceholder} className="w-full mt-1 px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)]" />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={() => ctx.setFieldValue(`${fieldId}_step`, String(Math.max(0, currentStep - 1)))} disabled={currentStep <= 0} className="pixel-reset-btn" style={{ opacity: currentStep <= 0 ? 0.5 : 1 }}>← Zurück</button>
        <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Schritt {currentStep} / {steps.length}</span>
        <button type="button" onClick={() => ctx.setFieldValue(`${fieldId}_step`, String(Math.min(steps.length, currentStep + 1)))} disabled={currentStep >= steps.length} className="pixel-solution-btn" style={{ opacity: currentStep >= steps.length ? 0.5 : 1 }}>Weiter →</button>
      </div>
      <button type="button" onClick={() => { ctx.setFieldValue(`${fieldId}_step`, '0'); for (let i = 0; i < steps.length; i++) ctx.setFieldValue(`${fieldId}_step${i}`, ''); }} className="pixel-reset-btn" style={{ marginTop: '0.5rem' }}>Zurücksetzen</button>
      {fb && (
        <div className={`feedback mt-3 p-3 rounded-lg text-sm font-medium ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>{fb.msg}</div>
      )}
    </div>
  );
}

function renderCodeLine(p: CodeLinePrimitive, ctx: WkCtx) {
  return (
    <div key={p.id} className="xor-calculator-container" style={{ fontFamily: 'JetBrains Mono, monospace', overflowX: 'auto' }}>
      <table className="edit-table">
        <tbody>
          <tr>
            {p.cells.map((cell, i) => {
              if (!cell.editable) {
                return <td key={i} style={{ textAlign: 'center', padding: '0.4rem', fontSize: '1.1rem', fontWeight: 600 }}>{cell.value || cell.label}</td>;
              }
              const cellFieldId = cell.fieldId || `${p.fieldId}_c${i}`;
              const cellFb = ctx.feedbacks[cellFieldId];
              return (
                <td key={i} style={{ textAlign: 'center', padding: '0.2rem' }}>
                  <input
                    type="text"
                    maxLength={cell.maxLength || 1}
                    value={ctx.fields[cellFieldId] || ''}
                    onChange={e => ctx.setFieldValue(cellFieldId, e.target.value)}
                    className={`encoding-exercise-input-field ${cellFb ? (cellFb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : ''}`}
                    style={{ width: cell.width || '2rem', textAlign: 'center', padding: '0.3rem', fontSize: '1.1rem', fontWeight: 600 }}
                  />
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function renderCheckButton(p: CheckButtonPrimitive, ctx: WkCtx) {
  const fb = ctx.feedbacks[p.feedbackId];
  return (
    <div key={p.id}>
      <button type="button" onClick={() => ctx.checkFields(p.checks, p.feedbackId)} className="pixel-solution-btn">{p.label || 'Prüfen'}</button>
      {fb && (
        <div className={`feedback mt-2 p-2 rounded-lg text-sm font-medium ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
          {fb.msg}
        </div>
      )}
    </div>
  );
}

function renderResetButton(p: ResetButtonPrimitive, ctx: WkCtx) {
  return <button key={p.id} type="button" onClick={() => ctx.resetFields(p.fieldIds)} className="pixel-reset-btn">{p.label || 'Zurücksetzen'}</button>;
}

function renderSolutionButton(p: SolutionButtonPrimitive, ctx: WkCtx) {
  return <button key={p.id} type="button" onClick={() => ctx.setFieldValue(p.fieldId, p.solution)} className="pixel-solution-btn">{p.label || 'Lösung anzeigen'}</button>;
}

function renderRow(p: RowPrimitive, ctx: WkCtx) {
  // Wrap by default — AI-generated rows regularly overflow on narrow screens otherwise
  return (
    <div key={p.id} style={{ display: 'flex', flexDirection: 'row', gap: p.gap || '0.5rem', alignItems: p.align || 'center', flexWrap: p.wrap === false ? 'nowrap' : 'wrap' }}>
      {p.children.map((child, i) => renderPrimitive(child, ctx, i))}
    </div>
  );
}

function renderCol(p: ColPrimitive, ctx: WkCtx) {
  return (
    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: p.gap || '0.5rem', alignItems: p.align || 'stretch' }}>
      {p.children.map((child, i) => renderPrimitive(child, ctx, i))}
    </div>
  );
}

function renderRepeat(p: RepeatPrimitive, ctx: WkCtx) {
  const start = p.startIndex || 0;
  const count = p.count;
  const items: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    const fieldId = (p.fieldIdTemplate || `${p.fieldId}_i{idx}`).replace('{idx}', String(idx));
    const label = p.labelTemplate ? p.labelTemplate.replace('{idx}', String(idx)) : undefined;
    const expanded = expandTemplate(p.child, idx, fieldId, label);
    items.push(renderPrimitive(expanded, ctx, i));
  }
  return <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{items}</div>;
}

function expandTemplate(primitive: GenericPrimitive, _index: number, fieldId: string, label?: string): GenericPrimitive {
  const clone = JSON.parse(JSON.stringify(primitive)) as GenericPrimitive;
  substituteFieldIds(clone, fieldId, label);
  return clone;
}

function substituteFieldIds(node: unknown, fieldId: string, label?: string) {
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.fieldId === 'string' && record.fieldId.includes('{idx}')) {
    record.fieldId = record.fieldId.replace('{idx}', (fieldId.split('_i').pop() || ''));
  } else if (typeof record.fieldId === 'string' && record.fieldId === '__auto__') {
    record.fieldId = fieldId;
  }
  if (label && typeof record.label === 'string' && record.label.includes('{idx}')) {
    record.label = record.label.replace('{idx}', label);
  }
  if (Array.isArray(record.children)) for (const child of record.children) substituteFieldIds(child, fieldId, label);
  if (record.child) substituteFieldIds(record.child, fieldId, label);
  if (Array.isArray(record.cells)) for (const cell of record.cells) substituteFieldIds(cell, fieldId, label);
  if (Array.isArray(record.checks)) for (const check of record.checks) substituteFieldIds(check, fieldId, label);
}

// ─── Compendium visualization primitives ───

// AI-generated "latex"/"expression" fields should be raw LaTeX, but models often
// wrap them in \(..\) / \[..\] / $..$ delimiters or mix delimited math with text.
function stripOuterMathDelimiters(tex: string): string {
  const t = tex.trim();
  const m = t.match(/^\\\(([\s\S]*)\\\)$/) || t.match(/^\\\[([\s\S]*)\\\]$/)
    || t.match(/^\$\$([\s\S]*)\$\$$/) || t.match(/^\$([\s\S]*)\$$/);
  if (m && !/\\[()[\]]|\$/.test(m[1])) return m[1].trim();
  return t;
}

// Render a raw-LaTeX field; falls back to mixed text+math rendering when the
// value still contains embedded \(..\) delimiters after unwrapping.
function MathExpression({ tex, display = false }: { tex: string; display?: boolean }) {
  const t = stripOuterMathDelimiters(tex);
  if (/\\[([]|\$/.test(t.replace(/\\[a-zA-Z]+/g, ''))) return <LatexText text={t} />;
  return <Latex tex={t} display={display} />;
}

function renderFormulaDisplay(p: FormulaDisplayPrimitive) {
  const isBlock = p.display !== 'inline';
  return (
    <div key={p.id} style={isBlock ? { textAlign: 'center', margin: '0.75rem 0' } : { display: 'inline' }}>
      <MathExpression tex={p.latex} display={isBlock} />
      {p.caption && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
          {p.caption}
        </div>
      )}
    </div>
  );
}

function StepCalculator({ p }: { p: StepCalculatorPrimitive }) {
  const [revealedSteps, setRevealedSteps] = useState(p.interactive ? 0 : p.steps.length);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      {p.title && (
        <div className="font-semibold text-sm mb-3 text-[var(--accent-dark)]">{p.title}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {p.steps.map((step, i) => {
          const visible = i < revealedSteps;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                opacity: visible ? 1 : 0.3,
                transition: 'opacity 0.3s',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{step.label}</span>
                <div style={{ fontSize: '0.9rem' }}>
                  <MathExpression tex={step.expression} />
                </div>
                {step.result && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-dark)', fontWeight: 600 }}>
                    → <LatexText text={step.result} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {p.interactive && revealedSteps < p.steps.length && (
        <button
          type="button"
          onClick={() => setRevealedSteps(s => s + 1)}
          style={{
            marginTop: '0.75rem',
            padding: '0.35rem 0.85rem',
            fontSize: '0.8rem',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            background: 'transparent',
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          Nächster Schritt →
        </button>
      )}
      {p.interactive && revealedSteps > 0 && revealedSteps >= p.steps.length && (
        <button
          type="button"
          onClick={() => setRevealedSteps(0)}
          style={{
            marginTop: '0.75rem',
            padding: '0.35rem 0.85rem',
            fontSize: '0.8rem',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          ↺ Von vorne
        </button>
      )}
    </div>
  );
}

function renderStepCalculator(p: StepCalculatorPrimitive) {
  return <StepCalculator key={p.id} p={p} />;
}

function renderFlowDiagram(p: FlowDiagramPrimitive) {
  const isHorizontal = p.direction !== 'vertical';
  const nodeMap = new Map(p.nodes.map(n => [n.id, n]));

  // Build adjacency: for each node, what edges go out
  const outgoing = new Map<string, typeof p.edges>();
  for (const edge of p.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge);
  }

  // Find root nodes (no incoming edges)
  const incomingSet = new Set(p.edges.map(e => e.to));
  const roots = p.nodes.filter(n => !incomingSet.has(n.id));

  // BFS layout: assign each node to a level
  const levels: string[][] = [];
  const visited = new Set<string>();
  let current = roots.map(r => r.id);
  while (current.length > 0) {
    levels.push(current);
    for (const id of current) visited.add(id);
    const next: string[] = [];
    for (const id of current) {
      for (const edge of outgoing.get(id) || []) {
        if (!visited.has(edge.to)) next.push(edge.to);
      }
    }
    current = Array.from(new Set(next));
  }
  // Add any unvisited nodes as their own level
  for (const n of p.nodes) {
    if (!visited.has(n.id)) levels.push([n.id]);
  }

  // Constants for SVG layout
  const nodeWidth = 130;
  const nodeHeight = 50;
  const levelGap = 80;   // gap between levels
  const siblingGap = 30; // gap between siblings in same level
  const padding = 20;

  // For horizontal: levels go left→right, siblings stack vertically
  // For vertical: levels go top→bottom, siblings stack horizontally
  const levelExtent = levels.length * (nodeWidth + levelGap) - levelGap + padding * 2;
  const maxSiblings = Math.max(...levels.map(l => l.length), 1);
  const siblingExtent = maxSiblings * (nodeWidth + siblingGap) - siblingGap + padding * 2;

  const svgWidth = isHorizontal ? levelExtent : siblingExtent;
  const svgHeight = isHorizontal ? siblingExtent : levelExtent;

  // Compute pixel positions for each node
  const pixelPositions = new Map<string, { cx: number; cy: number; w: number; h: number }>();
  levels.forEach((level, li) => {
    const levelSiblingExtent = level.length * (nodeWidth + siblingGap) - siblingGap;
    const startOffset = (isHorizontal
      ? svgHeight - levelSiblingExtent - padding * 2
      : svgWidth - levelSiblingExtent - padding * 2) / 2 + padding;
    level.forEach((nodeId, ni) => {
      const levelPos = padding + li * (nodeWidth + levelGap) + nodeWidth / 2;
      const siblingPos = startOffset + ni * (nodeWidth + siblingGap) + nodeWidth / 2;
      const cx = isHorizontal ? levelPos : siblingPos;
      const cy = isHorizontal ? siblingPos : levelPos;
      pixelPositions.set(nodeId, { cx, cy, w: nodeWidth, h: nodeHeight });
    });
  });

  // Render a node as SVG content
  const renderNodeSvg = (nodeId: string): React.ReactNode => {
    const node = nodeMap.get(nodeId);
    const pos = pixelPositions.get(nodeId);
    if (!node || !pos) return null;

    const x = pos.cx - pos.w / 2;
    const y = pos.cy - pos.h / 2;
    const fill = node.highlight ? 'var(--accent-light)' : 'var(--card)';
    const stroke = node.highlight ? 'var(--accent)' : 'var(--border)';
    const strokeWidth = node.highlight ? 2.5 : 1.5;

    let shapeEl: React.ReactNode = null;
    if (node.shape === 'circle') {
      shapeEl = <ellipse cx={pos.cx} cy={pos.cy} rx={pos.w / 2} ry={pos.h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    } else if (node.shape === 'diamond') {
      const pts = `${pos.cx},${y} ${x + pos.w},${pos.cy} ${pos.cx},${y + pos.h} ${x},${pos.cy}`;
      shapeEl = <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    } else {
      shapeEl = <rect x={x} y={y} width={pos.w} height={pos.h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }

    // Labels containing inline LaTeX \(..\) can't be drawn as SVG <text> —
    // render those through KaTeX inside a foreignObject instead.
    if (/\\[([]/.test(node.label)) {
      return (
        <g key={nodeId}>
          {shapeEl}
          <foreignObject x={x} y={y} width={pos.w} height={pos.h} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontSize: 11,
                lineHeight: 1.2,
                padding: '0 6px',
                overflow: 'hidden',
                color: node.highlight ? 'var(--accent-dark)' : 'var(--text)',
                fontWeight: node.highlight ? 600 : 400,
              }}
            >
              <span><LatexText text={node.label} /></span>
            </div>
          </foreignObject>
        </g>
      );
    }

    // Split long labels into multiple lines (max ~18 chars per line)
    const words = node.label.split(/\s+/);
    const splitLabel: string[] = [];
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > 18 && currentLine) {
        splitLabel.push(currentLine);
        currentLine = word;
      } else {
        currentLine = (currentLine + ' ' + word).trim();
      }
    }
    if (currentLine) splitLabel.push(currentLine);

    return (
      <g key={nodeId}>
        {shapeEl}
        {splitLabel.map((line, li) => (
          <text
            key={li}
            x={pos.cx}
            y={pos.cy - (splitLabel.length - 1) * 7 + li * 14}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fill={node.highlight ? 'var(--accent-dark)' : 'var(--text)'}
            fontWeight={node.highlight ? 600 : 400}
          >
            {line}
          </text>
        ))}
      </g>
    );
  };

  // Edge labels are plain SVG text — strip any LaTeX delimiters the AI slipped in
  const plainEdgeLabel = (label: string) => label.replace(/\\[()[\]]/g, '');

  // Render an edge as an SVG arrow
  const renderEdgeSvg = (edge: typeof p.edges[0], idx: number): React.ReactNode => {
    const from = pixelPositions.get(edge.from);
    const to = pixelPositions.get(edge.to);
    if (!from || !to) return null;

    // Calculate edge endpoints — connect from edge of source node to edge of target node
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;

    let startX = from.cx;
    let startY = from.cy;
    let endX = to.cx;
    let endY = to.cy;

    if (isHorizontal) {
      // Horizontal flow: edges exit left/right sides of nodes
      startX = from.cx + (dx > 0 ? from.w / 2 : -from.w / 2);
      endX = to.cx + (dx > 0 ? -to.w / 2 : to.w / 2);
    } else {
      // Vertical flow: edges exit top/bottom sides of nodes
      startY = from.cy + (dy > 0 ? from.h / 2 : -from.h / 2);
      endY = to.cy + (dy > 0 ? -to.h / 2 : to.h / 2);
    }

    // Curved path for non-adjacent connections, straight for adjacent
    const isAdjacent = isHorizontal
      ? Math.abs(from.cx - to.cx) <= (nodeWidth + levelGap + 10)
      : Math.abs(from.cy - to.cy) <= (nodeHeight + levelGap + 10);

    let pathEl: React.ReactNode;

    if (isAdjacent) {
      pathEl = (
        <>
          <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#flowArrowhead)" />
          {edge.label && (
            <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontStyle="italic">
              {plainEdgeLabel(edge.label)}
            </text>
          )}
        </>
      );
    } else {
      // Curved path for non-adjacent connections
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const ctrlX = isHorizontal ? midX : startX + (dx > 0 ? 30 : -30);
      const ctrlY = isHorizontal ? startY + (dy > 0 ? 30 : -30) : midY;
      const d = `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
      pathEl = (
        <>
          <path d={d} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#flowArrowhead)" />
          {edge.label && (
            <text x={midX} y={midY - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontStyle="italic">
              {plainEdgeLabel(edge.label)}
            </text>
          )}
        </>
      );
    }

    return <g key={`edge-${idx}`}>{pathEl}</g>;
  };

  return (
    <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4" style={{ overflowX: 'auto' }}>
      <svg width={svgWidth} height={svgHeight} style={{ maxWidth: '100%' }}>
        <defs>
          <marker id="flowArrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)" />
          </marker>
        </defs>
        {/* Render edges first (behind nodes) */}
        {p.edges.map((edge, idx) => renderEdgeSvg(edge, idx))}
        {/* Render nodes on top */}
        {p.nodes.map(node => renderNodeSvg(node.id))}
      </svg>
    </div>
  );
}

function renderKeyValueGrid(p: KeyValueGridPrimitive) {
  const [col0, col1] = p.columns || ['Eigenschaft', 'Wert'];
  return (
    <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      {p.title && (
        <div className="font-semibold text-sm mb-3 text-[var(--accent-dark)]">{p.title}</div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{col0}</th>
            <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{col1}</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row, i) => (
            <tr key={i} style={row.highlight ? { background: 'var(--accent-light)' } : undefined}>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)', fontWeight: row.highlight ? 600 : 400, color: row.highlight ? 'var(--accent-dark)' : 'var(--text)' }}>
                <LatexText text={row.key} />
              </td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
                <LatexText text={row.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCallout(p: CalloutPrimitive) {
  const styles: Record<string, { bg: string; border: string; color: string; icon: string }> = {
    info:    { bg: 'rgba(59,130,246,0.13)', border: '#3b82f6', color: '#93c5fd', icon: 'ℹ' },
    warning: { bg: 'rgba(245,158,11,0.13)', border: '#f59e0b', color: '#fcd34d', icon: '⚠' },
    success: { bg: 'rgba(16,185,129,0.13)', border: '#10b981', color: '#6ee7b7', icon: '✓' },
    tip:     { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', color: '#c4b5fd', icon: '💡' },
  };
  const s = styles[p.variant] || styles.info;
  return (
    <div
      key={p.id}
      style={{
        background: s.bg,
        borderLeft: `4px solid ${s.border}`,
        borderRadius: '0 8px 8px 0',
        padding: '0.6rem 0.85rem',
        margin: '0.5rem 0',
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>{s.icon}</span>
      <div style={{ flex: 1, fontSize: '0.85rem', color: s.color }}>
        {p.title && <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{p.title}</div>}
        <div><LatexText text={p.content} /></div>
      </div>
    </div>
  );
}

// ─── Math primitives (digital pen-and-paper replacement) ───

// Live KaTeX preview of typed math: "1/2" shows ½, "x^2" shows x², etc.
function MathPreview({ value }: { value: string }) {
  const latex = useMemo(() => {
    if (!value.trim() || !looksLikeMath(value)) return null;
    return exprToLatex(value);
  }, [value]);
  if (!latex) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]" style={{ minHeight: '1.9rem' }}>
      <Latex tex={latex} />
    </span>
  );
}

function MathInputC({ p, ctx }: { p: MathInputPrimitive; ctx: WkCtx }) {
  const value = ctx.fields[p.fieldId] || '';
  const fb = ctx.feedbacks[p.fieldId];
  return (
    <div key={p.id || p.fieldId} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {p.label && <label className="block text-sm font-medium text-[var(--text)]"><LatexText text={p.label} /></label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          inputMode="text"
          value={value}
          onChange={e => ctx.setFieldValue(p.fieldId, e.target.value)}
          placeholder={p.placeholder || 'z.B. 3/4 oder sqrt(2)'}
          className={`px-3 py-2 border rounded-lg bg-[var(--input-bg)] text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all ${fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : 'border-[var(--border)]'}`}
          style={{ width: p.width || '12rem' }}
        />
        <MathPreview value={value} />
      </div>
      <div className="text-xs text-[var(--text-muted)]">Brüche als 3/4, Potenzen als x^2, Wurzeln als sqrt(2)</div>
    </div>
  );
}

function MathStepsC({ p, ctx }: { p: MathStepsPrimitive; ctx: WkCtx }) {
  const minRows = Math.max(1, p.minRows || 3);
  const raw = ctx.fields[p.fieldId] || '';
  const lines = raw ? raw.split('\n') : [];
  while (lines.length < minRows) lines.push('');

  const setLine = (idx: number, val: string) => {
    const next = [...lines];
    next[idx] = val.replace(/\n/g, '');
    ctx.setFieldValue(p.fieldId, next.join('\n'));
  };
  const addLine = () => ctx.setFieldValue(p.fieldId, [...lines, ''].join('\n'));
  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    const next = lines.filter((_, i) => i !== idx);
    ctx.setFieldValue(p.fieldId, next.join('\n'));
  };

  return (
    <div key={p.id || p.fieldId} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-sm text-[var(--accent-dark)]">{p.label || 'Rechenweg'}</span>
        <span className="text-xs text-[var(--text-muted)]">wird nicht bewertet — dein Notizblatt</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="text-xs text-[var(--text-muted)] w-4 text-right shrink-0">{i + 1}.</span>
            <input
              type="text"
              value={line}
              onChange={e => setLine(i, e.target.value)}
              placeholder={i === 0 ? 'z.B. 2x + 4 = 10' : ''}
              className="flex-1 min-w-[10rem] px-3 py-1.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm font-mono outline-none focus:border-[var(--accent)] transition-all"
            />
            <MathPreview value={line} />
            {lines.length > 1 && (
              <button type="button" onClick={() => removeLine(i)} aria-label="Zeile entfernen" className="text-[var(--text-muted)] hover:text-[var(--error)] bg-transparent border-none cursor-pointer px-1 shrink-0">×</button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addLine} className="mt-2 text-xs border border-[var(--border)] text-[var(--text-muted)] px-2.5 py-1 rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer">
        + Zeile
      </button>
    </div>
  );
}

// ─── Function graph: interactive coordinate system ───
// Plots functions of x and lets students draw lines (two clicks, live equation
// readout) or plot points — the digital version of graph-paper tasks.

const GRAPH_COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#e879f9', '#fbbf24'];

function formatNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace('.', ',');
}

function lineEquation(p1: { x: number; y: number }, p2: { x: number; y: number }): string {
  if (Math.abs(p2.x - p1.x) < 1e-9) return `x = ${formatNum(p1.x)}`;
  const m = (p2.y - p1.y) / (p2.x - p1.x);
  const b = p1.y - m * p1.x;
  const mPart = Math.abs(m - 1) < 1e-9 ? 'x' : Math.abs(m + 1) < 1e-9 ? '-x' : `${formatNum(m)} \\cdot x`;
  const bPart = Math.abs(b) < 1e-9 ? '' : b > 0 ? ` + ${formatNum(b)}` : ` - ${formatNum(-b)}`;
  return `y = ${mPart}${bPart}`;
}

function FunctionGraphC({ p, ctx }: { p: FunctionGraphPrimitive; ctx: WkCtx }) {
  const xMin = p.xMin ?? -10, xMax = p.xMax ?? 10;
  const yMin = p.yMin ?? -10, yMax = p.yMax ?? 10;
  const W = 480, H = Math.max(240, Math.round(W * (yMax - yMin) / (xMax - xMin)));
  const sx = W / (xMax - xMin), sy = H / (yMax - yMin);
  const toPx = (x: number, y: number) => ({ px: (x - xMin) * sx, py: (yMax - y) * sy });
  const fromPx = (px: number, py: number) => ({ x: px / sx + xMin, y: yMax - py / sy });
  const snap = (v: number) => Math.round(v * 2) / 2;
  const drawMode = p.drawMode || 'none';
  const maxPoints = Math.max(2, p.maxPoints ?? 6);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [checkState, setCheckState] = useState<'idle' | 'ok' | 'fail'>('idle');

  // Student-drawn points live in the field as JSON
  const fieldValue = ctx.fields[p.fieldId] || '[]';
  const drawn: Array<{ x: number; y: number }> = useMemo(() => {
    try {
      const parsed = JSON.parse(fieldValue);
      return Array.isArray(parsed) ? parsed.filter(pt => typeof pt?.x === 'number' && typeof pt?.y === 'number') : [];
    } catch { return []; }
  }, [fieldValue]);

  const setDrawn = (pts: Array<{ x: number; y: number }>) => {
    ctx.setFieldValue(p.fieldId, JSON.stringify(pts));
    setCheckState('idle');
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode === 'none' || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const { x, y } = fromPx(px, py);
    const pt = { x: snap(x), y: snap(y) };
    if (pt.x < xMin || pt.x > xMax || pt.y < yMin || pt.y > yMax) return;

    if (drawMode === 'line') {
      if (drawn.length < 2) {
        setDrawn([...drawn, pt]);
      } else {
        // Move the nearest of the two handles to the click position
        const d0 = Math.hypot(drawn[0].x - pt.x, drawn[0].y - pt.y);
        const d1 = Math.hypot(drawn[1].x - pt.x, drawn[1].y - pt.y);
        const next = [...drawn];
        next[d0 <= d1 ? 0 : 1] = pt;
        setDrawn(next);
      }
    } else {
      // points mode: click near an existing point removes it, otherwise add
      const nearIdx = drawn.findIndex(d => Math.hypot(d.x - pt.x, d.y - pt.y) <= 0.45);
      if (nearIdx >= 0) setDrawn(drawn.filter((_, i) => i !== nearIdx));
      else if (drawn.length < maxPoints) setDrawn([...drawn, pt]);
    }
  };

  const check = () => {
    if (!p.expectedExpr) return;
    if (drawMode === 'line' && drawn.length === 2 && Math.abs(drawn[1].x - drawn[0].x) > 1e-9) {
      const m = (drawn[1].y - drawn[0].y) / (drawn[1].x - drawn[0].x);
      const b = drawn[0].y - m * drawn[0].x;
      let maxDelta = 0;
      let samples = 0;
      for (const x of [-4, -2, 0, 2, 4]) {
        const want = evaluateExpression(p.expectedExpr, { x });
        if (want === null) continue;
        samples++;
        maxDelta = Math.max(maxDelta, Math.abs(m * x + b - want));
      }
      setCheckState(samples >= 3 && maxDelta <= 0.35 ? 'ok' : 'fail');
    } else if (drawMode === 'points' && drawn.length >= Math.min(3, maxPoints)) {
      const allOk = drawn.every(pt => {
        const want = evaluateExpression(p.expectedExpr!, { x: pt.x });
        return want !== null && Math.abs(pt.y - want) <= 0.3;
      });
      setCheckState(allOk ? 'ok' : 'fail');
    } else {
      setCheckState('fail');
    }
  };

  // Plotted curves: sample each function across the width
  const functionsKey = JSON.stringify(p.functions || []);
  const curves = useMemo(() => {
    const fns = JSON.parse(functionsKey) as Array<{ expr: string; label?: string; color?: string }>;
    const result: Array<{ d: string; color: string; label?: string }> = [];
    fns.forEach((fn, i) => {
      let d = '';
      let penDown = false;
      for (let px = 0; px <= W; px += 2) {
        const x = px / sx + xMin;
        const y = evaluateExpression(fn.expr, { x });
        if (y === null || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) { penDown = false; continue; }
        const py = (yMax - y) * sy;
        d += `${penDown ? 'L' : 'M'} ${px.toFixed(1)} ${py.toFixed(1)} `;
        penDown = true;
      }
      if (d) result.push({ d, color: fn.color || GRAPH_COLORS[i % GRAPH_COLORS.length], label: fn.label });
    });
    return result;
  }, [functionsKey, sx, sy, xMin, yMin, yMax]);

  // Grid and axis geometry
  const gridLines: React.ReactNode[] = [];
  const labelStep = Math.max(1, Math.ceil((xMax - xMin) / 20));
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
    const { px } = toPx(x, 0);
    gridLines.push(<line key={`vx${x}`} x1={px} y1={0} x2={px} y2={H} stroke={x === 0 ? 'var(--text-muted)' : 'var(--border)'} strokeWidth={x === 0 ? 1.5 : 0.5} />);
    if (x !== 0 && x % labelStep === 0) {
      gridLines.push(<text key={`tx${x}`} x={px} y={Math.min(H - 4, Math.max(12, toPx(0, 0).py + 14))} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{x}</text>);
    }
  }
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
    const { py } = toPx(0, y);
    gridLines.push(<line key={`hy${y}`} x1={0} y1={py} x2={W} y2={py} stroke={y === 0 ? 'var(--text-muted)' : 'var(--border)'} strokeWidth={y === 0 ? 1.5 : 0.5} />);
    if (y !== 0 && y % labelStep === 0) {
      gridLines.push(<text key={`ty${y}`} x={Math.min(W - 4, Math.max(14, toPx(0, 0).px - 6))} y={py + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{y}</text>);
    }
  }

  // Drawn line (extended across the full view)
  let drawnLine: React.ReactNode = null;
  if (drawMode === 'line' && drawn.length === 2) {
    const [a, b] = drawn;
    if (Math.abs(b.x - a.x) < 1e-9) {
      const { px } = toPx(a.x, 0);
      drawnLine = <line x1={px} y1={0} x2={px} y2={H} stroke="#e879f9" strokeWidth={2} />;
    } else {
      const m = (b.y - a.y) / (b.x - a.x);
      const p1 = toPx(xMin, a.y + m * (xMin - a.x));
      const p2 = toPx(xMax, a.y + m * (xMax - a.x));
      drawnLine = <line x1={p1.px} y1={p1.py} x2={p2.px} y2={p2.py} stroke="#e879f9" strokeWidth={2} />;
    }
  }

  return (
    <div key={p.id || p.fieldId} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      {p.title && <div className="font-semibold text-sm mb-2 text-[var(--accent-dark)]">{p.title}</div>}
      {drawMode !== 'none' && (
        <div className="text-xs text-[var(--text-muted)] mb-2">
          {drawMode === 'line'
            ? 'Klicke zwei Punkte ins Koordinatensystem, um die Gerade zu zeichnen. Weitere Klicks verschieben den nächstgelegenen Punkt.'
            : `Klicke ins Koordinatensystem, um Punkte zu setzen (max. ${maxPoints}). Klick auf einen Punkt entfernt ihn.`}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: `${W}px`, background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', cursor: drawMode !== 'none' ? 'crosshair' : 'default', touchAction: 'manipulation' }}
          onClick={handleClick}
        >
          {gridLines}
          {curves.map((c, i) => <path key={i} d={c.d} fill="none" stroke={c.color} strokeWidth={2} />)}
          {drawnLine}
          {(p.points || []).map((pt, i) => {
            const { px, py } = toPx(pt.x, pt.y);
            return (
              <g key={`sp${i}`}>
                <circle cx={px} cy={py} r={4} fill="var(--text)" />
                {pt.label && <text x={px + 7} y={py - 6} fontSize={11} fill="var(--text)">{pt.label} ({formatNum(pt.x)}|{formatNum(pt.y)})</text>}
              </g>
            );
          })}
          {drawn.map((pt, i) => {
            const { px, py } = toPx(pt.x, pt.y);
            return (
              <g key={`dp${i}`}>
                <circle cx={px} cy={py} r={5.5} fill="#e879f9" stroke="var(--bg)" strokeWidth={1.5} />
                <text x={px + 8} y={py - 7} fontSize={11} fill="#f0abfc">({formatNum(pt.x)}|{formatNum(pt.y)})</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        {(p.functions || []).map((fn, i) => fn.label && (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]">
            <span style={{ width: 14, height: 3, background: fn.color || GRAPH_COLORS[i % GRAPH_COLORS.length], display: 'inline-block', borderRadius: 2 }} />
            <LatexText text={fn.label} />
          </span>
        ))}
        {drawMode === 'line' && drawn.length === 2 && (
          <span className="inline-flex items-center gap-1.5 text-xs bg-white border border-[var(--border)] rounded px-2 py-1">
            Deine Gerade: <Latex tex={lineEquation(drawn[0], drawn[1])} />
          </span>
        )}
      </div>

      {drawMode !== 'none' && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {p.expectedExpr && (
            <button type="button" onClick={check} className="pixel-solution-btn">Prüfen</button>
          )}
          <button type="button" onClick={() => { setDrawn([]); }} className="pixel-reset-btn">Zurücksetzen</button>
          {checkState === 'ok' && <span className="text-sm font-medium text-[var(--success)]">Richtig gezeichnet!</span>}
          {checkState === 'fail' && <span className="text-sm font-medium text-[var(--error)]">Noch nicht richtig — vergleiche Steigung und y-Achsenabschnitt.</span>}
        </div>
      )}
    </div>
  );
}

/**
 * FunctionGraph without a WorksheetProvider — state is handed in/out directly.
 * Used by the exam player (drawing questions, embedded graphs).
 */
export function StandaloneFunctionGraph({ spec, value, onChange }: {
  spec: Omit<FunctionGraphPrimitive, 'type' | 'fieldId'>;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const p: FunctionGraphPrimitive = { type: 'functionGraph', fieldId: '__standalone__', ...spec };
  const ctx: WkCtx = {
    fields: { __standalone__: value || '[]' },
    setFieldValue: (_id, v) => onChange?.(v),
    resetFields: () => onChange?.('[]'),
    checkFields: () => {},
    feedbacks: {},
  };
  return <FunctionGraphC p={p} ctx={ctx} />;
}

function renderPrimitive(p: GenericPrimitive, ctx: WkCtx, index: number): React.ReactNode {
  switch (p.type) {
    case 'display': return renderDisplay(p);
    case 'input': return renderInput(p, ctx);
    case 'textarea': return renderTextarea(p, ctx);
    case 'table': return renderTable(p, ctx);
    case 'toggleGrid': return renderToggleGrid(p, ctx);
    case 'dropdown': return renderDropdown(p, ctx);
    case 'stepper': return renderStepper(p, ctx);
    case 'codeLine': return renderCodeLine(p, ctx);
    case 'checkButton': return renderCheckButton(p, ctx);
    case 'resetButton': return renderResetButton(p, ctx);
    case 'solutionButton': return renderSolutionButton(p, ctx);
    case 'row': return renderRow(p, ctx);
    case 'col': return renderCol(p, ctx);
    case 'repeat': return renderRepeat(p, ctx);
    case 'formulaDisplay': return renderFormulaDisplay(p);
    case 'stepCalculator': return renderStepCalculator(p);
    case 'flowDiagram': return renderFlowDiagram(p);
    case 'keyValueGrid': return renderKeyValueGrid(p);
    case 'callout': return renderCallout(p);
    case 'mathInput': return <MathInputC key={p.id || p.fieldId || index} p={p} ctx={ctx} />;
    case 'mathSteps': return <MathStepsC key={p.id || p.fieldId || index} p={p} ctx={ctx} />;
    case 'functionGraph': return <FunctionGraphC key={p.id || p.fieldId || index} p={p} ctx={ctx} />;
    default: return null;
  }
}

// One malformed AI-generated primitive must not blank the entire component —
// contain render errors to the primitive that caused them.
class PrimitiveErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error('GenericComponent primitive render error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', border: '1px dashed var(--border)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
          ⚠ Dieses Element konnte nicht angezeigt werden.
        </div>
      );
    }
    return this.props.children;
  }
}

export function GenericComponent({ props }: { props: GenericComponentProps }) {
  const ws = useWorksheet();
  const ctx: WkCtx = {
    fields: ws.fields,
    setFieldValue: ws.setFieldValue,
    resetFields: ws.resetFields,
    checkFields: ws.checkFields,
    feedbacks: ws.feedbacks,
  };
  return (
    <div className="generic-component-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {props.layout.map((primitive, i) => (
        <PrimitiveErrorBoundary key={i}>
          {renderPrimitive(primitive, ctx, i)}
        </PrimitiveErrorBoundary>
      ))}
    </div>
  );
}