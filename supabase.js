const SUPABASE_URL = 'https://rzivwbsqmsyhywfnmxbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JG7SoGkEeLCvjU_ZbT89Uw_9gVjq856';
 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
 
// ============================================================
// AUTH
// ============================================================
 
async function signUp(email, password, name, role) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { name, role }
    }
  });
  if (error) throw error;
  return data;
}
 
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
 
async function signOut() {
  await supabaseClient.auth.signOut();
}
 
async function getCurrentUser() {
  const { data } = await supabaseClient.auth.getUser();
  return data?.user ?? null;
}
 
async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
 
  if (error) throw error;
 
  if (!data) {
    const user = await getCurrentUser();
    const name = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário';
    const role = user?.user_metadata?.role || 'aluno';
 
    const { data: created, error: insertErr } = await supabaseClient
      .from('profiles')
      .insert([{ id: userId, name, role }])
      .select()
      .maybeSingle();
 
    if (insertErr) throw insertErr;
    return created;
  }
 
  return data;
}
 
async function updateProfile(userId, updates) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
// ============================================================
// STUDENTS
// ============================================================
 
async function dbGetStudents() {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('students')
    .select('*')
    .eq('professor_id', user.id)
    .order('name');
  if (error) throw error;
  return data ?? [];
}
 
async function dbCreateStudent(payload) {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('students')
    .insert([{ ...payload, professor_id: user.id, progress: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
async function dbUpdateStudent(id, updates) {
  const { data, error } = await supabaseClient
    .from('students')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
// Versão para o aluno atualizar o próprio progresso (filtra por user_id)
async function dbUpdateStudentProgress(studentId, progress) {
  const user = await getCurrentUser();
  const { error } = await supabaseClient
    .from('students')
    .update({ progress })
    .eq('id', studentId)
    .eq('user_id', user.id);
  if (error) throw error;
}
 
async function dbDeleteStudent(id) {
  const { error } = await supabaseClient.from('students').delete().eq('id', id);
  if (error) throw error;
}
 
// ============================================================
// EXERCISES
// ============================================================
 
async function dbGetExercises() {
  const { data, error } = await supabaseClient
    .from('exercises')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}
 
async function dbCreateExercise(payload) {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('exercises')
    .insert([{ ...payload, created_by: user.id }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
async function dbUpdateExercise(id, updates) {
  const { data, error } = await supabaseClient
    .from('exercises')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
async function dbDeleteExercise(id) {
  const { error } = await supabaseClient.from('exercises').delete().eq('id', id);
  if (error) throw error;
}
 
// ============================================================
// PLANS
// ============================================================
 
async function dbGetPlansForStudent(studentId) {
  const { data, error } = await supabaseClient
    .from('plans')
    .select(`
      *,
      plan_days (
        *,
        plan_exercises ( *, exercises(*) )
      )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
 
async function dbGetAllPlans() {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('plans')
    .select(`
      *,
      plan_days (
        *,
        plan_exercises ( *, exercises(*) )
      )
    `)
    .eq('professor_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
 
async function dbCreatePlan(studentId, name, description, days) {
  const user = await getCurrentUser();
 
  const { data: plan, error: planErr } = await supabaseClient
    .from('plans')
    .insert([{ student_id: studentId, professor_id: user.id, name, description }])
    .select()
    .single();
  if (planErr) throw planErr;
 
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const { data: planDay, error: dayErr } = await supabaseClient
      .from('plan_days')
      .insert([{ plan_id: plan.id, label: day.label, sort_order: i }])
      .select()
      .single();
    if (dayErr) throw dayErr;
 
    for (let j = 0; j < day.exercises.length; j++) {
      const { error: exErr } = await supabaseClient
        .from('plan_exercises')
        .insert([{ plan_day_id: planDay.id, exercise_id: day.exercises[j], sort_order: j }]);
      if (exErr) throw exErr;
    }
  }
 
  return plan;
}
 
async function dbDeletePlan(planId) {
  const { error } = await supabaseClient.from('plans').delete().eq('id', planId);
  if (error) throw error;
}
 
async function dbAssignPlan(studentId, planId) {
  // Atualiza plan_id no aluno
  await dbUpdateStudent(studentId, { plan_id: planId });
 
  // Atualiza também student_id no plano (garante que loadStudentData encontra)
  const { error } = await supabaseClient
    .from('plans')
    .update({ student_id: studentId })
    .eq('id', planId);
  if (error) throw error;
}
 
// ============================================================
// ASSESSMENTS
// ============================================================
 
async function dbGetAssessments(studentId) {
  const { data, error } = await supabaseClient
    .from('assessments')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
 
async function dbCreateAssessment(payload) {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('assessments')
    .insert([{ ...payload, professor_id: user.id }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
 
// ============================================================
// TRAINING HISTORY
// ============================================================
 
async function dbGetHistory(studentId) {
  const { data, error } = await supabaseClient
    .from('training_history')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}
 
async function dbAddHistory(studentId, entry) {
  const { data, error } = await supabaseClient
    .from('training_history')
    .insert([{ student_id: studentId, ...entry }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

// ============================================================
// AVATAR (Storage)
// ============================================================

async function uploadAvatar(userId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabaseClient.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data } = supabaseClient.storage
    .from('avatars')
    .getPublicUrl(path);

  // Salva URL no profile com cache-bust
  const url = `${data.publicUrl}?t=${Date.now()}`;
  await updateProfile(userId, { avatar_url: url });
  return url;
}

// ============================================================
// SCHEDULED ASSESSMENTS
// ============================================================

async function dbCreateScheduledAssessment(payload) {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('scheduled_assessments')
    .insert([{ ...payload, professor_id: user.id }])
    .select().single();
  if (error) throw error;
  return data;
}

async function dbGetScheduledAssessments() {
  const user = await getCurrentUser();
  const { data, error } = await supabaseClient
    .from('scheduled_assessments')
    .select('*, students(name, user_id)')
    .eq('professor_id', user.id)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function dbGetStudentSchedules(studentId) {
  const { data, error } = await supabaseClient
    .from('scheduled_assessments')
    .select('*')
    .eq('student_id', studentId)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function dbUpdateScheduledAssessment(id, updates) {
  const { error } = await supabaseClient
    .from('scheduled_assessments')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

async function dbDeleteScheduledAssessment(id) {
  const { error } = await supabaseClient
    .from('scheduled_assessments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// WORKOUT FEEDBACK
// ============================================================

async function dbSaveFeedback(payload) {
  const { data, error } = await supabaseClient
    .from('workout_feedback')
    .insert([payload])
    .select().single();
  if (error) throw error;
  return data;
}

async function dbGetFeedbacks(studentId) {
  const { data, error } = await supabaseClient
    .from('workout_feedback')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
