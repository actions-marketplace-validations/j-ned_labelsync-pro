import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '../src/github.mjs';
import { mapLimit, resolveTargets, run } from '../src/labelsync.mjs';
import { renderSummary } from '../src/report.mjs';

const silent = { info() {}, warn() {}, error() {}, startGroup() {}, endGroup() {} };

const options = (overrides = {}) => ({
  scope: 'current',
  repositories: [],
  currentRepo: 'me/app',
  exclude: [],
  skipTopic: 'no-labelsync',
  includeForks: false,
  prune: false,
  dryRun: false,
  concurrency: 2,
  ...overrides,
});

/** In-memory stand-in for the GitHub client. */
function fakeClient(labelsByRepo, repos = []) {
  const calls = [];
  return {
    calls,
    listRepos: async (owner) => (calls.push(['listRepos', owner]), repos),
    listLabels: async (repo) => {
      if (!labelsByRepo[repo]) throw Object.assign(new Error(`GET /repos/${repo}/labels: 404 Not Found`), { status: 404 });
      return labelsByRepo[repo];
    },
    createLabel: async (repo, label) => calls.push(['create', repo, label.name]),
    updateLabel: async (repo, name, changes) => calls.push(['update', repo, name, changes]),
    deleteLabel: async (repo, name) => calls.push(['delete', repo, name]),
  };
}

const repo = (full_name, extra = {}) => ({ full_name, archived: false, fork: false, topics: [], created_at: '2026-01-01T00:00:00Z', ...extra });

describe('resolveTargets', () => {
  it('uses the current repository by default', async () => {
    assert.deepEqual((await resolveTargets(fakeClient({}), options())).targets, ['me/app']);
  });

  it('prefers an explicit list, deduplicated and minus exclusions', async () => {
    const { targets, skipped } = await resolveTargets(fakeClient({}), options({ repositories: ['me/a', 'ME/A', 'me/b'], exclude: ['me/b'] }));
    assert.deepEqual(targets, ['me/a']);
    assert.deepEqual(skipped, [{ repo: 'me/b', reason: 'excluded' }]);
  });

  it('filters archived repos, forks, opted-out topics and read-only access', async () => {
    const client = fakeClient({}, [
      repo('me/ok'),
      repo('me/old', { archived: true }),
      repo('me/fork', { fork: true }),
      repo('me/optout', { topics: ['no-labelsync'] }),
      repo('org/readonly', { permissions: { push: false } }),
    ]);
    const { targets, skipped } = await resolveTargets(client, options({ scope: 'all' }));
    assert.deepEqual(targets, ['me/ok']);
    assert.deepEqual(skipped.map((s) => s.reason), ['fork', 'topic no-labelsync', 'no write access']);
  });

  it('picks the newest repository for scope latest', async () => {
    const client = fakeClient({}, [repo('me/older', { created_at: '2025-01-01T00:00:00Z' }), repo('me/newest', { created_at: '2026-05-01T00:00:00Z' })]);
    assert.deepEqual((await resolveTargets(client, options({ scope: 'latest' }))).targets, ['me/newest']);
  });

  it('passes the owner to the repository listing', async () => {
    const client = fakeClient({}, []);
    await resolveTargets(client, options({ scope: 'all', owner: 'my-org' }));
    assert.deepEqual(client.calls, [['listRepos', 'my-org']]);
  });
});

describe('run', () => {
  const config = { labels: [{ name: 'bug', color: 'd73a4a', description: '', aliases: [] }], exclude: ['me/skip'] };

  it('applies the plan and reports it', async () => {
    const client = fakeClient({ 'me/a': [], 'me/b': [{ name: 'bug', color: 'd73a4a', description: '' }] });
    const report = await run(config, options({ repositories: ['me/a', 'me/b', 'me/skip'] }), { client, log: silent });

    assert.deepEqual(client.calls, [['create', 'me/a', 'bug']]);
    assert.deepEqual(report.results.map((r) => [r.repo, r.status, r.ops.length]), [['me/a', 'synced', 1], ['me/b', 'synced', 0]]);
    assert.deepEqual(report.skipped, [{ repo: 'me/skip', reason: 'excluded' }]);
  });

  it('writes nothing in dry run', async () => {
    const client = fakeClient({ 'me/a': [{ name: 'old', color: 'aaaaaa', description: '' }] });
    const report = await run(config, options({ repositories: ['me/a'], dryRun: true, prune: true }), { client, log: silent });
    assert.deepEqual(client.calls, []);
    assert.deepEqual(report.results[0].ops.map((op) => op.type), ['create', 'delete']);
  });

  it('keeps going when one repository fails', async () => {
    const client = fakeClient({ 'me/a': [] });
    const report = await run(config, options({ repositories: ['me/missing', 'me/a'] }), { client, log: silent });
    assert.equal(report.results[0].status, 'failed');
    assert.match(report.results[0].error, /token cannot see it/);
    assert.equal(report.results[1].status, 'synced');
    assert.match(renderSummary(report), /❌ Failures/);
  });
});

describe('mapLimit', () => {
  it('never exceeds the limit and keeps order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
    assert.equal(peak, 2);
  });
});

describe('createClient', () => {
  const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

  it('follows pagination links', async () => {
    const pages = [
      json([{ name: 'a' }], { headers: { link: '<https://api.test/repos/me/a/labels?page=2>; rel="next"' } }),
      json([{ name: 'b' }]),
    ];
    const client = createClient({ token: 't', baseUrl: 'https://api.test', fetchImpl: async () => pages.shift() });
    assert.deepEqual(await client.listLabels('me/a'), [{ name: 'a' }, { name: 'b' }]);
  });

  it('retries after a secondary rate limit', async () => {
    const waits = [];
    const responses = [json({ message: 'slow down' }, { status: 403, headers: { 'retry-after': '2' } }), json([])];
    const client = createClient({ token: 't', baseUrl: 'https://api.test', fetchImpl: async () => responses.shift(), sleep: async (ms) => waits.push(ms) });
    assert.deepEqual(await client.listLabels('me/a'), []);
    assert.deepEqual(waits, [2000]);
  });

  it('encodes label names and maps renames to new_name', async () => {
    const seen = [];
    const client = createClient({
      token: 't',
      baseUrl: 'https://api.test',
      fetchImpl: async (url, init) => (seen.push([url, init.method, init.body]), json({})),
    });
    await client.updateLabel('me/a', '🐛 Fix', { name: 'Bug', color: 'ff0000' });
    assert.equal(seen[0][0], 'https://api.test/repos/me/a/labels/%F0%9F%90%9B%20Fix');
    assert.deepEqual(JSON.parse(seen[0][2]), { color: 'ff0000', new_name: 'Bug' });
  });

  it('surfaces GitHub error messages without retrying client errors', async () => {
    let calls = 0;
    const client = createClient({
      token: 't',
      baseUrl: 'https://api.test',
      fetchImpl: async () => (calls++, json({ message: 'Validation Failed', errors: [{ code: 'already_exists' }] }, { status: 422 })),
    });
    await assert.rejects(client.createLabel('me/a', { name: 'x', color: 'aaaaaa', description: '' }), /422 Validation Failed — already_exists/);
    assert.equal(calls, 1);
  });
});
