import { useEffect, useRef, useState } from 'react';
import { FilePlus2, X } from 'lucide-react';
import type { WpsTemplate } from '../data/wpsDocuments';

interface TemplatePageThumbnailProps {
  template: WpsTemplate;
  size?: 'sm' | 'md';
}

const LOGICAL_SHEET_WIDTH = 540;

export function TemplatePageThumbnail({
  template,
  size = 'md',
}: TemplatePageThumbnailProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(size === 'sm' ? 0.24 : 0.44);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) {
        setScale(w / LOGICAL_SHEET_WIDTH);
      }
    };

    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isBlank = template.id === 'tpl-blank';

  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-hidden border-b border-slate-200 bg-slate-100 select-none dark:border-slate-800 dark:bg-slate-950/75 ${
        size === 'sm' ? 'h-32 px-3 pt-3' : 'h-56 px-5 pt-4 sm:h-60'
      }`}
    >
      {/* Miniature paper sheet rising inside stage */}
      <div
        ref={frameRef}
        className="relative mx-auto h-full w-full max-w-[290px] overflow-hidden rounded-t-lg border border-b-0 border-slate-200 bg-white shadow-sm dark:border-slate-700/80"
      >
        {isBlank ? (
          <div className="flex h-full flex-col justify-between p-4 text-slate-400">
            <div className="space-y-2">
              <div className="h-2.5 w-24 rounded-xs bg-slate-200" />
              <div className="h-1.5 w-full rounded-xs bg-slate-100" />
              <div className="h-1.5 w-5/6 rounded-xs bg-slate-100" />
              <div className="h-1.5 w-2/3 rounded-xs bg-slate-100" />
            </div>
            <div className="flex items-center justify-center pb-2 text-[10px] font-medium text-slate-400">
              Página en blanco A4
            </div>
          </div>
        ) : (
          <div
            style={{
              width: `${LOGICAL_SHEET_WIDTH}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              fontSize: '13px',
              lineHeight: 1.55,
              padding: '30px 34px',
            }}
            className="wps-doc-canvas pointer-events-none bg-white text-slate-900"
            dangerouslySetInnerHTML={{ __html: template.contentHtml }}
          />
        )}

        {/* Subtle bottom fade to suggest full-page continuation */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
      </div>
    </div>
  );
}

interface TemplatePreviewModalProps {
  template: WpsTemplate | null;
  onClose: () => void;
  onUseTemplate: (template: WpsTemplate) => void;
}

export function TemplatePreviewModal({
  template,
  onClose,
  onUseTemplate,
}: TemplatePreviewModalProps) {
  if (!template) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-preview-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden dark:bg-slate-700" />

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#EA3D2F] dark:text-red-400">
              Vista previa · {template.category}
            </div>
            <h2
              id="tpl-preview-title"
              className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {template.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-8 dark:bg-slate-950">
          <div
            className="wps-doc-canvas mx-auto max-w-[680px] rounded-xl border border-slate-200 bg-white p-7 text-sm leading-relaxed text-slate-900 shadow-md sm:p-10"
            dangerouslySetInnerHTML={{ __html: template.contentHtml }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
            {template.description}
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => {
                const chosen = template;
                onClose();
                onUseTemplate(chosen);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#EA3D2F] px-4 text-xs font-semibold text-white hover:bg-[#D63124] whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>Usar esta plantilla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
