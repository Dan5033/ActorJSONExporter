// File Helper class for Actor Exporter
class FileHelper {
  // Resolve the FilePicker implementation in a version-safe way.
  // In Foundry v14 the global `FilePicker` was removed and must be
  // accessed via the namespaced application class. v13 still exposes
  // the global, so we fall back to it for backwards compatibility.
  static get FilePicker() {
    return foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker
  }

  // Check if a directory exists
  static async directoryExists(path) {
    try {
      // Use FilePicker to check if directory exists
      await this.FilePicker.browse("data", path)
      return true
    } catch (error) {
      // If we get an error, the directory doesn't exist
      console.log(`Directory does not exist: ${path}`)
      return false
    }
  }

  // Check if a file exists
  static async fileExists(path) {
    try {
      // Extract the directory path and filename
      const lastSlashIndex = path.lastIndexOf("/")
      const dirPath = lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : ""
      const filename = lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path

      // Browse the directory
      const browseResult = await this.FilePicker.browse("data", dirPath)

      // Check if the file exists in the directory
      return browseResult.files.some((file) => file.endsWith(filename))
    } catch (error) {
      // Silently handle the error - file doesn't exist
      return false
    }
  }

  // Create a directory if it doesn't exist
  static async createDirectoryIfMissing(path) {
    try {
      const exists = await this.directoryExists(path)
      if (!exists) {
        await this.FilePicker.createDirectory("data", path, {})
        console.log(`Created directory: ${path}`)
      } else {
        console.log(`Directory already exists: ${path}`)
      }
      return true
    } catch (error) {
      // Don't throw the error if it's just that the directory already exists
      if (error.message && error.message.includes("EEXIST")) {
        console.log(`Directory already exists (from error): ${path}`)
        return true
      }
      console.error(`Failed to create directory ${path}:`, error)
      throw error
    }
  }

  // Write data to a file using proper Foundry methods
  static async writeToFile(path, data) {
    try {
      // Extract the directory path from the full file path
      const lastSlashIndex = path.lastIndexOf("/")
      const dirPath = lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : ""
      const filename = lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path

      // Ensure the directory exists
      if (dirPath) {
        await this.createDirectoryIfMissing(dirPath)
      }

      // Create a file object
      const file = new File([data], filename, { type: "application/json" })

      // Upload via the (namespaced) FilePicker implementation
      await this.FilePicker.upload("data", dirPath, file, { notify: false })

      console.log(`Successfully wrote file: ${path}`)
      return true
    } catch (error) {
      console.error(`Failed to write to file ${path}:`, error)
      throw error
    }
  }

  // Read data from a file
  static async readFromFile(path) {
    try {
      // First check if the file exists
      const exists = await this.fileExists(path)
      if (!exists) {
        console.log(`File does not exist: ${path}`)
        return null
      }

      // Construct the full URL to the file
      const response = await fetch(`/data/${path}`)

      if (!response.ok) {
        console.log(`HTTP error when reading file ${path}: ${response.status}`)
        return null
      }

      const text = await response.text()
      return text
    } catch (error) {
      // Silently handle the error - just return null
      console.log(`Error reading file ${path}: ${error.message}`)
      return null
    }
  }

  // Delete a file
  static async deleteFile(path) {
    try {
      // Check if file exists first
      const exists = await this.fileExists(path)
      if (!exists) {
        console.log(`File does not exist, cannot delete: ${path}`)
        return true
      }

      // Some deployments restrict file deletion; guard for missing method
      if (typeof this.FilePicker.deleteFile === "function") {
        await this.FilePicker.deleteFile("data", path)
      } else {
        console.warn(`FilePicker.deleteFile is not available; skipping delete for: ${path}`)
      }

      return true
    } catch (error) {
      console.error(`Failed to delete file ${path}:`, error)
      throw error
    }
  }
}

// Make FileHelper available globally
window.FileHelper = FileHelper
