# Actor JSON Exporter

A Foundry VTT module that exports actor data as JSON for use by external tools. It can write actor data to a file in your Foundry data directory, automatically re-export whitelisted actors whenever they change, and serve actor data to other clients over Foundry's socket.

- **Compatibility:** Foundry VTT **v13–v14** (verified on v14)
- **Module ID:** `actor-exporter`

---

## Installation

### From a manifest URL

1. In Foundry, go to **Configuration & Setup → Add-on Modules → Install Module**.
2. Paste the manifest URL into the **Manifest URL** field:
   ```
   https://github.com/Dan5033/ActorJSONExporter/releases/latest/download/module.json
   ```
3. Click **Install**.

Because the manifest points at the **`latest` release**, Foundry will detect new versions automatically and show an **Update** button in **Manage Modules** whenever a new release is published.

### Manual installation

1. Download the latest `module.zip` from the [Releases page](https://github.com/Dan5033/ActorJSONExporter/releases/latest) and extract it into your Foundry `Data/modules/` directory.
2. Make sure the folder is named `actor-exporter` and contains `module.json`.
3. Restart Foundry.

After installing, open your world and enable **Actor JSON Exporter** in **Game Settings → Manage Modules**.

---

## Usage

### Per-actor controls (actor sheet header)

Every actor sheet gains two controls in its window header menu:

- **Export to JSON** — immediately exports that actor to the export file and shows a confirmation notification.
- **Add to / Remove from Export Whitelist** — toggles whether the actor is automatically re-exported whenever it changes. The label updates to reflect the current state.

> In Foundry v13+ these live in the sheet's header control menu (the actions are contributed via the `getHeaderControlsActorSheetV2` hook), not as inline icons on the title bar.

### The export whitelist

When the whitelist is enabled, any actor on the whitelist is automatically exported to the JSON file whenever it is updated (changes are batched to avoid excessive writes).

To manage the whitelist:

1. Open **Game Settings → Configure Settings → Actor JSON Exporter**.
2. Click **Open** next to **Actor Whitelist Configuration**.
3. In the dialog you can:
   - Toggle **Enable Actor Whitelist** on or off.
   - Check/uncheck individual actors, or use **Select All** / **Select None**.
   - Use **Export Selected Now** to immediately export the currently checked actors.
   - Click **Save Whitelist** to persist your changes.

---

## Settings

Found under **Game Settings → Configure Settings → Actor JSON Exporter**:

| Setting | Scope | Default | Description |
| --- | --- | --- | --- |
| **Export Directory Path** | World | `actor-exports` | Directory (relative to the Foundry data folder) where JSON files are written. Created automatically if missing. |
| **Enable Web Access** | World | `true` | Allows other clients to request actor data over the module's socket channel. |
| **Use Actor Whitelist** | World | `false` | When enabled, whitelisted actors are auto-exported on change. |
| **Actor Whitelist Configuration** | World | — | Menu button that opens the whitelist dialog. |

---

## Output

Actor data is written to:

```
<your Foundry data dir>/<Export Directory Path>/<export filename>
```

The file is JSON with the following shape:

```json
{
  "actors": {
    "<actorId>": { /* exported actor data */ }
  },
  "lastExportTime": {
    "<actorId>": 1718841600000
  }
}
```

---

## Accessing data from external tools

When **Enable Web Access** is on, the module listens on Foundry's socket channel `module.actor-exporter`. Other connected clients can request data by emitting a request with one of these actions:

- `getActorData` with `{ actorId }` — returns the exported data for a single actor.
- `getAllActors` — returns the full exported data object.

For tools that run outside Foundry, read the generated JSON file directly from the export directory.

---

## Project structure

```
actor-exporter/
├── module.json                          # Module manifest
├── scripts/
│   ├── file-helper.js                   # Version-safe FilePicker file I/O
│   ├── actor-exporter.js                # Core logic, settings, whitelist config app
│   └── ui.js                            # Actor-sheet header controls
├── templates/
│   └── actor-whitelist-config.hbs       # Whitelist configuration dialog
└── styles/
    └── actor-exporter.css               # Styles for the whitelist dialog
```

---

## Releasing updates (for maintainers)

### One-time setup: add the release workflow

A GitHub Actions workflow automates publishing, but it has to be committed directly on GitHub (the v0 integration is not permitted to push files under `.github/workflows/`). To add it:

1. In your repo on GitHub, click **Add file → Create new file**.
2. Name it `.github/workflows/release.yml`.
3. Paste in the contents below and commit it to `main`.

```yaml
name: Release Module

# Publishes a Foundry VTT module release whenever a version tag (e.g. v2.0.1) is pushed.
on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Derive the version from the tag (strip the leading "v").
      - name: Get version from tag
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"

      # Stamp the manifest with this version and pin the download to this exact release.
      - name: Update module.json
        env:
          VERSION: ${{ steps.version.outputs.version }}
          REPO_URL: https://github.com/${{ github.repository }}
        run: |
          jq \
            --arg version "$VERSION" \
            --arg url "$REPO_URL" \
            --arg manifest "$REPO_URL/releases/latest/download/module.json" \
            --arg download "$REPO_URL/releases/download/${GITHUB_REF_NAME}/module.zip" \
            '.version = $version | .url = $url | .manifest = $manifest | .download = $download' \
            module.json > module.json.tmp
          mv module.json.tmp module.json

      # Bundle only the files the module needs at runtime.
      - name: Create module.zip
        run: |
          zip -r module.zip \
            module.json \
            scripts/ \
            templates/ \
            styles/ \
            README.md

      # Attach module.json and module.zip to the GitHub release.
      - name: Publish release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            module.json
            module.zip
```

### Publishing a new version

Once the workflow exists:

1. Bump the `version` field in `module.json` (e.g. `2.0.0` → `2.0.1`) and commit it to `main`.
2. Create and push a matching version tag:
   ```
   git tag v2.0.1
   git push origin v2.0.1
   ```
3. The workflow then:
   - stamps `module.json` with the tag version and the correct `manifest`/`download` URLs,
   - bundles the runtime files into `module.zip`,
   - publishes a GitHub release with both `module.json` and `module.zip` attached.

Since the install manifest points at the `latest` release, every existing user is offered the update inside Foundry automatically — no manifest URL changes required.

---

## Notes on v14 compatibility

This release (2.0.0) was migrated to the modern Foundry application framework:

- The whitelist dialog uses **ApplicationV2** + **HandlebarsApplicationMixin** (the old `FormApplication` was removed in v14).
- File operations use the namespaced `foundry.applications.apps.FilePicker.implementation`, with a fallback to the legacy global `FilePicker` on v13.
- Actor-sheet buttons are added through the `getHeaderControlsActorSheetV2` hook instead of jQuery DOM injection.
