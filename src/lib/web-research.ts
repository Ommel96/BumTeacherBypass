const WIKI_SEARCH = 'https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=';
const WIKI_EXTRACTS = 'https://de.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&format=json&titles=';

async function fetchWikiExtract(title: string): Promise<string | null> {
  try {
    const url = `${WIKI_EXTRACTS}${encodeURIComponent(title)}&exsentences=10&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      if (page.extract) {
        return `### ${page.title}\n${page.extract}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function searchWikipedia(query: string): Promise<string> {
  try {
    const searchUrl = `${WIKI_SEARCH}${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return '';
    const searchData = await searchRes.json();
    const results = searchData?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return '';

    const topTitles = results.slice(0, 3).map((r: Record<string, string>) => r.title);

    // Fetch all extracts in parallel instead of sequentially
    const extracts = await Promise.allSettled(topTitles.map(t => fetchWikiExtract(t)));
    return extracts
      .map((r): string | null => (r.status === 'fulfilled' ? r.value : null))
      .filter((e): e is string => e !== null)
      .join('\n\n');
  } catch {
    return '';
  }
}

export async function researchTopic(keywords: string[]): Promise<string> {
  if (keywords.length === 0) return '';

  // Run main query and individual keyword queries in parallel
  const mainQuery = keywords.slice(0, 3).join(' ');
  const allQueries = [mainQuery, ...keywords.slice(0, 2)];

  const results = await Promise.allSettled(allQueries.map(q => searchWikipedia(q)));
  const texts = results
    .map((r): string | null => (r.status === 'fulfilled' ? r.value : null))
    .filter((e): e is string => e !== null && e.length > 0);

  // Deduplicate
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of texts) {
    if (!seen.has(text)) {
      seen.add(text);
      unique.push(text);
    }
  }

  return unique.join('\n\n---\n\n');
}