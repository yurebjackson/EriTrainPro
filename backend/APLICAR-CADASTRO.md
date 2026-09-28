# Cadastro de professores com aprovação

Implementação preparada localmente. Não publicar o frontend antes de concluir os passos abaixo.

1. Faça um backup do banco e guarde a versão atual de `create-professor`.
2. Execute **todo** `cadastro-professor.sql` no SQL Editor. Contas existentes recebem aprovação; novos cadastros públicos de professor ficam pendentes. O cadastro público nunca cria Admin. O SQL protege campos administrativos e adiciona políticas restritivas às tabelas públicas existentes, bloqueando contas pendentes, recusadas ou inativas. Reaplicar não aprova solicitações pendentes.
3. Atualize a Edge Function **create-professor** com `create-professor/index.ts`, mantendo a verificação JWT. O cadastro pelo ADM continua usando senha temporária e confirmação administrativa do e-mail, como antes. A função agora exige ADM ativo, usa aleatoriedade criptográfica, grava aprovação explicitamente e verifica falha ao salvar o perfil. Nenhum e-mail de teste foi enviado pelo agente.
4. No Supabase Auth, habilite cadastro por e-mail e **Confirm Email**. Configure Site URL e Redirect URLs para `https://eritrainpro.com.br/`, endereço usado pelo cadastro e pelo reenvio. Configure SMTP para entregar confirmação a destinatários externos; o Resend usado pela Edge Function não configura automaticamente o SMTP do Auth. Não compartilhe credenciais no chat.
5. Confirme as instalações para então publicar `index.html`, `auth.js` e `supabase.js` juntos. O frontend exige `approval_status`; por isso o SQL vem primeiro.
6. Teste com uma conta nova: solicitar acesso, receber confirmação, confirmar e entrar. Deve aparecer “Aguardando aprovação”. Como ADM, abra Professores, selecione o plano e aprove. O professor deve entrar novamente para carregar o acesso aprovado. Confirmar e-mail sozinho não aprova.
7. Teste recusa, tentativa de aprovação antes da confirmação, administrador inativo, cadastro administrativo, login de professor existente e cadastro/login de aluno. A confirmação de e-mail do Auth também pode afetar o cadastro atual de alunos, que usa signup: valide esse fluxo antes de liberar.

As solicitações recusadas permanecem registradas e não têm botão de reativação. Revisão de recusa e notificações automáticas de aprovação não fazem parte desta versão; o solicitante consulta o resultado fazendo login. Professores existentes não são reclassificados como pendentes. Campos de aprovação são separados da ativação e assinatura.

As políticas restritivas também bloqueiam contas antigas desativadas. Funções privilegiadas externas não são controladas por RLS: antes de abrir cadastro público, revisar `reset-professor-password`, `change-student-password`, `create-subscription` e `mp-webhook` para confirmar autorização e impedir que uma conta pendente consiga operar por essas funções. Os códigos não foram fornecidos. Não considerar a liberação pública pronta enquanto essa revisão e o teste de SMTP estiverem pendentes.

Validação: `node --test tests/*.test.cjs`. Os testes de PostgreSQL usam PGlite com dados fictícios; não substituem os testes no Supabase real. O cadastro administrativo mantém o envio existente e retorna `emailSent: false` quando ele falha, sem simular falha de criação da conta.
