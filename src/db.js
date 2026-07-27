import { supabase } from "./supabase";
import * as local from "./auth";
import { USE_LOCAL } from "./config";
import { driveEnabled, appendLog as driveAppendLog, readLogs as driveReadLogs, pruneOldLogs as drivePruneOldLogs } from "./drive";

// ── Users ─────────────────────────────────────────────────────────────────────
export async function dbGetAllUsers() {
  if (USE_LOCAL) return local.getAllUsers();
  const { data, error } = await supabase.from("qa_users").select("username, role, name, phone").order("username");
  if (error) throw error;
  return data;
}

export async function dbLogin(username, password) {
  if (USE_LOCAL) {
    const res = local.login(username, password);
    if (res.error) return res;
    return { success: true, user: { username: res.session.username, role: res.session.role } };
  }
  const { data, error } = await supabase
    .from("qa_users")
    .select("username, password, role")
    .ilike("username", username.trim())
    .single();
  if (error || !data)       return { error: "Invalid username or password." };
  if (data.password !== password) return { error: "Invalid username or password." };
  return { success: true, user: data };
}

export async function dbSignup(username, password, { name = "", phone = "" } = {}) {
  if (USE_LOCAL) return local.signup(username, password, { name, phone });
  const { error } = await supabase.from("qa_users").insert({
    username: username.trim(), password, role: "tester",
    name: name.trim(), phone: phone.trim(),
  });
  if (error) {
    if (error.code === "23505") return { error: "Username already taken." };
    return { error: error.message };
  }
  return { success: true };
}

