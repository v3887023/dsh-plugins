# AGENTS.md

This repository is a **standalone publishing repository** for DSH plugins.
It does not depend on any other checkout: each plugin under `packages/` is
developed here, installed from here, and released from here.

## Layout

| Path | Purpose |
|---|---|
| `packages/<name>/` | One DSH plugin per directory: `package.json`, `cordis.patch.yml`, `client.js`, `index.js`, `locale/`, `icon.svg` |
| `dsh-index.json` | The plugin index DSH reads (format 1) |
| `scripts/release.mjs` | Release one plugin (checks, version, tag, index update, release) |
| `scripts/build-index.mjs` | Rebuild the index from `packages/` (new packages, icons, titles) |

## Developing

Edit a package in place; local installs use this directory, so changes apply on
the next page refresh. Keep the bundle patch name equal to the package name
(`@v3887023/<dir>`) and keep dependencies free of `link:` / `file:` paths.

## Releasing

```bash
node scripts/release.mjs <package-dir> <version>
```

Steps: verify the package, bump the version, commit, tag (`<dir>@<version>`),
push, append the version to `dsh-index.json` with the new commit and
`publishTimestamp`, push the index, create a GitHub release.

`--dry-run` runs the checks only. `--sync-from <dir>` copies a package in from
another checkout first (only useful when a plugin still has a source elsewhere).

After adding a package directory, run `node scripts/build-index.mjs` so the index
lists it.

## Index rules

- `format` must be `1`.
- Every version needs `version` (exact SemVer), `publishTimestamp` (integer Unix
  seconds in `[0, 10^11)`), and `source` (`type: "git"`, lowercase 40-hex
  `commit`, optional `path`).
- `plugins[].name` must equal the installed package name.
- `title` is the directory name; `description` is a short localized sentence.

## Do not commit

Do not commit credentials, internal host names, drive-letter paths, or personal
baselines. `dsh-litellm-usage` and `dsh-deepseek-balance` read the key from the
credential store or the environment: their bundle config ships an empty
`baseUrl` / a generic credential name, and the error text tells the user how to
configure them.

## Consumers

```
https://cdn.jsdelivr.net/gh/v3887023/dsh-plugins@main/dsh-index.json
```

jsDelivr caches `@main` for a few minutes; pin a commit
(`@<commit>/dsh-index.json`) when an update must appear immediately.
