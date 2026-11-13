export type ClientId =
  | 'claude_code'
  | 'cursor'
  | 'codex'
  | 'gemini_cli'
  | 'windsurf'
  | 'copilot_cli'
  | 'grok_build';

export type OsTarget = 'unix' | 'windows';
export type PackageRunner = 'npx' | 'bunx' | 'global';
export type InstallScope = 'user' | 'project';
export type InputSchemaProfile = 'compact' | 'full';
export type OutputSchemaProfile = 'compact' | 'full' | 'off';

export interface ClientDefinition {
  id: ClientId;
  name: string;
  cliFlag: string;
  vendor: string;
  configFormat: 'json' | 'toml';
  restartHint: string;
  unixConfigPath: string;
  windowsConfigPath: string;
  projectConfigPath: string | null;
  unixSkillPath: string;
  windowsSkillPath: string;
  manualCliCommand: (os: OsTarget) => string;
  defaultDetected: boolean;
  notes: string;
}

export interface SetupOptions {
  os: OsTarget;
  runner: PackageRunner;
  nodeVersion: string;
  selectedClients: ClientId[];
  scope: InstallScope;
  dryRun: boolean;
  nonInteractive: boolean;
  installSkill: boolean;
  inputSchemaProfile: InputSchemaProfile;
  outputSchemaProfile: OutputSchemaProfile;
}

export interface PlannedFileChange {
  id: string;
  clientId: ClientId | 'shared';
  clientName: string;
  action: 'Patch' | 'Create' | 'Backup';
  path: string;
  format: 'json' | 'toml' | 'markdown' | 'backup';
  content: string;
  summary: string;
}

export const NODE_PRESETS = [
  { label: 'v22.23.4 LTS', value: '22.23.4', supported: true },
  { label: 'v24.22.1 Current', value: '24.22.1', supported: true },
  { label: 'v26.12.1 Latest', value: '26.12.1', supported: true },
  { label: 'v22.23.2 (Too Old)', value: '22.23.2', supported: false },
];

export const REA_CLIENTS: ClientDefinition[] = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    cliFlag: 'claude_code',
    vendor: 'Anthropic',
    configFormat: 'json',
    restartHint: 'Exit active Claude Code session and relaunch `claude` in terminal.',
    unixConfigPath: '~/.claude.json',
    windowsConfigPath: '%USERPROFILE%\\.claude.json',
    projectConfigPath: '.mcp.json',
    unixSkillPath: '~/.claude/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.claude\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: (os) =>
      os === 'windows'
        ? 'claude mcp add --scope user rea -- cmd /c npx -y rea-agents@latest mcp'
        : 'claude mcp add --scope user rea -- npx -y rea-agents@latest mcp',
    defaultDetected: true,
    notes: 'Supports both user-scope ~/.claude.json and project-scope .mcp.json.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    cliFlag: 'cursor',
    vendor: 'Anysphere',
    configFormat: 'json',
    restartHint: 'Fully quit Cursor (Cmd+Q on macOS, Ctrl+Q on Windows/Linux) and reopen.',
    unixConfigPath: '~/.cursor/mcp.json',
    windowsConfigPath: '%USERPROFILE%\\.cursor\\mcp.json',
    projectConfigPath: '.cursor/mcp.json',
    unixSkillPath: '~/.cursor/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.cursor\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: () =>
      'npx rea-agents@latest setup --client cursor',
    defaultDetected: true,
    notes: 'Closing the editor window alone will not reload MCP stdio servers.',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    cliFlag: 'codex',
    vendor: 'OpenAI',
    configFormat: 'toml',
    restartHint: 'Start a fresh `codex` session so TOML MCP entries reload.',
    unixConfigPath: '~/.codex/config.toml',
    windowsConfigPath: '%USERPROFILE%\\.codex\\config.toml',
    projectConfigPath: '.codex/config.toml',
    unixSkillPath: '~/.codex/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.codex\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: (os) =>
      os === 'windows'
        ? 'codex mcp add rea -- cmd /c npx -y rea-agents@latest mcp'
        : 'codex mcp add rea -- npx -y rea-agents@latest mcp',
    defaultDetected: true,
    notes: 'Uses TOML table syntax under [mcp_servers.rea].',
  },
  {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    cliFlag: 'gemini_cli',
    vendor: 'Google',
    configFormat: 'json',
    restartHint: 'Restart `gemini` CLI process and verify tools with /mcp.',
    unixConfigPath: '~/.gemini/settings.json',
    windowsConfigPath: '%USERPROFILE%\\.gemini\\settings.json',
    projectConfigPath: '.gemini/settings.json',
    unixSkillPath: '~/.gemini/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.gemini\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: () =>
      'npx rea-agents@latest setup --client gemini_cli',
    defaultDetected: false,
    notes: 'Registers under mcpServers inside settings.json.',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    cliFlag: 'windsurf',
    vendor: 'Codeium',
    configFormat: 'json',
    restartHint: 'Quit Windsurf completely and click Refresh in the MCP panel.',
    unixConfigPath: '~/.codeium/windsurf/mcp_config.json',
    windowsConfigPath: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json',
    projectConfigPath: null,
    unixSkillPath: '~/.agents/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.agents\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: () =>
      'npx rea-agents@latest setup --client windsurf',
    defaultDetected: false,
    notes: 'User-global MCP config only; installs shared workflow skill in ~/.agents/skills.',
  },
  {
    id: 'copilot_cli',
    name: 'GitHub Copilot CLI',
    cliFlag: 'copilot_cli',
    vendor: 'GitHub',
    configFormat: 'json',
    restartHint: 'Restart your Copilot CLI session and run `/mcp list`.',
    unixConfigPath: '~/.copilot/mcp-config.json',
    windowsConfigPath: '%USERPROFILE%\\.copilot\\mcp-config.json',
    projectConfigPath: '.copilot/mcp-config.json',
    unixSkillPath: '~/.agents/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.agents\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: () =>
      'npx rea-agents@latest setup --client copilot_cli',
    defaultDetected: false,
    notes: 'Compatible with standard mcpServers stdio entries.',
  },
  {
    id: 'grok_build',
    name: 'Grok Build',
    cliFlag: 'grok_build',
    vendor: 'xAI',
    configFormat: 'json',
    restartHint: 'Restart the Grok Build daemon or terminal session.',
    unixConfigPath: '~/.grok/mcp.json',
    windowsConfigPath: '%USERPROFILE%\\.grok\\mcp.json',
    projectConfigPath: '.grok/mcp.json',
    unixSkillPath: '~/.agents/skills/reverse-engineer-anything/SKILL.md',
    windowsSkillPath: '%USERPROFILE%\\.agents\\skills\\reverse-engineer-anything\\SKILL.md',
    manualCliCommand: () =>
      'npx rea-agents@latest setup --client grok_build',
    defaultDetected: false,
    notes: 'Uses standard mcpServers JSON transport configuration.',
  },
];

