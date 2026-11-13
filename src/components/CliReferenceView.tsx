import { useMemo, useState } from 'react';
import { Check, Copy, Search, Terminal } from 'lucide-react';

interface CliSubcommand {
  name: string;
  category: 'setup' | 'javascript' | 'binary' | 'mobile' | 'web' | 'diagnostics';
  usage: string;
  summary: string;
  flags: { flag: string; description: string }[];
  example: string;
}

const GLOBAL_OPTIONS = [
  { flag: '--filter-output <keys>', description: 'Filter output by key paths (e.g. foo,bar.baz,a[0,3])' },
  { flag: '--format <toon|json|yaml|md|jsonl>', description: 'Select structured output serialization format' },
  { flag: '--full-output', description: 'Show full output envelope' },
  { flag: '--help', description: 'Show help for rea or a subcommand' },
  { flag: '--llms, --llms-full', description: 'Print LLM-readable command manifest' },
  { flag: '--mcp', description: 'Start as MCP stdio server' },
  { flag: '--schema', description: 'Show JSON Schema for the selected command' },
  { flag: '--token-count', description: 'Print token count of output instead of output' },
  { flag: '--token-limit <n>', description: 'Limit output to n tokens' },
  { flag: '--token-offset <n>', description: 'Skip first n tokens of output' },
  { flag: '--update', description: 'Update to latest version' },
  { flag: '--version', description: 'Show CLI version' },
];

