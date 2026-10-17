// @ts-check
import { readFile } from 'node:fs/promises';

/**
 * @typedef {object} Label
 * @property {string} name
 * @property {string} color        6 lowercase hex digits, no leading `#`
 * @property {string} description
 * @property {string[]} aliases    previous names, renamed in place so issues keep their label
 *
 * @typedef {object} Config
 * @property {Label[]} labels
 * @property {string[]} exclude    `owner/name` entries never touched
 */

// Limits enforced by the GitHub REST API.
const MAX_NAME = 50;
const MAX_DESCRIPTION = 100;
const COLOR = /^#?[0-9a-f]{6}$/i;
export const REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;

const TOP_KEYS = new Set(['$schema', 'labels', 'exclude']);
const LABEL_KEYS = new Set(['name', 'color', 'description', 'aliases']);

export class ConfigError extends Error {
  /** @param {string} source @param {string[]} problems */
  constructor(source, problems) {
    super(`Invalid config ${source}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * Loads a config from a local path or an http(s) URL (handy to share one preset across repos).
 * @param {string} source
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Config>}
 */
export async function loadConfig(source, { fetchImpl = fetch } = {}) {
  let text;
  if (/^https?:\/\//i.test(source)) {
    const res = await fetchImpl(source);
    if (!res.ok) throw new ConfigError(source, [`HTTP ${res.status} while downloading the config`]);
    text = await res.text();
  } else {
    try {
      text = await readFile(source, 'utf8');
    } catch (err) {
      const hint = /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT'
        ? 'file not found (did you run actions/checkout before LabelSync?)'
        : String(err);
      throw new ConfigError(source, [hint]);
    }
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(source, [`not valid JSON: ${/** @type {Error} */ (err).message}`]);
  }
  return parseConfig(data, source);
}

/**
 * Validates and normalizes a config. Accepts either a bare array of labels (v1 format)
 * or an object `{ labels, exclude }`. Mirrors schema/labels.schema.json.
 * @param {unknown} data
 * @param {string} [source]
 * @returns {Config}
 */
export function parseConfig(data, source = 'config') {
  /** @type {string[]} */
  const problems = [];
  const root = Array.isArray(data) ? { labels: data } : data;

  if (!isObject(root)) throw new ConfigError(source, ['expected an array of labels or an object { "labels": [...] }']);

  for (const key of Object.keys(root)) {
    if (!TOP_KEYS.has(key)) problems.push(`unknown key "${key}"`);
  }

  /** @type {Label[]} */
  const labels = [];
  if (!Array.isArray(root.labels) || root.labels.length === 0) {
    problems.push('"labels" must be a non-empty array');
  } else {
    root.labels.forEach((raw, i) => {
      const label = parseLabel(raw, `labels[${i}]`, problems);
      if (label) labels.push(label);
    });
  }

  /** @type {string[]} */
  const exclude = [];
  if (root.exclude !== undefined) {
    if (!Array.isArray(root.exclude)) {
      problems.push('"exclude" must be an array of "owner/name" strings');
    } else {
      root.exclude.forEach((repo, i) => {
        if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) problems.push(`exclude[${i}] must look like "owner/name"`);
        else exclude.push(repo);
      });
    }
  }

  // GitHub label names are case-insensitive: names and aliases must not collide.
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const label of labels) {
    for (const name of [label.name, ...label.aliases]) {
      const key = name.toLowerCase();
      const owner = seen.get(key);
      if (owner !== undefined) problems.push(`"${name}" is used more than once (also by "${owner}")`);
      else seen.set(key, label.name);
    }
  }

  if (problems.length > 0) throw new ConfigError(source, problems);
  return { labels, exclude };
}

/**
 * @param {unknown} raw
 * @param {string} at
 * @param {string[]} problems
 * @returns {Label | undefined}
 */
function parseLabel(raw, at, problems) {
  if (!isObject(raw)) {
    problems.push(`${at} must be an object`);
    return undefined;
  }
  const before = problems.length;

  for (const key of Object.keys(raw)) {
    if (!LABEL_KEYS.has(key)) problems.push(`${at}: unknown key "${key}"`);
  }

  const { name, color, description = '', aliases = [] } = raw;
  if (typeof name !== 'string' || name.trim() === '') problems.push(`${at}: "name" is required`);
  else if (name !== name.trim()) problems.push(`${at}: "name" has leading/trailing spaces`);
  else if ([...name].length > MAX_NAME) problems.push(`${at}: "name" exceeds ${MAX_NAME} characters`);

  if (typeof color !== 'string' || !COLOR.test(color)) problems.push(`${at}: "color" must be a 6-digit hex code like "d73a4a"`);

  if (typeof description !== 'string') problems.push(`${at}: "description" must be a string`);
  else if ([...description].length > MAX_DESCRIPTION) problems.push(`${at}: "description" exceeds ${MAX_DESCRIPTION} characters`);

  if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string' || a.trim() === '')) {
    problems.push(`${at}: "aliases" must be an array of non-empty strings`);
  }

  if (problems.length > before) return undefined;
  return {
    name: /** @type {string} */ (name),
    color: /** @type {string} */ (color).replace('#', '').toLowerCase(),
    description: /** @type {string} */ (description),
    aliases: /** @type {string[]} */ (aliases),
  };
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
