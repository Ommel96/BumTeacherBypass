import { TutorialStartButton } from '@/components/Tutorial';

export const metadata = {
  title: 'Dokumentation — BumTeacherBypass',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-sm scroll-mt-20">
      <h2 className="font-serif text-xl font-bold mb-3 text-[var(--accent-dark)]">{title}</h2>
      <div className="text-sm leading-relaxed text-[var(--text)] space-y-3">{children}</div>
    </section>
  );
}

const TOC = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'einrichtung', label: 'Einrichtung' },
  { id: 'ablauf', label: 'Vom Dokument zum Arbeitsblatt' },
  { id: 'arbeitsblaetter', label: 'Arbeitsblätter benutzen' },
  { id: 'kompendium', label: 'Kompendium' },
  { id: 'tipps', label: 'Tipps zur Modellwahl' },
  { id: 'fehlerbehebung', label: 'Fehlerbehebung' },
];

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-1">Hilfe</div>
          <h1 className="font-serif text-3xl font-bold">Dokumentation</h1>
        </div>
        <TutorialStartButton />
      </div>

      <nav className="bg-white border border-[var(--border)] rounded-xl p-4 shadow-sm mb-6 flex flex-wrap gap-x-4 gap-y-1">
        {TOC.map(t => (
          <a key={t.id} href={`#${t.id}`} className="text-sm text-[var(--accent)] no-underline hover:underline">{t.label}</a>
        ))}
      </nav>

      <div className="space-y-6">
        <Section id="ueberblick" title="Überblick">
          <p>
            BumTeacherBypass verwandelt statische PDF- und Word-Arbeitsblätter in <strong>interaktive Lernerlebnisse</strong>.
            Der Name ist Programm: Statt Antworten auf leere Linien zu schreiben und auf Korrektur zu warten, bekommst du
            Aufgaben mit sofortiger Bewertung, Algorithmus-Simulatoren, Quizze und ein automatisch wachsendes Nachschlagewerk.
          </p>
          <p>Die App besteht aus drei Teilen:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Arbeitsblätter</strong> — aus deinen Dokumenten generiert, mit prüfbaren Antworten und interaktiven Komponenten</li>
            <li><strong>Kompendium</strong> — ein Wissens-Lexikon, das sich aus allen hochgeladenen Dokumenten speist</li>
            <li><strong>KI-Pipeline</strong> — mehrere KI-Modelle, die Dokumente analysieren, anreichern und prüfen</li>
          </ul>
        </Section>

        <Section id="einrichtung" title="Einrichtung">
          <p><strong>1. App starten.</strong> Empfohlen wird Docker:</p>
          <pre className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 font-mono text-xs overflow-x-auto">docker compose up -d --build</pre>
          <p>
            Die App läuft danach auf Port 3847. Alle Daten (Datenbank, Uploads) liegen im Docker-Volume <code className="font-mono text-xs bg-[var(--accent-light)] px-1 py-0.5 rounded">db-data</code> und überleben Updates.
          </p>
          <p><strong>2. KI-Anbieter anlegen</strong> (Settings → Anbieter):</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Unterstützt: <strong>OpenAI</strong>, <strong>Anthropic</strong>, <strong>Ollama</strong> und beliebige <strong>OpenAI-kompatible</strong> Endpunkte</li>
            <li>API-Key eintragen und mit <em>„Verbindung testen“</em> verifizieren</li>
            <li>Mehrere Anbieter parallel sind möglich</li>
          </ul>
          <p><strong>3. Rollen zuweisen</strong> (optional, aber empfohlen). Jede Rolle kann ein eigenes Modell nutzen:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Struktur</strong> — erfasst den Inhalt des Dokuments (Pass 1)</li>
            <li><strong>Anreicherung</strong> — erzeugt Interaktivität, Lösungen und Wissens-Checks (Pass 2). <em>Hier lohnt sich das stärkste Modell.</em></li>
            <li><strong>Review</strong> — prüft Antworten und Vollständigkeit (Pass 3, abschaltbar über „Review aktivieren“)</li>
            <li><strong>Kompendium</strong> — schreibt die Lexikon-Einträge</li>
            <li><strong>Leichtgewicht</strong> — kleine Aufgaben wie die automatische Klassifizierung</li>
          </ul>
        </Section>

        <Section id="ablauf" title="Vom Dokument zum Arbeitsblatt">
          <p>
            Auf der Startseite ein PDF- oder Word-Dokument hochladen und dem Raster <em>Lehrjahr → Semester → Modul → Thema</em> zuordnen
            (bei aktivierter automatischer Klassifizierung schlägt die KI die Zuordnung vor). Danach durchläuft jede Seite drei Pässe:
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Pass 1 — Struktur:</strong> Der Inhalt wird originalgetreu erfasst: Aufgaben, Tabellen, Beispiele, Geschichten.
              Nichts geht verloren.
            </li>
            <li>
              <strong>Pass 2 — Anreicherung:</strong> Aufgaben werden interaktiv: passende Simulatoren mit den Daten aus dem Dokument,
              erwartete Antworten für die „Prüfen“-Buttons, Tipps und Kompendium-Verweise. Offene Papier-Aufgaben
              („recherchiere…“, „probiere aus…“) bleiben erhalten und werden um automatisch bewertbare
              <strong> Wissens-Checks</strong> und <strong>Zusatzübungen</strong> ergänzt — das Ziel ist ein besseres Arbeitsblatt
              als das Original, nicht eine Kopie.
            </li>
            <li>
              <strong>Pass 3 — Review:</strong> Ein Prüfmodell rechnet Lösungen nach, ergänzt Fehlendes und korrigiert
              Falsches. Zusätzlich validiert die App alles maschinell Prüfbare selbst (z.&nbsp;B. XOR-Lösungen, Quiz-Antworten)
              und repariert fehlende erwartete Antworten in einem gezielten Nachlauf.
            </li>
          </ol>
          <p>
            Parallel dazu entsteht der <strong>Kompendium-Eintrag</strong> zum Thema, angereichert mit Web-Recherche.
            Die Verarbeitungszeiten der Pässe siehst du auf der Dokumentseite.
          </p>
        </Section>

        <Section id="arbeitsblaetter" title="Arbeitsblätter benutzen">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Prüfen:</strong> Antwort eintippen, „Prüfen“ klicken — richtig/falsch mit Hinweis. Eingaben werden automatisch gespeichert.</li>
            <li><strong>Simulatoren:</strong> LZ77/LZ78/LZW, Huffman-Bäume, XOR-Rechner, Wahrheitstabellen, Pixel-Grids, Zahlensystem-Umrechner u.&nbsp;v.&nbsp;m. — plus frei zusammengesetzte Komponenten, wenn nichts Vorgefertigtes passt.</li>
            <li><strong>Tipps:</strong> „Tipp anzeigen“ gibt einen Hinweis, ohne die Lösung zu verraten.</li>
            <li><strong>Mathematik:</strong> Formeln werden als echtes LaTeX gerendert — in Aufgaben, Tabellen und im Kompendium.</li>
            <li><strong>Neu erstellen:</strong> Generiert die Seite komplett neu (z.&nbsp;B. mit einem besseren Modell). Ältere Fassungen bleiben unter „Versionen“ abrufbar.</li>
            <li><strong>Exportieren / Original:</strong> Das Arbeitsblatt als Datei exportieren oder das Quelldokument ansehen.</li>
          </ul>
        </Section>

        <Section id="kompendium" title="Kompendium">
          <p>
            Das Kompendium ist das automatisch entstehende Nachschlagewerk der App. Pro Thema entsteht ein Eintrag mit
            Erklärungen, Formeln, Tabellen und <strong>interaktiven Demos</strong> (Schritt-für-Schritt-Rechner, Diagramme, Beispielrechnungen).
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Neue Dokumente zum selben Thema <strong>erweitern</strong> bestehende Einträge, statt Duplikate zu erzeugen</li>
            <li>Arbeitsblätter verlinken passende Einträge direkt bei den Aufgaben</li>
            <li>Einträge lassen sich einzeln neu generieren oder löschen</li>
          </ul>
        </Section>

        <Section id="tipps" title="Tipps zur Modellwahl">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Anreicherung ist der Qualitätshebel:</strong> Dieses Modell erfindet die Interaktivität und rechnet die Lösungen. Wenn Arbeitsblätter langweilig oder fehlerhaft ausfallen, zuerst hier ein stärkeres Modell einsetzen.</li>
            <li><strong>Struktur</strong> darf günstig sein — es überträgt hauptsächlich Inhalte in ein festes Format.</li>
            <li><strong>Review aktiviert lassen:</strong> Der dritte Pass fängt falsche Lösungen ab. Ohne Review schwankt die Qualität deutlich stärker.</li>
            <li><strong>Schwankende Ergebnisse?</strong> „Neu erstellen“ würfelt neu — oft reicht ein zweiter Durchlauf. Sonst Modellrollen prüfen.</li>
            <li><strong>Server-Logs lesen lohnt sich:</strong> <code className="font-mono text-xs bg-[var(--accent-light)] px-1 py-0.5 rounded">docker logs bumteacherbypass</code> zeigt, was die Pässe getan haben (Anzahl Komponenten, automatische Korrekturen, abgelehnte Reviews).</li>
          </ul>
        </Section>

        <Section id="fehlerbehebung" title="Fehlerbehebung">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>„fetch failed“ / EAI_AGAIN beim Verarbeiten:</strong> DNS-Problem im Docker-Container, typisch nach Netzwerk-/VPN-Wechsel
              auf dem Host. Container neu starten (<code className="font-mono text-xs bg-[var(--accent-light)] px-1 py-0.5 rounded">docker restart bumteacherbypass</code>).
              Die compose-Datei pinnt inzwischen öffentliche DNS-Server, was das Problem dauerhaft vermeidet.
            </li>
            <li>
              <strong>Native-Module-Fehler (better-sqlite3) beim lokalen Start:</strong> Die App in Docker starten oder
              <code className="font-mono text-xs bg-[var(--accent-light)] px-1 py-0.5 rounded"> npm rebuild better-sqlite3</code> mit einer unterstützten Node-Version ausführen.
            </li>
            <li>
              <strong>Rote Warnungen beim Build:</strong> ESLint- und npm-Hinweise sind normal und brechen den Build nicht ab.
              Entscheidend ist, ob <code className="font-mono text-xs bg-[var(--accent-light)] px-1 py-0.5 rounded">docker compose up -d --build</code> am Ende erfolgreich durchläuft.
            </li>
            <li>
              <strong>Dokument hängt in „Verarbeitung“:</strong> Nach einem Neustart wird es automatisch als Fehler markiert und kann neu verarbeitet werden.
            </li>
            <li>
              <strong>Leeres oder schwaches Arbeitsblatt:</strong> Quelldokument prüfen (reine Bild-PDFs brauchen ein Vision-fähiges Modell),
              dann „Neu erstellen“ — ggf. mit stärkerem Anreicherungs-Modell.
            </li>
          </ul>
        </Section>
      </div>

      <div className="mt-8 text-center text-sm text-[var(--text-muted)]">
        Fragen offen? Das Tutorial lässt sich oben jederzeit erneut starten.
      </div>
    </div>
  );
}
