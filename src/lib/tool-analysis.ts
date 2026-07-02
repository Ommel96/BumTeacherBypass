export interface ToolSuggestion {
  type: 'pixelGrid' | 'bitVisualizer' | 'truthTable' | 'encodingExercise' | 'huffmanTreeBuilder' | 'lz77Simulator' | 'lz78Simulator' | 'compressionTable' | 'xorCalculator' | 'asymmetricFlow' | 'choiceMatrix' | 'dropdownChoice';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  sectionIndex?: number;
  suggestedConfig?: Record<string, unknown>;
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

  const xorPatterns = [
    /xor|exklusiv.*oder|exklusiv.*oder.*verknüpfung/i,
    /bit.*xor|xor.*bit|xor.*operation|xor.*rechner/i,
    / bitwise.*xor|xor.*verknüpfung.*bit/i,
  ];
  if (xorPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'xorCalculator',
      confidence: 'high',
      reason: 'Dokument enthält XOR-Verknüpfungs-Themen',
    });
  }

  const asymmetricPatterns = [
    /asymmetrisch.*verschlüssel|public.*key.*private.*key/i,
    /öffentlicher.*schlüssel|privater.*schlüssel|schlüsselpaar/i,
    /alice.*bob|rsa.*verschlüssel|asymmetrische.*kryptograph/i,
    /verschlüssel.*öffentlich.*entschlüssel.*privat/i,
  ];
  if (asymmetricPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'asymmetricFlow',
      confidence: 'high',
      reason: 'Dokument enthält asymmetrische Verschlüsselungs-Themen',
    });
  }

  const choiceMatrixPatterns = [
    /wahr.*falsch|true.*false|richtig.*falsch/i,
    /multiple.*choice|mehrfach.*auswahl|kreuz.*tabelle|antwort.*tabelle/i,
    /kreuzen.*zutreff|markier.*zutreff|zutreffend.*kreuz/i,
    /ja.*nein.*tabelle|zustimm.*ablehn/i,
  ];
  if (choiceMatrixPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'choiceMatrix',
      confidence: 'high',
      reason: 'Dokument enthält Multiple-Choice/Wahr-Falsch-Aufgaben',
    });
  }

  const dropdownPatterns = [
    /dropdown|auswahl.*liste|wähle.*aus|welche.*der.*folgend/i,
    /ordne.*zu|zuordnung.*auswahl|auswahl.*möglichkeit/i,
    /kreuz.*die.*richtige.*antwort|wähle.*die.*richtige/i,
  ];
  if (dropdownPatterns.some(p => p.test(lower))) {
    suggestions.push({
      type: 'dropdownChoice',
      confidence: 'medium',
      reason: 'Dokument enthält Auswahl-/Zuordnungsaufgaben',
    });
  }

  return suggestions;
}