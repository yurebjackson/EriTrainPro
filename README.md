# EriTrain Pro

Plataforma de gestão de treinos personalizados para personal trainers e academias.

> Este projeto foi desenvolvido em homenagem ao Eric, irmão do fundador.

---

## Visão geral

Sistema web completo com três perfis de usuário — **admin**, **professor** e **aluno** — cada um com painel e funcionalidades próprias. O sistema é hospedado via GitHub Pages e usa Supabase como backend (banco de dados, autenticação e Edge Functions) e Mercado Pago para cobrança recorrente de professores.

**Site:** https://eritrainpro.com.br/  
**Repositório:** https://github.com/yurebjackson/EriTrainPro

---

## Estrutura de arquivos

```
EriTrainPro/
├── index.html          # UI completa do sistema (toda a interface)
├── auth.js             # Login, sessão, primeiro acesso, bootApp
├── supabase.js         # Cliente Supabase + todas as funções de banco
├── students.js         # CRUD alunos, avaliações, histórico
├── exercises.js        # CRUD exercícios
├── plans.js            # CRUD planos de treino
└── README.md           # Este arquivo
```

### Edge Functions (Supabase)

| Função | Descrição |
|---|---|
| `create-professor` | Cria professor + envia senha temporária por e-mail |
| `reset-professor-password` | Admin reseta senha de professor |
| `change-student-password` | Professor altera senha de aluno |
| `create-subscription` | Cria assinatura recorrente no Mercado Pago |
| `mp-webhook` | Recebe notificações do Mercado Pago e atualiza status |

---

## Como rodar localmente

### Validação e organização

Execute `npm ci --ignore-scripts` e `npm test` para validar os fluxos com dados fictícios. As dependências servem aos testes; o frontend continua estático, sem etapa de compilação.

`backend/` contém migrações e Edge Functions necessárias ao sistema; `tests/` contém os testes de regressão. Dependências, segredos e backups locais ficam fora do Git pelo `.gitignore`.

O cadastro público envia confirmação pelo Supabase Auth e exige aprovação do administrador. O reenvio está disponível na tela de login. A configuração do backend está documentada em `backend/APLICAR-CADASTRO.md`. Publicar no GitHub Pages não instala SQL nem Edge Functions no Supabase.

### Pré-requisitos

