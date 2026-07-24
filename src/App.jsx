import React, { useState, useCallback, useEffect, useRef } from "react";
import { QUESTIONS } from "./data/questions";
import LoginPage from "./LoginPage";
import {
  getSession, logout, startTesting, terminateTesting, resetTesting,
  getScores, saveScores, clearScores,
} from "./auth";
import {
  dbGetAllUsers, dbUpdateRole, dbResetPassword, dbDeleteUser, dbSignup,
  dbGetSubmissions, dbSaveSubmission, dbDeleteSubmission,
  dbGetProfiles, dbSaveProfile, dbDeleteProfile,
  dbGetProducts, dbSaveProduct, dbDeleteProduct,
  dbGetUserProducts, dbSetUserProducts,
} from "./db";
import "./App.css";

// ── Constants ─────────────────────────────────────────────────────────────────
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const TESTER_DURATION  = 60 * 60 * 1000;

function getDuration(s) {
  return s?.mode === "tester" ? TESTER_DURATION : SESSION_DURATION;
}

const CATEGORY_COLORS = {
  FUNC: "#4f86c6", UI: "#6bbf8e", API: "#e08c4a", DATA: "#9b73c8",
  PERF: "#e05c5c", SEC: "#c8a73a", INT: "#4ab8c8", REG:  "#888",
};

// Fixed "random-looking" preset marks for the default question set
const PRESET_MARKS = [10,15,10,20,15,10,10,15,10,20,15,10,10,20,15,10,15,20,10,15,20,10,15,10,15,20,10,15,10,15];

function getActiveQuestions() {
  return QUESTIONS;
}

function blankRow(q) {
  return {
    id: q.id, standard: q.standard, observation: q.observation,
    possibleMarks: q.possibleMarks ?? PRESET_MARKS[q.id - 1] ?? 10,
    earnedScore: null, evalNote: "", screenshot: null,
  };
}

