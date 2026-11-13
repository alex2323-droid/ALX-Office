import { useMemo, useState } from 'react';
import { Check, Copy, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  ClientId,
  REA_CLIENTS,
  SetupOptions,
  buildDoctorJsonReport,
  buildJsonConfigPreview,
  buildTomlConfigPreview,
  isNodeSupported,
} from '../data/reaConfig';

interface DoctorDiagnosticsViewProps {
  options: SetupOptions;
}

export default function DoctorDiagnosticsView({ options }: DoctorDiagnosticsViewProps) {
  const [activeClientId, setActiveClientId] = useState<ClientId>(
    options.selectedClients[0] || 'claude_code',
  );
  const [restartedClients, setRestartedClients] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>('Ready');

  const nodeOk = isNodeSupported(options.nodeVersion);
  const doctorReport = useMemo(() => buildDoctorJsonReport(options), [options]);
  const doctorJsonText = useMemo(
    () => JSON.stringify(doctorReport, null, 2),
    [doctorReport],
  );

  const activeClient =
    REA_CLIENTS.find((c) => c.id === activeClientId) ?? REA_CLIENTS[0];

  const manualConfigText = useMemo(
    () =>
      activeClient.configFormat === 'toml'
        ? buildTomlConfigPreview(options)
        : buildJsonConfigPreview(options),
    [activeClient.configFormat, options],
  );

  const doctorCommand =
    options.selectedClients.length === 1
      ? `npx rea-agents@latest doctor --client ${options.selectedClients[0]} --json`
      : 'npx rea-agents@latest doctor --json';

  const copyValue = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((p) => (p === key ? null : p)), 1600);
  };

  const toggleRestarted = (id: string) => {
    setRestartedClients((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const runCheck = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    setLastCheckedAt(`Checked at ${hh}:${mm}:${ss}`);
  };

  return (
    <div className="space-y-6">
      {/* Doctor Overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Doctor Diagnostics and Manual Config
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Validate Node.js compatibility, stdio transport wrapping, and per-client configuration files with <code className="font-mono text-xs">rea doctor</code>.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {lastCheckedAt}
            </span>
            <button
              type="button"
              onClick={runCheck}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Re-run Diagnostics</span>
            </button>
          </div>
        </div>

        {/* Health Checks Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 pr-4">Diagnostic Check</th>
                <th className="py-2.5 px-4">Expected Requirement</th>
                <th className="py-2.5 px-4">Current Value</th>
                <th className="py-2.5 pl-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                  Node.js Runtime
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  22.23.4+, 24.22.1+, or 26.12.1+
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                  v{options.nodeVersion}
                </td>
                <td className="py-3 pl-4 text-right">
                  {nodeOk ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Pass</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Fail</span>
                    </span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                  MCP Stdio Invocation
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {options.os === 'windows' ? 'cmd /c wrapper required' : 'Direct binary / npx'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
                  {options.os === 'windows' ? 'cmd /c rea mcp' : `${options.runner} rea-agents mcp`}
                </td>
                <td className="py-3 pl-4 text-right">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Pass</span>
                  </span>
                </td>
              </tr>

              <tr>
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                  Workflow Skill Pairing
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  MCP Server + SKILL.md
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
                  {options.installSkill ? 'MCP + SKILL.md' : 'MCP Only (--mcp-only)'}
                </td>
                <td className="py-3 pl-4 text-right">
                  {options.installSkill ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Complete</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Skill Omitted</span>
                    </span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                  Schema Token Budget
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  tools/list payload size
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">
                  in={options.inputSchemaProfile} / out={options.outputSchemaProfile}
                </td>
                <td className="py-3 pl-4 text-right">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Configured</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Post-Setup Restart Checklist + Manual Config */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Manual Client Config */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Manual Client Configuration
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use these snippets when wiring an unlisted client or configuring MCP manually.
              </p>
            </div>
            <select
              aria-label="Select client for manual configuration"
              value={activeClient.id}
              onChange={(e) => setActiveClientId(e.target.value as ClientId)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {REA_CLIENTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.configFormat.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Target File Path
              </div>
              <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">
                {options.scope === 'project' && activeClient.projectConfigPath
                  ? activeClient.projectConfigPath
                  : options.os === 'windows'
                    ? activeClient.windowsConfigPath
                    : activeClient.unixConfigPath}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
                <span className="font-mono text-xs text-slate-400">
                  {activeClient.configFormat === 'toml' ? 'config.toml' : 'mcp.json'}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('manual-cfg', manualConfigText)}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'manual-cfg' ? (
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
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                <code>{manualConfigText}</code>
              </pre>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Direct CLI One-Liner
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyValue('manual-cli', activeClient.manualCliCommand(options.os))
                  }
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {copiedKey === 'manual-cli' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="mt-1.5 block overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-800 dark:text-slate-200">
                {activeClient.manualCliCommand(options.os)}
              </code>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {activeClient.notes}
              </p>
            </div>
          </div>
        </section>

        {/* Restart Verification + Doctor JSON */}
        <section className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Post-Setup Restart Checklist
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              MCP clients cache tool lists at startup. Fully quit and relaunch each configured client.
            </p>

            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {options.selectedClients.length === 0 ? (
                <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                  No clients currently selected in the setup wizard.
                </p>
              ) : (
                options.selectedClients.map((id) => {
                  const client = REA_CLIENTS.find((c) => c.id === id);
                  if (!client) return null;
                  const done = !!restartedClients[id];
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-start gap-3 py-3 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleRestarted(id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <div>
                        <div
                          className={`font-medium ${
                            done
                              ? 'text-slate-400 line-through dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {client.name}
                        </div>
                        <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                          {client.restartHint}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-medium text-slate-200">
                  {doctorCommand}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyValue('doctor-json', doctorJsonText)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {copiedKey === 'doctor-json' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
              <code>{doctorJsonText}</code>
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
