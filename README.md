# LabelSync Pro

[![CI](https://github.com/j-ned/labelsync-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/j-ned/labelsync-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Français](#version-française) | [English](#english-version)

![Labels synchronisés par LabelSync Pro](screenshot/label_1.png)

---

# Version française

## Description

LabelSync Pro synchronise un même jeu de labels sur vos repositories GitHub. Vous décrivez vos labels dans un fichier JSON, et l'outil les applique au repository courant, à tous vos repositories ou à ceux d'une organisation.

Il existe sous deux formes :

- une GitHub Action, à utiliser dans un workflow ;
- une commande à lancer depuis votre terminal.

## Fonctionnalités

- Seuls les labels qui diffèrent sont modifiés. Un repository déjà à jour ne coûte qu'un appel à l'API.
- Les anciens noms d'un label se déclarent dans `aliases`. Si un repository a encore `bug`, il est renommé en `🐛 Fix` au lieu d'être supprimé puis recréé, et les issues qui l'avaient le gardent.
- Les labels absents de la config sont conservés, sauf si vous activez `prune`.
- Le mode `dry-run` affiche les changements prévus sans rien modifier.
- Les repositories archivés, les forks, ceux sur lesquels vous n'avez pas les droits d'écriture et ceux qui ont le topic `no-labelsync` sont ignorés.
- Un résumé est ajouté au job : un tableau par repository et la liste des changements.
- Si un repository échoue, les autres sont quand même traités.
- Aucune dépendance et pas d'étape de build : le code tourne directement sur Node.js 24.

## Démarrage rapide

Pour synchroniser les labels du repository dans lequel tourne le workflow.

1. Créez `.github/labels.json` :

```json
{
  "$schema": "https://raw.githubusercontent.com/j-ned/labelsync-pro/master/schema/labels.schema.json",
  "labels": [
    { "name": "🐛 Fix", "color": "dc3545", "description": "Correction de bugs", "aliases": ["bug"] },
    { "name": "✨ Feature", "color": "198754", "description": "Nouvelle fonctionnalité", "aliases": ["enhancement"] },
    { "name": "📖 Docs", "color": "17a2b8", "description": "Documentation", "aliases": ["documentation"] }
  ]
}
```

La ligne `$schema` permet à VS Code ou WebStorm de proposer l'autocomplétion et de signaler les erreurs.

2. Ajoutez un workflow, par exemple `.github/workflows/labels.yml` :

```yaml
name: Sync labels
on:
  push:
    branches: [main]
    paths: [.github/labels.json]
  workflow_dispatch:

permissions:
  issues: write

jobs:
  labels:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: j-ned/labelsync-pro@v2
```

Le `GITHUB_TOKEN` fourni par GitHub suffit pour le repository courant.

## Synchroniser tous vos repositories

Gardez un repository qui contient votre config et lance la synchronisation à heure fixe. Il a besoin d'un token qui a accès à vos autres repositories :

1. Créez un [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) avec **Repository access : All repositories** et les permissions **Metadata : Read** et **Issues : Read and write**.
2. Ajoutez-le comme secret du repository, par exemple `LABELSYNC_TOKEN`.
3. Ajoutez le workflow :

```yaml
name: Sync labels everywhere
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  labels:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: j-ned/labelsync-pro@v2
        with:
          token: ${{ secrets.LABELSYNC_TOKEN }}
          scope: all              # ou latest pour le dernier repository créé
          # owner: mon-org        # pour une organisation
          exclude: |
            moi/repo-a-ignorer
```

Lancez-le une première fois avec `dry-run: true` et lisez le résumé du job avant de le laisser modifier quoi que ce soit.

## Depuis le terminal

Il faut Node.js 22 ou plus, et être connecté avec `gh auth login` (ou avoir un `GITHUB_TOKEN`).

```bash
# Aperçu : rien n'est modifié sans --apply
npx github:j-ned/labelsync-pro --repo moi/mon-app \
  --config https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-fr.json

# Appliquer sur tous vos repositories
npx github:j-ned/labelsync-pro --scope all --config .github/labels.json --apply

# Vérifier un fichier de config
npx github:j-ned/labelsync-pro validate .github/labels.json
```

Exemple de sortie :

```text
🏷️ moi/mon-app
[dry-run] ~ rename  "bug" to "🐛 Fix", color #dc3545, description
[dry-run] ~ rename  "enhancement" to "✨ Feature", color #198754, description
[dry-run] + create  "🚑 Hotfix" #b22222
...
1 repository, 29 change(s) planned, 0 failed
```

`--help` liste toutes les options.

## Configuration

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/j-ned/labelsync-pro/master/schema/labels.schema.json",
  "labels": [
    {
      "name": "🐛 Fix",               // obligatoire, 50 caractères max
      "color": "dc3545",              // obligatoire, avec ou sans #
      "description": "Correctif",     // facultatif, 100 caractères max
      "aliases": ["bug", "type: bug"] // facultatif, anciens noms à renommer
    }
  ],
  "exclude": ["moi/vieux-repo"]       // facultatif, repositories à ne jamais modifier
}
```

- Les noms sont comparés sans tenir compte des majuscules, comme le fait GitHub.
- L'ancien format (un simple tableau de labels) est toujours accepté.
- La config est vérifiée avant le moindre appel à l'API, et toutes les erreurs sont affichées en une fois.
- `config` accepte aussi une URL https, ce qui permet de partager un même fichier entre plusieurs repositories.

### Presets

Deux jeux de 29 labels sont fournis. Ils contiennent des alias qui convertissent les labels créés par défaut par GitHub (`bug`, `enhancement`, `documentation`).

| Preset | Valeur de `config` |
|---|---|
| [`presets/emoji-fr.json`](presets/emoji-fr.json) | `https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-fr.json` |
| [`presets/emoji-en.json`](presets/emoji-en.json) | `https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-en.json` |

![Suite du preset français](screenshot/label_2.png)

## Entrées et sorties

| Entrée | Défaut | Description |
|---|---|---|
| `token` | `${{ github.token }}` | Token utilisé pour l'API. Il faut un PAT pour `scope: all` ou `latest`. |
| `config` | `.github/labels.json` | Chemin dans le repository ou URL https. |
| `scope` | `current` | `current`, `all` (tous les repositories non archivés de `owner`) ou `latest` (le dernier créé). |
| `repositories` | | Liste de repositories `owner/name`, séparés par des virgules ou des retours à la ligne. Remplace `scope`. |
| `owner` | propriétaire du token | Utilisateur ou organisation à parcourir avec `all` ou `latest`. |
| `exclude` | | Repositories à ne jamais modifier, en plus du `exclude` de la config. |
| `skip-topic` | `no-labelsync` | Les repositories qui ont ce topic sont ignorés. Laisser vide pour désactiver. |
| `include-forks` | `false` | Synchroniser aussi les forks. |
| `prune` | `false` | Supprimer les labels absents de la config. |
| `dry-run` | `false` | Afficher les changements sans les appliquer. |
| `concurrency` | `4` | Nombre de repositories traités en parallèle. |

| Sortie | Description |
|---|---|
| `repositories` | Nombre de repositories traités. |
| `changes` | Nombre de changements appliqués, ou prévus en dry run. |
| `failed` | Nombre de repositories en échec. L'étape échoue si ce n'est pas 0. |
| `report` | Rapport complet au format JSON. |

## Attention à `prune`

Supprimer un label le retire de toutes les issues et pull requests qui l'avaient. C'est pour ça que `prune` est désactivé par défaut. Avant de l'activer, ajoutez à votre config les labels créés par vos outils, par exemple `dependencies` pour Dependabot, sinon ils seront recréés puis supprimés à chaque passage.

## Passer de la v1 à la v2

La v1 était un workflow réutilisable. La v2 est une action classique, à placer dans un step après `actions/checkout`.

| v1 | v2 |
|---|---|
| `uses: j-ned/labelsync-pro/.github/workflows/manage-labels.yml@master` | `uses: j-ned/labelsync-pro@v2` |
| `mode` | `scope` |
| `dry_run` | `dry-run` |
| `labels_path` | `config` |
| `exclude_path` et `exclude.json` | entrée `exclude`, ou clé `exclude` dans la config |
| les labels inconnus étaient toujours supprimés | `prune: true` pour garder ce comportement |
| les forks étaient synchronisés | `include-forks: true` pour garder ce comportement |

Votre ancien `labels.json` fonctionne sans modification.

## Contribuer

Les issues et pull requests sont les bienvenues.

```bash
npm test            # lance les tests
npm run validate    # vérifie les presets
```

## Licence

[MIT](LICENSE)

---

# English version

## Description

LabelSync Pro applies the same set of labels to your GitHub repositories. You write your labels in a JSON file, and the tool applies them to the current repository, to all of your repositories, or to the repositories of an organization.

It comes in two forms:

- a GitHub Action, used in a workflow;
- a command you can run from your terminal.

## Features

- Only labels that differ are changed. A repository that is already up to date costs a single API call.
- Old names of a label go in `aliases`. If a repository still has `bug`, it is renamed to `🐛 Fix` instead of being deleted and created again, so issues keep it.
- Labels that are not in the config are kept unless you turn on `prune`.
- `dry-run` shows the planned changes without applying them.
- Archived repositories, forks, repositories you can't write to and repositories with the `no-labelsync` topic are skipped.
- A summary is added to the job: one row per repository and the list of changes.
- If one repository fails, the others are still processed.
- No dependencies and no build step: the code runs as is on Node.js 24.

## Quick start

To sync the labels of the repository the workflow runs in.

1. Create `.github/labels.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/j-ned/labelsync-pro/master/schema/labels.schema.json",
  "labels": [
    { "name": "🐛 Fix", "color": "dc3545", "description": "Something isn't working", "aliases": ["bug"] },
    { "name": "✨ Feature", "color": "198754", "description": "New feature or request", "aliases": ["enhancement"] },
    { "name": "📖 Docs", "color": "17a2b8", "description": "Documentation", "aliases": ["documentation"] }
  ]
}
```

The `$schema` line gives you autocompletion and error checking in VS Code or WebStorm.

2. Add a workflow, for example `.github/workflows/labels.yml`:

```yaml
name: Sync labels
on:
  push:
    branches: [main]
    paths: [.github/labels.json]
  workflow_dispatch:

