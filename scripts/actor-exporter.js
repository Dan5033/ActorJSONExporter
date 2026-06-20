// Actor JSON Exporter
class ActorExporter {
  static ID = "actor-exporter"
  static exportedData = {}
  static lastExportTime = {}
  static exportQueue = []
  static isExporting = false
  static exportTimer = null
  static exportDelay = 500 // Reduced from 2000ms to 500ms
  static isSilent = true // Always silent by default
  static disableExport = false // Flag to temporarily disable exports

  // Initialize the module
  static init() {
    console.log(`${this.ID} | Initializing Actor JSON Exporter`)

    // Register module settings
    this.registerSettings()

    // Set up hooks for actor updates
    this.registerHooks()

    // Create the export endpoint
    this.setupExportEndpoint()

    // Ensure export directory exists
    this.ensureExportDirectory(game.settings.get(this.ID, "exportPath"))

    // Load existing export data
    this.loadExportData()
  }

  // Register module settings
  static registerSettings() {
    game.settings.register(this.ID, "exportPath", {
      name: "Export Directory Path",
      hint: "Directory where JSON files will be saved (relative to Foundry VTT data directory)",
      scope: "world",
      config: true,
      type: String,
      default: "actor-exports",
      onChange: (value) => this.ensureExportDirectory(value),
    })

    game.settings.register(this.ID, "enableWebAccess", {
      name: "Enable Web Access",
      hint: "Allow accessing actor data via web API (requires server restart)",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    })

    // Add whitelist settings
    game.settings.register(this.ID, "useWhitelist", {
      name: "Use Actor Whitelist",
      hint: "Whitelisted actors will be automatically exported when changed",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
    })

    game.settings.register(this.ID, "actorWhitelist", {
      name: "Actor Whitelist",
      hint: "List of actor IDs to automatically export (comma-separated)",
      scope: "world",
      config: false, // We'll use our custom UI instead
      type: String,
      default: "",
    })

    // Add export mode setting
    game.settings.register(this.ID, "exportMode", {
      name: "Export Mode",
      hint: "Choose what data to export",
      scope: "world",
      config: true,
      type: String,
      choices: {
        basic: "Basic Info Only (Name, HP, AC, Abilities)",
        stats: "Stats & Attributes (Basic + Skills, Saves, etc.)",
        items: "Items & Equipment (Basic + Stats + Items)",
        full: "Full Character (Everything - may cause errors with large characters)",
      },
      default: "basic",
    })

    // Add export filename setting
    game.settings.register(this.ID, "exportFilename", {
      name: "Export Filename",
      hint: "Name of the file to export all actors to",
      scope: "world",
      config: true,
      type: String,
      default: "all-actors.json",
    })

    // Add auto-export interval setting
    game.settings.register(this.ID, "autoExportInterval", {
      name: "Auto-Export Interval (minutes)",
      hint: "How often to automatically export whitelisted actors (0 to disable)",
      scope: "world",
      config: true,
      type: Number,
      default: 5,
      range: {
        min: 0,
        max: 60,
        step: 1,
      },
    })

    // Add notification settings - hidden, always false
    game.settings.register(this.ID, "showNotifications", {
      name: "Show Notifications",
      hint: "Show notifications when actors are exported",
      scope: "world",
      config: false, // Hide this setting
      type: Boolean,
      default: false,
    })
  }

