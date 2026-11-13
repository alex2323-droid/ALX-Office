export interface NoteAttachment {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'sqlite' | 'protobuf';
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface NoteDocument {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  body: string;
  pinned: boolean;
  updatedAt: string;
  checklist: NoteChecklistItem[];
  attachments: NoteAttachment[];
}

export interface PostingEntry {
  docId: string;
  field: 'title' | 'body' | 'tags' | 'folder' | 'checklist';
  tf: number;
  offsets: number[];
}

export interface SearchInvertedIndex {
  docCount: number;
  avgFieldLengths: {
    title: number;
    body: number;
    tags: number;
  };
  docLengths: Record<string, { title: number; body: number; tags: number }>;
  postings: Map<string, PostingEntry[]>;
  buildDurationMs: number;
}

export interface ParsedQuery {
  raw: string;
  terms: string[];
  phrases: string[];
  excludedTerms: string[];
  folders: string[];
  tags: string[];
  hasChecklist: boolean | null;
  hasAttachment: boolean | null;
  pinnedOnly: boolean;
}

export interface TermScoreBreakdown {
  term: string;
  idf: number;
  titleTf: number;
  bodyTf: number;
  tagsTf: number;
  contribution: number;
}

export interface SearchResult {
  doc: NoteDocument;
  score: number;
  matchedTerms: string[];
  snippet: string;
  highlights: { start: number; end: number }[];
  breakdown: TermScoreBreakdown[];
}

export interface SearchExecutionTrace {
  parsed: ParsedQuery;
  results: SearchResult[];
  queryDurationMs: number;
  candidateDocIds: string[];
  postingsExamined: number;
}

/**
 * Normalizes text similarly to Notes / Spotlight lexical folding:
 * 1. Unicode NFD decomposition + diacritic stripping (résumé -> resume)
 * 2. Lowercase folding
 * 3. CamelCase boundary insertion (NoteStore -> Note Store)
 */
export function normalizeForIndexing(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

export interface TokenSpan {
  token: string;
  start: number;
  end: number;
}

export function tokenizeWithSpans(text: string): TokenSpan[] {
  const normalized = normalizeForIndexing(text);
  const tokens: TokenSpan[] = [];
  const regex = /[a-z0-9_]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    tokens.push({
      token: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

export function buildSearchIndex(docs: NoteDocument[]): SearchInvertedIndex {
  const start = performance.now();
  const postings = new Map<string, PostingEntry[]>();
  const docLengths: Record<string, { title: number; body: number; tags: number }> = {};

  let totalTitle = 0;
  let totalBody = 0;
  let totalTags = 0;

  const addFieldTokens = (
    docId: string,
    field: PostingEntry['field'],
    text: string,
  ): number => {
    const spans = tokenizeWithSpans(text);
    const localOffsets = new Map<string, number[]>();

    for (const span of spans) {
      const list = localOffsets.get(span.token);
      if (list) {
        list.push(span.start);
      } else {
        localOffsets.set(span.token, [span.start]);
      }
    }

    for (const [token, offsets] of localOffsets.entries()) {
      const entry: PostingEntry = {
        docId,
        field,
        tf: offsets.length,
        offsets,
      };
      const existing = postings.get(token);
      if (existing) {
        existing.push(entry);
      } else {
        postings.set(token, [entry]);
      }
    }

    return spans.length;
  };

  for (const doc of docs) {
    const titleLen = addFieldTokens(doc.id, 'title', doc.title);
    const checklistText = doc.checklist.map((c) => c.text).join(' ');
    const bodyText = checklistText ? `${doc.body}\n${checklistText}` : doc.body;
    const bodyLen = addFieldTokens(doc.id, 'body', bodyText);
    const tagsLen = addFieldTokens(doc.id, 'tags', doc.tags.join(' '));
    addFieldTokens(doc.id, 'folder', doc.folder);

    docLengths[doc.id] = { title: titleLen, body: bodyLen, tags: tagsLen };
    totalTitle += titleLen;
    totalBody += bodyLen;
    totalTags += tagsLen;
  }

  const n = Math.max(1, docs.length);
  return {
    docCount: docs.length,
    avgFieldLengths: {
      title: totalTitle / n,
      body: totalBody / n,
      tags: totalTags / n,
    },
    docLengths,
    postings,
    buildDurationMs: Number((performance.now() - start).toFixed(3)),
  };
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = {
    raw,
    terms: [],
    phrases: [],
    excludedTerms: [],
    folders: [],
    tags: [],
    hasChecklist: null,
    hasAttachment: null,
    pinnedOnly: false,
  };

  const tokenRegex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(raw)) !== null) {
    if (match[1]) {
      const phraseNorm = normalizeForIndexing(match[1]).trim();
      if (phraseNorm) parsed.phrases.push(phraseNorm);
      continue;
    }

    const part = match[2];
    const lower = part.toLowerCase();

    if (lower.startsWith('folder:') && lower.length > 7) {
      parsed.folders.push(normalizeForIndexing(part.slice(7)));
    } else if (lower.startsWith('tag:') && lower.length > 4) {
      parsed.tags.push(normalizeForIndexing(part.slice(4)));
    } else if (lower.startsWith('#') && lower.length > 1) {
      parsed.tags.push(normalizeForIndexing(part.slice(1)));
    } else if (lower === 'has:checklist') {
      parsed.hasChecklist = true;
    } else if (lower === 'has:attachment' || lower === 'has:attachments') {
      parsed.hasAttachment = true;
    } else if (lower === 'is:pinned') {
      parsed.pinnedOnly = true;
    } else if (lower.startsWith('-') && lower.length > 1) {
      const excl = tokenizeWithSpans(part.slice(1)).map((t) => t.token);
      parsed.excludedTerms.push(...excl);
    } else {
      const words = tokenizeWithSpans(part).map((t) => t.token);
      parsed.terms.push(...words);
    }
  }

  return parsed;
}

function buildSnippet(
  body: string,
  terms: string[],
  phrases: string[],
): { snippet: string; highlights: { start: number; end: number }[] } {
  const cleanBody = body.replace(/\s+/g, ' ').trim();
  if (!cleanBody) return { snippet: '', highlights: [] };

  const foldedBody = cleanBody
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const searchNeedles = [...phrases, ...terms].filter(Boolean);
  let anchorIdx = -1;

  for (const needle of searchNeedles) {
    const idx = foldedBody.indexOf(needle);
    if (idx !== -1 && (anchorIdx === -1 || idx < anchorIdx)) {
      anchorIdx = idx;
    }
  }

  const windowRadius = 72;
  const start = anchorIdx === -1 ? 0 : Math.max(0, anchorIdx - 38);
  const end = Math.min(cleanBody.length, start + windowRadius * 2);

  let snippet = cleanBody.slice(start, end);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < cleanBody.length ? '...' : '';
  snippet = `${prefix}${snippet}${suffix}`;

  const foldedSnippet = snippet
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const highlights: { start: number; end: number }[] = [];
  for (const needle of searchNeedles) {
    if (!needle) continue;
    let from = 0;
    while (from < foldedSnippet.length) {
      const found = foldedSnippet.indexOf(needle, from);
      if (found === -1) break;
      highlights.push({ start: found, end: found + needle.length });
      from = found + needle.length;
    }
  }

  highlights.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const h of highlights) {
    const last = merged[merged.length - 1];
    if (!last || h.start > last.end) {
      merged.push({ ...h });
    } else {
      last.end = Math.max(last.end, h.end);
    }
  }

  return { snippet, highlights: merged };
}

export function executeNotesSearch(
  docs: NoteDocument[],
  index: SearchInvertedIndex,
  rawQuery: string,
): SearchExecutionTrace {
  const t0 = performance.now();
  const parsed = parseSearchQuery(rawQuery);

  // Filter structural predicates first (folder, tag, checklist, attachment, pinned)
  const filteredDocs = docs.filter((doc) => {
    if (parsed.pinnedOnly && !doc.pinned) return false;
    if (parsed.hasChecklist === true && doc.checklist.length === 0) return false;
    if (parsed.hasAttachment === true && doc.attachments.length === 0) return false;

    if (parsed.folders.length > 0) {
      const normFolder = normalizeForIndexing(doc.folder);
      if (!parsed.folders.some((f) => normFolder.includes(f))) return false;
    }

    if (parsed.tags.length > 0) {
      const normTags = doc.tags.map((t) => normalizeForIndexing(t));
      if (!parsed.tags.every((req) => normTags.some((t) => t.includes(req)))) {
        return false;
      }
    }

    if (parsed.excludedTerms.length > 0) {
      const fullNorm = normalizeForIndexing(
        `${doc.title} ${doc.body} ${doc.tags.join(' ')}`,
      );
      if (parsed.excludedTerms.some((ex) => fullNorm.includes(ex))) {
        return false;
      }
    }

    if (parsed.phrases.length > 0) {
      const fullNorm = normalizeForIndexing(
        `${doc.title} ${doc.body} ${doc.checklist.map((c) => c.text).join(' ')}`,
      ).replace(/\s+/g, ' ');
      if (!parsed.phrases.every((ph) => fullNorm.includes(ph))) {
        return false;
      }
    }

    return true;
  });

  // If no free-text terms, return filtered docs ordered by pinned + updatedAt
  if (parsed.terms.length === 0) {
    const sorted = [...filteredDocs].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    const results: SearchResult[] = sorted.map((doc) => {
      const { snippet, highlights } = buildSnippet(doc.body, [], parsed.phrases);
      return {
        doc,
        score: doc.pinned ? 1.5 : 1.0,
        matchedTerms: parsed.phrases,
        snippet,
        highlights,
        breakdown: [],
      };
    });

    return {
      parsed,
      results,
      queryDurationMs: Number((performance.now() - t0).toFixed(3)),
      candidateDocIds: filteredDocs.map((d) => d.id),
      postingsExamined: 0,
    };
  }

  // BM25 + prefix matching over inverted index
  const k1 = 1.5;
  const b = 0.75;
  const N = Math.max(1, index.docCount);

  let postingsExamined = 0;
  const candidateIds = new Set<string>();
  const filteredIdSet = new Set(filteredDocs.map((d) => d.id));
  const docMap = new Map(filteredDocs.map((d) => [d.id, d]));

  // Map: term -> matched postings grouped by docId
  const termPostingsByDoc = new Map<
    string,
    { idf: number; byDoc: Map<string, { title: number; body: number; tags: number }> }
  >();

  for (const term of parsed.terms) {
    const matchedDocIdsForTerm = new Set<string>();
    const byDoc = new Map<string, { title: number; body: number; tags: number }>();

    for (const [indexedToken, entries] of index.postings.entries()) {
      // Exact or prefix match (e.g. "spot" -> "spotlight")
      if (indexedToken === term || indexedToken.startsWith(term)) {
        const prefixFactor = indexedToken === term ? 1.0 : 0.75;
        for (const entry of entries) {
          postingsExamined += 1;
          if (!filteredIdSet.has(entry.docId)) continue;
          matchedDocIdsForTerm.add(entry.docId);
          candidateIds.add(entry.docId);

          const curr = byDoc.get(entry.docId) ?? { title: 0, body: 0, tags: 0 };
          const weightedTf = entry.tf * prefixFactor;
          if (entry.field === 'title') curr.title += weightedTf;
          else if (entry.field === 'tags') curr.tags += weightedTf;
          else curr.body += weightedTf;
          byDoc.set(entry.docId, curr);
        }
      }
    }

    const df = matchedDocIdsForTerm.size;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    termPostingsByDoc.set(term, { idf, byDoc });
  }

  const results: SearchResult[] = [];

  for (const docId of candidateIds) {
    const doc = docMap.get(docId);
    if (!doc) continue;

    const lengths = index.docLengths[docId] ?? { title: 1, body: 1, tags: 1 };
    let totalScore = 0;
    const matchedTerms: string[] = [];
    const breakdown: TermScoreBreakdown[] = [];

    for (const term of parsed.terms) {
      const info = termPostingsByDoc.get(term);
      if (!info) continue;
      const counts = info.byDoc.get(docId);
      if (!counts) continue;

      matchedTerms.push(term);

      const bm25Field = (tf: number, dl: number, avgdl: number, weight: number) => {
        if (tf <= 0) return 0;
        const norm = 1 - b + b * (dl / Math.max(1, avgdl));
        return weight * ((tf * (k1 + 1)) / (tf + k1 * norm));
      };

      const titleScore = bm25Field(
        counts.title,
        lengths.title,
        index.avgFieldLengths.title,
        3.0,
      );
      const tagsScore = bm25Field(
        counts.tags,
        lengths.tags,
        index.avgFieldLengths.tags,
        2.0,
      );
      const bodyScore = bm25Field(
        counts.body,
        lengths.body,
        index.avgFieldLengths.body,
        1.0,
      );

      const contribution = info.idf * (titleScore + tagsScore + bodyScore);
      totalScore += contribution;

      breakdown.push({
        term,
        idf: Number(info.idf.toFixed(3)),
        titleTf: Number(counts.title.toFixed(2)),
        bodyTf: Number(counts.body.toFixed(2)),
        tagsTf: Number(counts.tags.toFixed(2)),
        contribution: Number(contribution.toFixed(3)),
      });
    }

    // Require all search terms to match (AND semantics like Notes app)
    if (matchedTerms.length === parsed.terms.length) {
      const finalScore = Number((totalScore + (doc.pinned ? 0.25 : 0)).toFixed(3));
      const { snippet, highlights } = buildSnippet(
        `${doc.body} ${doc.checklist.map((c) => c.text).join(' ')}`,
        parsed.terms,
        parsed.phrases,
      );

      results.push({
        doc,
        score: finalScore,
        matchedTerms,
        snippet,
        highlights,
        breakdown,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return {
    parsed,
    results,
    queryDurationMs: Number((performance.now() - t0).toFixed(3)),
    candidateDocIds: Array.from(candidateIds),
    postingsExamined,
  };
}

export const INITIAL_NOTES: NoteDocument[] = [
  {
    id: 'note-1',
    title: 'NoteStore.sqlite Schema & ZDATA Protobuf Decoding',
    folder: 'Architecture',
    tags: ['sqlite', 'protobuf', 'reverse-engineering'],
    pinned: true,
    updatedAt: '2026-11-12',
    body:
      'In Apple Notes, note metadata lives in NoteStore.sqlite inside the ZICCLOUDSYNCINGOBJECT table, while rich text bodies and attribute runs are gzip-compressed Protocol Buffers stored in ZICNOTEDATA.ZDATA. Raw SQL LIKE queries cannot scan compressed protobuf blobs directly, so plain text is projected and tokenized before indexing.',
    checklist: [
      { id: 'c1', text: 'Inspect ZICNOTEDATA.ZDATA gzip header (0x1f 0x8b)', checked: true },
      { id: 'c2', text: 'Extract plain-text string run from protobuf field 2', checked: true },
      { id: 'c3', text: 'Map ZIDENTIFIER primary key back to UI deep link', checked: false },
    ],
    attachments: [
      { id: 'a1', name: 'NoteStore.sqlite', kind: 'sqlite' },
      { id: 'a2', name: 'note-body-frame.pb', kind: 'protobuf' },
    ],
  },
  {
    id: 'note-2',
    title: 'CoreSpotlight CSSearchableItem Indexing Pipeline',
    folder: 'Architecture',
    tags: ['corespotlight', 'indexing', 'macos'],
    pinned: true,
    updatedAt: '2026-11-11',
    body:
      'Apple Notes pushes CSSearchableItem records with CSSearchableItemAttributeSet metadata (title, contentDescription, thumbnailData, and modificationDate) into CoreSpotlight. System-wide queries evaluate boolean predicates, prefix wildcards, and semantic embeddings against the Spotlight inverted index before resolving NoteStore object identifiers.',
    checklist: [
      { id: 'c4', text: 'Verify CSSearchableIndex batch updates on save', checked: true },
      { id: 'c5', text: 'Check deep link restoration via NSUserActivity', checked: false },
    ],
    attachments: [{ id: 'a3', name: 'spotlight-attributes.pdf', kind: 'pdf' }],
  },
  {
    id: 'note-3',
    title: 'Café & Résumé Tokenization: Diacritic and CamelCase Folding',
    folder: 'Search Engine',
    tags: ['tokenization', 'unicode', 'fts5'],
    pinned: false,
    updatedAt: '2026-11-10',
    body:
      'Lexical matching normalizes Unicode text via NFD decomposition so searching "resume" matches "résumé" and "cafe" matches "Café". Word-boundary rules also split CamelCase identifiers like NoteStore or CoreSpotlight into independent searchable tokens while preserving exact phrase adjacency.',
    checklist: [
      { id: 'c6', text: 'Strip combining diacritical marks (U+0300..U+036F)', checked: true },
      { id: 'c7', text: 'Support prefix matching for incremental keystrokes', checked: true },
    ],
    attachments: [],
  },
  {
    id: 'note-4',
    title: 'REA Agents MCP Inspection Playbook',
    folder: 'Tooling',
    tags: ['rea', 'mcp', 'cli'],
    pinned: false,
    updatedAt: '2026-11-09',
    body:
      'After running npx rea-agents@latest setup and restarting your coding client, invoke the rea MCP server to statically inspect local macOS .app bundles, SQLite tables, Mach-O symbols, and unpacked JavaScript assets with concrete file-path and offset evidence.',
    checklist: [
      { id: 'c8', text: 'Run npx rea-agents@latest doctor --json', checked: true },
      { id: 'c9', text: 'Verify read-only inspection constraints in SKILL.md', checked: true },
    ],
    attachments: [],
  },
  {
    id: 'note-5',
    title: 'BM25 Field Weighting & Snippet Window Extraction',
    folder: 'Search Engine',
    tags: ['bm25', 'ranking', 'snippets'],
    pinned: false,
    updatedAt: '2026-11-08',
    body:
      'Title tokens carry 3.0x weight, tag tokens 2.0x weight, and body/checklist tokens 1.0x weight with BM25 document-length normalization (k1=1.5, b=0.75). Result snippets center around the earliest matched offset to show immediate surrounding context.',
    checklist: [],
    attachments: [{ id: 'a4', name: 'bm25-weights-diagram.png', kind: 'image' }],
  },
];
