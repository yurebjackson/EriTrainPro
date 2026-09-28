// ============================================================
// EriTrain Pro — Auth Layer (Supabase)
// ============================================================

let CURRENT_USER    = null;   // objeto auth.user
let CURRENT_PROFILE = null;   // linha da tabela profiles

// ============================================================
// Inicialização — chame no DOMContentLoaded
// ============================================================
async function initAuth() {
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  const callbackFailed = (typeof AUTH_CALLBACK_FAILED !== 'undefined' && AUTH_CALLBACK_FAILED) || callbackParams.has('error') || callbackParams.has('error_code');
  // Usa getSession() — lê do localStorage sem chamada de rede,
  // evita deslogar ao dar F5 enquanto o token ainda é válido
  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (callbackFailed || error) {
    showLoginScreen();
    document.getElementById('registrationStatus').textContent = 'Não foi possível validar este link. Ele pode ter expirado ou já ter sido usado. Tente entrar com seu e-mail e senha; se o e-mail ainda não estiver confirmado, solicite um novo link no botão abaixo.';
    return;
  }

  if (!session?.user) {
    showLoginScreen();
    return;
  }

  try {
    CURRENT_USER    = session.user;
    CURRENT_PROFILE = await getProfile(session.user.id);
    await bootApp();
  } catch (e) {
    console.error('initAuth error:', e);
    showLoginScreen();
  }
}

// ============================================================
// Login com e-mail + senha — detecção automática de role
// ============================================================
async function doLogin() {
  if (document.getElementById('btnLogin').disabled) return;
  const email    = document.getElementById('lEmail').value.trim();
  const password = document.getElementById('lPass').value;

  if (!email || !password) {
    showToast('Preencha e-mail e senha', 'aviso');
    return;
  }

  setBtnLoading('btnLogin', true);

  try {
    const result = await signIn(email, password);
    CURRENT_USER = result.user;

    CURRENT_PROFILE = await getProfile(CURRENT_USER.id);

    if (!CURRENT_PROFILE) {
      showToast('Perfil não encontrado.', 'erro');
      await signOut();
      setBtnLoading('btnLogin', false);
      return;
    }

    // Primeiro acesso — força troca de senha
    if (CURRENT_PROFILE.first_access === true) {
      setBtnLoading('btnLogin', false);
      document.getElementById('LS').style.display = 'none';
      openM('moFirstAccess');
      return;
    }

    await bootApp();
    setBtnLoading('btnLogin', false);
  } catch (err) {
    const resultado = traduzirErroSupabase(err);
    if (resultado.tipo === 'rate_limit') {
      iniciarCountdown('btnLogin', resultado.segundos);
    } else {
      showToast(resultado.texto || resultado, 'erro');
      setBtnLoading('btnLogin', false);
    }
  }
}

// ============================================================
// Tradução de erros do Supabase para português
// ============================================================
function traduzirErroSupabase(err) {
  const msg = (err.message || '').toLowerCase();

  // Rate limit — extrai os segundos se disponível
  const rateMatch = msg.match(/after\s+(\d+)\s+second/);
  if (rateMatch) {
    return { tipo: 'rate_limit', segundos: parseInt(rateMatch[1]) };
  }
  if (msg.includes('security purposes') || msg.includes('rate limit') || msg.includes('too many')) {
    return { tipo: 'rate_limit', segundos: 60 };
  }

  // Erros comuns de auth
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return { tipo: 'erro', texto: 'E-mail ou senha incorretos.' };
  }
  if (msg.includes('email already registered') || msg.includes('user already registered') || msg.includes('already been registered')) {
    return { tipo: 'erro', texto: 'Este e-mail já está cadastrado. Faça login.' };
  }
  if (msg.includes('password should be at least')) {
    return { tipo: 'erro', texto: 'A senha deve ter ao menos 6 caracteres.' };
  }
  if (msg.includes('invalid email')) {
    return { tipo: 'erro', texto: 'Informe um e-mail válido.' };
  }
  if (msg.includes('email not confirmed')) {
    return { tipo: 'erro', texto: 'Confirme seu e-mail antes de entrar.' };
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return { tipo: 'erro', texto: 'Erro de conexão. Verifique sua internet.' };
  }

  return { tipo: 'erro', texto: 'Erro: ' + err.message };
}

