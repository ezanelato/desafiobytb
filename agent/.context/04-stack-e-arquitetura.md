# Nexo Assist — Stack e arquitetura decididas

## Stack

- Aplicação web em React, TypeScript e CSS3 (pacotes de UI quando fizerem diferença).
- Go para backend, autenticação, autorização, persistência e operações de service desk.
- Serviço de agente em TypeScript usando Mastra, preferência explícita do usuário para a orquestração do agente.
- PostgreSQL.
- Deploy no Heroku com uma imagem de container que reúne frontend, backend e serviço Mastra; banco via Heroku Postgres.
- Modelo Gemini 3.5 Flash-Lite. `GEMINI_API_KEY` permanece somente no ambiente do serviço do agente. O README documenta 500 RPD como limite local da aplicação, não como quota universal do Google.

## Organização

```text
frontend/
  apps/client/          portal do cliente, com src e módulos da experiência cliente
  apps/team/            console do analista/admin, com src e módulos de equipe
  packages/api-client/  cliente HTTP compartilhado
  packages/shared-types/ contratos TypeScript compartilhados
  packages/ui/          componentes comuns
backend/                API Go, autorização e regras transacionais
agent/
  .context/             fontes completas do produto e políticas operacionais
  src/                  agente e servidor HTTP Mastra
db/                     schema e migrações PostgreSQL
```

## Limites entre componentes

O frontend nunca decide acesso nem controla sozinho estados de conversa. O backend Go valida identidade, propriedade dos dados, perfil, transições, confirmação, deduplicação, idempotência e rate limit. O serviço Mastra recebe mensagem e contexto filtrado, formula orientação e retorna texto; não possui credenciais administrativas nem acesso direto ao banco.

O Nexo Assist é o nome do agente implementado em Mastra. “Memória” recupera contexto operacional e resoluções anonimizadas, sem revelar registros de outros funcionários. Skills configuráveis podem ser ativadas pela equipe; não substituem nem alteram política de segurança.

## Convenção de comentários

Nas mesclas e blocos de integração, usar anotações no formato:

```text
// ------ Explicação objetiva aqui ------
```

Não registrar chaves, tokens, senhas em claro ou identificadores secretos nos logs, bundle do frontend ou repositório.
