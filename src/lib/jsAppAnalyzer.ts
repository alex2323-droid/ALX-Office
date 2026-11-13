export interface SourceFileInput {
  path: string;
  content: string;
}

export interface ModuleNode {
  path: string;
  role: 'main' | 'preload' | 'renderer' | 'shared' | 'manifest';
  lines: number;
  bytes: number;
  imports: string[];
  exports: string[];
}

export interface ElectronBoundarySummary {
  detected: boolean;
  windows: {
    file: string;
    line: number;
    preload: string | null;
    contextIsolation: string | null;
    nodeIntegration: string | null;
    sandbox: string | null;
  }[];
  contextBridgeApis: {
    namespace: string;
    methods: string[];
    file: string;
    line: number;
  }[];
  ipcChannels: {
    channel: string;
    direction: 'main.handle' | 'main.on' | 'renderer.invoke' | 'renderer.send';
    file: string;
    line: number;
  }[];
}

export interface EvidenceRecord {
  id: string;
  category: 'module' | 'electron-boundary' | 'ipc' | 'endpoint' | 'storage';
  claim: string;
  file: string;
  line: number;
  excerpt: string;
}

export interface JsApplicationAnalysisJson {
  tool: 'rea-agents/analyze-javascript-application';
  targetPath: string;
  analyzedAt: string;
  durationMs: number;
  runtimeClassification: string[];
  summary: {
    fileCount: number;
    totalBytes: number;
    totalLines: number;
    externalDependencies: string[];
    internalEdges: number;
  };
  moduleGraph: ModuleNode[];
  electronBoundaries: ElectronBoundarySummary;
  endpointsAndStorage: {
    kind: 'http-route' | 'url' | 'storage';
    value: string;
    file: string;
    line: number;
  }[];
  evidence: EvidenceRecord[];
  limitations: string[];
}

function classifyRole(path: string, content: string): ModuleNode['role'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('package.json')) return 'manifest';
  if (lower.includes('preload') || content.includes('contextBridge')) return 'preload';
  if (
    lower.includes('main.') ||
    lower.includes('/main/') ||
    content.includes('BrowserWindow') ||
    content.includes('ipcMain')
  ) {
    return 'main';
  }
  if (
    lower.includes('renderer') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx') ||
    content.includes('createRoot') ||
    content.includes('document.')
  ) {
    return 'renderer';
  }
  return 'shared';
}

function extractImports(content: string): string[] {
  const found = new Set<string>();
  const esmRegex = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const reqRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const dynRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const regex of [esmRegex, reqRegex, dynRegex]) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      found.add(m[1]);
    }
  }
  return Array.from(found);
}

function extractExports(content: string): string[] {
  const found = new Set<string>();
  const namedRegex =
    /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type)\s+([A-Za-z0-9_$]+)/g;
  const listRegex = /export\s*\{([^}]+)\}/g;
  const defaultRegex = /export\s+default\s+(?:function\s+)?([A-Za-z0-9_$]+)?/g;
  const cjsRegex = /(?:module\.exports|exports)\.([A-Za-z0-9_$]+)\s*=/g;

  let m: RegExpExecArray | null;
  while ((m = namedRegex.exec(content)) !== null) found.add(m[1]);
  while ((m = listRegex.exec(content)) !== null) {
    m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop() || '')
      .filter(Boolean)
      .forEach((name) => found.add(name));
  }
  while ((m = defaultRegex.exec(content)) !== null) {
    found.add(m[1] ? `default:${m[1]}` : 'default');
  }
  while ((m = cjsRegex.exec(content)) !== null) found.add(m[1]);

  return Array.from(found);
}

