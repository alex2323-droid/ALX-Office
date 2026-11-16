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
  Paintbrush,
  Sparkles,
  SpellCheck,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline,
} from 'lucide-react';
import { WpsComment } from '../data/wpsDocuments';
import {
  createChecklistHtml,
  escapeHtmlText,
  hideSoftKeyboard,
} from '../lib/editorDom';
import { CANVA_FONTS, CANVA_SOLID_BGS } from './CanvaControls';

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
  { label: 'Naranja', value: '#ea580c' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Morado', value: '#7c3aed' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Ámbar', value: '#d97706' },
];

export const WORD_HIGHLIGHT_COLORS = [
  { label: 'Sin resaltado', value: 'transparent' },
  { label: 'Amarillo', value: '#fef08a' },
  { label: 'Verde suave', value: '#bbf7d0' },
  { label: 'Azul suave', value: '#bfdbfe' },
  { label: 'Rosa suave', value: '#fecdd3' },
  { label: 'Lavanda', value: '#ede9fe' },
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
  onApplyInlineStyle?: (styles: Record<string, string>) => void;
  onCopyStyle?: () => void;
  hasCopiedStyle?: boolean;
  onApplyCopiedStyle?: () => void;
  pageBgColor?: string;
  onChangePageBgColor?: (color: string) => void;
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
  onApplyInlineStyle,
  onCopyStyle,
  hasCopiedStyle = false,
  onApplyCopiedStyle,
  pageBgColor,
  onChangePageBgColor,
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
  const [customTextColor, setCustomTextColor] = useState('#7c3aed');
  const [customBgColor, setCustomBgColor] = useState('#fef08a');

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

                  {/* Canva Font Family & Size Presets */}
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <Type className="h-3.5 w-3.5" />
                        <span>Tipografía y tamaño Canva</span>
                      </span>
                      {onCopyStyle && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            hasCopiedStyle && onApplyCopiedStyle
                              ? onApplyCopiedStyle()
                              : onCopyStyle()
                          }
                          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                            hasCopiedStyle
                              ? 'border-[#7C3AED] bg-violet-50 text-[#7C3AED] dark:bg-violet-950/60 dark:text-violet-300'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <Paintbrush className="h-3.5 w-3.5" />
                          <span>{hasCopiedStyle ? 'Pegar estilo' : 'Copiar estilo'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {CANVA_FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (onApplyInlineStyle) {
                              onApplyInlineStyle({ fontFamily: f.cssFamily });
                            } else {
                              onRunCommand('fontName', f.exportName);
                            }
                          }}
                          style={{ fontFamily: f.cssFamily }}
                          className="min-h-[40px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {[12, 14, 16, 20, 26, 34, 42].map((px) => (
                        <button
                          key={px}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (onApplyInlineStyle) {
                              onApplyInlineStyle({ fontSize: `${px}px` });
                            } else {
                              onRunCommand('fontSize', px >= 30 ? '6' : px >= 22 ? '5' : px >= 17 ? '4' : '3');
                            }
                          }}
                          className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-medium tabular-nums text-slate-700 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {px}
                        </button>
                      ))}

                      {onApplyInlineStyle && (
                        <>
                          <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                          {(
                            [
                              { label: 'AA', value: 'uppercase', title: 'Todo en mayúsculas' },
                              { label: 'aa', value: 'lowercase', title: 'Todo en minúsculas' },
                              { label: 'Aa', value: 'capitalize', title: 'Capitalizar' },
                              { label: 'Normal', value: 'none', title: 'Sin transformación' },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              title={t.title}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => onApplyInlineStyle({ textTransform: t.value })}
                              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {t.label}
                            </button>
                          ))}
                        </>
                      )}
                    </div>

                    {onApplyInlineStyle && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
                          <span>Efectos:</span>
                        </span>
                        {(
                          [
                            { label: 'Ninguno', styles: { textShadow: 'none', WebkitTextStroke: '0px', backgroundColor: '' } },
                            { label: 'Sombra', styles: { textShadow: '2px 2px 0px rgba(124,58,237,0.45)' } },
                            { label: 'Elevación', styles: { textShadow: '0 4px 12px rgba(15,23,42,0.38)' } },
                            { label: 'Espaciado +', styles: { letterSpacing: '0.1em' } },
                            { label: 'Compacto', styles: { letterSpacing: '0em' } },
                          ] as { label: string; styles: Record<string, string> }[]
                        ).map((fx) => (
                          <button
                            key={fx.label}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onApplyInlineStyle(fx.styles)}
                            className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:border-[#7C3AED] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {fx.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Text & Highlight Colors */}
                  <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
                    <div>
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Color de fuente
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
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
                        <label
                          title="Color personalizado"
                          className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 text-xs font-bold text-white dark:border-slate-600"
                        >
                          <span>+</span>
                          <input
                            type="color"
                            value={customTextColor}
                            onChange={(e) => {
                              setCustomTextColor(e.target.value);
                              onRunCommand('foreColor', e.target.value);
                            }}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <Highlighter className="h-3.5 w-3.5" />
                        <span>Resaltado</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
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
                        <label
                          title="Resaltado personalizado"
                          className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-yellow-300 via-emerald-300 to-sky-400 text-xs font-bold text-slate-900 dark:border-slate-600"
                        >
                          <span>+</span>
                          <input
                            type="color"
                            value={customBgColor}
                            onChange={(e) => {
                              setCustomBgColor(e.target.value);
                              onRunCommand('hiliteColor', e.target.value);
                            }}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {onChangePageBgColor && (
                    <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Fondo de página Canva
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {CANVA_SOLID_BGS.slice(0, 7).map((bg) => (
                          <button
                            key={bg.value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onChangePageBgColor(bg.value)}
                            title={bg.label}
                            aria-label={`Fondo ${bg.label}`}
                            style={{ backgroundColor: bg.value }}
                            className={`h-8 w-8 rounded-lg border transition-transform active:scale-95 ${
                              pageBgColor?.toLowerCase() === bg.value.toLowerCase()
                                ? 'border-[#7C3AED] ring-2 ring-[#7C3AED]/30'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
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

                  {/* Canva Docs Design Blocks */}
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
                      <span>Bloques Canva Docs</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onInsertHtml(
                            `<div class="alx-canva-callout"><strong>Idea destacada:</strong> Resume aquí el punto clave, alerta o conclusión visual del documento.</div><p><br/></p>`,
                          );
                          onDrawerOpenChange(false);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 text-xs font-medium text-blue-900 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200"
                      >
                        <span>Tarjeta Callout</span>
                      </button>

                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onInsertHtml(
                            `<div class="alx-canva-cols"><div class="alx-canva-col"><p><strong>Columna 1</strong></p><p>Describe la primera idea o beneficio.</p></div><div class="alx-canva-col"><p><strong>Columna 2</strong></p><p>Describe la segunda idea o comparativa.</p></div></div><p><br/></p>`,
                          );
                          onDrawerOpenChange(false);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <span>2 Columnas</span>
                      </button>

                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onInsertHtml(
                            `<div class="alx-canva-kpi"><p><strong>+48%</strong> Crecimiento mensual · <span>Meta Q4 superada</span></p></div><p><br/></p>`,
                          );
                          onDrawerOpenChange(false);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/70 px-3 text-xs font-medium text-orange-900 hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200"
                      >
                        <span>Tarjeta KPI</span>
                      </button>

                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onInsertHtml(
                            `<span style="display:inline-block;background:#7C3AED;color:#FFFFFF;padding:2px 10px;border-radius:8px;font-weight:700;font-size:0.8em;letter-spacing:0.04em;">DESTACADO</span>&nbsp;`,
                          );
                          onDrawerOpenChange(false);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/70 px-3 text-xs font-medium text-violet-900 hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200"
                      >
                        <span>Insignia</span>
                      </button>
                    </div>
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

          {onCopyStyle && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                hasCopiedStyle && onApplyCopiedStyle
                  ? onApplyCopiedStyle()
                  : onCopyStyle()
              }
              aria-label={hasCopiedStyle ? 'Pegar estilo' : 'Copiar estilo'}
              title={hasCopiedStyle ? 'Pegar estilo copiado' : 'Copiar estilo del texto'}
              className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-colors ${
                hasCopiedStyle
                  ? 'bg-violet-50 text-[#7C3AED] dark:bg-violet-950/50 dark:text-violet-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Paintbrush className="h-4 w-4" />
            </button>
          )}
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
