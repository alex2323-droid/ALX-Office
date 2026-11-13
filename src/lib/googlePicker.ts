export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes?: number;
  }>;
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, cb: { callback: () => void; onerror?: () => void }) => void;
    };
    google?: {
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        ViewId: { DOCS: string; DOCUMENTS: string; PRESENTATIONS: string; PDFS: string };
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setCallback: (cb: (data: GooglePickerResponse) => void) => unknown;
          setOrigin: (origin: string) => unknown;
          setLocale: (locale: string) => unknown;
          setTitle: (title: string) => unknown;
          build: () => { setVisible: (visible: boolean) => void };
        };
        DocsView: new (viewId?: string) => {
          setIncludeFolders: (include: boolean) => unknown;
          setMimeTypes: (mimeTypes: string) => unknown;
          setLabel: (label: string) => unknown;
        };
        DocsUploadView: new () => unknown;
      };
    };
  }
}

let pickerLoadPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (window.google?.picker) {
    return Promise.resolve();
  }
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise<void>((resolve, reject) => {
    const onGapiReady = () => {
      if (!window.gapi) {
        reject(new Error('No se pudo inicializar Google API.'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('No se pudo cargar el módulo Google Picker.')),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    if (existing && window.gapi) {
      onGapiReady();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = onGapiReady;
    script.onerror = () => {
      pickerLoadPromise = null;
      reject(new Error('Error de red al cargar Google Picker.'));
    };
    document.head.appendChild(script);
  });

  return pickerLoadPromise;
}

export async function openGoogleDrivePicker(
  accessToken: string,
): Promise<PickedDriveFile | null> {
  await loadGooglePickerApi();

  const pickerNs = window.google?.picker;
  if (!pickerNs) {
    throw new Error('Google Picker no está disponible en este navegador.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise<PickedDriveFile | null>((resolve) => {
    const officeAndPdfView = new pickerNs.DocsView(pickerNs.ViewId.DOCS);
    officeAndPdfView.setIncludeFolders(true);
    officeAndPdfView.setMimeTypes(
      [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.presentation',
        'text/plain',
        'text/html',
      ].join(','),
    );

    const builder = new pickerNs.PickerBuilder() as {
      addView: (view: unknown) => typeof builder;
      setOAuthToken: (token: string) => typeof builder;
      setCallback: (cb: (data: GooglePickerResponse) => void) => typeof builder;
      setOrigin: (origin: string) => typeof builder;
      setLocale: (locale: string) => typeof builder;
      setTitle: (title: string) => typeof builder;
      build: () => { setVisible: (visible: boolean) => void };
    };

    const picker = builder
      .setTitle('Seleccionar archivo en Google Drive')
      .addView(officeAndPdfView)
      .addView(pickerNs.ViewId.DOCS)
      .addView(new pickerNs.DocsUploadView())
      .setOAuthToken(accessToken)
      .setOrigin(pickerOrigin)
      .setLocale('es')
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === pickerNs.Action.PICKED && data.docs?.[0]) {
          const picked = data.docs[0];
          resolve({
            id: picked.id,
            name: picked.name,
            mimeType: picked.mimeType,
            sizeBytes: picked.sizeBytes,
          });
        } else if (data.action === pickerNs.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

export async function downloadPickedDriveFile(
  accessToken: string,
  picked: PickedDriveFile,
): Promise<File> {
  let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}?alt=media`;
  let targetFileName = picked.name;
  let targetMime = picked.mimeType;

  // Export native Google Workspace Docs / Slides into real DOCX / PPTX so WPS can view & edit them
  if (picked.mimeType === 'application/vnd.google-apps.document') {
    const exportMime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}/export?mimeType=${encodeURIComponent(exportMime)}`;
    if (!targetFileName.toLowerCase().endsWith('.docx')) {
      targetFileName = `${targetFileName}.docx`;
    }
    targetMime = exportMime;
  } else if (picked.mimeType === 'application/vnd.google-apps.presentation') {
    const exportMime =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}/export?mimeType=${encodeURIComponent(exportMime)}`;
    if (!targetFileName.toLowerCase().endsWith('.pptx')) {
      targetFileName = `${targetFileName}.pptx`;
    }
    targetMime = exportMime;
  } else if (picked.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportMime = 'application/pdf';
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}/export?mimeType=${encodeURIComponent(exportMime)}`;
    if (!targetFileName.toLowerCase().endsWith('.pdf')) {
      targetFileName = `${targetFileName}.pdf`;
    }
    targetMime = exportMime;
  }

  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Drive respondió con estado ${res.status}.`);
  }

  const blob = await res.blob();
  return new File([blob], targetFileName, { type: targetMime || blob.type });
}

export async function uploadDocumentCopyToDrive(
  accessToken: string,
  title: string,
  contentHtml: string,
): Promise<{ id: string; name: string }> {
  const safeName =
    title.replace(/[^\w\dáéíóúñÁÉÍÓÚÑ\-_ ]+/g, '').trim() || 'Documento WPS';
  const fileName = `${safeName}.doc`;

  const wordDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title></head><body>${contentHtml}</body></html>`;

  const metadata = {
    name: fileName,
    mimeType: 'application/msword',
  };

  const boundary = `wps_drive_boundary_${Date.now()}`;
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/msword; charset=UTF-8\r\n\r\n` +
    `${wordDoc}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    },
  );

  if (!res.ok) {
    throw new Error(`No se pudo subir a Google Drive (HTTP ${res.status}).`);
  }

  return (await res.json()) as { id: string; name: string };
}