export function analyzeJavaScriptApplication(
  targetPath: string,
  files: SourceFileInput[],
): JsApplicationAnalysisJson {
  const t0 = performance.now();
  const cleanTarget = targetPath.trim() || '/absolute/path/to/app';
  const moduleGraph: ModuleNode[] = [];
  const externalDeps = new Set<string>();
  const evidence: EvidenceRecord[] = [];
  const endpointsAndStorage: JsApplicationAnalysisJson['endpointsAndStorage'] = [];
  const runtimes = new Set<string>();

  const windows: ElectronBoundarySummary['windows'] = [];
  const contextBridgeApis: ElectronBoundarySummary['contextBridgeApis'] = [];
  const ipcChannels: ElectronBoundarySummary['ipcChannels'] = [];

  let totalBytes = 0;
  let totalLines = 0;
  let internalEdges = 0;
  let evCounter = 1;

  const pushEvidence = (
    category: EvidenceRecord['category'],
    claim: string,
    file: string,
    line: number,
    excerpt: string,
  ) => {
    evidence.push({
      id: `ev-${evCounter++}`,
      category,
      claim,
      file,
      line,
      excerpt: excerpt.trim().slice(0, 140),
    });
  };

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    const bytes = new Blob([file.content]).size;
    totalBytes += bytes;
    totalLines += lines.length;

    const role = classifyRole(file.path, file.content);
    const imports = file.path.endsWith('.json') ? [] : extractImports(file.content);
    const exports = file.path.endsWith('.json') ? [] : extractExports(file.content);

    for (const spec of imports) {
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) {
        internalEdges += 1;
      } else {
        const pkg = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0];
        externalDeps.add(pkg);
      }
    }

    if (file.path.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(file.content);
        for (const dep of Object.keys(pkg.dependencies ?? {})) {
          externalDeps.add(dep);
        }
        if (pkg.dependencies?.electron || pkg.devDependencies?.electron) {
          runtimes.add('Electron Desktop');
        }
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          runtimes.add('React UI');
        }
        if (pkg.dependencies?.express) {
          runtimes.add('Express Server');
        }
        if (pkg.main) {
          pushEvidence(
            'module',
            `Package entry point declared as "${pkg.main}"`,
            file.path,
            1,
            `"main": "${pkg.main}"`,
          );
        }
      } catch {
        // Ignore malformed package.json
      }
    }

    moduleGraph.push({
      path: file.path,
      role,
      lines: lines.length,
      bytes,
      imports,
      exports,
    });

    // Line-by-line static pattern scan
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;

      if (/new\s+BrowserWindow\s*\(/.test(lineText)) {
        runtimes.add('Electron Desktop');
        const block = lines.slice(idx, Math.min(lines.length, idx + 16)).join('\n');
        const preloadMatch = block.match(/preload\s*:\s*([^,\n}]+)/);
        const ctxMatch = block.match(/contextIsolation\s*:\s*(true|false)/);
        const nodeMatch = block.match(/nodeIntegration\s*:\s*(true|false)/);
        const sandboxMatch = block.match(/sandbox\s*:\s*(true|false)/);

        windows.push({
          file: file.path,
          line: lineNum,
          preload: preloadMatch ? preloadMatch[1].trim() : null,
          contextIsolation: ctxMatch ? ctxMatch[1] : null,
          nodeIntegration: nodeMatch ? nodeMatch[1] : null,
          sandbox: sandboxMatch ? sandboxMatch[1] : null,
        });

        pushEvidence(
          'electron-boundary',
          `BrowserWindow instantiated with contextIsolation=${ctxMatch?.[1] ?? 'unspecified'}, nodeIntegration=${nodeMatch?.[1] ?? 'unspecified'}`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const bridgeMatch = lineText.match(
        /contextBridge\.exposeInMainWorld\s*\(\s*['"]([^'"]+)['"]/,
      );
      if (bridgeMatch) {
        runtimes.add('Electron Desktop');
        const block = lines.slice(idx, Math.min(lines.length, idx + 12)).join('\n');
        const methodMatches = Array.from(
          block.matchAll(/([A-Za-z0-9_]+)\s*:\s*(?:\([^)]*\)|async\s*\()/g),
        ).map((m) => m[1]);

        contextBridgeApis.push({
          namespace: bridgeMatch[1],
          methods: methodMatches,
          file: file.path,
          line: lineNum,
        });

        pushEvidence(
          'electron-boundary',
          `Preload exposes window.${bridgeMatch[1]} (${methodMatches.join(', ') || 'object'})`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const ipcMainHandle = lineText.match(/ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/);
      if (ipcMainHandle) {
        ipcChannels.push({
          channel: ipcMainHandle[1],
          direction: 'main.handle',
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'ipc',
          `Main process registers async IPC handler "${ipcMainHandle[1]}"`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const ipcMainOn = lineText.match(/ipcMain\.on\s*\(\s*['"]([^'"]+)['"]/);
      if (ipcMainOn) {
        ipcChannels.push({
          channel: ipcMainOn[1],
          direction: 'main.on',
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'ipc',
          `Main process listens on IPC channel "${ipcMainOn[1]}"`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const ipcInvoke = lineText.match(/ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/);
      if (ipcInvoke) {
        ipcChannels.push({
          channel: ipcInvoke[1],
          direction: 'renderer.invoke',
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'ipc',
          `Renderer/preload invokes IPC channel "${ipcInvoke[1]}"`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const ipcSend = lineText.match(/ipcRenderer\.send\s*\(\s*['"]([^'"]+)['"]/);
      if (ipcSend) {
        ipcChannels.push({
          channel: ipcSend[1],
          direction: 'renderer.send',
          file: file.path,
          line: lineNum,
        });
      }

      const routeMatch = lineText.match(
        /(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/,
      );
      if (routeMatch) {
        runtimes.add('Express / HTTP API');
        endpointsAndStorage.push({
          kind: 'http-route',
          value: routeMatch[1],
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'endpoint',
          `HTTP route handler registered for "${routeMatch[1]}"`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const urlMatch = lineText.match(/['"]((?:https?|wss?):\/\/[^'"]+|\/api\/[^'"]+)['"]/);
      if (urlMatch) {
        endpointsAndStorage.push({
          kind: 'url',
          value: urlMatch[1],
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'endpoint',
          `Network endpoint literal "${urlMatch[1]}"`,
          file.path,
          lineNum,
          lineText,
        );
      }

      const storageMatch = lineText.match(
        /(localStorage\.(?:getItem|setItem)\s*\(\s*['"][^'"]+['"]\)|NoteStore\.sqlite|new\s+Database\([^)]+\)|indexedDB\.open\([^)]+\))/,
      );
      if (storageMatch) {
        endpointsAndStorage.push({
          kind: 'storage',
          value: storageMatch[1],
          file: file.path,
          line: lineNum,
        });
        pushEvidence(
          'storage',
          `Persistent storage access detected: ${storageMatch[1]}`,
          file.path,
          lineNum,
          lineText,
        );
      }
    });

    if (file.content.includes('createRoot') || file.content.includes('from \'react\'')) {
      runtimes.add('React UI');
    }
    if (file.content.includes('McpServer') || file.content.includes('@modelcontextprotocol')) {
      runtimes.add('MCP Server');
    }
  }

  if (runtimes.size === 0) {
    runtimes.add('JavaScript Module Bundle');
  }

  const limitations = [
    'Static analysis only: target application code is never executed or evaluated.',
    'Dynamic or computed IPC channel names (e.g. ipcMain.handle(vars.CHANNEL)) require runtime inspection or symbol tracing.',
  ];

  const hasMinified = files.some((f) => {
    const lineList = f.content.split(/\r?\n/);
    return lineList.some((l) => l.length > 500);
  });
  if (hasMinified) {
    limitations.push(
      'One or more files contain long lines (>500 chars); attach source maps (.js.map) for original symbol names.',
    );
  }

  return {
    tool: 'rea-agents/analyze-javascript-application',
    targetPath: cleanTarget,
    analyzedAt: new Date().toISOString(),
    durationMs: Number((performance.now() - t0).toFixed(2)),
    runtimeClassification: Array.from(runtimes),
    summary: {
      fileCount: files.length,
      totalBytes,
      totalLines,
      externalDependencies: Array.from(externalDeps).sort(),
      internalEdges,
    },
    moduleGraph,
    electronBoundaries: {
      detected:
        windows.length > 0 ||
        contextBridgeApis.length > 0 ||
        ipcChannels.length > 0 ||
        runtimes.has('Electron Desktop'),
      windows,
      contextBridgeApis,
      ipcChannels,
    },
    endpointsAndStorage,
    evidence,
    limitations,
  };
}

export interface JsSampleBundle {
  id: string;
  label: string;
  targetPath: string;
  description: string;
  files: SourceFileInput[];
}

export const JS_SAMPLE_BUNDLES: JsSampleBundle[] = [
  {
    id: 'electron-notes',
    label: 'Electron Notes App (ASAR Unpacked)',
    targetPath: '/Applications/WorkspaceNotes.app/Contents/Resources/app',
    description: 'Main process, hardened preload bridge, and renderer search UI.',
    files: [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'workspace-notes-desktop',
            version: '2.4.0',
            main: 'dist/main/index.js',
            dependencies: {
              electron: '^33.2.0',
              'better-sqlite3': '^11.6.0',
              react: '^19.0.1',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'dist/main/index.js',
        content: `import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { queryNotesIndex } from './searchIndex.js';

export function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/bridge.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile('dist/renderer/index.html');
  return win;
}

ipcMain.handle('notes:search', async (_event, query) => {
  return queryNotesIndex(query);
});

ipcMain.handle('notes:export-json', async (_event, noteId) => {
  return { ok: true, noteId };
});`,
      },
      {
        path: 'dist/main/searchIndex.js',
        content: `import Database from 'better-sqlite3';

const db = new Database('NoteStore.sqlite', { readonly: true });

export function queryNotesIndex(rawQuery) {
  const normalized = rawQuery.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  return db.prepare('SELECT id, title, snippet FROM notes_fts WHERE notes_fts MATCH ?').all(normalized);
}`,
      },
      {
        path: 'dist/preload/bridge.js',
        content: `import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('notesBridge', {
  search: (query) => ipcRenderer.invoke('notes:search', query),
  exportNote: (noteId) => ipcRenderer.invoke('notes:export-json', noteId),
});`,
      },
      {
        path: 'dist/renderer/App.tsx',
        content: `import { useState } from 'react';
import { createRoot } from 'react-dom/client';

export function NotesApp() {
  const [query, setQuery] = useState('');
  const runSearch = async (q) => {
    setQuery(q);
    return window.notesBridge.search(q);
  };
  return null;
}`,
      },
    ],
  },
  {
    id: 'vite-spa',
    label: 'React + Express API App',
    targetPath: '/Users/dev/projects/telemetry-console',
    description: 'Client SPA with REST API endpoints and localStorage persistence.',
    files: [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'telemetry-console',
            version: '1.1.0',
            main: 'server.ts',
            dependencies: {
              express: '^4.21.2',
              react: '^19.0.1',
              lucide: '^0.546.0',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'server.ts',
        content: `import express from 'express';

const app = express();
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/analyze', (req, res) => res.json({ accepted: true }));
export default app;`,
      },
      {
        path: 'src/client.ts',
        content: `export async function fetchSummary() {
  const cached = localStorage.getItem('telemetry_cache_v1');
  if (cached) return JSON.parse(cached);
  const res = await fetch('/api/health');
  return res.json();
}`,
      },
    ],
  },
  {
    id: 'mcp-agent',
    label: 'Node.js MCP Server Package',
    targetPath: '/usr/local/lib/node_modules/rea-agents',
    description: 'Stdio MCP server entrypoint exposing local inspection tools.',
    files: [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'rea-agents',
            version: '0.9.4',
            main: 'dist/cli.js',
            dependencies: {
              '@modelcontextprotocol/sdk': '^1.12.0',
              commander: '^12.1.0',
            },
          },
          null,
          2,
        ),
      },
      {
        path: 'dist/mcp/server.js',
        content: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { analyzeJsApp } from '../analyzers/javascriptApplicationAnalysis.js';

export function startMcpServer() {
  const server = new McpServer({ name: 'rea', version: '0.9.4' });
  return { server, analyzeJsApp };
}`,
      },
      {
        path: 'dist/analyzers/javascriptApplicationAnalysis.js',
        content: `export function analyzeJsApp(targetDir) {
  return { targetDir, modules: [], evidence: [] };
}`,
      },
    ],
  },
];
