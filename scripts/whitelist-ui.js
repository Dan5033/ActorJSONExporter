// Whitelist UI for Actor JSON Exporter (Foundry v13+/v14 ApplicationV2)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

const MODULE_ID = "actor-exporter"

class WhitelistUI extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "actor-json-exporter-whitelist",
    tag: "form",
    window: {
      title: "Actor Export Whitelist",
    },
    position: {
      width: 500,
      height: "auto",
    },
    form: {
      handler: WhitelistUI.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      selectAll: WhitelistUI.#onSelectAll,
      selectNone: WhitelistUI.#onSelectNone,
      exportSelected: WhitelistUI.#onExportSelected,
    },
  }

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/whitelist.html`,
    },
  }

  async _prepareContext() {
    const useWhitelist = game.settings.get(MODULE_ID, "useWhitelist")
    const whitelistedIds = ActorExporter.getWhitelistedActors()

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

  static #onSelectAll() {
    this.element.querySelectorAll('input[name^="actor_"]').forEach((cb) => {
      cb.checked = true
    })
  }

  static #onSelectNone() {
    this.element.querySelectorAll('input[name^="actor_"]').forEach((cb) => {
      cb.checked = false
    })
  }

  static #onExportSelected() {
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
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object)

    // Update the "use whitelist" setting
    await game.settings.set(MODULE_ID, "useWhitelist", Boolean(data.useWhitelist))

    // Update the whitelist based on selected actors
    const selectedActors = []
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("actor_") && value) {
        selectedActors.push(key.replace("actor_", ""))
      }
    }

    await game.settings.set(MODULE_ID, "actorWhitelist", selectedActors.join(","))

    ui.notifications.info("Actor whitelist updated")

    // Re-render the form
    this.render()
  }
}

export { WhitelistUI }
