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
   https://github.com/yourusername/actor-exporter/releases/latest/download/module.json
   ```
3. Click **Install**.

### Manual installation

1. Download the module ZIP and extract it into your Foundry `Data/modules/` directory.
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

## Notes on v14 compatibility

This release (2.0.0) was migrated to the modern Foundry application framework:

- The whitelist dialog uses **ApplicationV2** + **HandlebarsApplicationMixin** (the old `FormApplication` was removed in v14).
- File operations use the namespaced `foundry.applications.apps.FilePicker.implementation`, with a fallback to the legacy global `FilePicker` on v13.
- Actor-sheet buttons are added through the `getHeaderControlsActorSheetV2` hook instead of jQuery DOM injection.
