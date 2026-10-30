import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  Filter,
  Headphones,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  TicketPlus,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  Conversation,
  formatDate,
  KnowledgeArticle,
  Message,
  Skill,
  Summary,
  Ticket,
  User,
} from "../packages/api-client/src/index";
import { CategoryStart } from "../apps/client/src/components/CategoryStart";
import { clientNavigation } from "../apps/client/src/navigation";
import { matchesTeamFilter } from "../apps/team/src/features/filters";
import { teamNavigation } from "../apps/team/src/navigation";
import { useRealtimeRefresh } from "../apps/team/src/hooks/useRealtimeRefresh";

type Session = { user: User; token: string };
type IconType = typeof Activity;

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem("nexo_session");
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [checking, setChecking] = useState(
    Boolean(localStorage.getItem("nexo_token")),
  );
  const navigate = useNavigate();
  useEffect(() => {
    if (!localStorage.getItem("nexo_token")) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((user) => {
        setSession((current) => (current ? { ...current, user } : null));
      })
      .catch(() => {
        localStorage.removeItem("nexo_token");
        localStorage.removeItem("nexo_session");
        setSession(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    const next = { token: result.token, user: result.user };
    localStorage.setItem("nexo_token", result.token);
    localStorage.setItem("nexo_session", JSON.stringify(next));
    setSession(next);
    navigate(result.user.role === "customer" ? "/client" : "/team");
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* ------ Limpa a sessão local mesmo se a API estiver indisponível ------ */
    }
    localStorage.removeItem("nexo_token");
    localStorage.removeItem("nexo_session");
    setSession(null);
    navigate("/login");
  };

  if (checking)
    return (
      <div className="splash">
        <span className="brand-mark">
          <Sparkles size={20} />
        </span>
        <span>Preparando seu espaço…</span>
      </div>
    );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to={homeFor(session.user)} replace />
          ) : (
            <Login onLogin={login} />
          )
        }
      />
      <Route
        path="/client/*"
        element={
          <Protected session={session} roles={["customer"]}>
            {(user) => <ClientWorkspace user={user} onLogout={logout} />}
          </Protected>
        }
      />
      <Route
        path="/team/*"
        element={
          <Protected session={session} roles={["agent", "admin"]}>
            {(user) => <TeamWorkspace user={user} onLogout={logout} />}
          </Protected>
        }
      />
      <Route
        path="*"
        element={
          <Navigate to={session ? homeFor(session.user) : "/login"} replace />
        }
      />
    </Routes>
  );
}

function homeFor(user: User) {
  return user.role === "customer" ? "/client" : "/team";
}

function Protected({
  session,
  roles,
  children,
}: {
  session: Session | null;
  roles: User["role"][];
  children: (user: User) => ReactNode;
}) {
  const location = useLocation();
  if (!session)
    return <Navigate to="/login" state={{ from: location }} replace />;
  if (!roles.includes(session.user.role))
    return <Navigate to={homeFor(session.user)} replace />;
  return <>{children(session.user)}</>;
}

function Login({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("ana@nexo.example");
  const [password, setPassword] = useState("Nexo2026!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <Link to="/login" className="brand brand-light">
          <span className="brand-mark">
            <Sparkles size={19} />
          </span>
          <span>
            nexo<span className="brand-assist">assist</span>
          </span>
        </Link>
        <div className="story-copy">
          <div className="eyebrow light-eyebrow">
            <span className="live-dot" /> SERVICE DESK, COM CONTEXTO
          </div>
          <h1>
            TI funcionando.
            <br />
            <em>Trabalho fluindo.</em>
          </h1>
          <p>
            Suporte que entende o contexto, resolve o que pode e chama uma
            pessoa quando faz diferença.
          </p>
          <div className="story-stats">
            <div>
              <strong>
                24<span>/7</span>
              </strong>
              <small>plantão crítico</small>
            </div>
            <div>
              <strong>1º</strong>
              <small>ponto de contato</small>
            </div>
            <div>
              <strong>∞</strong>
              <small>contexto preservado</small>
            </div>
          </div>
        </div>
        <div className="story-orbit orbit-one" />
        <div className="story-orbit orbit-two" />
        <div className="story-note">
          <span className="note-icon">
            <CheckCheck size={16} />
          </span>
          <span>
            <b>Seu contexto, sempre junto</b>
            <small>Do primeiro “oi” até a solução.</small>
          </span>
          <ArrowUpRight size={17} />
        </div>
        <div className="story-footer">
          <span>© 2026 Nexo Tecnologia</span>
          <span>
            Suporte com cuidado <span className="coral-dot">●</span>
          </span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="mobile-brand brand">
            <span className="brand-mark">
              <Sparkles size={18} />
            </span>
            <span>
              nexo<span className="brand-assist">assist</span>
            </span>
          </div>
          <div className="login-welcome">
            <span className="login-icon">
              <LockKeyhole size={19} />
            </span>
            <span className="eyebrow">ACESSO AO PORTAL</span>
          </div>
          <h2>
            Bom ter você
            <br />
            por aqui.
          </h2>
          <p className="muted">
            Entre com seu e-mail corporativo para continuar.
          </p>
          <form onSubmit={submit} className="login-form">
            <label>
              E-mail corporativo
              <span className="input-wrap">
                <UserRound size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@nexo.com.br"
                  autoComplete="username"
                  required
                />
              </span>
            </label>
            <label>
              Senha
              <span className="input-wrap">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </span>
            </label>
            {error && <div className="inline-error">{error}</div>}
            <div className="form-between">
              <span>
                <ShieldCheck size={14} /> Acesso protegido
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setError(
                    "Para redefinir sua senha, fale com o administrador de TI.",
                  )
                }
              >
                Esqueci a senha
              </button>
            </div>
            <button
              className="button button-primary button-wide"
              disabled={busy}
            >
              {busy ? (
                "Entrando…"
              ) : (
                <>
                  Entrar no portal <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="login-help">
            <CircleHelp size={15} />
            <span>
              Problemas para acessar?{" "}
              <a href="mailto:suporte@nexo.example">Fale com o Service Desk</a>
            </span>
          </div>
          <div className="demo-access">
            <span className="demo-label">CONTAS DE DEMONSTRAÇÃO</span>
            <div>
              <button
                onClick={() => {
                  setEmail("ana@nexo.example");
                  setPassword("Nexo2026!");
                }}
              >
                Cliente
              </button>
              <button
                onClick={() => {
                  setEmail("carla@nexo.example");
                  setPassword("Nexo2026!");
                }}
              >
                Colaborador Nexo
              </button>
              <button
                onClick={() => {
                  setEmail("admin@nexo.example");
                  setPassword("Nexo2026!");
                }}
              >
                Admin Nexo
              </button>
            </div>
          </div>
        </div>
        <div className="login-legal">
          Feito para ajudar pessoas a voltarem ao que importa.{" "}
          <span>
            Privacidade <span>·</span> Segurança
          </span>
        </div>
      </section>
    </main>
  );
}

type NavItem = { id: string; label: string; icon: IconType };
function SideNav({
  user,
  items,
  active,
  onChange,
  onLogout,
  compact = false,
}: {
  user: User;
  items: NavItem[];
  active: string;
  onChange: (id: string) => void;
  onLogout: () => void;
  compact?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches,
  );
  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${compact ? "sidebar-compact" : ""}`}
    >
      <div className="sidebar-top">
        <Link
          to={user.role === "customer" ? "/client" : "/team"}
          className="brand"
        >
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          {!collapsed && (
            <span>
              nexo<span className="brand-assist">assist</span>
            </span>
          )}
        </Link>
        <button
          className="icon-button sidebar-collapse"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={
            collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
          }
          onClick={() => setCollapsed(!collapsed)}
        >
          <Menu size={17} />
        </button>
      </div>
      <div className="workspace-switch">
        <span className="workspace-symbol">N</span>
        {!collapsed && (
          <>
            <span>
              <b>Nexo Tecnologia</b>
              <small>
                {user.role === "customer"
                  ? "Portal do cliente"
                  : "Service Desk"}
              </small>
            </span>
            <ChevronDown size={15} />
          </>
        )}
      </div>
      <nav className="side-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? "nav-item-active" : ""}`}
            onClick={() => {
              onChange(item.id);
              if (window.matchMedia("(max-width: 760px)").matches) {
                setCollapsed(true);
              }
            }}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} />
            <span>{!collapsed && item.label}</span>
            {item.id === "chat" && !collapsed && user.role !== "customer" && (
              <span className="nav-count">3</span>
            )}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <div className="promo-stars">
              <Sparkles size={16} />
            </div>
            <b>Seu suporte, sem atrito.</b>
            <p>Respostas claras, contexto completo e pessoas por perto.</p>
            <span className="promo-tag">
              NEXO ASSIST <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      )}
      <div className="user-menu">
        <Avatar name={user.name} role={user.role} />
        <div className="user-meta">
          <b>{user.name}</b>
          <small>
            {user.role === "customer"
              ? user.title || "Cliente"
              : user.role === "admin"
                ? "Admin Nexo"
                : "Colaborador Nexo"}
          </small>
        </div>
        <button
          className="icon-button logout-icon"
          aria-label="Sair"
          onClick={onLogout}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

