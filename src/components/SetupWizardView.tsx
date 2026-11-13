import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode,
  FolderGit2,
  Laptop,
  Search,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import {
  ClientId,
  InputSchemaProfile,
  NODE_PRESETS,
  OsTarget,
  OutputSchemaProfile,
  PackageRunner,
  PlannedFileChange,
  REA_CLIENTS,
  SetupOptions,
  buildExecutionPlan,
  buildSetupCommand,
  buildShellScript,
  isNodeSupported,
} from '../data/reaConfig';

interface SetupWizardViewProps {
  options: SetupOptions;
  onChange: (next: SetupOptions) => void;
  onLaunchSimulator: () => void;
}

export default function SetupWizardView({
  options,
  onChange,
  onLaunchSimulator,
}: SetupWizardViewProps) {
  const [clientSearch, setClientSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'json' | 'toml'>('all');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const command = useMemo(() => buildSetupCommand(options), [options]);
  const plan = useMemo(() => buildExecutionPlan(options), [options]);
  const nodeOk = isNodeSupported(options.nodeVersion);

  const activePlanItem: PlannedFileChange | undefined =
    plan.find((p) => p.id === selectedPlanId) ?? plan[0];

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return REA_CLIENTS.filter((c) => {
      if (formatFilter !== 'all' && c.configFormat !== formatFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.vendor.toLowerCase().includes(q) ||
        c.cliFlag.toLowerCase().includes(q)
      );
    });
  }, [clientSearch, formatFilter]);

  const copyText = (id: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const toggleClient = (id: ClientId) => {
    const exists = options.selectedClients.includes(id);
    const nextClients = exists
      ? options.selectedClients.filter((c) => c !== id)
      : [...options.selectedClients, id];
    onChange({ ...options, selectedClients: nextClients });
  };

  const applyPreset = (preset: 'detected' | 'all' | 'minimal') => {
    if (preset === 'detected') {
      onChange({
        ...options,
        selectedClients: REA_CLIENTS.filter((c) => c.defaultDetected).map((c) => c.id),
      });
    } else if (preset === 'all') {
      onChange({
        ...options,
        selectedClients: REA_CLIENTS.map((c) => c.id),
      });
    } else {
      onChange({
        ...options,
        selectedClients: ['claude_code'],
      });
    }
  };

  const downloadScript = () => {
    const script = buildShellScript(options);
    const ext = options.os === 'windows' ? 'ps1' : 'sh';
    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `setup-rea.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Command Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Interactive Setup Configurator
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Select your runtime, target coding clients, and MCP schema profile to preview the exact plan before running locally.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={downloadScript}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export {options.os === 'windows' ? 'PowerShell' : 'Shell'} Script</span>
            </button>
            <button
              type="button"
              onClick={onLaunchSimulator}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Run in CLI Simulator</span>
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <code className="block whitespace-nowrap font-mono text-sm text-slate-100">
              <span className="select-none text-slate-500">$ </span>
              {command}
            </code>
          </div>
          <button
            type="button"
            onClick={() => copyText('main-cmd', command)}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500 whitespace-nowrap shrink-0"
          >
            {copiedId === 'main-cmd' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Command</span>
              </>
            )}
          </button>
        </div>

        {/* Quantitative summary row */}
        <div className="mt-5 grid grid-cols-2 gap-6 border-t border-slate-200 pt-5 sm:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Node.js Runtime</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              <span>v{options.nodeVersion}</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className={nodeOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {nodeOk ? 'Compatible' : 'Upgrade Required'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Selected Clients</div>
            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {options.selectedClients.length} / {REA_CLIENTS.length} agents
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Planned Operations</div>
            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {plan.length} file actions
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Execution Mode</div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
              {options.dryRun ? 'Dry Run (Read-only)' : 'Write + Auto Backup'}
            </div>
          </div>
        </div>
      </section>

      {/* Step 1 + Step 3 Controls */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Step 1: Environment & Runtime */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              01. Environment and Runner
            </h2>
            <Laptop className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Targets determine config directory layout and Windows <code className="font-mono text-xs">cmd /c</code> stdio wrapping.
          </p>

          <div className="mt-5 space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Operating System
              </label>
              <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(
                  [
                    { id: 'unix', label: 'macOS / Linux' },
                    { id: 'windows', label: 'Windows' },
                  ] as { id: OsTarget; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange({ ...options, os: item.id })}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.os === item.id
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Package Runner
              </label>
              <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(
                  [
                    { id: 'npx', label: 'npx (Recommended)' },
                    { id: 'bunx', label: 'bunx' },
                    { id: 'global', label: 'Global rea CLI' },
                  ] as { id: PackageRunner; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange({ ...options, runner: item.id })}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.runner === item.id
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="node-preset"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Node.js Version Check (Requires 22.23.4+, 24.22.1+, or 26.12.1+)
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {NODE_PRESETS.map((preset) => {
                  const active = options.nodeVersion === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => onChange({ ...options, nodeVersion: preset.value })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {!nodeOk && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>
                    Node.js v{options.nodeVersion} is below the minimum supported runtime (22.23.4+, 24.22.1+, 26.12.1+). Upgrade Node before executing <code className="font-mono">npx rea-agents@latest setup</code>.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Step 2: MCP Tuning & CLI Flags */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              02. Scope, Flags, and Schema Profiles
            </h2>
            <FolderGit2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Control installation scope, dry-run safety, and MCP tool schema verbosity for context token efficiency.
          </p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Configuration Scope
                </label>
                <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => onChange({ ...options, scope: 'user' })}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.scope === 'user'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    User Global
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...options, scope: 'project' })}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.scope === 'project'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Project Local
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  CLI Execution Flags
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ ...options, dryRun: !options.dryRun })}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                      options.dryRun
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    --dry-run
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...options, nonInteractive: !options.nonInteractive })
                    }
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                      options.nonInteractive
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    --yes
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...options, installSkill: !options.installSkill })
                    }
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      options.installSkill
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Include SKILL.md
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Input Schema Profile
                </label>
                <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  {(['compact', 'full'] as InputSchemaProfile[]).map((prof) => (
                    <button
                      key={prof}
                      type="button"
                      onClick={() => onChange({ ...options, inputSchemaProfile: prof })}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                        options.inputSchemaProfile === prof
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {prof}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <code className="font-mono">compact</code> reduces prompt token overhead; <code className="font-mono">full</code> exposes nested field validation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Output Schema Profile
                </label>
                <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  {(['compact', 'full', 'off'] as OutputSchemaProfile[]).map((prof) => (
                    <button
                      key={prof}
                      type="button"
                      onClick={() => onChange({ ...options, outputSchemaProfile: prof })}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                        options.outputSchemaProfile === prof
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {prof}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Set to <code className="font-mono">off</code> if a client enforces strict <code className="font-mono">tools/list</code> frame limits.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Step 3: Client Detection & Selection Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              03. Target Coding Agents
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Toggle the local MCP clients you want <code className="font-mono text-xs">rea-agents</code> to configure.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset('detected')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Detected Defaults
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => applyPreset('minimal')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Claude Code Only
            </button>
          </div>
        </div>

        {/* Search & Format Filter Bar */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Filter clients (e.g. cursor, codex)"
              aria-label="Filter coding clients"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 p-1 self-start dark:bg-slate-800">
            {(['all', 'json', 'toml'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatFilter(fmt)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase transition-colors whitespace-nowrap shrink-0 ${
                  formatFilter === fmt
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Client Table */}
        <div className="mt-4 overflow-x-auto">
          {filteredClients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No coding clients match &ldquo;{clientSearch}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setClientSearch('');
                  setFormatFilter('all');
                }}
                className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-4">Client</th>
                  <th className="py-2.5 px-4">CLI Flag</th>
                  <th className="py-2.5 px-4">Config Target</th>
                  <th className="py-2.5 px-4">Format</th>
                  <th className="py-2.5 pl-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredClients.map((client) => {
                  const selected = options.selectedClients.includes(client.id);
                  const targetPath =
                    options.scope === 'project' && client.projectConfigPath
                      ? client.projectConfigPath
                      : options.os === 'windows'
                        ? client.windowsConfigPath
                        : client.unixConfigPath;

                  return (
                    <tr
                      key={client.id}
                      onClick={() => toggleClient(client.id)}
                      className={`cursor-pointer transition-colors ${
                        selected
                          ? 'bg-blue-50/50 hover:bg-blue-50/80 dark:bg-blue-950/20 dark:hover:bg-blue-950/35'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleClient(client.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${client.name}`}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-800"
                          />
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {client.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {client.vendor}
                              {client.defaultDetected ? ' · Auto-detected' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        --client {client.cliFlag}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {targetPath}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs uppercase text-slate-600 dark:text-slate-400">
                        {client.configFormat}
                      </td>
                      <td className="py-3 pl-4 text-right text-xs font-medium">
                        <span
                          className={
                            selected
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          {selected ? 'Included' : 'Skipped'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Step 4: Setup Plan & File Diff Preview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              04. Setup Plan and File Output Preview
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Inspect every backup, MCP server entry, and workflow skill file that <code className="font-mono text-xs">rea-agents setup</code> writes.
            </p>
          </div>
          <FileCode className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </div>

        {plan.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Select at least one coding client above to generate the setup plan.
            </p>
            <button
              type="button"
              onClick={() => applyPreset('detected')}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Restore Detected Defaults
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* File list */}
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 lg:col-span-5 dark:divide-slate-800 dark:border-slate-800">
              {plan.map((item) => {
                const isActive = activePlanItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPlanId(item.id)}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                        {item.path}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.clientName} · {item.summary}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs font-medium ${
                        item.action === 'Backup'
                          ? 'text-amber-700 dark:text-amber-400'
                          : item.action === 'Create'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {item.action}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active file preview */}
            {activePlanItem && (
              <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-950 text-slate-100 lg:col-span-7 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-medium text-slate-200">
                      {activePlanItem.path}
                    </div>
                    <div className="text-xs text-slate-400">
                      {activePlanItem.action} · {activePlanItem.clientName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(activePlanItem.id, activePlanItem.content)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {copiedId === activePlanItem.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy File</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="flex-1 overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                  <code>{activePlanItem.content}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
