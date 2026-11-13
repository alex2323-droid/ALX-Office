import { useEffect, useMemo, useState } from 'react';
import { Play, RotateCcw, Terminal, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  ClientId,
  REA_CLIENTS,
  SetupOptions,
  buildExecutionPlan,
  buildSetupCommand,
  isNodeSupported,
} from '../data/reaConfig';

interface TerminalSimulatorViewProps {
  options: SetupOptions;
  onChange: (next: SetupOptions) => void;
}

type SimStage = 'idle' | 'scanning' | 'select_clients' | 'review_plan' | 'complete';

export default function TerminalSimulatorView({
  options,
  onChange,
}: TerminalSimulatorViewProps) {
  const [stage, setStage] = useState<SimStage>('select_clients');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);

  const command = useMemo(() => buildSetupCommand(options), [options]);
  const plan = useMemo(() => buildExecutionPlan(options), [options]);
  const nodeOk = isNodeSupported(options.nodeVersion);

  const toggleClientAt = (id: ClientId) => {
    const exists = options.selectedClients.includes(id);
    const nextClients = exists
      ? options.selectedClients.filter((c) => c !== id)
      : [...options.selectedClients, id];
    onChange({ ...options, selectedClients: nextClients });
  };

  const startWizard = () => {
    setStage('scanning');
    setLogLines([
      `$ ${command}`,
      `rea-agents@latest · Node.js v${options.nodeVersion} (${nodeOk ? 'supported' : 'unsupported < 22.19'})`,
      'Scanning local coding agents for MCP support...',
    ]);
  };

  useEffect(() => {
    if (stage !== 'scanning') return;
    const timer = window.setTimeout(() => {
      const detectedCount = REA_CLIENTS.filter((c) => c.defaultDetected).length;
      setLogLines((prev) => [
        ...prev,
        `Detected ${detectedCount} active clients; ${REA_CLIENTS.length} total supported targets available.`,
      ]);
      setStage(options.nonInteractive ? 'review_plan' : 'select_clients');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [stage, options.nonInteractive]);

  const confirmClients = () => {
    if (options.selectedClients.length === 0) return;
    setLogLines((prev) => [
      ...prev,
      `Selected targets: ${options.selectedClients.join(', ')}`,
      `Generating setup plan (${plan.length} operations)...`,
    ]);
    setStage('review_plan');
  };

  const approveAndApply = () => {
    const appliedLines = plan.map((p) => {
      if (options.dryRun) {
        return `[dry-run] Would ${p.action.toLowerCase()} ${p.path}`;
      }
      return `[ok] ${p.action}: ${p.path}`;
    });

    setLogLines((prev) => [
      ...prev,
      ...appliedLines,
      options.dryRun
        ? 'Dry run complete. No files were modified on disk.'
        : 'Setup complete. Restart selected coding agents to reload MCP tools.',
    ]);
    setStage('complete');
  };

  const resetWizard = () => {
    setLogLines([]);
    setCursorIndex(0);
    setStage('idle');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (stage !== 'select_clients') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursorIndex((i) => (i + 1) % REA_CLIENTS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursorIndex((i) => (i - 1 + REA_CLIENTS.length) % REA_CLIENTS.length);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleClientAt(REA_CLIENTS[cursorIndex].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmClients();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Interactive CLI Setup Runner
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Step through the interactive <code className="font-mono text-xs">npx rea-agents@latest setup</code> terminal prompts with keyboard arrows and spacebar or direct click controls.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetWizard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={startWizard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run Setup Wizard</span>
            </button>
          </div>
        </div>
      </section>

      {/* Terminal viewport */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100 focus:outline-2 focus:outline-blue-600"
      >
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <Terminal className="h-3.5 w-3.5 text-slate-400" />
            <span>{options.os === 'windows' ? 'pwsh — rea-agents' : 'zsh — rea-agents'}</span>
          </div>
          <div className="font-mono text-xs text-slate-400">
            {stage === 'select_clients'
              ? 'Up/Down: Navigate · Space: Toggle · Enter: Continue'
              : `Stage: ${stage.replace('_', ' ')}`}
          </div>
        </div>

        <div className="space-y-4 p-5 font-mono text-xs leading-relaxed">
          {/* Initial command line */}
          <div>
            <span className="text-emerald-400">$ </span>
            <span className="text-slate-100">{command}</span>
          </div>

          {/* Historical log lines */}
          {logLines.length > 0 && (
            <div className="space-y-1 border-t border-slate-800/80 pt-3 text-slate-300">
              {logLines.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.startsWith('[ok]')
                      ? 'text-emerald-400'
                      : line.startsWith('[dry-run]')
                        ? 'text-amber-300'
                        : 'text-slate-300'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Stage: Idle */}
          {stage === 'idle' && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-slate-300">
              Press <strong className="text-white">Run Setup Wizard</strong> above to start the interactive terminal session.
            </div>
          )}

          {/* Stage: Client Multi-Select */}
          {stage === 'select_clients' && (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-slate-200">
                ? Select coding clients to configure with REA MCP + workflow skill:
              </div>
              <div className="space-y-1">
                {REA_CLIENTS.map((client, idx) => {
                  const selected = options.selectedClients.includes(client.id);
                  const focused = cursorIndex === idx;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onMouseEnter={() => setCursorIndex(idx)}
                      onClick={() => toggleClientAt(client.id)}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors ${
                        focused ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-blue-400">{focused ? '>' : ' '}</span>
                        <span className={selected ? 'text-emerald-400' : 'text-slate-500'}>
                          {selected ? '[x]' : '[ ]'}
                        </span>
                        <span className="font-medium">{client.name}</span>
                        <span className="text-slate-500">({client.cliFlag})</span>
                      </span>
                      <span className="text-slate-500">
                        {client.defaultDetected ? 'detected' : 'available'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                <span className="text-slate-400 tabular-nums">
                  {options.selectedClients.length} client(s) selected
                </span>
                <button
                  type="button"
                  disabled={options.selectedClients.length === 0}
                  onClick={confirmClients}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 font-sans text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Continue to Plan</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Stage: Review Plan */}
          {stage === 'review_plan' && (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-slate-200">
                Setup Plan ({plan.length} actions · {options.dryRun ? 'Dry Run' : 'Write Mode'}):
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto border-y border-slate-800 py-2.5">
                {plan.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4">
                    <span className="truncate text-slate-300">
                      <span
                        className={
                          item.action === 'Backup'
                            ? 'text-amber-300'
                            : item.action === 'Create'
                              ? 'text-emerald-400'
                              : 'text-blue-400'
                        }
                      >
                        [{item.action.toUpperCase()}]
                      </span>{' '}
                      {item.path}
                    </span>
                    <span className="shrink-0 text-slate-500">{item.clientName}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-slate-300">? Apply these configuration changes? (Y/n)</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStage('select_clients')}
                    className="rounded border border-slate-700 px-3 py-1.5 font-sans text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={approveAndApply}
                    className="rounded bg-emerald-600 px-3.5 py-1.5 font-sans text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {options.dryRun ? 'Run Dry Check' : 'Approve and Apply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stage: Complete */}
          {stage === 'complete' && (
            <div className="space-y-3 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-4">
              <div className="flex items-center gap-2 font-sans text-sm font-medium text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {options.dryRun
                    ? 'Dry run verified cleanly — remove --dry-run to write configuration files.'
                    : 'REA Agents configured. Restart your coding client to load the MCP server.'}
                </span>
              </div>
              <div className="space-y-1 text-slate-300">
                {options.selectedClients.map((id) => {
                  const c = REA_CLIENTS.find((item) => item.id === id);
                  if (!c) return null;
                  return (
                    <div key={c.id}>
                      - {c.name}: {c.restartHint}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