export function isNodeSupported(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, '')
    .split('.')
    .map(Number);

  if (major === 22) return minor > 23 || (minor === 23 && patch >= 4);
  if (major === 24) return minor > 22 || (minor === 22 && patch >= 1);
  if (major === 26) return minor > 12 || (minor === 12 && patch >= 1);
  return major > 26;
}

export function buildSetupCommand(options: SetupOptions): string {
  const base =
    options.runner === 'npx'
      ? 'npx rea-agents@latest setup'
      : options.runner === 'bunx'
        ? 'bunx rea-agents@latest setup'
        : 'rea setup';

  const parts = [base];

  if (options.selectedClients.length > 0 && options.selectedClients.length < REA_CLIENTS.length) {
    for (const c of options.selectedClients) {
      parts.push(`--client ${c}`);
    }
  }

  if (options.scope === 'project') {
    parts.push('--scope project');
  }

  if (!options.installSkill) {
    parts.push('--mcp-only');
  }

  if (options.dryRun) {
    parts.push('--dry-run');
  }

  if (options.nonInteractive) {
    parts.push('--yes');
  }

  return parts.join(' ');
}

export function buildMcpEntryObject(options: SetupOptions) {
  const env: Record<string, string> = {};
  if (options.inputSchemaProfile !== 'compact') {
    env.REA_MCP_INPUT_SCHEMA_PROFILE = options.inputSchemaProfile;
  }
  if (options.outputSchemaProfile !== 'compact') {
    env.REA_MCP_OUTPUT_SCHEMA_PROFILE = options.outputSchemaProfile;
  }

  const command =
    options.os === 'windows'
      ? 'cmd'
      : options.runner === 'bunx'
        ? 'bunx'
        : options.runner === 'global'
          ? 'rea'
          : 'npx';

  const args =
    options.os === 'windows'
      ? options.runner === 'global'
        ? ['/c', 'rea', 'mcp']
        : ['/c', options.runner, '-y', 'rea-agents@latest', 'mcp']
      : options.runner === 'global'
        ? ['mcp']
        : options.runner === 'bunx'
          ? ['rea-agents@latest', 'mcp']
          : ['-y', 'rea-agents@latest', 'mcp'];

  const entry: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  } = {
    command,
    args,
  };

  if (Object.keys(env).length > 0) {
    entry.env = env;
  }

  return entry;
}

export function buildJsonConfigPreview(options: SetupOptions): string {
  return JSON.stringify(
    {
      mcpServers: {
        rea: buildMcpEntryObject(options),
      },
    },
    null,
    2,
  );
}

export function buildTomlConfigPreview(options: SetupOptions): string {
  const entry = buildMcpEntryObject(options);
  const argsList = entry.args.map((a) => `"${a}"`).join(', ');
  const lines = [
    '[mcp_servers.rea]',
    `command = "${entry.command}"`,
    `args = [${argsList}]`,
  ];

  if (entry.env && Object.keys(entry.env).length > 0) {
    lines.push('');
    lines.push('[mcp_servers.rea.env]');
    for (const [k, v] of Object.entries(entry.env)) {
      lines.push(`${k} = "${v}"`);
    }
  }

  return lines.join('\n');
}

