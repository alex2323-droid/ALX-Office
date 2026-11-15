import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { WpsComment, WpsDocument, WpsFormat, WpsSlide } from '../data/wpsDocuments';
import { auth, db } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_FORMATS: WpsFormat[] = ['DOCX', 'DOC', 'PDF', 'PPTX', 'PPT', 'TXT'];
const MAX_HTML_LEN = 750000;
const MAX_PDF_BASE64_LEN = 750000;
const MAX_TITLE_LEN = 200;
const MAX_FOLDER_LEN = 80;
const MAX_UPDATED_LABEL_LEN = 64;
const MAX_SLIDES = 200;
const MAX_COMMENTS = 500;

export function sanitizeFirestoreId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned && VALID_ID_REGEX.test(cleaned) ? cleaned : `doc-${Date.now()}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function buildSanitizedDocumentFields(docItem: WpsDocument, uid: string) {
  const safeId = sanitizeFirestoreId(docItem.id);
  const safeOwnerId = sanitizeFirestoreId(uid);
  const safeTitle = (docItem.title || 'Documento sin título').trim().slice(0, MAX_TITLE_LEN) || 'Documento sin título';
  const safeFormat: WpsFormat = VALID_FORMATS.includes(docItem.format) ? docItem.format : 'DOCX';
  const safeFolder = (docItem.folder || 'General').trim().slice(0, MAX_FOLDER_LEN) || 'General';
  const safeUpdatedLabel =
    (docItem.updatedAt || 'Ahora mismo').trim().slice(0, MAX_UPDATED_LABEL_LEN) || 'Ahora mismo';
  const safeContentHtml = (docItem.contentHtml || '').slice(0, MAX_HTML_LEN);
  const safeComments = stripUndefinedDeep(
    Array.isArray(docItem.comments) ? docItem.comments.slice(0, MAX_COMMENTS) : [],
  );

  const payload: {
    id: string;
    ownerId: string;
    title: string;
    format: WpsFormat;
    folder: string;
    starred: boolean;
    updatedLabel: string;
    contentHtml: string;
    pdfBase64?: string;
    slides?: WpsSlide[];
    comments: WpsComment[];
  } = {
    id: safeId,
    ownerId: safeOwnerId,
    title: safeTitle,
    format: safeFormat,
    folder: safeFolder,
    starred: Boolean(docItem.starred),
    updatedLabel: safeUpdatedLabel,
    contentHtml: safeContentHtml,
    comments: safeComments,
  };

  if (typeof docItem.pdfBase64 === 'string' && docItem.pdfBase64.length <= MAX_PDF_BASE64_LEN) {
    payload.pdfBase64 = docItem.pdfBase64;
  }

  if (Array.isArray(docItem.slides)) {
    payload.slides = stripUndefinedDeep(docItem.slides.slice(0, MAX_SLIDES));
  }

  return payload;
}

export async function ensureUserProfile(
  user: User,
  theme: 'dark' | 'light',
): Promise<'dark' | 'light'> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  let snapshot;
  try {
    snapshot = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const displayName = (user.displayName || '').slice(0, 120);
  const email = (user.email || '').slice(0, 200);

  if (!snapshot.exists()) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        ...(displayName ? { displayName } : {}),
        ...(email ? { email } : {}),
        theme,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return theme;
  }

  const data = snapshot.data();
  const remoteTheme = data?.theme === 'light' ? 'light' : 'dark';
  return remoteTheme;
}

export async function updateUserThemeInCloud(
  uid: string,
  theme: 'dark' | 'light',
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserDocuments(
  uid: string,
  onDocuments: (docs: WpsDocument[], docUpdatedMs: Map<string, number>) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = `users/${uid}/documents`;
  const q = query(collection(db, 'users', uid, 'documents'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs: WpsDocument[] = [];
      const updatedMap = new Map<string, number>();

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const ts = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : 0;
        updatedMap.set(docSnap.id, ts);
        docs.push({
          id: typeof d.id === 'string' ? d.id : docSnap.id,
          title: typeof d.title === 'string' ? d.title : 'Documento sin título',
          format: VALID_FORMATS.includes(d.format) ? d.format : 'DOCX',
          folder: typeof d.folder === 'string' ? d.folder : 'General',
          starred: Boolean(d.starred),
          updatedAt: typeof d.updatedLabel === 'string' ? d.updatedLabel : 'Sincronizado',
          contentHtml: typeof d.contentHtml === 'string' ? d.contentHtml : '',
          pdfBase64: typeof d.pdfBase64 === 'string' ? d.pdfBase64 : undefined,
          slides: Array.isArray(d.slides) ? (d.slides as WpsSlide[]) : undefined,
          comments: Array.isArray(d.comments) ? (d.comments as WpsComment[]) : [],
        });
      });

      docs.sort((a, b) => (updatedMap.get(b.id) ?? 0) - (updatedMap.get(a.id) ?? 0));
      onDocuments(docs, updatedMap);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function upsertCloudDocument(
  uid: string,
  docItem: WpsDocument,
  existsInCloud: boolean,
): Promise<void> {
  const fields = buildSanitizedDocumentFields(docItem, uid);
  const path = `users/${uid}/documents/${fields.id}`;
  const docRef = doc(db, 'users', uid, 'documents', fields.id);

  if (!existsInCloud) {
    try {
      await setDoc(docRef, {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  try {
    await updateDoc(docRef, {
      title: fields.title,
      folder: fields.folder,
      starred: fields.starred,
      updatedLabel: fields.updatedLabel,
      contentHtml: fields.contentHtml,
      ...(fields.pdfBase64 !== undefined ? { pdfBase64: fields.pdfBase64 } : {}),
      ...(fields.slides !== undefined ? { slides: fields.slides } : {}),
      comments: fields.comments,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudDocument(uid: string, docId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(docId);
  const path = `users/${uid}/documents/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'documents', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
