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

// ── Active session questions (so profile questions survive page reload) ────────
const SESSION_QS_KEY = "qa_session_questions";

export function saveSessionQuestions(questions) {
  localStorage.setItem(SESSION_QS_KEY, JSON.stringify(questions));
}

export function getSessionQuestions() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_QS_KEY));
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch { return null; }
}

export function clearSessionQuestions() {
  localStorage.removeItem(SESSION_QS_KEY);
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

// ── Products ──────────────────────────────────────────────────────────────────
const PRODUCTS_KEY = "qa_products";
const DEFAULT_PRODUCTS = [
  { id: "pe", name: "PE", description: "Product PE", createdAt: 0 },
  { id: "pt", name: "PT", description: "Product PT", createdAt: 0 },
  { id: "pl", name: "PL", description: "Product PL", createdAt: 0 },
];

export function getProducts() {
  try {
    const data = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
    if (Array.isArray(data) && data.length > 0) return data;
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(DEFAULT_PRODUCTS));
    return DEFAULT_PRODUCTS;
  } catch { return DEFAULT_PRODUCTS; }
}

export function saveProduct(product) {
  const all = getProducts();
  const idx = all.findIndex(p => p.id === product.id);
  if (idx >= 0) all[idx] = product; else all.push(product);
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
}

export function deleteProduct(id) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(getProducts().filter(p => p.id !== id)));
  const pairs = getUserProductPairs().filter(p => p.product_id !== id);
  localStorage.setItem(USER_PRODUCTS_KEY, JSON.stringify(pairs));
}

// ── User product access ───────────────────────────────────────────────────────
const USER_PRODUCTS_KEY = "qa_user_products";

function getUserProductPairs() {
  try { return JSON.parse(localStorage.getItem(USER_PRODUCTS_KEY) || "[]"); }
  catch { return []; }
}

export function getUserProducts(username) {
  return getUserProductPairs().filter(p => p.username === username).map(p => p.product_id);
}

export function setUserProducts(username, productIds) {
  const others = getUserProductPairs().filter(p => p.username !== username);
  const mine   = productIds.map(pid => ({ username, product_id: pid }));
  localStorage.setItem(USER_PRODUCTS_KEY, JSON.stringify([...others, ...mine]));
}

// ── Planner tasks ─────────────────────────────────────────────────────────────
const TASKS_KEY = "qa_tasks";

export function getTasks() {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || "[]"); }
  catch { return []; }
}

export function saveTask(task) {
  const all = getTasks();
  const idx = all.findIndex(t => t.id === task.id);
  if (idx >= 0) all[idx] = task; else all.push(task);
  localStorage.setItem(TASKS_KEY, JSON.stringify(all));
}

export function deleteTask(id) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(getTasks().filter(t => t.id !== id)));
}

// ── Tickets ───────────────────────────────────────────────────────────────────
const TICKETS_KEY = "qa_tickets";

export function getTickets() {
  try { return JSON.parse(localStorage.getItem(TICKETS_KEY) || "[]"); }
  catch { return []; }
}

export function saveTicket(ticket) {
  const all = getTickets();
  const idx = all.findIndex(t => t.id === ticket.id);
  if (idx >= 0) all[idx] = ticket; else all.push(ticket);
  localStorage.setItem(TICKETS_KEY, JSON.stringify(all));
}

export function deleteTicket(id) {
  localStorage.setItem(TICKETS_KEY, JSON.stringify(getTickets().filter(t => t.id !== id)));
}

// ── Notifications ─────────────────────────────────────────────────────────────
const NOTIFS_KEY = "qa_notifications";

function getAllNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIFS_KEY) || "[]"); }
  catch { return []; }
}

export function getNotifications(username) {
  return getAllNotifications().filter(n => n.toUsername === username);
}

export function saveNotification(notif) {
  const all = getAllNotifications();
  const idx = all.findIndex(n => n.id === notif.id);
  if (idx >= 0) all[idx] = notif; else all.push(notif);
  localStorage.setItem(NOTIFS_KEY, JSON.stringify(all));
}

export function markNotificationRead(id) {
  const all = getAllNotifications().map(n => n.id === id ? { ...n, read: true } : n);
  localStorage.setItem(NOTIFS_KEY, JSON.stringify(all));
}

export function markAllNotificationsRead(username) {
  const all = getAllNotifications().map(n => n.toUsername === username ? { ...n, read: true } : n);
  localStorage.setItem(NOTIFS_KEY, JSON.stringify(all));
}

export function clearNotifications(username) {
  localStorage.setItem(NOTIFS_KEY, JSON.stringify(getAllNotifications().filter(n => n.toUsername !== username)));
}

// ── Activity log (localStorage fallback when Drive not configured) ─────────────
const LOG_KEY = "qa_activity_log";

export function getLogs() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }
  catch { return []; }
}

export function appendLog(entry) {
  const all = getLogs();
  all.push(entry);
  localStorage.setItem(LOG_KEY, JSON.stringify(all));
}

export function pruneLogs() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  localStorage.setItem(LOG_KEY, JSON.stringify(getLogs().filter(e => (e.createdAt ?? 0) > cutoff)));
}
