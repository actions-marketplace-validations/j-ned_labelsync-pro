// @ts-check

/**
 * @typedef {import('./config.mjs').Label} Label
 * @typedef {{ name: string, color: string, description: string | null }} RemoteLabel
 *
 * @typedef {{ type: 'create', name: string, color: string, description: string }} CreateOp
 * @typedef {{ type: 'update', name: string, changes: { name?: string, color?: string, description?: string } }} UpdateOp
 * @typedef {{ type: 'delete', name: string }} DeleteOp
 * @typedef {CreateOp | UpdateOp | DeleteOp} Op
 *
 * @typedef {object} Plan
 * @property {Op[]} ops            in the order they must be applied
 * @property {number} unchanged    desired labels already up to date
 * @property {string[]} extra      labels present on the repo but not in the config (kept, prune is off)
 */

/**
 * Computes the minimal set of API calls turning `existing` into `desired`.
 * Matching is case-insensitive (like GitHub); a label found under one of its aliases
 * is renamed in place, so every issue and PR keeps it.
 *
 * @param {Label[]} desired
 * @param {RemoteLabel[]} existing
 * @param {{ prune?: boolean }} [options]
 * @returns {Plan}
 */
export function planChanges(desired, existing, { prune = false } = {}) {
  const byKey = new Map(existing.map((label) => [label.name.toLowerCase(), label]));
  /** @type {Set<string>} */
  const claimed = new Set();
  /** @type {UpdateOp[]} */
  const updates = [];
  /** @type {CreateOp[]} */
  const creates = [];
  let unchanged = 0;

  // Exact names first, so an alias never steals a label another entry owns.
  for (const label of desired) {
    if (byKey.has(label.name.toLowerCase())) claimed.add(label.name.toLowerCase());
  }

  for (const label of desired) {
    let current = byKey.get(label.name.toLowerCase());
    if (!current) {
      const alias = label.aliases.map((a) => a.toLowerCase()).find((key) => byKey.has(key) && !claimed.has(key));
      if (alias) {
        claimed.add(alias);
        current = byKey.get(alias);
      }
    }

    if (!current) {
      creates.push({ type: 'create', name: label.name, color: label.color, description: label.description });
      continue;
    }

    /** @type {UpdateOp['changes']} */
    const changes = {};
    if (current.name !== label.name) changes.name = label.name;
    if (current.color.toLowerCase() !== label.color) changes.color = label.color;
    if ((current.description ?? '') !== label.description) changes.description = label.description;

    if (Object.keys(changes).length === 0) unchanged++;
    else updates.push({ type: 'update', name: current.name, changes });
  }

  const leftovers = existing.filter((label) => !claimed.has(label.name.toLowerCase())).map((label) => label.name);
  /** @type {DeleteOp[]} */
  const deletes = prune ? leftovers.map((name) => ({ type: 'delete', name })) : [];

  return {
    ops: [...updates, ...creates, ...deletes],
    unchanged,
    extra: prune ? [] : leftovers,
  };
}

/**
 * One-line human description of an operation.
 * @param {Op} op
 */
export function describeOp(op) {
  switch (op.type) {
    case 'create':
      return `+ create  "${op.name}" #${op.color}`;
    case 'delete':
      return `- delete  "${op.name}"`;
    case 'update': {
      const parts = [];
      if (op.changes.name !== undefined) parts.push(`→ "${op.changes.name}"`);
      if (op.changes.color !== undefined) parts.push(`color #${op.changes.color}`);
      if (op.changes.description !== undefined) parts.push('description');
      const verb = isRename(op) ? 'rename' : 'update';
      return `~ ${verb.padEnd(7)} "${op.name}" ${parts.join(', ')}`;
    }
  }
}

/** True when an update changes more than the letter case of the name. @param {UpdateOp} op */
export function isRename(op) {
  return op.changes.name !== undefined && op.changes.name.toLowerCase() !== op.name.toLowerCase();
}
