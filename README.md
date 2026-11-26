# Stokai Web

Versão web do Stokai: vendas, gastos, estoque, encomendas e relatórios para pequenos negócios.
Roda no navegador (celular ou computador), pode ser instalada na tela inicial como app (PWA) e
guarda os dados na nuvem, sem APK nem build para Android/iOS.

- **App:** Next.js 16 + React 19, hospedado no **Vercel** (plano Hobby, gratuito).
- **Banco:** **Turso** (libSQL, o mesmo SQLite do app Expo, na nuvem; plano Free).
- **Login próprio:** e-mail e senha (hash scrypt), sessão em cookie `httpOnly`. Cada conta só vê
  os próprios dados. O token do banco fica **só no servidor** (rotas `/api`), nunca no navegador.

## Funcionalidades (as mesmas do app Expo)

| Tela | O que faz |
|---|---|
| **Início** | Resultado do mês, gráfico diário (vendas − gastos), registrar/editar/excluir venda e gasto, venda ligada a produto baixa o estoque (editar/excluir devolve), desconto, custo por venda, plataforma, toque longo (ou botão direito) para selecionar e **compartilhar como imagem** |
| **Encomendas** | Data/hora de entrega, destaque de atrasadas e de hoje, pendentes/entregues, "Marcar como entregue" cria a venda |
| **Estoque** | Preço, custo, margem, quantidade, fornecedor, contato, link; arrastar para a direita exclui |
| **Relatórios** | Este mês / este ano / geral (filtro por mês), margem, mais e menos vendidos, plataformas, resumo mensal, potencial do estoque |
| **Conta** | Foto, nome, negócio, telefone, PIX, tema claro/escuro, 9 cores, **empresa**, **notificações**, **exportar/importar backup (.json)**, alterar senha, sair |

O backup `.json` tem o mesmo formato da versão web do app Expo: dá para trazer os dados de lá em
*Conta → Importar backup*.


## Empresa (várias pessoas, mesmos dados)

- **Criar:** *Conta → Criar empresa* com nome e palavra-chave. Quem cria pode levar os próprios dados para a empresa.
- **Entrar:** *Conta → Entrar em uma empresa* com o mesmo nome e palavra-chave. O dono recebe notificação (e e-mail) e
  aprova ou recusa. Depois de aprovado, a pessoa vê e registra os dados da empresa; os dados pessoais dela ficam
  guardados e voltam se ela sair.
- Só o dono aprova, recusa e remove membros, e só ele pode importar backup sobre os dados da empresa.
- Tema, cor, foto e informações pessoais continuam individuais.
- Palavra-chave errada: no máximo 10 tentativas por hora.

## Notificações

- **No app:** sininho em *Conta → Notificações* (número na aba Conta). Pedidos de entrada podem ser aprovados ali.
  Cada venda, gasto ou encomenda registrada por alguém da empresa gera notificação para os outros membros.
- **Por e-mail:** a cada venda, gasto ou encomenda, todos os membros recebem e-mail (inclusive quem registrou).
  Cada pessoa pode desligar em *Conta → Notificações*. Pedidos de entrada e aprovações também chegam por e-mail.

### Configurar o envio pelo Gmail

1. Na conta Google que vai enviar, ative a **verificação em 2 etapas**.
2. Crie uma **senha de app** em <https://myaccount.google.com/apppasswords> (nome: "Stokai"). São 16 letras.
3. No Vercel → projeto → *Settings → Environment Variables*, adicione:
   | Nome | Valor |
   |---|---|
   | `GMAIL_USER` | o endereço Gmail (ex.: `seunegocio@gmail.com`) |
   | `GMAIL_APP_PASSWORD` | a senha de app de 16 letras |
4. *Deployments → ⋯ → Redeploy* para valer.

Com o Gmail configurado, o app também passa a:

- **Confirmar o e-mail no cadastro:** quem cria conta recebe um código de 6 dígitos e só vê os dados depois de digitá-lo
  (contas criadas antes continuam liberadas).
- **Recuperar a senha:** *Esqueci minha senha* na tela de login envia um código para criar uma senha nova.

Os códigos valem 30 minutos, são de uso único, aceitam 5 tentativas e podem ser reenviados a cada 60 s (máx. 6 por hora).