// ============================================================
// Cadastro de novo usuário (professor ou aluno)
// ============================================================
async function doRegister() {
  if (document.getElementById('btnRegister').disabled) return;
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPass').value;
  const role     = 'professor';

  if (!name || !email || !password) {
    showToast('Preencha todos os campos', 'aviso');
    return;
  }
  if (password.length < 8) {
    showToast('A senha deve ter ao menos 8 caracteres', 'aviso');
    return;
  }

  setBtnLoading('btnRegister', true);

  try {
    if (!document.getElementById('regEmail').checkValidity()) throw new Error('Informe um e-mail válido.');
    await signUp(email, password, name, role);
    await signOut();
    document.getElementById('lEmail').value = email;
    document.getElementById('regPass').value = '';
    document.getElementById('registrationStatus').textContent = 'Solicitação recebida. Confira sua caixa de entrada e o spam para confirmar o cadastro. Depois, aguarde a aprovação do administrador. Se já possui conta, tente entrar.';
    showToast('Confira seu e-mail e aguarde a aprovação.', 'sucesso');
    setBtnLoading('btnRegister', false);
    toggleRegisterForm(false);
  } catch (err) {
    const resultado = traduzirErroSupabase(err);

    if (resultado.tipo === 'rate_limit') {
      iniciarCountdown('btnRegister', resultado.segundos);
    } else {
      showToast(resultado.texto, 'erro');
      setBtnLoading('btnRegister', false);
    }
  }
}

async function doResendConfirmation() {
  const button = document.getElementById('btnResendConfirmation');
  if (button.disabled) return;
  const input = document.getElementById('lEmail');
  const email = input.value.trim();
  if (!email || !input.checkValidity()) {
    showToast('Informe um e-mail válido no campo de login.', 'aviso');
    return;
  }
  setBtnLoading('btnResendConfirmation', true);
  try {
    await resendConfirmationEmail(email);
    document.getElementById('registrationStatus').textContent = 'Se houver um cadastro aguardando confirmação para este e-mail, você receberá um novo link. Confira também o spam. A aprovação do administrador continua necessária.';
    iniciarCountdown('btnResendConfirmation', 60);
  } catch (err) {
    const resultado = traduzirErroSupabase(err);
    if (resultado.tipo === 'rate_limit') {
      iniciarCountdown('btnResendConfirmation', resultado.segundos);
    } else {
      showToast(resultado.texto, 'erro');
      setBtnLoading('btnResendConfirmation', false);
    }
  }
}

// ============================================================
// Countdown no botão após rate limit
// ============================================================
function iniciarCountdown(btnId, segundos) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.disabled = true;
  showToast(`Aguarde ${segundos}s para tentar novamente`, 'aviso', (segundos + 1) * 1000);

  let restante = segundos;

  const tick = () => {
    if (restante <= 0) {
      btn.disabled    = false;
      btn.textContent = btn.dataset.label;
      showToast('Agora você pode tentar novamente!', 'sucesso');
      return;
    }
    btn.textContent = `Aguarde ${restante}s...`;
    restante--;
    setTimeout(tick, 1000);
  };

  tick();
}

// ============================================================
// Logout
// ============================================================
async function doLogout() {
  try {
    await signOut();
  } catch (_) {}
  CURRENT_USER = CURRENT_PROFILE = null;
  showLoginScreen();
}

// ============================================================
// Salvar perfil do professor
// ============================================================
async function saveProfPerfil() {
  const name = document.getElementById('ppName').value.trim();
  if (!name) {
    showToast('Informe seu nome', 'aviso');
    return;
  }

  const updates = {
    name,
    specialty: document.getElementById('ppEsp').value,
    cref:      document.getElementById('ppCref').value.trim(),
    phone:     document.getElementById('ppTel').value.trim(),
    bio:       document.getElementById('ppBio').value.trim(),
  };

  setBtnLoading('btnSaveProf', true);

  try {
    CURRENT_PROFILE = await updateProfile(CURRENT_USER.id, updates);
    document.getElementById('NU').textContent = CURRENT_PROFILE.name;
    closeM('moProfPerfil');
    showToast('Perfil atualizado com sucesso!', 'sucesso');
    nav('meu-perfil');
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'erro');
  } finally {
    setBtnLoading('btnSaveProf', false);
  }
}

