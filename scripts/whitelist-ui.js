// Whitelist UI for Actor JSON Exporter
class WhitelistUI extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "actor-json-exporter-whitelist",
      title: "Actor Export Whitelist",
      template: `modules/actor-json-exporter/templates/whitelist.html`,
      width: 500,
      height: "auto",
      closeOnSubmit: false,
    })
  }

  getData() {
    // Get current whitelist settings
    const useWhitelist = game.settings.get("actor-json-exporter", "useWhitelist")
    const whitelistedIds = ActorExporter.getWhitelistedActors()

    // Get all actors for the dropdown
    const actors = game.actors.contents.map((a) => {
      return {
        id: a.id,
        name: a.name,
        isWhitelisted: whitelistedIds.includes(a.id),
      }
    })

    return {
      useWhitelist,
      actors,
      whitelistedIds,
    }
  }

  async _updateObject(event, formData) {
    // Update the "use whitelist" setting
    await game.settings.set("actor-json-exporter", "useWhitelist", formData.useWhitelist)

    // Update the whitelist based on selected actors
    const selectedActors = []
    for (const [key, value] of Object.entries(formData)) {
      if (key.startsWith("actor_") && value) {
        selectedActors.push(key.replace("actor_", ""))
      }
    }

    await game.settings.set("actor-json-exporter", "actorWhitelist", selectedActors.join(","))

    // Re-render the form
    this.render(true)

    // Notify the user
    ui.notifications.info("Actor whitelist updated")
  }

  activateListeners(html) {
    super.activateListeners(html)

    // Add select all/none buttons
    html.find(".select-all").click(() => {
      html.find('input[name^="actor_"]').prop("checked", true)
    })

    html.find(".select-none").click(() => {
      html.find('input[name^="actor_"]').prop("checked", false)
    })

    // Add export selected button
    html.find(".export-selected").click(() => {
      const selectedIds = ActorExporter.getWhitelistedActors()
      let exportCount = 0

      for (const id of selectedIds) {
        const actor = game.actors.get(id)
        if (actor) {
          ActorExporter.exportActor(actor)
          exportCount++
        }
      }

      ui.notifications.info(`Exported ${exportCount} whitelisted actors to JSON`)
    })
  }
}

export { WhitelistUI }