function Avatar({
  name,
  role,
  small = false,
}: {
  name: string;
  role?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""} ${role === "customer" ? "avatar-lime" : role === "admin" ? "avatar-coral" : "avatar-blue"}`}
    >
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

type OverflowMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

function OverflowMenu({
  items,
  label = "Mais opções",
}: {
  items: OverflowMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        className="icon-button"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="overflow-menu-panel" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [section, setSection] = useState("chat");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [active, setActive] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(async (showTicketLoading = false) => {
    if (showTicketLoading) {
      setTicketsLoading(true);
      setTicketsError("");
    }
    try {
      const [nextTickets, nextConversations] = await Promise.all([
        api.tickets(),
        api.conversations(),
      ]);
      setTickets(nextTickets);
      setConversations(nextConversations);
      if (!activeId && nextConversations.length)
        setActiveId(nextConversations[0].id);
    } catch (e) {
      const message = messageOf(e);
      setTicketsError(message);
      setError(message);
    } finally {
      if (showTicketLoading) setTicketsLoading(false);
    }
  }, [activeId]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  useEffect(() => {
    const showTickets = () => {
      setSection("tickets");
      void refresh(true);
    };
    const refreshOnFocus = () => void refresh();
    window.addEventListener("nexo:show-tickets", showTickets);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("nexo:show-tickets", showTickets);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((n) => n + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    setLoading(true);
    api
      .conversation(activeId)
      .then(setActive)
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, [activeId, refreshKey]);
  const openChat = async (category: string) => {
    try {
      const conversation = await api.startConversation(category);
      setActiveId(conversation.id);
      setActive(conversation);
      setSection("chat");
      setRefreshKey((n) => n + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const updateConversation = (c: Conversation) => {
    setActive(c);
    setRefreshKey((n) => n + 1);
  };
  const changeSection = (next: string) => {
    setSection(next);
    if (next === "tickets") void refresh(true);
  };
  const nav: NavItem[] = clientNavigation;
  return (
    <div className="app-shell">
      <SideNav
        user={user}
        items={nav}
        active={section}
        onChange={changeSection}
        onLogout={onLogout}
      />
      <main className="client-main">
        {section === "chat" && (
          <ClientChat
            user={user}
            conversations={conversations}
            active={active}
            activeId={activeId}
            tickets={tickets}
            loading={loading}
            error={error}
            onSelect={setActiveId}
            onStart={openChat}
            onUpdate={updateConversation}
            onRefresh={() => {
              setRefreshKey((n) => n + 1);
              void refresh(false);
            }}
          />
        )}
        {section === "tickets" && (
          <TicketList
            tickets={tickets}
            loading={ticketsLoading}
            error={ticketsError}
            onRefresh={() => void refresh(true)}
            onBack={() => setSection("chat")}
          />
        )}
        {section === "profile" && (
          <ProfilePage
            user={user}
            onUpdate={() => setRefreshKey((n) => n + 1)}
          />
        )}
      </main>
    </div>
  );
}

function ClientChat({
  user,
  conversations,
  active,
  activeId,
  tickets,
  loading,
  error,
  onSelect,
  onStart,
  onUpdate,
  onRefresh,
}: {
  user: User;
  conversations: Conversation[];
  active: Conversation | null;
  activeId: string;
  tickets: Ticket[];
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onStart: (category: string) => void;
  onUpdate: (c: Conversation) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketPanel, setTicketPanel] = useState(true);
  const [category, setCategory] = useState("");
  const [newPanel, setNewPanel] = useState(!activeId);
  const [errorText, setErrorText] = useState(error);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandDecisions, setExpandDecisions] = useState(false);
  useEffect(() => setErrorText(error), [error]);
  useEffect(() => {
    if (activeId) setNewPanel(false);
  }, [activeId]);
  const visible = conversations.filter(
    (c) =>
      c.subject.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase()),
  );
  const activeTickets = tickets.slice(0, 4);
  const send = async (content = message) => {
    if (!active || !content.trim() || sending) return;
    setSending(true);
    setErrorText("");
    try {
      onUpdate(await api.sendMessage(active.id, content.trim()));
      setMessage("");
      onRefresh();
    } catch (e) {
      setErrorText(messageOf(e));
    } finally {
      setSending(false);
    }
  };
  const confirm = async (draftId: string, draft: Partial<Ticket>) => {
    if (!active) return;
    try {
      onUpdate(await api.confirmDraft(active.id, draftId, draft));
      onRefresh();
    } catch (e) {
      setErrorText(messageOf(e));
    }
  };
  const close = async () => {
    if (!active) return;
    try {
      onUpdate(await api.closeConversation(active.id));
      onRefresh();
    } catch (e) {
      setErrorText(messageOf(e));
    }
  };
  const askHuman = async () => {
    await send("Quero falar com um analista, por favor.");
  };
  return (
    <div className="client-workspace">
      <header className="page-header client-header">
        <div>
          <div className="breadcrumb">
            <span>Portal</span>
            <ChevronRight size={13} />
            <b>{active?.category || "Atendimento"}</b>
          </div>
          <h1>
            {active?.subject && active.subject !== "Novo atendimento"
              ? active.subject
              : "Olá, " + user.name.split(" ")[0]}
          </h1>
          <p>Seu atendimento continua com contexto, do início até a solução.</p>
        </div>
        <div className="header-actions">
          <span className="status-pill status-online">
            <span /> Service Desk online
          </span>
          <button
            className="icon-button"
            onClick={() => setTicketPanel(!ticketPanel)}
            title={ticketPanel ? "Recolher painel" : "Abrir painel"}
          >
            {ticketPanel ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>
          <button
            className="button button-outline button-sm"
            onClick={close}
            disabled={!active || active.status === "CLOSED"}
          >
            <Check size={15} /> Encerrar
          </button>
        </div>
      </header>
      <div className={`client-grid ${ticketPanel ? "" : "client-grid-wide"}`}>
        <section className="chat-list-panel">
          <div className="section-heading">
            <div>
              <h2>Seus atendimentos</h2>
              <p>Seu histórico recente</p>
            </div>
            <button
              className="icon-button icon-soft"
              aria-label="Novo atendimento"
              onClick={() => setNewPanel(true)}
            >
              <Plus size={17} />
            </button>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              placeholder="Buscar atendimento"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="conversation-list">
            {visible.map((item) => (
              <button
                key={item.id}
                className={`conversation-row ${item.id === activeId ? "conversation-row-active" : ""}`}
                onClick={() => {
                  onSelect(item.id);
                  setNewPanel(false);
                }}
              >
                <span className="conversation-icon">
                  <MessageCircle size={16} />
                </span>
                <span className="conversation-row-text">
                  <b>{item.subject || item.category || "Atendimento"}</b>
                  <small>
                    {item.category || "Geral"} · {formatDate(item.updatedAt)}
                  </small>
                </span>
                <StatusDot status={item.status} />
              </button>
            ))}
            {!visible.length && (
              <div className="empty-small">Nenhum atendimento ainda.</div>
            )}
          </div>
          <button
            className="new-conversation-link"
            onClick={() => setNewPanel(true)}
          >
            <Plus size={15} /> Iniciar outro atendimento
          </button>
          <div className="sla-note">
            <span className="sla-note-icon">
              <Clock3 size={15} />
            </span>
            <span>
              <b>Como funciona o prazo?</b>
              <small>Você acompanha o SLA do seu chamado por aqui.</small>
            </span>
            <ChevronRight size={15} />
          </div>
        </section>
        <section className="chat-center">
          {newPanel ? (
            <CategoryStart
              category={category}
              onCategory={setCategory}
              onStart={() => onStart(category || "Não reconheço")}
            />
          ) : active ? (
            <>
              <div className="chat-topline">
                <div className="chat-agent-avatar">
                  <Bot size={19} />
                </div>
                <div>
                  <b>Nexo Assist</b>
                  <small>
                    <span
                      className={`presence-dot ${active.status === "OPEN_AI" ? "" : "presence-muted"}`}
                    />{" "}
                    {active.status === "OPEN_AI"
                      ? "Atendimento em andamento"
                      : active.status === "WAITING_ANALYST"
                        ? "Aguardando atendente"
                        : active.status === "IN_PROGRESS_HUMAN"
                          ? `Com ${active.assigneeName || "analista"}`
                          : "Atendimento encerrado"}
                  </small>
                  {active.ticketId && (
                    <small className="linked-ticket-label">
                      Chamado {active.ticketId}
                    </small>
                  )}
                </div>
                <button
                  className="icon-button push-right"
                  title="Configurações do atendimento"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <Settings2 size={17} />
                </button>
                <button
                  className="icon-button"
                  onClick={askHuman}
                  title="Falar com analista"
                  disabled={active.status !== "OPEN_AI"}
                >
                  <Headphones size={17} />
                </button>
                <OverflowMenu
                  items={[
                    {
                      label: ticketPanel
                        ? "Recolher painel de chamados"
                        : "Abrir painel de chamados",
                      onSelect: () => setTicketPanel((open) => !open),
                    },
                    {
                      label: "Falar com analista",
                      disabled: active.status !== "OPEN_AI",
                      onSelect: () => void askHuman(),
                    },
                    {
                      label: "Encerrar atendimento",
                      disabled: active.status === "CLOSED",
                      onSelect: () => void close(),
                    },
                  ]}
                />
              </div>
              {settingsOpen && (
                <div className="chat-settings-menu">
                  <div>
                    <b>Preferências do atendimento</b>
                    <button
                      className="icon-button"
                      onClick={() => setSettingsOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label>
                    <span>
                      <b>Mostrar decisões expandidas</b>
                      <small>
                        Exibe a justificativa e confiança do agente junto às
                        respostas.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={expandDecisions}
                      onChange={(e) => setExpandDecisions(e.target.checked)}
                    />
                  </label>
                  <div className="settings-limit">
                    <LockKeyhole size={13} />
                    <span>
                      Até 30 mensagens por sessão · seus chamados só ficam
                      visíveis para você e a equipe de TI.
                    </span>
                  </div>
                </div>
              )}
              <div className="chat-feed" key={active.id}>
                {active.messages?.map((item) => (
                  <MessageBubble
                    key={item.id}
                    message={item}
                    user={user}
                    detailsOpen={expandDecisions}
                    onConfirm={confirm}
                    onOption={(option) => send(option)}
                  />
                ))}
                {active.ticket &&
                  !active.messages?.some(
                    (item) => item.ticket?.id === active.ticket?.id,
                  ) && <TicketCard ticket={active.ticket} />}
                {loading && (
                  <div className="typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
              {errorText && (
                <div className="chat-error">
                  <span>{errorText}</span>
                  <button onClick={() => setErrorText("")}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="chat-compose">
                <div className="compose-toolbar">
                  <span>
                    <span className="presence-dot" />{" "}
                    {active.status === "OPEN_AI"
                      ? "Nexo Assist pode responder"
                      : "O agente está pausado"}
                  </span>
                  <span>{active.messageCount}/30 mensagens</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                  className="compose-form"
                >
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      active.status === "OPEN_AI"
                        ? "Escreva sua mensagem…"
                        : "A conversa está com um analista"
                    }
                    disabled={
                      active.status !== "OPEN_AI" || active.messageCount >= 30
                    }
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button
                    className="send-button"
                    disabled={
                      !message.trim() || sending || active.status !== "OPEN_AI"
                    }
                    aria-label="Enviar mensagem"
                  >
                    {sending ? (
                      <span className="mini-loader" />
                    ) : (
                      <Send size={17} />
                    )}
                  </button>
                </form>
                <div className="compose-foot">
                  <span>
                    <LockKeyhole size={12} /> Seus dados estão protegidos
                  </span>
                  <span>Enter envia · Shift + Enter quebra linha</span>
                </div>
              </div>
            </>
          ) : (
            <CategoryStart
              category={category}
              onCategory={setCategory}
              onStart={() => onStart(category || "Não reconheço")}
            />
          )}
        </section>
        {ticketPanel && (
          <aside className="ticket-side-panel">
            <div className="section-heading">
              <div>
                <h2>Seus chamados</h2>
                <p>Seu histórico de suporte</p>
              </div>
              <button
                className="icon-button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("nexo:show-tickets"))
                }
              >
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="ticket-count-row">
              <span>{activeTickets.length} registros</span>
              <button
                className="text-button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("nexo:show-tickets"))
                }
              >
                Ver todos
              </button>
            </div>
            {activeTickets.map((ticket) => (
              <TicketMini
                key={ticket.id}
                ticket={ticket}
                onOpenConversation={(conversationId) => {
                  onSelect(conversationId);
                  setNewPanel(false);
                }}
              />
            ))}
            {!tickets.length && (
              <div className="empty-card">
                <TicketPlus size={20} />
                <span>Seus chamados aparecem aqui quando forem criados.</span>
              </div>
            )}
            <button
              className="button button-outline button-wide create-ticket-shortcut"
              onClick={() => {
                setNewPanel(true);
                setCategory("");
              }}
            >
              <Plus size={15} /> Novo atendimento
            </button>
            <div className="privacy-card">
              <ShieldCheck size={16} />
              <span>
                <b>Visibilidade protegida</b>
                <small>Você só vê os chamados associados à sua conta.</small>
              </span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  user,
  detailsOpen = false,
  onConfirm,
  onOption,
}: {
  message: Message;
  user: User;
  detailsOpen?: boolean;
  onConfirm: (id: string, draft: Partial<Ticket>) => void;
  onOption: (value: string) => void;
}) {
  const [details, setDetails] = useState(detailsOpen);
  if (message.role === "system")
    return (
      <div className="system-message">
        <span>
          <Activity size={13} />
        </span>
        {message.content}
      </div>
    );
  const isUser = message.role === "user";
  const critical = message.critical;
  return (
    <div className={`message-line ${isUser ? "message-line-user" : ""}`}>
      {!isUser && (
        <div className="message-avatar">
          <Bot size={15} />
        </div>
      )}
      <div
        className={`message-content ${isUser ? "message-content-user" : ""}`}
      >
        {isUser ? (
          <div className="message-sender sender-user">
            {user.name.split(" ")[0]}{" "}
            <span>{formatDate(message.createdAt)}</span>
          </div>
        ) : (
          <div className="decision-strip">
            <b>Nexo Assist</b>
            {(message.decisions || []).map((d, index) => (
              <span
                key={`${d.action}-${index}`}
                className={
                  critical && d.action === "handoff" ? "decision-critical" : ""
                }
              >
                <Check size={13} /> {labelAction(d.action)}
              </span>
            ))}
            <button
              onClick={() => setDetails(!details)}
              aria-expanded={details}
            >
              {details ? "Ocultar detalhes" : "Detalhes"}{" "}
              <ChevronDown size={12} className={details ? "rotate" : ""} />
            </button>
          </div>
        )}
        <div
          className={`message-bubble ${isUser ? "bubble-user" : critical ? "bubble-critical" : "bubble-assistant"}`}
        >
          {message.content}
        </div>
        {!isUser && details && (
          <DecisionDetails decisions={message.decisions || []} />
        )}
        {message.draft && (
          <DraftCard
            draft={message.draft}
            onConfirm={(draft) => onConfirm(message.draft!.id, draft)}
          />
        )}
        {message.ticket && <TicketCard ticket={message.ticket} />}
        {!isUser && message.options && message.options.length > 0 && (
          <div className="quick-options">
            {message.options.map((option) => (
              <button key={option} onClick={() => onOption(option)}>
                {option}
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        )}
        {!isUser && (
          <div className="message-time">
            {formatDate(message.createdAt)} <CheckCheck size={13} />
          </div>
        )}
      </div>
      {isUser && (
        <div className="message-avatar avatar-user">
          <UserRound size={15} />
        </div>
      )}
    </div>
  );
}

function DecisionDetails({ decisions }: { decisions: Message["decisions"] }) {
  if (!decisions?.length)
    return (
      <div className="decision-details">
        <span className="detail-bullet" />
        <span>Resposta informativa sem ação em sistema.</span>
      </div>
    );
  return (
    <div className="decision-details">
      {decisions.map((decision, index) => (
        <div className="decision-detail" key={`${decision.action}-${index}`}>
          <span className="detail-bullet" />
          <span className="detail-copy">
            <b>{labelAction(decision.action)}</b>
            <small>{decision.reason}</small>
          </span>
          <span
            className={`confidence ${decision.confidence >= 0.85 ? "confidence-high" : "confidence-mid"}`}
          >
            {Math.round(decision.confidence * 100)}%<small>segurança</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  onConfirm,
}: {
  draft: Ticket;
  onConfirm: (draft: Partial<Ticket>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [category, setCategory] = useState(draft.category);
  const [priority, setPriority] = useState(draft.priority);
  return (
    <article className="draft-card">
      <div className="draft-card-head">
        <span className="draft-kicker">
          NOVO CHAMADO <i /> Rascunho
        </span>
        <span className="draft-badge">
          <FileText size={13} /> Para revisar
        </span>
      </div>
      {editing ? (
        <div className="draft-edit-fields">
          <label>
            Título
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          <div className="draft-edit-row">
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>Acesso</option>
                <option>Rede e VPN</option>
                <option>Hardware</option>
                <option>Software</option>
                <option>E-mail</option>
                <option>Outros</option>
              </select>
            </label>
            <label>
              Prioridade
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option>Crítica</option>
                <option>Alta</option>
                <option>Média</option>
                <option>Baixa</option>
              </select>
            </label>
          </div>
        </div>
      ) : (
        <>
          <h3>{title}</h3>
          <p>{description}</p>
          <div className="draft-data">
            <div>
              <small>Categoria</small>
              <b>{category}</b>
            </div>
            <div>
              <small>Prioridade</small>
              <b>
                <span className={`priority-dot priority-${slug(priority)}`} />
                {priority} <i>· resposta {slaText(priority)}</i>
              </b>
            </div>
            <div>
              <small>Tipo</small>
              <b>
                {draft.type} · {ticketTypeLabel(draft.type)}
              </b>
            </div>
          </div>
        </>
      )}
      <div className="draft-actions">
        <button
          className="button button-primary button-sm"
          onClick={() => onConfirm({ title, description, category, priority })}
        >
          <Check size={15} /> Confirmar chamado
        </button>
        <button
          className="button button-outline button-sm"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Concluir edição" : "Editar"}
        </button>
        <span className="draft-safe">
          <LockKeyhole size={12} /> Só será criado após confirmação
        </span>
      </div>
    </article>
  );
}

function TicketCard({
  ticket,
  highlightPriority = false,
}: {
  ticket: Ticket;
  highlightPriority?: boolean;
}) {
  return (
    <article
      className={`created-ticket-card ${highlightPriority ? "ticket-priority-highlight" : ""}`}
    >
      <div className="created-ticket-top">
        <span className="ticket-id-chip">{ticket.id}</span>
        <StatusBadge status={ticket.status} />
        <span className="ticket-type-chip">
          {ticket.type} · {ticketTypeLabel(ticket.type)}
        </span>
      </div>
      <h3>{ticket.title}</h3>
      <p>{ticket.description}</p>
      <div className="created-ticket-meta">
        <span>
          <small>Categoria</small>
          <b>{ticket.category}</b>
        </span>
        <span>
          <small>Prioridade</small>
          <b className={highlightPriority ? "ticket-priority-value" : ""}>
            <span
              className={`priority-dot priority-${slug(ticket.priority)}`}
            />
            {ticket.priority}
          </b>
        </span>
        <span>
          <small>Última atualização</small>
          <b>{formatDate(ticket.updatedAt)}</b>
        </span>
        <span>
          <small>SLA</small>
          <b className={ticket.slaStatus === "Vencido" ? "text-coral" : ""}>
            {ticket.slaStatus}
          </b>
        </span>
      </div>
    </article>
  );
}

function TicketMini({
  ticket,
  onOpenConversation,
}: {
  ticket: Ticket;
  onOpenConversation?: (conversationId: string) => void;
}) {
  return (
    <article className="ticket-mini">
      <div className="ticket-mini-head">
        <span>{ticket.id}</span>
        <StatusBadge status={ticket.status} compact />
      </div>
      {ticket.conversationId && onOpenConversation && (
        <button
          className="ticket-mini-open"
          type="button"
          onClick={() => onOpenConversation(ticket.conversationId!)}
        >
          Abrir conversa <ArrowUpRight size={12} />
        </button>
      )}
      <b>{ticket.title}</b>
      <div className="ticket-mini-foot">
        <span>{ticket.category}</span>
        <span
          className={`priority-text priority-text-${slug(ticket.priority)}`}
        >
          <span className={`priority-dot priority-${slug(ticket.priority)}`} />
          {ticket.priority}
        </span>
      </div>
      <div className="ticket-mini-updated">
        Atualizado {formatDate(ticket.updatedAt)}{" "}
        {ticket.slaStatus === "Vencido" && <span>· Vencido</span>}
      </div>
    </article>
  );
}

function TicketList({
  tickets,
  loading,
  error,
  onRefresh,
  onBack,
}: {
  tickets: Ticket[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState("Todos");
  const visible = tickets.filter(
    (t) =>
      filter === "Todos" ||
      (filter === "Em andamento" &&
        !["RESOLVED", "APPROVED", "CLOSED"].includes(t.status)) ||
      (filter === "Concluídos" &&
        ["RESOLVED", "APPROVED", "CLOSED"].includes(t.status)),
  );
  return (
    <div className="content-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <button onClick={onBack}>
              <ArrowLeft size={14} /> Atendimento
            </button>
            <ChevronRight size={13} />
            <b>Chamados</b>
          </div>
          <h1>Seus chamados</h1>
          <p>Acompanhe solicitações, prazos e atualizações em um só lugar.</p>
        </div>
        <div className="header-actions">
          <span className="subtle-count">{tickets.length} no total</span>
          <button
            className="button button-outline button-sm"
            onClick={onRefresh}
            disabled={loading}
            title="Atualizar lista de chamados"
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Atualizar
          </button>
          <button className="button button-primary button-sm" onClick={onBack}>
            <Plus size={15} /> Novo atendimento
          </button>
        </div>
      </header>
      <div className="ticket-filter-row">
        {["Todos", "Em andamento", "Concluídos"].map((x) => (
          <button
            className={filter === x ? "filter-chip-active" : ""}
            key={x}
            onClick={() => setFilter(x)}
          >
            {x}
            <span>
              {x === "Todos"
                ? tickets.length
                : x === "Concluídos"
                  ? tickets.filter((t) =>
                      ["RESOLVED", "APPROVED", "CLOSED"].includes(t.status),
                    ).length
                  : tickets.filter(
                      (t) =>
                        !["RESOLVED", "APPROVED", "CLOSED"].includes(t.status),
                    ).length}
            </span>
          </button>
        ))}
        <span className="push-right">
          <Filter size={15} /> Atualizados recentemente
        </span>
      </div>
      {error && (
        <div className="chat-error ticket-list-error">
          <span>{error}</span>
          <button onClick={onRefresh} disabled={loading}>
            Tentar novamente
          </button>
        </div>
      )}
      <div className="tickets-table-wrap">
        <table className="tickets-table">
          <thead>
            <tr>
              <th>Chamado</th>
              <th>Categoria</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Atualização</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="ticket-table-id">{t.id}</span>
                  <b>{t.title}</b>
                </td>
                <td>{t.category}</td>
                <td>
                  <span
                    className={`priority-dot priority-${slug(t.priority)}`}
                  />
                  {t.priority}
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>{formatDate(t.updatedAt)}</td>
                <td>
                  <span
                    className={
                      t.slaStatus === "Vencido" ? "text-coral" : "text-green"
                    }
                  >
                    {t.slaStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty-state">
            <TicketCheck size={24} />
            <b>Nenhum chamado nesta categoria</b>
            <span>Os chamados que você criar aparecerão aqui.</span>
          </div>
        )}
      </div>
      <div className="privacy-callout">
        <ShieldCheck size={18} />
        <div>
          <b>Seus chamados são privados</b>
          <span>
            As informações ficam visíveis somente para você e para os
            profissionais de TI autorizados.
          </span>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user, onUpdate }: { user: User; onUpdate: () => void }) {
  const [email, setEmail] = useState(user.email);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const canEditEmail = user.role === "agent" || user.role === "admin";
  const saveEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailNotice("");
    setEmailBusy(true);
    try {
      await api.updateProfile({ email, currentPassword: emailPassword });
      setEmailNotice("E-mail atualizado.");
      setEmail(email.trim());
      setEmailPassword("");
      onUpdate();
    } catch (err) {
      setEmailNotice(messageOf(err));
    } finally {
      setEmailBusy(false);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setNotice("");
    if (next !== confirm) {
      setNotice("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await api.updateProfile({ currentPassword: current, newPassword: next });
      setNotice("Senha atualizada com segurança.");
      setCurrent("");
      setNext("");
      setConfirm("");
      onUpdate();
    } catch (err) {
      setNotice(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="content-page profile-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Portal</span>
            <ChevronRight size={13} />
            <b>Meu perfil</b>
          </div>
          <h1>Meu perfil</h1>
          <p>Suas informações de acesso e preferências.</p>
        </div>
      </header>
      <div className="profile-grid">
        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-large-avatar">
              <Avatar name={user.name} role={user.role} />
            </span>
            <div>
              <h2>{user.name}</h2>
              <span className="role-label">
                {user.role === "admin"
                  ? "Admin Nexo"
                  : user.role === "agent"
                    ? "Colaborador Nexo"
                    : "Cliente"}
              </span>
            </div>
          </div>
          <div className="profile-fields">
            <div>
              <small>NOME COMPLETO</small>
              <b>{user.name}</b>
            </div>
            <div>
              <small>E-MAIL CORPORATIVO</small>
              {canEditEmail ? (
                <form className="profile-email-form" onSubmit={saveEmail}>
                  <input
                    aria-label="E-mail corporativo"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    aria-label="Senha atual para alterar e-mail"
                    type="password"
                    required
                    placeholder="Confirme com sua senha atual"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                  />
                  <button
                    className="button button-secondary"
                    disabled={emailBusy || email === user.email}
                  >
                    {emailBusy ? "Salvando…" : "Atualizar e-mail"}
                  </button>
                  {emailNotice && (
                    <span
                      className={
                        emailNotice.includes("atualizado")
                          ? "inline-success"
                          : "inline-error"
                      }
                    >
                      {emailNotice}
                    </span>
                  )}
                </form>
              ) : (
                <>
                  <b>{user.email}</b>
                  <span className="field-lock">
                    <LockKeyhole size={13} /> Gerenciado pelo administrador de
                    TI
                  </span>
                </>
              )}
            </div>
            <div>
              <small>ÁREA</small>
              <b>{user.department || "Nexo Tecnologia"}</b>
            </div>
          </div>
        </section>
        <section className="profile-card password-card">
          <div className="profile-section-icon">
            <LockKeyhole size={18} />
          </div>
          <h2>Redefinir senha</h2>
          <p>Escolha uma senha forte para manter sua conta protegida.</p>
          <form onSubmit={save} className="password-form">
            <label>
              Senha atual
              <input
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                type="password"
                required
              />
            </label>
            <label>
              Nova senha
              <input
                value={next}
                onChange={(e) => setNext(e.target.value)}
                type="password"
                minLength={8}
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
                minLength={8}
                required
              />
            </label>
            {notice && (
              <div
                className={
                  notice.includes("atualizada")
                    ? "inline-success"
                    : "inline-error"
                }
              >
                {notice}
              </div>
            )}
            <button className="button button-primary" disabled={busy}>
              {busy ? "Salvando…" : "Atualizar senha"}
            </button>
          </form>
        </section>
      </div>
      <div className="profile-security-note">
        <ShieldCheck size={17} />
        <span>
          <b>Sua conta, sob seu controle.</b>
          <small>
            {canEditEmail
              ? "Alterações de e-mail exigem a confirmação da sua senha atual."
              : "Seu e-mail corporativo é gerenciado pelo administrador. Para alterá-lo, fale com a equipe de TI."}
          </small>
        </span>
      </div>
    </div>
  );
}

function TeamWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [section, setSection] = useState("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeId, setActiveId] = useState("");
  const [active, setActive] = useState<Conversation | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState("Todas");
  const [rightOpen, setRightOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const triggerRefresh = useCallback(() => setRefresh((n) => n + 1), []);
  useRealtimeRefresh(triggerRefresh, 3000);
  const reload = useCallback(async () => {
    try {
      const [cs, ts, s] = await Promise.all([
        api.conversations(),
        api.tickets(),
        api.summary(),
      ]);
      setConversations(cs);
      setTickets(ts);
      setSummary(s);
      if (!activeId && cs.length) setActiveId(cs[0].id);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [activeId]);
  useEffect(() => {
    void reload();
  }, [reload, refresh]);
  useEffect(() => {
    if (activeId)
      api
        .conversation(activeId)
        .then(setActive)
        .catch((e) => setError(messageOf(e)));
    else setActive(null);
  }, [activeId, refresh]);
  const onUpdate = (c: Conversation) => {
    setActive(c);
    setRefresh((n) => n + 1);
  };
  const nav: NavItem[] = teamNavigation;
  return (
    <div className="app-shell team-shell">
      <SideNav
        user={user}
        items={nav}
        active={section}
        onChange={setSection}
        onLogout={onLogout}
      />
      <main
        className={`team-main ${section === "chat" ? "team-main-chat" : "team-main-scrollable"}`}
      >
        {section === "chat" && (
          <TeamChat
            user={user}
            conversations={conversations}
            tickets={tickets}
            active={active}
            activeId={activeId}
            filter={filter}
            query={query}
            rightOpen={rightOpen}
            error={error}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={setActiveId}
            onToggleRight={() => setRightOpen(!rightOpen)}
            onUpdate={onUpdate}
            onRefresh={triggerRefresh}
          />
        )}
        {section === "dashboard" && (
          <DashboardPage
            summary={summary}
            tickets={tickets}
            onRefresh={triggerRefresh}
          />
        )}
        {section === "memory" && <SkillsPage />}
        {section === "team" && <TeamDirectory user={user} />}
        {section === "profile" && (
          <ProfilePage user={user} onUpdate={triggerRefresh} />
        )}
      </main>
    </div>
  );
}

function TeamChat({
  user,
  conversations,
  tickets,
  active,
  activeId,
  filter,
  query,
  rightOpen,
  error,
  onFilter,
  onQuery,
  onSelect,
  onToggleRight,
  onUpdate,
  onRefresh,
}: {
  user: User;
  conversations: Conversation[];
  tickets: Ticket[];
  active: Conversation | null;
  activeId: string;
  filter: string;
  query: string;
  rightOpen: boolean;
  error: string;
  onFilter: (x: string) => void;
  onQuery: (x: string) => void;
  onSelect: (id: string) => void;
  onToggleRight: () => void;
  onUpdate: (c: Conversation) => void;
  onRefresh: () => void;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [details, setDetails] = useState(true);
  const [notice, setNotice] = useState(error);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const forYouCount = conversations.filter(
    (conversation) =>
      conversation.status === "WAITING_ANALYST" && !conversation.assigneeId,
  ).length;
  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        const text = `${c.ownerName} ${c.subject} ${c.category}`.toLowerCase();
        return (
          text.includes(query.toLowerCase()) &&
          matchesTeamFilter(c, filter, user)
        );
      }),
    [conversations, filter, query, user],
  );
  const send = async () => {
    if (!reply.trim() || !active || active.status !== "IN_PROGRESS_HUMAN")
      return;
    setSending(true);
    try {
      onUpdate(await api.sendMessage(active.id, reply));
      setReply("");
      onRefresh();
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      setSending(false);
    }
  };
  const action = async (kind: "takeover" | "return" | "close") => {
    if (!active) return;
    try {
      const c =
        kind === "takeover"
          ? await api.takeover(active.id)
          : kind === "return"
            ? await api.returnToAI(active.id)
            : await api.closeConversation(active.id);
      onUpdate(c);
      onRefresh();
    } catch (e) {
      setNotice(messageOf(e));
    }
  };
  const ownerTickets = tickets.filter((t) => t.ownerId === active?.ownerId);
  return (
    <div
      className={`team-chat-layout ${rightOpen ? "" : "team-chat-no-right"}`}
    >
      <aside className="inbox-panel">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">SERVICE DESK</span>
            <h1>
              Conversas <span>{conversations.length}</span>
            </h1>
          </div>
          <button className="icon-button">
            <Plus size={17} />
          </button>
        </div>
        <div className="inbox-filters">
          {["Todas", "Para você", "Com agente", "Minhas"].map((x) => (
            <button
              key={x}
              className={filter === x ? "active" : ""}
              onClick={() => onFilter(x)}
            >
              {x}
              {x === "Para você" && forYouCount > 0 && (
                <b className="filter-unread">{forYouCount}</b>
              )}
            </button>
          ))}
        </div>
        <label className="search-field inbox-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar conversa"
          />
          <Command size={13} />
        </label>
        <div className="inbox-subtitle">
          <span>EM ATENDIMENTO</span>
          <button>
            <Filter size={14} /> Filtros
          </button>
        </div>
        <div className="inbox-list">
          {filtered.map((c) => (
            <button
              key={c.id}
              className={`inbox-row ${activeId === c.id ? "inbox-row-active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <Avatar name={c.ownerName || "Nexo"} role="customer" small />
              <span className="inbox-row-content">
                <span>
                  <b>{c.ownerName}</b>
                  <small>{formatDate(c.updatedAt)}</small>
                </span>
                <strong>{c.subject || c.category || "Atendimento"}</strong>
                <span className="inbox-row-preview">
                  {c.status === "WAITING_ANALYST"
                    ? "Aguardando analista"
                    : c.status === "IN_PROGRESS_HUMAN"
                      ? "Em atendimento humano"
                      : "Agente ativo"}{" "}
                  · {c.category || "Geral"}
                </span>
              </span>
              {c.needsAttention && <i className="unread-dot" />}
            </button>
          ))}
          {!filtered.length && (
            <div className="empty-small">Nenhuma conversa neste filtro.</div>
          )}
        </div>
        <div className="inbox-footer">
          <span className="presence-dot" /> Você está disponível{" "}
          <ChevronDown size={14} />
        </div>
      </aside>
      <section className="team-thread">
        {active ? (
          <>
            <header className="thread-head">
              <div className="thread-person">
                <Avatar name={active.ownerName || "Nexo"} role="customer" />
                <span>
                  <b>{active.ownerName}</b>
                  <small>
                    <span className="presence-dot" /> Cliente ·{" "}
                    {active.category || "TI"}
                  </small>
                </span>
              </div>
              <div className="thread-actions">
                {["WAITING_ANALYST", "OPEN_AI"].includes(active.status) &&
                  !active.assigneeId && (
                  <button
                    className="button button-primary button-sm"
                    onClick={() => void action("takeover")}
                    title="Assumir a conversa e pausar o agente"
                  >
                    <ArrowDownLeft size={15} />
                    {active.ticketId ? "Assumir chamado" : "Assumir conversa"}
                  </button>
                )}
                {active.status === "IN_PROGRESS_HUMAN" &&
                  active.assigneeId === user.id && (
                    <button
                      className="button button-outline button-sm"
                      onClick={() => void action("return")}
                    >
                      <Bot size={15} /> Devolver ao agente
                    </button>
                  )}
                <button
                  className="button button-quiet button-sm"
                  onClick={() => void action("close")}
                  disabled={active.status === "CLOSED"}
                >
                  <Check size={15} /> Encerrar
                </button>
                <span className="head-separator" />
                <button
                  className="icon-button"
                  title="Configurações"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <Settings2 size={17} />
                </button>
                <button
                  className="icon-button"
                  onClick={onToggleRight}
                  title={rightOpen ? "Recolher contexto" : "Abrir contexto"}
                >
                  {rightOpen ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                </button>
                <OverflowMenu
                  items={[
                    {
                      label: "Copiar ID da conversa",
                      onSelect: () => void navigator.clipboard.writeText(active.id),
                    },
                    {
                      label: "Atualizar conversa",
                      onSelect: onRefresh,
                    },
                    {
                      label: rightOpen
                        ? "Recolher painel de contexto"
                        : "Abrir painel de contexto",
                      onSelect: onToggleRight,
                    },
                  ]}
                />
              </div>
            </header>
            {settingsOpen && (
              <div className="team-settings-strip">
                <span className="settings-limit">
                  <ShieldCheck size={14} /> Dados do cliente isolados por
                  conta. Somente o analista responsável pode responder quando a
                  conversa está assumida.
                </span>
                <span className="settings-limit">
                  <Clock3 size={14} /> Limite de 30 mensagens por sessão ·
                  crítico: plantão 24h · horário regular: 8h–18h.
                </span>
              </div>
            )}
            <div className="thread-context-banner">
              <span
                className={`conversation-state state-${active.status.toLowerCase()}`}
              >
                <span />
                {statusLabel(active.status)}
              </span>
              <span className="context-separator">·</span>
              <span>{active.subject}</span>
              {active.ticketId && (
                <span className="ticket-id-chip">Chamado {active.ticketId}</span>
              )}
              {active.assigneeName && (
                <span className="push-right assignee-tag">
                  <UserRound size={13} /> {active.assigneeName}
                </span>
              )}
            </div>
            <div className="thread-feed">
              {active.ticket && (
                <div className="team-ticket-card-wrap">
                  <span className="eyebrow">CHAMADO DESTA CONVERSA</span>
                  <TicketCard ticket={active.ticket} highlightPriority />
                </div>
              )}
              {active.messages?.map((m) => (
                <TeamMessage
                  key={m.id}
                  message={m}
                  hideTicket={Boolean(active.ticket)}
                />
              ))}
            </div>
            {notice && (
              <div className="chat-error">
                <span>{notice}</span>
                <button onClick={() => setNotice("")}>
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="team-compose">
              <div className="team-compose-info">
                {active.status === "IN_PROGRESS_HUMAN" ? (
                  <>
                    <span className="human-lock">
                      <LockKeyhole size={13} /> Você está no controle
                    </span>
                    <span>{active.messageCount}/30 mensagens</span>
                  </>
                ) : active.status === "WAITING_ANALYST" ? (
                  <span>
                    <Clock3 size={14} /> Assuma a conversa para responder. O
                    agente está pausado.
                  </span>
                ) : (
                  <span>
                    <Bot size={14} /> O agente está conduzindo o atendimento.
                  </span>
                )}
              </div>
              <form
                className="team-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    active.status === "IN_PROGRESS_HUMAN"
                      ? "Escreva uma resposta para o cliente…"
                      : "Assuma a conversa para responder"
                  }
                  disabled={active.status !== "IN_PROGRESS_HUMAN"}
                  rows={2}
                />
                <button
                  className="send-button"
                  disabled={
                    !reply.trim() ||
                    sending ||
                    active.status !== "IN_PROGRESS_HUMAN"
                  }
                >
                  {sending ? (
                    <span className="mini-loader" />
                  ) : (
                    <Send size={17} />
                  )}
                </button>
              </form>
              <div className="compose-foot">
                <span>
                  <LockKeyhole size={12} /> Nota visível ao cliente
                </span>
                <span>Enter envia</span>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-thread">
            <span className="empty-thread-icon">
              <MessageCircle size={25} />
            </span>
            <b>Escolha uma conversa</b>
            <p>
              Selecione uma conversa na lista para ver o histórico e o contexto.
            </p>
          </div>
        )}
      </section>
      {rightOpen && active && (
        <aside className="context-panel">
          <div className="context-panel-head">
            <div>
              <span className="eyebrow">CONTEXTO</span>
              <h2>Visão do caso</h2>
            </div>
            <button className="icon-button" onClick={onToggleRight}>
              <X size={17} />
            </button>
          </div>
          <div className="context-person-card">
            <Avatar name={active.ownerName || "Nexo"} role="customer" />
            <div>
              <b>{active.ownerName}</b>
              <small>{ownerTickets.length} chamados · Cliente</small>
            </div>
            <OverflowMenu
              label="Ações do cliente"
              items={[
                {
                  label: showAllTickets
                    ? "Mostrar menos chamados"
                    : "Ver todos os chamados",
                  onSelect: () => setShowAllTickets((show) => !show),
                },
                {
                  label: "Copiar nome do cliente",
                  onSelect: () =>
                    void navigator.clipboard.writeText(active.ownerName || ""),
                },
              ]}
            />
          </div>
          {active.handoffSummary && (
            <div className="handoff-summary">
              <span>
                <Headphones size={14} /> RESUMO PARA O ANALISTA
              </span>
              <p>{active.handoffSummary}</p>
            </div>
          )}
          <div className="context-section">
            <div className="context-section-title">
              <span>RESUMO DO ATENDIMENTO</span>
              <button onClick={() => setDetails(!details)}>
                {details ? "Recolher" : "Expandir"}{" "}
                <ChevronDown className={details ? "rotate" : ""} size={13} />
              </button>
            </div>
            {details && (
              <div className="context-summary">
                <div>
                  <small>Categoria</small>
                  <b>{active.category || "A classificar"}</b>
                </div>
                <div>
                  <small>Status</small>
                  <b>
                    <StatusDot status={active.status} />{" "}
                    {statusLabel(active.status)}
                  </b>
                </div>
                <div>
                  <small>Responsável</small>
                  <b>{active.assigneeName || "Nexo Assist"}</b>
                </div>
                <div>
                  <small>Mensagens</small>
                  <b>{active.messageCount}/30</b>
                </div>
              </div>
            )}
          </div>
          <div className="context-section">
            <div className="context-section-title">
              <span>CHAMADOS DO CLIENTE</span>
              <button
                className="text-button"
                onClick={() => setShowAllTickets(!showAllTickets)}
              >
                {showAllTickets ? "Mostrar menos" : "Ver todos"}
              </button>
            </div>
            <div className="context-tickets">
              {ownerTickets
                .slice(0, showAllTickets ? undefined : 4)
                .map((t) => (
                  <TicketMini
                    key={t.id}
                    ticket={t}
                    onOpenConversation={onSelect}
                  />
                ))}
              {!ownerTickets.length && (
                <div className="empty-small">Nenhum chamado associado.</div>
              )}
            </div>
          </div>
          <div className="context-section">
            <div className="context-section-title">
              <span>DECISÕES DO AGENTE</span>
              <Activity size={14} />
            </div>
            <div className="context-audit">
              {active.messages
                ?.flatMap((m) => m.decisions || [])
                .slice(-4)
                .map((d, i) => (
                  <div key={`${d.action}-${i}`}>
                    <span className="audit-check">
                      <Check size={12} />
                    </span>
                    <span>
                      <b>{labelAction(d.action)}</b>
                      <small>{d.reason}</small>
                    </span>
                  </div>
                ))}
            </div>
          </div>
          <button
            className="button button-outline button-wide context-close"
            onClick={() => void action("close")}
            disabled={active.status === "CLOSED"}
          >
            <Check size={15} /> Encerrar atendimento
          </button>
        </aside>
      )}
    </div>
  );
}

