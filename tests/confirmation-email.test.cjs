const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('cadastro e reenvio usam confirmação Supabase e domínio de produção', async () => {
  let signup, resend, failure;
  const context = vm.createContext({ supabase: { createClient: () => ({ auth: {
    signUp: async payload => { signup = payload; return { data: {}, error: failure }; },
    resend: async payload => { resend = payload; return { error: failure }; }
  } }) } });
  vm.runInContext(fs.readFileSync('supabase.js', 'utf8'), context);
  await context.signUp('test@example.com', 'Password123', 'Professor', 'admin');
  await context.resendConfirmationEmail('test@example.com');
  assert.equal(signup.options.data.role, 'professor');
  assert.equal(signup.options.emailRedirectTo, 'https://eritrainpro.com.br/');
  assert.equal(resend.type, 'signup');
  assert.equal(resend.email, 'test@example.com');
  assert.equal(resend.options.emailRedirectTo, signup.options.emailRedirectTo);
  failure = new Error('SMTP indisponível');
  await assert.rejects(context.resendConfirmationEmail('test@example.com'), /SMTP/);
  await assert.rejects(context.signUp('test@example.com', 'Password123', 'Professor'), /SMTP/);
});

function setup() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, style: {}, dataset: { label: 'Reenviar confirmação de e-mail' }, checkValidity: () => true });
    return elements.get(id);
  };
  let calls = 0, resolve, failure;
  const ctx = vm.createContext({
    console, document: { getElementById: el },
    supabaseClient: { auth: { onAuthStateChange() {} } },
    showToast(message) { ctx.message = message; },
    setTimeout() {},
    resendConfirmationEmail: async () => {
      calls++;
      if (failure) throw failure;
      await new Promise(done => { resolve = done; });
    }
  });
  vm.runInContext(fs.readFileSync('auth.js', 'utf8'), ctx);
  return { ctx, el, calls: () => calls, finish: () => resolve(), fail: value => { failure = value; } };
}

test('reenvio valida e-mail, evita duplicidade e mantém intervalo após sucesso', async () => {
  const s = setup();
  await s.ctx.doResendConfirmation();
  assert.equal(s.calls(), 0);
  s.el('lEmail').value = 'test@example.com';
  s.el('lEmail').checkValidity = () => false;
  await s.ctx.doResendConfirmation();
  assert.equal(s.calls(), 0);
  s.el('lEmail').checkValidity = () => true;
  const pending = s.ctx.doResendConfirmation();
  await s.ctx.doResendConfirmation();
  assert.equal(s.calls(), 1);
  s.finish();
  await pending;
  assert.equal(s.el('btnResendConfirmation').disabled, true);
  assert.match(s.el('registrationStatus').textContent, /Se houver um cadastro/);
});

test('falha de envio permite tentar novamente; limite do servidor mantém bloqueio', async () => {
  const s = setup();
  s.el('lEmail').value = 'test@example.com';
  s.fail(new Error('fetch failed'));
  await s.ctx.doResendConfirmation();
  assert.equal(s.el('btnResendConfirmation').disabled, false);
  assert.match(s.ctx.message, /conexão/);
  assert.equal(s.el('registrationStatus').textContent, undefined);
  s.fail(new Error('For security purposes, after 90 seconds'));
  await s.ctx.doResendConfirmation();
  assert.equal(s.el('btnResendConfirmation').disabled, true);
  assert.match(s.el('btnResendConfirmation').textContent, /90/);
});
