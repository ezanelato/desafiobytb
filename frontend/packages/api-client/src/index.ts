export type User = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "agent" | "admin";
  title?: string;
  department?: string;
};
export type Ticket = {
  id: string;
  conversationId?: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  description: string;
  type: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  slaStatus: string;
  dueAt: string;
};
export type Decision = { action: string; reason: string; confidence: number };
export type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "analyst";
  content: string;
  createdAt: string;
  decisions?: Decision[];
  options?: string[];
  critical?: boolean;
  draft?: Ticket;
  ticket?: Ticket;
};
export type Conversation = {
  id: string;
  ownerId: string;
  ownerName?: string;
  subject: string;
  category: string;
  status: string;
  assigneeId?: string;
  assigneeName?: string;
  handoffSummary?: string;
  ticketId?: string;
  ticket?: Ticket;
  updatedAt: string;
  messageCount: number;
  priority?: string;
  needsAttention: boolean;
  messages?: Message[];
};
export type Summary = {
  openTickets: number;
  waitingConversations: number;
  resolvedTickets: number;
  aiResolved: number;
  humanResolved: number;
};
export type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
};
export type Skill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("nexo_token");
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "Não foi possível concluir a operação.",
      response.status,
    );
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),
  summary: () => request<Summary>("/summary"),
  tickets: (owner?: string) =>
    request<Ticket[]>(
      `/tickets${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`,
    ),
  conversations: (status?: string) =>
    request<Conversation[]>(
      `/conversations${status ? `?status=${status}` : ""}`,
    ),
  conversation: (id: string) => request<Conversation>(`/conversations/${id}`),
  startConversation: (category: string) =>
    request<Conversation>("/conversations", {
      method: "POST",
      body: JSON.stringify({ category }),
    }),
  sendMessage: (id: string, content: string) =>
    request<Conversation>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  confirmDraft: (id: string, draftId: string, draft?: Partial<Ticket>) =>
    request<Conversation>(`/conversations/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ draftId, draft }),
    }),
  takeover: (id: string) =>
    request<Conversation>(`/conversations/${id}/takeover`, { method: "POST" }),
  returnToAI: (id: string) =>
    request<Conversation>(`/conversations/${id}/return`, { method: "POST" }),
  closeConversation: (id: string) =>
    request<Conversation>(`/conversations/${id}/close`, { method: "POST" }),
  users: () => request<User[]>("/team/users"),
  createUser: (input: {
    name: string;
    email: string;
    password: string;
    role: string;
    title: string;
    department: string;
  }) =>
    request<User>("/team/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProfile: (input: {
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request<{ message: string }>("/team/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  knowledge: () => request<KnowledgeArticle[]>("/knowledge"),
  skills: () => request<Skill[]>("/team/skills"),
  createSkill: (input: { name: string; description: string }) =>
    request<Skill>("/team/skills", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSkill: (id: string, enabled: boolean) =>
    request<{ enabled: boolean }>(`/team/skills/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
