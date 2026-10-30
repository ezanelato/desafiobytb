import type {
  Conversation,
  User,
} from "../../../../packages/api-client/src/index";

export function matchesTeamFilter(
  conversation: Conversation,
  filter: string,
  user: User,
) {
  if (filter === "Aguardando")
    return conversation.status === "WAITING_ANALYST";
  if (filter === "Para você")
    return (
      conversation.status === "WAITING_ANALYST" &&
      !conversation.assigneeId
    );
  if (filter === "Com agente") return conversation.status === "OPEN_AI";
  if (filter === "Minhas")
    return (
      conversation.status === "IN_PROGRESS_HUMAN" &&
      conversation.assigneeId === user.id
    );
  return true;
}
