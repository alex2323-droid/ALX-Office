import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCode2,
  FolderOpen,
  Info,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  JS_SAMPLE_BUNDLES,
  SourceFileInput,
  analyzeJavaScriptApplication,
} from '../lib/jsAppAnalyzer';

type AnalyzerTab = 'boundaries' | 'modules' | 'evidence' | 'json';

export default function JsAnalyzerView() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(JS_SAMPLE_BUNDLES[0].id);
  const [targetPath, setTargetPath] = useState<string>(JS_SAMPLE_BUNDLES[0].targetPath);
  const [files, setFiles] = useState<SourceFileInput[]>(JS_SAMPLE_BUNDLES[0].files);
  const [jsonFlag, setJsonFlag] = useState(true);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>('boundaries');
  const [moduleFilter, setModuleFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState('src/customModule.ts');
  const [customFileBody, setCustomFileBody] = useState(
    "import { ipcRenderer } from 'electron';\nexport function runProbe() {\n  return ipcRenderer.invoke('notes:search', 'sqlite');\n}",
  );
  const [showAddFile, setShowAddFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cliCommand = `npx -y rea-agents@latest analyze-javascript-application ${targetPath.trim() || '/absolute/path/to/app'}${jsonFlag ? ' --json' : ''}`;

  const analysis = useMemo(
    () => analyzeJavaScriptApplication(targetPath, files),
    [targetPath, files],
  );

  const jsonOutput = useMemo(
    () => JSON.stringify(analysis, null, 2),
    [analysis],
  );

  const filteredModules = useMemo(() => {
    const q = moduleFilter.trim().toLowerCase();
    if (!q) return analysis.moduleGraph;
    return analysis.moduleGraph.filter(
      (m) =>
        m.path.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.imports.some((i) => i.toLowerCase().includes(q)),
    );
  }, [analysis.moduleGraph, moduleFilter]);

  const copyValue = (id: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const loadPreset = (presetId: string) => {
    const preset = JS_SAMPLE_BUNDLES.find((b) => b.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setTargetPath(preset.targetPath);
    setFiles(preset.files);
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;

    const loaded: SourceFileInput[] = [];
    for (const f of Array.from(picked)) {
      const text = await f.text();
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      loaded.push({ path: rel, content: text });
    }
    setSelectedPresetId('uploaded');
    setTargetPath(`/uploaded/${loaded[0]?.path.split('/')[0] || 'app'}`);
    setFiles(loaded);
    e.target.value = '';
  };

  const handleAddCustomFile = () => {
    const path = customFileName.trim();
    if (!path) return;
    setFiles((prev) => {
      const existing = prev.findIndex((f) => f.path === path);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = { path, content: customFileBody };
        return copy;
      }
      return [...prev, { path, content: customFileBody }];
    });
    setShowAddFile(false);
  };

  const downloadJson = () => {
    const blob = new Blob([jsonOutput], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rea-javascript-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Command & Target Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              JavaScript Application Analyzer
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Static read-only inspection for packed JS bundles, web apps, and unpacked Electron ASAR directories matching <code className="font-mono text-xs">analyze-javascript-application --json</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".js,.mjs,.cjs,.ts,.tsx,.jsx,.json"
              onChange={handleUploadFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Load Local JS/TS Files</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddFile((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>{showAddFile ? 'Close Snippet Editor' : 'Add Code Snippet'}</span>
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export --json</span>
            </button>
          </div>
        </div>

        {/* Verified sandbox runtime diagnostic */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              CLI Engine Note:
            </span>{' '}
            Executing <code className="font-mono">rea-agents@6.9.0</code> directly requires Node.js <code className="font-mono">&gt;=22.23.4</code>, <code className="font-mono">&gt;=24.22.1</code>, or <code className="font-mono">&gt;=26.12.1</code> (this container runs <code className="font-mono">v22.23.2</code>). To inspect targets immediately in-browser, load local files or sample bundles below to generate the structured <code className="font-mono">--json</code> evidence report.
          </div>
        </div>

        {/* Target Path & CLI Command Builder */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label
              htmlFor="js-target-path"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Target Application Path
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative flex-1">
                <FolderOpen className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="js-target-path"
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() => setJsonFlag((v) => !v)}
                className={`rounded-lg border px-3 py-2 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                  jsonFlag
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                --json
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              CLI Invocation
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-950 px-3.5 py-2 text-slate-100 dark:border-slate-800">
              <code className="truncate font-mono text-xs text-slate-100">
                <span className="select-none text-slate-500">$ </span>
                {cliCommand}
              </code>
              <button
                type="button"
                onClick={() => copyValue('js-cli', cliCommand)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {copiedId === 'js-cli' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sample Bundle Presets */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Target bundle:
          </span>
          {JS_SAMPLE_BUNDLES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedPresetId === preset.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Optional Custom Code Snippet Drawer */}
        {showAddFile && (
          <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="text"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                placeholder="Relative file path (e.g. dist/preload.js)"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleAddCustomFile}
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Add / Replace File in Target
              </button>
            </div>
            <textarea
              rows={4}
              value={customFileBody}
              onChange={(e) => setCustomFileBody(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        )}

        {/* Quantitative Metrics Strip */}
        <div className="mt-5 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Runtime</div>
            <div className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
              {analysis.runtimeClassification.join(' · ')}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Modules Scanned</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {analysis.summary.fileCount} files · {analysis.summary.totalLines} lines
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">IPC & Routes</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {analysis.electronBoundaries.ipcChannels.length} IPC · {analysis.endpointsAndStorage.length} endpoints
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Evidence Records</div>
            <div className="mt-0.5 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {analysis.evidence.length} citations ({analysis.durationMs} ms)
            </div>
          </div>
        </div>
      </section>

      {/* Inspection Workspace Tabs */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-3.5 dark:border-slate-800">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { id: 'boundaries', label: 'Boundaries & Security' },
                { id: 'modules', label: 'Module Graph' },
                { id: 'evidence', label: 'Evidence Trail' },
                { id: 'json', label: 'Raw --json Output' },
              ] as { id: AnalyzerTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {analysis.summary.externalDependencies.length} external packages · {analysis.summary.internalEdges} internal imports
          </span>
        </div>

        {/* Tab 1: Boundaries & Security */}
        {activeTab === 'boundaries' && (
          <div className="space-y-6 p-6">
            {analysis.electronBoundaries.detected ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Electron BrowserWindow Security Posture
                  </h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="py-2 pr-4">Source Location</th>
                          <th className="py-2 px-4">Preload Script</th>
                          <th className="py-2 px-4">contextIsolation</th>
                          <th className="py-2 px-4">nodeIntegration</th>
                          <th className="py-2 pl-4">sandbox</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono dark:divide-slate-800">
                        {analysis.electronBoundaries.windows.map((w, i) => (
                          <tr key={i}>
                            <td className="py-2.5 pr-4 text-slate-900 dark:text-slate-100">
                              {w.file}:{w.line}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                              {w.preload ?? 'none'}
                            </td>
                            <td className="px-4 py-2.5">
                              {w.contextIsolation === 'true' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <ShieldCheck className="h-3.5 w-3.5" /> true
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />{' '}
                                  {w.contextIsolation ?? 'unspecified'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {w.nodeIntegration === 'false' ? (
                                <span className="text-emerald-700 dark:text-emerald-400">false</span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400">
                                  {w.nodeIntegration ?? 'unspecified'}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pl-4 text-slate-700 dark:text-slate-300">
                              {w.sandbox ?? 'unspecified'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ContextBridge Exposed APIs
                    </h3>
                    <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {analysis.electronBoundaries.contextBridgeApis.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500">
                          No contextBridge.exposeInMainWorld calls detected.
                        </p>
                      ) : (
                        analysis.electronBoundaries.contextBridgeApis.map((api, i) => (
                          <div key={i} className="p-3.5 text-xs">
                            <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                              window.{api.namespace}
                            </div>
                            <div className="mt-1 font-mono text-slate-600 dark:text-slate-400">
                              Methods: {api.methods.join(', ') || 'none detected'}
                            </div>
                            <div className="mt-1 font-mono text-slate-400">
                              {api.file}:{api.line}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      IPC Channels (Main / Preload / Renderer)
                    </h3>
                    <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {analysis.electronBoundaries.ipcChannels.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500">
                          No IPC channel handlers detected.
                        </p>
                      ) : (
                        analysis.electronBoundaries.ipcChannels.map((ipc, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-4 p-3.5 font-mono text-xs"
                          >
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {ipc.channel}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {ipc.direction} · {ipc.file}:{ipc.line}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                No Electron <code className="font-mono">BrowserWindow</code> or <code className="font-mono">ipcMain</code> boundaries detected in this target. Check HTTP routes, storage hooks, and module imports below.
              </div>
            )}

            {/* Endpoints & Limitations */}
            <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 lg:grid-cols-2 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  HTTP Routes, URLs, and Storage Access
                </h3>
                <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {analysis.endpointsAndStorage.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      No explicit HTTP route handlers or storage literals detected.
                    </p>
                  ) : (
                    analysis.endpointsAndStorage.map((ep, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 p-3.5 font-mono text-xs"
                      >
                        <span className="truncate text-slate-900 dark:text-slate-100">
                          {ep.value}
                        </span>
                        <span className="shrink-0 text-slate-500 dark:text-slate-400">
                          {ep.kind} · {ep.file}:{ep.line}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Analytical Limitations & Unknowns
                </h3>
                <ul className="mt-3 space-y-2 rounded-lg border border-slate-200 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {analysis.limitations.map((lim, i) => (
                    <li key={i}>• {lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Module Graph */}
        {activeTab === 'modules' && (
          <div className="space-y-4 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="text"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                placeholder="Filter modules by path, role, or import..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none sm:max-w-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                External packages: {analysis.summary.externalDependencies.join(', ') || 'None'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Module Path</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Imports</th>
                    <th className="py-2.5 px-4">Exports</th>
                    <th className="py-2.5 pl-4 text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono dark:divide-slate-800">
                  {filteredModules.map((mod) => (
                    <tr key={mod.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        {mod.path}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {mod.role}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {mod.imports.length > 0 ? mod.imports.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {mod.exports.length > 0 ? mod.exports.join(', ') : '—'}
                      </td>
                      <td className="py-3 pl-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {mod.lines}L · {mod.bytes}B
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Evidence Trail */}
        {activeTab === 'evidence' && (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {analysis.evidence.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No static evidence hooks matched in the loaded files.
              </div>
            ) : (
              analysis.evidence.map((ev) => (
                <div key={ev.id} className="space-y-1.5 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {ev.claim}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {ev.category} · {ev.file}:{ev.line}
                    </span>
                  </div>
                  <pre className="overflow-x-auto rounded bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
                    <code>{ev.excerpt}</code>
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Raw --json Output */}
        {activeTab === 'json' && (
          <div className="bg-slate-950 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
              <span className="font-mono text-xs text-slate-400">
                analyze-javascript-application --json
              </span>
              <button
                type="button"
                onClick={() => copyValue('raw-json', jsonOutput)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                {copiedId === 'raw-json' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied JSON</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-[520px] overflow-auto p-6 font-mono text-xs leading-relaxed text-slate-200">
              <code>{jsonOutput}</code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