const REA_SUBCOMMANDS: CliSubcommand[] = [
  {
    name: 'setup',
    category: 'setup',
    usage: 'rea setup [--client <name>] [--scope <user|project>] [--dry-run] [--yes]',
    summary:
      'Configure agent integrations and optional analysis providers across Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Copilot CLI, and Grok Build.',
    flags: [
      { flag: '--client <id>', description: 'Target a specific client instead of interactive selection.' },
      { flag: '--scope <user|project>', description: 'Write MCP configuration to user or project scope.' },
      { flag: '--dry-run', description: 'Preview planned backups and config edits without writing.' },
    ],
    example: 'rea setup --client cursor --dry-run',
  },
  {
    name: 'doctor',
    category: 'diagnostics',
    usage: 'rea doctor [--client <name>] [--format json]',
    summary: 'Check whether REA, Node.js runtime, MCP client registrations, and local analysis providers are ready.',
    flags: [
      { flag: '--client <id>', description: 'Filter readiness checks to one client.' },
      { flag: '--format json', description: 'Output machine-readable diagnostics.' },
    ],
    example: 'rea doctor --format json',
  },
  {
    name: 'mcp',
    category: 'setup',
    usage: 'rea mcp [add | doctor]',
    summary: 'Register REA as an MCP server or run the stdio MCP server directly (`rea --mcp`).',
    flags: [
      { flag: 'REA_MCP_INPUT_SCHEMA_PROFILE', description: 'compact (default) or full validation schemas.' },
      { flag: 'REA_MCP_OUTPUT_SCHEMA_PROFILE', description: 'compact (default), full, or off for smaller tools/list frames.' },
    ],
    example: 'rea mcp doctor',
  },
  {
    name: 'analyze-javascript-application',
    category: 'javascript',
    usage: 'rea analyze-javascript-application <path> [--format json]',
    summary: 'Statically reconstruct a local JavaScript or unpacked Electron application into an Evidence graph without execution.',
    flags: [
      { flag: '<path>', description: 'Absolute path to a local JavaScript directory or unpacked Electron ASAR.' },
      { flag: '--format json', description: 'Emit structured Evidence JSON (or --json alias).' },
    ],
    example: 'rea analyze-javascript-application /absolute/path/to/app --format json',
  },
  {
    name: 'trace-application-feature',
    category: 'javascript',
    usage: 'rea trace-application-feature <evidence-json> ...',
    summary: 'Trace a typed seed through authenticated application Evidence JSON.',
    flags: [
      { flag: '--schema', description: 'Inspect exact JSON input/output schema for the command.' },
    ],
    example: 'rea trace-application-feature --schema',
  },
  {
    name: 'trace-javascript-semantics',
    category: 'javascript',
    usage: 'rea trace-javascript-semantics <evidence-json> ...',
    summary: 'Trace bounded static semantic relations through authenticated application Evidence.',
    flags: [
      { flag: '--format json', description: 'Emit structured relation paths.' },
    ],
    example: 'rea trace-javascript-semantics --help',
  },
  {
    name: 'inspect-electron-fuses',
    category: 'javascript',
    usage: 'rea inspect-electron-fuses <binary-path>',
    summary: 'Inspect packaged Electron fuse bytes without launching the application.',
    flags: [
      { flag: '--format json', description: 'Emit parsed fuse state JSON.' },
    ],
    example: 'rea inspect-electron-fuses /Applications/App.app/Contents/MacOS/App',
  },
  {
    name: 'recover-javascript-sources',
    category: 'javascript',
    usage: 'rea recover-javascript-sources <path>',
    summary: 'Recover readable JavaScript modules with source provenance and verified files.',
    flags: [
      { flag: '--format json', description: 'Emit recovered file manifest and provenance.' },
    ],
    example: 'rea recover-javascript-sources ./dist --format json',
  },
  {
    name: 'inspect-sqlite-database',
    category: 'binary',
    usage: 'rea inspect-sqlite-database <sqlite-path>',
    summary: 'Inspect SQLite schema and optional ordinary-table rows from a local snapshot (such as NoteStore.sqlite).',
    flags: [
      { flag: '--format json', description: 'Emit table definitions and sampled rows.' },
    ],
    example: 'rea inspect-sqlite-database ./NoteStore.sqlite --format json',
  },
  {
    name: 'analyze',
    category: 'binary',
    usage: 'rea analyze <target-path>',
    summary: 'Get a high-level structural overview of an application or binary.',
    flags: [
      { flag: '--format json', description: 'Emit canonical Evidence JSON.' },
    ],
    example: 'rea analyze /path/to/binary --format json',
  },
  {
    name: 'decompile',
    category: 'binary',
    usage: 'rea decompile <target> <symbol-or-address>',
    summary: 'Read one part of an app as decompiled code via configured native provider.',
    flags: [
      { flag: '--token-limit <n>', description: 'Bound output tokens for large functions.' },
    ],
    example: 'rea decompile ./app main --token-limit 2000',
  },
  {
    name: 'inspect-macho',
    category: 'binary',
    usage: 'rea inspect-macho <macho-path>',
    summary: 'Run Mach-O header, segment, and load-command inspection without launching Hopper.',
    flags: [
      { flag: '--format json', description: 'Emit structured Mach-O metadata.' },
    ],
    example: 'rea inspect-macho ./MyApp --format json',
  },
  {
    name: 'inspect-go-binary',
    category: 'binary',
    usage: 'rea inspect-go-binary <binary-path>',
    summary: 'Inspect embedded Go compiler, modules, and build settings without target execution.',
    flags: [{ flag: '--format json', description: 'Emit Go module dependency graph.' }],
    example: 'rea inspect-go-binary ./server --format json',
  },
  {
    name: 'inspect-rust-binary',
    category: 'binary',
    usage: 'rea inspect-rust-binary <binary-path>',
    summary: 'Inspect an embedded cargo-auditable Rust dependency list without target execution.',
    flags: [{ flag: '--format json', description: 'Emit crate dependency manifest.' }],
    example: 'rea inspect-rust-binary ./cli --format json',
  },
  {
    name: 'inspect-android-package',
    category: 'mobile',
    usage: 'rea inspect-android-package <apk-path>',
    summary: 'Inspect APK declarations and decoded manifest without executing it.',
    flags: [{ flag: '--format json', description: 'Emit APK manifest and component inventory.' }],
    example: 'rea inspect-android-package ./app-release.apk --format json',
  },
  {
    name: 'identify-flutter-build',
    category: 'mobile',
    usage: 'rea identify-flutter-build <apk-path>',
    summary: 'Identify a Flutter build Dart snapshot hash and engine facts by pure APK parsing.',
    flags: [{ flag: '--format json', description: 'Emit snapshot hash and engine metadata.' }],
    example: 'rea identify-flutter-build ./flutter-app.apk --format json',
  },
  {
    name: 'analyze-web-bundle',
    category: 'web',
    usage: 'rea analyze-web-bundle <target>',
    summary: 'Capture and statically analyze a page bundle, defaulting to the selected target origin.',
    flags: [{ flag: '--format json', description: 'Emit bundle graph and source provenance.' }],
    example: 'rea analyze-web-bundle https://localhost:3000 --format json',
  },
  {
    name: 'inspect-web-network-capture',
    category: 'web',
    usage: 'rea inspect-web-network-capture <capture-path>',
    summary: 'Inspect retained HAR, native mitmproxy, Fiddler SAZ, or aioquic qlog records without fetching recorded URLs.',
    flags: [{ flag: '--filter-output <keys>', description: 'Filter specific request/response fields.' }],
    example: 'rea inspect-web-network-capture ./session.har --format json',
  },
  {
    name: 'inspect-analysis-view',
    category: 'diagnostics',
    usage: 'rea inspect-analysis-view <evidence-json>',
    summary: 'Project a selected view of completed binary-layout, JavaScript application, native, WASM, Mach-O, or pcap Evidence JSON.',
    flags: [{ flag: '--token-limit <n>', description: 'Bound output size for LLM context windows.' }],
    example: 'rea inspect-analysis-view ./evidence.json --token-limit 1500',
  },
  {
    name: 'providers',
    category: 'diagnostics',
    usage: 'rea providers',
    summary: 'List configured local analysis providers (Ghidra, IDA, Cutter, Hopper, JEB, Frida, LLDB, Playwright, etc.).',
    flags: [{ flag: '--format json', description: 'Emit provider availability matrix.' }],
    example: 'rea providers --format json',
  },
  {
    name: 'update',
    category: 'setup',
    usage: 'rea update',
    summary: 'Update this REA installation to the latest release and verify the installed version.',
    flags: [{ flag: '--format json', description: 'Emit structured update status.' }],
    example: 'rea update',
  },
  {
    name: 'uninstall',
    category: 'setup',
    usage: 'rea uninstall',
    summary: 'Remove REA-owned agent configuration and skill files cleanly.',
    flags: [{ flag: '--dry-run', description: 'Preview files to remove without deleting.' }],
    example: 'rea uninstall --dry-run',
  },
];

