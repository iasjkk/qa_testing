import { USE_GDRIVE, config } from "./config";

export const driveEnabled = USE_GDRIVE;

async function callScript(body) {
  const res = await fetch(config.gdrive.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function uploadPhoto(base64, filename) {
  const data = await callScript({ action: "upload", base64, filename });
  if (data.error) throw new Error(data.error);
  return { url: data.url, fileId: data.fileId };
}

export async function deletePhoto(fileId) {
  if (!fileId) return;
  await callScript({ action: "delete", fileId }).catch(() => {});
}

export async function deleteSubmissionPhotos(sub) {
  if (!driveEnabled) return;
  const ids = (sub.rows ?? []).map(r => r.screenshot?.driveFileId).filter(Boolean);
  await Promise.all(ids.map(deletePhoto));
}

export async function appendLog(entry) {
  if (!driveEnabled) return;
  await callScript({ action: "appendLog", entry }).catch(() => {});
}

export async function readLogs() {
  if (!driveEnabled) return [];
  const data = await callScript({ action: "readLogs" }).catch(() => ({ logs: [] }));
  return data.logs ?? [];
}

export async function pruneOldLogs() {
  if (!driveEnabled) return;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await callScript({ action: "pruneOldLogs", cutoff }).catch(() => {});
}
