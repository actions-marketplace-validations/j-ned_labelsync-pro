# Changelog

## 2.0.0

LabelSync Pro is now a regular GitHub Action (`uses: j-ned/labelsync-pro@v2`) plus a CLI, replacing the v1 reusable workflow.

### Added
- Minimal diffs: only labels that differ are created, updated or deleted.
- `aliases` to rename labels in place, so issues and pull requests keep them.
- `scope: current` (default, works with `GITHUB_TOKEN`), `repositories` list, `owner` for organizations.
- Config object format with `$schema` and `exclude`; config can be loaded from an https URL.
- English and French presets.
- Job summary with per-repository counts and diffs; `repositories`, `changes`, `failed`, `report` outputs.
- Retries on rate limits and server errors; one failing repository no longer hides the others.
- CLI: `npx github:j-ned/labelsync-pro` (dry run by default, `--apply` to write) and `validate`.

### Changed
- Unknown labels are kept unless `prune: true` (v1 always deleted them).
- Forks are skipped unless `include-forks: true`; repositories without write access are skipped.
- Inputs renamed: `mode` → `scope`, `dry_run` → `dry-run`, `labels_path` → `config`, `exclude_path` → `exclude`.

### Removed
- The reusable workflow `.github/workflows/manage-labels.yml` and `exclude.json`.

## 1.x

Reusable workflow syncing `.github/config/labels.json` with `gh label create --force` on every repository.