export async function dbUpdateRole(username, role) {
  if (USE_LOCAL) return local.updateUserRole(username, role);
  const { error } = await supabase.from("qa_users").update({ role }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbResetPassword(username, newPassword) {
  if (USE_LOCAL) return local.adminResetPassword(username, newPassword);
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  const { error } = await supabase.from("qa_users").update({ password: newPassword }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbDeleteUser(username) {
  if (USE_LOCAL) { local.deleteAccount(username); return; }
  const { error } = await supabase.from("qa_users").delete().eq("username", username);
  if (error) throw error;
}

// ── Submissions ───────────────────────────────────────────────────────────────
export async function dbGetSubmissions() {
  if (USE_LOCAL) return local.getSubmissions();
  const { data, error } = await supabase
    .from("qa_submissions")
    .select("*")
    .order("end_time", { ascending: false });
  if (error) throw error;
  return data.map(row => ({
    id:          row.id,
    type:        row.type,
    username:    row.username,
    profileName: row.profile_name,
    productId:   row.product_id   ?? null,
    productName: row.product_name ?? null,
    startTime:   row.start_time,
    endTime:     row.end_time,
    rows:        row.rows,
    review:      row.review,
  }));
}

export async function dbSaveSubmission(sub) {
  if (USE_LOCAL) { local.saveSubmission(sub); return; }
  const { error } = await supabase.from("qa_submissions").upsert({
    id:           sub.id,
    type:         sub.type,
    username:     sub.username,
    profile_name: sub.profileName ?? null,
    product_id:   sub.productId   ?? null,
    product_name: sub.productName ?? null,
    start_time:   sub.startTime,
    end_time:     sub.endTime,
    rows:         sub.rows,
    review:       sub.review ?? null,
  });
  if (error) throw error;
}

export async function dbDeleteSubmission(id) {
  if (USE_LOCAL) { local.deleteSubmission(id); return; }
  const { error } = await supabase.from("qa_submissions").delete().eq("id", id);
  if (error) throw error;
}

// ── Profiles ──────────────────────────────────────────────────────────────────
export async function dbGetProfiles() {
  if (USE_LOCAL) return local.getProfiles();
  const { data, error } = await supabase
    .from("qa_profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(row => ({
    id:         row.id,
    name:       row.name,
    createdAt:  row.created_at,
    questions:  row.questions,
  }));
}

export async function dbSaveProfile(profile) {
  if (USE_LOCAL) { local.saveProfile(profile); return; }
  const { error } = await supabase.from("qa_profiles").upsert({
    id:         profile.id,
    name:       profile.name,
    created_at: profile.createdAt,
    questions:  profile.questions,
  });
  if (error) throw error;
}

export async function dbDeleteProfile(id) {
  if (USE_LOCAL) { local.deleteProfile(id); return; }
  const { error } = await supabase.from("qa_profiles").delete().eq("id", id);
  if (error) throw error;
}

// ── Products ──────────────────────────────────────────────────────────────────
export async function dbGetProducts() {
  if (USE_LOCAL) return local.getProducts();
  const { data, error } = await supabase
    .from("qa_products")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(row => ({
    id:          row.id,
    name:        row.name,
    description: row.description ?? "",
    createdAt:   row.created_at,
  }));
}

export async function dbSaveProduct(product) {
  if (USE_LOCAL) { local.saveProduct(product); return; }
  const { error } = await supabase.from("qa_products").upsert({
    id:          product.id,
    name:        product.name,
    description: product.description ?? "",
    created_at:  product.createdAt ?? Date.now(),
  });
  if (error) throw error;
}

export async function dbDeleteProduct(id) {
  if (USE_LOCAL) { local.deleteProduct(id); return; }
  await supabase.from("qa_user_products").delete().eq("product_id", id);
  const { error } = await supabase.from("qa_products").delete().eq("id", id);
  if (error) throw error;
}

// ── User product access ───────────────────────────────────────────────────────
export async function dbGetUserProducts(username) {
  if (USE_LOCAL) return local.getUserProducts(username);
  const { data, error } = await supabase
    .from("qa_user_products")
    .select("product_id")
    .eq("username", username);
  if (error) throw error;
  return data.map(r => r.product_id);
}

export async function dbSetUserProducts(username, productIds) {
  if (USE_LOCAL) { local.setUserProducts(username, productIds); return; }
  await supabase.from("qa_user_products").delete().eq("username", username);
  if (productIds.length === 0) return;
  const { error } = await supabase.from("qa_user_products").insert(
    productIds.map(pid => ({ username, product_id: pid }))
  );
  if (error) throw error;
}

// ── Planner tasks ─────────────────────────────────────────────────────────────
export async function dbGetTasks() {
  if (USE_LOCAL) return local.getTasks();
  const { data, error } = await supabase
    .from("qa_tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(row => ({
    id:          row.id,
    title:       row.title,
    description: row.description ?? "",
    status:      row.status,
    productId:   row.product_id   ?? null,
    productName: row.product_name ?? null,
    assignee:    row.assignee     ?? null,
    createdBy:   row.created_by,
    tags:        row.tags   ?? [],
    images:      row.images ?? [],
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    dueDate:     row.due_date    ?? null,
    label:       row.label       ?? "once",
    recurTime:   row.recur_time  ?? null,
    templateId:  row.template_id ?? null,
    level:       row.level       ?? "III",
  }));
}

export async function dbSaveTask(task) {
  if (USE_LOCAL) { local.saveTask(task); return; }
  const { error } = await supabase.from("qa_tasks").upsert({
    id:           task.id,
    title:        task.title,
    description:  task.description ?? "",
    status:       task.status,
    product_id:   task.productId   ?? null,
    product_name: task.productName ?? null,
    assignee:     task.assignee    ?? null,
    created_by:   task.createdBy,
    tags:         task.tags   ?? [],
    images:       task.images ?? [],
    created_at:   task.createdAt,
    updated_at:   task.updatedAt,
    due_date:     task.dueDate     ?? null,
    label:        task.label       ?? "once",
    recur_time:   task.recurTime   ?? null,
    template_id:  task.templateId  ?? null,
    level:        task.level       ?? "III",
  });
  if (error) throw error;
}

export async function dbDeleteTask(id) {
  if (USE_LOCAL) { local.deleteTask(id); return; }
  const { error } = await supabase.from("qa_tasks").delete().eq("id", id);
  if (error) throw error;
}

