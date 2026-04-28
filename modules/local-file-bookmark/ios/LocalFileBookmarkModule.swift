import Foundation
import UIKit
import React

@objc(LocalFileBookmark)
class LocalFileBookmark: NSObject {
  // Using a single key for now as the app supports one active vault.
  // TODO: Make this dynamic if multiple vaults are supported in the future.
  private let bookmarkKey = "securityScopedBookmark"
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  @objc
  func pickAndBookmarkDirectory(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let topViewController = self.getTopViewController() else {
        reject("NO_ROOT_VC", "No view controller to present from", nil)
        return
      }
      
      let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
      let delegate = DocumentPickerDelegate { url in
        if let url = url {
          self.saveBookmark(for: url, resolve: resolve, reject: reject)
        } else {
          resolve(nil) // Return null on cancel
        }
      }
      
      documentPicker.delegate = delegate
      documentPicker.allowsMultipleSelection = false
      
      // Keep delegate alive
      objc_setAssociatedObject(documentPicker, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)
      
      topViewController.present(documentPicker, animated: true)
    }
  }

  private func getTopViewController() -> UIViewController? {
    guard let window = UIApplication.shared.connectedScenes
            .filter({$0.activationState == .foregroundActive})
            .compactMap({$0 as? UIWindowScene})
            .first?.windows
            .filter({$0.isKeyWindow}).first ?? UIApplication.shared.windows.first,
          var topController = window.rootViewController else {
      return nil
    }
    
    while let presentedViewController = topController.presentedViewController {
      topController = presentedViewController
    }
    
    return topController
  }
  
  @objc
  func getBookmarkedDirectory(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let bookmarkData = UserDefaults.standard.data(forKey: self.bookmarkKey) else {
      resolve(nil)
      return
    }
    
    do {
      var isStale = false
      #if targetEnvironment(macCatalyst)
      let resolveOptions: URL.BookmarkResolutionOptions = [.withoutUI, .withSecurityScope]
      #else
      let resolveOptions: URL.BookmarkResolutionOptions = [.withoutUI]
      #endif
      let url = try URL(resolvingBookmarkData: bookmarkData, options: resolveOptions, relativeTo: nil, bookmarkDataIsStale: &isStale)
      
      if isStale {
        print("⚠️ Bookmark is stale, re-saving")
        self.saveBookmark(for: url, resolve: resolve, reject: reject)
        return
      }
      
      resolve([
        "path": url.path,
        "url": url.absoluteString
      ])
    } catch {
      reject("RESOLVE_ERROR", error.localizedDescription, error)
    }
  }
  
  @objc
  func writeFile(_ filename: String, content: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      let fileUrl = dirUrl.appendingPathComponent(filename)
      
      // Ensure the parent directory exists
      let parentDirUrl = fileUrl.deletingLastPathComponent()
      do {
        try FileManager.default.createDirectory(at: parentDirUrl, withIntermediateDirectories: true, attributes: nil)
        try content.write(to: fileUrl, atomically: true, encoding: .utf8)
        print("✅ Written file: \(fileUrl.path)")
        resolve(fileUrl.path)
      } catch {
        print("❌ Write error: \(error.localizedDescription)")
        reject("WRITE_ERROR", error.localizedDescription, error)
      }
    }
  }
  
  @objc
  func readFile(_ filename: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      let fileUrl = dirUrl.appendingPathComponent(filename)
      do {
        let content = try String(contentsOf: fileUrl, encoding: .utf8)
        resolve(content)
      } catch {
        reject("READ_ERROR", error.localizedDescription, error)
      }
    }
  }
  
  @objc
  func listFiles(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      do {
        let files = try FileManager.default.contentsOfDirectory(at: dirUrl, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        let fileNames = files.map { $0.lastPathComponent }
        resolve(fileNames)
      } catch {
        reject("LIST_ERROR", error.localizedDescription, error)
      }
    }
  }

  @objc
  func listFilesWithAttributes(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      do {
        let files = try FileManager.default.contentsOfDirectory(at: dirUrl, includingPropertiesForKeys: [.contentModificationDateKey, .isDirectoryKey], options: [.skipsHiddenFiles])
        
        let fileStats = files.compactMap { url -> [String: Any]? in
            var stats: [String: Any] = [
                "name": url.lastPathComponent,
                "path": url.path
            ]
            
            if let resources = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
               let modDate = resources.contentModificationDate {
                stats["modificationTime"] = modDate.timeIntervalSince1970 * 1000 // In ms for consistency with JS
            }
            
            return stats
        }
        
        resolve(fileStats)
      } catch {
        reject("LIST_ERROR", error.localizedDescription, error)
      }
    }
  }
  
  @objc
  func listSubdirFilesWithAttributes(_ subpath: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      do {
        let targetDirUrl = dirUrl.appendingPathComponent(subpath)
        let files = try FileManager.default.contentsOfDirectory(at: targetDirUrl, includingPropertiesForKeys: [.contentModificationDateKey, .isDirectoryKey], options: [.skipsHiddenFiles])
        
        let fileStats = files.compactMap { url -> [String: Any]? in
            var stats: [String: Any] = [
                "name": url.lastPathComponent,
                "path": url.path
            ]
            
            if let resources = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
               let modDate = resources.contentModificationDate {
                stats["modificationTime"] = modDate.timeIntervalSince1970 * 1000
            }
            
            return stats
        }
        
        resolve(fileStats)
      } catch {
        // If directory doesn't exist, just return empty array instead of error
        resolve([])
      }
    }
  }
  
  @objc
  func deleteFile(_ filename: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    withSecurityScope(reject: reject) { dirUrl in
      let fileUrl = dirUrl.appendingPathComponent(filename)
      do {
        try FileManager.default.removeItem(at: fileUrl)
        resolve(true)
      } catch {
        reject("DELETE_ERROR", error.localizedDescription, error)
      }
    }
  }
  
  // Helper to manage security scope
  private func withSecurityScope(reject: @escaping RCTPromiseRejectBlock, block: (URL) -> Void) {
    guard let bookmarkData = UserDefaults.standard.data(forKey: self.bookmarkKey) else {
      reject("NO_BOOKMARK", "No directory bookmarked", nil)
      return
    }
    
    do {
      var isStale = false
      #if targetEnvironment(macCatalyst)
      let resolveOptions: URL.BookmarkResolutionOptions = [.withoutUI, .withSecurityScope]
      #else
      let resolveOptions: URL.BookmarkResolutionOptions = [.withoutUI]
      #endif
      let dirUrl = try URL(resolvingBookmarkData: bookmarkData, options: resolveOptions, relativeTo: nil, bookmarkDataIsStale: &isStale)
      
      let didStartAccessing = dirUrl.startAccessingSecurityScopedResource()
      defer {
        if didStartAccessing {
          dirUrl.stopAccessingSecurityScopedResource()
        }
      }
      
      block(dirUrl)
    } catch {
      reject("SCOPE_ERROR", error.localizedDescription, error)
    }
  }
  
  private func saveBookmark(for url: URL, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    do {
      let didStartAccessing = url.startAccessingSecurityScopedResource()
      defer {
        if didStartAccessing {
          url.stopAccessingSecurityScopedResource()
        }
      }
      
      #if targetEnvironment(macCatalyst)
      let bookmarkOptions: URL.BookmarkCreationOptions = [.withSecurityScope]
      #else
      let bookmarkOptions: URL.BookmarkCreationOptions = [.minimalBookmark]
      #endif
      let bookmarkData = try url.bookmarkData(options: bookmarkOptions, includingResourceValuesForKeys: nil, relativeTo: nil)
      UserDefaults.standard.set(bookmarkData, forKey: self.bookmarkKey)
      
      print("💾 Saved bookmark for: \(url.path)")
      
      resolve([
        "path": url.path,
        "url": url.absoluteString
      ])
    } catch {
      reject("BOOKMARK_ERROR", error.localizedDescription, error)
    }
  }
}

class DocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let completion: (URL?) -> Void
  
  init(completion: @escaping (URL?) -> Void) {
    self.completion = completion
  }
  
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    completion(urls.first)
  }
  
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion(nil)
  }
}
