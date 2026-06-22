# Interactive Component Registry

This file documents all available interactive worksheet components.
When adding a new component, update this file, then update:
1. `src/lib/worksheet-schema.ts` — Add the props interface and union type
2. `src/components/worksheet/InteractiveComponents.tsx` — Add the React component
3. `src/lib/ai-provider.ts` — Add to `buildEnrichmentPrompt()` interactive component docs
4. `src/lib/tool-analysis.ts` — Add pattern detection for `analyzeTextForToolHints()`
5. `src/app/globals.css` — Add CSS styles

## Tool Gap Detection

When the AI encounters content that would benefit from an interactive component that doesn't exist yet, it emits a `toolGaps` array in its response alongside the worksheet JSON. These gaps are automatically saved to `data/tool-gaps.json` and can be viewed at `/api/tool-gaps`.

Each tool gap has:
- `name`: Suggested camelCase tool name (e.g. `dragAndDrop`, `numberLine`)
- `reason`: Why this tool would help (in German)
- `contentExample`: Brief example of the content that needs it
- `suggestedProps`: What props/config the tool would need

Use `GET /api/tool-gaps` to see all detected gaps. Use `DELETE /api/tool-gaps` to clear them.

## Available Components

### pixelGrid
- **Type**: `pixelGrid`
- **Purpose**: Clickable pixel grid for RLE/binary encoding exercises. Students tick boxes to create/decode images.
- **Props**: `width`, `height`, `fieldId`, `encodingType` (rle|binary|none), `encodingDirection` (row|col), `solution` (0/1 array), `labels`
- **Detection patterns**: RLE, run-length, Lauf.länge, pixel, bitmap, Bildkodierung, Raster
- **AI trigger**: Content about pixel images, RLE encoding, binary grids, image patterns

### bitVisualizer
- **Type**: `bitVisualizer`
- **Purpose**: Toggleable bits showing decimal/hex conversion. Click bits on/off, see values update.
- **Props**: `bits`, `fieldId`, `labels`, `showDecimal`, `showHex`
- **Detection patterns**: Bit.stell., Bit.position, Dual.zahl, Binär.zahl, Byte, Vorzeichen.bit
- **AI trigger**: Content about binary number representation, bit positions, powers of 2

### truthTable
- **Type**: `truthTable`
- **Purpose**: Truth table with dropdown selectors for logic gate output values.
- **Props**: `inputs`, `outputLabel`, `fieldId`
- **Detection patterns**: Wahrheitstabelle, truth.table, Logisch.gatter, logic.gate, AND.gatter, OR.gatter, Schalt.algebra
- **AI trigger**: Content about logic gates, boolean algebra, digital circuits

### encodingExercise
- **Type**: `encodingExercise`
- **Purpose**: Format conversion exercises with worked examples and practice inputs.
- **Props**: `encodingType` (binary|hex|ascii|rle|morse), `fromFormat`, `toFormat`, `examples`, `exercises`, `fieldId`
- **Detection patterns**: Zahlensystem, Dezimal.Binär, Hexadezimal, Oktal, Morse, ASCII, Kodierung, Umrechnen
- **AI trigger**: Content about number system conversions, encoding/decoding exercises

## Future Components (Ideas)

These are components we may want to add in the future:

### asciiTable
- Interactive ASCII table with search/filter, click to see binary/hex/octal
- Detection: ASCII, Zeichentabelle, Unicode

### circuitBuilder
- Drag-and-drop logic gate builder with input/output tracing
- Detection: Schaltung, Schaltplan, Gatter.verknüpfung

### huffmanTreeBuilder
- **Type**: `huffmanTreeBuilder`
- **Purpose**: Interactive Huffman tree construction from frequency tables. Students fill in binary codes for each character based on frequency.
- **Props**: `fieldId`, `initialString` (string to compute frequency from), `frequencyTable` (optional manual), `solution` (optional HuffmanTreeNode)
- **Detection patterns**: Huffman, Häufigkeitstabelle, variable-length code, Präfix-Code, Entropiekodierung
- **AI trigger**: Content about Huffman coding, frequency tables, variable-length codes, compression trees

### lz77Simulator
- **Type**: `lz77Simulator`
- **Purpose**: Step-by-step LZ77 sliding window compression visualization. Shows buffer and lookahead window moving through the input string.
- **Props**: `fieldId`, `inputString`, `bufferSize`, `lookaheadSize`, `solution` (optional array of triples), `stepByStep`
- **Detection patterns**: LZ77, Sliding Window, gleitendes Fenster, Suchpuffer, Rückwärtsreferenz, Tripelkodierung
- **AI trigger**: Content about LZ77 algorithm, sliding window compression, buffer/lookahead encoding

### lz78Simulator
- **Type**: `lz78Simulator`
- **Purpose**: Fillable compression table for LZ78 encoding with dictionary tracking. Students fill in output pairs and dictionary entries step by step.
- **Props**: `fieldId`, `algorithm` (always 'lz78'), `direction` ('encode'|'decode'), `inputString`, `solution` (optional array of CompressionTableRow)
- **Detection patterns**: LZ78, Wörterbuchkodierung, Dictionary Compression, Paarkodierung
- **AI trigger**: Content about LZ78 algorithm, dictionary compression, pair encoding

### compressionTable
- **Type**: `compressionTable`
- **Purpose**: General-purpose fillable compression/decompression table for LZ77/LZ78/LZW algorithms. Students fill in each step's output and dictionary entries.
- **Props**: `fieldId`, `algorithm` ('lz77'|'lz78'|'lzw'), `direction` ('encode'|'decode'), `inputString`, `bufferSize`, `lookaheadSize`, `solution` (optional array of CompressionTableRow)
- **Detection patterns**: Kompressionstabelle, Dekodierungstabelle, Kodierungstabelle, Kompressionsverfahren
- **AI trigger**: Content about compression algorithms that need tabular step-by-step input
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