// ============================================================
// Cadastrar aluno (professor cria conta + registo na tabela)
// ============================================================
async function saveStudent() {
  const name  = document.getElementById('nsName').value.trim();
  const email = document.getElementById('nsEmail').value.trim();
  const pass  = document.getElementById('nsPass').value;

  if (!name || !email || !pass) {
    showToast('Preencha nome, e-mail e senha', 'aviso');
    return;
  }
  if (pass.length < 6) {
    showToast('A senha do aluno deve ter ao menos 6 caracteres', 'aviso');
    return;
  }

  setBtnLoading('btnSaveStudent', true);

  // Guarda sessão e token do professor ANTES de qualquer signUp
  const professorUser    = CURRENT_USER;
  const professorProfile = CURRENT_PROFILE;
  const { data: { session: professorSession } } = await supabaseClient.auth.getSession();

  try {
    // 1. Cria conta Auth do aluno usando Admin API via fetch direto
    //    para não contaminar a sessão do professor
    const signUpResp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        email,
        password: pass,
        data: { name, role: 'aluno' }
      })
    });

    const signUpData = await signUpResp.json();
    if (signUpData.error) throw new Error(signUpData.error.message || signUpData.msg || 'Erro ao criar conta do aluno');

    const studentUserId = signUpData.id ?? signUpData.user?.id ?? null;

    // 2. Restaura sessão do professor (signUp via fetch não altera sessão)
    //    mas garantimos que CURRENT_USER ainda é o professor
    CURRENT_USER    = professorUser;
    CURRENT_PROFILE = professorProfile;

    // 3. Cria registro na tabela students com professor_id correto
    const { data: newStudent, error: studentErr } = await supabaseClient
      .from('students')
      .insert([{
        name,
        username:     email.split('@')[0],
        goal:         document.getElementById('nsGoal').value,
        age:          parseInt(document.getElementById('nsAge').value) || null,
        phone:        document.getElementById('nsPhone').value.trim(),
        user_id:      studentUserId,
        professor_id: professorUser.id,
        progress:     0,
      }])
      .select()
      .single();

    if (studentErr) throw studentErr;

    // 4. Adiciona localmente sem recarregar tudo
    STUDENTS.push({
      ...newStudent,
      avaliacoes: [],
      history:    [],
    });

    closeM('moNewStudent');
    // Limpa o formulário
    ['nsName','nsEmail','nsPass','nsAge','nsPhone'].forEach(id => {
      document.getElementById(id).value = '';
    });

    showToast(`Aluno ${name} cadastrado com sucesso!`, 'sucesso');
    nav('alunos');

  } catch (err) {
    const resultado = traduzirErroSupabase(err);
    if (resultado.tipo === 'rate_limit') {
      iniciarCountdown('btnSaveStudent', resultado.segundos);
    } else {
      showToast(resultado.texto || 'Erro: ' + err.message, 'erro');
    }
  } finally {
    setBtnLoading('btnSaveStudent', false);
  }
}

// ============================================================
// Proteção de rota
// ============================================================
function requireRole(role) {
  return CURRENT_PROFILE?.role === role;
}

function isProfessor() { return requireRole('professor'); }
function isAluno()     { return requireRole('aluno'); }
function isAdmin()     { return requireRole('admin'); }

// ============================================================
// Primeiro acesso — troca obrigatória de senha
// ============================================================
async function doChangeFirstPassword() {
  const newPass     = document.getElementById('newPass').value;
  const newPassConf = document.getElementById('newPassConfirm').value;

  if (!newPass || newPass.length < 8) {
    showToast('A senha deve ter ao menos 8 caracteres', 'aviso'); return;
  }
  if (newPass !== newPassConf) {
    showToast('As senhas não coincidem', 'aviso'); return;
  }

  setBtnLoading('btnFirstPass', true);

  try {
    // Atualiza senha no Supabase Auth
    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) throw error;

    // Remove flag de primeiro acesso
    await updateProfile(CURRENT_USER.id, { first_access: false });
    CURRENT_PROFILE.first_access = false;

    closeM('moFirstAccess');
    showToast('Senha definida com sucesso! Bem-vindo!', 'sucesso');
    await bootApp();
  } catch(e) {
    showToast('Erro: ' + e.message, 'erro');
  } finally {
    setBtnLoading('btnFirstPass', false);
  }
}

// ============================================================
// Helpers de interface
// ============================================================
function showLoginScreen() {
  if (typeof resetWorkoutSession === 'function') resetWorkoutSession();
  document.getElementById('MA').style.display = 'none';
  document.getElementById('LS').style.display = 'flex';
  document.getElementById('lEmail').value = '';
  document.getElementById('lPass').value  = '';
  document.getElementById('pendingAccess').style.display = 'none';
  document.getElementById('registrationStatus').textContent = '';
  toggleRegisterForm(false);
  setBtnLoading('btnLogin', false);
}

