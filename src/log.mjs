// @ts-check

/** @typedef {import('./labelsync.mjs').Logger} Logger */

/**
 * Logger using GitHub Actions workflow commands, so errors show up as annotations
 * and every repository gets a collapsible group.
 * @returns {Logger}
 */
export function actionsLogger() {
  return {
    info: (m) => console.log(m),
    warn: (m) => console.log(`::warning::${escape(m)}`),
    error: (m) => console.log(`::error::${escape(m)}`),
    startGroup: (title) => console.log(`::group::${title}`),
    endGroup: () => console.log('::endgroup::'),
  };
}

/** Plain terminal logger for the CLI. @returns {Logger} */
export function consoleLogger() {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (/** @type {string} */ code, /** @type {string} */ m) => (color ? `\x1b[${code}m${m}\x1b[0m` : m);
  return {
    info: (m) => {
      const sign = m.replace(/^\[dry-run\] /, '')[0];
      console.log(sign === '+' ? paint('32', m) : sign === '-' ? paint('31', m) : sign === '~' ? paint('33', m) : m);
    },
    warn: (m) => console.warn(paint('33', `warning: ${m}`)),
    error: (m) => console.error(paint('31', `error: ${m}`)),
    startGroup: (title) => console.log(`\n${paint('1', title)}`),
    endGroup: () => {},
  };
}

/** Workflow commands need %, CR and LF escaped. @param {string} m */
function escape(m) {
  return m.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
