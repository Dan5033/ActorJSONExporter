// UI components for the Actor Exporter

// Declare variables that are used in the code
const $ = jQuery // Assuming jQuery is available in the Foundry environment
const Hooks = globalThis.Hooks
const ui = globalThis.ui
const ActorExporter = globalThis.ActorExporter
const ActorWhitelistConfig = globalThis.ActorWhitelistConfig
const game = globalThis.game

// We're removing all the actor directory buttons as requested
// Only keeping the actor sheet buttons for individual exports

// Add buttons to actor sheets
Hooks.on("renderActorSheet", (app, html) => {
  const actorId = app.actor.id

  // Add export button
  const exportButton = $(`
    <a class="actor-export-single">
      <i class="fas fa-file-export"></i>
    </a>
  `)

  html.find(".window-header .window-title").after(exportButton)

  exportButton.click(() => {
    ActorExporter.exportActor(app.actor, true) // Force notification
    ui.notifications.info(`Exported ${app.actor.name} to JSON`)
  })

  // Add whitelist toggle button
  const isWhitelisted = ActorExporter.getWhitelistedActors().includes(actorId)
  const whitelistButton = $(`
    <a class="actor-whitelist-toggle ${isWhitelisted ? "active" : ""}">
      <i class="fas fa-list"></i>
    </a>
  `)

  html.find(".window-header .window-title").after(whitelistButton)

  whitelistButton.click(() => {
    const isCurrentlyWhitelisted = ActorExporter.getWhitelistedActors().includes(actorId)

    if (isCurrentlyWhitelisted) {
      ActorExporter.removeActorFromWhitelist(actorId)
      whitelistButton.removeClass("active")
      ui.notifications.info(`Removed ${app.actor.name} from export whitelist`)
    } else {
      ActorExporter.addActorToWhitelist(actorId)
      whitelistButton.addClass("active")
      ui.notifications.info(`Added ${app.actor.name} to export whitelist`)
    }
  })
})
