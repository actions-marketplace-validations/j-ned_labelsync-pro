// @ts-check
import { setTimeout as delay } from 'node:timers/promises';

const MAX_RETRIES = 3;
const MAX_WAIT_MS = 60_000;

export class GitHubError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/**
 * @typedef {object} Repo
 * @property {string} full_name
 * @property {boolean} archived
 * @property {boolean} fork
 * @property {string[]} [topics]
 * @property {string} created_at
 * @property {{ push?: boolean }} [permissions]
 *
 * @typedef {ReturnType<typeof createClient>} GitHubClient
 */

/**
 * Minimal GitHub REST client: pagination, retries on rate limits and 5xx, no dependencies.
 * @param {object} options
 * @param {string} options.token
 * @param {string} [options.baseUrl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(ms: number) => Promise<unknown>} [options.sleep]
 */
export function createClient({
  token,
  baseUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
  fetchImpl = fetch,
  sleep = delay,
}) {
  /**
   * @param {string} method
   * @param {string} url   absolute URL or path starting with `/`
   * @param {unknown} [body]
   * @returns {Promise<{ data: any, headers: Headers }>}
   */
  async function request(method, url, body) {
    const target = url.startsWith('http') ? url : baseUrl + url;
    for (let attempt = 0; ; attempt++) {
      /** @type {Response} */
      let res;
      try {
        res = await fetchImpl(target, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'labelsync-pro',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await sleep(backoff(attempt));
        continue;
      }

      if (res.ok) {
        const data = res.status === 204 ? null : await res.json();
        return { data, headers: res.headers };
      }

      const wait = retryDelay(res, attempt);
      if (wait !== undefined && attempt < MAX_RETRIES) {
        await sleep(wait);
        continue;
      }

      const payload = await res.json().catch(() => ({}));
      const details = Array.isArray(payload.errors) ? payload.errors.map((/** @type {any} */ e) => e.message || e.code).filter(Boolean) : [];
      const message = [payload.message || res.statusText, ...details].join(': ');
      throw new GitHubError(`${method} ${new URL(target).pathname}: ${res.status} ${message}`, res.status);
    }
  }

  /** @param {string} path @returns {Promise<any[]>} */
  async function paginate(path) {
    const items = [];
    /** @type {string | undefined} */
    let url = path;
    while (url) {
      const { data, headers } = await request('GET', url);
      items.push(...data);
      url = nextLink(headers.get('link'));
    }
    return items;
  }

  /** @param {string} repo */
  const labelsPath = (repo) => `/repos/${repo}/labels`;

  return {
    request,

    /** @param {string} repo @returns {Promise<import('./plan.mjs').RemoteLabel[]>} */
    listLabels: (repo) => paginate(`${labelsPath(repo)}?per_page=100`),

    /** @param {string} repo @param {{ name: string, color: string, description: string }} label */
    createLabel: (repo, label) => request('POST', labelsPath(repo), label),

    /** @param {string} repo @param {string} name @param {{ name?: string, color?: string, description?: string }} changes */
    updateLabel: (repo, name, { name: newName, ...rest }) =>
      request('PATCH', `${labelsPath(repo)}/${encodeURIComponent(name)}`, { ...rest, ...(newName ? { new_name: newName } : {}) }),

    /** @param {string} repo @param {string} name */
    deleteLabel: (repo, name) => request('DELETE', `${labelsPath(repo)}/${encodeURIComponent(name)}`),

    /**
     * Repositories of `owner` (user or organization), newest first.
     * Without `owner`, the repositories owned by the token's user.
     * @param {string} [owner]
     * @returns {Promise<Repo[]>}
     */
    async listRepos(owner) {
      const query = 'sort=created&direction=desc&per_page=100';
      if (!owner) return paginate(`/user/repos?affiliation=owner&${query}`);

      const { data: account } = await request('GET', `/users/${encodeURIComponent(owner)}`);
      if (account.type === 'Organization') return paginate(`/orgs/${encodeURIComponent(owner)}/repos?type=all&${query}`);

      // /users/{owner}/repos only lists public repos: use /user/repos when the token belongs to `owner`.
      const me = await request('GET', '/user').then((r) => r.data.login, () => undefined);
      if (me && me.toLowerCase() === owner.toLowerCase()) return paginate(`/user/repos?affiliation=owner&${query}`);
      return paginate(`/users/${encodeURIComponent(owner)}/repos?type=owner&${query}`);
    },
  };
}

/** @param {string | null} header */
export function nextLink(header) {
  return header?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
}

/**
 * Milliseconds to wait before retrying, or undefined when the error is not retryable.
 * @param {Response} res
 * @param {number} attempt
 */
function retryDelay(res, attempt) {
  const retryAfter = Number(res.headers.get('retry-after'));
  const rateLimited = res.status === 429 || (res.status === 403 && (retryAfter > 0 || res.headers.get('x-ratelimit-remaining') === '0'));

  if (rateLimited) {
    if (retryAfter > 0) return capped(retryAfter * 1000);
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    return reset > 0 ? capped(reset * 1000 - Date.now()) : backoff(attempt);
  }
  if (res.status >= 500) return backoff(attempt);
  return undefined;
}

/** Waits longer than MAX_WAIT_MS are not worth blocking a CI job for. @param {number} ms */
function capped(ms) {
  return ms > MAX_WAIT_MS ? undefined : Math.max(ms, 1000);
}

/** @param {number} attempt */
function backoff(attempt) {
  return 1000 * 2 ** attempt;
}
