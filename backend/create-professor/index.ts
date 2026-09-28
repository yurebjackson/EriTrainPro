import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verifica se quem chama é admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: corsHeaders });

    const { data: profile } = await supabaseAdmin.from("profiles").select("role, active").eq("id", user.id).single();
    if (profile?.role !== "admin" || profile.active === false) return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: corsHeaders });

    const { name, email, plan_type } = await req.json();
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['basic','pro','unlimited'].includes(plan_type ?? 'basic')) return new Response(JSON.stringify({ error: "Nome, e-mail ou plano inválido" }), { status: 400, headers: corsHeaders });

    // Gera senha temporária
    const tempPassword = "Fit@" + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");

    // Cria usuário no Supabase Auth
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name, role: "professor" },
    });
    if (createErr) throw createErr;

    // Cria profile
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: newUser.user.id,
      name,
      email,
      role: "professor",
      plan_type: plan_type ?? "basic",
      first_access: true,
      approval_status: 'approved',
      created_by: user.id,
    });

    if (profileError) {
      const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error(cleanupError ? 'Falha ao salvar perfil; conta requer revisão do administrador.' : 'Falha ao salvar perfil; tente novamente.');
    }

    // Monta e-mail bonito
    const safeName = name.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1A6FD4,#1255A8);padding:36px 40px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">💪 EriTrain Pro</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:6px">Plataforma de gestão de treinos</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px">
            <p style="font-size:16px;color:#1C1C1A;margin:0 0 8px">Olá, <strong>${safeName}</strong>! 👋</p>
            <p style="font-size:14px;color:#6B6B69;line-height:1.7;margin:0 0 28px">
              Sua conta de professor no <strong>EriTrain Pro</strong> foi criada com sucesso.
              Abaixo estão suas credenciais de acesso:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;border-radius:12px;margin-bottom:28px">
              <tr>
                <td style="padding:24px">
                  <div style="margin-bottom:16px">
                    <div style="font-size:11px;font-weight:600;color:#6B6B69;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">E-mail</div>
                    <div style="font-size:15px;font-weight:600;color:#1C1C1A">${email}</div>
                  </div>
                  <div>
                    <div style="font-size:11px;font-weight:600;color:#6B6B69;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Senha temporária</div>
                    <div style="font-size:22px;font-weight:700;color:#1A6FD4;letter-spacing:2px;font-family:monospace">${tempPassword}</div>
                  </div>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3DC;border-radius:10px;margin-bottom:28px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="font-size:13px;color:#633806;margin:0">
                    ⚠️ <strong>Por segurança, você será solicitado a trocar sua senha no primeiro acesso.</strong>
                  </p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="https://yurebjackson.github.io/EriTrainPro/"
                     style="display:inline-block;background:linear-gradient(135deg,#1A6FD4,#1255A8);color:#ffffff;
                            font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;
                            text-decoration:none;letter-spacing:.2px">
                    Acessar o EriTrain Pro →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#F5F5F3;padding:24px 40px;border-top:1px solid #E3E3E1">
            <p style="font-size:12px;color:#A8A8A6;margin:0;text-align:center">
              Dúvidas? Entre em contato com o suporte.<br>
              <strong style="color:#6B6B69">EriTrain Pro</strong> · Plataforma de gestão de treinos
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Tenta enviar e-mail — não falha se der erro de domínio (sem domínio verificado)
    let emailSent = false;
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY")!;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "EriTrain Pro <onboarding@resend.dev>",
          to: [email],
          subject: "🏋️ Bem-vindo ao EriTrain Pro — Suas credenciais de acesso",
          html: emailBody,
        }),
      });
      // Se der erro de validação (sem domínio), apenas ignora
      if (!emailRes.ok) {
        const errJson = await emailRes.json().catch(() => ({}));
        if (errJson.name !== "validation_error") {
          throw new Error("Erro ao enviar e-mail: " + JSON.stringify(errJson));
        }
        // validation_error = sem domínio verificado — continua sem e-mail
      }
      emailSent = emailRes.ok;
    } catch {
      // Conta já criada: comunicar falha de entrega sem induzir novo cadastro.
      emailSent = false;
    }

    // Sempre retorna a senha para exibir na tela do admin
    return new Response(JSON.stringify({ success: true, userId: newUser.user.id, tempPassword, emailSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