function TeamMessage({
  message,
  hideTicket = false,
}: {
  message: Message;
  hideTicket?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (message.role === "system")
    return (
      <div className="system-message">
        <span>
          <Activity size={13} />
        </span>
        {message.content}
      </div>
    );
  return (
    <div
      className={`team-message ${message.role === "user" ? "team-message-customer" : message.role === "analyst" ? "team-message-analyst" : ""}`}
    >
      <div className="team-message-meta">
        <b>
          {message.role === "user"
            ? "Cliente"
            : message.role === "analyst"
              ? "Colaborador Nexo"
              : "Nexo Assist"}
        </b>
        <span>{formatDate(message.createdAt)}</span>
        {message.decisions?.length ? (
          <button onClick={() => setExpanded(!expanded)}>
            <Activity size={12} /> {message.decisions.length} ações{" "}
            <ChevronDown className={expanded ? "rotate" : ""} size={12} />
          </button>
        ) : null}
      </div>
      <div
        className={`team-message-bubble ${message.role === "user" ? "bubble-customer" : message.critical ? "bubble-critical" : "bubble-assistant"}`}
      >
        {message.content}
      </div>
      {message.ticket && !hideTicket && (
        <TicketCard ticket={message.ticket} highlightPriority />
      )}
      {expanded && <DecisionDetails decisions={message.decisions} />}
    </div>
  );
}

function DashboardPage({
  summary,
  tickets,
  onRefresh,
}: {
  summary: Summary | null;
  tickets: Ticket[];
  onRefresh: () => void;
}) {
  const categories = Object.entries(
    tickets.reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <div className="content-page dashboard-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Equipe</span>
            <ChevronRight size={13} />
            <b>Visão geral</b>
          </div>
          <h1>Seu impacto, em foco.</h1>
          <p>
            Uma visão clara do que está sendo resolvido e de como o suporte está
            fluindo.
          </p>
        </div>
        <span className="date-pill">
          <Activity size={14} /> Últimos 30 dias
        </span>
      </header>
      <div className="metric-grid">
        <MetricCard
          label="Resolvidos pela IA"
          value={summary?.aiResolved ?? 0}
          change="Atendimento autônomo"
          icon={Bot}
          tone="blue"
        />
        <MetricCard
          label="Resolvidos pela equipe"
          value={summary?.humanResolved ?? 0}
          change="Com intervenção humana"
          icon={Headphones}
          tone="lime"
        />
        <MetricCard
          label="Aguardando analista"
          value={summary?.waitingConversations ?? 0}
          change="Precisam de atenção"
          icon={Clock3}
          tone="coral"
        />
        <MetricCard
          label="Chamados em andamento"
          value={summary?.openTickets ?? 0}
          change="Dentro do service desk"
          icon={TicketCheck}
          tone="yellow"
        />
      </div>
      <div className="dashboard-grid">
        <section className="surface-card category-chart">
          <div className="card-heading">
            <span>
              <small>DEMANDA DE SUPORTE</small>
              <h2>Chamados por categoria</h2>
            </span>
            <OverflowMenu
              label="Ações do gráfico de categorias"
              items={[
                { label: "Atualizar painel", onSelect: onRefresh },
                {
                  label: "Copiar resumo das categorias",
                  onSelect: () =>
                    void navigator.clipboard.writeText(
                      categories
                        .map(([name, count]) => `${name}: ${count} chamados`)
                        .join("\n") || "Ainda não há chamados por categoria.",
                    ),
                },
              ]}
            />
          </div>
          {categories.map(([name, count], i) => (
            <div className="category-bar-row" key={name}>
              <span>{name}</span>
              <div className="bar-track">
                <i
                  className={`bar-fill bar-${i % 4}`}
                  style={{
                    width: `${Math.max(12, (count / Math.max(1, tickets.length)) * 100)}%`,
                  }}
                />
              </div>
              <b>{count}</b>
            </div>
          ))}
          {!categories.length && (
            <div className="empty-small">
              Os dados aparecem conforme os chamados são tratados.
            </div>
          )}
        </section>
        <section className="surface-card flow-card">
          <div className="card-heading">
            <span>
              <small>OPERAÇÃO</small>
              <h2>Fluxo de resolução</h2>
            </span>
            <span className="flow-spark">
              <Activity size={16} />
            </span>
          </div>
          <div className="flow-stat">
            <b>{summary?.resolvedTickets ?? 0}</b>
            <span>chamados concluídos no período</span>
          </div>
          <div className="flow-split">
            <div>
              <span className="legend-dot legend-blue" />
              <b>{summary?.aiResolved ?? 0}</b>
              <small>Assistente</small>
            </div>
            <div>
              <span className="legend-dot legend-lime" />
              <b>{summary?.humanResolved ?? 0}</b>
              <small>Equipe</small>
            </div>
          </div>
          <div className="flow-track">
            <i
              style={{
                width: `${summary?.resolvedTickets ? Math.round((summary.aiResolved / summary.resolvedTickets) * 100) : 0}%`,
              }}
            />
          </div>
          <p>Resolução com transparência e continuidade de contexto.</p>
        </section>
      </div>
      <section className="surface-card recent-tickets">
        <div className="card-heading">
          <span>
            <small>ACOMPANHAMENTO</small>
            <h2>Chamados recentes</h2>
          </span>
          <button className="text-button">
            Ver todos <ArrowRight size={14} />
          </button>
        </div>
        <div className="recent-list">
          {tickets.slice(0, 5).map((t) => (
            <div className="recent-row" key={t.id}>
              <span className="recent-id">{t.id}</span>
              <b>{t.title}</b>
              <span>{t.category}</span>
              <span
                className={`priority-text priority-text-${slug(t.priority)}`}
              >
                <span className={`priority-dot priority-${slug(t.priority)}`} />
                {t.priority}
              </span>
              <StatusBadge status={t.status} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  change: string;
  icon: IconType;
  tone: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <i className={`metric-icon metric-${tone}`}>
          <Icon size={18} />
        </i>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{change}</small>
      <span className="metric-decoration">✳</span>
    </article>
  );
}

function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [savingSkill, setSavingSkill] = useState(false);
  const [skillForm, setSkillForm] = useState({ name: "", description: "" });
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  useEffect(() => {
    api
      .skills()
      .then(setSkills)
      .catch((e) => setError(messageOf(e)));
  }, []);
  const toggle = async (id: string, enabled: boolean) => {
    try {
      await api.updateSkill(id, !enabled);
      setSkills((s) =>
        s.map((x) => (x.id === id ? { ...x, enabled: !enabled } : x)),
      );
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const createSkill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSavingSkill(true);
    try {
      const skill = await api.createSkill({
        name: skillForm.name.trim(),
        description: skillForm.description.trim(),
      });
      setSkills((current) => [skill, ...current]);
      setSkillForm({ name: "", description: "" });
      setSkillDialogOpen(false);
      setNotice("Skill criada e ativada para o agente.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSavingSkill(false);
    }
  };
  const openKnowledge = async () => {
    setKnowledgeOpen(true);
    setKnowledgeLoading(true);
    setKnowledgeError("");
    try {
      setArticles(await api.knowledge());
    } catch (e) {
      setKnowledgeError(messageOf(e));
    } finally {
      setKnowledgeLoading(false);
    }
  };
  return (
    <div className="content-page skills-page">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Inteligência</span>
            <ChevronRight size={13} />
            <b>Memória e Skills</b>
          </div>
          <h1>Memória que melhora o suporte.</h1>
          <p>
            Conhecimento operacional, contexto e habilidades configuráveis pela
            equipe.
          </p>
        </div>
        <button
          className="button button-primary button-sm"
          onClick={() => {
            setError("");
            setSkillDialogOpen(true);
          }}
        >
          <Plus size={15} /> Nova skill
        </button>
      </header>
      {error && !skillDialogOpen && <div className="inline-error">{error}</div>}
      {notice && <div className="inline-success">{notice}</div>}
      <div className="memory-hero">
        <span className="memory-hero-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <span className="eyebrow">CAMADA DE CONTEXTO</span>
          <h2>Resoluções viram referência.</h2>
          <p>
            O agente usa histórico e procedimentos documentados para evitar
            perguntas repetidas e sugerir próximos passos. A equipe mantém o
            controle das regras e permissões.
          </p>
        </div>
        <div className="memory-hero-stats">
          <span>
            <b>30</b>
            <small>mensagens por sessão</small>
          </span>
          <span>
            <b>{skills.filter((s) => s.enabled).length}</b>
            <small>skills ativas</small>
          </span>
        </div>
      </div>
      <div className="skills-list-head">
        <div>
          <span className="eyebrow">CONFIGURAÇÃO DA EQUIPE</span>
          <h2>Skills do agente</h2>
        </div>
        <button
          className="button button-outline button-sm"
          onClick={() => void openKnowledge()}
        >
          <BookOpen size={15} /> Ver base de conhecimento
        </button>
      </div>
      <div className="skills-grid">
        {skills.map((skill, i) => (
          <article className="skill-card" key={skill.id}>
            <div className="skill-card-top">
              <span className={`skill-icon skill-icon-${i}`}>
                <SkillIcon index={i} />
              </span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  onChange={() => void toggle(skill.id, skill.enabled)}
                />
                <span />
              </label>
            </div>
            <span className="skill-kind">SKILL OPERACIONAL</span>
            <h3>{skill.name}</h3>
            <p>{skill.description}</p>
            <div className="skill-card-foot">
              <span
                className={skill.enabled ? "enabled-status" : "disabled-status"}
              >
                <i />
                {skill.enabled ? "Ativa" : "Pausada"}
              </span>
              <OverflowMenu
                label={`Ações da skill ${skill.name}`}
                items={[
                  {
                    label: skill.enabled ? "Pausar skill" : "Ativar skill",
                    onSelect: () => void toggle(skill.id, skill.enabled),
                  },
                  {
                    label: "Copiar descrição",
                    onSelect: () =>
                      void navigator.clipboard.writeText(skill.description),
                  },
                ]}
              />
            </div>
          </article>
        ))}
      </div>
      <div className="learning-note">
        <ShieldCheck size={17} />
        <span>
          <b>Aprendizado com supervisão.</b> Resoluções de analistas servem de
          contexto; não alteram políticas de segurança nem concedem permissões
          ao agente.
        </span>
      </div>
      {skillDialogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSkillDialogOpen(false);
            }
          }}
        >
          <form
            className="modal-card"
            onSubmit={(event) => void createSkill(event)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-skill-title"
          >
            <div className="modal-heading">
              <h2 id="new-skill-title">Nova skill operacional</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setSkillDialogOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <p>
              Defina uma orientação curta. Quando estiver ativa, o agent
              receberá esta instrução como contexto, sujeita às políticas do
              sistema.
            </p>
            <label>
              Nome da skill
              <input
                required
                minLength={2}
                maxLength={80}
                value={skillForm.name}
                onChange={(event) =>
                  setSkillForm({ ...skillForm, name: event.target.value })
                }
                placeholder="Ex.: Validar impacto em equipe"
              />
            </label>
            <label>
              Orientação para o agent
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={skillForm.description}
                onChange={(event) =>
                  setSkillForm({
                    ...skillForm,
                    description: event.target.value,
                  })
                }
                placeholder="Descreva o comportamento esperado e quando aplicá-lo."
              />
            </label>
            {error && <div className="inline-error">{error}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-outline button-sm"
                onClick={() => setSkillDialogOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="button button-primary button-sm"
                disabled={savingSkill}
              >
                {savingSkill ? "Salvando…" : "Criar skill"}
              </button>
            </div>
          </form>
        </div>
      )}
      {knowledgeOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setKnowledgeOpen(false);
            }
          }}
        >
          <section
            className="modal-card knowledge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-title"
          >
            <div className="modal-heading">
              <h2 id="knowledge-title">Base de conhecimento</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar base de conhecimento"
                onClick={() => setKnowledgeOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <p>
              Artigos operacionais usados pelo Nexo Assist para orientar
              clientes.
            </p>
            {knowledgeLoading ? (
              <div className="knowledge-empty">Carregando artigos…</div>
            ) : knowledgeError ? (
              <div className="inline-error">{knowledgeError}</div>
            ) : articles.length === 0 ? (
              <div className="knowledge-empty">Nenhum artigo cadastrado.</div>
            ) : (
              <div className="knowledge-list">
                {articles.map((article) => (
                  <details className="knowledge-article" key={article.id}>
                    <summary>
                      <span>
                        <small>{article.category}</small>
                        <b>{article.title}</b>
                      </span>
                      <ChevronDown size={16} />
                    </summary>
                    <p>{article.excerpt}</p>
                    <div>{article.content}</div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SkillIcon({ index }: { index: number }) {
  const Icon = [Sparkles, MessageCircle, Activity][index % 3];
  return <Icon size={18} />;
}

function TeamDirectory({ user }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "customer",
    title: "",
    department: "",
  });
  const reload = useCallback(
    () =>
      api
        .users()
        .then(setUsers)
        .catch((e) => setNotice(messageOf(e))),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser(form);
      setNotice("Pessoa cadastrada.");
      setOpen(false);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "customer",
        title: "",
        department: "",
      });
      void reload();
    } catch (err) {
      setNotice(messageOf(err));
    }
  };
  return (
    <div className="content-page team-directory">
      <header className="page-header">
        <div>
          <div className="breadcrumb">
            <span>Equipe</span>
            <ChevronRight size={13} />
            <b>Pessoas</b>
          </div>
          <h1>As pessoas por trás do suporte.</h1>
          <p>Gerencie clientes, colaboradores da Nexo e administradores.</p>
        </div>
        {user.role === "admin" && (
          <button
            className="button button-primary button-sm"
            onClick={() => setOpen(true)}
          >
            <UserRoundPlus size={15} /> Cadastrar pessoa
          </button>
        )}
      </header>
      {notice && <div className="inline-success">{notice}</div>}
      <div className="team-roster">
        {users.map((person) => (
          <article key={person.id} className="roster-card">
            <Avatar name={person.name} role={person.role} />
            <div className="roster-info">
              <b>{person.name}</b>
              <small>{person.title || person.role}</small>
              <span>{person.email}</span>
            </div>
            <span className={`role-pill role-${person.role}`}>
              {person.role === "admin"
                ? "Admin Nexo"
                : person.role === "agent"
                  ? "Colaborador Nexo"
                  : "Cliente"}
            </span>
            <OverflowMenu
              label={`Ações de ${person.name}`}
              items={[
                {
                  label: "Copiar e-mail",
                  onSelect: () => void navigator.clipboard.writeText(person.email),
                },
                {
                  label: "Copiar ID da conta",
                  onSelect: () => void navigator.clipboard.writeText(person.id),
                },
              ]}
            />
          </article>
        ))}
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal-card"
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <span className="profile-section-icon">
                <UserRoundPlus size={18} />
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <h2>Adicionar pessoa</h2>
            <p>Crie um acesso para o portal do Nexo Assist.</p>
            <label>
              Nome
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              E-mail corporativo
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Senha inicial
              <input
                required
                minLength={8}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>
                Perfil
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="customer">Cliente</option>
                  <option value="agent">Colaborador Nexo</option>
                  <option value="admin">Admin Nexo</option>
                </select>
              </label>
              <label>
                Área
                <input
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Cargo
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button-outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="button button-primary">Criar acesso</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`status-badge ${statusClass(status)} ${compact ? "status-badge-compact" : ""}`}
    >
      <i />
      {statusLabel(status)}
    </span>
  );
}
function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`status-dot ${statusClass(status)}`}
      title={statusLabel(status)}
    />
  );
}
function statusClass(status: string) {
  if (["RESOLVED", "APPROVED", "CLOSED"].includes(status)) return "status-done";
  if (["WAITING_ANALYST", "IN_PROGRESS_HUMAN"].includes(status))
    return "status-waiting";
  return "status-open";
}
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN_AI: "Com agente",
    WAITING_ANALYST: "Aguardando analista",
    IN_PROGRESS_HUMAN: "Em atendimento",
    RETURNED_TO_AI: "Com agente",
    CLOSED: "Encerrado",
    OPEN: "Aberto",
    APPROVED: "Aprovado",
    RESOLVED: "Resolvido",
    IN_PROGRESS: "Em andamento",
  };
  return labels[status] || status;
}
function labelAction(action: string) {
  const labels: Record<string, string> = {
    intent: "entendeu sua solicitação",
    scope_check: "verificou o escopo",
    knowledge_search: "consultou a central de ajuda",
    ticket_lookup: "consultou seus chamados",
    ticket_classification: "classificou o chamado",
    priority: "classificou a prioridade",
    duplicate_check: "verificou duplicidade",
    draft: "montou o rascunho",
    handoff: "encaminhou para um analista",
    security_escalation: "sinalizou segurança",
    clarification: "pediu mais contexto",
    model_response: "gerou resposta com Gemini",
    ai_fallback: "usou resposta de contingência",
  };
  return labels[action] || action.replace(/_/g, " ");
}
function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ /g, "-");
}
function slaText(priority: string) {
  return priority === "Crítica"
    ? "1h"
    : priority === "Alta"
      ? "4h úteis"
      : priority === "Baixa"
        ? "5 dias úteis"
        : "3 dias úteis";
}
function ticketTypeLabel(type: string) {
  return type === "REQ" ? "Requisição" : "Incidente";
}
function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocorreu um erro inesperado.";
}
