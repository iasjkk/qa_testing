import * as local from "./auth";
import { config, USE_LOCAL, USE_GOOGLE_SHEETS } from "./config";
import { driveEnabled, appendLog as driveAppendLog, readLogs as driveReadLogs, pruneOldLogs as drivePruneOldLogs } from "./drive";

// Placeholder for Supabase client, will eventually be removed
// This is only here to avoid immediate errors if neither LOCAL nor GOOGLE_SHEETS is enabled
const supabase = {
  from: () => ({
    select: () => ({ data: [], error: null }),
    order: () => ({ data: [], error: null }),
    insert: () => ({ error: null }),
    update: () => ({ error: null }),
    eq: () => ({ error: null }),
    ilike: () => ({ single: () => ({ data: null, error: null }) }),
    delete: () => ({ error: null }),
    upsert: () => ({ error: null }),
  }),
};

async function fetchGoogleSheets(action, sheetName, payload = {}) {
  if (!config.googleSheets.webAppUrl) {
    throw new Error("Google Sheets Web App URL is not configured. Please set VITE_GOOGLE_SHEETS_WEB_APP_URL.");
  }

  const response = await fetch(config.googleSheets.webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      sheetName,
      ...payload,
    }),
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`Google Sheets API Error [${action} on ${sheetName}]: ${result.error}`);
  }
  return result;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function dbGetAllUsers() {
  if (USE_LOCAL) return local.getAllUsers();
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('getRecords', 'qa_users');
    // In Google Sheets, 'role' might be stored as a string or number. Ensure consistency.
    return result.records.map(user => ({
      username: user.username, // Assuming 'username' is a column
      role: user.role,         // Assuming 'role' is a column
      name: user.name,         // Assuming 'name' is a column
      phone: user.phone,       // Assuming 'phone' is a column
      // Add other fields as necessary from your sheet
    }));
  }
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
  if (USE_GOOGLE_SHEETS) {
    // Google Sheets doesn't provide secure password hashing/checking out of the box.
    // Fetch all users and manually verify username and password.
    const result = await fetchGoogleSheets('getRecords', 'qa_users');
    const user = result.records.find(u => u.username?.toLowerCase() === username.trim().toLowerCase());

    if (!user || user.password !== password) {
      return { error: "Invalid username or password." };
    }
    return { success: true, user: { username: user.username, role: user.role } };
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
  if (USE_GOOGLE_SHEETS) {
    // Check if username already exists
    const existingUsers = await fetchGoogleSheets('getRecords', 'qa_users');
    if (existingUsers.records.some(u => u.username?.toLowerCase() === username.trim().toLowerCase())) {
      return { error: "Username already taken." };
    }

    const recordData = {
      username: username.trim(),
      password: password, // Note: storing passwords in plain text in Sheets is highly insecure.
                           // This is for demonstration. In production, use strong hashing on client or server.
      role: "tester",
      name: name.trim(),
      phone: phone.trim(),
    };
    const result = await fetchGoogleSheets('createRecord', 'qa_users', { recordData });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to create user." };
  }
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
  if (USE_GOOGLE_SHEETS) {
    const updates = { role };
    const result = await fetchGoogleSheets('updateRecord', 'qa_users', { recordId: username, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to update role." };
  }
  const { error } = await supabase.from("qa_users").update({ role }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbResetPassword(username, newPassword) {
  if (USE_LOCAL) return local.adminResetPassword(username, newPassword);
  if (USE_GOOGLE_SHEETS) {
    if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
    const updates = { password: newPassword }; // Insecure if not hashed
    const result = await fetchGoogleSheets('updateRecord', 'qa_users', { recordId: username, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to reset password." };
  }
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  const { error } = await supabase.from("qa_users").update({ password: newPassword }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbGetUserProfile(username) {
  if (USE_LOCAL) return local.getUserProfile(username);
  if (USE_GOOGLE_SHEETS) {
    // Profiles are linked to users, assuming 'user_id' in qa_profiles matches 'username' in qa_users
    const result = await fetchGoogleSheets('getRecords', 'qa_profiles');
    const profile = result.records.find(p => p.user_id === username);
    // Map to expected structure
    if (profile) {
      return {
        username: profile.user_id,
        name: profile.name, // Assuming name is part of profile
        bio: profile.bio,
        avatar_url: profile.avatar_url,
      };
    }
    return null; // Or throw error, depending on desired behavior
  }
  const { data, error } = await supabase.from("qa_profiles").select("*,(qa_users!inner(username))").eq("qa_users.username", username).single();
  if (error) throw error;
  return data;
}

export async function dbUpdateUserProfile(username, profile) {
  if (USE_LOCAL) return local.updateUserProfile(username, profile);
  if (USE_GOOGLE_SHEETS) {
    // Assuming profile.user_id is the unique identifier for updating
    const updates = { ...profile, user_id: username }; // Ensure user_id is correct for identifying the record
    const result = await fetchGoogleSheets('updateRecord', 'qa_profiles', { recordId: username, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to update profile." };
  }
  const { error } = await supabase.from("qa_profiles").update(profile).eq("user_id", username);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Products ──────────────────────────────────────────────────────────────────
export async function dbGetAllProducts() {
  if (USE_LOCAL) return local.getAllProducts();
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('getRecords', 'qa_products');
    return result.records;
  }
  const { data, error } = await supabase.from("qa_products").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function dbAddProduct(product) {
  if (USE_LOCAL) return local.addProduct(product);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('createRecord', 'qa_products', { recordData: product });
    if (result.success) {
      return { success: true, product: result.record };
    }
    return { error: "Failed to add product." };
  }
  const { data, error } = await supabase.from("qa_products").insert(product).select().single();
  if (error) return { error: error.message };
  return { success: true, product: data };
}

export async function dbUpdateProduct(id, updates) {
  if (USE_LOCAL) return local.updateProduct(id, updates);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('updateRecord', 'qa_products', { recordId: id, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to update product." };
  }
  const { error } = await supabase.from("qa_products").update(updates).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbDeleteProduct(id) {
  if (USE_LOCAL) return local.deleteProduct(id);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('deleteRecord', 'qa_products', { recordId: id });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to delete product." };
  }
  const { error } = await supabase.from("qa_products").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbGetUserProductsForUser(username) {
  if (USE_LOCAL) return local.getUserProductsForUser(username);
  if (USE_GOOGLE_SHEETS) {
    // Filter client-side as generic Apps Script doesn't support complex joins or filters
    const allUserProducts = await fetchGoogleSheets('getRecords', 'qa_user_products');
    const userProducts = allUserProducts.records.filter(up => up.user_id === username);
    // To get product details, you'd typically join. Here, we'll fetch all products and combine.
    const allProducts = await fetchGoogleSheets('getRecords', 'qa_products');
    const productsMap = new Map(allProducts.records.map(p => [p.id, p]));

    return userProducts.map(up => ({
      ...productsMap.get(up.product_id),
      role: up.role, // Add the role from user_product
    })).filter(p => p.id); // Filter out any products not found
  }
  const { data, error } = await supabase
    .from("qa_user_products")
    .select("*,qa_products(*)")
    .eq("user_id", username);
  if (error) throw error;
  return data.map((d) => ({ ...d.qa_products, role: d.role }));
}

export async function dbUpdateUserProductRole(userId, productId, role) {
  if (USE_LOCAL) return local.updateUserProductRole(userId, productId, role);
  if (USE_GOOGLE_SHEETS) {
    // Need to find the specific user_product record by composite key (userId, productId)
    const allUserProducts = await fetchGoogleSheets('getRecords', 'qa_user_products');
    const recordToUpdate = allUserProducts.records.find(up => up.user_id === userId && up.product_id === productId);

    if (recordToUpdate && recordToUpdate.id) {
      const updates = { role };
      const result = await fetchGoogleSheets('updateRecord', 'qa_user_products', { recordId: recordToUpdate.id, updates });
      if (result.success) {
        return { success: true };
      }
    }
    return { error: "Failed to update user product role." };
  }
  const { error } = await supabase
    .from("qa_user_products")
    .update({ role })
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbAddUserProduct(userId, productId, role) {
  if (USE_LOCAL) return local.addUserProduct(userId, productId, role);
  if (USE_GOOGLE_SHEETS) {
    const recordData = { user_id: userId, product_id: productId, role };
    const result = await fetchGoogleSheets('createRecord', 'qa_user_products', { recordData });
    if (result.success) {
      return { success: true, userProduct: result.record };
    }
    return { error: "Failed to add user product." };
  }
  const { data, error } = await supabase.from("qa_user_products").insert(
    { user_id: userId, product_id: productId, role }
  ).select().single();
  if (error) return { error: error.message };
  return { success: true, userProduct: data };
}

export async function dbRemoveUserProduct(userId, productId) {
  if (USE_LOCAL) return local.removeUserProduct(userId, productId);
  if (USE_GOOGLE_SHEETS) {
    // Need to find the specific user_product record by composite key (userId, productId)
    const allUserProducts = await fetchGoogleSheets('getRecords', 'qa_user_products');
    const recordToDelete = allUserProducts.records.find(up => up.user_id === userId && up.product_id === productId);

    if (recordToDelete && recordToDelete.id) {
      const result = await fetchGoogleSheets('deleteRecord', 'qa_user_products', { recordId: recordToDelete.id });
      if (result.success) {
        return { success: true };
      }
    }
    return { error: "Failed to remove user product." };
  }
  const { error } = await supabase.from("qa_user_products").delete().eq("user_id", userId).eq("product_id", productId);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export async function dbGetAllTasks() {
  if (USE_LOCAL) return local.getAllTasks();
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('getRecords', 'qa_tasks');
    return result.records;
  }
  const { data, error } = await supabase.from("qa_tasks").select("*").order("title");
  if (error) throw error;
  return data;
}

export async function dbGetTasksForProduct(productId) {
  if (USE_LOCAL) return local.getTasksForProduct(productId);
  if (USE_GOOGLE_SHEETS) {
    const allTasks = await fetchGoogleSheets('getRecords', 'qa_tasks');
    return allTasks.records.filter(task => task.product_id === productId);
  }
  const { data, error } = await supabase.from("qa_tasks").select("*").eq("product_id", productId);
  if (error) throw error;
  return data;
}

export async function dbAddTask(task) {
  if (USE_LOCAL) return local.addTask(task);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('createRecord', 'qa_tasks', { recordData: task });
    if (result.success) {
      return { success: true, task: result.record };
    }
    return { error: "Failed to add task." };
  }
  const { data, error } = await supabase.from("qa_tasks").insert(task).select().single();
  if (error) return { error: error.message };
  return { success: true, task: data };
}

export async function dbUpdateTask(id, updates) {
  if (USE_LOCAL) return local.updateTask(id, updates);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('updateRecord', 'qa_tasks', { recordId: id, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to update task." };
  }
  const { error } = await supabase.from("qa_tasks").update(updates).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbDeleteTask(id) {
  if (USE_LOCAL) return local.deleteTask(id);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('deleteRecord', 'qa_tasks', { recordId: id });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to delete task." };
  }
  const { error } = await supabase.from("qa_tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Tickets ───────────────────────────────────────────────────────────────────
export async function dbGetAllTickets() {
  if (USE_LOCAL) return local.getAllTickets();
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('getRecords', 'qa_tickets');
    return result.records;
  }
  const { data, error } = await supabase.from("qa_tickets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function dbGetTicketsForUser(username) {
  if (USE_LOCAL) return local.getTicketsForUser(username);
  if (USE_GOOGLE_SHEETS) {
    const allTickets = await fetchGoogleSheets('getRecords', 'qa_tickets');
    return allTickets.records.filter(ticket => ticket.user_id === username);
  }
  const { data, error } = await supabase.from("qa_tickets").select("*").eq("user_id", username).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function dbGetTicketsForProduct(productId) {
  if (USE_LOCAL) return local.getTicketsForProduct(productId);
  if (USE_GOOGLE_SHEETS) {
    const allTickets = await fetchGoogleSheets('getRecords', 'qa_tickets');
    // Need to find tasks associated with this product, then find tickets for those tasks
    const allTasks = await fetchGoogleSheets('getRecords', 'qa_tasks');
    const productTaskIds = new Set(allTasks.records.filter(task => task.product_id === productId).map(task => task.id));
    return allTickets.records.filter(ticket => productTaskIds.has(ticket.task_id));
  }
  const { data, error } = await supabase.from("qa_tickets").select("*,qa_tasks!inner(product_id)").eq("qa_tasks.product_id", productId);
  if (error) throw error;
  return data.map(d => ({
    ...d, qa_tasks: undefined, product_id: d.qa_tasks.product_id
  }));
}

export async function dbGetTicketById(id) {
  if (USE_LOCAL) return local.getTicketById(id);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('getRecord', 'qa_tickets', { recordId: id });
    return result.record;
  }
  const { data, error } = await supabase.from("qa_tickets").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function dbAddTicket(ticket) {
  if (USE_LOCAL) return local.addTicket(ticket);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('createRecord', 'qa_tickets', { recordData: ticket });
    if (result.success) {
      return { success: true, ticket: result.record };
    }
    return { error: "Failed to add ticket." };
  }
  const { data, error } = await supabase.from("qa_tickets").insert(ticket).select().single();
  if (error) return { error: error.message };
  return { success: true, ticket: data };
}

export async function dbUpdateTicket(id, updates) {
  if (USE_LOCAL) return local.updateTicket(id, updates);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('updateRecord', 'qa_tickets', { recordId: id, updates });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to update ticket." };
  }
  const { error } = await supabase.from("qa_tickets").update(updates).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbDeleteTicket(id) {
  if (USE_LOCAL) return local.deleteTicket(id);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('deleteRecord', 'qa_tickets', { recordId: id });
    if (result.success) {
      return { success: true };
    }
    return { error: "Failed to delete ticket." };
  }
  const { error } = await supabase.from("qa_tickets").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

// ── Submissions ───────────────────────────────────────────────────────────────
export async function dbGetSubmissionsForTicket(ticketId) {
  if (USE_LOCAL) return local.getSubmissionsForTicket(ticketId);
  if (USE_GOOGLE_SHEETS) {
    const allSubmissions = await fetchGoogleSheets('getRecords', 'qa_submissions');
    return allSubmissions.records.filter(sub => sub.ticket_id === ticketId);
  }
  const { data, error } = await supabase.from("qa_submissions").select("*").eq("ticket_id", ticketId);
  if (error) throw error;
  return data;
}

export async function dbAddSubmission(submission) {
  if (USE_LOCAL) return local.addSubmission(submission);
  if (USE_GOOGLE_SHEETS) {
    const result = await fetchGoogleSheets('createRecord', 'qa_submissions', { recordData: submission });
    if (result.success) {
      return { success: true, submission: result.record };
    }
    return { error: "Failed to add submission." };
  }
  const { data, error } = await supabase.from("qa_submissions").insert(submission).select().single();
  if (error) return { error: error.message };
  return { success: true, submission: data };
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function dbGetUnreadNotifications(username) {
  if (USE_LOCAL) return local.getUnreadNotifications(username);
  if (USE_GOOGLE_SHEETS) {
    const allNotifications = await fetchGoogleSheets('getRecords', 'qa_notifications');
    return allNotifications.records.filter(n => n.to_username === username && !n.read);
  }
  const { data, error } = await supabase
    .from("qa_notifications")
    .select("*")
    .eq("to_username", username)
    .eq("read", false);
  if (error) throw error;
  return data;
}

export async function dbSaveNotification(notif) {
  if (USE_LOCAL) { local.saveNotification(notif); return; }
  if (USE_GOOGLE_SHEETS) {
    // Google Sheets Apps Script 'upsert' equivalent: check if exists, then update or create
    const existingNotifications = await fetchGoogleSheets('getRecords', 'qa_notifications');
    const existingNotif = existingNotifications.records.find(n => n.id === notif.id);

    const recordData = {
      id: notif.id,
      to_username: notif.toUsername,
      message: notif.message,
      type: notif.type ?? null,
      ref_id: notif.refId ?? null,
      ref_type: notif.refType ?? null,
      read: notif.read ?? false,
      created_at: notif.createdAt,
    };

    let result;
    if (existingNotif) {
      result = await fetchGoogleSheets('updateRecord', 'qa_notifications', { recordId: notif.id, updates: recordData });
    } else {
      result = await fetchGoogleSheets('createRecord', 'qa_notifications', { recordData });
    }

    if (!result.success) {
      throw new Error("Failed to save notification.");
    }
    return; // Supabase version returns void on success
  }
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
  if (USE_GOOGLE_SHEETS) {
    const updates = { read: true };
    const result = await fetchGoogleSheets('updateRecord', 'qa_notifications', { recordId: id, updates });
    if (!result.success) {
      throw new Error("Failed to mark notification as read.");
    }
    return;
  }
  const { error } = await supabase.from("qa_notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function dbMarkAllNotificationsRead(username) {
  if (USE_LOCAL) { local.markAllNotificationsRead(username); return; }
  if (USE_GOOGLE_SHEETS) {
    // Fetch all notifications for the user and update them one by one
    // This can be inefficient for many notifications; consider batch update in Apps Script
    const allNotifications = await fetchGoogleSheets('getRecords', 'qa_notifications');
    const userNotifications = allNotifications.records.filter(n => n.to_username === username && !n.read);

    for (const notif of userNotifications) {
      const updates = { read: true };
      await fetchGoogleSheets('updateRecord', 'qa_notifications', { recordId: notif.id, updates });
    }
    return;
  }
  const { error } = await supabase.from("qa_notifications").update({ read: true }).eq("to_username", username);
  if (error) throw error;
}

export async function dbClearNotifications(username) {
  if (USE_LOCAL) { local.clearNotifications(username); return; }
  if (USE_GOOGLE_SHEETS) {
    // Fetch all notifications for the user and delete them one by one
    // This can be inefficient for many notifications; consider batch delete in Apps Script
    const allNotifications = await fetchGoogleSheets('getRecords', 'qa_notifications');
    const userNotifications = allNotifications.records.filter(n => n.to_username === username);

    for (const notif of userNotifications) {
      await fetchGoogleSheets('deleteRecord', 'qa_notifications', { recordId: notif.id });
    }
    return;
  }
  const { error } = await supabase.from("qa_notifications").delete().eq("to_username", username);
  if (error) throw error;
}

// ── Activity log (Drive when configured, otherwise localStorage) ──────────────
// These functions correctly use driveEnabled or local and do not need changes
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
