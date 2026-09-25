// Optional semantic search. With VOYAGE_API_KEY set, every passage gets an
// embedding at import time and retrieval fuses vector similarity with the
// German full-text search. Without it, full-text search alone does the work
// (with Claude writing the search queries), which is good but misses the odd
// paraphrase: "Sondervermögen Infrastruktur" vs. "Investitionen in Brücken".
//
// Voyage is the embeddings provider Anthropic recommends; its models are
// multilingual, which matters for German source text.

export function createVoyageEmbedder({ apiKey, model, fetch = globalThis.fetch, baseUrl = 'https://api.voyageai.com/v1' }) {
  if (!apiKey) return null;
  const BATCH = 64;

  async function embed(texts, inputType) {
    const out = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const input = texts.slice(i, i + BATCH);
      let res;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input, model, input_type: inputType }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
      if (!res.ok) throw new Error(`Voyage antwortete ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      for (const d of sorted) out.push(d.embedding);
    }
    return out;
  }

  return { model, embed };
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
