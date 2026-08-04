// ── Paste this entire file into Google Apps Script (script.google.com) ──────
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ─────────────────────────────────────────────────────────────────────────────

const FOLDER_NAME = "QA Testing Photos";
const LOG_FILE_NAME = "qa_activity_log.json";

// *************************************************************************
// NEW: Constants and helper for Google Sheets integration
// IMPORTANT: Replace 'YOUR_SPREADSHEET_ID' with the actual ID of your Google Sheet
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // <--- !!! IMPORTANT !!!

// Define headers for each table. Customize these as needed.
const TABLE_HEADERS = {
  'qa_users': ['id', 'name', 'email', 'status', 'created_at', 'updated_at'],
  'qa_profiles': ['id', 'user_id', 'bio', 'avatar_url', 'created_at', 'updated_at'],
  'qa_products': ['id', 'name', 'description', 'created_by', 'created_at', 'updated_at'],
  'qa_tasks': ['id', 'product_id', 'title', 'description', 'assigned_to', 'status', 'priority', 'created_at', 'updated_at'],
  'qa_tickets': ['id', 'task_id', 'user_id', 'summary', 'details', 'status', 'severity', 'created_at', 'updated_at'],
  'qa_notifications': ['id', 'user_id', 'message', 'read', 'created_at'],
  'qa_submissions': ['id', 'ticket_id', 'user_id', 'content', 'created_at'],
  'qa_user_products': ['id', 'user_id', 'product_id', 'role', 'created_at']
};

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = TABLE_HEADERS[sheetName];
    if (headers) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

// Helper to get headers from a sheet
function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return []; // No headers if sheet is empty
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

// Helper to convert sheet rows to array of objects
function getSheetDataAsObjects(sheet) {
  const headers = getHeaders(sheet);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const data = [];
  // Skip header row if there are actual data rows
  if (values.length > 1) {
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      data.push(obj);
    }
  }
  return data;
}

// Generic CRUD functions for any sheet

function getRecords(sheetName) {
  const sheet = getSheet(sheetName);
  return getSheetDataAsObjects(sheet);
}

function getRecordById(sheetName, recordId) {
  const records = getRecords(sheetName);
  return records.find(record => record.id == recordId);
}

function createRecord(sheetName, recordData) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const newId = Utilities.getUuid();
  const now = new Date().toISOString();

  const rowValues = headers.map(header => {
    if (header === 'id') return newId;
    if (header === 'created_at') return now;
    if (header === 'updated_at') return now; // For new records, updated_at is also now
    return recordData[header] !== undefined ? recordData[header] : '';
  });

  sheet.appendRow(rowValues);
  const newRecord = { id: newId, created_at: now, updated_at: now, ...recordData };
  return { success: true, record: newRecord };
}

function updateRecord(sheetName, recordId, updates) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  let updated = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i][headers.indexOf('id')] == recordId) {
      for (const key in updates) {
        const headerIndex = headers.indexOf(key);
        if (headerIndex !== -1) {
          values[i][headerIndex] = updates[key];
        }
      }
      // Update 'updated_at' timestamp if it exists
      const updatedAtIndex = headers.indexOf('updated_at');
      if (updatedAtIndex !== -1) {
        values[i][updatedAtIndex] = new Date().toISOString();
      }
      sheet.getRange(i + 1, 1, 1, values[i].length).setValues([values[i]]);
      updated = true;
      break;
    }
  }
  return { success: updated };
}

function deleteRecord(sheetName, recordId) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  let deleted = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i][headers.indexOf('id')] == recordId) {
      sheet.deleteRow(i + 1);
      deleted = true;
      break;
    }
  }
  return { success: deleted };
}

// *************************************************************************
// Existing functions for Drive Folder and Log File

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

// *************************************************************************
// Main doPost function to handle requests

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const { action, sheetName, recordId, recordData, updates } = req;

    // Existing actions for photos and logs
    if (action === "upload") {
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

    if (action === "deletePhoto") { // Renamed from "delete" to avoid conflict
      try { DriveApp.getFileById(req.fileId).setTrashed(true); } catch (_) {}
      return respond({ success: true });
    }

    if (action === "appendLog") {
      const entries = readLogEntries();
      entries.push(req.entry);
      writeLogEntries(entries);
      return respond({ success: true });
    }

    if (action === "readLogs") {
      return respond({ logs: readLogEntries() });
    }

    if (action === "pruneOldLogs") {
      const cutoff = req.cutoff || (Date.now() - 30 * 24 * 60 * 60 * 1000);
      const kept = readLogEntries().filter(e => (e.createdAt ?? 0) > cutoff);
      writeLogEntries(kept);
      return respond({ success: true, removed: readLogEntries().length - kept.length });
    }

    // NEW: Generic CRUD actions for all tables
    if (action.endsWith('Record') || action.startsWith('get')) {
        if (!sheetName || !Object.keys(TABLE_HEADERS).includes(sheetName)) {
            return respond({ error: "Invalid or missing sheetName for table operation." });
        }
    }

    if (action === "getRecords") {
      return respond({ records: getRecords(sheetName) });
    }

    if (action === "getRecord") {
        if (!recordId) throw new Error("recordId is required for getRecord action.");
        return respond({ record: getRecordById(sheetName, recordId) });
    }

    if (action === "createRecord") {
      if (!recordData) throw new Error("recordData is required for createRecord action.");
      return respond(createRecord(sheetName, recordData));
    }

    if (action === "updateRecord") {
      if (!recordId || !updates) throw new Error("recordId and updates are required for updateRecord action.");
      return respond(updateRecord(sheetName, recordId, updates));
    }

    if (action === "deleteRecord") {
      if (!recordId) throw new Error("recordId is required for deleteRecord action.");
      return respond(deleteRecord(sheetName, recordId));
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