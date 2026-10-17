// @ts-check
import { describeOp, isRename } from './plan.mjs';

/**
 * @typedef {import('./labelsync.mjs').Report} Report
 * @typedef {import('./labelsync.mjs').RepoResult} RepoResult
 */

/** @param {RepoResult} result */
export function countOps(result) {
  const counts = { created: 0, updated: 0, renamed: 0, deleted: 0 };
  for (const op of result.ops) {
    if (op.type === 'create') counts.created++;
    else if (op.type === 'delete') counts.deleted++;
    else if (isRename(op)) counts.renamed++;
    else counts.updated++;
  }
  return counts;
}

/** @param {Report} report */
export function totals(report) {
  return {
    repositories: report.results.length,
    failed: report.results.filter((r) => r.status === 'failed').length,
    changes: report.results.reduce((sum, r) => sum + r.ops.length, 0),
  };
}

/**
 * Markdown for the GitHub job summary.
 * @param {Report} report
 */
export function renderSummary(report) {
  const { repositories, failed, changes } = totals(report);
  const mode = report.dryRun ? ' (dry run, nothing was written)' : '';
  const lines = [
    `## 🏷️ LabelSync${mode}`,
    '',
    `**${repositories}** repositor${repositories === 1 ? 'y' : 'ies'}, **${changes}** change${changes === 1 ? '' : 's'}` +
      `${report.dryRun ? ' planned' : ''}, **${failed}** failure${failed === 1 ? '' : 's'}` +
      `, prune ${report.prune ? 'on' : 'off'}`,
    '',
  ];

  if (repositories > 0) {
    lines.push('| Repository | Status | Created | Updated | Renamed | Deleted | Unchanged |', '|---|:-:|--:|--:|--:|--:|--:|');
    for (const result of report.results) {
      const c = countOps(result);
      const status = result.status === 'failed' ? '❌' : result.ops.length === 0 ? '✅' : report.dryRun ? '📝' : '🔄';
      lines.push(`| \`${result.repo}\` | ${status} | ${c.created} | ${c.updated} | ${c.renamed} | ${c.deleted} | ${result.unchanged} |`);
    }
    lines.push('');
  }

  const failures = report.results.filter((r) => r.status === 'failed');
  if (failures.length > 0) {
    lines.push('### ❌ Failures', '', ...failures.map((r) => `- \`${r.repo}\`: ${r.error}`), '');
  }

  const changed = report.results.filter((r) => r.ops.length > 0);
  if (changed.length > 0) {
    lines.push('<details><summary>Changes per repository</summary>', '');
    for (const result of changed) {
      lines.push(`**\`${result.repo}\`**`, '', '```diff', ...result.ops.map(describeOp), '```', '');
    }
    lines.push('</details>', '');
  }

  const extra = report.results.filter((r) => r.extra.length > 0);
  if (extra.length > 0) {
    lines.push(
      '<details><summary>Labels kept because they are not in the config (enable <code>prune</code> to delete them)</summary>',
      '',
      ...extra.map((r) => `- \`${r.repo}\`: ${r.extra.map((name) => `\`${name}\``).join(', ')}`),
      '',
      '</details>',
      '',
    );
  }

  if (report.skipped.length > 0) {
    lines.push(
      `<details><summary>${report.skipped.length} repositor${report.skipped.length === 1 ? 'y' : 'ies'} skipped</summary>`,
      '',
      ...report.skipped.map((s) => `- \`${s.repo}\`: ${s.reason}`),
      '',
      '</details>',
      '',
    );
  }

  return lines.join('\n');
}
