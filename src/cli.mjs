#!/usr/bin/env node
// @ts-check
// Local CLI: preview or apply a label config from your terminal.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.mjs';
import { createClient } from './github.mjs';
import { run } from './labelsync.mjs';
import { consoleLogger } from './log.mjs';
import { totals } from './report.mjs';

const HELP = `labelsync — sync one GitHub label set across your repositories

Usage
  labelsync [options]                 preview changes (dry run, the default)
  labelsync --apply [options]         write the changes
  labelsync validate <file...>        check config files

Targets (pick one)
  -r, --repo <owner/name>             repository to sync (repeatable)
      --scope <all|latest>            every repository you own, or the newest one
      --owner <login>                 list repositories of this user/org instead of yours

Options
  -c, --config <path|url>             label config (default: .github/labels.json)
      --exclude <owner/name>          never touch this repository (repeatable)
      --skip-topic <topic>            skip repositories with this topic (default: no-labelsync)
      --include-forks                 also sync forks
      --prune                         delete labels that are not in the config
      --concurrency <n>               repositories processed in parallel (default: 4)
      --apply                         write changes (without it, nothing is modified)
  -h, --help

Auth: GITHUB_TOKEN or GH_TOKEN, falling back to \`gh auth token\`.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c', default: '.github/labels.json' },
      repo: { type: 'string', short: 'r', multiple: true, default: [] },
      scope: { type: 'string' },
      owner: { type: 'string' },
      exclude: { type: 'string', multiple: true, default: [] },
      'skip-topic': { type: 'string', default: 'no-labelsync' },
      'include-forks': { type: 'boolean', default: false },
      prune: { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '4' },
      apply: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) return console.log(HELP);

  if (positionals[0] === 'validate') {
    const files = positionals.slice(1);
    if (files.length === 0) throw new Error('validate: pass at least one config file');
    for (const file of files) {
      const config = await loadConfig(file);
      console.log(`✔ ${file} (${config.labels.length} labels)`);
    }
    return;
  }
  if (positionals.length > 0) throw new Error(`unknown command "${positionals[0]}" (see --help)`);

  const scope = values.scope;
  if (values.repo.length === 0 && scope !== 'all' && scope !== 'latest') {
    throw new Error('choose targets with --repo <owner/name> or --scope all|latest (see --help)');
  }

  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer');

  const log = consoleLogger();
  const report = await run(
    await loadConfig(values.config),
    {
      scope: scope === 'latest' ? 'latest' : 'all',
      repositories: values.repo,
      owner: values.owner,
      exclude: values.exclude,
      skipTopic: values['skip-topic'],
      includeForks: values['include-forks'],
      prune: values.prune,
      dryRun: !values.apply,
      concurrency,
    },
    { client: createClient({ token: resolveToken() }), log },
  );

  const { repositories, failed, changes } = totals(report);
  console.log(`\n${repositories} repositor${repositories === 1 ? 'y' : 'ies'}, ${changes} change(s)${report.dryRun ? ' planned' : ''}, ${failed} failed`);
  if (report.dryRun && changes > 0) console.log('Dry run: nothing was written. Re-run with --apply to apply.');
  if (failed > 0) process.exitCode = 1;
}

function resolveToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) return token;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('no token: set GITHUB_TOKEN, or log in with `gh auth login`');
  }
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
