// @ts-check
import { describeOp, planChanges } from './plan.mjs';

/**
 * @typedef {import('./config.mjs').Config} Config
 * @typedef {import('./github.mjs').GitHubClient} GitHubClient
 * @typedef {import('./plan.mjs').Op} Op
 *
 * @typedef {object} Options
 * @property {'current' | 'all' | 'latest'} scope
 * @property {string[]} repositories   explicit targets, take precedence over `scope`
 * @property {string} [currentRepo]    `owner/name` used by scope `current`
 * @property {string} [owner]          user or org listed by scopes `all` / `latest`
 * @property {string[]} exclude
 * @property {string} skipTopic
 * @property {boolean} includeForks
 * @property {boolean} prune
 * @property {boolean} dryRun
 * @property {number} concurrency
 *
 * @typedef {object} Logger
 * @property {(msg: string) => void} info
 * @property {(msg: string) => void} warn
 * @property {(msg: string) => void} error
 * @property {(title: string) => void} startGroup
 * @property {() => void} endGroup
 *
 * @typedef {object} RepoResult
 * @property {string} repo
 * @property {'synced' | 'failed'} status
 * @property {Op[]} ops
 * @property {number} unchanged
 * @property {string[]} extra
 * @property {string} [error]
 *
 * @typedef {object} Report
 * @property {boolean} dryRun
 * @property {boolean} prune
 * @property {RepoResult[]} results
 * @property {{ repo: string, reason: string }[]} skipped
 */

/**
 * Resolves which repositories to sync.
 * @param {GitHubClient} client
 * @param {Options} options
 * @returns {Promise<{ targets: string[], skipped: Report['skipped'] }>}
 */
export async function resolveTargets(client, options) {
  const excluded = new Set(options.exclude.map((r) => r.toLowerCase()));
  /** @type {Report['skipped']} */
  const skipped = [];

  /** @param {string[]} repos */
  const withoutExcluded = (repos) =>
    repos.filter((repo) => {
      if (!excluded.has(repo.toLowerCase())) return true;
      skipped.push({ repo, reason: 'excluded' });
      return false;
    });

  if (options.repositories.length > 0) {
    return { targets: withoutExcluded(unique(options.repositories)), skipped };
  }

  if (options.scope === 'current') {
    if (!options.currentRepo) throw new Error('scope "current" needs a repository (GITHUB_REPOSITORY is not set)');
    return { targets: withoutExcluded([options.currentRepo]), skipped };
  }

  const listed = await client.listRepos(options.owner).catch((/** @type {Error & { status?: number }} */ err) => {
    if (err.status === 403) {
      err.message += ` (scope "${options.scope}" needs a personal access token: the default GITHUB_TOKEN only reaches the current repository)`;
    }
    throw err;
  });
  const repos = listed
    .filter((repo) => !repo.archived)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  /** @type {string[]} */
  const eligible = [];
  for (const repo of repos) {
    const reason =
      repo.fork && !options.includeForks ? 'fork'
      : options.skipTopic && repo.topics?.includes(options.skipTopic) ? `topic ${options.skipTopic}`
      : repo.permissions && !repo.permissions.push ? 'no write access'
      : undefined;
    if (reason) skipped.push({ repo: repo.full_name, reason });
    else eligible.push(repo.full_name);
  }

  const targets = withoutExcluded(eligible);
  return { targets: options.scope === 'latest' ? targets.slice(0, 1) : targets, skipped };
}

/**
 * Brings one repository in line with the config.
 * @param {GitHubClient} client
 * @param {string} repo
 * @param {Config['labels']} labels
 * @param {Pick<Options, 'prune' | 'dryRun'>} options
 * @param {Logger} log
 * @returns {Promise<RepoResult>}
 */
export async function syncRepository(client, repo, labels, { prune, dryRun }, log) {
  /** @type {Op[]} */
  const applied = [];
  try {
    const plan = planChanges(labels, await client.listLabels(repo), { prune });
    for (const op of plan.ops) {
      log.info(`${dryRun ? '[dry-run] ' : ''}${describeOp(op)}`);
      if (!dryRun) await apply(client, repo, op);
      applied.push(op);
    }
    if (plan.ops.length === 0) log.info(`already in sync (${plan.unchanged} labels)`);
    if (plan.extra.length > 0) log.info(`${plan.extra.length} label(s) not in the config kept (prune is off): ${plan.extra.join(', ')}`);
    return { repo, status: 'synced', ops: applied, unchanged: plan.unchanged, extra: plan.extra };
  } catch (err) {
    const message = hint(/** @type {Error & { status?: number }} */ (err));
    log.error(`${repo}: ${message}`);
    return { repo, status: 'failed', ops: applied, unchanged: 0, extra: [], error: message };
  }
}

/**
 * @param {Config} config
 * @param {Options} options
 * @param {{ client: GitHubClient, log: Logger }} deps
 * @returns {Promise<Report>}
 */
export async function run(config, options, { client, log }) {
  const { targets, skipped } = await resolveTargets(client, {
    ...options,
    exclude: [...options.exclude, ...config.exclude],
  });

  log.info(`${config.labels.length} labels, ${targets.length} repositor${targets.length === 1 ? 'y' : 'ies'}` +
    `${options.dryRun ? ' (dry run)' : ''}${options.prune ? ' (prune on)' : ''}`);
  for (const { repo, reason } of skipped) log.info(`skip ${repo} (${reason})`);

  // Repos run in parallel: buffer each one's lines so its log group stays contiguous.
  const results = await mapLimit(targets, options.concurrency, async (repo) => {
    /** @type {[('info' | 'warn' | 'error'), string][]} */
    const lines = [];
    const repoLog = {
      ...log,
      info: (/** @type {string} */ m) => void lines.push(['info', m]),
      warn: (/** @type {string} */ m) => void lines.push(['warn', m]),
      error: (/** @type {string} */ m) => void lines.push(['error', m]),
    };
    const result = await syncRepository(client, repo, config.labels, options, repoLog);
    log.startGroup(`${result.status === 'failed' ? '❌' : '🏷️'} ${repo}`);
    for (const [level, message] of lines) log[level](message);
    log.endGroup();
    return result;
  });

  return { dryRun: options.dryRun, prune: options.prune, results, skipped };
}

/** @param {GitHubClient} client @param {string} repo @param {Op} op */
function apply(client, repo, op) {
  switch (op.type) {
    case 'create':
      return client.createLabel(repo, { name: op.name, color: op.color, description: op.description });
    case 'update':
      return client.updateLabel(repo, op.name, op.changes);
    case 'delete':
      return client.deleteLabel(repo, op.name);
  }
}

/** @param {Error & { status?: number }} err */
function hint(err) {
  if (err.status === 404) return `${err.message} (repository not found, or the token cannot see it)`;
  if (err.status === 403) return `${err.message} (the token needs "Issues: Read and write" on this repository)`;
  return err.message;
}

/**
 * Runs `fn` over `items` with at most `limit` calls in flight, preserving order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimit(items, limit, fn) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** @param {string[]} values */
function unique(values) {
  const seen = new Set();
  return values.filter((v) => !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
}
