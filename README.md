# DSH plugins by v3887023

A small collection of DeepSeek Harness plugins.

## Install

Add this plugin index in DSH (Plugins → Discover → Add index):

```
https://cdn.jsdelivr.net/gh/v3887023/dsh-plugins@main/dsh-index.json
```

Then browse and install any plugin from the Discover tab.

## Plugins

| Package | Description |
|---|---|
| `@v3887023/dsh-session-split` | Split the main area into side-by-side live Session panes. |
| `@v3887023/dsh-desktop-notify` | Desktop notifications for Session completions. |
| `@v3887023/dsh-noir-skin` | Graphite + champagne theme. |
| `@v3887023/dsh-bold-color` | Colour the markdown bold text. |
| `@v3887023/dsh-session-date-groups` | Group the sidebar Session list by day. |
| `@v3887023/dsh-session-sort-lock` | Keep the sidebar order stable. |
| `@v3887023/dsh-workspace-drop` | Drop files into the workspace. |
| `@v3887023/dsh-session-reference` | Reference a Session into the current conversation. |

Each package lives under `packages/` and is installed from its own directory.

## Releasing an update

After changing a package under `packages/`, run:

``bash
node scripts/release.mjs <package-dir> <version>
``

It checks the package (name matches its bundle patch, no local path
dependencies), bumps the version, commits and tags it, pushes, then points
`dsh-index.json` at the new commit so DSH's Discover tab offers the update.
Add `--dry-run` to only run the checks.
