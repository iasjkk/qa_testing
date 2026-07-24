const USERS_KEY   = "qa_users";
const SESSION_KEY = "qa_session";
const SCORES_PFX  = "qa_scores_";

// ── Default admin seed ────────────────────────────────────────────────────────
const DEFAULT_ADMIN = { username: "admin", password: "admin123", role: "admin", name: "Administrator", phone: "" };

// ── User store ────────────────────────────────────────────────────────────────
function getUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    if (!users.find(u => u.username.toLowerCase() === DEFAULT_ADMIN.username)) {
      users.unshift({ ...DEFAULT_ADMIN });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    return users;
  } catch { return [DEFAULT_ADMIN]; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function signup(username, password, { name = "", phone = "" } = {}) {
  if (!username.trim() || !password) return { error: "All fields are required." };
  if (username.trim().length < 3)   return { error: "Username must be at least 3 characters." };
  if (password.length < 6)         return { error: "Password must be at least 6 characters." };
  if (phone && !/^\d{10}$/.test(phone.trim())) return { error: "Phone number must be 10 digits." };
  const users = getUsers();
  if (users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return { error: "Username already taken." };
  }
  users.push({ username: username.trim(), password, role: "tester", name: name.trim(), phone: phone.trim() });
  saveUsers(users);
  return { success: true };
}

export function login(username, password) {
  if (!username.trim() || !password) return { error: "Enter username and password." };
  const users = getUsers();
  const user  = users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );
  if (!user) return { error: "Invalid username or password." };
  const session = { username: user.username, role: user.role ?? "tester", loginTime: Date.now(), testingStart: null, testingEnd: null };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, session };
}

export function saveSessionFromDB(user) {
  const session = { username: user.username, role: user.role ?? "tester", loginTime: Date.now(), testingStart: null, testingEnd: null };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// ── Account management ────────────────────────────────────────────────────────
export function getAllUsers() {
  return getUsers().map(u => ({ username: u.username, role: u.role ?? "tester", name: u.name ?? "", phone: u.phone ?? "" }));
}

export function updateUserRole(username, role) {
  const users = getUsers();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx < 0) return { error: "User not found." };
  users[idx] = { ...users[idx], role };
  saveUsers(users);
  return { success: true };
}

export function adminResetPassword(username, newPassword) {
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  const users = getUsers();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx < 0) return { error: "User not found." };
  users[idx] = { ...users[idx], password: newPassword };
  saveUsers(users);
  return { success: true };
}

export function deleteAccount(username) {
  saveUsers(getUsers().filter(u => u.username.toLowerCase() !== username.toLowerCase()));
}

// ── Session ───────────────────────────────────────────────────────────────────
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function startTesting(session, mode = "admin", profileName = null, productId = null, productName = null) {
  return saveSession({ ...session, testingStart: Date.now(), testingEnd: null, mode, profileName, productId, productName });
}

export function terminateTesting(session) {
  return saveSession({ ...session, testingEnd: Date.now() });
}

export function resetTesting(session) {
  return saveSession({ ...session, testingStart: null, testingEnd: null });
}

// ── Persisted scores (screenshots stay in React state) ────────────────────────
export function getScores(username) {
  try { return JSON.parse(localStorage.getItem(SCORES_PFX + username) || "{}"); }
  catch { return {}; }
}

export function saveScores(username, data) {
  localStorage.setItem(SCORES_PFX + username, JSON.stringify(data));
}

export function clearScores(username) {
  localStorage.removeItem(SCORES_PFX + username);
}

// ── Testing profiles ──────────────────────────────────────────────────────────
const PROFILES_KEY = "qa_profiles";

export function getProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]"); }
  catch { return []; }
}

export function saveProfile(profile) {
  const all = getProfiles();
  const idx = all.findIndex(p => p.id === profile.id);
  if (idx >= 0) all[idx] = profile;
  else all.push(profile);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
}

export function deleteProfile(id) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(getProfiles().filter(p => p.id !== id)));
}

// ── Custom questions ──────────────────────────────────────────────────────────
const QUESTIONS_KEY = "qa_custom_questions";

export function getCustomQuestions() {
  try {
    const data = JSON.parse(localStorage.getItem(QUESTIONS_KEY));
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch { return null; }
}

export function saveCustomQuestions(questions) {
  localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
}

export function clearCustomQuestions() {
  localStorage.removeItem(QUESTIONS_KEY);
}

// ── Submissions (persisted reports) ──────────────────────────────────────────
const SUBMISSIONS_KEY = "qa_submissions";

export function getSubmissions() {
  try { return JSON.parse(localStorage.getItem(SUBMISSIONS_KEY) || "[]"); }
  catch { return []; }
}

export function saveSubmission(submission) {
  const all = getSubmissions();
  const idx = all.findIndex(s => s.id === submission.id);
  if (idx >= 0) all[idx] = submission;
  else all.push(submission);
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(all));
}

export function deleteSubmission(id) {
  const all = getSubmissions().filter(s => s.id !== id);
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(all));
}
