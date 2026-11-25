import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import {
  checkUsernameAvailable,
  formatAuthError,
  loginWithUsername,
  normalizeUsername,
  registerWithUsername,
  validatePasswordInput,
  validateUsernameInput,
} from '../lib/auth';

export type AuthModalMode = 'login' | 'register';

interface AuthModalProps {
  open: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess: (mode: AuthModalMode, username: string) => void;
}

export default function AuthModal({
  open,
  initialMode = 'login',
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken'
  >('idle');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setErrorText(null);
      setPassword('');
      setConfirmPassword('');
      setAvailability('idle');
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || mode !== 'register') {
      setAvailability('idle');
      return;
    }
    const clean = normalizeUsername(username);
    if (!clean || validateUsernameInput(clean) !== null) {
      setAvailability('idle');
      return;
    }

    let cancelled = false;
    setAvailability('checking');
    const timer = window.setTimeout(() => {
      void checkUsernameAvailable(clean)
        .then((isFree) => {
          if (!cancelled) {
            setAvailability(isFree ? 'available' : 'taken');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAvailability('idle');
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, mode, username]);

  if (!open) return null;

  const cleanPreview = normalizeUsername(username);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const userErr = validateUsernameInput(username);
    if (userErr) {
      setErrorText(userErr);
      return;
    }

    if (mode === 'register' && availability === 'taken') {
      setErrorText(
        `El nombre de usuario "@${cleanPreview}" ya está en uso. Elige otro nombre único.`,
      );
      return;
    }

    const passErr = validatePasswordInput(password);
    if (passErr) {
      setErrorText(passErr);
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setErrorText('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const user =
        mode === 'register'
          ? await registerWithUsername(username, password)
          : await loginWithUsername(username, password);
      const display = user.displayName || cleanPreview;
      onSuccess(mode, display);
      onClose();
    } catch (err) {
      const msg = formatAuthError(err);
      setErrorText(msg);
      if (msg.includes('ya está') || msg.includes('ocupado')) {
        setAvailability('taken');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-[#EA3D2F] dark:bg-red-950/50 dark:text-red-400">
              {mode === 'login' ? (
                <LogIn className="h-5 w-5" />
              ) : (
                <UserPlus className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta nueva'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'login'
                  ? 'Accede con tu usuario y contraseña de ALX Office.'
                  : 'Elige un nombre de usuario único y tu contraseña.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Cerrar ventana de cuenta"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setMode('login');
              setErrorText(null);
            }}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'login'
                ? 'bg-white text-[#EA3D2F] shadow-xs dark:bg-slate-900 dark:text-red-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Iniciar sesión</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setMode('register');
              setErrorText(null);
            }}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'register'
                ? 'bg-white text-[#EA3D2F] shadow-xs dark:bg-slate-900 dark:text-red-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Crear cuenta</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {errorText && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
            >
              {errorText}
            </div>
          )}

          <div>
            <label
              htmlFor="alx-auth-username"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Nombre de usuario único
            </label>
            <div className="relative mt-1.5">
              <UserCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
              <input
                id="alx-auth-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={submitting}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej. alex_23"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 text-sm text-slate-900 caret-[#EA3D2F] placeholder:text-slate-400 focus:border-[#EA3D2F] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
            </div>

            {mode === 'register' && availability !== 'idle' ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium">
                {availability === 'checking' && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">
                      Comprobando disponibilidad de @{cleanPreview}...
                    </span>
                  </>
                )}
                {availability === 'available' && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      @{cleanPreview} está disponible
                    </span>
                  </>
                )}
                {availability === 'taken' && (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-red-600 dark:text-red-400">
                      @{cleanPreview} ya está ocupado, elige otro
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                3 a 32 caracteres: letras, números, ".", "-" o "_" (sin espacios ni repetir usuario).
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="alx-auth-password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Contraseña
            </label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
              <input
                id="alx-auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                disabled={submitting}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm text-slate-900 caret-[#EA3D2F] placeholder:text-slate-400 focus:border-[#EA3D2F] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="alx-auth-confirm-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Confirmar contraseña
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400" />
                <input
                  id="alx-auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  disabled={submitting}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 text-sm text-slate-900 caret-[#EA3D2F] placeholder:text-slate-400 focus:border-[#EA3D2F] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || (mode === 'register' && availability === 'taken')}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#EA3D2F] px-5 text-xs font-semibold text-white transition-colors hover:bg-[#D63124] disabled:opacity-60"
            >
              {mode === 'login' ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span>
                {submitting
                  ? mode === 'login'
                    ? 'Ingresando...'
                    : 'Creando cuenta...'
                  : mode === 'login'
                    ? 'Iniciar sesión'
                    : 'Crear cuenta'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