permissions:
  issues: write

jobs:
  labels:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: j-ned/labelsync-pro@v2
```

The `GITHUB_TOKEN` provided by GitHub is enough for the current repository.

## Sync all your repositories

Keep one repository that holds your config and runs the sync on a schedule. It needs a token with access to your other repositories:

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with **Repository access: All repositories** and the **Metadata: Read** and **Issues: Read and write** permissions.
2. Add it as a repository secret, for example `LABELSYNC_TOKEN`.
3. Add the workflow:

```yaml
name: Sync labels everywhere
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  labels:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: j-ned/labelsync-pro@v2
        with:
          token: ${{ secrets.LABELSYNC_TOKEN }}
          scope: all              # or latest for the most recently created repository
          # owner: my-org         # for an organization
          exclude: |
            me/repo-to-skip
```

Run it once with `dry-run: true` and check the job summary before letting it change anything.

## From the terminal

You need Node.js 22 or later, and to be logged in with `gh auth login` (or have a `GITHUB_TOKEN`).

```bash
# Preview: nothing is changed without --apply
npx github:j-ned/labelsync-pro --repo me/my-app \
  --config https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-en.json

# Apply to all your repositories
npx github:j-ned/labelsync-pro --scope all --config .github/labels.json --apply

# Check a config file
npx github:j-ned/labelsync-pro validate .github/labels.json
```

`--help` lists every option.

## Configuration

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/j-ned/labelsync-pro/master/schema/labels.schema.json",
  "labels": [
    {
      "name": "🐛 Fix",               // required, 50 characters max
      "color": "dc3545",              // required, with or without #
      "description": "Bug fix",       // optional, 100 characters max
      "aliases": ["bug", "type: bug"] // optional, old names to rename
    }
  ],
  "exclude": ["me/old-repo"]          // optional, repositories never changed
}
```

