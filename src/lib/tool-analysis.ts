import { AIProvider, type ProviderConfig } from './ai-provider';
import { getProviderConfigForRole } from './providers-store';

export interface ToolSuggestion {
  type: 'pixelGrid' | 'bitVisualizer' | 'truthTable' | 'encodingExercise' | 'huffmanTreeBuilder' | 'lz77Simulator' | 'lz78Simulator' | 'compressionTable';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  sectionIndex?: number;
  suggestedConfig?: Record<string, unknown>;
}

export interface ToolAnalysisResult {
  suggestions: ToolSuggestion[];
  summary: string;
}

const TOOL_ANALYSIS_PROMPT = `You analyze educational documents and suggest which interactive components would enhance the learning experience. Respond with ONLY a JSON object.

Available interactive components:
- pixelGrid: Clickable pixel grid for RLE/binary encoding, image creation exercises. Use when: RLE encoding, binary pixel images, image patterns, encoding/decoding visual data.
- bitVisualizer: Toggleable bits showing decimal/hex conversion. Use when: binary number conversion, bit positions, powers of 2, byte/word representation.
- truthTable: Truth table with dropdown selectors for logic gate outputs. Use when: logic gates (AND, OR, NOT, XOR, NAND, NOR), boolean algebra, digital circuits.
- encodingExercise: Format conversion exercises with worked examples. Use when: converting between number systems (binary↔decimal↔hex), ASCII encoding, Morse code, any format transformation.
- huffmanTreeBuilder: Interactive Huffman tree construction from frequency tables. Use when: Huffman coding, frequency tables, variable-length codes, entropy coding, compression trees.
- lz77Simulator: Step-by-step LZ77 sliding window compression visualization. Use when: LZ77 algorithm, sliding window, buffer/lookahead, triple encoding.
- lz78Simulator: Fillable compression table for LZ78 encoding with dictionary tracking. Use when: LZ78 algorithm, dictionary compression, pair encoding.
- compressionTable: Fillable compression/decompression table for LZ77/LZ78/LZW algorithms. Use when: compression algorithms need tabular input, fill-in tables for encoding/decoding steps.

Analyze the document text and suggest which components would improve it. Consider:
1. Does the content already describe exercises that would be better as interactive widgets?
2. Are there topics where students benefit from hands-on manipulation?
3. Would visual representation help understanding?

JSON structure:
{
  "suggestions": [
    {
      "type": "pixelGrid|bitVisualizer|truthTable|encodingExercise",
      "confidence": "high|medium|low",
      "reason": "Short German explanation why this component fits",
      "keywords": ["list", "of", "relevant", "keywords", "found", "in", "text"]
    }
  ],
  "summary": "Brief German summary of what interactive components this document would benefit from"
}

Be specific. Only suggest components that genuinely match the content. High confidence = the document explicitly covers this topic. Medium = related topic that could benefit. Low = tangentially related.`;

export async function analyzeDocumentForTools(
  rawText: string,
  providerConfig?: ProviderConfig
): Promise<ToolAnalysisResult> {
  const config = providerConfig || getProviderConfigForRole('lightweight');
  const provider = new AIProvider(config);

  try {
    const result = await provider.classifyDocument(rawText, []);
    
    const textToAnalyze = rawText.substring(0, 3000);
    const analysisPrompt = `${TOOL_ANALYSIS_PROMPT}\n\nDocument text:\n${textToAnalyze}`;

    const responseText = await (provider as any).callProvider
      ? await (provider as any).callProvider(TOOL_ANALYSIS_PROMPT, `Analyze this document for interactive components:\n\n${textToAnalyze}`)
      : '';

    if (!responseText) {
      return {
        suggestions: [],
        summary: 'Analyse nicht verfügbar',
      };
    }

    const parsed = JSON.parse(responseText);
    const suggestions: ToolSuggestion[] = (parsed.suggestions || []).map((s: any) => ({
      type: s.type || 'encodingExercise',
      confidence: s.confidence || 'low',
      reason: s.reason || '',
    }));

    return {
      suggestions,
      summary: parsed.summary || '',
    };
  } catch (error) {
    console.error('Tool analysis error:', error);
    return {
      suggestions: [],
      summary: 'Analyse fehlgeschlagen',
    };
  }
}