export default function CliReferenceView() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | CliSubcommand['category']>('all');
  const [selectedName, setSelectedName] = useState<string>('analyze-javascript-application');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REA_SUBCOMMANDS.filter((cmd) => {
      if (category !== 'all' && cmd.category !== category) return false;
      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.summary.toLowerCase().includes(q) ||
        cmd.flags.some((f) => f.flag.toLowerCase().includes(q))
      );
    });
  }, [search, category]);

  const active =
    filtered.find((c) => c.name === selectedName) ?? filtered[0] ?? REA_SUBCOMMANDS[0];

  const copyText = (id: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1600);
  };

  const installSnippet = 'npm install --global rea-agents\nrea --help';

  return (
    <div className="space-y-6">
      {/* Global Install & --help Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Global CLI Reference (rea --help)
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Verified command catalog from <code className="font-mono text-xs">rea@6.7.0</code> (<code className="font-mono text-xs">rea-agents</code>). Search subcommands, integrations, and global flags below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyText('global-install', installSnippet)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            {copiedId === 'global-install' ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copied Install Commands</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Global Install</span>
              </>
            )}
          </button>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
          <code>{`$ npm install --global rea-agents\n$ rea --help`}</code>
        </pre>

        {/* Search & Category Filter */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commands (e.g. sqlite, electron, macho, setup)..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 self-start dark:bg-slate-800">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'setup', label: 'Setup & MCP' },
                { id: 'javascript', label: 'JS / Electron' },
                { id: 'binary', label: 'Binary & DB' },
                { id: 'mobile', label: 'Mobile' },
                { id: 'web', label: 'Web & Net' },
                { id: 'diagnostics', label: 'Diagnostics' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  category === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Split Subcommands List & Detail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Commands ({filtered.length})
            </h2>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No commands match &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div className="max-h-[520px] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
              {filtered.map((cmd) => {
                const isSelected = active.name === cmd.name;
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => setSelectedName(cmd.name)}
                    className={`block w-full px-5 py-3.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {cmd.name}
                      </span>
                      <span className="text-xs capitalize text-slate-500 dark:text-slate-400">
                        {cmd.category}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                      {cmd.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2 font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                <Terminal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>rea {active.name}</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                {active.summary}
              </p>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Usage Syntax
                </div>
                <code className="mt-1.5 block overflow-x-auto rounded-lg bg-slate-100 px-3.5 py-2.5 font-mono text-xs text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                  {active.usage}
                </code>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Command Options
                </div>
                <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {active.flags.map((f) => (
                    <div key={f.flag} className="p-3 text-xs">
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {f.flag}
                      </div>
                      <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                        {f.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Example Invocation
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(`ex-${active.name}`, active.example)}
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {copiedId === `ex-${active.name}` ? 'Copied' : 'Copy Example'}
                  </button>
                </div>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-950 p-3.5 font-mono text-xs text-slate-100">
                  <code>$ {active.example}</code>
                </pre>
              </div>
            </div>
          </div>

          {/* Global Options Reference */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Global Options (Available on Every Command)
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {GLOBAL_OPTIONS.map((opt) => (
                <div key={opt.flag} className="border-b border-slate-100 pb-2 text-xs dark:border-slate-800">
                  <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {opt.flag}
                  </div>
                  <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                    {opt.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