export const WORKFLOW_SKILL_MARKDOWN = `---
name: reverse-engineer-anything
description: Static and behavioral inspection workflow for local apps, bundles, and binaries using the rea MCP server.
---

# Reverse Engineer Anything (REA) Workflow

1. Scope & Safety First
   - Confirm target path exists locally and remain strictly read-only unless explicitly instructed.
   - Start with structural inventory before deep disassembly or bundle unpacking.

2. Evidence-Backed Inspection
   - Use \`rea\` MCP tools to inspect binary headers, unpacked JS/ASAR/APK/IPA bundles, strings, and symbol tables.
   - Cite exact file paths, offsets, symbol names, or extracted strings for every claim.

3. Progressive Analysis Loop
   - Map entry points, manifests, and runtime frameworks first.
   - Trace network endpoints, IPC channels, and configuration schemas second.
   - Summarize architecture concisely with verifiable artifacts.
`;

export function buildExecutionPlan(options: SetupOptions): PlannedFileChange[] {
  const changes: PlannedFileChange[] = [];
  const jsonContent = buildJsonConfigPreview(options);
  const tomlContent = buildTomlConfigPreview(options);

  for (const clientId of options.selectedClients) {
    const client = REA_CLIENTS.find((c) => c.id === clientId);
    if (!client) continue;

    const targetPath =
      options.scope === 'project' && client.projectConfigPath
        ? client.projectConfigPath
        : options.os === 'windows'
          ? client.windowsConfigPath
          : client.unixConfigPath;

    changes.push({
      id: `backup-${client.id}`,
      clientId: client.id,
      clientName: client.name,
      action: 'Backup',
      path: `${targetPath}.bak.20261113`,
      format: 'backup',
      content: `Automatic pre-setup snapshot of ${targetPath} created by rea-agents before merging mcpServers.rea.`,
      summary: `Preserve existing ${client.name} settings prior to patching`,
    });

    changes.push({
      id: `config-${client.id}`,
      clientId: client.id,
      clientName: client.name,
      action: 'Patch',
      path: targetPath,
      format: client.configFormat,
      content: client.configFormat === 'toml' ? tomlContent : jsonContent,
      summary: `Register "rea" stdio MCP server in ${client.configFormat.toUpperCase()} config`,
    });

    if (options.installSkill) {
      const skillPath =
        options.os === 'windows' ? client.windowsSkillPath : client.unixSkillPath;

      if (!changes.some((c) => c.path === skillPath)) {
        changes.push({
          id: `skill-${client.id}`,
          clientId: client.id,
          clientName: client.name,
          action: 'Create',
          path: skillPath,
          format: 'markdown',
          content: WORKFLOW_SKILL_MARKDOWN,
          summary: `Install workflow instruction skill for ${client.name}`,
        });
      }
    }
  }

  return changes;
}

export function buildShellScript(options: SetupOptions): string {
  const setupCmd = buildSetupCommand({ ...options, dryRun: false });
  if (options.os === 'windows') {
    return [
      '# PowerShell script for REA Agents setup',
      '$ErrorActionPreference = "Stop"',
      '',
      'Write-Host "Checking Node.js version..."',
      'node -v',
      '',
      'Write-Host "Running REA setup..."',
      setupCmd,
      '',
      'Write-Host "Running diagnostics..."',
      options.selectedClients.length === 1
        ? `npx rea-agents@latest doctor --client ${options.selectedClients[0]}`
        : 'npx rea-agents@latest doctor',
    ].join('\n');
  }

  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'echo "Checking Node.js version (requires >= 22.19)..."',
    'node -v',
    '',
    'echo "Running REA Agents setup..."',
    setupCmd,
    '',
    'echo "Verifying installation..."',
    options.selectedClients.length === 1
      ? `npx rea-agents@latest doctor --client ${options.selectedClients[0]}`
      : 'npx rea-agents@latest doctor',
  ].join('\n');
}

export function buildDoctorJsonReport(options: SetupOptions) {
  const nodeOk = isNodeSupported(options.nodeVersion);
  return {
    package: 'rea-agents',
    node: {
      version: `v${options.nodeVersion}`,
      minimum: 'v22.19.0',
      status: nodeOk ? 'ok' : 'unsupported',
    },
    mcpTransport: 'stdio',
    schemaProfiles: {
      input: options.inputSchemaProfile,
      output: options.outputSchemaProfile,
    },
    clients: options.selectedClients.map((id) => {
      const def = REA_CLIENTS.find((c) => c.id === id)!;
      return {
        client: def.id,
        name: def.name,
        configPath:
          options.scope === 'project' && def.projectConfigPath
            ? def.projectConfigPath
            : options.os === 'windows'
              ? def.windowsConfigPath
              : def.unixConfigPath,
        mcpConfigured: true,
        skillInstalled: options.installSkill,
        skillPath: options.os === 'windows' ? def.windowsSkillPath : def.unixSkillPath,
        restartRequired: true,
      };
    }),
  };
}
