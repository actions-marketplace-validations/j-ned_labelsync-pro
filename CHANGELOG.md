# Changelog

## 2.0.0

LabelSync Pro is now a GitHub Action (`uses: j-ned/labelsync-pro@v2`) and a CLI. It replaces the v1 reusable workflow.

### Added

- Only labels that differ are created, updated or deleted.
- `aliases` to rename a label in place, so issues and pull requests keep it.
- `scope: current` (default, works with `GITHUB_TOKEN`), `repositories` list, `owner` for organizations.
- Config as an object with `$schema` and `exclude`. The config can also be loaded from an https URL.
- French and English presets.
- Job summary with one row per repository and the list of changes. Outputs `repositories`, `changes`, `failed`, `report`.
- Retries on rate limits and server errors. A failing repository no longer stops the others.
- CLI: `npx github:j-ned/labelsync-pro`, dry run by default, `--apply` to write, `validate` to check a config.

### Changed

- Labels that are not in the config are kept unless `prune: true`. v1 always deleted them.
- Forks are skipped unless `include-forks: true`. Repositories without write access are skipped.
- Renamed inputs: `mode` is now `scope`, `dry_run` is `dry-run`, `labels_path` is `config`, `exclude_path` is `exclude`.

### Removed

- The reusable workflow `.github/workflows/manage-labels.yml` and `exclude.json`.

## 1.x

Reusable workflow that ran `gh label create --force` for every label on every repository.
