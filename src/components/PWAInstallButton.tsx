import { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Instalar ALX Office"
        className={
          compact
            ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            : 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
        }
      >
        <Download className="h-4 w-4 shrink-0 text-[#EA3D2F] dark:text-red-400" />
        {!compact && <span>Instalar aplicación</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Instalar en iOS"
          className={
            compact
              ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              : 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
          }
        >
          <Smartphone className="h-4 w-4 shrink-0 text-[#EA3D2F] dark:text-red-400" />
          {!compact && <span>Instalar en iOS</span>}
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Instalar ALX Office en iPhone / iPad
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-slate-600 dark:text-slate-300">
                <li>
                  Toca el botón <strong className="text-slate-900 dark:text-slate-100">Compartir</strong> en la barra de Safari.
                </li>
                <li>
                  Desplázate y selecciona{' '}
                  <strong className="text-slate-900 dark:text-slate-100">Añadir a pantalla de inicio</strong>.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 h-11 w-full rounded-xl bg-[#EA3D2F] text-xs font-semibold text-white hover:bg-[#D63124]"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
