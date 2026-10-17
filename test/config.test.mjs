import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig, parseConfig } from '../src/config.mjs';

const problemsOf = (data) => {
  try {
    parseConfig(data);
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    return err.problems;
  }
  assert.fail('expected a ConfigError');
};

describe('parseConfig', () => {
  it('accepts the v1 bare array format', () => {
    const config = parseConfig([{ name: 'bug', color: 'D73A4A' }]);
    assert.deepEqual(config, { labels: [{ name: 'bug', color: 'd73a4a', description: '', aliases: [] }], exclude: [] });
  });

  it('accepts the object format with $schema, exclude and aliases', () => {
    const config = parseConfig({
      $schema: 'x',
      labels: [{ name: 'fix', color: '#ff0000', description: 'Fix', aliases: ['bug'] }],
      exclude: ['me/repo'],
    });
    assert.equal(config.labels[0].color, 'ff0000');
    assert.deepEqual(config.labels[0].aliases, ['bug']);
    assert.deepEqual(config.exclude, ['me/repo']);
  });

  it('reports every problem at once', () => {
    const problems = problemsOf({ labels: [{ name: '', color: 'red' }, { name: 'ok', color: 'aaaaaa', extra: 1 }], foo: 1 });
    assert.equal(problems.length, 4);
  });

  it('rejects names colliding case-insensitively, aliases included', () => {
    assert.equal(problemsOf([{ name: 'Bug', color: 'aaaaaa' }, { name: 'bug', color: 'aaaaaa' }]).length, 1);
    assert.equal(problemsOf([{ name: 'fix', color: 'aaaaaa', aliases: ['bug'] }, { name: 'BUG', color: 'aaaaaa' }]).length, 1);
  });

  it('enforces GitHub length limits, counting emoji as characters', () => {
    assert.doesNotThrow(() => parseConfig([{ name: '🐛'.repeat(50), color: 'aaaaaa' }]));
    assert.equal(problemsOf([{ name: 'x'.repeat(51), color: 'aaaaaa' }]).length, 1);
    assert.equal(problemsOf([{ name: 'x', color: 'aaaaaa', description: 'd'.repeat(101) }]).length, 1);
  });

  it('rejects malformed exclude entries', () => {
    assert.equal(problemsOf({ labels: [{ name: 'x', color: 'aaaaaa' }], exclude: ['no-slash'] }).length, 1);
  });

  it('rejects an empty label list', () => {
    assert.ok(problemsOf([]).length > 0);
  });
});

describe('loadConfig', () => {
  it('explains a missing file', async () => {
    await assert.rejects(loadConfig('does/not/exist.json'), /actions\/checkout/);
  });

  it('downloads a config from a URL', async () => {
    const fetchImpl = async () => new Response(JSON.stringify([{ name: 'bug', color: 'aaaaaa' }]));
    const config = await loadConfig('https://example.com/labels.json', { fetchImpl });
    assert.equal(config.labels[0].name, 'bug');
  });

  it('ships valid presets', async () => {
    const dir = new URL('../presets/', import.meta.url);
    for (const file of await readdir(dir)) {
      const config = await loadConfig(new URL(file, dir).pathname);
      assert.ok(config.labels.length > 0, file);
    }
  });
});
