import firebaseConfig from '../../firebase-applet-config.json';

const REQUIRED_FIREBASE_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'firestoreDatabaseId',
] as const;

function isInvalidOrPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(MY_|YOUR_|REPLACE_|CHANGEME|PLACEHOLDER|TODO|<[^>]+>)/i.test(trimmed);
}

export function getClientConfigError(): string | null {
  const missingOrInvalid = REQUIRED_FIREBASE_FIELDS.filter((field) =>
    isInvalidOrPlaceholder((firebaseConfig as Record<string, unknown>)[field]),
  );

  if (missingOrInvalid.length > 0) {
    return `Faltan campos críticos de configuración de Firebase o tienen valores inválidos: ${missingOrInvalid.join(', ')}.`;
  }

  return null;
}

export function assertValidClientConfiguration(): void {
  const error = getClientConfigError();
  if (error) {
    throw new Error(`[Configuración inválida] ${error}`);
  }
}
