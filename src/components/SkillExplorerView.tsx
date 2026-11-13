import { useState } from 'react';
import { Check, Copy, FileText, Layers } from 'lucide-react';
import { SetupOptions, WORKFLOW_SKILL_MARKDOWN } from '../data/reaConfig';

interface SkillExplorerViewProps {
  options: SetupOptions;
}

const VERIFICATION_PROMPTS = [
  {
    id: 'binary-static',
    title: 'Static Binary & Bundle Inventory',
    target: 'Desktop App / Electron ASAR / Native Binary',
    prompt:
      'Use the rea MCP server to statically inspect ./path/to/app. Map its entry points, embedded bundles, and exported symbols, and cite file paths or offsets for every finding.',
  },
  {
    id: 'api-surface',
    title: 'API & Endpoint Schema Extraction',
    target: 'Web Bundle / Mobile Package (APK / IPA)',
    prompt:
      'Use the rea MCP server to analyze the unpacked bundle at ./path/to/bundle. Extract all HTTP/WebSocket endpoints, auth headers, and request payloads without modifying any files.',
  },
  {
    id: 'mcp-check',
    title: 'Quick Tool Availability Verification',
    target: 'Any Newly Configured Client',
    prompt:
      'List the tools exposed by the rea MCP server and confirm the reverse-engineer-anything skill instructions are loaded in context.',
  },
];

const ARCHITECTURE_LAYERS = [
  {
    layer: '01. Local MCP Server (rea mcp)',
    role: 'Execution Engine',
    detail:
      'Runs over stdio via npx/bunx/global CLI to expose read-only inspection, unpacking, string extraction, and binary structure tools directly to your coding agent.',
  },
  {
    layer: '02. Workflow Skill (SKILL.md)',
    role: 'Agent Methodology',
    detail:
      'Installs reverse-engineer-anything/SKILL.md so the model starts with structural inventory, enforces read-only safety, and cites concrete artifact evidence.',
  },
  {
    layer: '03. Client Backup & Merge',
    role: 'Safe Configuration',
    detail:
      'Snapshots existing mcp.json, .claude.json, or config.toml files before merging mcpServers.rea, keeping custom user servers intact.',
  },
];

export default function SkillExplorerView({ options }: SkillExplorerViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1600);
  };

  return (
    <div className="space-y-6">
      {/* Architecture overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              MCP Architecture and Workflow Skill
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Why <code className="font-mono text-xs">npx rea-agents setup</code> pairs a local MCP server with a <code className="font-mono text-xs">SKILL.md</code> instruction file.
            </p>
          </div>
          <Layers className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 md:grid-cols-3 dark:border-slate-800">
          {ARCHITECTURE_LAYERS.map((item) => (
            <div key={item.layer} className="space-y-2">
              <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                {item.role}
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.layer}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* SKILL.md Preview */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  reverse-engineer-anything/SKILL.md
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {options.installSkill
                    ? 'Included in current setup plan'
                    : 'Currently excluded via --mcp-only'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyText('skill-md', WORKFLOW_SKILL_MARKDOWN)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copiedId === 'skill-md' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Skill</span>
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-200">
            <code>{WORKFLOW_SKILL_MARKDOWN}</code>
          </pre>
        </section>

        {/* Post-restart verification prompts */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Verification Prompts After Restart
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Once your coding client restarts, run one of these prompts to confirm the <code className="font-mono text-xs">rea</code> MCP tools respond cleanly.
          </p>

          <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
            {VERIFICATION_PROMPTS.map((item) => (
              <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {item.target}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(item.id, item.prompt)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Prompt</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-2.5 rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  {item.prompt}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
