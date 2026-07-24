import { supabase } from "./supabase";

// ── Users ─────────────────────────────────────────────────────────────────────
export async function dbGetAllUsers() {
  const { data, error } = await supabase.from("qa_users").select("username, role, name, phone").order("username");
  if (error) throw error;
  return data;
}

export async function dbLogin(username, password) {
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
  const { error } = await supabase.from("qa_users").update({ role }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbResetPassword(username, newPassword) {
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters." };
  const { error } = await supabase.from("qa_users").update({ password: newPassword }).eq("username", username);
  if (error) return { error: error.message };
  return { success: true };
}

export async function dbDeleteUser(username) {
  const { error } = await supabase.from("qa_users").delete().eq("username", username);
  if (error) throw error;
}

// ── Submissions ───────────────────────────────────────────────────────────────
export async function dbGetSubmissions() {
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
  const { error } = await supabase.from("qa_submissions").delete().eq("id", id);
  if (error) throw error;
}

// ── Profiles ──────────────────────────────────────────────────────────────────
export async function dbGetProfiles() {
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
  const { error } = await supabase.from("qa_profiles").upsert({
    id:         profile.id,
    name:       profile.name,
    created_at: profile.createdAt,
    questions:  profile.questions,
  });
  if (error) throw error;
}

export async function dbDeleteProfile(id) {
  const { error } = await supabase.from("qa_profiles").delete().eq("id", id);
  if (error) throw error;
}

// ── Products ──────────────────────────────────────────────────────────────────
export async function dbGetProducts() {
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
  const { error } = await supabase.from("qa_products").upsert({
    id:          product.id,
    name:        product.name,
    description: product.description ?? "",
    created_at:  product.createdAt ?? Date.now(),
  });
  if (error) throw error;
}

export async function dbDeleteProduct(id) {
  await supabase.from("qa_user_products").delete().eq("product_id", id);
  const { error } = await supabase.from("qa_products").delete().eq("id", id);
  if (error) throw error;
}

// ── User product access ───────────────────────────────────────────────────────
export async function dbGetUserProducts(username) {
  const { data, error } = await supabase
    .from("qa_user_products")
    .select("product_id")
    .eq("username", username);
  if (error) throw error;
  return data.map(r => r.product_id);
}

export async function dbSetUserProducts(username, productIds) {
  await supabase.from("qa_user_products").delete().eq("username", username);
  if (productIds.length === 0) return;
  const { error } = await supabase.from("qa_user_products").insert(
    productIds.map(pid => ({ username, product_id: pid }))
  );
  if (error) throw error;
}
