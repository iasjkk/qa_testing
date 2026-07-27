// ── Paste this entire file into Google Apps Script (script.google.com) ──────
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ─────────────────────────────────────────────────────────────────────────────

const FOLDER_NAME   = "QA Testing Photos";
const LOG_FILE_NAME = "qa_activity_log.json";

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getLogFile() {
  const folder = getFolder();
  const it = folder.getFilesByName(LOG_FILE_NAME);
  if (it.hasNext()) return it.next();
  const file = folder.createFile(LOG_FILE_NAME, "[]", "application/json");
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  return file;
}

function readLogEntries() {
  try {
    return JSON.parse(getLogFile().getBlob().getDataAsString());
  } catch (_) { return []; }
}

function writeLogEntries(entries) {
  getLogFile().setContent(JSON.stringify(entries));
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);

    if (req.action === "upload") {
      const folder = getFolder();
      const base64Data = req.base64.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Utilities.base64Decode(base64Data);
      const blob  = Utilities.newBlob(bytes, req.mimeType || "image/jpeg", req.filename || "photo.jpg");
      const file  = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return respond({
        fileId: file.getId(),
        url: "https://drive.google.com/uc?export=view&id=" + file.getId(),
      });
    }

    if (req.action === "delete") {
      try { DriveApp.getFileById(req.fileId).setTrashed(true); } catch (_) {}
      return respond({ success: true });
    }

    if (req.action === "appendLog") {
      const entries = readLogEntries();
      entries.push(req.entry);
      writeLogEntries(entries);
      return respond({ success: true });
    }

    if (req.action === "readLogs") {
      return respond({ logs: readLogEntries() });
    }

    if (req.action === "pruneOldLogs") {
      const cutoff = req.cutoff || (Date.now() - 30 * 24 * 60 * 60 * 1000);
      const kept = readLogEntries().filter(e => (e.createdAt ?? 0) > cutoff);
      writeLogEntries(kept);
      return respond({ success: true, removed: readLogEntries().length - kept.length });
    }

    return respond({ error: "Unknown action" });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doGet() {
  return respond({ status: "ok" });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
