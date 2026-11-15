import { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  SpellCheck,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
} from 'lucide-react';
import { WpsComment } from '../data/wpsDocuments';
import {
  createChecklistHtml,
  escapeHtmlText,
  hideSoftKeyboard,
} from '../lib/editorDom';

export type ToolDrawerTab = 'inicio' | 'insertar' | 'ver' | 'revisar';

export interface WordActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  unorderedList: boolean;
  orderedList: boolean;
}

export const WORD_TEXT_COLORS = [
  { label: 'Negro', value: '#0f172a' },
  { label: 'Gris', value: '#475569' },
  { label: 'Rojo WPS', value: '#dc2626' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Ámbar', value: '#d97706' },
  { label: 'Morado', value: '#7c3aed' },
];

export const WORD_HIGHLIGHT_COLORS = [
  { label: 'Sin resaltado', value: 'transparent' },
  { label: 'Amarillo', value: '#fef08a' },
  { label: 'Verde suave', value: '#bbf7d0' },
  { label: 'Azul suave', value: '#bfdbfe' },
  { label: 'Rosa suave', value: '#fecdd3' },
];

interface WpsWordEditingBarProps {
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  drawerTab: ToolDrawerTab;
  onDrawerTabChange: (tab: ToolDrawerTab) => void;
  activeFormats: WordActiveFormats;
  onRunCommand: (command: string, value?: string) => void;
  onInsertHtml: (html: string) => void;
  onInsertImageDataUrl?: (dataUrl: string, fileName: string) => void;
  extraInsertSection?: React.ReactNode;
  viewTabContent: React.ReactNode;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
  spellErrorCount: number;
  firstSpellErrorWord?: string;
  onJumpToNextSpellError: () => void;
  exportSection?: React.ReactNode;
  comments: WpsComment[];
  onAddComment: (text: string) => void;
  onToggleCommentResolved: (id: string) => void;
  onDeleteComment: (id: string) => void;
}

export default function WpsWordEditingBar({
  drawerOpen,
  onDrawerOpenChange,
  drawerTab,
  onDrawerTabChange,
  activeFormats,
  onRunCommand,
  onInsertHtml,
  onInsertImageDataUrl,
  extraInsertSection,
  viewTabContent,
  spellCheckEnabled,
  onToggleSpellCheck,
  spellErrorCount,
  firstSpellErrorWord,
  onJumpToNextSpellError,
  exportSection,
  comments,
  onAddComment,
  onToggleCommentResolved,
  onDeleteComment,
}: WpsWordEditingBarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const handleInsertTable = () => {
    const headerCells = Array.from({ length: tableCols })
      .map((_, i) => `<th>Columna ${i + 1}</th>`)
      .join('');
    const bodyRows = Array.from({ length: Math.max(1, tableRows - 1) })
      .map(
        () =>
          `<tr>${Array.from({ length: tableCols })
            .map(() => '<td>Celda</td>')
            .join('')}</tr>`,
      )
      .join('');

    onInsertHtml(
      `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br/></p>`,
    );
    onDrawerOpenChange(false);
  };

  const handleInsertChecklist = () => {
    onInsertHtml(createChecklistHtml());
  };

  const handleInsertLink = () => {
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl) return;
    if (/^\s*javascript:/i.test(cleanUrl)) return;
    const safeUrl =
      cleanUrl.startsWith('http://') ||
      cleanUrl.startsWith('https://') ||
      cleanUrl.startsWith('mailto:')
        ? cleanUrl
        : `https://${cleanUrl}`;
    const label = linkLabel.trim() || safeUrl;
    onInsertHtml(
      `<a href="${escapeHtmlText(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(label)}</a> `,
    );
    setLinkUrl('');
    setLinkLabel('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (onInsertImageDataUrl) {
          onInsertImageDataUrl(reader.result, file.name);
        } else {
          onInsertHtml(
            `<p><img src="${reader.result}" alt="${escapeHtmlText(file.name)}" /></p>`,
          );
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    onDrawerOpenChange(false);
  };

  const submitComment = () => {
    const clean = newCommentText.trim();
    if (!clean) return;
    onAddComment(clean);
    setNewCommentText('');
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Expandable Bottom WPS Tool Sheet (Inicio / Insertar / Ver / Revisar) */}
      {drawerOpen && (
        <div className="no-print fixed bottom-[52px] left-0 right-0 z-30 border-t border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl">
            {/* Sheet Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    { id: 'inicio', label: 'Inicio' },
                    { id: 'insertar', label: 'Insertar' },
                    { id: 'ver', label: 'Ver' },
                    {
                      id: 'revisar',
                      label: `Revisar (${comments.filter((c) => !c.resolved).length})`,
                    },
                  ] as { id: ToolDrawerTab; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      hideSoftKeyboard();
                      onDrawerTabChange(tab.id);
                    }}
                    className={`min-h-[44px] border-b-2 px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      drawerTab === tab.id
                        ? 'border-[#EA3D2F] text-[#EA3D2F] dark:text-red-400'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onDrawerOpenChange(false)}
                aria-label="Cerrar panel de herramientas"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="max-h-[42vh] overflow-y-auto p-4 sm:p-5">
              {/* TAB: INICIO */}
              {drawerTab === 'inicio' && (
                <div className="space-y-4">
                  {/* Heading Styles */}
                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Estilos de párrafo
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Normal', tag: 'P' },
                        { label: 'Título 1', tag: 'H1' },
                        { label: 'Título 2', tag: 'H2' },
                        { label: 'Título 3', tag: 'H3' },
                        { label: 'Cita', tag: 'BLOCKQUOTE' },
                      ].map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onRunCommand('formatBlock', item.tag)}
                          className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment, Indent, Strike, Clear */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('justifyLeft')}
                      aria-label="Alinear a la izquierda"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('justifyCenter')}
                      aria-label="Centrar"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignCenter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('justifyRight')}
                      aria-label="Alinear a la derecha"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('justifyFull')}
                      aria-label="Justificar"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <AlignJustify className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('indent')}
                      aria-label="Aumentar sangría"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <IndentIncrease className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('outdent')}
                      aria-label="Disminuir sangría"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <IndentDecrease className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('strikeThrough')}
                      aria-label="Tachado"
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border ${
                        activeFormats.strikeThrough
                          ? 'border-[#EA3D2F] bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Strikethrough className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRunCommand('removeFormat')}
                      aria-label="Borrar formato"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Eraser className="h-4 w-4" />
                      <span>Limpiar</span>
                    </button>
                  </div>

                  {/* Text & Highlight Colors */}
                  <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Color de fuente
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {WORD_TEXT_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onRunCommand('foreColor', c.value)}
                            aria-label={`Color ${c.label}`}
                            style={{ backgroundColor: c.value }}
                            className="h-9 w-9 rounded-full border border-slate-300 transition-transform active:scale-95 dark:border-slate-600"
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <Highlighter className="h-3.5 w-3.5" />
                        <span>Resaltado</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {WORD_HIGHLIGHT_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onRunCommand('hiliteColor', c.value)}
                            aria-label={c.label}
                            style={{ backgroundColor: c.value }}
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-700 transition-transform active:scale-95 dark:border-slate-600"
                          >
                            {c.value === 'transparent' ? '×' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: INSERTAR */}
              {drawerTab === 'insertar' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Table Builder */}
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <Table2 className="h-4 w-4 text-blue-600" />
                          <span>
                            Insertar tabla ({tableRows} × {tableCols})
                          </span>
                        </span>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleInsertTable}
                          className="min-h-[36px] rounded-lg bg-[#EA3D2F] px-3 text-xs font-semibold text-white hover:bg-[#D63124]"
                        >
                          Insertar
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-2">
                          <span className="text-slate-500">Filas</span>
                          <input
                            type="number"
                            min={2}
                            max={8}
                            value={tableRows}
                            onChange={(e) =>
                              setTableRows(
                                Math.max(2, Math.min(8, Number(e.target.value) || 2)),
                              )
                            }
                            className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono tabular-nums dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-slate-500">Columnas</span>
                          <input
                            type="number"
                            min={2}
                            max={6}
                            value={tableCols}
                            onChange={(e) =>
                              setTableCols(
                                Math.max(2, Math.min(6, Number(e.target.value) || 2)),
                              )
                            }
                            className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono tabular-nums dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Link Builder */}
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Link2 className="h-4 w-4 text-blue-600" />
                        <span>Insertar hipervínculo</span>
                      </div>
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={linkLabel}
                          onChange={(e) => setLinkLabel(e.target.value)}
                          placeholder="Texto"
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://..."
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleInsertLink}
                          className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white dark:bg-blue-600"
                        >
                          Añadir
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Insert Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      <span>Imagen local</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleInsertChecklist}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                      <span>Casilla de verificación</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onInsertHtml('<hr /><p><br/></p>')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Minus className="h-4 w-4 text-slate-500" />
                      <span>Separador</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        onInsertHtml(
                          `${new Date().toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })} `,
                        )
                      }
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span>Fecha actual</span>
                    </button>
                  </div>

                  {extraInsertSection}
                </div>
              )}

              {/* TAB: VER */}
              {drawerTab === 'ver' && viewTabContent}

              {/* TAB: REVISAR Y EXPORTAR */}
              {drawerTab === 'revisar' && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Spellchecker & Export Options */}
                  <div className="space-y-4 lg:col-span-5">
                    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <SpellCheck className="h-4 w-4 text-[#EA3D2F] dark:text-red-400" />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Corrector ortográfico
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={onToggleSpellCheck}
                          className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                            spellCheckEnabled
                              ? 'bg-[#EA3D2F] text-white hover:bg-[#D63124]'
                              : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {spellCheckEnabled ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {spellCheckEnabled
                          ? spellErrorCount > 0
                            ? `${spellErrorCount} posible(s) error(es). Haz clic derecho sobre una palabra subrayada para ver sugerencias.`
                            : 'No se detectaron errores ortográficos en este documento.'
                          : 'Activa el corrector para subrayar errores y ver sugerencias contextuales.'}
                      </p>
                      {spellCheckEnabled && spellErrorCount > 0 && firstSpellErrorWord && (
                        <button
                          type="button"
                          onClick={() => {
                            onDrawerOpenChange(false);
                            onJumpToNextSpellError();
                          }}
                          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                          <SpellCheck className="h-3.5 w-3.5" />
                          <span>Corregir primer error ({firstSpellErrorWord})</span>
                        </button>
                      )}
                    </div>

                    {exportSection}
                  </div>

                  {/* Comments */}
                  <div className="space-y-3 lg:col-span-7">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Comentarios de revisión ({comments.length})
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                        placeholder="Añadir comentario sobre el documento..."
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-[#EA3D2F] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={submitComment}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#EA3D2F] px-3.5 text-xs font-semibold text-white hover:bg-[#D63124]"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        <span>Comentar</span>
                      </button>
                    </div>

                    {comments.length > 0 && (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                        {comments.map((cm) => (
                          <div
                            key={cm.id}
                            className="flex items-start justify-between gap-3 p-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {cm.author} ·{' '}
                                <span className="font-normal text-slate-400">
                                  {cm.createdAt}
                                </span>
                                {cm.resolved && (
                                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                    Resuelto
                                  </span>
                                )}
                              </div>
                              {cm.quote && (
                                <div className="mt-0.5 italic text-slate-500">
                                  &ldquo;{cm.quote}&rdquo;
                                </div>
                              )}
                              <div
                                className={`mt-1 ${
                                  cm.resolved
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {cm.text}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onToggleCommentResolved(cm.id)}
                                className="rounded px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              >
                                {cm.resolved ? 'Reabrir' : 'Resolver'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteComment(cm.id)}
                                aria-label="Eliminar comentario"
                                className="rounded p-1.5 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ergonomic Bottom Quick-Formatting Bar (52px) */}
      <footer className="no-print fixed bottom-0 left-0 right-0 z-40 flex h-[52px] items-center justify-between gap-1 border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md sm:px-4 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center overflow-x-auto">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRunCommand('bold')}
            aria-label="Negrita"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.bold
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRunCommand('italic')}
            aria-label="Cursiva"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.italic
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRunCommand('underline')}
            aria-label="Subrayado"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.underline
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Underline className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRunCommand('insertUnorderedList')}
            aria-label="Lista con viñetas"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.unorderedList
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRunCommand('insertOrderedList')}
            aria-label="Lista numerada"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
              activeFormats.orderedList
                ? 'bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleInsertChecklist}
            aria-label="Insertar casilla"
            className="hidden min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <CheckSquare className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!drawerOpen) {
              hideSoftKeyboard();
            }
            onDrawerOpenChange(!drawerOpen);
          }}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            drawerOpen
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          <span>Herramientas</span>
          {drawerOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      </footer>
    </>
  );
}
