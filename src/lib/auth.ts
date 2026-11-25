import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const AUTH_DOMAIN_SUFFIX = 'users.alxoffice.app';
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsernameInput(raw: string): string | null {
  if (raw.includes('@')) {
    return 'Ingresa solo tu nombre de usuario (sin @ ni correo).';
  }
  const clean = normalizeUsername(raw);
  if (clean.length < 3) {
    return 'El nombre de usuario debe tener al menos 3 caracteres.';
  }
  if (clean.length > 32) {
    return 'El nombre de usuario no puede superar los 32 caracteres.';
  }
  if (clean.includes('..') || !USERNAME_REGEX.test(clean)) {
    return 'El usuario debe empezar y terminar con letra o número, usando solo letras, números, ".", "-" o "_" (sin puntos seguidos).';
  }
  return null;
}

export function validatePasswordInput(password: string): string | null {
  if (password.length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (password.length > 128) {
    return 'La contraseña no puede superar los 128 caracteres.';
  }
  return null;
}

function toInternalAuthEmail(rawInput: string): string {
  return `${normalizeUsername(rawInput)}@${AUTH_DOMAIN_SUFFIX}`;
}

export function getAccountUsername(user: User | null): string | null {
  if (!user) return null;
  if (user.displayName?.trim()) {
    return user.displayName.trim();
  }
  if (user.email?.trim()) {
    const [localPart] = user.email.trim().split('@');
    return localPart || user.email;
  }
  return 'Usuario';
}

export async function checkUsernameAvailable(rawUsername: string): Promise<boolean> {
  const clean = normalizeUsername(rawUsername);
  if (validateUsernameInput(clean) !== null) return false;
  const snap = await getDoc(doc(db, 'usernames', clean));
  return !snap.exists();
}

export function formatAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage = error instanceof Error ? error.message : String(error || '');

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ese nombre de usuario ya está registrado. Elige otro nombre único o inicia sesión.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Usuario o contraseña incorrectos.';
    case 'auth/invalid-email':
      return 'El nombre de usuario contiene caracteres no válidos.';
    case 'auth/weak-password':
      return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo nuevamente.';
    case 'auth/operation-not-allowed':
      return 'El inicio de sesión con usuario y contraseña debe habilitarse en Firebase Console (Authentication > Sign-in method > Email/Password).';
    case 'auth/network-request-failed':
      return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
    default:
      return rawMessage || 'No se pudo completar la autenticación.';
  }
}

export const subscribeFirebaseAuth = (onUserChanged: (user: User | null) => void) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    onUserChanged(user);
  });
};

export async function registerWithUsername(
  rawUsername: string,
  password: string,
): Promise<User> {
  const usernameError = validateUsernameInput(rawUsername);
  if (usernameError) {
    throw new Error(usernameError);
  }
  const passwordError = validatePasswordInput(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const cleanUsername = normalizeUsername(rawUsername);

  // 1. Verify unique username reservation before creating account
  try {
    const available = await checkUsernameAvailable(cleanUsername);
    if (!available) {
      throw new Error(
        `El nombre de usuario "@${cleanUsername}" ya está en uso. Elige otro nombre único.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('ya está en uso')) {
      throw err;
    }
    // If offline or rules check fails transiently, Firebase Auth email uniqueness still guards
  }

  const internalEmail = toInternalAuthEmail(cleanUsername);
  const credential = await createUserWithEmailAndPassword(auth, internalEmail, password);
  await updateProfile(credential.user, { displayName: cleanUsername });

  // 2. Atomically reserve the unique username document in Firestore
  try {
    await setDoc(doc(db, 'usernames', cleanUsername), {
      username: cleanUsername,
      ownerId: credential.user.uid,
      createdAt: serverTimestamp(),
    });
  } catch (reservationErr) {
    // Roll back auth user if reservation failed
    try {
      await deleteUser(credential.user);
    } catch {
      await auth.signOut();
    }
    const errCode =
      typeof reservationErr === 'object' && reservationErr !== null && 'code' in reservationErr
        ? String((reservationErr as { code?: unknown }).code || '')
        : '';
    const errMsg = reservationErr instanceof Error ? reservationErr.message : '';
    if (errCode === 'unavailable' || errMsg.toLowerCase().includes('offline')) {
      throw new Error(
        'No se pudo conectar con Firestore para registrar tu usuario único. Verifica tu conexión e inténtalo de nuevo.',
      );
    }
    throw new Error(
      `El nombre de usuario "@${cleanUsername}" ya fue registrado por otra persona. Elige uno distinto.`,
    );
  }

  return credential.user;
}

export async function loginWithUsername(
  rawUsername: string,
  password: string,
): Promise<User> {
  const usernameError = validateUsernameInput(rawUsername);
  if (usernameError) {
    throw new Error(usernameError);
  }
  const passwordError = validatePasswordInput(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const cleanUsername = normalizeUsername(rawUsername);
  const internalEmail = toInternalAuthEmail(cleanUsername);
  const credential = await signInWithEmailAndPassword(auth, internalEmail, password);

  // Backfill unique username reservation if logging into a legacy account
  try {
    const usernameRef = doc(db, 'usernames', cleanUsername);
    const snap = await getDoc(usernameRef);
    if (!snap.exists()) {
      await setDoc(usernameRef, {
        username: cleanUsername,
        ownerId: credential.user.uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch {
    // Ignore non-fatal backfill errors
  }

  return credential.user;
}

export async function logoutAccount(): Promise<void> {
  await auth.signOut();
}