export function analyzeTextForToolHints(text: string): ToolSuggestion[] {
  const lower = text.toLowerCase();
  const suggestions: ToolSuggestion[] = [];

  const pixelPatterns = [
    /rle|run.length|lauf.länge|pixel.*bild|bild.*codier|bild.*encod|raster/i,
    /bitmap|pixel.*grid|pixel.*matrix|zeichnung.*cod|bild.*komprim/i,
  ];
  if (pixelPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'pixelGrid',
      confidence: 'high',
      reason: 'Dokument enthält RLE/Pixel-Bild-Encoding-Themen',
    });
  }

  const bitPatterns = [
    /bit.*stell|bit.*position|bit.*wert|dual.*zahl|binär.*zahl.*umrechn/i,
    /byte.*darstell|wort.*breite|8.bit|16.bit|32.bit|vorzeichen.*bit/i,
  ];
  if (bitPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'bitVisualizer',
      confidence: 'high',
      reason: 'Dokument enthält Bit-Position/Wert-Themen',
    });
  }

  const truthPatterns = [
    /wahrheitstabelle|truth.table|logisch.*gatter|logic.*gate/i,
    /AND.*gatter|OR.*gatter|NOT.*gatter|XOR|NAND|NOR/i,
    /bool.*algebra|schalt.*algebra|verknüpfung/i,
  ];
  if (truthPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'truthTable',
      confidence: 'high',
      reason: 'Dokument enthält Logik-Gatter/Wahrheitstabelle-Themen',
    });
  }

  const encodingPatterns = [
    /zahlensystem|dezimal.*binär|binär.*dezimal|hexadezimal|oktal/i,
    /umrechnen.*zahl|konvertier.*zahl|codier.*zahl|morse.*code|ascii/i,
    /2.*er.*komplement|einer.*komplement/i,
  ];
  if (encodingPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'encodingExercise',
      confidence: 'high',
      reason: 'Dokument enthält Zahlensystem/Kodierungs-Themen',
    });
  }

  const huffmanPatterns = [
    /huffman|huffmann|häufigkeit.*tabelle|häufigkeits.*verteilung/i,
    /variable.*länge.*code|präfix.*code|entropie.*kodier/i,
    /buchstaben.*häufigkeit|zeichen.*häufigkeit/i,
  ];
  if (huffmanPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'huffmanTreeBuilder',
      confidence: 'high',
      reason: 'Dokument enthält Huffman-Kodierungs-Themen',
    });
  }

  const lz77Patterns = [
    /lz77|sliding.*window|gleitendes.*fenster|suchpuffer/i,
    /lz.*77.*kodier|lz.*77.*kompression|puffer.*vorschau/i,
    /tripel.*kodier|rückwärts.*referenz/i,
  ];
  if (lz77Patterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'lz77Simulator',
      confidence: 'high',
      reason: 'Dokument enthält LZ77-Kompressions-Themen',
    });
  }

  const lz78Patterns = [
    /lz78|lz.*78|wörterbuch.*kodier|dictionary.*compression/i,
    /lz.*78.*kodier|lz.*78.*kompression|paar.*kodier/i,
    /lzw|lempel.*ziv.*welch/i,
  ];
  if (lz78Patterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'lz78Simulator',
      confidence: 'high',
      reason: 'Dokument enthält LZ78/LZW-Kompressions-Themen',
    });
  }

  const compressionTablePatterns = [
    /kompressions.*tabelle|dekodierungs.*tabelle|kodierungs.*tabelle/i,
    /komprimier.*verfahren|kompression.*algorithmus/i,
  ];
  if (compressionTablePatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'compressionTable',
      confidence: 'medium',
      reason: 'Dokument enthält Kompressions-Tabellen-Themen',
    });
  }

  return suggestions;
}