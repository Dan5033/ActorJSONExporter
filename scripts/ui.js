// UI components for the Actor Exporter

// Foundry globals
const Hooks = globalThis.Hooks
const ui = globalThis.ui
const ActorExporter = globalThis.ActorExporter
const game = globalThis.game

// In Foundry v13+/v14 actor sheets are ApplicationV2 instances. Header buttons
// are no longer injected with jQuery on `renderActorSheet`; instead we push
// control entries via the `getHeaderControlsActorSheetV2` hook.
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document
  if (!actor) return

  // Export this actor to JSON
  controls.push({
    action: "actorExportJson",
    icon: "fas fa-file-export",
    label: "Export to JSON",
    onClick: () => {
      ActorExporter.exportActor(actor, true) // Force notification
    },
  })

  // Toggle this actor in the export whitelist
  const isWhitelisted = ActorExporter.getWhitelistedActors().includes(actor.id)
  controls.push({
    action: "actorToggleWhitelist",
    icon: "fas fa-list",
    label: isWhitelisted ? "Remove from Export Whitelist" : "Add to Export Whitelist",
    onClick: () => {
      const currentlyWhitelisted = ActorExporter.getWhitelistedActors().includes(actor.id)
      if (currentlyWhitelisted) {
        ActorExporter.removeActorFromWhitelist(actor.id)
        ui.notifications.info(`Removed ${actor.name} from export whitelist`)
      } else {
        ActorExporter.addActorToWhitelist(actor.id)
        ui.notifications.info(`Added ${actor.name} to export whitelist`)
      }
      // Re-render so the control label reflects the new state
      app.render()
    },
  })
})
