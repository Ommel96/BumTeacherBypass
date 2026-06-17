const WIKI_API = 'https://de.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_SEARCH = 'https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=';
const WIKI_EXTRACTS = 'https://de.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&format=json&titles=';

export async function searchWikipedia(query: string): Promise<string> {
  try {
    const searchUrl = `${WIKI_SEARCH}${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) return '';
    const searchData = await searchRes.json();
    const results = searchData?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return '';

    const topTitles = results.slice(0, 3).map((r: Record<string, string>) => r.title);
    const extracts: string[] = [];

    for (const title of topTitles) {
      try {
        const url = `${WIKI_EXTRACTS}${encodeURIComponent(title)}&exsentences=10&origin=*`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const data = await res.json();
        const pages = data?.query?.pages;
        if (!pages) continue;
        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (page.extract) {
            extracts.push(`### ${page.title}\n${page.extract}`);
          }
        }
      } catch {}
    }

    return extracts.join('\n\n');
  } catch {
    return '';
  }
}

export async function researchTopic(keywords: string[]): Promise<string> {
  if (keywords.length === 0) return '';

  const results: string[] = [];

  const mainQuery = keywords.slice(0, 3).join(' ');
  const mainResult = await searchWikipedia(mainQuery);
  if (mainResult) results.push(mainResult);

  for (const kw of keywords.slice(0, 2)) {
    const result = await searchWikipedia(kw);
    if (result && !results.includes(result)) {
      results.push(result);
    }
  }

  return results.join('\n\n---\n\n');
}