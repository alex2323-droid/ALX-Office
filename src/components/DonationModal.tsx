import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Gift, Heart, X } from 'lucide-react';

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
}

export default function DonationModal({ open, onClose }: DonationModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Apoya el desarrollo de ALX Office
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tu contribución ayuda a mantener y mejorar esta suite documental libre y rápida.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de donaciones"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* PayPal */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 font-display text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  PP
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    PayPal
                  </div>
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-300">
                    parababix@gmail.com
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('parababix@gmail.com', 'paypal')}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copiedKey === 'paypal' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copiar correo</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Binance */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-amber-300 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 font-display text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  BN
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Binance Pay / Correo
                  </div>
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-300">
                    alexparababi23@gmail.com
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('alexparababi23@gmail.com', 'binance')}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copiedKey === 'binance' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    <span>Copiar correo</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Pago Móvil Venezuela */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 font-display text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  VE
                </span>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Pago Móvil (Venezuela)
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Banco de Venezuela · C.I.: <span className="font-mono font-semibold">31.536.656</span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Teléfono: <span className="font-mono font-semibold">04142943532</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-end">
                <button
                  type="button"
                  onClick={() => handleCopy('04142943532', 'pago-tlf')}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-2xs hover:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {copiedKey === 'pago-tlf' ? (
                    <span className="text-emerald-600 font-semibold">¡Tlf copiado!</span>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400" />
                      <span>Copiar tlf</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy('31536656', 'pago-ci')}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 shadow-2xs hover:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {copiedKey === 'pago-ci' ? (
                    <span className="text-emerald-600 font-semibold">¡C.I. copiada!</span>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400" />
                      <span>Copiar C.I.</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          ¡Muchas gracias por valorar y respaldar ALX Office! Cada aporte impulsa nuevas funciones y mejoras.
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-md hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Cerrar ventana
          </button>
        </div>
      </div>
    </div>
  );
}