function toggleRegisterForm(show) {
  document.getElementById('pendingAccess').style.display = 'none';
  if (show) document.getElementById('registrationStatus').textContent = '';
  document.getElementById('loginForm').style.display    = show ? 'none' : 'block';
  document.getElementById('registerForm').style.display = show ? 'block' : 'none';
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled     = loading;
  btn.textContent  = loading ? 'Aguarde...' : btn.dataset.label;
}

// ============================================================
// Iniciar app após login
// ============================================================
async function bootApp() {
  if (!CURRENT_PROFILE || CURRENT_PROFILE.active === false || CURRENT_PROFILE.approval_status !== 'approved') {
    const message = CURRENT_PROFILE?.approval_status === 'pending' ? 'Aguardando aprovação do administrador.' :
      CURRENT_PROFILE?.approval_status === 'rejected' ? 'Sua solicitação não foi aprovada. Entre em contato com o administrador.' : 'Acesso indisponível. Entre em contato com o administrador.';
    showLoginScreen();
    document.getElementById('registrationStatus').textContent = message;
    if (CURRENT_PROFILE?.approval_status === 'pending' && CURRENT_PROFILE.active !== false) {
      const confirmed = Boolean(CURRENT_USER?.email_confirmed_at);
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('pendingAccess').style.display = 'block';
      document.getElementById('registrationEmailState').textContent = confirmed ? 'E-mail confirmado com sucesso.' : 'Confirmação do e-mail ainda não verificada. Abra o link recebido na sua caixa de entrada.';
      document.getElementById('registrationStatus').textContent = confirmed ? 'E-mail confirmado com sucesso! Aguardando aprovação do administrador para liberar seu painel.' : 'Aguardando confirmação do e-mail e aprovação do administrador.';
    }
    return;
  }
  document.getElementById('LS').style.display    = 'none';
  document.getElementById('MA').style.display    = 'flex';
  document.getElementById('NU').textContent       = CURRENT_PROFILE.name;

  const nb = document.getElementById('NB');
  if (CURRENT_PROFILE.role === 'admin') {
    nb.textContent = 'Admin';
    nb.className   = 'rb' ;
    nb.style.background = '#6B6B69';
    nb.style.color = 'white';
  } else {
    nb.textContent = isProfessor() ? 'Professor' : 'Aluno';
    nb.className   = 'rb ' + (isProfessor() ? 'rp' : 'ral');
  }

  curUser = {
    role:     CURRENT_PROFILE.role,
    name:     CURRENT_PROFILE.name,
    username: CURRENT_USER.email,
    sid:      null,
  };

  buildSidebar();

  if (CURRENT_PROFILE.role === 'admin') {
    nav('admin-dashboard');
  } else if (isProfessor()) {
    await loadAllData();
    // Se professor está bloqueado por falta de pagamento, redireciona para assinatura
    if (typeof isProfBloqueado === 'function' && isProfBloqueado()) {
      nav('minha-assinatura');
      setTimeout(() => { if (typeof showPaymentGate === 'function') showPaymentGate(); }, 150);
    } else {
      nav('dashboard');
    }
  } else {
    const notifWrap = document.getElementById('notifWrap');
    if (notifWrap) notifWrap.style.display = 'flex';

    await loadStudentData();
    await Promise.all([
      loadNotifications(),
      typeof loadStudentLoads === 'function' ? loadStudentLoads() : Promise.resolve(),
    ]);
    showNotifBanner();
    nav('meu-treino');
  }
}

async function checkRegistrationApproval() {
  if (document.getElementById('btnCheckApproval').disabled) return;
  setBtnLoading('btnCheckApproval', true);
  try {
    const user = await getCurrentUser();
    if (!user) {
      showLoginScreen();
      document.getElementById('registrationStatus').textContent = 'Entre novamente para consultar seu cadastro.';
      return;
    }
    CURRENT_USER = user;
    CURRENT_PROFILE = await getProfile(user.id);
    await bootApp();
  } catch (err) {
    document.getElementById('registrationStatus').textContent = 'Não foi possível consultar a aprovação agora. Tente novamente.';
  } finally {
    setBtnLoading('btnCheckApproval', false);
  }
}

// ============================================================
// Sessão em tempo real
// ============================================================
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    CURRENT_USER = CURRENT_PROFILE = null;
    showLoginScreen();
  }
});
