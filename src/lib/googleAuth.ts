import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
// Access token must live strictly in memory (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform === 'function') {
    try {
      return cap.isNativePlatform();
    } catch {
      // Ignore bridge inspection errors
    }
  }
  return window.location.protocol === 'capacitor:';
}

export function formatGoogleAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (code === 'auth/unauthorized-domain' || code === 'auth/bad-request') {
    return `El dominio actual (${origin}) no está autorizado en Firebase Authentication ("The requested action is invalid"). Agrega "${typeof window !== 'undefined' ? window.location.hostname : ''}" en Firebase Console > Authentication > Settings > Authorized domains, o abre la app desde Chrome/PWA.`;
  }
  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Se cerró la ventana de Google antes de completar el inicio de sesión.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Este navegador o WebView no admite ventanas emergentes de Google. Abre ALX Office en Chrome o instálala como PWA.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Error de red al conectar con Google. Verifica tu conexión a internet e inténtalo de nuevo.';
  }
  return rawMessage || 'No se pudo completar el inicio de sesión con Google.';
}

export const subscribeFirebaseAuth = (onUserChanged: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    onUserChanged(user);
  });
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  if (isNativeCapacitorApp()) {
    throw new Error(
      'En la APK de Android (localhost), Google y Firebase rechazan el inicio de sesión web emergente ("The requested action is invalid"). Para conectar Google Drive usa la versión Web/PWA desde Chrome o configura autenticación nativa Android (SHA-1) en Firebase Console; la edición local en la APK sigue funcionando sin conexión.',
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se recibió token de acceso de Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