- Names are compared without case, like GitHub does.
- The old format (a plain array of labels) still works.
- The config is checked before any API call, and all errors are shown at once.
- `config` also accepts an https URL, so several repositories can share the same file.

### Presets

Two sets of 29 labels are included. They contain aliases that convert the labels GitHub creates by default (`bug`, `enhancement`, `documentation`).

| Preset | `config` value |
|---|---|
| [`presets/emoji-en.json`](presets/emoji-en.json) | `https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-en.json` |
| [`presets/emoji-fr.json`](presets/emoji-fr.json) | `https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-fr.json` |

## Inputs and outputs

| Input | Default | Description |
|---|---|---|
| `token` | `${{ github.token }}` | Token used for the API. A PAT is needed for `scope: all` or `latest`. |
| `config` | `.github/labels.json` | Path in the repository, or https URL. |
| `scope` | `current` | `current`, `all` (every non-archived repository of `owner`) or `latest` (the most recently created). |
| `repositories` | | List of `owner/name` repositories, separated by commas or new lines. Replaces `scope`. |
| `owner` | token owner | User or organization to go through with `all` or `latest`. |
| `exclude` | | Repositories never changed, added to the config's `exclude`. |
| `skip-topic` | `no-labelsync` | Repositories with this topic are skipped. Leave empty to disable. |
| `include-forks` | `false` | Also sync forks. |
| `prune` | `false` | Delete labels that are not in the config. |
| `dry-run` | `false` | Show the changes without applying them. |
| `concurrency` | `4` | Number of repositories processed in parallel. |

| Output | Description |
|---|---|
| `repositories` | Number of repositories processed. |
| `changes` | Number of changes applied, or planned in dry run. |
| `failed` | Number of repositories that failed. The step fails if this is not 0. |
| `report` | Full report as JSON. |

## About `prune`

Deleting a label removes it from every issue and pull request that had it. That is why `prune` is off by default. Before turning it on, add the labels your tools create to your config, for example `dependencies` for Dependabot, otherwise they will be created and deleted again on every run.

## Upgrading from v1

v1 was a reusable workflow. v2 is a regular action, used in a step after `actions/checkout`.

| v1 | v2 |
|---|---|
| `uses: j-ned/labelsync-pro/.github/workflows/manage-labels.yml@master` | `uses: j-ned/labelsync-pro@v2` |
| `mode` | `scope` |
| `dry_run` | `dry-run` |
| `labels_path` | `config` |
| `exclude_path` and `exclude.json` | `exclude` input, or `exclude` key in the config |
| unknown labels were always deleted | `prune: true` keeps that behavior |
| forks were synced | `include-forks: true` keeps that behavior |

Your existing `labels.json` works without changes.

## Contributing

Issues and pull requests are welcome.

```bash
npm test            # run the tests
npm run validate    # check the presets
```

## License

[MIT](LICENSE)
