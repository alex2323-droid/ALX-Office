import React, { useEffect, useState } from 'react';
import { Check, Copy, Heart, Mail, MessageSquarePlus, Send, X } from 'lucide-react';

export type SupportModalTab = 'support' | 'suggestions';

interface DonationModalProps {
  open: boolean;
  initialTab?: SupportModalTab;
  onClose: () => void;
}

const SUPPORT_EMAIL = 'alexparababi23@gmail.com';

export default function DonationModal({
  open,
  initialTab = 'support',
  onClose,
}: DonationModalProps) {
  const [activeTab, setActiveTab] = useState<SupportModalTab>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [suggestionType, setSuggestionType] = useState<
    'Sugerencia de mejora' | 'Reportar un problema' | 'Soporte general'
  >('Sugerencia de mejora');
  const [suggestionMessage, setSuggestionMessage] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const mailSubject = encodeURIComponent(`[ALX Office] ${suggestionType}`);
  const mailBody = encodeURIComponent(
    suggestionMessage.trim()
      ? `${suggestionMessage.trim()}\n\n---\nEnviado desde ALX Office`
      : `Hola, quiero compartir una ${suggestionType.toLowerCase()} sobre ALX Office:\n\n`,
  );
  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`;

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
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                activeTab === 'support'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                  : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
              }`}
            >
              {activeTab === 'support' ? (
                <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
              ) : (
                <MessageSquarePlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {activeTab === 'support'
                  ? 'Apoya el desarrollo de ALX Office'
                  : 'Sugerencias y Soporte'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeTab === 'support'
                  ? 'Cada aporte ayuda a mantener el proyecto vigente y mejorar cada vez más la aplicación.'
                  : 'Envíanos tus ideas, comentarios o consultas técnicas directamente al correo de soporte.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana de apoyo y sugerencias"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de pestañas: Apoyo / Sugerencias */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('support')}
            className={`flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'support'
                ? 'bg-white text-rose-600 shadow-xs dark:bg-slate-900 dark:text-rose-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <Heart
              className={`h-3.5 w-3.5 ${
                activeTab === 'support' ? 'fill-rose-500 text-rose-500' : ''
              }`}
            />
            <span>Apoyar al proyecto</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suggestions')}
            className={`flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'suggestions'
                ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span>Sugerencias y soporte</span>
          </button>
        </div>

        {activeTab === 'support' ? (
          <>
            <div className="mt-4 max-h-[58vh] space-y-3.5 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-3.5 text-xs leading-relaxed text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                Cada aporte ayuda a mantener el proyecto vigente y activo, y cada contribución ayudará a mejorar cada vez más la aplicación con nuevas funciones, mayor estabilidad y soporte continuo.
              </div>

              {/* PayPal */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-blue-300 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-display text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      PP
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        PayPal
                      </div>
                      <div className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                        parababix@gmail.com
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('parababix@gmail.com', 'paypal')}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {copiedKey === 'paypal' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-semibold text-emerald-600">¡Copiado!</span>
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 font-display text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      BN
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Binance Pay / Correo
                      </div>
                      <div className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                        {SUPPORT_EMAIL}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(SUPPORT_EMAIL, 'binance')}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {copiedKey === 'binance' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-semibold text-emerald-600">¡Copiado!</span>
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
                        Banco de Venezuela · C.I.:{' '}
                        <span className="font-mono font-semibold">31.536.656</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Teléfono:{' '}
                        <span className="font-mono font-semibold">04142943532</span>
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
                        <span className="font-semibold text-emerald-600">¡Tlf copiado!</span>
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
                        <span className="font-semibold text-emerald-600">¡C.I. copiada!</span>
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

            <div className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              ¡Gracias por apoyar ALX Office! Cada aporte mantiene el proyecto vigente y nos ayuda a mejorar la app día a día.
            </div>
          </>
        ) : (
          <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {/* Correo directo de soporte y sugerencias */}
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-300">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Correo oficial de soporte y sugerencias
                    </div>
                    <div className="truncate font-mono text-xs text-blue-700 dark:text-blue-300">
                      {SUPPORT_EMAIL}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(SUPPORT_EMAIL, 'support-email')}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:border-blue-500 dark:border-blue-800 dark:bg-slate-800 dark:text-slate-200"
                >
                  {copiedKey === 'support-email' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="font-semibold text-emerald-600">¡Correo copiado!</span>
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

            {/* Formulario rápido de sugerencia */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Tipo de mensaje
                </label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {(
                    [
                      'Sugerencia de mejora',
                      'Reportar un problema',
                      'Soporte general',
                    ] as const
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSuggestionType(option)}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors ${
                        suggestionType === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="alx-suggestion-message"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Tu sugerencia o consulta
                </label>
                <textarea
                  id="alx-suggestion-message"
                  rows={4}
                  value={suggestionMessage}
                  onChange={(e) => setSuggestionMessage(e.target.value)}
                  placeholder="Cuéntanos qué función te gustaría ver en ALX Office o en qué podemos ayudarte..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <a
                href={mailtoHref}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar sugerencia a {SUPPORT_EMAIL}</span>
              </a>
            </div>
          </div>
        )}

        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-md hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            Cerrar ventana
          </button>
        </div>
      </div>
    </div>
  );
}
