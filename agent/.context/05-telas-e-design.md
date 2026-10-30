# Nexo Assist — Telas, permissões e design

## Papéis do sistema

- **Cliente:** pessoa ou organização que contrata o suporte da Nexo e acompanha apenas os próprios chamados.
- **Colaborador:** profissional que trabalha na Nexo e atende os clientes.
- **Admin:** dono da Nexo/equipe de TI, com acesso administrativo.

## Portal do cliente

### Login

Tela web dividida: à esquerda, apresentação do Nexo Assist explicando como a solução apoia a operação da empresa; à direita, formulário de e-mail corporativo e senha.

### Atendimento (telas 2 e 3)

Antes do chat, oferecer categoria provável (Acesso, Rede e VPN, Hardware, Software, E-mail e Outros) e a opção “Não reconheço meu problema e gostaria de ajuda”. Depois de iniciar, mostrar “Atendimento em andamento”, conversa com respostas rápidas, limite de 30 mensagens, cards de chamado e rascunho editável com confirmação.

O card de chamado deve mostrar data/última atualização, tipo, categoria, prioridade, SLA e status. No chat ficam ações para pedir analista, configurações e encerrar o atendimento. O painel lateral dos próprios chamados pode ser recolhido e tem link para a aba exclusiva “Chamados”.

Sidebar do cliente: Atendimento, Chamados e Meu perfil, com identidade do usuário, e-mail e logout. Perfil comum pode redefinir senha, mas não alterar e-mail. Alteração de e-mail só para perfis C-level/TI autorizados pelo backend.

## Console do analista/admin

Sidebar: Chat, Memória/Skills, Dashboard, Equipe e Meu perfil. O chat permite filtros Todas, Para você, Com agente e Minhas (assumidas), histórico completo, assumir atendimento, devolver ao agente e encerrar. Ao assumir, a IA fica pausada. Um painel lateral recolhível mostra os chamados do cliente; existe atalho para a lista completa de chamados.

Memória/Skills tem configuração visível à equipe. Dashboard mostra resoluções por IA/humano e categorias. Perfil e ações administrativas respeitam roles no backend. Admin pode cadastrar clientes, colaboradores da Nexo e outros admins.

## Decisões visíveis

Acima de cada resposta, exibir ações como “consultou seus chamados”, “consultou o SLA”, “classificou a prioridade” e “montou o rascunho”. Expansão legível apresenta entendimento, ação, confiança e justificativa. O console também mostra resumo para transferência e eventos relevantes.

## Visual

Web app com Bento Grid e Claymorphism: cartões com relevo e cantos suaves, hierarquia clara, bastante espaço em branco. Paleta azul como base, coral para criticidade e lima/amarelo para acentos. Balões: IA azul, colaborador verde, mensagem do cliente branco; alerta crítico em vermelho pastel. Responsivo para desktop e telas menores.