- [VS Code](https://code.visualstudio.com/)
- Extensão **Live Server** (ritwickdey.liveserver) instalada no VS Code

### Passos

1. Clone o repositório:
   ```bash
   git clone https://github.com/yurebjackson/EriTrainPro.git
   cd EriTrainPro
   ```

2. Abra a pasta no VS Code:
   ```bash
   code .
   ```

3. Clique com o botão direito em `index.html` → **Open with Live Server**

4. O sistema abre em `http://127.0.0.1:5500` com hot reload automático.

> Não é necessário nenhum build, bundler ou instalação de dependências. O projeto é HTML/JS puro com dependências via CDN.

---

## Credenciais e serviços

### Supabase

| Item | Valor |
|---|---|
| URL | `https://rzivwbsqmsyhywfnmxbr.supabase.co` |
| Chave pública | `sb_publishable_JG7SoGkEeLCvjU_ZbT89Uw_9gVjq856` |

### Admin do sistema

| Item | Valor |
|---|---|
| E-mail | `yurebarros57@gmail.com` |
| ID | `e3307723-3e3a-4354-b24f-c303d274d524` |

### Mercado Pago

| Item | Valor |
|---|---|
| Token de teste | `APP_USR-1684907794408099-052616-688f2e26669de4cf3214b9af0d779ae7-3429542490` |
| Token de produção | `APP_USR-827990825554239-052615-9779ee2a81b40d6a9f555646899edf96-339911222` |
| Valor do plano | R$ 30,00/mês |

### Resend (e-mails)

| Item | Valor |
|---|---|
| Remetente | `onboarding@resend.dev` |
| Secret no Supabase | `RESEND_API_KEY` |

---

## Banco de dados (Supabase)

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `profiles` | Usuários com role (admin/professor/aluno) |
| `students` | Alunos vinculados a professores |
| `exercises` | Exercícios com vídeo YouTube |
| `plans` | Planos de treino |
| `plan_days` | Dias dentro de um plano |
| `plan_exercises` | Exercícios dentro de cada dia |
| `assessments` | Avaliações físicas |
| `training_history` | Histórico de treinos concluídos |
| `notifications` | Notificações internas |
| `scheduled_assessments` | Agendamentos de avaliações |
| `workout_feedback` | Feedback pós-treino do aluno |
| `subscriptions` | Assinaturas do Mercado Pago |
| `student_exercise_config` | Séries/reps personalizadas por aluno |
| `student_exercise_load` | Carga (kg) registrada por aluno/exercício |

### Colunas importantes em `profiles`

```
id, name, role, email, avatar_url,
specialty, cref, phone, bio, active,
plan_type, payment_status, subscription_id, first_access
```

### Função SQL necessária (RLS)

```sql
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
```

### Policy para admin ver alunos de qualquer professor

```sql
create policy admin_read_all_students on students
  for select using (is_admin());
```

---

## Perfis de usuário

### Admin (`role = 'admin'`)
- Gerencia professores (criar, editar, ativar/desativar, resetar senha)
- Cria links de assinatura no Mercado Pago para cada professor
- Visualiza contadores globais (professores, alunos, MRR estimado)
- Recebe alertas de pagamentos pendentes ou com problema

### Professor (`role = 'professor'`)
- Cadastra e gerencia seus alunos
- Cria e atribui planos de treino personalizados
- Define séries/reps específicas por aluno ao atribuir um plano
- Registra avaliações físicas e agendamentos
- Visualiza histórico de treinos e feedbacks dos alunos
- Gerencia sua assinatura (acesso bloqueado sem pagamento ativo)

### Aluno (`role = 'aluno'`)
- Visualiza e executa seu plano de treino
- Registra carga (kg) em cada exercício
- Usa temporizador de descanso automático entre exercícios
- Acompanha progresso, histórico e avaliações físicas
- Recebe notificações do professor

---

## Fluxo de pagamento (Mercado Pago)

```
Admin cria professor
       ↓
Admin clica em 💳 na listagem de professores
       ↓
Edge Function create-subscription cria preapproval no MP
       ↓
Professor recebe notificação com link de pagamento
       ↓
Professor acessa "Minha Assinatura" e clica em "Ativar"
       ↓
Paga via cartão de crédito/débito no checkout do MP
       ↓
Webhook mp-webhook recebe confirmação
       ↓
payment_status → 'authorized' | active: true
```

**Estados de pagamento:**

| Status | Comportamento |
|---|---|
| `pending` | Professor acessa o sistema mas fica bloqueado (só vê assinatura) |
| `authorized` / `active` | Acesso completo liberado |
| `past_due` | Falha no pagamento — bloqueado, notificado |
| `paused` | Retry do MP em andamento — bloqueado |
| `cancelled` | Assinatura cancelada — bloqueado |

---

## Deploy de Edge Functions

Via painel do Supabase:
1. Acesse **Edge Functions** → **Deploy a new function**
2. Nomeie exatamente como o arquivo (sem extensão `.ts`)
3. Cole o código e clique em **Deploy**
4. Desative **JWT verification** nas funções `mp-webhook` e `create-subscription`

Via CLI:
```bash
supabase link --project-ref rzivwbsqmsyhywfnmxbr
supabase functions deploy create-subscription
supabase functions deploy mp-webhook
```

---

## Secrets configurados no Supabase

| Secret | Descrição |
|---|---|
| `MP_ACCESS_TOKEN` | Token de acesso do Mercado Pago |
| `RESEND_API_KEY` | Chave da API do Resend para e-mails |

---

## SQL útil para debug

```sql
-- Ver usuários e roles
select id, email from auth.users order by created_at desc;
select id, name, role, payment_status, active from profiles;

-- Ver assinaturas
select * from subscriptions;

-- Ver alunos por professor
select s.name as aluno, p.name as professor
from students s
join profiles p on p.id = s.professor_id;

-- Ver feedbacks de treino
select wf.effort_level, wf.notes, s.name as aluno, wf.created_at
from workout_feedback wf
join students s on s.id = wf.student_id
order by wf.created_at desc;

-- Ver notificações
select n.title, n.message, n.read, p.name
from notifications n
join profiles p on p.id = n.user_id
order by n.created_at desc;

-- Remover usuário
delete from auth.users where id = 'UUID_AQUI';
```

---

## Funcionalidades implementadas

- [x] Login unificado com detecção automática de role
- [x] Primeiro acesso com troca obrigatória de senha
- [x] Cadastro de professor pelo admin com senha temporária por e-mail
- [x] Bloqueio de acesso para professor sem assinatura ativa
- [x] Integração Mercado Pago — assinatura recorrente + webhook automático
- [x] CRUD completo de exercícios com vídeo YouTube
- [x] Biblioteca de 57 exercícios importáveis
- [x] Criação e edição de planos de treino por dias
- [x] Atribuição de plano com séries/reps personalizadas por aluno
- [x] Visão do aluno: iniciar treino, marcar exercícios, temporizador de descanso
- [x] Registro de carga (kg) por exercício, persistido no banco
- [x] Avaliações físicas com gráfico de evolução (SVG)
- [x] Exportar avaliação em PDF
- [x] Agendamentos de avaliação com notificação ao aluno
- [x] Feedback pós-treino (nível de esforço + comentário)
- [x] Histórico de treinos por aluno
- [x] Notificações internas (sininho + toast)
- [x] Upload de avatar (Supabase Storage)
- [x] Modo escuro completo
- [x] Layout responsivo — desktop e mobile

## Próximos passos

- [ ] Domínio próprio (`eritrainpro.com.br`)
- [ ] E-mail automático de vencimento antes do pagamento
- [ ] Histórico de pagamentos no admin por professor
- [ ] Chat interno professor ↔ aluno
- [ ] Dashboard admin com gráfico de crescimento mensal

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML/CSS/JS puro | Interface completa (sem framework) |
| Supabase | Banco de dados (PostgreSQL), Auth, Storage, Edge Functions |
| Deno (Edge Functions) | Lógica server-side |
| Mercado Pago API | Assinaturas recorrentes |
| Resend | Envio de e-mails transacionais |
| GitHub Pages | Hospedagem do frontend |
| Tabler Icons | Ícones via webfont CDN |

---

*Atualizado em junho de 2026*
