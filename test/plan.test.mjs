import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeOp, planChanges } from '../src/plan.mjs';

const label = (name, color = 'aaaaaa', description = '', aliases = []) => ({ name, color, description, aliases });
const remote = (name, color = 'aaaaaa', description = null) => ({ name, color, description });

describe('planChanges', () => {
  it('does nothing when the repository already matches', () => {
    const plan = planChanges([label('bug', 'd73a4a', 'Broken')], [remote('bug', 'D73A4A', 'Broken')]);
    assert.deepEqual(plan, { ops: [], unchanged: 1, extra: [] });
  });

  it('treats a null remote description as empty', () => {
    assert.equal(planChanges([label('bug')], [remote('bug', 'aaaaaa', null)]).unchanged, 1);
  });

  it('creates missing labels', () => {
    const { ops } = planChanges([label('feat', '00ff00', 'New')], []);
    assert.deepEqual(ops, [{ type: 'create', name: 'feat', color: '00ff00', description: 'New' }]);
  });

  it('updates only the fields that differ', () => {
    const { ops } = planChanges([label('bug', 'ff0000', 'Same')], [remote('bug', 'aaaaaa', 'Same')]);
    assert.deepEqual(ops, [{ type: 'update', name: 'bug', changes: { color: 'ff0000' } }]);
  });

  it('matches names case-insensitively and fixes the case', () => {
    const { ops } = planChanges([label('Bug')], [remote('bug')]);
    assert.deepEqual(ops, [{ type: 'update', name: 'bug', changes: { name: 'Bug' } }]);
  });

  it('renames a label found under an alias instead of recreating it', () => {
    const { ops, extra } = planChanges([label('🐛 Fix', 'dc3545', '', ['bug'])], [remote('bug', 'd73a4a')]);
    assert.deepEqual(ops, [{ type: 'update', name: 'bug', changes: { name: '🐛 Fix', color: 'dc3545' } }]);
    assert.deepEqual(extra, []);
  });

  it('prefers the exact name over an alias, leaving the alias untouched', () => {
    const plan = planChanges([label('fix', 'aaaaaa', '', ['bug'])], [remote('bug'), remote('fix')]);
    assert.deepEqual(plan.ops, []);
    assert.deepEqual(plan.extra, ['bug']);
  });

  it('never lets an alias steal a label another entry owns exactly', () => {
    const plan = planChanges([label('new', 'aaaaaa', '', ['old']), label('old')], [remote('old')]);
    assert.deepEqual(plan.ops, [{ type: 'create', name: 'new', color: 'aaaaaa', description: '' }]);
  });

  it('keeps unknown labels unless prune is on', () => {
    const existing = [remote('bug'), remote('wontfix')];
    assert.deepEqual(planChanges([label('bug')], existing).extra, ['wontfix']);

    const pruned = planChanges([label('bug')], existing, { prune: true });
    assert.deepEqual(pruned.ops, [{ type: 'delete', name: 'wontfix' }]);
    assert.deepEqual(pruned.extra, []);
  });

  it('orders operations: updates, then creates, then deletes', () => {
    const { ops } = planChanges([label('a'), label('b', 'ffffff')], [remote('b'), remote('z')], { prune: true });
    assert.deepEqual(ops.map((op) => op.type), ['update', 'create', 'delete']);
  });
});

describe('describeOp', () => {
  it('labels renames and plain updates differently', () => {
    assert.match(describeOp({ type: 'update', name: 'bug', changes: { name: 'Fix' } }), /^~ rename/);
    assert.match(describeOp({ type: 'update', name: 'bug', changes: { name: 'Bug' } }), /^~ update/);
  });
});
