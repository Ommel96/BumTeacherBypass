# Interactive Component Registry

This file documents all available interactive worksheet components.
When adding a new component, update this file, then update:
1. `src/lib/worksheet-schema.ts` — Add the props interface and union type
2. `src/components/worksheet/InteractiveComponents.tsx` — Add the React component
3. `src/lib/ai-provider.ts` — Add to `buildEnrichmentPrompt()` interactive component docs
4. `src/lib/tool-analysis.ts` — Add pattern detection for `analyzeTextForToolHints()`
5. `src/lib/worksheet-schema.ts` — Add to `validateWorksheetData()` interactive type allowlist
6. `src/app/globals.css` — Add CSS styles

## Tool Gap Detection

When the AI encounters content that would benefit from an interactive component that doesn't exist yet, it emits a `toolGaps` array in its response alongside the worksheet JSON. These gaps are automatically saved to `data/tool-gaps.json` and can be viewed at `/api/tool-gaps`.

Each tool gap has:
- `name`: Suggested camelCase tool name (e.g. `dragAndDrop`, `numberLine`)
- `reason`: Why this tool would help (in German)
- `contentExample`: Brief example of the content that needs it
- `suggestedProps`: What props/config the tool would need

Use `GET /api/tool-gaps` to see all detected gaps. Use `DELETE /api/tool-gaps` to clear them.

## Available Components (13)

### custom (Generic Component)
- **Type**: `custom`
- **Purpose**: A composable layout tree that the AI assembles from primitives when no named component fits. Instead of emitting a toolGap, the AI builds a custom component from 14 composable primitives.
- **Props**: `fieldId`, `layout` (array of primitives)
- **Primitives**: `display`, `input`, `textarea`, `table`, `toggleGrid`, `dropdown`, `stepper`, `codeLine`, `checkButton`, `resetButton`, `solutionButton`, `row`, `col`, `repeat`
- **Detection**: Used as fallback for any content that doesn't fit a named component. Preferred over toolGaps.
- **Self-learning**: Custom component specs are stored in the worksheet JSON and can be pattern-matched for reuse on similar future content.

### pixelGrid
- **Type**: `pixelGrid`
- **Purpose**: Clickable pixel grid for RLE/binary encoding exercises. Students tick boxes to create/decode images.
- **Props**: `width`, `height`, `fieldId`, `encodingType` (rle|binary|none), `encodingDirection` (row|col), `solution` (0/1 array), `labels`
- **Detection patterns**: RLE, run-length, Lauf.länge, pixel, bitmap, Bildkodierung, Raster

### bitVisualizer
- **Type**: `bitVisualizer`
- **Purpose**: Toggleable bits showing decimal/hex conversion. Click bits on/off, see values update.
- **Props**: `bits`, `fieldId`, `labels`, `showDecimal`, `showHex`
- **Detection patterns**: Bit.stell., Bit.position, Dual.zahl, Binär.zahl, Byte, Vorzeichen.bit

### truthTable
- **Type**: `truthTable`
- **Purpose**: Truth table with dropdown selectors for logic gate output values.
- **Props**: `inputs`, `outputLabel`, `fieldId`
- **Detection patterns**: Wahrheitstabelle, truth.table, Logisch.gatter, logic.gate, AND.gatter, OR.gatter, Schalt.algebra

### encodingExercise
- **Type**: `encodingExercise`
- **Purpose**: Format conversion exercises with worked examples and practice inputs.
- **Props**: `encodingType` (binary|hex|ascii|rle|morse), `fromFormat`, `toFormat`, `examples`, `exercises`, `fieldId`
- **Detection patterns**: Zahlensystem, Dezimal.Binär, Hexadezimal, Oktal, Morse, ASCII, Kodierung, Umrechnen

### huffmanTreeBuilder
- **Type**: `huffmanTreeBuilder`
- **Purpose**: Interactive Huffman tree construction from frequency tables. Students fill in binary codes for each character based on frequency.
- **Props**: `fieldId`, `initialString` (string to compute frequency from), `frequencyTable` (optional manual), `solution` (optional HuffmanTreeNode)
- **Detection patterns**: Huffman, Häufigkeitstabelle, variable-length code, Präfix-Code, Entropiekodierung

