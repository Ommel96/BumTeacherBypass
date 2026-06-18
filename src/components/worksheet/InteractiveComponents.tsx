'use client';

import React, { useCallback, useMemo } from 'react';
import { useWorksheet } from './WorksheetProvider';
import type { PixelGridProps, BitVisualizerProps, TruthTableProps, EncodingExerciseProps } from '@/lib/worksheet-schema';

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

  const toggleCell = useCallback((index: number) => {
    const next = [...grid];
    next[index] = next[index] === 1 ? 0 : 1;
    setFieldValue(fieldId, JSON.stringify(next));
  }, [grid, fieldId, setFieldValue]);

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
    <div className="pixel-grid-container">
      <div className="pixel-grid-wrapper" style={{ display: 'inline-block' }}>
        <table className="pixel-grid-table" style={{ borderCollapse: 'collapse' }}>
          <thead>
            {labels?.cols && (
              <tr>
                {labels.cols.map((label, i) => (
                  <th key={i} className="pixel-grid-col-label">{label}</th>
                ))}
              </tr>
            )}
            {!labels?.cols && encodingType !== 'none' && (
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} className="pixel-grid-col-label">{i}</th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {Array.from({ length: height }, (_, rowIdx) => (
              <tr key={rowIdx}>
                {labels?.rows && (
                  <td className="pixel-grid-row-label">{labels.rows[rowIdx] || rowIdx}</td>
                )}
                {Array.from({ length: width }, (_, colIdx) => {
                  const idx = rowIdx * width + colIdx;
                  const isOn = grid[idx] === 1;
                  return (
                    <td key={colIdx}>
                      <button
                        type="button"
                        className={`pixel-cell ${isOn ? 'pixel-on' : 'pixel-off'}`}
                        onClick={() => toggleCell(idx)}
                        aria-label={`Zelle ${rowIdx},${colIdx}`}
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
                        {labels?.rows?.[rowIdx] ?? `Zeile ${rowIdx}`}:
                      </span>
                      <code className="pixel-encoding-value">{getEncoding(getRowData(rowIdx))}</code>
                    </div>
                  ))
                : Array.from({ length: width }, (_, colIdx) => (
                    <div key={colIdx} className="pixel-encoding-row">
                      <span className="pixel-encoding-row-label">
                        {labels?.cols?.[colIdx] ?? `Spalte ${colIdx}`}:
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