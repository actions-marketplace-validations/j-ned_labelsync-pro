<div align="center">

# 🏷️ LabelSync Pro

**Un jeu de labels. Tous vos repos. Toujours synchronisés.**

Une GitHub Action et une CLI qui maintiennent les mêmes labels sur tous vos repositories —
avec des diffs minimaux, des renommages qui conservent les labels de vos issues, et un dry run avant toute modification.

[![CI](https://github.com/j-ned/labelsync-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/j-ned/labelsync-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Zéro dépendance](https://img.shields.io/badge/dépendances-0-brightgreen)

[Démarrage rapide](#-démarrage-rapide) · [Tous vos repos](#-synchroniser-tous-vos-repositories) · [CLI](#-depuis-votre-terminal) · [Configuration](#-configuration) · [🇬🇧 English](README.md)

<img src="screenshot/label_1.png" alt="Liste de labels d'un repository après LabelSync (preset français) : Revert, Refactor, A11y, CI/CD, Perf, Validation, Feature, Cache, API, Style, Animations" width="760">

</div>

## Pourquoi

Chaque nouveau repository démarre avec les neuf labels par défaut de GitHub. Après quelques projets, on se retrouve
avec `bug` ici, `🐛 Fix` là, `type: bug` ailleurs — et des filtres, des tableaux et des notes de version qui marchent
dans un repo et pas dans le suivant.

LabelSync Pro traite vos labels comme du code : décrivez-les une fois dans un fichier JSON, il aligne
**tous vos repositories** — le repo courant, tous ceux que vous possédez, ou une organisation entière.

## ✨ Points forts

- **Diffs minimaux** — compare d'abord, puis n'appelle l'API que pour ce qui a vraiment changé. Un repo déjà à jour coûte une requête.
- **Renommer sans perdre l'historique** — listez les anciens noms dans `aliases` : `bug` devient `🐛 Fix` *sur place*, chaque issue et PR le garde. Pas de suppression/recréation.
- **Sûr par défaut** — les labels absents de la config sont conservés tant que `prune` n'est pas activé. `dry-run` montre le plan exact avant.
- **Un repo ou des centaines** — `current`, `all` ou `latest` d'un utilisateur ou d'une organisation, en parallèle, avec reprise automatique sur les limites de débit.
- **Opt-out par repo** — topic `no-labelsync`, ou entrée dans `exclude`.
- **Rapports lisibles** — un résumé de job avec un tableau par repository et le diff de chaque changement.
- **Aussi une CLI** — prévisualisez ou appliquez la même config depuis votre terminal avec votre login `gh`.
- **Zéro dépendance, sans build** — du Node.js 24 natif, lisible en dix minutes.

## 🚀 Démarrage rapide

Synchroniser les labels du repository où tourne le workflow.

**1. Décrivez vos labels** dans `.github/labels.json` :

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

La ligne `$schema` active l'autocomplétion et la validation dans VS Code, WebStorm, etc.

**2. Ajoutez un workflow**, par exemple `.github/workflows/labels.yml` :

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

C'est tout : le `GITHUB_TOKEN` par défaut suffit pour le repository courant.

## 🌍 Synchroniser tous vos repositories

Gardez un repository « de pilotage » avec votre config et une planification. Il lui faut un token qui atteint vos autres repos :

1. Créez un [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) avec
   **Repository access : All repositories** et les permissions **Metadata : Read** + **Issues : Read and write**.
2. Enregistrez-le comme secret du repository, par exemple `LABELSYNC_TOKEN`.
3. Ajoutez le workflow :

```yaml
name: Sync labels everywhere
on:
  schedule:
    - cron: "0 6 * * *"          # chaque matin
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
          scope: all                # ou : latest — uniquement le plus récent
          # owner: mon-org          # une organisation plutôt que votre compte
          exclude: |
            moi/un-repo-a-ne-pas-toucher
```

Les repositories archivés, les forks (sauf `include-forks: true`), ceux où vous n'avez pas les droits d'écriture
et ceux portant le topic `no-labelsync` sont ignorés automatiquement.

> [!TIP]
> Lancez-le une première fois avec `dry-run: true` et lisez le résumé du job avant de le laisser écrire.

## 💻 Depuis votre terminal

Rien à installer — Node.js 22+ et `gh auth login` ou un `GITHUB_TOKEN` :

```bash
# Prévisualiser : rien n'est écrit sans --apply
npx github:j-ned/labelsync-pro --repo moi/mon-app \
  --config https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-fr.json

# Appliquer à tous vos repositories
npx github:j-ned/labelsync-pro --scope all --config .github/labels.json --apply

# Vérifier un fichier de config
npx github:j-ned/labelsync-pro validate .github/labels.json
```

`npx github:j-ned/labelsync-pro --help` liste toutes les options.

## 🧩 Configuration

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/j-ned/labelsync-pro/master/schema/labels.schema.json",
  "labels": [
    {
      "name": "🐛 Fix",              // requis, ≤ 50 caractères, comparé sans tenir compte de la casse
      "color": "dc3545",             // requis, hexa avec ou sans "#"
      "description": "Correctif",    // optionnel, ≤ 100 caractères
      "aliases": ["bug", "type: bug"] // optionnel, anciens noms à renommer sur place
    }
  ],
  "exclude": ["moi/vieux-repo"]       // optionnel, repositories jamais modifiés
}
```

- Un simple tableau de labels (format v1) reste accepté.
- La config est validée avant tout appel API, et tous les problèmes sont listés d'un coup
  (doublons, couleurs, longueurs, collisions entre noms et alias…).
- `config` peut aussi être une **URL https**, pour partager un preset entre plusieurs repos de pilotage.

### Presets

Deux jeux prêts à l'emploi de 29 labels emoji (feature, fix, hotfix, refactor, CI/CD, a11y, perf, sécurité, tests…),
avec des alias qui convertissent les labels par défaut de GitHub :

| Preset | Utilisation |
|---|---|
| [`presets/emoji-fr.json`](presets/emoji-fr.json) | `config: https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-fr.json` |
| [`presets/emoji-en.json`](presets/emoji-en.json) | `config: https://raw.githubusercontent.com/j-ned/labelsync-pro/master/presets/emoji-en.json` |

<img src="screenshot/label_2.png" alt="Suite du preset français : Mock, Build, Fix, Docs, Dependencies, Update, Debug, Security, Auth, UI/UX, Database, Release, Hotfix, Migration, Chore, State Management, Test, Cleanup" width="640">

## ⚙️ Entrées et sorties

| Entrée | Défaut | Description |
|---|---|---|
| `token` | `${{ github.token }}` | Token pour l'API. Un PAT pour `scope: all` / `latest`. |
| `config` | `.github/labels.json` | Chemin dans le workspace, ou URL https. |
| `scope` | `current` | `current`, `all` (tous les repos non archivés de `owner`) ou `latest` (le plus récent). |
| `repositories` | | Liste explicite `owner/name` (retours à la ligne ou virgules). Prioritaire sur `scope`. |
| `owner` | utilisateur du token | Utilisateur ou organisation listé par `all` / `latest`. |
| `exclude` | | Repositories jamais modifiés. S'ajoute au `exclude` de la config. |
| `skip-topic` | `no-labelsync` | Les repos avec ce topic sont ignorés. Vide pour désactiver. |
| `include-forks` | `false` | Synchroniser aussi les forks. |
| `prune` | `false` | Supprimer les labels absents de la config. |
| `dry-run` | `false` | Seulement afficher ce qui changerait. |
| `concurrency` | `4` | Repositories traités en parallèle. |

| Sortie | Description |
|---|---|
| `repositories` | Nombre de repositories traités. |
| `changes` | Opérations appliquées (ou prévues en dry run). |
| `failed` | Repositories en échec. Le step échoue si ce n'est pas `0`, après avoir tenté tous les repos. |
| `report` | Rapport JSON complet, pour vos propres étapes suivantes. |

## 🛡️ Ce qui le rend sûr

1. **Valider** la config — rien n'est envoyé si elle est invalide.
2. **Lire** les labels du repository puis **planifier** : correspondance par nom (sans casse), puis par alias.
3. **Appliquer** uniquement la différence — renommages et mises à jour, puis créations, puis suppressions (seulement avec `prune`).

> [!WARNING]
> Supprimer un label le retire de toutes les issues et PR qui l'avaient. C'est pour ça que `prune` est désactivé par défaut.
> Avant de l'activer, ajoutez à la config les labels que vos outils créent — `dependencies` de Dependabot par exemple, sinon il reviendra à chaque passage.

Un échec sur un repository (permission manquante, archivé entre-temps…) est signalé sans bloquer les autres.

## ⬆️ Passer de la v1 à la v2

La v1 était un workflow réutilisable (`.github/workflows/manage-labels.yml`). La v2 est une action classique :

| v1 | v2 |
|---|---|
| `uses: j-ned/labelsync-pro/.github/workflows/manage-labels.yml@master` | `uses: j-ned/labelsync-pro@v2` dans un step, après `actions/checkout` |
| `mode: all` / `latest` | `scope: all` / `latest` |
| `dry_run` | `dry-run` |
| `labels_path` | `config` |
| `exclude_path` + `exclude.json` | entrée `exclude`, ou `"exclude"` dans la config |
| Supprimait toujours les labels inconnus | `prune: true` pour garder ce comportement |
| Synchronisait les forks | `include-forks: true` pour garder ce comportement |

Votre tableau `labels.json` existant fonctionne tel quel.

## 🤝 Contribuer

Issues et pull requests bienvenues. Le code est en modules ES natifs typés en JSDoc, sans dépendance :

```bash
npm test            # node --test
npm run validate    # vérifie les presets
```

## 📄 Licence

[MIT](LICENSE) © j-ned