  // Register hooks to detect actor changes
  static registerHooks() {
    // Hook into actor creation
    Hooks.on("createActor", (actor) => {
      if (game.user.isGM) {
        this.handleActorChange(actor)
      }
    })

    // Hook into actor updates - IMPORTANT: This is where HP changes happen
    Hooks.on("updateActor", (actor, changes, options) => {
      if (game.user.isGM) {
        // Check if this is an HP update
        const isHpUpdate = changes.system?.attributes?.hp !== undefined

        // If it's an HP update, we want to avoid any delay
        if (isHpUpdate) {
          // Don't queue the export, just update our in-memory data
          // This ensures HP updates are immediate
          this.updateExportedActorData(actor)

          // Queue a delayed save to file to avoid UI lag
          this.queueFileSave()
        } else {
          // For non-HP updates, use the normal queue system
          this.handleActorChange(actor)
        }
      }
    })

    // Hook into actor deletion
    Hooks.on("deleteActor", (actor) => {
      if (game.user.isGM) {
        this.removeExportedActor(actor.id)
      }
    })

    // Hook into updates to actor items (equipment, spells, etc.)
    Hooks.on("updateItem", (item, changes, options) => {
      if (game.user.isGM && item.parent?.documentName === "Actor") {
        this.handleActorChange(item.parent)
      }
    })

    // Hook into updates to actor effects
    Hooks.on("updateActiveEffect", (effect, changes, options) => {
      if (game.user.isGM && effect.parent?.documentName === "Actor") {
        this.handleActorChange(effect.parent)
      }
    })

    // Set up auto-export timer
    Hooks.on("ready", () => {
      const interval = game.settings.get(this.ID, "autoExportInterval")
      if (interval > 0 && game.user.isGM) {
        console.log(`${this.ID} | Setting up auto-export every ${interval} minutes`)
        setInterval(() => this.autoExportWhitelisted(), interval * 60 * 1000)
      }
    })
  }

  // Update exported actor data immediately (for HP updates)
  static updateExportedActorData(actor) {
    // Skip if actor is temporary
    if (actor.isTemporary) return

    // Check if this is a whitelisted actor
    const useWhitelist = game.settings.get(this.ID, "useWhitelist")
    const whitelist = this.getWhitelistedActors()
    const isWhitelisted = whitelist.includes(actor.id)

    // If using whitelist and actor is not whitelisted, skip
    if (useWhitelist && !isWhitelisted) return

    // Prepare the actor data
    const exportData = this.prepareActorData(actor)

    // Store in memory
    this.exportedData[actor.id] = exportData
    this.lastExportTime[actor.id] = Date.now()

    console.log(`${this.ID} | Updated actor data for: ${actor.name}`)
  }

  // Queue a file save without affecting the UI
  static queueFileSave() {
    // Clear existing timer
    if (this.exportTimer) {
      clearTimeout(this.exportTimer)
    }

    // Set a new timer to save the file after a delay
    this.exportTimer = setTimeout(() => {
      // Only save if we're not already exporting
      if (!this.isExporting) {
        this.saveExportFileQuietly()
      }
    }, this.exportDelay)
  }

  // Save the export file without any UI impact
  static async saveExportFileQuietly() {
    try {
      this.isExporting = true

      const exportPath = game.settings.get(this.ID, "exportPath")
      const filename = game.settings.get(this.ID, "exportFilename")
      const filePath = `${exportPath}/${filename}`

      // Create the combined data object
      const combinedData = {
        exportTime: Date.now(),
        foundryVersion: game.version,
        systemId: game.system.id,
        systemVersion: game.system.version,
        actors: this.exportedData,
        lastExportTime: this.lastExportTime,
      }

      const jsonData = JSON.stringify(combinedData, null, 2)

      // Use the reliable method to write the file
      await this.writeFileSilently(filePath, jsonData)

      console.log(`${this.ID} | Saved export file silently: ${filePath}`)
    } catch (error) {
      console.error(`${this.ID} | Error saving export file:`, error)
    } finally {
      this.isExporting = false
    }
  }