### lz77Simulator
- **Type**: `lz77Simulator`
- **Purpose**: Step-by-step LZ77 sliding window compression visualization. Shows buffer and lookahead window moving through the input string. Supports both encode and decode directions.
- **Props**: `fieldId`, `inputString`, `bufferSize`, `lookaheadSize`, `solution` (optional array of triples), `stepByStep`, `direction` ('encode'|'decode'), `decodeInput` (for decode mode)
- **Detection patterns**: LZ77, Sliding Window, gleitendes Fenster, Suchpuffer, Rückwärtsreferenz, Tripelkodierung

### lz78Simulator
- **Type**: `lz78Simulator`
- **Purpose**: Fillable compression table for LZ78 encoding with dictionary tracking. Students fill in output pairs and dictionary entries step by step. Supports encode and decode.
- **Props**: `fieldId`, `algorithm` (always 'lz78'), `direction` ('encode'|'decode'), `inputString`, `solution` (optional array of CompressionTableRow)
- **Detection patterns**: LZ78, Wörterbuchkodierung, Dictionary Compression, Paarkodierung

### compressionTable
- **Type**: `compressionTable`
- **Purpose**: General-purpose fillable compression/decompression table for LZ77/LZ78/LZW algorithms. Students fill in each step's output and dictionary entries.
- **Props**: `fieldId`, `algorithm` ('lz77'|'lz78'|'lzw'), `direction` ('encode'|'decode'), `inputString`, `bufferSize`, `lookaheadSize`, `solution` (optional array of CompressionTableRow)
- **Detection patterns**: Kompressionstabelle, Dekodierungstabelle, Kodierungstabelle, Kompressionsverfahren

### xorCalculator
- **Type**: `xorCalculator`
- **Purpose**: Bitwise XOR calculator. Shows two binary inputs bit-by-bit, student fills in each result bit and the final result.
- **Props**: `fieldId`, `bits` (default 8), `inputA`, `inputB`, `solution`
- **Detection patterns**: XOR, exklusiv.oder, bitwise.xor, xor.rechner

### asymmetricFlow
- **Type**: `asymmetricFlow`
- **Purpose**: Stepped visualization of asymmetric encryption (public/private key exchange). Shows sender/receiver with key pairs, step-by-step flow with student text input per step.
- **Props**: `fieldId`, `sender`, `receiver`, `message`, `steps` (optional array of {label, description})
- **Detection patterns**: asymmetrisch.verschlüssel, public.key.private.key, öffentlicher.schlüssel, privater.schlüssel, Alice.Bob, RSA

### choiceMatrix
- **Type**: `choiceMatrix`
- **Purpose**: True/false or multi-select clickable grid. Students click cells to mark answers, then press "Prüfen" for inline grading.
- **Props**: `fieldId`, `columns` (e.g. ["Wahr", "Falsch"]), `rows` (array of {question, correctAnswers}), `multipleSelection`
- **Detection patterns**: wahr.falsch, true.false, richtig.falsch, multiple.choice, mehrfach.auswahl, kreuz.tabelle

### dropdownChoice
- **Type**: `dropdownChoice`
- **Purpose**: Questions where student picks from a dropdown list, or checkbox-style multi-select. Inline "Prüfen" grading.
- **Props**: `fieldId`, `rows` (array of {question, options, correctAnswers}), `multipleSelection`
- **Detection patterns**: dropdown, auswahl.liste, wähle.aus, welche.der.folgend, ordne.zu, zuordnung.auswahl

## Future Components (Ideas)

These are components we may want to add in the future:

### asciiTable
- Interactive ASCII table with search/filter, click to see binary/hex/octal
- Detection: ASCII, Zeichentabelle, Unicode

### circuitBuilder
- Drag-and-drop logic gate builder with input/output tracing
- Detection: Schaltung, Schaltplan, Gatter.verknüpfung

### numberLine
- Interactive number line for integer/fraction visualization
- Detection: Zahlengerade, Brüche, Intervall

### fractionVisualizer
- Pie chart / bar representation of fractions
- Detection: Bruch, Anteil, Bruchrechnung

### timeline
- Interactive timeline for historical/sequential events
- Detection: Zeitleiste, Chronologie, historisch

### codeExecutor
- Safe sandboxed code execution (Python/JS) with input/output
- Detection: Programmierung, Algorithmus, Code, Schleife

### dragAndDrop
- Matching exercise with draggable items and drop zones
- Detection: Zuordnung, Paare, Matching, Sortieren

### crosswordPuzzle
- Crossword grid with numbered clues
- Detection: Kreuzworträtsel, Rätsel, Lückentext

### mindMap
- Interactive mind map / concept map builder
- Detection: Mindmap, Konzeptkarte, Begriffskarte