Sem essas variáveis, tudo funciona e só os e-mails deixam de ser enviados (sem confirmação de cadastro e sem *Esqueci minha senha*). O Gmail permite cerca de 500 e-mails por dia.
Em desenvolvimento, `MAIL_OUTBOX_FILE=/caminho/arquivo.jsonl` grava os e-mails num arquivo em vez de enviar.

---

## Publicar

### 1. Criar o banco no Turso

Pelo painel (<https://app.turso.tech>) ou pela CLI do Turso:

```bash
turso db create stokai                 # cria o banco
turso db show stokai --url             # → TURSO_DATABASE_URL  (libsql://stokai-....turso.io)
turso db tokens create stokai          # → TURSO_AUTH_TOKEN    (token só deste banco)
```

> O **token de API da plataforma** (o que gerencia a conta inteira) **não** é o que vai no app.
> O app precisa do **token do banco** (`turso db tokens create`), que só acessa esse banco.

As tabelas são criadas sozinhas na primeira vez que o app acessa o banco (veja `lib/server/schema.ts`).

**Alternativa:** no Vercel, em *Storage → Turso Cloud*, a integração cria o banco e já
preenche `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no projeto.

### 2. Importar no Vercel

1. O código está em <https://github.com/Charles-code-prog/stokai-web>.
2. Em <https://vercel.com/new>, importe esse repositório (Framework **Next.js**, Root Directory: a raiz).
3. Em **Environment Variables**:

   | Nome | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://stokai-...turso.io` |
   | `TURSO_AUTH_TOKEN` | token do banco |
   | `ALLOW_SIGNUP` | *(opcional)* `false` depois de criar sua conta, para ninguém mais se cadastrar |

4. **Deploy.** Abra o endereço, toque em **Criar conta** e pronto.

No celular: **Adicionar à tela inicial** (Chrome: menu ⋮; Safari: Compartilhar) abre como app.

---

## Rodar no computador

```bash
npm install
npm run dev        # http://localhost:3000
```

Sem `.env.local`, usa um arquivo local `stokai-local.db` (mesmo motor do Turso). Para usar o banco
da nuvem localmente, crie `.env.local` a partir de `.env.example`.

## Esqueci a senha

Com o Gmail configurado, use *Esqueci minha senha* na tela de login. Sem e-mail, o dono do banco pode redefinir
(com o `.env.local` apontando para o Turso):

```bash
node --env-file=.env.local scripts/reset-password.mjs email@exemplo.com novaSenha
```

Quem está logado pode trocar a senha em *Conta → Alterar senha*.

## Estrutura

```
app/
  (app)/                  telas (Início, Encomendas, Estoque, Relatórios, Conta) + barra de abas
  login/                  entrar / criar conta
  api/auth/[action]/      me, login, signup, logout, password
  api/data/               GET carrega tudo; POST insert/update/remove/adjustQty/setPref/import
  api/org/                empresa: create/join/approve/reject/remove/leave
  api/notifications/      lista, marcar como lidas, preferência de e-mail
lib/
  server/db.ts            conexão Turso + criação das tabelas
  server/schema.ts        schema SQLite
  server/auth.ts          senhas (scrypt), sessões, proteção CSRF
  server/data.ts          consultas com lista branca de colunas, sempre filtradas pelo espaço (usuário ou empresa)
  server/context.ts       usuário logado + espaço de dados ativo
  server/org.ts           regras de empresa (criar, pedir, aprovar, sair)
  server/notify.ts        notificações no app + e-mail (Gmail)
  server/activity.ts      avisos de venda/gasto/encomenda
  data.tsx                estado da tela: atualiza na hora e grava em fila no servidor
  workspace.tsx           empresa + notificações (atualiza a cada 45 s e ao voltar para o app)
  backend.ts, auth.tsx, theme.ts, format.ts, share.ts, types.ts
components/ui.tsx         folhas de baixo, menu de ações, diálogos, toque longo
components/workspace.tsx  seções Empresa e Notificações da tela Conta
scripts/reset-password.mjs
```

## Limites e cuidados

- **Turso Free:** 5 GB de armazenamento, 500 milhões de linhas lidas e 10 milhões escritas por mês.
  Sobra muito para um negócio pequeno.
- **Vercel Hobby:** gratuito para uso pessoal/não comercial.
- Faça **Exportar backup** de vez em quando.
- Não há limite de tentativas de login além do custo do scrypt; use uma senha forte e, se o app for só seu,
  `ALLOW_SIGNUP=false`.
