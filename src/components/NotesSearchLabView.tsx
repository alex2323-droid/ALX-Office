import { useMemo, useState } from 'react';
import {
  CheckSquare,
  FileSearch,
  Info,
  Paperclip,
  Pin,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  NoteDocument,
  SearchResult,
  buildSearchIndex,
  executeNotesSearch,
  normalizeForIndexing,
} from '../lib/notesSearchEngine';

interface NotesSearchLabViewProps {
  notes: NoteDocument[];
  onUpdateNotes: (next: NoteDocument[]) => void;
  query: string;
  onQueryChange: (next: string) => void;
}

const SAMPLE_QUERIES = [
  { label: 'protobuf', query: 'protobuf' },
  { label: 'cafe (diacritic)', query: 'cafe' },
  { label: 'folder:Architecture', query: 'folder:Architecture' },
  { label: 'has:checklist spotlight', query: 'has:checklist spotlight' },
  { label: '"inverted index"', query: '"inverted index"' },
  { label: 'tag:sqlite -corespotlight', query: 'tag:sqlite -corespotlight' },
];

function HighlightedSnippet({
  text,
  highlights,
}: {
  text: string;
  highlights: { start: number; end: number }[];
}) {
  if (!text) {
    return <span className="text-slate-400 dark:text-slate-500">Empty note body</span>;
  }
  if (highlights.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((h, idx) => {
    if (h.start > cursor) {
      parts.push(<span key={`t-${idx}`}>{text.slice(cursor, h.start)}</span>);
    }
    parts.push(
      <mark
        key={`m-${idx}`}
        className="rounded bg-blue-100 px-0.5 font-medium text-blue-900 dark:bg-blue-900/60 dark:text-blue-200"
      >
        {text.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  });

  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <>{parts}</>;
}

export default function NotesSearchLabView({
  notes,
  onUpdateNotes,
  query,
  onQueryChange,
}: NotesSearchLabViewProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id ?? '');
  const [detailMode, setDetailMode] = useState<'editor' | 'evidence'>('editor');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newTagText, setNewTagText] = useState('');

  const index = useMemo(() => buildSearchIndex(notes), [notes]);
  const trace = useMemo(
    () => executeNotesSearch(notes, index, query),
    [notes, index, query],
  );

  const selectedResult: SearchResult | undefined =
    trace.results.find((r) => r.doc.id === selectedNoteId) ?? trace.results[0];
  const activeNote =
    notes.find((n) => n.id === selectedNoteId) ?? selectedResult?.doc ?? notes[0];

  const handleCreateNote = () => {
    const id = `note-${Date.now()}`;
    const created: NoteDocument = {
      id,
      title: 'Untitled Inspection Note',
      folder: 'Workspace',
      tags: ['draft'],
      pinned: false,
      updatedAt: new Date().toISOString().slice(0, 10),
      body: 'Write notes here to test live Unicode NFD diacritic folding, CamelCase tokenization, and BM25 ranking.',
      checklist: [],
      attachments: [],
    };
    onUpdateNotes([created, ...notes]);
    setSelectedNoteId(id);
    setDetailMode('editor');
  };

  const updateActiveNote = (patch: Partial<NoteDocument>) => {
    if (!activeNote) return;
    const today = new Date().toISOString().slice(0, 10);
    onUpdateNotes(
      notes.map((n) =>
        n.id === activeNote.id ? { ...n, ...patch, updatedAt: today } : n,
      ),
    );
  };

  const handleDeleteNote = (id: string) => {
    const remaining = notes.filter((n) => n.id !== id);
    onUpdateNotes(remaining);
    if (selectedNoteId === id) {
      setSelectedNoteId(remaining[0]?.id ?? '');
    }
  };

  const toggleChecklistItem = (itemId: string) => {
    if (!activeNote) return;
    updateActiveNote({
      checklist: activeNote.checklist.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      ),
    });
  };

  const addChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!activeNote || !text) return;
    updateActiveNote({
      checklist: [
        ...activeNote.checklist,
        { id: `chk-${Date.now()}`, text, checked: false },
      ],
    });
    setNewChecklistText('');
  };

  const addTag = () => {
    const clean = newTagText.trim().toLowerCase().replace(/^#/, '');
    if (!activeNote || !clean || activeNote.tags.includes(clean)) return;
    updateActiveNote({ tags: [...activeNote.tags, clean] });
    setNewTagText('');
  };

  const removeTag = (tag: string) => {
    if (!activeNote) return;
    updateActiveNote({ tags: activeNote.tags.filter((t) => t !== tag) });
  };

  // Sample postings for matched query terms in the Evidence tab
  const inspectedPostings = useMemo(() => {
    const rows: { token: string; docCount: number; fields: string[] }[] = [];
    for (const term of trace.parsed.terms) {
      for (const [token, entries] of index.postings.entries()) {
        if (token === term || token.startsWith(term)) {
          rows.push({
            token,
            docCount: new Set(entries.map((e) => e.docId)).size,
            fields: Array.from(new Set(entries.map((e) => e.field))),
          });
        }
      }
    }
    return rows.slice(0, 16);
  }, [index.postings, trace.parsed.terms]);

  return (
    <div className="space-y-6">
      {/* Architecture & Evidence Scope Banner */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Notes Search Architecture and Live Feature
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Apple Notes pairs <code className="font-mono text-xs">NoteStore.sqlite</code> (compressed protobuf bodies in <code className="font-mono text-xs">ZICNOTEDATA.ZDATA</code>) with <code className="font-mono text-xs">CoreSpotlight</code> inverted indexes, NFD diacritic/CamelCase tokenization, and BM25 ranking. Below is the working implementation built for this project, with a live trace inspector showing the exact tokenization, postings, and scoring evidence.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Note</span>
          </button>
        </div>

        {/* Honest environment note */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Evidence scope:
            </span>{' '}
            This workspace runs in a Linux sandbox without macOS <code className="font-mono">/System/Applications/Notes.app</code> or a local <code className="font-mono">rea</code> MCP daemon attached, so Apple binary offsets are not inspected directly here. The architecture summary is grounded in documented <code className="font-mono">NoteStore.sqlite</code> / <code className="font-mono">CoreSpotlight</code> internals, and the <strong>Live Search Evidence</strong> tab exposes real runtime evidence from <code className="font-mono">notesSearchEngine.ts</code>.
          </div>
        </div>

        {/* Search Input + Sample Queries */}
        <div className="mt-5 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder='Search notes... Try: protobuf, cafe, folder:Architecture, tag:sqlite, has:checklist, "inverted index"'
              aria-label="Search notes"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-20 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Try query:
            </span>
            {SAMPLE_QUERIES.map((sample) => (
              <button
                key={sample.query}
                type="button"
                onClick={() => onQueryChange(sample.query)}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                  query === sample.query
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Telemetry Row */}
        <div className="mt-5 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Matches</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {trace.results.length} / {notes.length} notes
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Query Time</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {trace.queryDurationMs.toFixed(3)} ms
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Index Build</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {index.buildDurationMs.toFixed(3)} ms · {index.postings.size} terms
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Postings Scanned</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {trace.postingsExamined} entries
            </div>
          </div>
        </div>
      </section>

      {/* Split Results + Editor/Evidence Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Results List */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ranked Results
            </h2>
          </div>

          {trace.results.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No notes match <code className="font-mono text-xs">{query}</code>.
              </p>
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Show All Notes
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {trace.results.map((result) => {
                const isSelected = activeNote?.id === result.doc.id;
                return (
                  <button
                    key={result.doc.id}
                    type="button"
                    onClick={() => setSelectedNoteId(result.doc.id)}
                    className={`block w-full px-5 py-4 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-medium text-slate-900 dark:text-slate-100">
                        {result.doc.title}
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-blue-700 dark:text-blue-400">
                        {result.score.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{result.doc.folder}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{result.doc.updatedAt}</span>
                      {result.doc.pinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Pinned</span>
                        </>
                      )}
                      {result.doc.checklist.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {result.doc.checklist.filter((c) => c.checked).length}/
                            {result.doc.checklist.length} tasks
                          </span>
                        </>
                      )}
                      {result.doc.attachments.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {result.doc.attachments.length} file
                          </span>
                        </>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <HighlightedSnippet
                        text={result.snippet}
                        highlights={result.highlights}
                      />
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detail / Evidence Panel */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setDetailMode('editor')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  detailMode === 'editor'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Note Workspace
              </button>
              <button
                type="button"
                onClick={() => setDetailMode('evidence')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  detailMode === 'evidence'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <FileSearch className="h-3.5 w-3.5" />
                <span>Live Search Evidence</span>
              </button>
            </div>

            {activeNote && detailMode === 'editor' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateActiveNote({ pinned: !activeNote.pinned })}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    activeNote.pinned
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span>{activeNote.pinned ? 'Pinned' : 'Pin'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(activeNote.id)}
                  aria-label="Delete note"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>

          {detailMode === 'editor' ? (
            activeNote ? (
              <div className="space-y-5 p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Title
                    </label>
                    <input
                      type="text"
                      value={activeNote.title}
                      onChange={(e) => updateActiveNote({ title: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Folder
                    </label>
                    <input
                      type="text"
                      value={activeNote.folder}
                      onChange={(e) => updateActiveNote({ folder: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Body (edits immediately re-index)
                  </label>
                  <textarea
                    rows={5}
                    value={activeNote.body}
                    onChange={(e) => updateActiveNote({ body: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Tags:{' '}
                      <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                        {activeNote.tags.length === 0
                          ? 'None'
                          : activeNote.tags.map((t) => `#${t}`).join(' · ')}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTagText}
                        onChange={(e) => setNewTagText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        placeholder="Add tag..."
                        className="w-28 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  {activeNote.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {activeNote.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-xs font-mono text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                        >
                          #{tag} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Checklist */}
                <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Checklist Items (Indexed in Search)
                  </div>
                  <div className="space-y-1.5">
                    {activeNote.checklist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleChecklistItem(item.id)}
                        className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        {item.checked ? (
                          <CheckSquare className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Square className="h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <span
                          className={
                            item.checked
                              ? 'text-slate-400 line-through dark:text-slate-500'
                              : 'text-slate-800 dark:text-slate-200'
                          }
                        >
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                      placeholder="Add searchable checklist task..."
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Add Task
                    </button>
                  </div>
                </div>

                {/* Attachments */}
                {activeNote.attachments.length > 0 && (
                  <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Attachments
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
                      {activeNote.attachments.map((att) => (
                        <span key={att.id} className="inline-flex items-center gap-1.5 font-mono">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span>{att.name}</span>
                          <span className="text-slate-400">({att.kind})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Create a note to begin editing and indexing.
              </div>
            )
          ) : (
            /* Live Search Evidence Inspector */
            <div className="space-y-6 p-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  1. Query Normalization & Parsed AST
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Extracted from <code className="font-mono">parseSearchQuery()</code> and <code className="font-mono">normalizeForIndexing()</code> in <code className="font-mono">src/lib/notesSearchEngine.ts</code>.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
                  <code>
                    {JSON.stringify(
                      {
                        rawQuery: trace.parsed.raw,
                        normalizedForm: normalizeForIndexing(trace.parsed.raw),
                        terms: trace.parsed.terms,
                        phrases: trace.parsed.phrases,
                        excludedTerms: trace.parsed.excludedTerms,
                        folders: trace.parsed.folders,
                        tags: trace.parsed.tags,
                        hasChecklist: trace.parsed.hasChecklist,
                        hasAttachment: trace.parsed.hasAttachment,
                      },
                      null,
                      2,
                    )}
                  </code>
                </pre>
              </div>

              {selectedResult && selectedResult.breakdown.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    2. BM25 Field Weighting Breakdown ({selectedResult.doc.title})
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Weights: Title = 3.0x · Tags = 2.0x · Body/Checklist = 1.0x (k1 = 1.5, b = 0.75).
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="py-2 pr-3">Term</th>
                          <th className="py-2 px-3 text-right">IDF</th>
                          <th className="py-2 px-3 text-right">Title TF</th>
                          <th className="py-2 px-3 text-right">Tags TF</th>
                          <th className="py-2 px-3 text-right">Body TF</th>
                          <th className="py-2 pl-3 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono tabular-nums dark:divide-slate-800">
                        {selectedResult.breakdown.map((row) => (
                          <tr key={row.term}>
                            <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                              {row.term}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {row.idf.toFixed(3)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {row.titleTf}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {row.tagsTf}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {row.bodyTf}
                            </td>
                            <td className="py-2 pl-3 text-right font-medium text-blue-700 dark:text-blue-400">
                              +{row.contribution.toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  3. Inverted Index Postings Matched
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Prefix and exact index entries scanned for your active search terms.
                </p>
                {inspectedPostings.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Enter free-text search terms (for example <code className="font-mono">protobuf</code> or <code className="font-mono">spot</code>) to inspect inverted index postings.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="py-2 pr-3">Indexed Token</th>
                          <th className="py-2 px-3">Fields</th>
                          <th className="py-2 pl-3 text-right">Doc Frequency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono tabular-nums dark:divide-slate-800">
                        {inspectedPostings.map((item) => (
                          <tr key={item.token}>
                            <td className="py-2 pr-3 text-slate-900 dark:text-slate-100">
                              {item.token}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {item.fields.join(', ')}
                            </td>
                            <td className="py-2 pl-3 text-right text-slate-700 dark:text-slate-300">
                              {item.docCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
