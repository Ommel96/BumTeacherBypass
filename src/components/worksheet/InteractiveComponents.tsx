'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useWorksheet } from './WorksheetProvider';
import type { PixelGridProps, BitVisualizerProps, TruthTableProps, EncodingExerciseProps, HuffmanTreeProps, LZ77SimulatorProps, LZ77Triple, CompressionTableProps, XorCalculatorProps, AsymmetricFlowProps, ChoiceMatrixProps, DropdownChoiceProps } from '@/lib/worksheet-schema';

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

  if (direction === 'decode') {
    return <LZ77Decoder fieldId={fieldId} decodeInput={decodeInput || inputString} bufferSize={bufferSize} lookaheadSize={lookaheadSize} solution={solution} />;
  }

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