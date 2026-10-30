# Nexo Assist

Assistente web de service desk para a Nexo. O monorepo separa o portal dos clientes, o console da equipe Nexo, o backend Go, o serviço de agente Mastra e o banco PostgreSQL.

## Stack

- **Frontend:** React, TypeScript, Vite e CSS3. A interface usa Bento Grid, superfícies com relevo suave e a paleta azul, coral e lima.
- **Backend:** Go para autenticação, autorização, estado das conversas, regras de chamados, deduplicação, SLA e auditoria.
- **Agente:** serviço TypeScript com Mastra. Cada resposta visível do Nexo Assist é gerada pelo Gemini, incluindo saudação e retorno após confirmar um chamado. As instruções Markdown de `agent/.context/` são contexto operacional carregado no prompt, junto com memória de resoluções autorizada, histórico, skills ativas e dados permitidos dos chamados do próprio funcionário. A API Go valida cada operação; o agente não tem acesso direto ao banco nem ferramentas administrativas.
- **Banco:** PostgreSQL.
- **Modelo de linguagem:** `gemini-3.5-flash-lite`, configurável por ambiente.
- **Deploy:** imagem Docker para Heroku Container Registry e Heroku Postgres.

## Por que Gemini 3.5 Flash-Lite

O caso de uso é um service desk delimitado: recuperar procedimentos curtos, pedir dados que faltam, preservar o contexto da conversa e redigir respostas breves. O Gemini 3.5 Flash-Lite é suficiente para a função deste protótipo porque o conhecimento é curto e estruturado, as intenções e operações são restritas e o serviço Mastra envia somente o contexto relevante. A classificação de alto risco e as regras decisivas — autorização, privacidade, confirmação de chamados, deduplicação e escalonamento — são verificadas no backend Go e não dependem de o modelo obedecer ao prompt. A separação segue o modelo do Mastra de agentes TypeScript e ferramentas/contexto controlados pela aplicação ([documentação Mastra](https://mastra.ai/docs)).

O identificador usado é `gemini-3.5-flash-lite`. O projeto limita chamadas do modelo a **500 por dia** por padrão (`GEMINI_DAILY_LIMIT=500`), como orçamento operacional desta aplicação. A quota real oferecida pela Google depende do projeto e do tier da conta, portanto este limite local não representa uma quota universal do provedor. Consulte a [documentação do modelo](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) e as [regras de quota da Gemini API](https://ai.google.dev/gemini-api/docs/rate-limits).

Sem `GEMINI_API_KEY`, os fluxos locais determinísticos mantêm a demonstração funcional. A chave deve ficar no ambiente do serviço do agente e nunca no bundle React.

## Rodar localmente

### Desenvolvimento no Mac sem VM

No macOS, o caminho recomendado para desenvolver neste projeto é PostgreSQL nativo com os serviços Go, Mastra e Vite rodando diretamente no host. Assim, não é necessário Docker Desktop nem uma VM Linux.

1. Instale e abra [Postgres.app](https://postgresapp.com/downloads.html); clique em **Initialize** para criar o servidor local.
2. No Terminal, adicione as ferramentas do Postgres.app ao `PATH` e crie o usuário e o banco esperados pelo `.env`:

   ```sh
   export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
   createuser --createdb --login nexo
   psql -d postgres -c "ALTER ROLE nexo WITH PASSWORD 'nexo';"
   createdb --owner=nexo nexo_assist
   ```

3. Copie `.env.example` para `.env` apenas se ainda não houver um `.env`. Preencha `GEMINI_API_KEY` para usar o modelo; sem chave, os fluxos determinísticos continuam disponíveis.
4. Na raiz do projeto, inicie os três serviços:

   ```sh
   ./scripts/dev-local.sh
   ```

5. Acesse [http://localhost:5173](http://localhost:5173). O Vite encaminha `/api` ao backend Go na porta 8080; o backend inicializa schema e dados demo na primeira execução. O agent Mastra escuta somente em loopback, na porta 4112.

O script lê as variáveis do `.env` sem enviar a chave ao bundle React e encerra os três processos ao pressionar `Ctrl+C`. Dependências JavaScript são instaladas uma vez com `npm install` na raiz. O Go deve estar disponível no `PATH`.

### Compose opcional

O Compose continua disponível para validar a imagem de produção e ambientes com runtime de containers:

```sh
docker compose up --build
```

Nesse modo a aplicação é servida em [http://localhost:8080](http://localhost:8080), com PostgreSQL dentro do Compose.

## Contas de demonstração

Todas as contas abaixo usam a senha `Nexo2026!`. Essas credenciais são somente para demonstração local; troque-as antes de qualquer publicação com acesso externo.

| Perfil       | E-mail                | Nome          |
| ------------ | --------------------- | ------------- |
| Cliente      | `ana@nexo.example`    | Ana Souza     |
| Cliente      | `marina@nexo.example` | Marina Costa  |
| Cliente      | `lucas@nexo.example`  | Lucas Almeida |
| Colaborador  | `carla@nexo.example`  | Carla Mendes  |
| Admin Nexo   | `admin@nexo.example`  | Admin Nexo    |

**Papéis:** Cliente é quem contrata o suporte da Nexo e acompanha os próprios chamados; Colaborador trabalha na Nexo e atende os casos; Admin Nexo representa o dono/equipe de TI e administra o sistema. A seed cria três clientes para demonstrar o isolamento dos chamados entre contas. O banco guarda hash SHA-256 com salt por usuário; a senha em texto é usada apenas na inicialização dos dados demo e não é persistida.

> SHA-256 com salt atende ao formato solicitado para este desafio, mas não é uma função de derivação de senha resistente a força bruta. Para contas reais, substitua por Argon2id ou scrypt e use um provedor de identidade corporativo.

## O que está incluído

- Login por e-mail com bloqueio de rotas e separação dos perfis Cliente, Colaborador Nexo e Admin Nexo.
- Atendimento do cliente com seleção inicial de categoria, conversa, respostas rápidas, limite de 30 mensagens e atualização periódica do histórico.
- Rascunho de chamado com confirmação antes de criar. Chamados relacionados abertos são atualizados; chamados resolvidos nos últimos sete dias podem ser reabertos.
- A classificação combina tipo e categoria: falha é incidente (`INC`), pedido de acesso/equipamento/software é requisição (`REQ`). O ID numérico é gerado pelo backend na confirmação, como `INC-21000` ou `REQ-21001`; Hardware e Acesso podem ser qualquer um dos tipos conforme o relato.
- Depois da confirmação, a conversa fica diretamente vinculada ao chamado (`conversation.ticketId`/`conversation.ticket`). Atualizações posteriores no mesmo chat alteram esse chamado, em vez de criar outro; encerrar, assumir ou devolver o atendimento também atualiza o status do chamado relacionado.
- Sete chamados mock com status, prioridades e datas variados, além de sete artigos curtos de conhecimento.
- Console da equipe com fila e filtros, assunção concorrente protegida pelo banco, pausa do agente durante atendimento humano, devolução ao agente e encerramento.
- Painel de chamados por cliente, estado de SLA, indicadores de operação e explicação das decisões com justificativa e confiança estimada.
- Skills configuráveis e memória contextual. O agente recupera apenas uma nota de resolução operacional, sem mostrar os dados pessoais do cliente que originou o caso.
- Senhas com salt individual e rotas de API autenticadas; clientes só consultam chamados associados à própria conta.
- Contextos de produto, operação, política, stack e design versionados em Markdown dentro de `agent/.context/`; o Mastra seleciona trechos relevantes para cada solicitação.
- Respostas do Gemini com até três tentativas por geração; se a IA continuar indisponível ou o limite diário local for atingido, o chat mostra uma orientação de contingência e registra essa decisão.

## API e estados

As rotas funcionais ficam sob `/api`. A autenticação usa token de sessão enviado no cabeçalho `Authorization: Bearer …`. As conversas percorrem os estados `OPEN_AI`, `WAITING_ANALYST`, `IN_PROGRESS_HUMAN` e `CLOSED`; o backend impede o agente de responder fora de `OPEN_AI`.

O prazo de prioridade Crítica corre continuamente. Alta, Média e Baixa consideram o horário útil de segunda a sexta, das 8h às 18h. Feriados não são carregados neste protótipo.

## Heroku

O deploy usa o `Dockerfile` da raiz para publicar frontend, API Go e serviço Mastra juntos. Crie uma aplicação Heroku, adicione Heroku Postgres e publique a imagem web:

```sh
heroku container:login
heroku container:push web -a NOME-DA-APP
heroku container:release web -a NOME-DA-APP
```

Configure `GEMINI_API_KEY` e, se necessário, `GOOGLE_API_KEY`, `GEMINI_MODEL` e `GEMINI_DAILY_LIMIT` nas Config Vars. O container copia `GEMINI_API_KEY` para o nome `GOOGLE_API_KEY` do provedor Mastra quando este não estiver definido separadamente. O Heroku Postgres fornece `DATABASE_URL`. Nunca grave chaves ou senhas reais no repositório. As sessões atuais usam tokens aleatórios mantidos em memória e são invalidadas ao reiniciar o processo.

## Estrutura

```text
frontend/apps/client/       portal do cliente (src, componentes e fluxos próprios)
frontend/apps/team/         console do colaborador/Admin Nexo (src, filtros e hooks próprios)
frontend/packages/          cliente HTTP, tipos e tokens de UI compartilhados
backend/                    API Go, autenticação e regras transacionais
agent/.context/             fontes em Markdown usadas como contexto do produto
agent/src/                  agente Mastra TypeScript e endpoint interno
db/schema.sql               schema PostgreSQL
Dockerfile                  build multi-stage para Heroku Container Registry
docker-compose.yml          imagem web e PostgreSQL local
scripts/dev-local.sh        serviços locais sem Docker/VM
```
