// @ts-check
// GitHub Action entry point (see action.yml).
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { createClient } from './github.mjs';
import { run } from './labelsync.mjs';
import { actionsLogger } from './log.mjs';
import { renderSummary, totals } from './report.mjs';

const log = actionsLogger();

/** Reads an action input the way @actions/core does. @param {string} name */
function input(name) {
  return (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

/** @param {string} name */
function booleanInput(name) {
  const value = input(name).toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(value)) return true;
  if (['false', 'no', 'off', '0', ''].includes(value)) return false;
  throw new Error(`Input "${name}" must be true or false, got "${value}"`);
}

/** Newline or comma separated list. @param {string} name */
function listInput(name) {
  return input(name).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

/** @param {string} name @param {string} value */
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const eof = `EOF_${randomUUID()}`;
  appendFileSync(file, `${name}<<${eof}\n${value}\n${eof}\n`);
}

async function main() {
  const scope = input('scope') || 'current';
  if (!['current', 'all', 'latest'].includes(scope)) throw new Error(`Input "scope" must be current, all or latest, got "${scope}"`);

  const concurrency = Number(input('concurrency') || 4);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Input "concurrency" must be a positive integer');

  const token = input('token');
  if (!token) throw new Error('Input "token" is empty');

  const source = input('config') || '.github/labels.json';
  const config = await loadConfig(/^https?:\/\//i.test(source) ? source : path.resolve(process.env.GITHUB_WORKSPACE ?? '.', source));

  const report = await run(
    config,
    {
      scope: /** @type {'current' | 'all' | 'latest'} */ (scope),
      repositories: listInput('repositories'),
      currentRepo: process.env.GITHUB_REPOSITORY,
      owner: input('owner') || undefined,
      exclude: listInput('exclude'),
      skipTopic: input('skip-topic'),
      includeForks: booleanInput('include-forks'),
      prune: booleanInput('prune'),
      dryRun: booleanInput('dry-run'),
      concurrency,
    },
    { client: createClient({ token }), log },
  );

  const { repositories, failed, changes } = totals(report);
  setOutput('repositories', String(repositories));
  setOutput('changes', String(changes));
  setOutput('failed', String(failed));
  setOutput('report', JSON.stringify(report));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${renderSummary(report)}\n`);

  if (failed > 0) {
    log.error(`${failed} of ${repositories} repositories failed to sync`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
