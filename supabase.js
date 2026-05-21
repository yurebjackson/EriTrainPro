// ============================================================
// NOTIFICATIONS
// ============================================================

async function dbCreateNotification(userId, title, message) {
  const { error } = await supabaseClient
    .from('notifications')
    .insert([{ user_id: userId, title, message }]);
  if (error) throw error;
}

async function dbGetNotifications(userId) {
  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

async function dbMarkNotifRead(id) {
  const { error } = await supabaseClient
    .from('notifications')
    .update({ read: true })
    .eq('id', id);
  if (error) throw error;
}

async function dbMarkAllNotifsRead(userId) {
  const { error } = await supabaseClient
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
}
