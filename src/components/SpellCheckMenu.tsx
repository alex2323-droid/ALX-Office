import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookPlus, Check, EyeOff, SpellCheck, X } from 'lucide-react';

export interface SpellContextMenuState {
  errorId: string;
  word: string;
  suggestions: string[];
  x: number;
  y: number;
  range: Range;
}

interface SpellCheckMenuProps {
  menu: SpellContextMenuState;
  onSelectSuggestion: (menu: SpellContextMenuState, replacement: string) => void;
  onIgnoreWord: (word: string) => void;
  onAddToDictionary: (word: string) => void;
  onClose: () => void;
}

export function SpellCheckMenu({
  menu,
  onSelectSuggestion,
  onIgnoreWord,
  onAddToDictionary,
  onClose,
}: SpellCheckMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 12;
    const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);
    setCoords({
      left: Math.min(Math.max(padding, menu.x), maxLeft),
      top: Math.min(Math.max(padding, menu.y), maxTop),
    });
  }, [menu.x, menu.y, menu.word, menu.suggestions.length]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Sugerencias ortográficas para ${menu.word}`}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className="no-print fixed z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <SpellCheck className="h-4 w-4 shrink-0 text-[#EA3D2F] dark:text-red-400" />
          <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
            {menu.word}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú ortográfico"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Suggestions */}
      <div className="p-1.5">
        <div className="px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Sugerencias
        </div>

        {menu.suggestions.length > 0 ? (
          <div className="space-y-0.5">
            {menu.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectSuggestion(menu, suggestion)}
                className="flex min-h-[40px] w-full items-center justify-between rounded-xl px-2.5 text-left text-sm font-semibold text-slate-900 transition-colors hover:bg-red-50 hover:text-[#EA3D2F] dark:text-slate-100 dark:hover:bg-red-950/50 dark:hover:text-red-300"
              >
                <span className="truncate">{suggestion}</span>
                <Check className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        ) : (
          <div className="px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400">
            No se encontraron sugerencias cercanas.
          </div>
        )}
      </div>

      {/* Dictionary Actions */}
      <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
        <button
          type="button"
          role="menuitem"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onIgnoreWord(menu.word)}
          className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Ignorar en este documento</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onAddToDictionary(menu.word)}
          className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <BookPlus className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span>Añadir al diccionario</span>
        </button>
      </div>
    </div>
  );
}
