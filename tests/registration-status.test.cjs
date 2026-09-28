const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ confirmed = true, hash = '' } = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, style: {}, dataset: { label: 'Entrar' } });
    return elements.get(id);
  };
  const user = { id: 'professor', email_confirmed_at: confirmed ? '2026-09-27T12:00:00Z' : null };
  let profile = { name: 'Professor', role: 'professor', active: true, approval_status: 'pending' };
  let loads = 0;
  const context = vm.createContext({
    console, URLSearchParams, window: { location: { hash } },
    document: { getElementById: el },
    supabaseClient: { auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: { user } } }) } },
    getProfile: async () => profile, getCurrentUser: async () => user,
    signIn: async () => ({ user }),
    showToast() {}, buildSidebar() {}, nav(page) { context.page = page; },
    loadAllData: async () => { loads++; }
  });
  vm.runInContext(fs.readFileSync('auth.js', 'utf8'), context);
  return { context, el, loads: () => loads, approve: () => { profile = { ...profile, approval_status: 'approved' }; } };
}

test('retorno confirmado mostra e-mail concluído e aprovação separada, sem carregar painel', async () => {
  const s = setup();
  await s.context.initAuth();
  assert.match(s.el('registrationEmailState').textContent, /E-mail confirmado com sucesso/);
  assert.match(s.el('registrationStatus').textContent, /Aguardando aprovação/);
  assert.equal(s.el('pendingAccess').style.display, 'block');
  assert.equal(s.el('loginForm').style.display, 'none');
  assert.equal(s.loads(), 0);
  s.approve();
  await s.context.checkRegistrationApproval();
  assert.equal(s.context.page, 'dashboard');
  assert.equal(s.loads(), 1);
  assert.equal(s.el('LS').style.display, 'none');
  assert.equal(s.el('btnCheckApproval').disabled, false);
});

test('sessão sem confirmação não recebe mensagem de e-mail confirmado', async () => {
  const s = setup({ confirmed: false });
  await s.context.initAuth();
  assert.match(s.el('registrationEmailState').textContent, /ainda não verificada/);
  assert.equal(s.loads(), 0);
});

test('link expirado não é apresentado como confirmação bem-sucedida', async () => {
  const s = setup({ hash: '#error=access_denied&error_code=otp_expired' });
  await s.context.initAuth();
  assert.match(s.el('registrationStatus').textContent, /expirado/);
  assert.equal(s.el('loginForm').style.display, 'block');
  assert.equal(s.loads(), 0);
});

test('login pendente libera o botão; falha ao consultar aprovação permite repetir', async () => {
  const s = setup();
  s.el('lEmail').value = 'test@example.com';
  s.el('lPass').value = 'Password123';
  await s.context.doLogin();
  assert.equal(s.el('btnLogin').disabled, false);
  s.context.getProfile = async () => { throw new Error('offline'); };
  await s.context.checkRegistrationApproval();
  assert.match(s.el('registrationStatus').textContent, /Não foi possível consultar/);
  assert.equal(s.el('btnCheckApproval').disabled, false);
  assert.equal(s.loads(), 0);
});