function parseCSVLine(line) {
  const result = []; let cur = ""; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ""; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString("en-US", {
    year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit",
  });
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function getMissingFields(rows) {
  return rows.reduce((acc, r) => {
    const f = [];
    if (r.earnedScore === null) f.push("earned score");
    if (!r.screenshot)          f.push("screenshot");
    if (f.length) acc.push({ id: r.id, standard: r.standard, fields: f });
    return acc;
  }, []);
}

// ── Report builder ────────────────────────────────────────────────────────────
function buildReportHTML(rows, session) {
  const { username, testingStart, testingEnd } = session;
  const totalPossible = rows.reduce((s, r) => s + (r.possibleMarks ?? 0), 0);
  const totalEarned   = rows.reduce((s, r) => s + (r.earnedScore  ?? 0), 0);
  const pct    = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : "—";
  const passed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks >= 0.8).length;
  const warned = rows.filter(r => { if (!r.possibleMarks || r.earnedScore === null) return false; const p = r.earnedScore / r.possibleMarks; return p >= 0.5 && p < 0.8; }).length;
  const failed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks < 0.5).length;

  const rowsHTML = rows.map((row) => {
    const rowPct = row.possibleMarks && row.earnedScore !== null ? Math.round((row.earnedScore / row.possibleMarks) * 100) : null;
    const status = rowPct !== null ? (rowPct >= 80 ? "PASS" : rowPct < 50 ? "FAIL" : "WARN") : "N/A";
    const imgHTML = row.screenshot?.base64
      ? `<img src="${row.screenshot.base64}" alt="${row.screenshot.name}" />`
      : `<span class="no-img">—</span>`;
    const color   = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
    const noteHTML = row.evalNote?.trim()
      ? `<tr class="note-report-row"><td colspan="7" class="note-report-cell"><span class="note-report-label">Observation:</span> ${row.evalNote.trim()}</td></tr>`
      : "";
    return `
      <tr class="${status.toLowerCase()}-row">
        <td class="tc">${row.id}</td>
        <td><span class="badge" style="background:${color}">${row.standard}</span></td>
        <td>${row.observation}</td>
        <td class="tc">${row.possibleMarks ?? "—"}</td>
        <td class="tc">${row.earnedScore !== null ? `<strong>${row.earnedScore}</strong> / ${row.possibleMarks ?? "—"}<br/><small>${rowPct ?? "—"}%</small>` : "—"}</td>
        <td class="tc"><span class="st ${status.toLowerCase()}">${status}</span></td>
        <td class="tc img-cell">${imgHTML}</td>
      </tr>${noteHTML}`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>QA Report — ${username}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:32px}
  h1{font-size:22px;font-weight:700}
  h2{font-size:13px;font-weight:700;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.5px;color:#555}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px}
  .hdr .meta{font-size:12px;color:#555;line-height:1.9} .hdr .meta strong{color:#1a1a2e}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px}
  .card{border-radius:8px;padding:12px 16px;border:1px solid #e0e0e0}
  .card .v{font-size:26px;font-weight:700;line-height:1} .card .l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;margin-top:4px}
  .card.bl{border-top:4px solid #4f86c6}.card.gr{border-top:4px solid #2d9e5a}.card.pu{border-top:4px solid #9b73c8}.card.te{border-top:4px solid #4ab8c8}.card.re{border-top:4px solid #e05c5c}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#1a1a2e;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
  tbody tr{border-bottom:1px solid #f0f2f5} td{padding:9px 12px;vertical-align:middle} .tc{text-align:center}
  .pass-row{border-left:4px solid #2d9e5a}.warn-row{border-left:4px solid #e08c4a}.fail-row{border-left:4px solid #e05c5c}.n\/a-row{border-left:4px solid #ccc}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;font-size:10px;font-weight:700;white-space:nowrap}
  .st{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
  .st.pass{background:#e6f7ee;color:#2d9e5a;border:1px solid #2d9e5a}.st.warn{background:#fff4e5;color:#e08c4a;border:1px solid #e08c4a}.st.fail{background:#fde8e8;color:#e05c5c;border:1px solid #e05c5c}.st.n\/a{background:#f5f5f5;color:#888;border:1px solid #ccc}
  .img-cell img{max-width:380px;max-height:260px;border-radius:6px;border:1px solid #ddd;object-fit:contain}
  .no-img{color:#bbb;font-style:italic} small{color:#888}
  .note-report-row{background:#f9f9fb}
  .note-report-cell{padding:6px 12px 10px 20px;font-size:12px;color:#444;border-left:3px solid #d0d4db;font-style:italic}
  .note-report-label{font-weight:700;font-style:normal;color:#1a1a2e;margin-right:6px}
  .footer{margin-top:32px;border-top:1px solid #e0e0e0;padding-top:12px;font-size:11px;color:#aaa;text-align:center}
  @media print{body{padding:16px} .grid{grid-template-columns:repeat(5,1fr)}}
</style></head><body>
<div class="hdr">
  <h1>QA Automation Test Report</h1>
  <div class="meta">
    <div><strong>Evaluator:</strong> ${username}</div>
    <div><strong>Testing Started:</strong> ${fmtDateTime(testingStart)}</div>
    <div><strong>Terminated:</strong> ${fmtDateTime(testingEnd)}</div>
    <div><strong>Duration:</strong> ${fmtDuration(testingEnd - testingStart)}</div>
  </div>
</div>
<h2>Summary</h2>
<div class="grid">
  <div class="card bl"><div class="v">${rows.length}</div><div class="l">Questions</div></div>
  <div class="card gr"><div class="v">${totalEarned}/${totalPossible}</div><div class="l">Marks Earned</div></div>
  <div class="card pu"><div class="v">${pct}%</div><div class="l">Overall Score</div></div>
  <div class="card te"><div class="v">${passed}</div><div class="l">Passed (≥80%)</div></div>
  <div class="card re"><div class="v">${failed}</div><div class="l">Failed (<50%)</div></div>
</div>
<h2>Question Results</h2>
<table>
  <thead><tr><th>#</th><th>Standard</th><th>Observation</th><th>Possible Marks</th><th>Earned Score</th><th>Status</th><th>Screenshot</th></tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div class="footer">Report generated ${fmtDateTime(Date.now())} &bull; ${passed} passed &bull; ${warned} warned &bull; ${failed} failed</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}

function openReport(rows, session) {
  const html = buildReportHTML(rows, session);
  window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
}

// ── ProfileMenu ───────────────────────────────────────────────────────────────
function ProfileMenu({ username, onLogout }) {
  const [open, setOpen]           = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      <div className="profile-menu" ref={ref}>
        <button className="profile-btn" onClick={() => setOpen(o => !o)}>
          <span className="profile-avatar">{username.charAt(0).toUpperCase()}</span>
          <span className="profile-name">{username}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft:2, opacity:0.7 }}>
            <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {open && (
          <div className="profile-dropdown">
            <div className="profile-dd-info">
              <span className="profile-dd-avatar">{username.charAt(0).toUpperCase()}</span>
              <span className="profile-dd-name">{username}</span>
            </div>
            <div className="profile-dd-divider" />
            <button className="profile-dd-item" onClick={() => { setOpen(false); setConfirmLogout(true); }}>
              Log Out
            </button>
          </div>
        )}
      </div>
      {confirmLogout && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Log Out?</h3>
            <p>Are you sure you want to log out? Any unsaved progress will be lost.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmLogout(false)}>Cancel</button>
              <button className="btn-danger" onClick={() => { setConfirmLogout(false); onLogout(); }}>Yes, Log Out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── PossibleMarksInput ────────────────────────────────────────────────────────
function PossibleMarksInput({ value, onChange, disabled }) {
  return (
    <input
      type="number" min={1} max={100}
      value={value ?? ""} placeholder="—" disabled={disabled}
      onChange={(e) => {
        if (e.target.value === "") { onChange(null); return; }
        onChange(Math.max(1, parseInt(e.target.value) || 1));
      }}
      className={`marks-input${value === null ? " empty" : ""}`}
    />
  );
}

// ── ScoreInput ────────────────────────────────────────────────────────────────
function ScoreInput({ value, max, onChange, disabled }) {
  const pct   = max > 0 && value !== null ? (value / max) * 100 : 0;
  const color = value === null || max === null ? "#d0d4db"
                : pct >= 80 ? "#2d9e5a" : pct >= 50 ? "#e08c4a" : "#e05c5c";
  return (
    <div className="score-cell">
      <div className="score-row">
        <input
          type="number" min={0} max={max ?? undefined}
          value={value ?? ""} placeholder="—"
          disabled={disabled || max === null}
          onChange={(e) => {
            if (e.target.value === "") { onChange(null); return; }
            const v = max !== null
              ? Math.min(max, Math.max(0, Number(e.target.value)))
              : Math.max(0, Number(e.target.value));
            onChange(v);
          }}
          className={`score-input${value === null ? " empty" : ""}`}
          style={{ borderColor: color, opacity: (disabled || max === null) ? 0.6 : 1 }}
        />
        <span className="score-max">/ {max ?? "—"}</span>
      </div>
      {max !== null && value !== null && (
        <div className="score-bar-bg">
          <div className="score-bar-fill" style={{ width:`${pct}%`, background:color }} />
        </div>
      )}
    </div>
  );
}

// ── CameraModal (webcam/desktop) ──────────────────────────────────────────────
function CameraModal({ onCapture, onClose }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const [ready,    setReady]    = useState(false);
  const [error,    setError]    = useState(null);
  const [facing,   setFacing]   = useState("environment");

  const startStream = (facingMode) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setReady(false);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser. Use 'Live Photo' instead.");
      return;
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      setError("Camera requires HTTPS. Use 'Live Photo' to take photos on this device.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch((err) => {
        if (err.name === "NotAllowedError") setError("Camera permission denied. Allow camera access and try again.");
        else if (err.name === "NotFoundError") setError("No camera found on this device.");
        else setError("Camera unavailable. Use 'Live Photo' instead.");
      });
  };

  useEffect(() => { startStream(facing); return () => streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const switchCamera = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    startStream(next);
  };

  const capture = () => {
    const video  = videoRef.current;
    const canvas = document.createElement("canvas");
    const isFront = facing === "user";
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (isFront) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    if (isFront) { ctx.setTransform(1, 0, 0, 1, 0, 0); }

    // Watermark
    const now      = new Date();
    const stamp    = `${isFront ? "Front" : "Back"} | ${now.toLocaleString()}`;
    const fontSize = Math.max(14, Math.round(canvas.width * 0.022));
    const pad      = Math.round(fontSize * 0.6);
    ctx.font        = `bold ${fontSize}px monospace`;
    const textW     = ctx.measureText(stamp).width;
    const boxX      = canvas.width  - textW - pad * 2 - 10;
    const boxY      = canvas.height - fontSize - pad * 2 - 10;
    ctx.fillStyle   = "rgba(0,0,0,0.45)";
    ctx.fillRect(boxX, boxY, textW + pad * 2, fontSize + pad * 2);
    ctx.fillStyle   = "#ffffff";
    ctx.fillText(stamp, boxX + pad, boxY + pad + fontSize * 0.85);

    const base64 = canvas.toDataURL("image/jpeg", 0.92);
    const url    = URL.createObjectURL(dataURLtoBlob(base64));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture({ url, base64, name: `photo_${Date.now()}.jpg` });
  };

  return (
    <div className="modal-overlay">
      <div className="camera-modal">
        <div className="camera-modal-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "middle", marginRight: 6 }}>
              <circle cx="12" cy="12" r="3.5" fill="#FFD600"/>
              <circle cx="12" cy="12" r="6.5" stroke="#FFD600" strokeWidth="1.5" fill="none" opacity="0.6"/>
              <circle cx="12" cy="12" r="10" stroke="#FFD600" strokeWidth="1.2" fill="none" opacity="0.3"/>
            </svg>
            Live Photo
          </h3>
          {!error && ready && (
            <button className="camera-switch-btn" onClick={switchCamera} title="Switch camera">
              🔄 {facing === "environment" ? "Front" : "Back"}
            </button>
          )}
        </div>
        {error
          ? <p className="camera-error">{error}</p>
          : <video ref={videoRef} autoPlay playsInline muted className={`camera-preview${facing === "user" ? " camera-mirror" : ""}`} />
        }
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          {!error && (
            <button className="btn-confirm" onClick={capture} disabled={!ready}>
              📷 Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ScreenshotCell ────────────────────────────────────────────────────────────
function ScreenshotCell({ screenshot, onUpload, onDiscard, disabled, required }) {
  const [ddOpen,     setDdOpen]     = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const ddRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setDdOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDdOpen(false);
    const [url, base64] = await Promise.all([
      Promise.resolve(URL.createObjectURL(file)), fileToBase64(file),
    ]);
    onUpload({ url, base64, name: file.name });
    e.target.value = "";
  };

  // Inline dropdown — never define components inside render
  const shotDropdown = (
    <div className="shot-dd-wrap" ref={ddRef}>
      {screenshot
        ? <button className="btn-upload small" onClick={() => setDdOpen(o => !o)}>Replace ▾</button>
        : <button className={`btn-upload${required ? " required" : ""}`} onClick={() => setDdOpen(o => !o)}>
            + Add {required && <span className="req-dot">*</span>} ▾
          </button>
      }
      {ddOpen && (
        <div className="shot-dropdown">
          <label className="shot-dd-item">
            📁 Upload Image
            <input type="file" accept="image/*" onChange={handleChange} hidden />
          </label>
          <div className="shot-dd-item" onMouseDown={() => { setDdOpen(false); setShowCamera(true); }}>
            📷 Live Photo
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {showCamera && (
        <CameraModal
          onCapture={(s) => { setShowCamera(false); onUpload(s); }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {screenshot ? (
        <div className="screenshot-cell has-image">
          <div className="screenshot-thumb-wrap">
            <img src={screenshot.url} alt={screenshot.name} className="screenshot-thumb"
              onClick={() => window.open(screenshot.url, "_blank")} title="Click to expand" />
            {!disabled && (
              <button className="btn-discard-x" onClick={onDiscard} title="Remove screenshot">✕</button>
            )}
          </div>
          <div className="screenshot-info">
            <span className="screenshot-name">{screenshot.name}</span>
            {!disabled && shotDropdown}
          </div>
        </div>
      ) : (
        <div className="screenshot-cell">
          {disabled ? <span className="no-screenshot">—</span> : shotDropdown}
        </div>
      )}
    </>
  );
}

// ── SummaryBar ────────────────────────────────────────────────────────────────
function SummaryBar({ rows }) {
  const totalPossible = rows.reduce((s, r) => s + (r.possibleMarks ?? 0), 0);
  const totalEarned   = rows.reduce((s, r) => s + (r.earnedScore  ?? 0), 0);
  const pct    = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : "—";
  const passed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks >= 0.8).length;
  const failed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks < 0.5).length;
  return (
    <div className="summary-bar">
      <div className="summary-card blue"><span className="summary-value">{rows.length}</span><span className="summary-label">Total Questions</span></div>
      <div className="summary-card green"><span className="summary-value">{totalEarned}<small>/{totalPossible}</small></span><span className="summary-label">Marks Earned</span></div>
      <div className="summary-card purple"><span className="summary-value">{pct}{pct !== "—" ? "%" : ""}</span><span className="summary-label">Overall Score</span></div>
      <div className="summary-card teal"><span className="summary-value">{passed}</span><span className="summary-label">Passed (≥ 80%)</span></div>
      <div className="summary-card red"><span className="summary-value">{failed}</span><span className="summary-label">Failed (&lt; 50%)</span></div>
    </div>
  );
}

// ── ValidationModal ───────────────────────────────────────────────────────────
function ValidationModal({ missing, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Required Fields Missing</h3>
        <p>Complete the following before proceeding ({missing.length} question{missing.length > 1 ? "s" : ""}):</p>
        <ul className="validation-list">
          {missing.slice(0, 8).map(m => (
            <li key={m.id}>
              <span className="val-badge">{m.standard}</span>
              <span className="val-fields">Missing: {m.fields.join(", ")}</span>
            </li>
          ))}
          {missing.length > 8 && <li className="val-more">…and {missing.length - 8} more</li>}
        </ul>
        <div className="modal-actions">
          <button className="btn-confirm" onClick={onClose}>OK, I'll fix these</button>
        </div>
      </div>
    </div>
  );
}

// ── TerminateModal ────────────────────────────────────────────────────────────
function TerminateModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Terminate Testing Session?</h3>
        <p>This will end the session and take you to the completion screen. You will not be able to edit scores after termination.</p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Yes, Terminate</button>
        </div>
      </div>
    </div>
  );
}

// ── Tester report ─────────────────────────────────────────────────────────────
function buildTesterReportHTML(rows, session) {
  const { username, testingStart, testingEnd } = session;
  const uploaded = rows.filter(r => r.screenshot).length;
  const missing  = rows.length - uploaded;
  const rowsHTML = rows.map((row) => {
    const color  = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
    const imgHTML = row.screenshot?.base64
      ? `<img src="${row.screenshot.base64}" alt="${row.screenshot.name}" />`
      : `<span class="no-img">Not uploaded</span>`;
    const status  = row.screenshot ? "DONE" : "MISSING";
    return `
      <tr class="${row.screenshot ? "done-row" : "miss-row"}">
        <td class="tc">${row.id}</td>
        <td><span class="badge" style="background:${color}">${row.standard}</span></td>
        <td>${row.observation}</td>
        <td class="tc"><span class="st ${status.toLowerCase()}">${status}</span></td>
        <td class="tc img-cell">${imgHTML}</td>
      </tr>`;
  }).join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Tester Report — ${username}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:32px}
  h1{font-size:22px;font-weight:700} h2{font-size:13px;font-weight:700;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.5px;color:#555}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px}
  .hdr .meta{font-size:12px;color:#555;line-height:1.9} .hdr .meta strong{color:#1a1a2e}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
  .card{border-radius:8px;padding:12px 16px;border:1px solid #e0e0e0}
  .card .v{font-size:26px;font-weight:700;line-height:1} .card .l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.4px;margin-top:4px}
  .card.bl{border-top:4px solid #4f86c6}.card.te{border-top:4px solid #2d9e5a}.card.re{border-top:4px solid #e05c5c}.card.or{border-top:4px solid #e08c4a}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#1a1a2e;color:#fff} thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
  tbody tr{border-bottom:1px solid #f0f2f5} td{padding:9px 12px;vertical-align:middle} .tc{text-align:center}
  .done-row{border-left:4px solid #2d9e5a} .miss-row{border-left:4px solid #e05c5c}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;font-size:10px;font-weight:700;white-space:nowrap}
  .st{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
  .st.done{background:#e6f7ee;color:#2d9e5a;border:1px solid #2d9e5a} .st.missing{background:#fde8e8;color:#e05c5c;border:1px solid #e05c5c}
  .img-cell img{max-width:380px;max-height:260px;border-radius:6px;border:1px solid #ddd;object-fit:contain}
  .no-img{color:#bbb;font-style:italic}
  .footer{margin-top:32px;border-top:1px solid #e0e0e0;padding-top:12px;font-size:11px;color:#aaa;text-align:center}
  @media print{body{padding:16px}}
</style></head><body>
<div class="hdr">
  <div><h1>Tester Screenshot Report</h1><p style="color:#555;font-size:13px;margin-top:4px">Screenshot submission by ${username}</p></div>
  <div class="meta">
    <div><strong>Tester:</strong> ${username}</div>
    <div><strong>Session Started:</strong> ${fmtDateTime(testingStart)}</div>
    <div><strong>Submitted:</strong> ${fmtDateTime(testingEnd)}</div>
    <div><strong>Duration:</strong> ${fmtDuration(testingEnd - testingStart)}</div>
  </div>
</div>
<h2>Summary</h2>
<div class="grid">
  <div class="card bl"><div class="v">${rows.length}</div><div class="l">Total Questions</div></div>
  <div class="card te"><div class="v">${uploaded}</div><div class="l">Uploaded</div></div>
  <div class="card re"><div class="v">${missing}</div><div class="l">Missing</div></div>
  <div class="card or"><div class="v">${((uploaded/rows.length)*100).toFixed(0)}%</div><div class="l">Completion</div></div>
</div>
<h2>Question Screenshots</h2>
<table>
  <thead><tr><th>#</th><th>Standard</th><th>Observation</th><th>Status</th><th>Screenshot</th></tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div class="footer">Report generated ${fmtDateTime(Date.now())} &bull; ${uploaded} uploaded &bull; ${missing} missing</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}

function openTesterReport(rows, session) {
  const html = buildTesterReportHTML(rows, session);
  window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
}

function fmtReportName(sub) {
  const d    = new Date(sub.endTime);
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const time = `${String(d.getHours()).padStart(2,"0")}-${String(d.getMinutes()).padStart(2,"0")}`;
  const type = sub.type === "tester" ? "by_tester" : "automation_testing";
  return `${sub.username}_${date}_${time}_${type}`;
}

function makeSubmission(type, username, session, rows) {
  return {
    id:          `${username}_${Date.now()}`,
    type,
    username,
    profileName: session.profileName ?? null,
    productId:   session.productId   ?? null,
    productName: session.productName ?? null,
    startTime:   session.testingStart,
    endTime:     Date.now(),
    rows:        rows.map(r => ({
      ...r,
      screenshot: r.screenshot ? { base64: r.screenshot.base64, name: r.screenshot.name } : null,
    })),
    review: null,
  };
}

function buildReviewedReportHTML(sub) {
  const { username, startTime, endTime, review } = sub;
  const rowsHTML = sub.rows.map((row) => {
    const color = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
    const rv    = review.rows.find(r => r.id === row.id) ?? {};
    const imgHTML = row.screenshot?.base64
      ? `<img src="${row.screenshot.base64}" alt="${row.screenshot.name}" />`
      : `<span class="no-img">—</span>`;
    return `
      <tr>
        <td class="tc">${row.id}</td>
        <td><span class="badge" style="background:${color}">${row.standard}</span></td>
        <td>${row.observation}</td>
        <td class="tc img-cell">${imgHTML}</td>
        <td class="tc"><strong>${rv.marks ?? "—"}</strong> / ${row.possibleMarks}</td>
        <td>${rv.comment ? rv.comment : '<span style="color:#bbb">—</span>'}</td>
      </tr>`;
  }).join("\n");
  const total = sub.rows.reduce((s, r) => s + (r.possibleMarks ?? 0), 0);
  const earned = review.rows.reduce((s, r) => s + (r.marks ?? 0), 0);
  const pct = total > 0 ? ((earned/total)*100).toFixed(1) : "—";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Review Report — ${username}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#1a1a2e;padding:32px}
  h1{font-size:22px;font-weight:700}h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:24px 0 10px}
  .hdr{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px}
  .meta{font-size:12px;color:#555;line-height:1.9}.meta strong{color:#1a1a2e}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
  .card{border-radius:8px;padding:12px 16px;border:1px solid #e0e0e0}.card .v{font-size:24px;font-weight:700}.card .l{font-size:11px;color:#666;text-transform:uppercase;margin-top:4px}
  .card.bl{border-top:4px solid #4f86c6}.card.gr{border-top:4px solid #2d9e5a}.card.pu{border-top:4px solid #9b73c8}.card.or{border-top:4px solid #e08c4a}
  table{width:100%;border-collapse:collapse;font-size:12px}thead tr{background:#1a1a2e;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
  tbody tr{border-bottom:1px solid #f0f2f5}td{padding:9px 12px;vertical-align:middle}.tc{text-align:center}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;color:#fff;font-size:10px;font-weight:700;white-space:nowrap}
  .img-cell img{max-width:380px;max-height:260px;border-radius:6px;border:1px solid #ddd;object-fit:contain}.no-img{color:#bbb;font-style:italic}
  .footer{margin-top:32px;border-top:1px solid #e0e0e0;padding-top:12px;font-size:11px;color:#aaa;text-align:center}
</style></head><body>
<div class="hdr">
  <h1>Reviewed Tester Report</h1>
  <div class="meta">
    <div><strong>Tester:</strong> ${username}</div>
    <div><strong>Reviewer:</strong> ${review.reviewerUsername}</div>
    <div><strong>Reviewed:</strong> ${fmtDateTime(review.reviewedAt)}</div>
    <div><strong>Session:</strong> ${fmtDateTime(startTime)} → ${fmtDateTime(endTime)}</div>
  </div>
</div>
<h2>Summary</h2>
<div class="grid">
  <div class="card bl"><div class="v">${sub.rows.length}</div><div class="l">Questions</div></div>
  <div class="card gr"><div class="v">${earned}/${total}</div><div class="l">Marks Earned</div></div>
  <div class="card pu"><div class="v">${pct}%</div><div class="l">Score</div></div>
  <div class="card or"><div class="v">${sub.rows.filter(r=>r.screenshot).length}</div><div class="l">Photos Submitted</div></div>
</div>
<h2>Question Results</h2>
<table>
  <thead><tr><th>#</th><th>Standard</th><th>Observation</th><th>Photo</th><th>Marks</th><th>Reviewer Comment</th></tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div class="footer">Report generated ${fmtDateTime(Date.now())}</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}

function openReviewedReport(sub) {
  window.open(URL.createObjectURL(new Blob([buildReviewedReportHTML(sub)], { type: "text/html" })), "_blank");
}

// ── ImageZoomModal ────────────────────────────────────────────────────────────
function ImageZoomModal({ src, alt, onClose }) {
  const [zoom,      setZoom]      = useState(1);
  const [pos,       setPos]       = useState({ x: 0, y: 0 });
  const [dragging,  setDragging]  = useState(false);
  const dragOrigin = useRef(null);
  const bodyRef    = useRef(null);

  // Reset pan when zoom returns to 1
  useEffect(() => { if (zoom <= 1) setPos({ x: 0, y: 0 }); }, [zoom]);

  // Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll-wheel zoom
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.min(5, Math.max(0.25, parseFloat((z + (e.deltaY < 0 ? 0.25 : -0.25)).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragOrigin.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!dragging || !dragOrigin.current) return;
    setPos({ x: e.clientX - dragOrigin.current.x, y: e.clientY - dragOrigin.current.y });
  };

  const stopDrag = () => { setDragging(false); dragOrigin.current = null; };

  const changeZoom = (next) => {
    setZoom(next);
    if (next <= 1) setPos({ x: 0, y: 0 });
  };

  return (
    <div className="modal-overlay zoom-overlay" onClick={onClose}>
      <div className="zoom-modal" onClick={e => e.stopPropagation()}>
        <div className="zoom-toolbar">
          <button className="zoom-btn" onClick={() => changeZoom(Math.max(0.25, parseFloat((zoom - 0.25).toFixed(2))))}>－</button>
          <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => changeZoom(Math.min(5, parseFloat((zoom + 0.25).toFixed(2))))}>＋</button>
          <button className="zoom-btn zoom-reset-btn" onClick={() => changeZoom(1)}>Reset</button>
          <button className="zoom-close-btn" onClick={onClose}>✕</button>
        </div>
        <div
          className="zoom-body"
          ref={bodyRef}
          style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          <img
            src={src}
            alt={alt || "screenshot"}
            draggable={false}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 0.15s ease",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>
        <p className="zoom-hint">Scroll or ＋/－ to zoom · Drag to pan when zoomed · Esc to close</p>
      </div>
    </div>
  );
}

// ── ReviewPortal ──────────────────────────────────────────────────────────────
function ReviewPortal({ currentUser, currentRole, onBack, onLogout }) {
  const [allSubs,      setAllSubs]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [userProducts, setUserProducts] = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [reviewData,   setReviewData]   = useState([]);
  const [zoomImg,      setZoomImg]      = useState(null);
  const [sortCol,      setSortCol]      = useState("date");
  const [sortDir,      setSortDir]      = useState("desc");
  const isAdmin = currentRole === "admin";

  useEffect(() => {
    const tasks = [dbGetSubmissions()];
    if (!isAdmin) tasks.push(dbGetUserProducts(currentUser));
    Promise.all(tasks).then(([subs, prodIds]) => {
      const testerSubs = subs.filter(s => s.type === "tester");
      const filtered   = isAdmin || !prodIds || prodIds.length === 0
        ? testerSubs
        : testerSubs.filter(s => !s.productId || prodIds.includes(s.productId));
      setAllSubs(filtered);
      setUserProducts(prodIds ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openReview = (sub) => {
    setSelected(sub);
    setReviewData(sub.rows.map(r => ({
      id:      r.id,
      marks:   sub.review?.rows.find(rv => rv.id === r.id)?.marks   ?? null,
      comment: sub.review?.rows.find(rv => rv.id === r.id)?.comment ?? "",
    })));
  };

  const submitReview = async () => {
    const updated = {
      ...selected,
      review: { reviewerUsername: currentUser, reviewedAt: Date.now(), rows: reviewData },
    };
    await dbSaveSubmission(updated);
    const [subs, prodIds] = await Promise.all([
      dbGetSubmissions(),
      isAdmin ? Promise.resolve(null) : dbGetUserProducts(currentUser),
    ]);
    const testerSubs = subs.filter(s => s.type === "tester");
    const filtered   = isAdmin || !prodIds || prodIds.length === 0
      ? testerSubs
      : testerSubs.filter(s => !s.productId || prodIds.includes(s.productId));
    setAllSubs(filtered);
    setSelected(null);
  };

  if (selected) {
    return (
      <div className="app">
        {zoomImg && <ImageZoomModal src={zoomImg.src} alt={zoomImg.alt} onClose={() => setZoomImg(null)} />}
        <header className="app-header">
          <div className="header-left">
            <h1>Reviewing: {selected.username}'s Submission</h1>
            <p className="header-sub">Submitted: {fmtDateTime(selected.endTime)}</p>
          </div>
          <div className="header-right">
            <button className="btn-secondary-sm" onClick={() => setSelected(null)}>← Back</button>
            <button className="btn-view-report" onClick={submitReview}>Submit Review</button>
            <ProfileMenu username={currentUser} onLogout={onLogout} />
          </div>
        </header>
        <main className="app-main">
          <div className="table-wrap">
            <table className="qa-table review-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th className="col-standard">Standard</th>
                  <th className="col-obs">Observation</th>
                  <th className="col-shot">Photo</th>
                  <th className="col-score">Marks</th>
                  <th className="col-comment">Comment</th>
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((row, i) => {
                  const color = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
                  const rd    = reviewData[i] ?? { marks: null, comment: "" };
                  return (
                    <tr key={row.id} className={rd.marks !== null ? "row-pass" : "row-neutral"}>
                      <td className="col-num">{row.id}</td>
                      <td><span className="std-badge" style={{ background:color }}>{row.standard}</span></td>
                      <td className="col-obs">{row.observation}</td>
                      <td>
                        {row.screenshot?.base64
                          ? <div className="screenshot-thumb-wrap">
                              <img src={row.screenshot.base64} className="screenshot-thumb review-img"
                                onClick={() => setZoomImg({ src: row.screenshot.base64, alt: row.screenshot.name })}
                                title="Click to zoom" />
                              <div className="review-img-hint">Click to zoom</div>
                            </div>
                          : <span className="no-screenshot">No photo</span>
                        }
                      </td>
                      <td>
                        <div className="score-row">
                          <input type="number" min={0} max={row.possibleMarks}
                            value={rd.marks ?? ""} placeholder="—"
                            className={`score-input${rd.marks === null ? " empty" : ""}`}
                            onChange={e => {
                              const v = e.target.value === "" ? null : Math.min(row.possibleMarks, Math.max(0, Number(e.target.value)));
                              setReviewData(p => p.map((r, j) => j === i ? { ...r, marks: v } : r));
                            }} />
                          <span className="score-max">/ {row.possibleMarks}</span>
                        </div>
                      </td>
                      <td>
                        <textarea className="note-textarea review-comment" rows={2}
                          placeholder="Add comment…"
                          value={rd.comment}
                          onChange={e => setReviewData(p => p.map((r, j) => j === i ? { ...r, comment: e.target.value } : r))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    );
  }

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortKey = (sub) => {
    const uploaded = sub.rows.filter(r => r.screenshot).length;
    if (sortCol === "tester")   return sub.username.toLowerCase();
    if (sortCol === "date")     return sub.endTime;
    if (sortCol === "photos")   return uploaded / sub.rows.length;
    if (sortCol === "status")   return sub.review ? 0 : 1;
    if (sortCol === "reviewer") return (sub.review?.reviewerUsername ?? "").toLowerCase();
    return 0;
  };

  const sorted = [...allSubs].sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortTh = ({ col, children, style }) => {
    const active = sortCol === col;
    return (
      <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}
        onClick={() => toggleSort(col)}>
        {children}
        <span className={`sort-arrow ${active ? "sort-active" : ""}`}>
          {active ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
        </span>
      </th>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left"><h1>Review Tester Submissions</h1></div>
        <div className="header-right">
          <button className="btn-secondary-sm" onClick={onBack}>← Portal</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {loading ? <div className="portal-empty"><p>Loading submissions…</p></div> : allSubs.length === 0
          ? <div className="portal-empty">
              <div className="portal-empty-icon">📭</div>
              <h3>No Tester Submissions Yet</h3>
              <p>Submissions will appear here once testers submit their screenshots.</p>
            </div>
          : <div className="table-wrap">
              <table className="qa-table">
                <thead>
                  <tr>
                    <SortTh col="tester">Tester</SortTh>
                    <SortTh col="date">Submitted At</SortTh>
                    <th>Product</th>
                    <th>Test</th>
                    <SortTh col="photos">Photos</SortTh>
                    <SortTh col="status">Status</SortTh>
                    <SortTh col="reviewer">Reviewed By</SortTh>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(sub => {
                    const uploaded = sub.rows.filter(r => r.screenshot).length;
                    const reviewed = !!sub.review;
                    return (
                      <tr key={sub.id}>
                        <td><strong>{sub.username}</strong></td>
                        <td>{fmtDateTime(sub.endTime)}</td>
                        <td>{sub.productName ? <span className="product-chip">{sub.productName}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
                        <td><span className="tp-name-badge">{sub.profileName ?? "—"}</span></td>
                        <td><span className={`upload-count ${uploaded === sub.rows.length ? "full" : "partial"}`}>{uploaded}/{sub.rows.length}</span></td>
                        <td><span className={`status-badge ${reviewed ? "badge-done" : "badge-pending"}`}>{reviewed ? "Reviewed" : "Pending"}</span></td>
                        <td>{sub.review?.reviewerUsername ?? "—"}</td>
                        <td><button className="btn-view-report sm" onClick={() => openReview(sub)}>{reviewed ? "Edit Review" : "Start Review"}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </main>
    </div>
  );
}

// ── Download helper ───────────────────────────────────────────────────────────
function downloadReportFile(html, filename) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([html], { type: "text/html" })),
    download: filename,
  });
  a.click();
}

// ── InlineReportViewer ────────────────────────────────────────────────────────
function InlineReportViewer({ sub, currentUser, onBack, onLogout }) {
  const [zoomImg,     setZoomImg]     = useState(null);
  const [showReview,  setShowReview]  = useState(false);
  const sess = { username: sub.username, testingStart: sub.startTime, testingEnd: sub.endTime };
  const isAdmin  = sub.type === "admin";
  const isTester = sub.type === "tester";

  const totalPossible = sub.rows.reduce((s, r) => s + (r.possibleMarks ?? 0), 0);
  const totalEarned   = sub.rows.reduce((s, r) => s + (r.earnedScore  ?? 0), 0);
  const pct           = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : "—";
  const passed        = sub.rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks >= 0.8).length;
  const failed        = sub.rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks < 0.5).length;
  const uploaded      = sub.rows.filter(r => r.screenshot).length;

  const handleDownload = () => {
    if (isTester) openTesterReport(sub.rows, { ...sess, mode: "tester" });
    else          openReport(sub.rows, sess);
  };

  const reviewEarned = sub.review?.rows.reduce((s, r) => s + (r.marks ?? 0), 0) ?? 0;

  return (
    <div className="app">
      {zoomImg && <ImageZoomModal src={zoomImg.src} alt={zoomImg.alt} onClose={() => setZoomImg(null)} />}
      <header className="app-header">
        <div className="header-left">
          <h1 style={{ fontSize: "1rem", wordBreak: "break-all" }}>{fmtReportName(sub)}</h1>
          <p className="header-sub">
            {sub.username} · {fmtDateTime(sub.endTime)} · {fmtDuration(sub.endTime - sub.startTime)}
          </p>
        </div>
        <div className="header-right">
          <button className="btn-pdf btn-pdf-lg" onClick={handleDownload}>⬇ Download PDF</button>
          {isTester && sub.review && (
            <button className="btn-secondary-sm" onClick={() => setShowReview(v => !v)}>
              {showReview ? "Hide Review" : "View Review"}
            </button>
          )}
          <button className="btn-secondary-sm" onClick={onBack}>← All Reports</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {/* Summary */}
        {isAdmin && (
          <div className="summary-bar">
            <div className="summary-card blue"><span className="summary-value">{sub.rows.length}</span><span className="summary-label">Questions</span></div>
            <div className="summary-card green"><span className="summary-value">{totalEarned}<small>/{totalPossible}</small></span><span className="summary-label">Marks</span></div>
            <div className="summary-card purple"><span className="summary-value">{pct}{pct !== "—" ? "%" : ""}</span><span className="summary-label">Score</span></div>
            <div className="summary-card teal"><span className="summary-value">{passed}</span><span className="summary-label">Passed</span></div>
            <div className="summary-card red"><span className="summary-value">{failed}</span><span className="summary-label">Failed</span></div>
          </div>
        )}
        {isTester && (
          <div className="summary-bar">
            <div className="summary-card blue"><span className="summary-value">{sub.rows.length}</span><span className="summary-label">Questions</span></div>
            <div className="summary-card green"><span className="summary-value">{uploaded}</span><span className="summary-label">Uploaded</span></div>
            <div className="summary-card red"><span className="summary-value">{sub.rows.length - uploaded}</span><span className="summary-label">Missing</span></div>
            <div className="summary-card purple"><span className="summary-value">{((uploaded / sub.rows.length) * 100).toFixed(0)}%</span><span className="summary-label">Completion</span></div>
            {sub.review && (
              <div className="summary-card teal">
                <span className="summary-value">{reviewEarned}<small>/{totalPossible}</small></span>
                <span className="summary-label">Review Score</span>
              </div>
            )}
          </div>
        )}
        {/* Main question table */}
        <div className="table-wrap">
          <table className="qa-table rv-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-standard">Standard</th>
                <th className="col-obs">Observation</th>
                {isAdmin && <th style={{ width: 110, textAlign: "center" }}>Marks</th>}
                {isAdmin && <th style={{ width: 80, textAlign: "center" }}>Status</th>}
                <th className="col-shot">Screenshot</th>
              </tr>
            </thead>
            <tbody>
              {sub.rows.map(row => {
                const color  = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
                const p      = row.possibleMarks && row.earnedScore !== null ? row.earnedScore / row.possibleMarks : null;
                const status = p !== null ? (p >= 0.8 ? "PASS" : p < 0.5 ? "FAIL" : "WARN") : null;
                const rowCls = status === "PASS" ? "row-pass" : status === "FAIL" ? "row-fail" : status === "WARN" ? "row-warn" : "row-neutral";
                return (
                  <tr key={row.id} className={rowCls}>
                    <td className="col-num">{row.id}</td>
                    <td><span className="std-badge" style={{ background: color }}>{row.standard}</span></td>
                    <td className="col-obs">
                      {row.observation}
                      {row.evalNote?.trim() && (
                        <div className="rv-note">{row.evalNote.trim()}</div>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: "center" }}>
                        <strong>{row.earnedScore ?? "—"}</strong>
                        <span className="score-max"> / {row.possibleMarks ?? "—"}</span>
                      </td>
                    )}
                    {isAdmin && (
                      <td style={{ textAlign: "center" }}>
                        {status && <span className={`rv-status rv-${status.toLowerCase()}`}>{status}</span>}
                      </td>
                    )}
                    <td>
                      {row.screenshot?.base64
                        ? <div className="screenshot-thumb-wrap rv-thumb-wrap">
                            <img src={row.screenshot.base64} className="screenshot-thumb rv-thumb"
                              onClick={() => setZoomImg({ src: row.screenshot.base64, alt: row.screenshot.name })}
                              title="Click to zoom" />
                            <div className="review-img-hint">Click to zoom</div>
                          </div>
                        : <span className="no-screenshot">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Review section */}
        {isTester && sub.review && showReview && (
          <div className="rv-review-section">
            <h3 className="rv-review-title">
              Review by <strong>{sub.review.reviewerUsername}</strong> · {fmtDateTime(sub.review.reviewedAt)}
            </h3>
            <div className="table-wrap">
              <table className="qa-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-standard">Standard</th>
                    <th style={{ width: 110, textAlign: "center" }}>Marks</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {sub.review.rows.map(rv => {
                    const q     = sub.rows.find(r => r.id === rv.id);
                    const color = CATEGORY_COLORS[q?.standard.split("-")[0]] ?? "#888";
                    return (
                      <tr key={rv.id}>
                        <td className="col-num">{rv.id}</td>
                        <td><span className="std-badge" style={{ background: color }}>{q?.standard}</span></td>
                        <td style={{ textAlign: "center" }}>
                          <strong>{rv.marks ?? "—"}</strong>
                          <span className="score-max"> / {q?.possibleMarks ?? "—"}</span>
                        </td>
                        <td style={{ color: rv.comment ? "#333" : "#bbb", fontStyle: rv.comment ? "normal" : "italic", fontSize: "13px" }}>
                          {rv.comment || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── ReportsPortal ─────────────────────────────────────────────────────────────
function ReportsPortal({ currentUser, currentRole, onBack, onLogout }) {
  const [allSubs,       setAllSubs]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [viewingSub,    setViewingSub]    = useState(null);
  const [sortCol,       setSortCol]       = useState("date");
  const [sortDir,       setSortDir]       = useState("desc");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const isAdmin    = currentRole === "admin";
  const isReviewer = currentRole === "reviewer";
  const isTester   = currentRole === "tester";
  const canManage  = isAdmin || isReviewer;

  useEffect(() => {
    dbGetSubmissions().then(subs => {
      const filtered = isTester ? subs.filter(s => s.review) : subs;
      setAllSubs(filtered);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    await dbDeleteSubmission(deleteConfirm.id);
    setAllSubs(prev => prev.filter(s => s.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  if (viewingSub) {
    return <InlineReportViewer sub={viewingSub} currentUser={currentUser}
      onBack={() => setViewingSub(null)} onLogout={onLogout} />;
  }

  const downloadSub = (sub) => {
    const sess = { username: sub.username, testingStart: sub.startTime, testingEnd: sub.endTime };
    if (sub.type === "tester") openTesterReport(sub.rows, { ...sess, mode: "tester" });
    else                       openReport(sub.rows, sess);
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortKey = (sub) => {
    if (sortCol === "name")     return fmtReportName(sub).toLowerCase();
    if (sortCol === "type")     return sub.type;
    if (sortCol === "date")     return sub.endTime;
    if (sortCol === "duration") return sub.endTime - sub.startTime;
    if (sortCol === "status") {
      if (sub.type === "admin")          return "0_complete";
      if (sub.review)                    return "1_reviewed";
      return "2_pending";
    }
    return 0;
  };

  const sorted = [...allSubs].sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortTh = ({ col, children, style }) => {
    const active = sortCol === col;
    return (
      <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}
        onClick={() => toggleSort(col)}>
        {children}
        <span className={`sort-arrow ${active ? "sort-active" : ""}`}>
          {active ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
        </span>
      </th>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left"><h1>All Reports</h1></div>
        <div className="header-right">
          <button className="btn-secondary-sm" onClick={onBack}>← Portal</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {loading ? <div className="portal-empty"><p>Loading reports…</p></div> : allSubs.length === 0
          ? <div className="portal-empty">
              <div className="portal-empty-icon">📂</div>
              <h3>No Reports Yet</h3>
              <p>Completed testing sessions will appear here.</p>
            </div>
          : <div className="table-wrap">
              <table className="qa-table">
                <thead>
                  <tr>
                    <SortTh col="name">Report Name</SortTh>
                    <SortTh col="type">Type</SortTh>
                    <th>Product</th>
                    <th>Test</th>
                    <SortTh col="date">Date &amp; Time</SortTh>
                    <SortTh col="duration">Duration</SortTh>
                    <SortTh col="status">Status</SortTh>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(sub => (
                    <tr key={sub.id}>
                      <td><code className="report-name">{fmtReportName(sub)}</code></td>
                      <td><span className={`portal-type-badge type-${sub.type}`}>{sub.type === "tester" ? "By Tester" : "Automation"}</span></td>
                      <td>{sub.productName ? <span className="product-chip">{sub.productName}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
                      <td><span className="tp-name-badge">{sub.profileName ?? "—"}</span></td>
                      <td>{fmtDateTime(sub.endTime)}</td>
                      <td>{fmtDuration(sub.endTime - sub.startTime)}</td>
                      <td>
                        {sub.type === "tester"
                          ? <span className={`status-badge ${sub.review ? "badge-done" : "badge-pending"}`}>{sub.review ? "Reviewed" : "Pending Review"}</span>
                          : <span className="status-badge badge-done">Complete</span>
                        }
                      </td>
                      <td>
                        <div className="report-actions">
                          <button className="btn-view-report sm" onClick={() => setViewingSub(sub)}>View</button>
                          <button className="btn-pdf" onClick={() => downloadSub(sub)}>⬇ PDF</button>
                          {sub.review && <button className="btn-pdf btn-pdf-review" onClick={() => openReviewedReport(sub)}>⬇ Review PDF</button>}
                          {canManage && <button className="btn-delete-report sm" onClick={() => setDeleteConfirm(sub)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </main>
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Delete Report?</h3>
            <p>Permanently delete report <strong>{fmtReportName(deleteConfirm)}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── BrandTitle ────────────────────────────────────────────────────────────────
function BrandTitle() {
  return (
    <div className="brand-title">
      <div className="brand-icon">QA</div>
      <div className="brand-text">
        <span className="brand-main">Automation Testing</span>
        <span className="brand-sub">Dashboard</span>
      </div>
    </div>
  );
}

// ── SubmitSuccessModal ────────────────────────────────────────────────────────
function SubmitSuccessModal({ isTester, onBackToPortal, onViewReports }) {
  return (
    <div className="modal-overlay">
      <div className="modal submit-success-modal">
        <div className="submit-success-icon">✅</div>
        <h3>{isTester ? "Screenshots Submitted!" : "Report Submitted!"}</h3>
        <p>
          {isTester
            ? "Your screenshots have been submitted for review. You can track the status in All Reports."
            : "Your report has been saved and is now available in the All Reports panel."
          }
        </p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onBackToPortal}>Back to Portal</button>
          <button className="btn-confirm" onClick={onViewReports}>View All Reports</button>
        </div>
      </div>
    </div>
  );
}

// ── CountdownBadge ────────────────────────────────────────────────────────────
function CountdownBadge({ remaining, urgent, warning }) {
  return (
    <div className={`countdown ${urgent ? "urgent" : warning ? "warning" : ""}`}>
      <span className="countdown-label">Time Remaining</span>
      <span className="countdown-time">{fmtDuration(remaining)}</span>
    </div>
  );
}

// ── TestingProfilesPortal ─────────────────────────────────────────────────────
function TestingProfilesPortal({ currentUser, onEdit, onBack, onLogout }) {
  const [profiles,     setProfiles]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renaming,     setRenaming]     = useState(null);
  const [msg,          setMsg]          = useState(null);

  const notify = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    dbGetProfiles().then(ps => { setProfiles(ps); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const id   = `p_${Date.now()}`;
    const name = `Testing ${profiles.length + 1}`;
    const profile = { id, name, createdAt: Date.now(), questions: QUESTIONS.map(q => ({ ...q })) };
    await dbSaveProfile(profile);
    const ps = await dbGetProfiles();
    setProfiles(ps);
    notify("ok", `"${name}" created with ${QUESTIONS.length} default questions.`);
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    await dbDeleteProfile(target.id);
    setProfiles(await dbGetProfiles());
    notify("ok", `"${target.name}" deleted.`);
  };

  const handleRename = async () => {
    if (!renaming.name.trim()) return;
    const p = profiles.find(x => x.id === renaming.id);
    if (p) {
      await dbSaveProfile({ ...p, name: renaming.name.trim() });
      setProfiles(await dbGetProfiles());
    }
    setRenaming(null);
  };

  return (
    <div className="app">
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Profile?</h3>
            <p>Permanently delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
      {renaming && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Rename Profile</h3>
            <input className="login-input" style={{ width: "100%", marginTop: 10 }}
              value={renaming.name} autoFocus
              onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleRename()} />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="btn-confirm" onClick={handleRename}>Rename</button>
            </div>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="header-left">
          <h1>Testing Profiles</h1>
          <p className="header-sub">{profiles.length} profile{profiles.length !== 1 ? "s" : ""} · select a profile when starting a session</p>
        </div>
        <div className="header-right">
          <button className="btn-start btn-start-gray" style={{ padding: "9px 18px", fontSize: 13 }} onClick={handleCreate}>+ New Testing</button>
          <button className="btn-secondary-sm" onClick={onBack}>← Portal</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {msg && <div className={`qp-alert ${msg.type}`}>{msg.text}</div>}
        {loading ? <div className="portal-empty"><p>Loading profiles…</p></div> : profiles.length === 0 ? (
          <div className="tp-empty">
            <div className="tp-empty-icon">📋</div>
            <h3>No Testing Profiles Yet</h3>
            <p>Create profiles to define custom question sets for different testing scenarios.</p>
            <button className="btn-start" style={{ marginTop: 20 }} onClick={handleCreate}>+ Create First Profile</button>
          </div>
        ) : (
          <div className="tp-grid">
            {profiles.map(p => {
              const totalMarks = (p.questions ?? []).reduce((s, q) => s + (q.possibleMarks ?? 0), 0);
              return (
                <div className="tp-card" key={p.id}>
                  <div className="tp-card-top">
                    <span className="tp-card-icon">📋</span>
                    <div className="tp-card-name">{p.name}</div>
                  </div>
                  <div className="tp-card-meta">
                    <span>{(p.questions ?? []).length} questions</span>
                    <span className="tp-dot">·</span>
                    <span>{totalMarks} total marks</span>
                  </div>
                  <div className="tp-card-date">Created {fmtDateTime(p.createdAt)}</div>
                  <div className="tp-card-actions">
                    <button className="btn-view-report" onClick={() => onEdit(p)}>✎ Edit Questions</button>
                    <button className="btn-upload small" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</button>
                    <button className="btn-danger-sm" onClick={() => setDeleteTarget(p)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── ProfileEditorPortal ───────────────────────────────────────────────────────
function ProfileEditorPortal({ profile: initialProfile, currentUser, onBack, onLogout }) {
  const [profile, setProfile] = useState(initialProfile);
  const [qs,      setQs]      = useState(() => initialProfile.questions ?? []);
  const [dirty,   setDirty]   = useState(false);
  const [msg,     setMsg]     = useState(null);

  const notify = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const updateField = (idx, field, value) => {
    setQs(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
    setDirty(true);
  };

  const addQuestion = () => {
    const nextId = qs.length > 0 ? Math.max(...qs.map(q => q.id ?? 0)) + 1 : 1;
    setQs(prev => [...prev, { id: nextId, standard: "", observation: "", possibleMarks: 10 }]);
    setDirty(true);
  };

  const deleteQuestion = (idx) => { setQs(prev => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const saveChanges = async () => {
    for (let i = 0; i < qs.length; i++) {
      if (!qs[i].standard?.trim())    { notify("err", `Row ${i+1}: Standard is required.`);    return; }
      if (!qs[i].observation?.trim()) { notify("err", `Row ${i+1}: Observation is required.`); return; }
    }
    const saved = qs.map((q, i) => ({
      id: q.id ?? i + 1, standard: q.standard.trim(),
      observation: q.observation.trim(),
      possibleMarks: q.possibleMarks != null ? Number(q.possibleMarks) : 10,
    }));
    const updated = { ...profile, questions: saved };
    await dbSaveProfile(updated);
    setProfile(updated);
    setQs(saved);
    setDirty(false);
    notify("ok", `${saved.length} questions saved to "${profile.name}".`);
  };

  const resetToDefault = () => { setQs(QUESTIONS.map(q => ({ ...q }))); setDirty(true); notify("ok", "Reset to default questions — click Save to apply."); };

  const handleJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data) || data.length === 0) throw new Error("Must be a non-empty array.");
        data.forEach((q, i) => { if (!q.standard || !q.observation) throw new Error(`Item ${i+1}: missing standard or observation.`); });
        const mapped = data.map((q, i) => ({ id: q.id ?? i+1, standard: String(q.standard).trim(), observation: String(q.observation).trim(), possibleMarks: q.possibleMarks ? Number(q.possibleMarks) : 10 }));
        setQs(mapped); setDirty(true); notify("ok", `${mapped.length} questions loaded — click Save to apply.`);
      } catch (err) { notify("err", `JSON error: ${err.message}`); }
    };
    r.readAsText(file);
  };

  const handleCSV = (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const lines = ev.target.result.trim().split(/\r?\n/);
        const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g,"").trim().toLowerCase());
        if (!headers.includes("standard") || !headers.includes("observation")) throw new Error('CSV must have "standard" and "observation" columns.');
        const mapped = lines.slice(1).filter(l => l.trim()).map((line, i) => {
          const vals = parseCSVLine(line).map(v => v.replace(/^"|"$/g,"").trim());
          const obj  = Object.fromEntries(headers.map((h, j) => [h, vals[j] ?? ""]));
          if (!obj.standard || !obj.observation) throw new Error(`Row ${i+2}: missing standard or observation.`);
          return { id: parseInt(obj.id) || i+1, standard: obj.standard, observation: obj.observation, possibleMarks: obj.possiblemarks ? Number(obj.possiblemarks) : 10 };
        });
        setQs(mapped); setDirty(true); notify("ok", `${mapped.length} questions loaded — click Save to apply.`);
      } catch (err) { notify("err", `CSV error: ${err.message}`); }
    };
    r.readAsText(file);
  };

  const totalMarks = qs.reduce((s, q) => s + (Number(q.possibleMarks) || 0), 0);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>{profile.name}</h1>
          <p className="header-sub">{qs.length} question{qs.length !== 1 ? "s" : ""} · {totalMarks} total marks</p>
        </div>
        <div className="header-right">
          {dirty && <button className="btn-view-report" onClick={saveChanges}>Save Changes</button>}
          <button className="btn-secondary-sm" onClick={onBack}>← Profiles</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {msg && <div className={`qp-alert ${msg.type}`}>{msg.text}</div>}
        <div className="qp-toolbar">
          <div className="qp-actions">
            <button className="btn-upload qp-add-btn" onClick={addQuestion}>+ Add Question</button>
            <label className="btn-upload">📄 Upload JSON<input type="file" accept=".json,application/json" onChange={handleJSON} hidden /></label>
            <label className="btn-upload">📊 Upload CSV<input type="file" accept=".csv,text/csv" onChange={handleCSV} hidden /></label>
            <button className="btn-discard" onClick={resetToDefault}>Reset to Default</button>
          </div>
          {dirty && <span className="status-badge badge-pending">Unsaved changes</span>}
        </div>
        <div className="table-wrap">
          <table className="qa-table qp-edit-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th style={{ width: 130 }}>Standard</th>
                <th>Observation</th>
                <th style={{ width: 90, textAlign: "center" }}>Marks</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={q.id ?? i} className="row-neutral">
                  <td className="col-num">{i + 1}</td>
                  <td><input className="qp-inline-input qp-std-input" value={q.standard} placeholder="e.g. FUNC-001" onChange={e => updateField(i, "standard", e.target.value)} /></td>
                  <td><textarea className="qp-inline-textarea" value={q.observation} placeholder="Describe the test observation…" rows={2} onChange={e => updateField(i, "observation", e.target.value)} /></td>
                  <td style={{ textAlign: "center" }}>
                    <input type="number" min={1} max={100} className="qp-marks-input" value={q.possibleMarks ?? ""} placeholder="10"
                      onChange={e => updateField(i, "possibleMarks", e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))} />
                  </td>
                  <td><button className="qp-delete-btn" title="Delete" onClick={() => deleteQuestion(i)}>✕</button></td>
                </tr>
              ))}
              {qs.length === 0 && <tr><td colSpan={5} className="empty-row">No questions. Click "+ Add Question" to create one.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="qp-footer-row">
          <button className="btn-upload qp-add-btn" onClick={addQuestion}>+ Add Question</button>
          {dirty && <button className="btn-view-report" onClick={saveChanges}>Save Changes</button>}
        </div>
      </main>
    </div>
  );
}

// ── ProfilePickerPortal ── two-step: Product → Profile ───────────────────────
function ProfilePickerPortal({ mode, session, onPick, onCancel, onLogout }) {
  const [products,         setProducts]         = useState([]);
  const [profiles,         setProfiles]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [step,             setStep]             = useState("product"); // "product" | "profile"
  const [selectedProduct,  setSelectedProduct]  = useState(null);
  const [skipProducts,     setSkipProducts]     = useState(false);
  const [noAccess,         setNoAccess]         = useState(false);
  const role      = session.role ?? "tester";
  const isAdmin   = role === "admin";
  const modeLabel = mode === "tester" ? "Tester Session" : "Automation Testing";

  useEffect(() => {
    Promise.all([
      dbGetProducts(),
      dbGetProfiles(),
      isAdmin ? Promise.resolve(null) : dbGetUserProducts(session.username),
    ]).then(([allProds, profs, userProdIds]) => {
      const accessible = isAdmin ? allProds : allProds.filter(p => userProdIds.includes(p.id));
      setProfiles(profs);
      setProducts(accessible);
      if (accessible.length === 0 && !isAdmin && allProds.length > 0) {
        setNoAccess(true);
      } else if (accessible.length === 0) {
        setSkipProducts(true);
        setStep("profile");
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handlePickProduct = (product) => {
    if (profiles.length === 0) { onPick(null, null, product.id, product.name); return; }
    setSelectedProduct(product);
    setStep("profile");
  };

  const handleBack = () => {
    if (step === "profile" && !skipProducts) { setStep("product"); setSelectedProduct(null); }
    else onCancel();
  };

  const subtitle = step === "product"
    ? `Starting ${modeLabel} — select a product`
    : selectedProduct ? `${selectedProduct.name} · select a testing profile` : `Starting ${modeLabel} — select a profile`;

  if (loading) {
    return (
      <div className="idle-page">
        <header className="app-header">
          <div className="header-left"><BrandTitle /><p className="header-sub">Loading…</p></div>
          <div className="header-right"><ProfileMenu username={session.username} onLogout={onLogout} /></div>
        </header>
        <div className="idle-body"><p style={{ color: "#aaa" }}>Loading…</p></div>
      </div>
    );
  }

  if (noAccess) {
    return (
      <div className="idle-page">
        <header className="app-header">
          <div className="header-left"><BrandTitle /><p className="header-sub">Starting {modeLabel}</p></div>
          <div className="header-right">
            <button className="btn-secondary-sm" onClick={onCancel}>← Back</button>
            <ProfileMenu username={session.username} onLogout={onLogout} />
          </div>
        </header>
        <div className="idle-body">
          <div className="tp-empty">
            <div className="tp-empty-icon">🔒</div>
            <h3>No Products Assigned</h3>
            <p>You don't have access to any products yet. Contact your admin to get product access assigned to your account.</p>
            <button className="btn-secondary-sm" style={{ marginTop: 20 }} onClick={onCancel}>← Back to Portal</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="idle-page">
      <header className="app-header">
        <div className="header-left"><BrandTitle /><p className="header-sub">{subtitle}</p></div>
        <div className="header-right">
          <button className="btn-secondary-sm" onClick={handleBack}>← Back</button>
          <ProfileMenu username={session.username} onLogout={onLogout} />
        </div>
      </header>
      <div className="idle-body" style={{ alignItems: "flex-start" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
          {step === "product" && (
            <>
              <div className="portal-welcome" style={{ marginBottom: 24 }}>
                <h2>Select Product</h2>
                <p>Choose which product to test for this {modeLabel.toLowerCase()}.</p>
              </div>
              <div className="prod-picker-grid">
                {products.map(p => (
                  <button key={p.id} className="prod-picker-card" onClick={() => handlePickProduct(p)}>
                    <span className="prod-picker-icon">🏷️</span>
                    <strong className="prod-picker-name">{p.name}</strong>
                    {p.description && <span className="prod-picker-desc">{p.description}</span>}
                    <span className="tp-picker-arrow">→</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === "profile" && (
            <>
              <div className="portal-welcome" style={{ marginBottom: 24 }}>
                <h2>Select Testing Profile</h2>
                <p>Choose which question set to use{selectedProduct ? ` for ${selectedProduct.name}` : ""}.</p>
              </div>
              {profiles.length === 0
                ? <div className="tp-empty">
                    <div className="tp-empty-icon">📋</div>
                    <h3>No Profiles Yet</h3>
                    <p>Admin needs to create testing profiles in Testing Profiles portal.</p>
                  </div>
                : <div className="tp-picker-list">
                    {profiles.map(p => (
                      <button key={p.id} className="tp-picker-item"
                        onClick={() => onPick(p.questions, p.name, selectedProduct?.id ?? null, selectedProduct?.name ?? null)}>
                        <span className="tp-picker-icon">📋</span>
                        <div className="tp-picker-info">
                          <strong>{p.name}</strong>
                          <span>{(p.questions ?? []).length} questions · {(p.questions ?? []).reduce((s, q) => s + (q.possibleMarks ?? 0), 0)} total marks</span>
                        </div>
                        <span className="tp-picker-arrow">→</span>
                      </button>
                    ))}
                  </div>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProductsPortal ────────────────────────────────────────────────────────────
function ProductsPortal({ currentUser, onBack, onLogout }) {
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [creating,     setCreating]     = useState(false);
  const [form,         setForm]         = useState({ name: "", description: "" });
  const [formErr,      setFormErr]      = useState("");
  const [msg,          setMsg]          = useState(null);

  const notify = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    dbGetProducts().then(ps => { setProducts(ps); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormErr("Product name is required."); return; }
    const slug = form.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || `prod_${Date.now()}`;
    const id   = products.find(p => p.id === slug) ? `${slug}_${Date.now()}` : slug;
    await dbSaveProduct({ id, name: form.name.trim(), description: form.description.trim(), createdAt: Date.now() });
    setProducts(await dbGetProducts());
    setCreating(false); setForm({ name: "", description: "" }); setFormErr("");
    notify("ok", `Product "${form.name.trim()}" created.`);
  };

  const handleEdit = async () => {
    if (!editing.name.trim()) return;
    const p = products.find(x => x.id === editing.id);
    await dbSaveProduct({ ...p, name: editing.name.trim(), description: editing.desc.trim() });
    setProducts(await dbGetProducts()); setEditing(null);
    notify("ok", "Product updated.");
  };

  const handleDelete = async () => {
    const target = deleteTarget; setDeleteTarget(null);
    await dbDeleteProduct(target.id);
    setProducts(await dbGetProducts());
    notify("ok", `"${target.name}" deleted.`);
  };

  return (
    <div className="app">
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Product?</h3>
            <p>Permanently delete <strong>{deleteTarget.name}</strong>? Users will lose access and submissions won't be filterable by this product.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Edit Product</h3>
            <label className="login-label" style={{ marginTop: 12, display: "block" }}>Name</label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }} value={editing.name} autoFocus
              onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleEdit()} />
            <label className="login-label" style={{ marginTop: 12, display: "block" }}>Description</label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }} value={editing.desc} placeholder="Optional description…"
              onChange={e => setEditing(v => ({ ...v, desc: e.target.value }))} />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-confirm" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
      {creating && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Product</h3>
            {formErr && <div className="qp-alert err" style={{ marginTop: 8 }}>{formErr}</div>}
            <label className="login-label" style={{ marginTop: 12, display: "block" }}>Name <span style={{ color: "#e05c5c" }}>*</span></label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }} value={form.name} autoFocus placeholder="e.g. PE, PT, PL…"
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleCreate()} />
            <label className="login-label" style={{ marginTop: 12, display: "block" }}>Description</label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }} value={form.description} placeholder="Optional description…"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setCreating(false); setFormErr(""); setForm({ name: "", description: "" }); }}>Cancel</button>
              <button className="btn-confirm" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="header-left">
          <h1>Manage Products</h1>
          <p className="header-sub">{products.length} product{products.length !== 1 ? "s" : ""} · assign access per user in Manage Accounts</p>
        </div>
        <div className="header-right">
          <button className="btn-start btn-start-red" style={{ padding: "9px 18px", fontSize: 13 }} onClick={() => setCreating(true)}>+ New Product</button>
          <button className="btn-secondary-sm" onClick={onBack}>← Portal</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {msg && <div className={`qp-alert ${msg.type}`}>{msg.text}</div>}
        {loading ? <div className="portal-empty"><p>Loading products…</p></div> : products.length === 0 ? (
          <div className="tp-empty">
            <div className="tp-empty-icon">🏷️</div>
            <h3>No Products Yet</h3>
            <p>Create products (PE, PT, PL…) then assign users to each product in Manage Accounts.</p>
            <button className="btn-start btn-start-red" style={{ marginTop: 20 }} onClick={() => setCreating(true)}>+ Create First Product</button>
          </div>
        ) : (
          <div className="tp-grid">
            {products.map(p => (
              <div className="tp-card prod-card" key={p.id}>
                <div className="tp-card-top">
                  <span className="tp-card-icon">🏷️</span>
                  <div className="tp-card-name">{p.name}</div>
                </div>
                {p.description && <div className="tp-card-meta" style={{ fontStyle: "italic" }}>{p.description}</div>}
                <div className="tp-card-meta"><span className="prod-id-badge">{p.id}</span></div>
                <div className="tp-card-actions">
                  <button className="btn-upload small" onClick={() => setEditing({ id: p.id, name: p.name, desc: p.description })}>Edit</button>
                  <button className="btn-danger-sm" onClick={() => setDeleteTarget(p)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── AccountsPortal ────────────────────────────────────────────────────────────
const ROLES       = ["admin", "reviewer", "tester"];
const ROLE_LABELS = { admin: "Admin", reviewer: "Reviewer", tester: "Tester" };
const ROLE_COLORS = { admin: "#4f86c6", reviewer: "#9b73c8", tester: "#4ab8c8" };
const ROLE_DESC   = {
  admin:    "Full access — all portals including Manage Accounts",
  reviewer: "Can review tester submissions and view all reports",
  tester:   "Tester portal only — upload screenshots per session",
};

function AccountsPortal({ currentUser, onBack, onLogout }) {
  const [users,        setUsers]        = useState([]);
  const [allProducts,  setAllProducts]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [resetTarget,  setResetTarget]  = useState(null);
  const [newPw,        setNewPw]        = useState("");
  const [pwError,      setPwError]      = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [msg,          setMsg]          = useState(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [createForm,   setCreateForm]   = useState({ username: "", password: "", role: "tester", name: "", phone: "" });
  const [createError,  setCreateError]  = useState("");
  const [accessModal,  setAccessModal]  = useState(null); // { username, productIds: [] }
  const [accessLoading, setAccessLoading] = useState(false);

  const notify = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    Promise.all([dbGetAllUsers(), dbGetProducts()])
      .then(([us, ps]) => { setUsers(us); setAllProducts(ps); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reloadUsers = () => dbGetAllUsers().then(us => setUsers(us));

  const openAccessModal = async (username) => {
    setAccessLoading(true);
    const ids = await dbGetUserProducts(username);
    setAccessModal({ username, productIds: ids });
    setAccessLoading(false);
  };

  const saveAccess = async () => {
    await dbSetUserProducts(accessModal.username, accessModal.productIds);
    setAccessModal(null);
    notify("ok", `Product access updated for ${accessModal.username}.`);
  };

  const toggleProduct = (pid) => {
    setAccessModal(m => ({
      ...m,
      productIds: m.productIds.includes(pid)
        ? m.productIds.filter(id => id !== pid)
        : [...m.productIds, pid],
    }));
  };

  const handleRoleChange = async (username, role) => {
    await dbUpdateRole(username, role);
    await reloadUsers();
    notify("ok", `Privilege updated for ${username}.`);
  };

  const handleResetPw = async () => {
    const res = await dbResetPassword(resetTarget, newPw);
    if (res.error) { setPwError(res.error); return; }
    setResetTarget(null); setNewPw(""); setPwError("");
    notify("ok", `Password reset for ${resetTarget}.`);
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    await dbDeleteUser(target);
    await reloadUsers();
    notify("ok", `Account "${target}" deleted.`);
  };

  const handleCreate = async () => {
    setCreateError("");
    const res = await dbSignup(createForm.username, createForm.password, { name: createForm.name, phone: createForm.phone });
    if (res.error) { setCreateError(res.error); return; }
    if (createForm.role !== "tester") await dbUpdateRole(createForm.username.trim(), createForm.role);
    await reloadUsers();
    setShowCreate(false);
    const createdName = createForm.username.trim();
    const createdRole = createForm.role;
    setCreateForm({ username: "", password: "", role: "tester", name: "", phone: "" });
    notify("ok", `Account "${createdName}" created as ${ROLE_LABELS[createdRole]}.`);
  };

  return (
    <div className="app">
      {/* Create Account Modal */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Account</h3>
            <p style={{ marginBottom: 4 }}>Add a new user with a specified role.</p>
            {createError && <div className="qp-alert err" style={{ marginTop: 12 }}>{createError}</div>}
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>Full Name</label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }}
              value={createForm.name} placeholder="Full name…"
              onChange={e => { setCreateForm(f => ({ ...f, name: e.target.value })); setCreateError(""); }} />
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>Phone Number</label>
            <div className="acct-phone-wrap" style={{ marginTop: 6 }}>
              <span className="acct-phone-prefix">+91</span>
              <input className="login-input acct-phone-input"
                value={createForm.phone} placeholder="10-digit mobile number"
                maxLength={10}
                onChange={e => { setCreateForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "") })); setCreateError(""); }} />
            </div>
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>Username</label>
            <input className="login-input" style={{ width: "100%", marginTop: 6 }}
              value={createForm.username} placeholder="Username (min 3 chars)…"
              onChange={e => { setCreateForm(f => ({ ...f, username: e.target.value })); setCreateError(""); }} />
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>Password</label>
            <input type="password" className="login-input" style={{ width: "100%", marginTop: 6 }}
              value={createForm.password} placeholder="Password (min 6 chars)…"
              onChange={e => { setCreateForm(f => ({ ...f, password: e.target.value })); setCreateError(""); }} />
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>Role</label>
            <select className="acct-role-select" style={{ width: "100%", marginTop: 6, padding: "9px 12px" }}
              value={createForm.role}
              onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESC[r]}</option>)}
            </select>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setShowCreate(false); setCreateForm({ username: "", password: "", role: "tester", name: "", phone: "" }); setCreateError(""); }}>Cancel</button>
              <button className="btn-confirm" onClick={handleCreate}>Create Account</button>
            </div>
          </div>
        </div>
      )}
      {/* Product Access Modal */}
      {accessModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Product Access — {accessModal.username}</h3>
            <p style={{ marginBottom: 12 }}>Select which products this user can test and see reports for.</p>
            {allProducts.length === 0
              ? <p style={{ color: "#aaa", fontSize: 13 }}>No products created yet. Create products in Manage Products first.</p>
              : <div className="prod-access-list">
                  {allProducts.map(p => (
                    <label key={p.id} className="prod-access-item">
                      <input type="checkbox"
                        checked={accessModal.productIds.includes(p.id)}
                        onChange={() => toggleProduct(p.id)} />
                      <span className="prod-access-name">{p.name}</span>
                      {p.description && <span className="prod-access-desc">{p.description}</span>}
                    </label>
                  ))}
                </div>
            }
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setAccessModal(null)}>Cancel</button>
              <button className="btn-confirm" onClick={saveAccess}>Save Access</button>
            </div>
          </div>
        </div>
      )}
      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Reset Password — {resetTarget}</h3>
            <p>Set a new password (minimum 6 characters).</p>
            {pwError && <div className="qp-alert err" style={{ marginTop: 12 }}>{pwError}</div>}
            <label className="login-label" style={{ marginTop: 14, display: "block" }}>New Password</label>
            <input type="password" className="login-input" style={{ width: "100%", marginTop: 6 }}
              value={newPw} placeholder="New password…"
              onChange={e => { setNewPw(e.target.value); setPwError(""); }} />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => { setResetTarget(null); setNewPw(""); setPwError(""); }}>Cancel</button>
              <button className="btn-confirm" onClick={handleResetPw}>Reset Password</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Account?</h3>
            <p>Permanently delete <strong>{deleteTarget}</strong>? All their data stays in reports.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="header-left">
          <h1>Manage Accounts</h1>
          <p className="header-sub">{users.length} registered account{users.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="header-right">
          <button className="btn-start btn-start-indigo" style={{ padding: "9px 18px", fontSize: 13 }}
            onClick={() => setShowCreate(true)}>+ Create Account</button>
          <button className="btn-secondary-sm" onClick={onBack}>← Portal</button>
          <ProfileMenu username={currentUser} onLogout={onLogout} />
        </div>
      </header>
      <main className="app-main">
        {msg && <div className={`qp-alert ${msg.type}`}>{msg.text}</div>}
        {loading && <div className="portal-empty"><p>Loading accounts…</p></div>}
        <div className="table-wrap" style={{ display: loading ? "none" : undefined }}>
          <table className="qa-table acct-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Role / Privilege</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.username} className={u.username === currentUser ? "row-pass" : "row-neutral"}>
                  <td>
                    <div className="acct-user">
                      <span className="acct-avatar" style={{ background: ROLE_COLORS[u.role] ?? "#888" }}>
                        {(u.name || u.username).charAt(0).toUpperCase()}
                      </span>
                      <div>
                        {u.name && <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>}
                        <div style={{ color: u.name ? "#666" : undefined, fontSize: u.name ? 12 : 14 }}>
                          <strong style={{ fontWeight: u.name ? 400 : 700 }}>@{u.username}</strong>
                          {u.username === currentUser && <span className="acct-you-badge">You</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: "#555" }}>
                    {u.phone ? <span>+91 {u.phone}</span> : <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td>
                    <select className="acct-role-select"
                      value={u.role}
                      style={{ borderColor: ROLE_COLORS[u.role] ?? "#d0d4db", color: ROLE_COLORS[u.role] ?? "#333" }}
                      onChange={e => handleRoleChange(u.username, e.target.value)}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="acct-desc">{ROLE_DESC[u.role] ?? "—"}</td>
                  <td>
                    <div className="report-actions">
                      <button className="btn-upload small" disabled={accessLoading}
                        onClick={() => openAccessModal(u.username)}>
                        🏷️ Products
                      </button>
                      <button className="btn-upload small"
                        onClick={() => { setResetTarget(u.username); setNewPw(""); setPwError(""); }}>
                        🔑 Reset Password
                      </button>
                      {u.username !== currentUser && (
                        <button className="btn-danger-sm" onClick={() => setDeleteTarget(u.username)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="acct-legend">
          {ROLES.map(r => (
            <div key={r} className="acct-legend-item">
              <span className="acct-legend-dot" style={{ background: ROLE_COLORS[r] }} />
              <strong>{ROLE_LABELS[r]}</strong>
              <span>{ROLE_DESC[r]}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ── IdleScreen ────────────────────────────────────────────────────────────────
function IdleScreen({ session, onStart, onNavigate, onLogout }) {
  const role       = session.role ?? "tester";
  const isAdmin    = role === "admin";
  const canReview  = role === "admin" || role === "reviewer";

  return (
    <div className="idle-page">
      <header className="app-header">
        <div className="header-left">
          <BrandTitle />
          <p className="header-sub">
            Logged in as <strong style={{ color: "#fff" }}>{session.username}</strong>
            &nbsp;·&nbsp;
            <span className="session-role-badge" style={{ background: ROLE_COLORS[role] ?? "#888" }}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </p>
        </div>
        <div className="header-right"><ProfileMenu username={session.username} onLogout={onLogout} /></div>
      </header>
      <div className="idle-body portal-body">
        <div className="portal-welcome">
          <h2>Welcome, {session.username}</h2>
          <p>Select a portal to begin. Logged in at {fmtDateTime(session.loginTime)}.</p>
        </div>
        <div className="portal-cards">
          {canReview && (
            <div className="portal-card">
              <div className="portal-card-icon">🖥️</div>
              <h3>Automation Testing</h3>
              <p>Full QA evaluation with scoring, notes, and screenshots.</p>
              <ul className="portal-features">
                <li>Score each question (0–max marks)</li>
                <li>Add evaluation notes</li>
                <li>Upload or capture screenshots</li>
                <li>12-hour session window</li>
              </ul>
              <button className="btn-start" onClick={() => onStart("admin")}>Start Automation Testing</button>
            </div>
          )}
          <div className="portal-card portal-card-teal">
            <div className="portal-card-icon">📸</div>
            <h3>Tester Portal</h3>
            <p>Upload screenshots for each question — no scoring required.</p>
            <ul className="portal-features">
              <li>Upload or capture screenshot per question</li>
              <li>No scoring or notes needed</li>
              <li>60-minute session window</li>
            </ul>
            <button className="btn-start btn-start-teal" onClick={() => onStart("tester")}>Start Tester Session</button>
          </div>
          {canReview && (
            <div className="portal-card portal-card-orange">
              <div className="portal-card-icon">🔍</div>
              <h3>Review Submissions</h3>
              <p>Assess tester-submitted screenshots, assign marks and add comments.</p>
              <ul className="portal-features">
                <li>View each tester's uploaded photos</li>
                <li>Assign marks per question</li>
                <li>Add reviewer comments</li>
                <li>Generate reviewed report</li>
              </ul>
              <button className="btn-start btn-start-orange" onClick={() => onNavigate("review")}>Review Tester Submissions</button>
            </div>
          )}
          {(canReview || role === "tester") && (
            <div className="portal-card portal-card-purple">
              <div className="portal-card-icon">📋</div>
              <h3>All Reports</h3>
              <p>View all completed testing sessions and reviewed reports.</p>
              <ul className="portal-features">
                <li>Automation testing reports</li>
                <li>Tester submissions with review status</li>
                <li>Named by user, date and time</li>
              </ul>
              <button className="btn-start btn-start-purple" onClick={() => onNavigate("reports")}>View All Reports</button>
            </div>
          )}
          {isAdmin && (
            <div className="portal-card portal-card-red">
              <div className="portal-card-icon">🏷️</div>
              <h3>Manage Products</h3>
              <p>Create and manage products (PE, PT, PL…) and assign user access.</p>
              <ul className="portal-features">
                <li>Create PE, PT, PL and custom products</li>
                <li>Assign product access per user</li>
                <li>Testers &amp; reviewers see their products only</li>
              </ul>
              <button className="btn-start btn-start-red" onClick={() => onNavigate("products")}>Manage Products</button>
            </div>
          )}
          {isAdmin && (
            <div className="portal-card portal-card-gray">
              <div className="portal-card-icon">⚙️</div>
              <h3>Testing Profiles</h3>
              <p>Create and manage named question sets for different testing scenarios.</p>
              <ul className="portal-features">
                <li>Create Testing 1, Testing 2…</li>
                <li>Custom questions &amp; marks per profile</li>
                <li>Select profile when starting a session</li>
                <li>Reset to default 30 questions</li>
              </ul>
              <button className="btn-start btn-start-gray" onClick={() => onNavigate("profiles")}>Manage Testing Profiles</button>
            </div>
          )}
          {isAdmin && (
            <div className="portal-card portal-card-indigo">
              <div className="portal-card-icon">👥</div>
              <h3>Manage Accounts</h3>
              <p>View all registered users, assign roles, and manage product access.</p>
              <ul className="portal-features">
                <li>Assign Admin, Reviewer, or Tester role</li>
                <li>Assign product access per user</li>
                <li>Reset any user's password</li>
                <li>Delete inactive accounts</li>
              </ul>
              <button className="btn-start btn-start-indigo" onClick={() => onNavigate("accounts")}>Manage Accounts</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TerminatedScreen ──────────────────────────────────────────────────────────
function TerminatedScreen({ session, rows, onSubmitReport, onNewTest, onLogout }) {
  const totalPossible = rows.reduce((s, r) => s + (r.possibleMarks ?? 0), 0);
  const totalEarned   = rows.reduce((s, r) => s + (r.earnedScore  ?? 0), 0);
  const pct    = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : "—";
  const passed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks >= 0.8).length;
  const failed = rows.filter(r => r.possibleMarks && r.earnedScore !== null && r.earnedScore / r.possibleMarks < 0.5).length;
  return (
    <div className="idle-page">
      <header className="app-header">
        <div className="header-left"><BrandTitle /></div>
        <div className="header-right"><ProfileMenu username={session.username} onLogout={onLogout} /></div>
      </header>
      <div className="idle-body">
        <div className="idle-card">
          <div className="idle-icon">✅</div>
          <h2>Testing Complete</h2>
          <div className="idle-meta">
            <div><span>Started at</span><strong>{fmtDateTime(session.testingStart)}</strong></div>
            <div><span>Terminated at</span><strong>{fmtDateTime(session.testingEnd)}</strong></div>
            <div><span>Duration</span><strong>{fmtDuration(session.testingEnd - session.testingStart)}</strong></div>
          </div>
          <div className="term-stats">
            <div className="t-stat blue"><span className="t-val">{rows.length}</span><span className="t-lbl">Questions</span></div>
            <div className="t-stat green"><span className="t-val">{totalEarned}/{totalPossible}</span><span className="t-lbl">Marks</span></div>
            <div className="t-stat purple"><span className="t-val">{pct}{pct !== "—" ? "%" : ""}</span><span className="t-lbl">Score</span></div>
            <div className="t-stat teal"><span className="t-val">{passed}</span><span className="t-lbl">Passed</span></div>
            <div className="t-stat red"><span className="t-val">{failed}</span><span className="t-lbl">Failed</span></div>
          </div>
          <div className="term-actions">
            <button className="btn-start" onClick={onSubmitReport}>Submit Report</button>
            <button className="btn-secondary" onClick={onNewTest}>Start New Testing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ExpiredOverlay ────────────────────────────────────────────────────────────
function ExpiredOverlay({ session, rows, onLogout }) {
  const isTester = session.mode === "tester";
  const dur      = getDuration(session);
  const label    = isTester ? "60-minute" : "12-hour";
  const handleReport = () => {
    const end = session.testingStart + dur;
    if (isTester) openTesterReport(rows, { ...session, testingEnd: end });
    else          openReport(rows,       { ...session, testingEnd: end });
  };
  return (
    <div className="expired-overlay">
      <div className="expired-box">
        <div className="expired-icon">⏱</div>
        <h2>Time Limit Reached</h2>
        <p>Your {label} testing window has ended.</p>
        <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", marginTop:24 }}>
          <button className="btn-view-report" onClick={handleReport}>View Report</button>
          <button className="btn-logout-lg" onClick={onLogout}>Log Out</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [questions,        setQuestions]        = useState(() => getActiveQuestions());
  const [session,          setSession]          = useState(() => getSession());
  const [rows,             setRows]             = useState(() => {
    const s  = getSession();
    const qs = getActiveQuestions();
    const stored = s ? getScores(s.username) : {};
    return qs.map((q) => ({
      ...blankRow(q),
      possibleMarks: stored[q.id]?.possibleMarks ?? null,
      earnedScore:   stored[q.id]?.score         ?? null,
      evalNote:      stored[q.id]?.evalNote       ?? "",
    }));
  });
  const [filter,           setFilter]           = useState("ALL");
  const [search,           setSearch]           = useState("");
  const [remaining,        setRemaining]        = useState(() => {
    const s = getSession();
    if (!s?.testingStart || s?.testingEnd) return getDuration(s);
    return Math.max(0, getDuration(s) - (Date.now() - s.testingStart));
  });
  const [expired,          setExpired]          = useState(false);
  const [showTerminate,    setShowTerminate]    = useState(false);
  const [validationErrors, setValidationErrors] = useState(null);
  const [submitSuccess,    setSubmitSuccess]    = useState(null); // { isTester: bool }
  const [view,             setView]             = useState(null);
  const [editingProfile,   setEditingProfile]   = useState(null);
  const [profilePicker,    setProfilePicker]    = useState(null); // mode string while picker is open
  const timerRef = useRef(null);

  // Auto-clean photos older than 7 days
  useEffect(() => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS;
    dbGetSubmissions().then(subs => {
      const stale = subs.filter(s =>
        s.endTime < cutoff && s.rows?.some(r => r.screenshot)
      );
      stale.forEach(s =>
        dbSaveSubmission({ ...s, rows: s.rows.map(r => ({ ...r, screenshot: null })) })
      );
    }).catch(() => {});
  }, []);

  // Countdown
  useEffect(() => {
    if (!session?.testingStart || session?.testingEnd) return;
    const duration = getDuration(session);
    const tick = () => {
      const left = duration - (Date.now() - session.testingStart);
      if (left <= 0) { setRemaining(0); setExpired(true); clearInterval(timerRef.current); }
      else setRemaining(left);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [session?.testingStart, session?.testingEnd, session?.mode]);

  // Persist rows
  useEffect(() => {
    if (!session?.username || !session?.testingStart) return;
    const data = Object.fromEntries(rows.map(r => [r.id, {
      score: r.earnedScore, evalNote: r.evalNote, possibleMarks: r.possibleMarks,
    }]));
    saveScores(session.username, data);
  }, [rows, session?.username, session?.testingStart]);

  const handleLogin    = (s) => setSession(s);
  const handleNavigate = (v) => setView(v);

  const handleLogout = () => {
    logout();
    setSession(null);
    setView(null);
    setRows(questions.map(q => blankRow(q)));
    setExpired(false);
    setRemaining(SESSION_DURATION);
    clearInterval(timerRef.current);
  };

  const handleStart = (mode, profileQs = null, profileName = null, productId = null, productName = null) => {
    const qs = profileQs ?? getActiveQuestions();
    setQuestions(qs);
    setRows(qs.map(q => blankRow(q)));
    setSession(startTesting(session, mode, profileName, productId, productName));
    setProfilePicker(null);
    setExpired(false);
  };

  const handleStartRequest = async (mode) => {
    const [products, profiles] = await Promise.all([dbGetProducts(), dbGetProfiles()]);
    if (products.length > 0 || profiles.length > 0) setProfilePicker(mode);
    else handleStart(mode, null);
  };

  const handleNewTest = () => {
    const updated = resetTesting(session);
    clearScores(session.username);
    setSession(updated);
    setRows(questions.map(q => blankRow(q)));
    setRemaining(SESSION_DURATION);
    setExpired(false);
    clearInterval(timerRef.current);
  };

  const handleSubmitReport = async () => {
    const isTester = session.mode === "tester";
    const missing  = isTester
      ? rows.filter(r => !r.screenshot).map(r => ({ id: r.id, standard: r.standard, fields: ["screenshot"] }))
      : getMissingFields(rows);
    if (missing.length > 0) { setValidationErrors(missing); return; }
    const end = Date.now();
    const sub = makeSubmission(isTester ? "tester" : "admin", session.username, session, rows);
    sub.endTime = end;
    await dbSaveSubmission(sub);
    clearScores(session.username);
    setSubmitSuccess({ isTester });
  };

  const handleSubmitSuccessBack = () => {
    const updated = resetTesting(session);
    setSession(updated);
    setRows(questions.map(q => blankRow(q)));
    setRemaining(getDuration(updated));
    setSubmitSuccess(null);
    clearInterval(timerRef.current);
  };

  const handleSubmitSuccessReports = () => {
    const updated = resetTesting(session);
    setSession(updated);
    setRows(questions.map(q => blankRow(q)));
    setRemaining(getDuration(updated));
    setSubmitSuccess(null);
    setView("reports");
    clearInterval(timerRef.current);
  };

  const handleConfirmTerminate = () => {
    const updated = resetTesting(session);
    clearScores(session.username);
    setSession(updated);
    setRows(questions.map(q => blankRow(q)));
    setRemaining(SESSION_DURATION);
    setShowTerminate(false);
    clearInterval(timerRef.current);
  };

  const updatePossibleMarks = useCallback((id, v) =>
    setRows(p => p.map(r => r.id === id ? { ...r, possibleMarks: v, earnedScore: v === null ? null : Math.min(r.earnedScore ?? 0, v) } : r)), []);

  const updateScore      = useCallback((id, v) =>
    setRows(p => p.map(r => r.id === id ? { ...r, earnedScore: v } : r)), []);

  const updateEvalNote   = useCallback((id, text) => {
    if (text.trim().split(/\s+/).filter(Boolean).length > 30) return;
    setRows(p => p.map(r => r.id === id ? { ...r, evalNote: text } : r));
  }, []);

  const updateScreenshot = useCallback((id, s) =>
    setRows(p => p.map(r => r.id === id ? { ...r, screenshot: s } : r)), []);

  // ── State machine ──────────────────────────────────────────────────────────
  if (!session) return <LoginPage onLogin={handleLogin} />;
  if (view === "review")    return <ReviewPortal    currentUser={session.username} currentRole={session.role} onBack={() => setView(null)} onLogout={handleLogout} />;
  if (view === "reports")   return <ReportsPortal   currentUser={session.username} currentRole={session.role} onBack={() => setView(null)} onLogout={handleLogout} />;
  if (view === "accounts")  return <AccountsPortal  currentUser={session.username} onBack={() => setView(null)} onLogout={handleLogout} />;
  if (view === "products")  return <ProductsPortal  currentUser={session.username} onBack={() => setView(null)} onLogout={handleLogout} />;
  if (view === "profiles")  return <TestingProfilesPortal currentUser={session.username}
    onEdit={p => { setEditingProfile(p); setView("profile-editor"); }}
    onBack={() => setView(null)} onLogout={handleLogout} />;
  if (view === "profile-editor" && editingProfile) return <ProfileEditorPortal
    profile={editingProfile} currentUser={session.username}
    onBack={() => setView("profiles")} onLogout={handleLogout} />;
  if (session.testingStart && session.testingEnd)
    return <TerminatedScreen session={session} rows={rows}
      onSubmitReport={() => session.mode === "tester" ? openTesterReport(rows, session) : openReport(rows, session)}
      onNewTest={handleNewTest} onLogout={handleLogout} />;
  if (!session.testingStart) {
    if (profilePicker) return <ProfilePickerPortal
      mode={profilePicker} session={session}
      onPick={(qs, name, prodId, prodName) => handleStart(profilePicker, qs, name, prodId, prodName)}
      onCancel={() => setProfilePicker(null)} onLogout={handleLogout} />;
    return <IdleScreen session={session} onStart={handleStartRequest} onNavigate={handleNavigate} onLogout={handleLogout} />;
  }
  if (expired)
    return <ExpiredOverlay session={session} rows={rows} onLogout={handleLogout} />;

  const isTester    = session.mode === "tester";
  const dur         = getDuration(session);
  const urgentTime  = isTester ? remaining < 5 * 60 * 1000  : remaining < 60 * 60 * 1000;
  const warningTime  = isTester ? remaining < 15 * 60 * 1000 : remaining < 3 * 60 * 60 * 1000;
  const categories   = ["ALL", ...Array.from(new Set(rows.map(r => r.standard.split("-")[0])))];
  const visible      = rows.filter((r) => {
    const prefix = r.standard.split("-")[0];
    return (filter === "ALL" || prefix === filter) &&
      (!search || r.standard.toLowerCase().includes(search.toLowerCase()) ||
       r.observation.toLowerCase().includes(search.toLowerCase()));
  });

  // ── Tester dashboard ────────────────────────────────────────────────────────
  if (isTester) {
    const uploaded = rows.filter(r => r.screenshot).length;
    return (
      <div className="app">
        {showTerminate    && <TerminateModal onConfirm={handleConfirmTerminate} onCancel={() => setShowTerminate(false)} />}
        {validationErrors && <ValidationModal missing={validationErrors} onClose={() => setValidationErrors(null)} />}
        {submitSuccess    && <SubmitSuccessModal isTester={submitSuccess.isTester} onBackToPortal={handleSubmitSuccessBack} onViewReports={handleSubmitSuccessReports} />}
        <header className="app-header">
          <div className="header-left">
            <h1>Tester Portal</h1>
            <p className="header-sub">Started: {fmtDateTime(session.testingStart)}</p>
          </div>
          <div className="header-right">
            <CountdownBadge remaining={remaining} urgent={urgentTime} warning={warningTime} />
            <span className="upload-progress">{uploaded}/{rows.length} uploaded</span>
            <button className="btn-view-report" onClick={handleSubmitReport}>Submit Report</button>
            <button className="btn-danger-outline" onClick={() => setShowTerminate(true)}>Terminate</button>
            <ProfileMenu username={session.username} onLogout={handleLogout} />
          </div>
        </header>
        <main className="app-main">
          <div className="toolbar">
            <div className="filter-chips">
              {categories.map((cat) => (
                <button key={cat}
                  className={`chip ${filter === cat ? "active" : ""}`}
                  style={filter === cat && cat !== "ALL" ? { background: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] } : {}}
                  onClick={() => setFilter(cat)}
                >{cat}</button>
              ))}
            </div>
            <input type="search" placeholder="Search questions…" className="search-box"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table className="qa-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th className="col-standard">Standard</th>
                  <th className="col-obs">Observation</th>
                  <th className="col-shot">Screenshot <span className="req-star">*</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const color    = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
                  const rowClass = row.screenshot ? "row-pass" : "row-neutral";
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td className="col-num">{row.id}</td>
                      <td className="col-standard"><span className="std-badge" style={{ background:color }}>{row.standard}</span></td>
                      <td className="col-obs">{row.observation}</td>
                      <td className="col-shot">
                        <ScreenshotCell screenshot={row.screenshot} required={!row.screenshot}
                          onUpload={(s) => updateScreenshot(row.id, s)}
                          onDiscard={() => updateScreenshot(row.id, null)} />
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={4} className="empty-row">No questions match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="req-note"><span className="req-star">*</span> All screenshots are required to submit the report.</p>
        </main>
      </div>
    );
  }

  // ── Admin dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="app">
      {showTerminate    && <TerminateModal onConfirm={handleConfirmTerminate} onCancel={() => setShowTerminate(false)} />}
      {validationErrors && <ValidationModal missing={validationErrors} onClose={() => setValidationErrors(null)} />}
      {submitSuccess    && <SubmitSuccessModal isTester={submitSuccess.isTester} onBackToPortal={handleSubmitSuccessBack} onViewReports={handleSubmitSuccessReports} />}
      <header className="app-header">
        <div className="header-left">
          <BrandTitle />
          <p className="header-sub">Started: {fmtDateTime(session.testingStart)}</p>
        </div>
        <div className="header-right">
          <CountdownBadge remaining={remaining} urgent={urgentTime} warning={warningTime} />
          <button className="btn-view-report" onClick={handleSubmitReport}>Submit Report</button>
          <button className="btn-danger-outline" onClick={() => setShowTerminate(true)}>Terminate Testing</button>
          <ProfileMenu username={session.username} onLogout={handleLogout} />
        </div>
      </header>
      <main className="app-main">
        <SummaryBar rows={rows} />
        <div className="toolbar">
          <div className="filter-chips">
            {categories.map((cat) => (
              <button key={cat}
                className={`chip ${filter === cat ? "active" : ""}`}
                style={filter === cat && cat !== "ALL" ? { background: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] } : {}}
                onClick={() => setFilter(cat)}
              >{cat}</button>
            ))}
          </div>
          <input type="search" placeholder="Search questions…" className="search-box"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="qa-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-standard">Standard</th>
                <th className="col-obs">Observation</th>
                <th className="col-marks">Possible Marks</th>
                <th className="col-score">Earned Score <span className="req-star">*</span></th>
                <th className="col-shot">Screenshot <span className="req-star">*</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const color    = CATEGORY_COLORS[row.standard.split("-")[0]] ?? "#888";
                const pct      = row.possibleMarks && row.earnedScore !== null ? row.earnedScore / row.possibleMarks : null;
                const rowClass = pct === null ? "row-neutral" : pct >= 0.8 ? "row-pass" : pct < 0.5 ? "row-fail" : "row-warn";
                const note      = row.evalNote ?? "";
                const wordCount = note.trim() === "" ? 0 : note.trim().split(/\s+/).length;
                return (
                  <React.Fragment key={row.id}>
                    <tr className={rowClass}>
                      <td className="col-num">{row.id}</td>
                      <td className="col-standard"><span className="std-badge" style={{ background:color }}>{row.standard}</span></td>
                      <td className="col-obs">{row.observation}</td>
                      <td className="col-marks">
                        <span className="marks-static">{row.possibleMarks}</span>
                      </td>
                      <td className="col-score">
                        <ScoreInput value={row.earnedScore} max={row.possibleMarks}
                          onChange={(v) => updateScore(row.id, v)} />
                      </td>
                      <td className="col-shot">
                        <ScreenshotCell screenshot={row.screenshot} required={!row.screenshot}
                          onUpload={(s) => updateScreenshot(row.id, s)}
                          onDiscard={() => updateScreenshot(row.id, null)} />
                      </td>
                    </tr>
                    <tr className={`note-row ${rowClass}`}>
                      <td colSpan={6} className="note-cell">
                        <div className="note-wrap">
                          <span className="note-label">Observation</span>
                          <textarea className="note-textarea" rows={2}
                            placeholder="Enter your observation… (max 30 words)"
                            value={note} onChange={(e) => updateEvalNote(row.id, e.target.value)} />
                          <span className={`word-count ${wordCount >= 30 ? "at-limit" : wordCount >= 25 ? "near-limit" : ""}`}>
                            {wordCount} / 30
                          </span>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No questions match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="req-note"><span className="req-star">*</span> Earned score and screenshot are required to submit or terminate.</p>
      </main>
    </div>
  );
}

