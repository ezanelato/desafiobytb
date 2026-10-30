# Nexo Assist — PRD do desafio técnico

## Contexto e objetivo

A Nexo tem aproximadamente 2.000 funcionários. O service desk recebe solicitações por formulário; dúvidas recorrentes, chamados duplicados, prioridade incorreta, informação faltante e triagem manual consomem tempo. O Nexo Assist é um agente de atendimento em chat que consulta os chamados do próprio funcionário e a central de ajuda, orienta, prepara ou atualiza chamados e encaminha a conversa a um analista quando necessário.

O sucesso é medido por resolução sem fila, chamados completos e corretos, encaminhamento com contexto suficiente e transparência das ações do agente.

## Pessoas e histórias

O funcionário entra com e-mail corporativo e precisa poder tirar dúvidas, acompanhar chamados sem saber o número, complementar um chamado aberto, confirmar os dados antes de abrir um novo e pedir atendimento humano. O histórico deve permitir continuar a conversa depois.

O analista N1/N2 precisa receber chamados classificados, ver a conversa transferida, assumir enquanto o agente está pausado, consultar o histórico e os chamados do funcionário, devolver ao agente ou encerrar.

## Escopo funcional

1. Login com e-mail corporativo. Para contas de demonstração, o protótipo aceita credenciais de exemplo.
2. Chat de colaborador com respostas rápidas, seleção de chamados, cards, rascunho com confirmação e até 30 mensagens por sessão.
3. Agente que consulta central de ajuda e serviço de chamados, classifica intenção e prioridade e segue as regras operacionais.
4. Serviço de chamados simulado e separado da orquestração do agente, com consulta, criação, atualização e transferência.
5. Transferência formal para analista, pausa das respostas automáticas e entrega do resumo e histórico.
6. Console de analista com lista, filtros, status, histórico, assunção, devolução, encerramento e painel de chamados do funcionário.
7. Visibilidade acima das respostas e em detalhe: o que o agente entendeu, ação tomada, nível de segurança e motivo. Transparência é o ponto de maior peso no desafio.

## Regras de service desk

- Tipos: incidente (`INC`) quando algo falha; requisição (`REQ`) para acesso, software ou equipamento.
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail e Outros.
- Campos: título, descrição, tipo, categoria, prioridade e pessoa afetada.
- O agente apresenta rascunho e só cria/atualiza depois de confirmação explícita.
- Não duplicar problema aberto; complementar o chamado existente. Chamado resolvido há até sete dias pode ser reaberto.
- Transferir se o funcionário pedir, houver criticidade, SLA vencido ou incerteza. A conversa fica com o analista sem resposta automática do agente.
- Chamados só podem ser vistos pelo funcionário que os abriu e por equipe autorizada.
- Escopo restrito a TI; RH, Financeiro e Facilities são redirecionados.
- Prioridade considera impacto e urgência. SLA: Crítica 1 hora; Alta 4 horas úteis; Média 3 dias úteis; Baixa 5 dias úteis. O prazo cobre primeira resposta e atualizações. Críticos têm plantão 24 horas.

## Dados de demonstração

Criar funcionários de exemplo, entre cinco e dez artigos breves na central de ajuda e chamados em estados variados: aberto, vencido, resolvido recentemente e de outros funcionários. Exemplos de artigos incluem erro 809 da VPN (procedimento limitado a Windows 10; no Windows 11 abrir chamado) e horário do Service Desk (dias úteis, 8h–18h, plantão crítico 24h). Exemplos de chamados: `INC-20311` notebook lento após atualização, Hardware/Média/aguardando analista; `REQ-10442` segundo monitor, Hardware/Baixa/aprovado; `INC-20150` senha SAP bloqueada, Acesso/Média/resolvido.

## Requisitos técnicos e avaliação do desafio

O PRD original recomendava TypeScript estrito, Mastra (preferencial) ou LangGraph.js, provedor de LLM explicado no README, interface alinhada ao protótipo, serviço de chamados separado, persistência das conversas/chamados/estado e inicialização documentada com `.env.example`. Esperava arquitetura clara, tratamento de erros, segurança, organização, testes onde fizerem diferença, README com decisões/trade-offs e deploy como diferencial opcional.

A stack final foi direcionada pelo usuário para React/TypeScript/CSS3, backend Go, PostgreSQL e Heroku. Mastra permanece como preferência para orquestração do agente. A implementação mantém regras de autorização e mutações no Go e integra a orquestração Mastra em serviço TypeScript separado.

Critérios de avaliação: qualidade das decisões, condução da conversa, transparência, fidelidade e cuidado da interface, arquitetura e práticas, clareza do README e deploy opcional.