// ── Tickets ───────────────────────────────────────────────────────────────────
export async function dbGetTickets() {
  if (USE_LOCAL) return local.getTickets();
  const { data, error } = await supabase
    .from("qa_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(row => ({
    id:          row.id,
    title:       row.title,
    description: row.description ?? "",
    status:      row.status,
    priority:    row.priority,
    productId:   row.product_id   ?? null,
    productName: row.product_name ?? null,
    reporter:    row.reporter,
    assignee:    row.assignee     ?? null,
    images:      row.images ?? [],
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    dueDate:     row.due_date    ?? null,
    label:       row.label       ?? "once",
    recurTime:   row.recur_time  ?? null,
    templateId:  row.template_id ?? null,
    level:       row.level       ?? "III",
  }));
}

export async function dbSaveTicket(ticket) {
  if (USE_LOCAL) { local.saveTicket(ticket); return; }
  const { error } = await supabase.from("qa_tickets").upsert({
    id:           ticket.id,
    title:        ticket.title,
    description:  ticket.description ?? "",
    status:       ticket.status,
    priority:     ticket.priority,
    product_id:   ticket.productId   ?? null,
    product_name: ticket.productName ?? null,
    reporter:     ticket.reporter,
    assignee:     ticket.assignee    ?? null,
    images:       ticket.images ?? [],
    created_at:   ticket.createdAt,
    updated_at:   ticket.updatedAt,
    due_date:     ticket.dueDate     ?? null,
    label:        ticket.label       ?? "once",
    recur_time:   ticket.recurTime   ?? null,
    template_id:  ticket.templateId  ?? null,
    level:        ticket.level       ?? "III",
  });
  if (error) throw error;
}

export async function dbDeleteTicket(id) {
  if (USE_LOCAL) { local.deleteTicket(id); return; }
  const { error } = await supabase.from("qa_tickets").delete().eq("id", id);
  if (error) throw error;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function dbGetNotifications(username) {
  if (USE_LOCAL) return local.getNotifications(username);
  const { data, error } = await supabase
    .from("qa_notifications")
    .select("*")
    .eq("to_username", username)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(row => ({
    id:         row.id,
    toUsername: row.to_username,
    message:    row.message,
    type:       row.type       ?? null,
    refId:      row.ref_id     ?? null,
    refType:    row.ref_type   ?? null,
    read:       row.read,
    createdAt:  row.created_at,
  }));
}

export async function dbSaveNotification(notif) {
  if (USE_LOCAL) { local.saveNotification(notif); return; }
  const { error } = await supabase.from("qa_notifications").upsert({
    id:          notif.id,
    to_username: notif.toUsername,
    message:     notif.message,
    type:        notif.type     ?? null,
    ref_id:      notif.refId    ?? null,
    ref_type:    notif.refType  ?? null,
    read:        notif.read     ?? false,
    created_at:  notif.createdAt,
  });
  if (error) throw error;
}

export async function dbMarkNotificationRead(id) {
  if (USE_LOCAL) { local.markNotificationRead(id); return; }
  const { error } = await supabase.from("qa_notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function dbMarkAllNotificationsRead(username) {
  if (USE_LOCAL) { local.markAllNotificationsRead(username); return; }
  const { error } = await supabase.from("qa_notifications").update({ read: true }).eq("to_username", username);
  if (error) throw error;
}

export async function dbClearNotifications(username) {
  if (USE_LOCAL) { local.clearNotifications(username); return; }
  const { error } = await supabase.from("qa_notifications").delete().eq("to_username", username);
  if (error) throw error;
}

// ── Activity log (Drive when configured, otherwise localStorage) ──────────────
export async function dbAppendLog(entry) {
  if (driveEnabled) { driveAppendLog(entry); return; } // fire-and-forget
  local.appendLog(entry);
}

export async function dbReadLogs() {
  if (driveEnabled) return driveReadLogs();
  return local.getLogs();
}

export async function dbPruneLogs() {
  if (driveEnabled) { drivePruneOldLogs(); return; } // fire-and-forget
  local.pruneLogs();
}
