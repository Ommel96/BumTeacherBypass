'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Render a LaTeX string using KaTeX.
 * Supports both inline (\(...\)) and display (\[...\]) modes.
 */
export function Latex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html',
        trust: true,
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Parse mixed text containing inline LaTeX \(...\) and display LaTeX \[...\]
 * and render the parts appropriately.
 */
export function LatexText({ text }: { text: string }) {
  const parts = useMemo(() => parseLatexSegments(text), [text]);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'inline') {
          return <Latex key={i} tex={part.content} display={false} />;
        }
        if (part.type === 'display') {
          return (
            <div key={i} className="my-2">
              <Latex tex={part.content} display />
            </div>
          );
        }
        return <span key={i}>{part.content}</span>;
      })}
    </>
  );
}

type Segment = { type: 'text' | 'inline' | 'display'; content: string };

function parseLatexSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match \(...\), \[...\], $$...$$, $...$ (models mix all four), or plain text between them.
  // Single-$ requires non-space content on both ends to avoid eating prose like "5 $ pro Stück".
  const regex = /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$([^\s$](?:[^$\n]*[^\s$])?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'inline', content: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ type: 'display', content: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ type: 'display', content: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ type: 'inline', content: match[4] });
    }
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments.length === 0 ? [{ type: 'text', content: text }] : segments;
}