# AGENTS.md

This repository is the **publishing mirror** of a DSH plugin collection.
Actual development happens in the workspace repository
`G:\Temp\ai\dsh-plugins\packages\<name>`; this repository only holds what the
Discover tab installs.

## Layout

| Path | Purpose |
|---|---|
| `packages/<name>/` | One DSH plugin per directory: `package.json`, `cordis.patch.yml`, `client.js`, `index.js`, `locale/`, `icon.svg` |
| `dsh-index.json` | The plugin index DSH reads (format 1) |
| `scripts/release.mjs` | Release script (sync, checks, version, tag, index update, release) |

## Releasing

```bash
cd G:\Temp\ai\dsh-plugins-publish
node scripts/release.mjs dsh-session-split 1.3.7 --sync-from G:\Temp\ai\dsh-plugins\packages\dsh-session-split
```

The script

1. copies the source package here (excluding `node_modules`) and re-scopes its
   name from `@local/...` to `@v3887023/...` (in `package.json` and `cordis.patch.yml`),
2. verifies the bundle patch name matches the package name and that no
   dependency points at a local path,
3. bumps the version, commits, tags (`<dir>@<version>`), pushes,
4. appends the version to `dsh-index.json` with the new commit and
   `publishTimestamp`, and pushes that,
5. creates a GitHub release.

`--dry-run` runs every check without writing anything. Never edit
`packages/*` here by hand for a release: the next `--sync-from` overwrites it.

## Index rules

- `format` must be `1`.
- Every version needs `version` (exact SemVer), `publishTimestamp` (integer Unix
  seconds in `[0, 10^11)`), and `source` (`type: "git"` with a lowercase 40-hex
  `commit` and an optional `path` to the package directory).
- `plugins[].name` must equal the installed package name
  (`@v3887023/<dir>`); `cordis.patch.yml` must use the same name.

## Do not publish

`dsh-deepseek-balance` and `dsh-litellm-usage` stay in the workspace repository:
they hard-code internal environment variable names and are useless outside it.
Check new packages for local paths (`link:`, `file:`, drive letters) and
internal identifiers before adding them here.

## Consumers

Colleagues add this index in DSH (Plugins → Discover → Add index):

```
https://cdn.jsdelivr.net/gh/v3887023/dsh-plugins@main/dsh-index.json
```

jsDelivr caches `@main` for a few minutes; pin a commit
(`@<commit>/dsh-index.json`) when an update must be visible immediately.
