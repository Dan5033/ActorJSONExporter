// File Helper class for Actor Exporter
class FileHelper {
  // Check if a directory exists
  static async directoryExists(path) {
    try {
      // Use FilePicker to check if directory exists
      await FilePicker.browse("data", path)
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
      const browseResult = await FilePicker.browse("data", dirPath)

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
        // V13 compatible directory creation
        if (typeof FileSystem !== "undefined" && FileSystem.createDirectory) {
          // V13 method
          await FileSystem.createDirectory(`data/${path}`, { notify: false })
        } else {
          // Fallback for v12 and earlier
          await FilePicker.createDirectory("data", path)
        }
        console.log(`Created directory: ${path}`)
      } else {
        console.log(`Directory already exists: ${path}`)
      }
      return true
    } catch (error) {
      console.error(`Failed to create directory ${path}:`, error)
      // Don't throw the error if it's just that the directory already exists
      if (error.message && error.message.includes("EEXIST")) {
        console.log(`Directory already exists (from error): ${path}`)
        return true
      }
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

      // V13 compatible file upload
      if (typeof FileUpload !== "undefined") {
        // V13 method
        await FileUpload.upload({
          source: file,
          target: `data/${path}`,
          notify: false,
        })
      } else {
        // Fallback for v12 and earlier
        const uploadOptions = {
          notify: false,
        }
        await FilePicker.upload("data", dirPath, file, uploadOptions)
      }

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

      // V13 compatible file deletion
      if (typeof FileSystem !== "undefined" && FileSystem.deleteFile) {
        // V13 method
        await FileSystem.deleteFile(`data/${path}`, { notify: false })
      } else {
        // Fallback for v12 and earlier
        await FilePicker.deleteFile("data", path)
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