  // Write a file silently without triggering notifications
  static async writeFileSilently(path, data) {
    try {
      // Extract the directory path from the full file path
      const lastSlashIndex = path.lastIndexOf("/")
      const dirPath = lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : ""
      const filename = lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path

      // Ensure the directory exists
      if (dirPath) {
        await window.FileHelper.createDirectoryIfMissing(dirPath)
      }

      // Create a file object
      const file = new File([data], filename, { type: "application/json" })

      // Upload via the version-safe FilePicker implementation (v14: namespaced).
      const FP = foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker
      await FP.upload("data", dirPath, file, { notify: false })

      // Double-check that the file was written
      const exists = await window.FileHelper.fileExists(path)
      if (!exists) {
        console.error(`${this.ID} | File was not written: ${path}`)
        throw new Error("File was not written")
      }

      return true
    } catch (error) {
      console.error(`${this.ID} | Error writing file silently:`, error)

      // Fallback method if the first one fails
      try {
        console.log(`${this.ID} | Trying fallback file writing method...`)

        // Use the direct API method
        const response = await fetch("/upload", {
          method: "POST",
          body: (() => {
            const formData = new FormData()
            formData.append("file", new Blob([data], { type: "application/json" }), path)
            formData.append("path", `data/${path}`)
            return formData
          })(),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return true
      } catch (fallbackError) {
        console.error(`${this.ID} | Fallback file writing method failed:`, fallbackError)
        throw error // Throw the original error
      }
    }
  }

  // Handle actor changes (creation or updates)
  static handleActorChange(actor) {
    // Skip if actor is temporary
    if (actor.isTemporary) return

    // Check if this is a whitelisted actor
    const useWhitelist = game.settings.get(this.ID, "useWhitelist")
    const whitelist = this.getWhitelistedActors()
    const isWhitelisted = whitelist.includes(actor.id)

    // If using whitelist and actor is whitelisted, or not using whitelist
    if ((useWhitelist && isWhitelisted) || !useWhitelist) {
      this.queueActorExport(actor)
    }
  }

  // Queue an actor for export
  static queueActorExport(actor) {
    // Add to queue if not already there
    if (!this.exportQueue.some((a) => a.id === actor.id)) {
      this.exportQueue.push(actor)
    }

    // Clear existing timer
    if (this.exportTimer) {
      clearTimeout(this.exportTimer)
    }

    // Set a new timer to process the queue after a delay
    this.exportTimer = setTimeout(() => this.processExportQueue(), this.exportDelay)
  }

  // Process the export queue
  static async processExportQueue() {
    // If already exporting, return
    if (this.isExporting) return

    // If queue is empty, return
    if (this.exportQueue.length === 0) return

    // Set exporting flag
    this.isExporting = true

    try {
      // Get a copy of the queue and clear it
      const actorsToExport = [...this.exportQueue]
      this.exportQueue = []

      // Export each actor
      for (const actor of actorsToExport) {
        await this.exportActorData(actor)
      }

      // Save the combined export file - silently
      await this.saveExportFileQuietly()
    } catch (error) {
      console.error(`${this.ID} | Error processing export queue:`, error)
    } finally {
      // Clear exporting flag
      this.isExporting = false

      // If more actors were added to the queue while processing, process them too
      if (this.exportQueue.length > 0) {
        this.exportTimer = setTimeout(() => this.processExportQueue(), 100)
      }
    }
  }

  // Auto-export all whitelisted actors
  static async autoExportWhitelisted() {
    const useWhitelist = game.settings.get(this.ID, "useWhitelist")
    if (!useWhitelist) return

    const whitelist = this.getWhitelistedActors()
    if (whitelist.length === 0) return

    console.log(`${this.ID} | Auto-exporting ${whitelist.length} whitelisted actors`)

    let exportCount = 0
    for (const actorId of whitelist) {
      const actor = game.actors.get(actorId)
      if (actor) {
        await this.exportActorData(actor)
        exportCount++
      }
    }

    // Save the combined export file - silently
    await this.saveExportFileQuietly()

    console.log(`${this.ID} | Auto-exported ${exportCount} whitelisted actors`)
  }

  // Set up the web API endpoint for accessing actor data
  static setupExportEndpoint() {
    if (game.settings.get(this.ID, "enableWebAccess")) {
      // Register a socket listener for external requests
      game.socket.on(`module.${this.ID}`, (request) => {
        if (request.action === "getActorData") {
          return this.exportedData[request.actorId] || null
        } else if (request.action === "getAllActors") {
          return this.exportedData
        }
      })
    }
  }

  // Load existing export data from file
  static async loadExportData() {
    try {
      const exportPath = game.settings.get(this.ID, "exportPath")
      const filename = game.settings.get(this.ID, "exportFilename")
      const filePath = `${exportPath}/${filename}`

      // Check if the file exists
      const exists = await window.FileHelper.fileExists(filePath)
      if (!exists) {
        console.log(`${this.ID} | No existing export file found at ${filePath}`)
        return
      }

      // Load the file
      const data = await window.FileHelper.readFromFile(filePath)
      if (data) {
        try {
          const jsonData = JSON.parse(data)
          this.exportedData = jsonData.actors || {}
          this.lastExportTime = jsonData.lastExportTime || {}
          console.log(`${this.ID} | Loaded export data for ${Object.keys(this.exportedData).length} actors`)
        } catch (e) {
          console.error(`${this.ID} | Error parsing export file:`, e)
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error loading export data:`, error)
    }
  }

  // Export actor data to memory (called by queueActorExport)
  static async exportActorData(actor) {
    // Skip if actor is temporary
    if (actor.isTemporary) return

    // Prepare the actor data
    const exportData = this.prepareActorData(actor)

    // Store in memory
    this.exportedData[actor.id] = exportData
    this.lastExportTime[actor.id] = Date.now()

    console.log(`${this.ID} | Exported actor data for: ${actor.name}`)
  }

  // Export actor data and save to file (called by UI actions)
  static async exportActor(actor, showNotification = false) {
    // Skip if actor is temporary
    if (actor.isTemporary) return

    // Export the actor data
    await this.exportActorData(actor)

    // Write to file system if server-side
    if (game.user.isGM) {
      try {
        await this.saveExportFileQuietly()
        if (showNotification) {
          ui.notifications.info(`Exported actor: ${actor.name}`)
        }
      } catch (error) {
        console.error(`${this.ID} | Error exporting actor:`, error)
        if (showNotification) {
          ui.notifications.error(`Failed to export actor: ${error.message}`)
        }
      }
    }

    // Notify clients that data has been updated
    game.socket.emit(`module.${this.ID}`, {
      action: "actorUpdated",
      actorId: actor.id,
    })
  }

  // Save all exported data to a single file
  static async saveExportFile(silent = false) {
    try {
      const exportPath = game.settings.get(this.ID, "exportPath")
      const filename = game.settings.get(this.ID, "exportFilename")
      const filePath = `${exportPath}/${filename}`

      // Create the combined data object
      const combinedData = {
        exportTime: Date.now(),
        foundryVersion: game.version,
        systemId: game.system.id,
        systemVersion: game.system.version,
        actors: this.exportedData,
        lastExportTime: this.lastExportTime,
      }

      const jsonData = JSON.stringify(combinedData, null, 2)

      // Use our special method to write without notifications
      await this.writeFileSilently(filePath, jsonData)

      if (!silent) {
        console.log(`${this.ID} | Saved combined export to ${filePath}`)
      }
      return true
    } catch (error) {
      console.error(`${this.ID} | Error saving export file:`, error)
      throw error
    }
  }

  // Get the list of whitelisted actor IDs
  static getWhitelistedActors() {
    const whitelist = game.settings.get(this.ID, "actorWhitelist") || ""
    return whitelist
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id)
  }

  // Add an actor to the whitelist
  static addActorToWhitelist(actorId) {
    const whitelist = this.getWhitelistedActors()
    if (!whitelist.includes(actorId)) {
      whitelist.push(actorId)
      game.settings.set(this.ID, "actorWhitelist", whitelist.join(","))
      return true
    }
    return false
  }

  // Remove an actor from the whitelist
  static removeActorFromWhitelist(actorId) {
    const whitelist = this.getWhitelistedActors()
    const index = whitelist.indexOf(actorId)
    if (index !== -1) {
      whitelist.splice(index, 1)
      game.settings.set(this.ID, "actorWhitelist", whitelist.join(","))
      return true
    }
    return false
  }

  // Prepare actor data for export based on export mode
  static prepareActorData(actor) {
    // Get the export mode from settings
    const exportMode = game.settings.get(this.ID, "exportMode")

    // Basic info that's always included
    const basicData = {
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img,
      exportTime: Date.now(),
    }

    // Add system-specific data based on the game system
    const systemData = this.getSystemSpecificData(actor, exportMode)

    // Combine the data
    return {
      ...basicData,
      ...systemData,
    }
  }

  // Get system-specific data based on the game system
  static getSystemSpecificData(actor, exportMode) {
    // Detect the game system
    const system = game.system.id

    // DnD 5e
    if (system === "dnd5e") {
      return this.getDnD5eData(actor, exportMode)
    }
    // Pathfinder 2e
    else if (system === "pf2e") {
      return this.getPathfinder2eData(actor, exportMode)
    }
    // Pathfinder 1e
    else if (system === "pf1") {
      return this.getPathfinder1eData(actor, exportMode)
    }
    // Call of Cthulhu
    else if (system === "coc7" || system === "coc") {
      return this.getCallOfCthulhuData(actor, exportMode)
    }
    // Fallback for other systems - try to extract common data
    else {
      return this.getGenericActorData(actor, exportMode)
    }
  }

  // Extract data for DnD 5e system
  static getDnD5eData(actor, exportMode) {
    // Start with basic stats
    const data = {
      stats: {
        hp: {
          value: actor.system.attributes.hp.value,
          max: actor.system.attributes.hp.max,
          temp: actor.system.attributes.hp.temp,
        },
        ac: actor.system.attributes.ac.value,
        abilities: {},
      },
    }

    // Add abilities - handle both old and new data structures
    for (const [key, ability] of Object.entries(actor.system.abilities)) {
      // Basic ability data
      const abilityData = {
        value: ability.value,
        mod: ability.mod,
        proficient: ability.proficient,
      }

      // Handle save data with compatibility for both old and new formats
      if (ability.save && typeof ability.save === "object" && ability.save.value !== undefined) {
        // New format (v4.3+)
        abilityData.save = ability.save.value
      } else if (ability.save !== undefined) {
        // Old format (pre v4.3)
        abilityData.save = ability.save
      }

      data.stats.abilities[key] = abilityData
    }

    // If we want more than just basic info
    if (exportMode !== "basic") {
      // Add skills
      data.stats.skills = {}
      for (const [key, skill] of Object.entries(actor.system.skills)) {
        data.stats.skills[key] = {
          value: skill.value,
          ability: skill.ability,
          // Handle both old and new formats for skill totals
          total: skill.total !== undefined ? skill.total : skill.mod,
          prof: skill.prof,
        }
      }

      // Add more character stats
      data.stats.details = {
        level: actor.system.details.level,
        xp: actor.system.details.xp,
        cr: actor.system.details.cr,
        race: actor.system.details.race,
        background: actor.system.details.background,
        alignment: actor.system.details.alignment,
        proficiency: actor.system.attributes.prof,
      }

      // Add resources
      data.stats.resources = actor.system.resources
    }

    // If we want items too
    if (exportMode === "items" || exportMode === "full") {
      data.items = []

      // Add a simplified version of each item
      for (const item of actor.items) {
        data.items.push({
          id: item.id,
          name: item.name,
          type: item.type,
          img: item.img,
          system: this.simplifyItemData(item.system, item.type),
        })
      }
    }

    return data
  }

  // Simplify item data to reduce size
  static simplifyItemData(itemSystem, itemType) {
    // For weapons
    if (itemType === "weapon") {
      return {
        damage: itemSystem.damage,
        attackBonus: itemSystem.attackBonus,
        equipped: itemSystem.equipped,
        proficient: itemSystem.proficient,
        weight: itemSystem.weight,
        quantity: itemSystem.quantity,
      }
    }
    // For armor
    else if (itemType === "equipment" || itemType === "armor") {
      return {
        armor: itemSystem.armor,
        equipped: itemSystem.equipped,
        weight: itemSystem.weight,
        quantity: itemSystem.quantity,
      }
    }
    // For spells
    else if (itemType === "spell") {
      return {
        level: itemSystem.level,
        school: itemSystem.school,
        components: itemSystem.components,
        preparation: itemSystem.preparation,
        description: itemSystem.description?.value?.substring(0, 100) + "...",
      }
    }
    // For other items, just return basic info
    else {
      return {
        description: itemSystem.description?.value?.substring(0, 100) + "...",
        weight: itemSystem.weight,
        quantity: itemSystem.quantity,
      }
    }
  }

  // Extract data for Pathfinder 2e system
  static getPathfinder2eData(actor, exportMode) {
    // Basic implementation for PF2e
    const data = {
      stats: {
        hp: {
          value: actor.system.attributes?.hp?.value || 0,
          max: actor.system.attributes?.hp?.max || 0,
          temp: actor.system.attributes?.hp?.temp || 0,
        },
        ac: actor.system.attributes?.ac?.value || 0,
        abilities: {},
      },
    }

    // Add abilities if they exist
    if (actor.system.abilities) {
      for (const [key, ability] of Object.entries(actor.system.abilities)) {
        data.stats.abilities[key] = {
          value: ability.value || 0,
          mod: ability.mod || 0,
        }
      }
    }

    return data
  }

  // Extract data for Pathfinder 1e system
  static getPathfinder1eData(actor, exportMode) {
    // Basic implementation for PF1
    const data = {
      stats: {
        hp: {
          value: actor.system.attributes?.hp?.value || 0,
          max: actor.system.attributes?.hp?.max || 0,
          temp: actor.system.attributes?.hp?.temp || 0,
        },
        ac: actor.system.attributes?.ac?.normal?.total || 0,
        abilities: {},
      },
    }

    // Add abilities if they exist
    if (actor.system.abilities) {
      for (const [key, ability] of Object.entries(actor.system.abilities)) {
        data.stats.abilities[key] = {
          value: ability.value || 0,
          mod: ability.mod || 0,
        }
      }
    }

    return data
  }

  // Extract data for Call of Cthulhu system
  static getCallOfCthulhuData(actor, exportMode) {
    // Basic implementation for CoC
    const data = {
      stats: {
        hp: {
          value: actor.system.attributes?.hp?.value || 0,
          max: actor.system.attributes?.hp?.max || 0,
        },
        sanity: {
          value: actor.system.attributes?.san?.value || 0,
          max: actor.system.attributes?.san?.max || 0,
        },
        characteristics: {},
      },
    }

    // Add characteristics if they exist
    if (actor.system.characteristics) {
      for (const [key, characteristic] of Object.entries(actor.system.characteristics)) {
        data.stats.characteristics[key] = {
          value: characteristic.value || 0,
        }
      }
    }

    return data
  }

  // Generic actor data extraction for unknown systems
  static getGenericActorData(actor, exportMode) {
    // Try to find common attributes in the actor data
    const data = {
      stats: {},
    }

    // Try to find HP
    if (actor.system.attributes?.hp) {
      data.stats.hp = {
        value: actor.system.attributes.hp.value || 0,
        max: actor.system.attributes.hp.max || 0,
      }
    }

    // Try to find AC
    if (actor.system.attributes?.ac) {
      data.stats.ac = actor.system.attributes.ac.value || actor.system.attributes.ac || 0
    }

    // Try to find abilities
    if (actor.system.abilities) {
      data.stats.abilities = {}
      for (const [key, ability] of Object.entries(actor.system.abilities)) {
        data.stats.abilities[key] = {
          value: ability.value || 0,
          mod: ability.mod || 0,
        }
      }
    }

    return data
  }

  // Ensure the export directory exists
  static async ensureExportDirectory(path) {
    try {
      await window.FileHelper.createDirectoryIfMissing(path)
      console.log(`${this.ID} | Export directory ensured: ${path}`)
      return true
    } catch (error) {
      console.error(`${this.ID} | Error ensuring export directory:`, error)
      return false
    }
  }

  // Remove an actor from the exported data
  static removeExportedActor(actorId) {
    delete this.exportedData[actorId]
    delete this.lastExportTime[actorId]

    // Update the export file
    if (game.user.isGM) {
      try {
        this.saveExportFileQuietly()
      } catch (error) {
        console.error(`${this.ID} | Error updating export file after actor removal:`, error)
      }
    }

    // Notify clients that data has been removed
    game.socket.emit(`module.${this.ID}`, {
      action: "actorRemoved",
      actorId: actorId,
    })
  }

  // Export all actors
  static async exportAllActors(showNotification = false) {
    let exportCount = 0

    for (const actor of game.actors.contents) {
      if (!actor.isTemporary) {
        await this.exportActorData(actor)
        exportCount++
      }
    }

    // Save the combined export file
    await this.saveExportFileQuietly()

    if (showNotification) {
      ui.notifications.info(`Exported ${exportCount} actors to JSON`)
    }
    return exportCount
  }

  // Export whitelisted actors
  static async exportWhitelistedActors(showNotification = false) {
    const whitelist = this.getWhitelistedActors()
    let exportCount = 0

    for (const actorId of whitelist) {
      const actor = game.actors.get(actorId)
      if (actor && !actor.isTemporary) {
        await this.exportActorData(actor)
        exportCount++
      }
    }

    // Save the combined export file
    await this.saveExportFileQuietly()

    if (showNotification) {
      ui.notifications.info(`Exported ${exportCount} whitelisted actors to JSON`)
    }
    return exportCount
  }
}

// Initialize the module when Foundry is ready
Hooks.once("init", () => {
  ActorExporter.init()

  // Register the whitelist menu
  game.settings.registerMenu(ActorExporter.ID, "whitelistMenu", {
    name: "Actor Whitelist",
    label: "Manage Actor Whitelist",
    hint: "Configure which actors should be automatically exported",
    icon: "fas fa-list",
    type: ActorWhitelistConfig,
    restricted: true,
  })
})

// Define the whitelist configuration application (Foundry v13+/v14 ApplicationV2)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

class ActorWhitelistConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "actor-whitelist-config",
    tag: "form",
    window: {
      title: "Actor Whitelist Configuration",
      contentClasses: ["actor-whitelist-config"],
    },
    position: {
      width: 500,
      height: "auto",
    },
    form: {
      handler: ActorWhitelistConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      selectAll: ActorWhitelistConfig.#onSelectAll,
      selectNone: ActorWhitelistConfig.#onSelectNone,
      exportSelected: ActorWhitelistConfig.#onExportSelected,
    },
  }

  static PARTS = {
    form: {
      template: "modules/actor-exporter/templates/actor-whitelist-config.hbs",
    },
  }

  async _prepareContext() {
    // Get all actors
    const actors = game.actors.contents.map((actor) => {
      return {
        id: actor.id,
        name: actor.name,
        isWhitelisted: ActorExporter.getWhitelistedActors().includes(actor.id),
      }
    })

    return {
      useWhitelist: game.settings.get(ActorExporter.ID, "useWhitelist"),
      actors: actors,
    }
  }

  // Select every actor checkbox
  static #onSelectAll() {
    this.element.querySelectorAll('input[name^="actor_"]').forEach((cb) => {
      cb.checked = true
    })
  }

  // Deselect every actor checkbox
  static #onSelectNone() {
    this.element.querySelectorAll('input[name^="actor_"]').forEach((cb) => {
      cb.checked = false
    })
  }

  // Export currently checked actors immediately
  static #onExportSelected() {
    const selectedActors = []
    this.element.querySelectorAll('input[name^="actor_"]:checked').forEach((cb) => {
      selectedActors.push(cb.name.replace("actor_", ""))
    })

    let exportCount = 0
    for (const actorId of selectedActors) {
      const actor = game.actors.get(actorId)
      if (actor) {
        ActorExporter.exportActor(actor, false) // No notification
        exportCount++
      }
    }

    ui.notifications.info(`Exported ${exportCount} actors to JSON`)
  }

  // Form submission handler (bound to the application instance)
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object)

    // Update the use whitelist setting
    await game.settings.set(ActorExporter.ID, "useWhitelist", Boolean(data.useWhitelist))

    // Update the whitelist based on selected actors
    const selectedActors = []
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("actor_") && value) {
        selectedActors.push(key.replace("actor_", ""))
      }
    }

    await game.settings.set(ActorExporter.ID, "actorWhitelist", selectedActors.join(","))

    ui.notifications.info("Actor whitelist updated")

    // Re-render to reflect the saved state
    this.render()
  }
}

// Make ActorExporter available globally
window.ActorExporter = ActorExporter
