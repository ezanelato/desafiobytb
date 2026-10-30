package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	Title      string `json:"title,omitempty"`
	Department string `json:"department,omitempty"`
}

type Ticket struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversationId,omitempty"`
	OwnerID        string    `json:"ownerId"`
	OwnerName      string    `json:"ownerName,omitempty"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Type           string    `json:"type"`
	Category       string    `json:"category"`
	Priority       string    `json:"priority"`
	Status         string    `json:"status"`
	UpdatedAt      time.Time `json:"updatedAt"`
	CreatedAt      time.Time `json:"createdAt"`
	SLAStatus      string    `json:"slaStatus"`
	DueAt          time.Time `json:"dueAt"`
}

type Decision struct {
	Action     string  `json:"action"`
	Reason     string  `json:"reason"`
	Confidence float64 `json:"confidence"`
}

type Message struct {
	ID        string     `json:"id"`
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"createdAt"`
	Decisions []Decision `json:"decisions,omitempty"`
	Ticket    *Ticket    `json:"ticket,omitempty"`
	Draft     *Ticket    `json:"draft,omitempty"`
	Options   []string   `json:"options,omitempty"`
	Critical  bool       `json:"critical,omitempty"`
}

type Conversation struct {
	ID             string    `json:"id"`
	OwnerID        string    `json:"ownerId"`
	OwnerName      string    `json:"ownerName,omitempty"`
	Subject        string    `json:"subject"`
	Category       string    `json:"category"`
	Status         string    `json:"status"`
	AssigneeID     string    `json:"assigneeId,omitempty"`
	AssigneeName   string    `json:"assigneeName,omitempty"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Messages       []Message `json:"messages,omitempty"`
	MessageCount   int       `json:"messageCount"`
	Priority       string    `json:"priority,omitempty"`
	NeedsAttention bool      `json:"needsAttention"`
	HandoffSummary string    `json:"handoffSummary,omitempty"`
	TicketID       string    `json:"ticketId,omitempty"`
	Ticket         *Ticket   `json:"ticket,omitempty"`
}

type App struct {
	db          *sql.DB
	sessions    map[string]User
	sessionLock sync.RWMutex
	geminiKey   string
	dailyLimit  int
	agentURL    string
	staticDir   string
}

type contextKey string

const userContextKey contextKey = "authenticatedUser"

func main() {
	port := env("PORT", "8080")
	dbURL := env("DATABASE_URL", "postgres://nexo:nexo@localhost:5432/nexo_assist?sslmode=disable")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	for attempt := 0; attempt < 30; attempt++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Printf("aguardando PostgreSQL (%d/30): %v", attempt+1, err)
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatalf("PostgreSQL indisponível: %v", err)
	}
	if err := initializeDatabase(db); err != nil {
		log.Fatal(err)
	}
	if err := seedDatabase(db); err != nil {
		log.Fatal(err)
	}

	app := &App{
		db:         db,
		sessions:   map[string]User{},
		geminiKey:  os.Getenv("GEMINI_API_KEY"),
		dailyLimit: intEnv("GEMINI_DAILY_LIMIT", 500),
		agentURL:   env("AGENT_SERVICE_URL", "http://127.0.0.1:4112/respond"),
		staticDir:  env("STATIC_DIR", "../frontend/dist"),
	}
	mux := http.NewServeMux()
	app.routes(mux)
	server := &http.Server{Addr: ":" + port, Handler: app.cors(app.requestLog(mux)), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Nexo Assist ouvindo na porta %s", port)
	log.Fatal(server.ListenAndServe())
}

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.Handle("GET /api/auth/me", a.auth(http.HandlerFunc(a.me)))
	mux.Handle("POST /api/auth/logout", a.auth(http.HandlerFunc(a.logout)))
	mux.Handle("GET /api/summary", a.auth(http.HandlerFunc(a.summary)))
	mux.Handle("GET /api/tickets", a.auth(http.HandlerFunc(a.listTickets)))
	mux.Handle("POST /api/tickets", a.auth(http.HandlerFunc(a.createTicket)))
	mux.Handle("PATCH /api/tickets/{id}", a.auth(http.HandlerFunc(a.updateTicket)))
	mux.Handle("GET /api/knowledge", a.auth(http.HandlerFunc(a.listKnowledge)))
	mux.Handle("GET /api/conversations", a.auth(http.HandlerFunc(a.listConversations)))
	mux.Handle("POST /api/conversations", a.auth(http.HandlerFunc(a.createConversation)))
	mux.Handle("GET /api/conversations/{id}", a.auth(http.HandlerFunc(a.getConversation)))
	mux.Handle("POST /api/conversations/{id}/messages", a.auth(http.HandlerFunc(a.sendMessage)))
	mux.Handle("POST /api/conversations/{id}/confirm", a.auth(http.HandlerFunc(a.confirmDraft)))
	mux.Handle("POST /api/conversations/{id}/takeover", a.auth(http.HandlerFunc(a.takeover)))
	mux.Handle("POST /api/conversations/{id}/return", a.auth(http.HandlerFunc(a.returnToAI)))
	mux.Handle("POST /api/conversations/{id}/close", a.auth(http.HandlerFunc(a.closeConversation)))
	mux.Handle("GET /api/team/users", a.auth(http.HandlerFunc(a.listUsers)))
	mux.Handle("POST /api/team/users", a.auth(http.HandlerFunc(a.createUser)))
	mux.Handle("PATCH /api/team/profile", a.auth(http.HandlerFunc(a.updateProfile)))
	mux.Handle("GET /api/team/skills", a.auth(http.HandlerFunc(a.listSkills)))
	mux.Handle("POST /api/team/skills", a.auth(http.HandlerFunc(a.createSkill)))
	mux.Handle("PATCH /api/team/skills/{id}", a.auth(http.HandlerFunc(a.updateSkill)))
	mux.Handle("GET /api/team/audit", a.auth(http.HandlerFunc(a.listAudit)))
	mux.HandleFunc("/", a.serveFrontend)
}

func (a *App) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		a.sessionLock.RLock()
		user, ok := a.sessions[token]
		a.sessionLock.RUnlock()
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "Sessão expirada. Entre novamente.")
			return
		}
		next.ServeHTTP(w, withUser(r, user))
	})
}

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := env("CLIENT_ORIGIN", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func (a *App) serveFrontend(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.staticDir, filepath.Clean("/"+r.URL.Path))
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}
	index := filepath.Join(a.staticDir, "index.html")
	if _, err := os.Stat(index); err != nil {
		http.Error(w, "Frontend não compilado. Rode npm run build.", http.StatusNotFound)
		return
	}
	http.ServeFile(w, r, index)
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var input struct{ Email, Password string }
	if !decodeJSON(w, r, &input) {
		return
	}
	var user User
	var salt, stored string
	err := a.db.QueryRow(`SELECT id, name, email, role, COALESCE(title,''), COALESCE(department,''), password_salt, password_hash FROM users WHERE lower(email)=lower($1) AND active=true`, input.Email).
		Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Title, &user.Department, &salt, &stored)
	if err != nil || sha256Hex(salt+input.Password) != stored {
		writeError(w, http.StatusUnauthorized, "E-mail ou senha inválidos.")
		return
	}
	token := randomID("sess")
	a.sessionLock.Lock()
	a.sessions[token] = user
	a.sessionLock.Unlock()
	writeJSON(w, 200, map[string]any{"token": token, "user": user})
}

func (a *App) me(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, currentUser(r)) }

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	a.sessionLock.Lock()
	delete(a.sessions, token)
	a.sessionLock.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) summary(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var open, waiting, resolved int
	if u.Role == "customer" {
		a.db.QueryRow(`SELECT count(*) FILTER (WHERE status NOT IN ('RESOLVED','APPROVED','CLOSED')), count(*) FILTER (WHERE status='WAITING_ANALYST'), count(*) FILTER (WHERE status IN ('RESOLVED','APPROVED','CLOSED')) FROM tickets WHERE owner_id=$1`, u.ID).Scan(&open, &waiting, &resolved)
	} else {
		a.db.QueryRow(`SELECT count(*) FILTER (WHERE status NOT IN ('RESOLVED','APPROVED','CLOSED')), count(*) FILTER (WHERE status='WAITING_ANALYST'), count(*) FILTER (WHERE status IN ('RESOLVED','APPROVED','CLOSED')) FROM tickets`).Scan(&open, &waiting, &resolved)
	}
	var aiResolved, humanResolved int
	a.db.QueryRow(`SELECT count(*) FILTER (WHERE resolution_owner='AI'), count(*) FILTER (WHERE resolution_owner='HUMAN') FROM conversations WHERE status='CLOSED'`).Scan(&aiResolved, &humanResolved)
	writeJSON(w, 200, map[string]int{"openTickets": open, "waitingConversations": waiting, "resolvedTickets": resolved, "aiResolved": aiResolved, "humanResolved": humanResolved})
}

func (a *App) listTickets(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	query := ticketSelect + ` ORDER BY t.updated_at DESC`
	args := []any{}
	if u.Role == "customer" {
		query = ticketSelect + ` WHERE t.owner_id=$1 ORDER BY t.updated_at DESC`
		args = append(args, u.ID)
	} else if owner := r.URL.Query().Get("owner"); owner != "" {
		query = ticketSelect + ` WHERE t.owner_id=$1 ORDER BY t.updated_at DESC`
		args = append(args, owner)
	}
	rows, err := a.db.Query(query, args...)
	if err != nil {
		writeError(w, 500, "Não foi possível consultar os chamados.")
		return
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		t, err := scanTicket(rows)
		if err == nil {
			tickets = append(tickets, t)
		}
	}
	writeJSON(w, 200, tickets)
}

func (a *App) createTicket(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var t Ticket
	if !decodeJSON(w, r, &t) {
		return
	}
	if u.Role == "customer" {
		t.OwnerID = u.ID
	} else if t.OwnerID == "" {
		t.OwnerID = u.ID
	}
	if !validTicket(t) {
		writeError(w, 400, "Preencha título, descrição, tipo, categoria, prioridade e pessoa afetada.")
		return
	}
	created, err := a.createTicketRecord(t)
	if err != nil {
		writeError(w, 500, "Não foi possível criar o chamado.")
		return
	}
	conversationID := randomID("con")
	_, err = a.db.Exec(`INSERT INTO conversations(id,owner_id,subject,category,status,priority,ticket_id,updated_at,created_at,message_count) VALUES($1,$2,$3,$4,'OPEN_AI',$5,$6,now(),now(),1)`, conversationID, created.OwnerID, created.Title, created.Category, created.Priority, created.ID)
	if err != nil {
		_, _ = a.db.Exec(`DELETE FROM tickets WHERE id=$1`, created.ID)
		writeError(w, 500, "Não foi possível iniciar a conversa deste chamado.")
		return
	}
	_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES($1,$2,'system',$3,now())`, randomID("msg"), conversationID, "Conversa vinculada ao chamado "+created.ID+".")
	created.ConversationID = conversationID
	writeJSON(w, 201, created)
}

func (a *App) updateTicket(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var t Ticket
	if !decodeJSON(w, r, &t) {
		return
	}
	var owner string
	err := a.db.QueryRow(`SELECT owner_id FROM tickets WHERE id=$1`, r.PathValue("id")).Scan(&owner)
	if err != nil {
		writeError(w, 404, "Chamado não encontrado.")
		return
	}
	if u.Role == "customer" && owner != u.ID {
		writeError(w, 403, "Você só pode alterar seus próprios chamados.")
		return
	}
	updated, err := a.updateTicketRecord(r.PathValue("id"), t)
	if err != nil {
		writeError(w, 500, "Não foi possível atualizar o chamado.")
		return
	}
	writeJSON(w, 200, updated)
}

func (a *App) listKnowledge(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(`SELECT id, title, category, excerpt, content FROM knowledge_articles ORDER BY title`)
	if err != nil {
		writeError(w, 500, "Não foi possível consultar a base de conhecimento.")
		return
	}
	defer rows.Close()
	items := []map[string]string{}
	for rows.Next() {
		var id, title, category, excerpt, content string
		if rows.Scan(&id, &title, &category, &excerpt, &content) == nil {
			items = append(items, map[string]string{"id": id, "title": title, "category": category, "excerpt": excerpt, "content": content})
		}
	}
	writeJSON(w, 200, items)
}

func (a *App) listConversations(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	query := `SELECT c.id,c.owner_id,u.name,c.subject,c.category,c.status,COALESCE(c.assignee_id,''),COALESCE(a.name,''),c.updated_at,c.message_count,COALESCE(c.priority,''),c.needs_attention,COALESCE(c.ticket_id,'') FROM conversations c JOIN users u ON u.id=c.owner_id LEFT JOIN users a ON a.id=c.assignee_id`
	args := []any{}
	if u.Role == "customer" {
		query += ` WHERE c.owner_id=$1`
		args = append(args, u.ID)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		if len(args) > 0 {
			query += ` AND c.status=$2`
			args = append(args, status)
		} else {
			query += ` WHERE c.status=$1`
			args = append(args, status)
		}
	}
	query += ` ORDER BY c.updated_at DESC`
	rows, err := a.db.Query(query, args...)
	if err != nil {
		writeError(w, 500, "Não foi possível carregar as conversas.")
		return
	}
	defer rows.Close()
	items := []Conversation{}
	for rows.Next() {
		var c Conversation
		if rows.Scan(&c.ID, &c.OwnerID, &c.OwnerName, &c.Subject, &c.Category, &c.Status, &c.AssigneeID, &c.AssigneeName, &c.UpdatedAt, &c.MessageCount, &c.Priority, &c.NeedsAttention, &c.TicketID) == nil {
			items = append(items, c)
		}
	}
	writeJSON(w, 200, items)
}

func (a *App) createConversation(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u.Role != "customer" {
		writeError(w, 403, "Somente funcionários podem iniciar um atendimento.")
		return
	}
	var input struct {
		Category string `json:"category"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	id := randomID("con")
	subject := input.Category
	if subject == "" || subject == "Não reconheço" {
		subject = "Novo atendimento"
	}
	_, err := a.db.Exec(`INSERT INTO conversations(id,owner_id,subject,category,status,updated_at,created_at,message_count,needs_attention) VALUES($1,$2,$3,$4,'OPEN_AI',now(),now(),1,false)`, id, u.ID, subject, input.Category)
	if err != nil {
		writeError(w, 500, "Não foi possível iniciar o atendimento.")
		return
	}
	greeting := "Olá, " + firstName(u.Name) + "! Sou o Nexo Assist. Conte o que está acontecendo e vou ajudar com seu suporte de TI."
	if input.Category != "" && input.Category != "Não reconheço" {
		greeting = "Vamos começar por " + input.Category + ". O que está acontecendo? Se preferir, escolha uma opção abaixo."
	}
	greetingGuidance := "Esta é a abertura do atendimento. Cumprimente o funcionário pelo primeiro nome e convide-o a descrever o problema de TI."
	if input.Category != "" && input.Category != "Não reconheço" {
		greetingGuidance += " A categoria escolhida foi " + input.Category + "; reconheça-a sem presumir detalhes do problema."
	}
	greetingDecision := Decision{Action: "model_response", Reason: "A saudação foi gerada pelo Gemini com o contexto operacional de agent/.context e as skills ativas.", Confidence: 1}
	if generated, ok := a.askGemini(greeting, "", nil, "", "", greetingGuidance); ok {
		greeting = generated
	} else {
		greeting = fallbackNotice(greeting)
		greetingDecision = Decision{Action: "ai_fallback", Reason: "O Gemini não respondeu após três tentativas ou o limite diário local foi atingido; foi exibida uma saudação de contingência.", Confidence: 1}
	}
	greetingDecisionJSON, _ := json.Marshal([]Decision{greetingDecision})
	_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions) VALUES($1,$2,'assistant',$3,now(),$4::jsonb)`, randomID("msg"), id, greeting, string(greetingDecisionJSON))
	if input.Category != "" {
		_, _ = a.db.Exec(`INSERT INTO audit_events(id,conversation_id,actor_id,action,reason,confidence,created_at) VALUES($1,$2,$3,'category_selected','Categoria inicial informada pelo funcionário',1,now())`, randomID("evt"), id, u.ID)
	}
	c, err := a.loadConversation(id, u)
	if err != nil {
		writeError(w, 500, "Atendimento iniciado, mas não foi possível carregar a conversa.")
		return
	}
	writeJSON(w, 201, c)
}

func (a *App) getConversation(w http.ResponseWriter, r *http.Request) {
	c, err := a.loadConversation(r.PathValue("id"), currentUser(r))
	if err != nil {
		writeError(w, 404, "Conversa não encontrada ou sem permissão.")
		return
	}
	writeJSON(w, 200, c)
}

func (a *App) sendMessage(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var input struct {
		Content string `json:"content"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" || len([]rune(input.Content)) > 4000 {
		writeError(w, 400, "A mensagem deve conter de 1 a 4.000 caracteres.")
		return
	}
	c, err := a.loadConversation(r.PathValue("id"), u)
	if err != nil {
		writeError(w, 404, "Conversa não encontrada ou sem permissão.")
		return
	}
	role := "user"
	if u.Role != "customer" && c.Status == "IN_PROGRESS_HUMAN" && c.AssigneeID == u.ID {
		role = "analyst"
	} else if c.Status != "OPEN_AI" || u.Role != "customer" {
		writeError(w, 409, "O agente está pausado enquanto esta conversa aguarda ou está com um analista.")
		return
	}
	if c.MessageCount+2 > 30 {
		writeError(w, 409, "Esta sessão chegou ao limite de 30 mensagens. Inicie um novo atendimento para continuar.")
		return
	}
	now := time.Now().UTC()
	_, err = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions) VALUES($1,$2,$3,$4,$5,'[]'::jsonb)`, randomID("msg"), c.ID, role, input.Content, now)
	if err != nil {
		writeError(w, 500, "Não foi possível registrar a mensagem.")
		return
	}
	_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1,updated_at=$2,subject=CASE WHEN subject='Novo atendimento' THEN left($3,72) ELSE subject END WHERE id=$1`, c.ID, now, input.Content)
	if role == "analyst" {
		out, e := a.loadConversation(c.ID, u)
		if e != nil {
			writeError(w, 500, "Mensagem registrada.")
			return
		}
		writeJSON(w, 200, out)
		return
	}
	assistant, decisions, opts, critical, draft, ticket, newStatus := a.processMessage(u, c, input.Content)
	knowledge := a.knowledgeContext(input.Content)
	memory := ""
	if a.skillEnabled("skill-learning") {
		memory = a.findResolvedLearning(input.Content)
	}
	userTickets, _ := a.ticketsForUser(u.ID)
	ticketContext := summarizeTickets(userTickets)
	guidance := assistant
	if draft != nil {
		guidance += " O rascunho está preparado, mas só será criado ou atualizado depois de confirmação explícita do funcionário."
	}
	if newStatus != "" {
		guidance += " A transferência foi registrada pelo backend. Avise que o analista receberá o resumo e que a IA ficará pausada enquanto a conversa aguarda atendimento humano."
	}
	if generated, ok := a.askGemini(input.Content, knowledge, c.Messages, memory, ticketContext, guidance); ok {
		assistant = generated
		decisions = append(decisions, Decision{Action: "model_response", Reason: "A resposta visível foi gerada pelo Gemini com os arquivos agent/.context, memória aplicável, skills ativas e dados permitidos desta conta.", Confidence: 1})
	} else {
		assistant = fallbackNotice(assistant)
		decisions = append(decisions, Decision{Action: "ai_fallback", Reason: "O Gemini não respondeu após três tentativas ou o limite diário local foi atingido; apresentei a orientação de contingência e sinalizei a falha.", Confidence: 1})
	}
	if newStatus != "" {
		summary := fmt.Sprintf("%s · %s. Funcionário relatou: %s. Histórico completo e procedimentos tentados estão disponíveis abaixo.", c.Category, c.Subject, input.Content)
		_, _ = a.db.Exec(`UPDATE conversations SET status=$2,needs_attention=true,priority=CASE WHEN $2='WAITING_ANALYST' AND priority='' THEN 'Crítica' ELSE priority END,handoff_summary=$3,updated_at=now() WHERE id=$1`, c.ID, newStatus, summary)
		_, _ = a.db.Exec(`UPDATE tickets SET status='WAITING_ANALYST',updated_at=now() WHERE id=(SELECT ticket_id FROM conversations WHERE id=$1)`, c.ID)
	}
	decisionJSON, _ := json.Marshal(decisions)
	msgID := randomID("msg")
	_, err = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions,options,critical,draft_ticket_id) VALUES($1,$2,'assistant',$3,now(),$4::jsonb,$5::jsonb,$6,$7)`, msgID, c.ID, assistant, string(decisionJSON), jsonString(opts), critical, nullableID(draft))
	if err != nil {
		writeError(w, 500, "Não foi possível gerar a resposta.")
		return
	}
	_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1 WHERE id=$1`, c.ID)
	for _, d := range decisions {
		_, _ = a.db.Exec(`INSERT INTO audit_events(id,conversation_id,actor_id,action,reason,confidence,created_at) VALUES($1,$2,$3,$4,$5,$6,now())`, randomID("evt"), c.ID, "agent", d.Action, d.Reason, d.Confidence)
	}
	if draft != nil {
		_, _ = a.db.Exec(`INSERT INTO ticket_drafts(id,conversation_id,owner_id,payload,created_at) VALUES($1,$2,$3,$4::jsonb,now())`, draft.ID, c.ID, u.ID, jsonString(draft))
	}
	if newStatus == "WAITING_ANALYST" {
		_, _ = a.db.Exec(`INSERT INTO audit_events(id,conversation_id,actor_id,action,reason,confidence,created_at) VALUES($1,$2,'agent','handoff',$3,1,now())`, randomID("evt"), c.ID, assistant)
	}
	out, err := a.loadConversation(c.ID, u)
	if err != nil {
		writeError(w, 500, "Mensagem registrada, mas a conversa não foi atualizada.")
		return
	}
	if ticket != nil && len(out.Messages) > 0 {
		out.Messages[len(out.Messages)-1].Ticket = ticket
	}
	writeJSON(w, 200, out)
}

func (a *App) confirmDraft(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var input struct {
		DraftID string `json:"draftId"`
		Draft   Ticket `json:"draft"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	conversation, err := a.loadConversation(r.PathValue("id"), u)
	if err != nil || conversation.Status != "OPEN_AI" {
		writeError(w, 409, "O atendimento não está disponível para confirmar este rascunho.")
		return
	}
	if conversation.MessageCount >= 30 {
		writeError(w, 409, "Esta sessão chegou ao limite de 30 mensagens.")
		return
	}
	var payload []byte
	err = a.db.QueryRow(`UPDATE ticket_drafts SET consumed_at=now() WHERE id=$1 AND owner_id=$2 AND conversation_id=$3 AND consumed_at IS NULL RETURNING payload`, input.DraftID, u.ID, r.PathValue("id")).Scan(&payload)
	if err != nil {
		writeError(w, 404, "Rascunho não encontrado ou já utilizado.")
		return
	}
	var t Ticket
	if json.Unmarshal(payload, &t) != nil {
		_, _ = a.db.Exec(`UPDATE ticket_drafts SET consumed_at=NULL WHERE id=$1`, input.DraftID)
		writeError(w, 500, "Rascunho inválido.")
		return
	}
	if input.Draft.Title != "" {
		t.Title = input.Draft.Title
	}
	if input.Draft.Description != "" {
		t.Description = input.Draft.Description
	}
	if input.Draft.Category != "" {
		t.Category = input.Draft.Category
	}
	if input.Draft.Priority != "" {
		t.Priority = input.Draft.Priority
	}
	if input.Draft.Type != "" {
		t.Type = input.Draft.Type
	}
	if !validTicket(t) {
		_, _ = a.db.Exec(`UPDATE ticket_drafts SET consumed_at=NULL WHERE id=$1`, input.DraftID)
		writeError(w, 400, "Revise os campos do rascunho antes de confirmar.")
		return
	}
	if conversation.TicketID != "" {
		linked, linkedErr := a.getTicket(conversation.TicketID)
		if linkedErr != nil || linked.OwnerID != u.ID {
			writeError(w, 409, "O chamado associado a esta conversa não está disponível.")
			return
		}
		_, err = a.db.Exec(`UPDATE tickets SET title=$2,description=description||E'\n\nAtualização: '||$3,type=$4,category=$5,priority=$6,due_at=$7,updated_at=now() WHERE id=$1`, linked.ID, t.Title, t.Description, linked.Type, t.Category, t.Priority, slaDueAt(time.Now().UTC(), t.Priority))
		if err != nil {
			writeError(w, 500, "Não foi possível atualizar o chamado desta conversa.")
			return
		}
		updated, _ := a.getTicket(linked.ID)
		updated = a.linkTicketToConversation(conversation.ID, updated)
		content, decisions := a.ticketActionReply(u, conversation, "Atualizei o chamado associado a esta conversa.", updated)
		decisionJSON, _ := json.Marshal(decisions)
		_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions,ticket_id) VALUES($1,$2,'assistant',$3,now(),$4::jsonb,$5)`, randomID("msg"), conversation.ID, content, string(decisionJSON), updated.ID)
		_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1,updated_at=now() WHERE id=$1`, conversation.ID)
		out, _ := a.loadConversation(conversation.ID, u)
		if len(out.Messages) > 0 {
			out.Messages[len(out.Messages)-1].Ticket = &updated
		}
		writeJSON(w, 200, out)
		return
	}
	// ------ Verifica duplicidade antes de registrar o chamado ------
	var existingID string
	err = a.db.QueryRow(`SELECT id FROM tickets WHERE owner_id=$1 AND status NOT IN ('RESOLVED','APPROVED','CLOSED') AND lower(category)=lower($2) AND (lower(title) LIKE '%'||lower($3)||'%' OR lower($3) LIKE '%'||lower(title)||'%') ORDER BY updated_at DESC LIMIT 1`, u.ID, t.Category, firstWords(t.Title)).Scan(&existingID)
	if err == nil {
		_, _ = a.db.Exec(`UPDATE tickets SET description=description||E'\n\nAtualização: '||$2,updated_at=now() WHERE id=$1`, existingID, t.Description)
		updated, _ := a.getTicket(existingID)
		updated = a.linkTicketToConversation(conversation.ID, updated)
		content, decisions := a.ticketActionReply(u, conversation, "Atualizei o chamado aberto relacionado para evitar duplicidade.", updated)
		decisionJSON, _ := json.Marshal(decisions)
		_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions,ticket_id) VALUES($1,$2,'assistant',$3,now(),$4::jsonb,$5)`, randomID("msg"), r.PathValue("id"), content, string(decisionJSON), existingID)
		_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1,updated_at=now() WHERE id=$1`, r.PathValue("id"))
		out, _ := a.loadConversation(r.PathValue("id"), u)
		if len(out.Messages) > 0 {
			out.Messages[len(out.Messages)-1].Ticket = &updated
		}
		writeJSON(w, 200, out)
		return
	}
	// ------ Reabre chamado recente se o rascunho aponta para o mesmo problema ------
	var recentID string
	err = a.db.QueryRow(`SELECT id FROM tickets WHERE owner_id=$1 AND status='RESOLVED' AND updated_at>=now()-interval '7 days' AND lower(category)=lower($2) AND (lower(title) LIKE '%'||lower($3)||'%' OR lower($3) LIKE '%'||lower(title)||'%') ORDER BY updated_at DESC LIMIT 1`, u.ID, t.Category, firstWords(t.Title)).Scan(&recentID)
	if err == nil {
		_, _ = a.db.Exec(`UPDATE tickets SET status='OPEN',description=description||E'\n\nReaberto: '||$2,updated_at=now() WHERE id=$1`, recentID, t.Description)
		updated, _ := a.getTicket(recentID)
		updated = a.linkTicketToConversation(conversation.ID, updated)
		content, decisions := a.ticketActionReply(u, conversation, "Reabri o chamado recente relacionado ao problema.", updated)
		decisionJSON, _ := json.Marshal(decisions)
		_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions,ticket_id) VALUES($1,$2,'assistant',$3,now(),$4::jsonb,$5)`, randomID("msg"), r.PathValue("id"), content, string(decisionJSON), recentID)
		_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1,updated_at=now() WHERE id=$1`, r.PathValue("id"))
		out, _ := a.loadConversation(r.PathValue("id"), u)
		if len(out.Messages) > 0 {
			out.Messages[len(out.Messages)-1].Ticket = &updated
		}
		writeJSON(w, 200, out)
		return
	}
	created, err := a.createTicketRecord(t)
	if err != nil {
		_, _ = a.db.Exec(`UPDATE ticket_drafts SET consumed_at=NULL WHERE id=$1`, input.DraftID)
		writeError(w, 500, "Não foi possível criar o chamado.")
		return
	}
	created = a.linkTicketToConversation(conversation.ID, created)
	content, decisions := a.ticketActionReply(u, conversation, "O chamado foi criado após a confirmação.", created)
	decisionJSON, _ := json.Marshal(decisions)
	_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions,ticket_id) VALUES($1,$2,'assistant',$3,now(),$4::jsonb,$5)`, randomID("msg"), r.PathValue("id"), content, string(decisionJSON), created.ID)
	_, _ = a.db.Exec(`UPDATE conversations SET message_count=message_count+1,updated_at=now() WHERE id=$1`, r.PathValue("id"))
	out, _ := a.loadConversation(r.PathValue("id"), u)
	if len(out.Messages) > 0 {
		out.Messages[len(out.Messages)-1].Ticket = &created
	}
	writeJSON(w, 201, out)
}

func (a *App) takeover(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u.Role == "customer" {
		writeError(w, 403, "Apenas a equipe de TI pode assumir conversas.")
		return
	}
	res, err := a.db.Exec(`UPDATE conversations SET status='IN_PROGRESS_HUMAN',assignee_id=$2,updated_at=now(),needs_attention=false WHERE id=$1 AND status IN ('WAITING_ANALYST','OPEN_AI') AND (assignee_id IS NULL OR assignee_id='')`, r.PathValue("id"), u.ID)
	if err != nil {
		writeError(w, 500, "Não foi possível assumir a conversa.")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, 409, "Conversa já foi assumida ou não está disponível para atendimento humano.")
		return
	}
	_, _ = a.db.Exec(`UPDATE tickets SET status='IN_PROGRESS',updated_at=now() WHERE id=(SELECT ticket_id FROM conversations WHERE id=$1)`, r.PathValue("id"))
	a.addSystemMessage(r.PathValue("id"), u.Name+" assumiu o atendimento.", u.ID, "takeover")
	c, _ := a.loadConversation(r.PathValue("id"), u)
	writeJSON(w, 200, c)
}

func (a *App) returnToAI(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u.Role == "customer" {
		writeError(w, 403, "Apenas a equipe de TI pode devolver conversas.")
		return
	}
	res, err := a.db.Exec(`UPDATE conversations SET status='OPEN_AI',assignee_id=NULL,updated_at=now(),needs_attention=false WHERE id=$1 AND status='IN_PROGRESS_HUMAN' AND assignee_id=$2`, r.PathValue("id"), u.ID)
	if err != nil {
		writeError(w, 500, "Não foi possível devolver a conversa.")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, 409, "Somente o analista responsável pode devolver esta conversa.")
		return
	}
	_, _ = a.db.Exec(`UPDATE tickets SET status='OPEN',updated_at=now() WHERE id=(SELECT ticket_id FROM conversations WHERE id=$1)`, r.PathValue("id"))
	a.addSystemMessage(r.PathValue("id"), "O analista devolveu o atendimento ao Nexo Assist. Vou continuar com o contexto registrado.", u.ID, "return_to_ai")
	c, _ := a.loadConversation(r.PathValue("id"), u)
	writeJSON(w, 200, c)
}

func (a *App) closeConversation(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var owner, assignee, status string
	var ticketID sql.NullString
	tx, err := a.db.Begin()
	if err != nil {
		writeError(w, 500, "Não foi possível encerrar o atendimento.")
		return
	}
	defer tx.Rollback()
	err = tx.QueryRow(`SELECT owner_id,status,COALESCE(assignee_id,''),ticket_id FROM conversations WHERE id=$1 FOR UPDATE`, r.PathValue("id")).Scan(&owner, &status, &assignee, &ticketID)
	if err != nil {
		writeError(w, 404, "Conversa não encontrada.")
		return
	}
	if u.Role == "customer" && owner != u.ID {
		writeError(w, 403, "Sem permissão.")
		return
	}
	if u.Role != "customer" && status == "IN_PROGRESS_HUMAN" && assignee != u.ID {
		writeError(w, 403, "Somente o analista responsável pode encerrar.")
		return
	}
	if !ticketID.Valid {
		_ = tx.QueryRow(`SELECT ticket_id FROM messages WHERE conversation_id=$1 AND ticket_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, r.PathValue("id")).Scan(&ticketID)
	}
	resolutionOwner := "HUMAN"
	if u.Role == "customer" {
		resolutionOwner = "AI"
	}
	_, err = tx.Exec(`UPDATE conversations SET status='CLOSED',ticket_id=COALESCE(ticket_id,$2),resolution_owner=$3,updated_at=now(),needs_attention=false WHERE id=$1`, r.PathValue("id"), nullableString(ticketID), resolutionOwner)
	if err != nil {
		writeError(w, 500, "Não foi possível encerrar o atendimento.")
		return
	}
	if ticketID.Valid {
		result, ticketErr := tx.Exec(`UPDATE tickets SET status='RESOLVED',updated_at=now() WHERE id=$1`, ticketID.String)
		if ticketErr != nil {
			writeError(w, 500, "Não foi possível finalizar o chamado vinculado.")
			return
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			writeError(w, 409, "O chamado vinculado não foi encontrado.")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		writeError(w, 500, "Não foi possível salvar o encerramento do atendimento.")
		return
	}
	a.addSystemMessage(r.PathValue("id"), "Atendimento encerrado. Se o problema voltar, você poderá iniciar uma nova conversa.", u.ID, "close")
	c, _ := a.loadConversation(r.PathValue("id"), u)
	writeJSON(w, 200, c)
}

func (a *App) listUsers(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u.Role == "customer" {
		writeError(w, 403, "Sem permissão.")
		return
	}
	rows, err := a.db.Query(`SELECT id,name,email,role,COALESCE(title,''),COALESCE(department,'') FROM users WHERE active=true ORDER BY name`)
	if err != nil {
		writeError(w, 500, "Falha ao listar usuários.")
		return
	}
	defer rows.Close()
	items := []User{}
	for rows.Next() {
		var x User
		if rows.Scan(&x.ID, &x.Name, &x.Email, &x.Role, &x.Title, &x.Department) == nil {
			items = append(items, x)
		}
	}
	writeJSON(w, 200, items)
}

func (a *App) createUser(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u.Role != "admin" {
		writeError(w, 403, "Somente administradores podem cadastrar usuários.")
		return
	}
	var in struct{ Name, Email, Password, Role, Title, Department string }
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.Name == "" || in.Email == "" || in.Password == "" || (in.Role != "customer" && in.Role != "agent" && in.Role != "admin") {
		writeError(w, 400, "Dados de usuário inválidos.")
		return
	}
	id := randomID("usr")
	salt := randomID("salt")
	_, err := a.db.Exec(`INSERT INTO users(id,name,email,role,title,department,password_salt,password_hash,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,now())`, id, in.Name, in.Email, in.Role, in.Title, in.Department, salt, sha256Hex(salt+in.Password))
	if err != nil {
		writeError(w, 409, "Não foi possível cadastrar; verifique se o e-mail já existe.")
		return
	}
	writeJSON(w, 201, User{ID: id, Name: in.Name, Email: in.Email, Role: in.Role, Title: in.Title, Department: in.Department})
}

func (a *App) updateProfile(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var in struct{ Email, CurrentPassword, NewPassword string }
	if !decodeJSON(w, r, &in) {
		return
	}
	emailChanged := in.Email != "" && !strings.EqualFold(in.Email, u.Email)
	if u.Role == "customer" && emailChanged {
		writeError(w, 403, "Funcionários não podem alterar o e-mail pelo perfil.")
		return
	}
	if in.NewPassword != "" || emailChanged {
		var salt, hash string
		if a.db.QueryRow(`SELECT password_salt,password_hash FROM users WHERE id=$1`, u.ID).Scan(&salt, &hash) != nil || sha256Hex(salt+in.CurrentPassword) != hash {
			writeError(w, 401, "Senha atual incorreta.")
			return
		}
		if in.NewPassword != "" {
			newSalt := randomID("salt")
			_, _ = a.db.Exec(`UPDATE users SET password_salt=$2,password_hash=$3 WHERE id=$1`, u.ID, newSalt, sha256Hex(newSalt+in.NewPassword))
		}
	}
	if emailChanged {
		if !strings.Contains(in.Email, "@") {
			writeError(w, 400, "Informe um e-mail válido.")
			return
		}
		if _, err := a.db.Exec(`UPDATE users SET email=$2 WHERE id=$1`, u.ID, strings.TrimSpace(in.Email)); err != nil {
			writeError(w, 409, "Este e-mail já está associado a outra conta.")
			return
		}
		a.sessionLock.Lock()
		for token, sessionUser := range a.sessions {
			if sessionUser.ID == u.ID {
				sessionUser.Email = strings.TrimSpace(in.Email)
				a.sessions[token] = sessionUser
			}
		}
		a.sessionLock.Unlock()
	}
	writeJSON(w, 200, map[string]string{"message": "Perfil atualizado."})
}

func (a *App) listSkills(w http.ResponseWriter, r *http.Request) {
	if currentUser(r).Role == "customer" {
		writeError(w, 403, "Sem permissão.")
		return
	}
	rows, err := a.db.Query(`SELECT id,name,description,enabled,updated_at FROM skills ORDER BY name`)
	if err != nil {
		writeError(w, 500, "Falha ao consultar skills.")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, description string
		var enabled bool
		var updated time.Time
		if rows.Scan(&id, &name, &description, &enabled, &updated) == nil {
			items = append(items, map[string]any{"id": id, "name": name, "description": description, "enabled": enabled, "updatedAt": updated})
		}
	}
	writeJSON(w, 200, items)
}

// ------ Creates a configurable operational skill for the Nexo team ------
func (a *App) createSkill(w http.ResponseWriter, r *http.Request) {
	if currentUser(r).Role == "customer" {
		writeError(w, 403, "Sem permissão.")
		return
	}
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if len(in.Name) < 2 || len(in.Name) > 80 || len(in.Description) < 10 || len(in.Description) > 2000 {
		writeError(w, 400, "Informe um nome de 2 a 80 caracteres e uma descrição de 10 a 2000 caracteres.")
		return
	}
	id := randomID("skill")
	var updated time.Time
	err := a.db.QueryRow(`INSERT INTO skills(id,name,description,enabled,updated_at) VALUES($1,$2,$3,true,now()) RETURNING updated_at`, id, in.Name, in.Description).Scan(&updated)
	if err != nil {
		writeError(w, 500, "Não foi possível criar a skill.")
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": in.Name, "description": in.Description, "enabled": true, "updatedAt": updated})
}

func (a *App) updateSkill(w http.ResponseWriter, r *http.Request) {
	if currentUser(r).Role == "customer" {
		writeError(w, 403, "Sem permissão.")
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	_, err := a.db.Exec(`UPDATE skills SET enabled=$2,updated_at=now() WHERE id=$1`, r.PathValue("id"), in.Enabled)
	if err != nil {
		writeError(w, 500, "Falha ao atualizar skill.")
		return
	}
	writeJSON(w, 200, map[string]bool{"enabled": in.Enabled})
}

func (a *App) listAudit(w http.ResponseWriter, r *http.Request) {
	if currentUser(r).Role == "customer" {
		writeError(w, 403, "Sem permissão.")
		return
	}
	rows, err := a.db.Query(`SELECT id,conversation_id,actor_id,action,reason,confidence,created_at FROM audit_events ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		writeError(w, 500, "Falha ao consultar auditoria.")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, conv, actor, action, reason string
		var confidence float64
		var created time.Time
		if rows.Scan(&id, &conv, &actor, &action, &reason, &confidence, &created) == nil {
			items = append(items, map[string]any{"id": id, "conversationId": conv, "actorId": actor, "action": action, "reason": reason, "confidence": confidence, "createdAt": created})
		}
	}
	writeJSON(w, 200, items)
}

func (a *App) processMessage(u User, c Conversation, input string) (string, []Decision, []string, bool, *Ticket, *Ticket, string) {
	lower := strings.ToLower(input)
	classificationInput := input
	ticketDescription := input
	if containsAny(lower, "abrir chamado", "criar chamado", "registrar chamado", "preciso de um chamado", "quero um chamado") {
		var previousUserMessages []string
		for i := len(c.Messages) - 1; i >= 0 && len(previousUserMessages) < 3; i-- {
			if c.Messages[i].Role == "user" && strings.TrimSpace(c.Messages[i].Content) != "" {
				previousUserMessages = append(previousUserMessages, c.Messages[i].Content)
			}
		}
		for left, right := 0, len(previousUserMessages)-1; left < right; left, right = left+1, right-1 {
			previousUserMessages[left], previousUserMessages[right] = previousUserMessages[right], previousUserMessages[left]
		}
		if len(previousUserMessages) > 0 {
			classificationInput = strings.Join(append(previousUserMessages, input), "\n")
			ticketDescription = strings.Join(previousUserMessages, "\n")
		}
	}
	classificationLower := strings.ToLower(classificationInput)
	decisions := []Decision{{Action: "intent", Reason: "Interpretei a mensagem dentro do escopo de suporte de TI.", Confidence: 0.91}}
	if containsAny(lower, "rh", "folha de pagamento", "financeiro", "facilities", "férias", "benefício") && !containsAny(lower, "computador", "sistema", "acesso", "ti") {
		return "Posso ajudar com serviços de Tecnologia da Informação da Nexo. Para esse assunto, procure o departamento responsável. Precisa de ajuda com algum sistema, equipamento ou acesso?", []Decision{{Action: "scope_check", Reason: "A solicitação parece ser de um assunto fora do escopo de TI.", Confidence: 0.94}}, []string{"Tenho uma dúvida de TI", "Solicitar acesso", "Problema com equipamento"}, false, nil, nil, ""
	}
	if containsAny(lower, "falar com alguém", "analista", "atendente humano", "pessoa da ti", "humano") {
		return "Vou encaminhar a conversa para um analista. Ele receberá o resumo e o histórico do atendimento. Enquanto a conversa estiver com a equipe, não enviarei respostas automáticas.", []Decision{{Action: "handoff", Reason: "O funcionário solicitou atendimento humano.", Confidence: 1}}, nil, false, nil, nil, "WAITING_ANALYST"
	}
	if containsAny(lower, "ransomware", "malware", "phishing", "conta comprometida", "vazamento", "acesso não autorizado", "roubaram minha senha") {
		return "Isso pode envolver segurança da informação. Vou encaminhar imediatamente para a equipe de TI. Não envie senhas ou códigos de autenticação nesta conversa.", []Decision{{Action: "security_escalation", Reason: "Detectei indícios de incidente de segurança, que exige intervenção humana.", Confidence: 0.98}}, nil, true, nil, nil, "WAITING_ANALYST"
	}
	if containsAny(lower, "toda equipe", "equipe inteira", "empresa toda", "sistema fora", "parou para todos", "crítico", "critico") {
		return "Pelo impacto informado, classifiquei como crítico e estou acionando o plantão de TI. Vou preparar o contexto para o analista.", []Decision{{Action: "priority", Reason: "Há indicação de impacto em equipe ou operação, compatível com prioridade crítica.", Confidence: 0.89}, {Action: "handoff", Reason: "Incidentes críticos exigem transferência imediata para atendimento humano.", Confidence: 1}}, nil, true, nil, nil, "WAITING_ANALYST"
	}
	if containsAny(lower, "vpn", "erro 809") && !containsAny(lower, "abrir chamado", "criar chamado", "registrar chamado", "quero um chamado", "solicitar", "instalar", "preciso de acesso", "quero acesso") {
		article := a.findArticle("VPN")
		decisions = append(decisions, Decision{Action: "knowledge_search", Reason: "Consultei a central de ajuda e encontrei o procedimento documentado para VPN.", Confidence: 0.93})
		if article == "" {
			article = "Verifique se há conexão com a internet e tente estabelecer a conexão novamente. Se o erro persistir, informe o dispositivo e o horário da tentativa para preparar um chamado."
		}
		return article + " Esse procedimento resolveu?", decisions, []string{"Sim, resolveu", "Não resolveu", "Abrir chamado"}, false, nil, nil, ""
	}
	requestIntent := containsAny(classificationLower,
		"solicitar", "solicitação", "solicitacao", "pedido", "pedir", "requisitar",
		"preciso de acesso", "quero acesso", "liberar acesso", "habilitar acesso",
		"preciso acessar", "quero acessar", "instalar", "adicionar", "segundo monitor",
		"novo monitor", "novo equipamento", "criar conta", "configurar uma conta",
		"preciso de um monitor", "quero um monitor", "preciso de equipamento",
		"quero equipamento", "preciso de um software", "quero um software", "quero instalar",
		"novo notebook", "notebook novo", "computador novo", "equipamento adicional",
	)
	incidentIntent := containsAny(classificationLower,
		"não funciona", "nao funciona", "parou", "falha", "erro", "lento", "lenta",
		"bloqueado", "bloqueada", "indisponível", "indisponivel", "não conecta",
		"nao conecta", "sem acesso", "quebrou", "quebrado", "danificado", "não liga",
		"nao liga", "travando", "travou", "não consigo acessar", "nao consigo acessar",
		"caiu", "desconecta", "não abre", "nao abre", "não carrega", "nao carrega",
		"não sincroniza", "nao sincroniza", "não recebe", "nao recebe", "não envia",
		"nao envia", "sem internet", "fecha sozinho", "fecha sozinha", "crash",
	)
	tasksForTicket := requestIntent || incidentIntent || containsAny(lower,
		"abrir chamado", "criar chamado", "registrar chamado", "preciso de um chamado",
		"quero um chamado", "solicitar monitor", "solicitar acesso", "solicitar software",
	)
	if tasksForTicket {
		category := "Outros"
		kind := "INC"
		priority := "Média"
		titleInput := input
		description := input
		if classificationInput != input {
			titleInput = strings.TrimSpace(strings.ReplaceAll(classificationInput, input, ""))
			description = ticketDescription
		}
		title := titleFrom(titleInput)
		if containsAny(classificationLower, "vpn", "wi-fi", "wifi", "internet", "rede", "conexão de rede", "conexao de rede") {
			category = "Rede e VPN"
		}
		if containsAny(classificationLower, "monitor", "notebook", "computador", "equipamento", "teclado", "mouse", "impressora", "headset") {
			category = "Hardware"
		}
		if containsAny(classificationLower, "email", "e-mail", "outlook", "caixa postal") {
			category = "E-mail"
		}
		if containsAny(classificationLower, "senha", "login", "acesso", "permissão", "permissao", "sap", "figma", "conta bloqueada") {
			category = "Acesso"
		}
		if category == "Outros" && containsAny(classificationLower, "software", "aplicativo", "aplicação", "aplicacao", "sistema", "programa") {
			category = "Software"
		}
		categorySuggestsRequest := !incidentIntent && (category == "Acesso" && containsAny(classificationLower, "acesso", "permissão", "permissao") || category == "Software" && containsAny(classificationLower, "instalação", "instalacao", "instalar", "licença", "licenca") || category == "Hardware" && containsAny(classificationLower, "novo", "adicional", "segundo", "adicionar"))
		if (requestIntent || categorySuggestsRequest) && !incidentIntent {
			kind = "REQ"
			priority = "Baixa"
		}
		if containsAny(classificationLower, "não consigo trabalhar", "nao consigo trabalhar", "impede meu trabalho", "reunião hoje", "reuniao hoje") {
			priority = "Alta"
		}
		if containsAny(classificationLower, "erro 809") {
			title = "VPN não conecta no notebook — erro 809"
		}
		if containsAny(classificationLower, "notebook lento") {
			title = "Notebook lento após atualização"
		}
		if containsAny(classificationLower, "segundo monitor") {
			title = "Solicitação de segundo monitor"
		}
		draft := &Ticket{ID: randomID("drf"), OwnerID: u.ID, OwnerName: u.Name, Title: title, Description: description, Type: kind, Category: category, Priority: priority, Status: "Rascunho", SLAStatus: "Aguardando confirmação"}
		decisions = append(decisions, Decision{Action: "ticket_classification", Reason: fmt.Sprintf("Classifiquei como %s (%s), categoria %s e prioridade %s. Distingui falha ou interrupção como incidente e pedido de acesso, equipamento ou software como requisição.", kind, ticketTypeLabel(kind), category, priority), Confidence: 0.84}, Decision{Action: "duplicate_check", Reason: "Vou comparar este caso com os chamados do funcionário antes da confirmação.", Confidence: 0.82}, Decision{Action: "draft", Reason: "Preparei um rascunho; nenhum chamado será criado sem confirmação explícita.", Confidence: 1})
		return "Posso preparar um chamado com base no que você descreveu. Revise o rascunho e confirme ou edite os dados antes de registrar.", decisions, nil, false, draft, nil, ""
	}
	if containsAny(lower, "meus chamados", "consultar chamado", "status do chamado", "meu chamado", "chamado está", "chamado esta") {
		tickets, _ := a.ticketsForUser(u.ID)
		decisions = append(decisions, Decision{Action: "ticket_lookup", Reason: "Consultei somente os chamados associados ao funcionário autenticado.", Confidence: 1})
		if len(tickets) == 0 {
			return "Não encontrei chamados associados à sua conta. Quer abrir um novo chamado?", decisions, []string{"Abrir um chamado", "Falar com analista"}, false, nil, nil, ""
		}
		return fmt.Sprintf("Encontrei %d chamado(s) associado(s) à sua conta. Você pode abrir a lista para ver status, prazo e atualizações.", len(tickets)), decisions, []string{"Ver meus chamados", "Abrir outro chamado"}, false, nil, nil, ""
	}
	if strings.Contains(lower, "horário") || strings.Contains(lower, "horario") {
		decisions = append(decisions, Decision{Action: "knowledge_search", Reason: "Consultei a central de ajuda para responder sobre o horário do Service Desk.", Confidence: 0.98})
		return "O Service Desk atende de segunda a sexta-feira, das 8h às 18h. Casos críticos têm plantão 24 horas.", decisions, nil, false, nil, nil, ""
	}
	if containsAny(lower, "sim, resolveu", "funcionou", "deu certo", "resolvido") {
		decisions = append(decisions, Decision{Action: "resolution_check", Reason: "O funcionário confirmou que a orientação resolveu o problema.", Confidence: 0.95})
		return "Que bom que resolveu! Se precisar de outra ajuda de TI, é só iniciar um novo atendimento.", decisions, []string{"Encerrar atendimento", "Outra dúvida de TI"}, false, nil, nil, ""
	}
	if learning := a.findResolvedLearning(input); learning != "" && a.skillEnabled("skill-learning") {
		decisions = append(decisions, Decision{Action: "memory_retrieval", Reason: "Consultei uma referência operacional baseada em um caso resolvido, sem expor dados de outro funcionário.", Confidence: 0.73})
		return "Encontrei um caso resolvido com contexto parecido. A equipe registrou esta orientação: " + learning + " Isso corresponde ao que está acontecendo?", decisions, []string{"Sim, é parecido", "Não é o mesmo problema", "Falar com analista"}, false, nil, nil, ""
	}
	decisions = append(decisions, Decision{Action: "clarification", Reason: "Preciso de mais contexto para escolher uma orientação segura.", Confidence: 0.68})
	return "Entendi. Para indicar o próximo passo com segurança, me diga: qual sistema ou equipamento está envolvido e qual mensagem de erro aparece?", decisions, []string{"Problema de acesso", "Rede ou VPN", "Equipamento", "Outro assunto de TI"}, false, nil, nil, ""
}

func (a *App) askGemini(userMessage, knowledge string, history []Message, memory, tickets, guidance string) (string, bool) {
	turns := make([]map[string]string, 0, len(history))
	if a.skillEnabled("skill-context") {
		start := len(history) - 10
		if start < 0 {
			start = 0
		}
		for _, message := range history[start:] {
			if message.Role == "user" || message.Role == "assistant" {
				content := message.Content
				if len([]rune(content)) > 1000 {
					content = string([]rune(content)[:1000])
				}
				turns = append(turns, map[string]string{"role": message.Role, "content": content})
			}
		}
	}
	// ------ Keeps team-configured skills separate from help article context ------
	body, _ := json.Marshal(map[string]any{
		"message":   userMessage,
		"knowledge": knowledge,
		"skills":    a.enabledSkillContext(),
		"memory":    memory,
		"tickets":   tickets,
		"guidance":  guidance,
		"history":   turns,
	})
	client := &http.Client{Timeout: 12 * time.Second}
	for attempt := 0; attempt < 3; attempt++ {
		// ------ Conta cada tentativa no limite diário local antes de chamar o serviço ------
		day := time.Now().UTC().Format("2006-01-02")
		if !a.reserveModelRequest(day) {
			return "", false
		}
		req, err := http.NewRequest(http.MethodPost, a.agentURL, bytes.NewReader(body))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			resp, callErr := client.Do(req)
			if callErr == nil {
				var out struct {
					Text string `json:"text"`
				}
				decodeErr := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out)
				resp.Body.Close()
				if resp.StatusCode >= 200 && resp.StatusCode < 300 && decodeErr == nil && strings.TrimSpace(out.Text) != "" {
					return strings.TrimSpace(out.Text), true
				}
			}
		}
		if attempt < 2 {
			time.Sleep(time.Duration(attempt+1) * 300 * time.Millisecond)
		}
	}
	return "", false
}

func fallbackNotice(message string) string {
	return "Não consegui obter uma resposta da IA após 3 tentativas. Para não deixar você sem retorno, segue uma orientação de contingência: " + message + " Você pode tentar novamente ou pedir atendimento humano."
}

func summarizeTickets(items []Ticket) string {
	if len(items) == 0 {
		return "Nenhum chamado associado à conta autenticada."
	}
	var lines []string
	for _, ticket := range items {
		lines = append(lines, fmt.Sprintf("%s | %s | %s | %s | %s", ticket.ID, ticket.Title, ticket.Category, ticket.Priority, ticket.Status))
		if len(lines) == 10 {
			break
		}
	}
	return strings.Join(lines, "\n")
}

func (a *App) reserveModelRequest(day string) bool {
	tx, err := a.db.Begin()
	if err != nil {
		return false
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`SELECT pg_advisory_xact_lock(hashtext($1))`, "nexo-gemini-"+day); err != nil {
		return false
	}
	var used int
	if err = tx.QueryRow(`SELECT count(*) FROM model_usage WHERE usage_day=$1`, day).Scan(&used); err != nil || used >= a.dailyLimit {
		return false
	}
	if _, err = tx.Exec(`INSERT INTO model_usage(id,usage_day,created_at) VALUES($1,$2,now())`, randomID("use"), day); err != nil {
		return false
	}
	return tx.Commit() == nil
}

func (a *App) loadConversation(id string, u User) (Conversation, error) {
	var c Conversation
	err := a.db.QueryRow(`SELECT c.id,c.owner_id,u.name,c.subject,c.category,c.status,COALESCE(c.assignee_id,''),COALESCE(a.name,''),c.updated_at,c.message_count,COALESCE(c.priority,''),c.needs_attention,c.handoff_summary,COALESCE(c.ticket_id,(SELECT m.ticket_id FROM messages m WHERE m.conversation_id=c.id AND m.ticket_id IS NOT NULL ORDER BY m.created_at DESC LIMIT 1),'') FROM conversations c JOIN users u ON u.id=c.owner_id LEFT JOIN users a ON a.id=c.assignee_id WHERE c.id=$1`, id).Scan(&c.ID, &c.OwnerID, &c.OwnerName, &c.Subject, &c.Category, &c.Status, &c.AssigneeID, &c.AssigneeName, &c.UpdatedAt, &c.MessageCount, &c.Priority, &c.NeedsAttention, &c.HandoffSummary, &c.TicketID)
	if err != nil {
		return c, err
	}
	if u.Role == "customer" && c.OwnerID != u.ID {
		return c, errors.New("forbidden")
	}
	if c.TicketID != "" {
		if linkedTicket, ticketErr := a.getTicket(c.TicketID); ticketErr == nil {
			c.Ticket = &linkedTicket
		}
	}
	rows, err := a.db.Query(`SELECT m.id,m.role,m.content,m.created_at,m.decisions,m.options,m.critical,m.ticket_id,m.draft_ticket_id FROM messages m WHERE m.conversation_id=$1 ORDER BY m.created_at`, id)
	if err != nil {
		return c, err
	}
	defer rows.Close()
	c.Messages = []Message{}
	for rows.Next() {
		var m Message
		var decisionsRaw, optionsRaw []byte
		var ticketID, draftID sql.NullString
		if rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt, &decisionsRaw, &optionsRaw, &m.Critical, &ticketID, &draftID) == nil {
			_ = json.Unmarshal(decisionsRaw, &m.Decisions)
			_ = json.Unmarshal(optionsRaw, &m.Options)
			if ticketID.Valid {
				if t, e := a.getTicket(ticketID.String); e == nil {
					m.Ticket = &t
				}
			}
			if draftID.Valid {
				if t, e := a.getDraft(draftID.String); e == nil {
					m.Draft = &t
				}
			}
			c.Messages = append(c.Messages, m)
		}
	}
	return c, nil
}

func (a *App) createTicketRecord(t Ticket) (Ticket, error) {
	var identifierNumber int64
	if err := a.db.QueryRow(`SELECT nextval('ticket_identifier_seq')`).Scan(&identifierNumber); err != nil {
		return t, err
	}
	t.ID = fmt.Sprintf("%s-%05d", t.Type, identifierNumber)
	if t.Status == "" {
		t.Status = "OPEN"
	}
	now := time.Now().UTC()
	t.CreatedAt = now
	t.UpdatedAt = now
	t.DueAt = slaDueAt(now, t.Priority)
	t.SLAStatus = "Dentro do prazo"
	_, err := a.db.Exec(`INSERT INTO tickets(id,owner_id,title,description,type,category,priority,status,created_at,updated_at,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`, t.ID, t.OwnerID, t.Title, t.Description, t.Type, t.Category, t.Priority, t.Status, now, t.DueAt)
	if err != nil {
		return t, err
	}
	var owner string
	_ = a.db.QueryRow(`SELECT name FROM users WHERE id=$1`, t.OwnerID).Scan(&owner)
	t.OwnerName = owner
	return t, nil
}

// ------ Vincula o chamado confirmado diretamente à conversa correspondente ------
func (a *App) linkTicketToConversation(conversationID string, ticket Ticket) Ticket {
	_, _ = a.db.Exec(`UPDATE conversations SET ticket_id=$2,subject=$3,category=$4,priority=$5,updated_at=now() WHERE id=$1`, conversationID, ticket.ID, ticket.Title, ticket.Category, ticket.Priority)
	ticket.ConversationID = conversationID
	return ticket
}

func (a *App) updateTicketRecord(id string, t Ticket) (Ticket, error) {
	_, err := a.db.Exec(`UPDATE tickets SET title=COALESCE(NULLIF($2,''),title),description=COALESCE(NULLIF($3,''),description),status=COALESCE(NULLIF($4,''),status),priority=COALESCE(NULLIF($5,''),priority),category=COALESCE(NULLIF($6,''),category),updated_at=now() WHERE id=$1`, id, t.Title, t.Description, t.Status, t.Priority, t.Category)
	if err != nil {
		return t, err
	}
	updated, err := a.getTicket(id)
	if err == nil {
		_, _ = a.db.Exec(`UPDATE conversations SET subject=$2,category=$3,priority=$4,updated_at=now() WHERE ticket_id=$1`, id, updated.Title, updated.Category, updated.Priority)
	}
	return updated, err
}

func (a *App) getTicket(id string) (Ticket, error) {
	return scanTicket(a.db.QueryRow(ticketSelect+` WHERE t.id=$1`, id))
}

func (a *App) getDraft(id string) (Ticket, error) {
	var t Ticket
	var raw []byte
	err := a.db.QueryRow(`SELECT payload FROM ticket_drafts WHERE id=$1`, id).Scan(&raw)
	if err != nil {
		return t, err
	}
	err = json.Unmarshal(raw, &t)
	return t, err
}

func (a *App) ticketsForUser(id string) ([]Ticket, error) {
	rows, err := a.db.Query(ticketSelect+` WHERE t.owner_id=$1 ORDER BY t.updated_at DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Ticket{}
	for rows.Next() {
		t, e := scanTicket(rows)
		if e == nil {
			items = append(items, t)
		}
	}
	return items, nil
}

func (a *App) findArticle(term string) string {
	var content string
	_ = a.db.QueryRow(`SELECT content FROM knowledge_articles WHERE lower(title) LIKE '%'||lower($1)||'%' OR lower(category) LIKE '%'||lower($1)||'%' LIMIT 1`, term).Scan(&content)
	return content
}

// ------ Fornece ao agente artigos da central relacionados à mensagem atual ------
func (a *App) knowledgeContext(message string) string {
	terms := strings.Fields(strings.ToLower(message))
	var articles []string
	seen := map[string]bool{}
	for _, term := range terms {
		term = strings.Trim(term, ".,!?;:'\"()")
		if len([]rune(term)) < 4 || seen[term] {
			continue
		}
		seen[term] = true
		var title, category, content string
		err := a.db.QueryRow(`SELECT title,category,content FROM knowledge_articles WHERE lower(title) LIKE '%'||$1||'%' OR lower(category) LIKE '%'||$1||'%' OR lower(content) LIKE '%'||$1||'%' LIMIT 1`, term).Scan(&title, &category, &content)
		if err == nil {
			articles = append(articles, fmt.Sprintf("%s (%s): %s", title, category, content))
		}
		if len(articles) >= 3 {
			break
		}
	}
	return strings.Join(articles, "\n")
}

func (a *App) ticketActionReply(user User, conversation Conversation, outcome string, ticket Ticket) (string, []Decision) {
	guidance := fmt.Sprintf("A operação já foi validada e concluída pelo backend: %s Chamado: %s, título %q, categoria %s, prioridade %s, status %s. Confirme o resultado em uma frase clara e não prometa outra ação.", outcome, ticket.ID, ticket.Title, ticket.Category, ticket.Priority, ticket.Status)
	prompt := "Confirme o resultado do chamado para " + firstName(user.Name) + "."
	if text, ok := a.askGemini(prompt, "", conversation.Messages, "", summarizeTickets([]Ticket{ticket}), guidance); ok {
		return text, []Decision{{Action: "model_response", Reason: "O Gemini redigiu a confirmação usando o resultado já concluído e validado pelo backend.", Confidence: 1}}
	}
	return fallbackNotice(outcome + " " + ticket.ID + " — " + ticket.Title + "."), []Decision{{Action: "ai_fallback", Reason: "O Gemini não respondeu após três tentativas ou o limite diário local foi atingido; a confirmação de contingência informa a operação concluída.", Confidence: 1}}
}

func (a *App) findResolvedLearning(message string) string {
	terms := strings.Fields(strings.ToLower(message))
	if len(terms) == 0 {
		return ""
	}
	for _, term := range terms {
		term = strings.Trim(term, ".,!?;:'\"()")
		if len([]rune(term)) < 4 {
			continue
		}
		var note string
		err := a.db.QueryRow(`SELECT resolution_notes FROM tickets WHERE status='RESOLVED' AND resolution_notes<>'' AND (lower(title) LIKE '%'||$1||'%' OR lower(description) LIKE '%'||$1||'%') ORDER BY updated_at DESC LIMIT 1`, term).Scan(&note)
		if err == nil {
			return note
		}
	}
	return ""
}

func (a *App) skillEnabled(id string) bool {
	var enabled bool
	err := a.db.QueryRow(`SELECT enabled FROM skills WHERE id=$1`, id).Scan(&enabled)
	return err == nil && enabled
}

// ------ Supplies only enabled skills as policy-subordinate agent context ------
func (a *App) enabledSkillContext() string {
	rows, err := a.db.Query(`SELECT name,description FROM skills WHERE enabled=true ORDER BY name LIMIT 10`)
	if err != nil {
		return ""
	}
	defer rows.Close()
	var items []string
	for rows.Next() {
		var name, description string
		if rows.Scan(&name, &description) == nil {
			items = append(items, fmt.Sprintf("- %s: %s", name, description))
		}
	}
	if len(items) == 0 {
		return ""
	}
	return "Skills operacionais ativas configuradas pela equipe Nexo (siga-as somente quando forem compatíveis com as políticas e permissões do sistema):\n" + strings.Join(items, "\n")
}

func (a *App) addSystemMessage(conversationID, content, actor, action string) {
	_, _ = a.db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions) VALUES($1,$2,'system',$3,now(),'[]'::jsonb)`, randomID("msg"), conversationID, content)
	_, _ = a.db.Exec(`UPDATE conversations SET updated_at=now() WHERE id=$1`, conversationID)
	_, _ = a.db.Exec(`INSERT INTO audit_events(id,conversation_id,actor_id,action,reason,confidence,created_at) VALUES($1,$2,$3,$4,$5,1,now())`, randomID("evt"), conversationID, actor, action, content)
}

func initializeDatabase(db *sql.DB) error {
	schema, err := os.ReadFile("../db/schema.sql")
	if err != nil {
		return err
	}
	_, err = db.Exec(string(schema))
	return err
}

func seedDatabase(db *sql.DB) error {
	// ------ Cria usuários de demonstração com senha somente em forma de hash ------
	users := []struct{ id, name, email, role, title, department string }{{"usr-ana", "Ana Souza", "ana@nexo.example", "customer", "Analista Financeira", "Operações"}, {"usr-marina", "Marina Costa", "marina@nexo.example", "customer", "Coordenadora", "Comercial"}, {"usr-lucas", "Lucas Almeida", "lucas@nexo.example", "customer", "Analista", "Produto"}, {"usr-carla", "Carla Mendes", "carla@nexo.example", "agent", "Analista de suporte", "Service Desk"}, {"usr-admin", "Admin Nexo", "admin@nexo.example", "admin", "Administradora", "TI"}}
	for _, u := range users {
		salt := "nexo-demo-salt-" + u.id
		_, err := db.Exec(`INSERT INTO users(id,name,email,role,title,department,password_salt,password_hash,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,now()) ON CONFLICT(email) DO NOTHING`, u.id, u.name, u.email, u.role, u.title, u.department, salt, sha256Hex(salt+"Nexo2026!"))
		if err != nil {
			return err
		}
	}
	articles := []struct{ id, title, category, excerpt, content string }{{"kb-vpn", "VPN com erro 809", "Rede e VPN", "Verifique internet, credenciais corporativas e tente conectar novamente.", "Verifique se há conexão com a internet e confirme que está usando as credenciais corporativas corretas. Tente estabelecer a conexão novamente. Se o erro persistir, informe o dispositivo e o horário da tentativa para abrir um chamado. Não compartilhe sua senha."}, {"kb-hours", "Horário do Service Desk", "Outros", "De segunda a sexta, das 8h às 18h. Casos críticos têm plantão 24 horas.", "O Service Desk atende de segunda a sexta-feira, das 8h às 18h. Chamados críticos contam com plantão 24 horas."}, {"kb-access", "Problemas de acesso a sistemas", "Acesso", "Identifique o sistema, a mensagem e se o acesso funcionava anteriormente.", "Informe o sistema afetado, a mensagem exibida e se o acesso funcionava antes. Não envie sua senha. Se houver bloqueio ou falta de permissão, o Service Desk pode verificar o acesso."}, {"kb-email", "E-mail não sincroniza", "E-mail", "Confirme a conexão e reinicie o aplicativo de e-mail.", "Verifique sua conexão com a internet, feche e reabra o aplicativo de e-mail e confirme se há espaço disponível na caixa postal. Se continuar sem sincronizar, abra um chamado com o horário e a mensagem apresentada."}, {"kb-wifi", "Wi-Fi corporativo", "Rede e VPN", "Desative e reative o Wi-Fi e reconecte à rede corporativa.", "Desative e reative o Wi-Fi e tente conectar novamente à rede corporativa. Se outros colegas também estiverem sem conexão, informe o impacto para que a prioridade seja avaliada."}, {"kb-software", "Instalação de software", "Software", "Solicitações de instalação são requisições e precisam de aprovação quando aplicável.", "Abra uma requisição informando o nome do software, a finalidade de uso e o dispositivo. O Service Desk verificará as licenças e aprovações necessárias."}, {"kb-slow", "Notebook lento", "Hardware", "Reinicie o notebook e informe desde quando percebeu a lentidão.", "Reinicie o notebook, feche aplicativos que não estiver usando e observe se a lentidão persiste. Informe quando começou e se ocorre em tarefas específicas."}}
	for _, x := range articles {
		_, err := db.Exec(`INSERT INTO knowledge_articles(id,title,category,excerpt,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`, x.id, x.title, x.category, x.excerpt, x.content)
		if err != nil {
			return err
		}
	}
	seeds := []Ticket{{ID: "INC-20311", OwnerID: "usr-ana", Title: "Notebook lento após atualização do Windows", Description: "O notebook ficou lento desde a atualização do Windows.", Type: "INC", Category: "Hardware", Priority: "Média", Status: "WAITING_ANALYST"}, {ID: "REQ-10442", OwnerID: "usr-ana", Title: "Segundo monitor para home office", Description: "Solicitação de monitor adicional.", Type: "REQ", Category: "Hardware", Priority: "Baixa", Status: "APPROVED"}, {ID: "INC-20150", OwnerID: "usr-ana", Title: "Senha do SAP bloqueada", Description: "Conta SAP bloqueada após tentativas de acesso.", Type: "INC", Category: "Acesso", Priority: "Média", Status: "RESOLVED"}, {ID: "INC-20770", OwnerID: "usr-marina", Title: "VPN não conecta no notebook", Description: "Erro 809 ao acessar a VPN.", Type: "INC", Category: "Rede e VPN", Priority: "Alta", Status: "OPEN"}, {ID: "REQ-10521", OwnerID: "usr-lucas", Title: "Acesso ao Figma corporativo", Description: "Solicitação de acesso para projeto de produto.", Type: "REQ", Category: "Acesso", Priority: "Baixa", Status: "OPEN"}, {ID: "INC-20980", OwnerID: "usr-marina", Title: "E-mail não sincroniza", Description: "Aplicativo parou de sincronizar nesta manhã.", Type: "INC", Category: "E-mail", Priority: "Média", Status: "OPEN"}, {ID: "INC-20090", OwnerID: "usr-lucas", Title: "Sistema de pedidos indisponível para equipe", Description: "Equipe inteira sem acesso à ferramenta de pedidos.", Type: "INC", Category: "Software", Priority: "Crítica", Status: "WAITING_ANALYST"}}
	resolutionNotes := map[string]string{"INC-20150": "A equipe de sistemas validou a identidade do colaborador e desbloqueou a conta SAP. Nunca solicitaram a senha."}
	for i, t := range seeds {
		daysOld := []int{6, 7, 4, 3, 2, 1, 1}[i]
		created := time.Now().UTC().Add(-time.Duration(daysOld) * 24 * time.Hour)
		due := slaDueAt(created, t.Priority)
		_, err := db.Exec(`INSERT INTO tickets(id,owner_id,title,description,type,category,priority,status,created_at,updated_at,due_at,resolution_notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11) ON CONFLICT(id) DO NOTHING`, t.ID, t.OwnerID, t.Title, t.Description, t.Type, t.Category, t.Priority, t.Status, created, due, resolutionNotes[t.ID])
		if err != nil {
			return err
		}
	}
	for _, s := range []struct{ id, name, description string }{{"skill-learning", "Aprender com resoluções", "Usa resoluções confirmadas por analistas como contexto de referência, sem alterar regras de segurança."}, {"skill-context", "Memória contextual", "Recupera o histórico da conversa e evita repetir perguntas já respondidas."}, {"skill-triage", "Triagem assistida", "Sugere categoria e prioridade com base no impacto e na urgência informados."}} {
		_, err := db.Exec(`INSERT INTO skills(id,name,description,enabled,updated_at) VALUES($1,$2,$3,true,now()) ON CONFLICT(id) DO NOTHING`, s.id, s.name, s.description)
		if err != nil {
			return err
		}
	}
	// ------ Uma conversa de exemplo aguardando atendimento para a equipe testar ------
	_, _ = db.Exec(`INSERT INTO conversations(id,owner_id,subject,category,status,updated_at,created_at,message_count,needs_attention,priority,ticket_id) VALUES('con-demo','usr-marina','Falha na VPN','Rede e VPN','WAITING_ANALYST',now()-interval '12 minutes',now()-interval '35 minutes',4,true,'Alta','INC-20770') ON CONFLICT(id) DO UPDATE SET ticket_id=COALESCE(conversations.ticket_id,'INC-20770')`)
	_, _ = db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at,decisions) VALUES('msg-demo-1','con-demo','assistant','Olá, Marina! Como posso ajudar com seu suporte de TI?',now()-interval '35 minutes','[]'::jsonb),('msg-demo-2','con-demo','user','A VPN mostra erro 809 desde hoje cedo.',now()-interval '30 minutes','[]'::jsonb),('msg-demo-3','con-demo','assistant','Consultei a orientação da central de ajuda e validei que o erro 809 está documentado. A falha persiste depois de conferir a internet?',now()-interval '28 minutes','[{"action":"knowledge_search","reason":"Encontrei procedimento documentado sobre VPN.","confidence":0.93}]'::jsonb),('msg-demo-4','con-demo','user','Sim, e outras pessoas da equipe também estão sem conexão.',now()-interval '12 minutes','[]'::jsonb) ON CONFLICT(id) DO NOTHING`)
	for _, ticket := range seeds {
		if ticket.ID == "INC-20770" {
			continue
		}
		conversationID := "con-ticket-" + strings.ToLower(ticket.ID)
		conversationStatus := "OPEN_AI"
		switch ticket.Status {
		case "WAITING_ANALYST":
			conversationStatus = "WAITING_ANALYST"
		case "IN_PROGRESS":
			conversationStatus = "IN_PROGRESS_HUMAN"
		case "RESOLVED", "APPROVED", "CLOSED":
			conversationStatus = "CLOSED"
		}
		_, _ = db.Exec(`INSERT INTO conversations(id,owner_id,subject,category,status,updated_at,created_at,message_count,priority,ticket_id) VALUES($1,$2,$3,$4,$5,now(),now(),1,$6,$7) ON CONFLICT(id) DO NOTHING`, conversationID, ticket.OwnerID, ticket.Title, ticket.Category, conversationStatus, ticket.Priority, ticket.ID)
		_, _ = db.Exec(`INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES($1,$2,'user',$3,now()) ON CONFLICT(id) DO NOTHING`, "msg-"+conversationID, conversationID, ticket.Description)
	}
	return nil
}

const ticketSelect = `SELECT t.id,t.owner_id,u.name,t.title,t.description,t.type,t.category,t.priority,t.status,t.updated_at,t.created_at,CASE WHEN now()>t.due_at THEN 'Vencido' ELSE 'Dentro do prazo' END,t.due_at,COALESCE((SELECT c.id FROM conversations c WHERE c.ticket_id=t.id ORDER BY c.updated_at DESC LIMIT 1),'') FROM tickets t JOIN users u ON u.id=t.owner_id`

type scanner interface{ Scan(...any) error }

func scanTicket(row scanner) (Ticket, error) {
	var t Ticket
	var conversationID sql.NullString
	err := row.Scan(&t.ID, &t.OwnerID, &t.OwnerName, &t.Title, &t.Description, &t.Type, &t.Category, &t.Priority, &t.Status, &t.UpdatedAt, &t.CreatedAt, &t.SLAStatus, &t.DueAt, &conversationID)
	if conversationID.Valid {
		t.ConversationID = conversationID.String
	}
	return t, err
}
func currentUser(r *http.Request) User { u, _ := r.Context().Value(userContextKey).(User); return u }
func withUser(r *http.Request, u User) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), userContextKey, u))
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, 400, "Corpo JSON inválido.")
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func intEnv(key string, fallback int) int {
	var value int
	if _, err := fmt.Sscanf(os.Getenv(key), "%d", &value); err == nil && value > 0 {
		return value
	}
	return fallback
}
func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func randomID(prefix string) string {
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return prefix + "-" + hex.EncodeToString(raw)
}
func ticketTypeLabel(kind string) string {
	if kind == "REQ" {
		return "requisição"
	}
	return "incidente"
}
func nullableID(t *Ticket) any {
	if t == nil {
		return nil
	}
	return t.ID
}
func nullableString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
func jsonString(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(raw)
}
func firstName(value string) string {
	parts := strings.Fields(value)
	if len(parts) == 0 {
		return value
	}
	return parts[0]
}
func firstWords(value string) string {
	parts := strings.Fields(strings.ToLower(value))
	if len(parts) > 3 {
		parts = parts[:3]
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, " ")
}
func containsAny(value string, terms ...string) bool {
	for _, term := range terms {
		if strings.Contains(value, term) {
			return true
		}
	}
	return false
}
func titleFrom(value string) string {
	title := strings.TrimSpace(value)
	if len([]rune(title)) > 72 {
		title = string([]rune(title)[:72])
	}
	if title == "" {
		return "Solicitação de suporte"
	}
	return strings.ToUpper(string([]rune(title)[:1])) + string([]rune(title)[1:])
}
func validTicket(t Ticket) bool {
	return t.Title != "" && t.Description != "" && (t.Type == "INC" || t.Type == "REQ") && t.Category != "" && t.Priority != "" && t.OwnerID != ""
}
func slaDueAt(start time.Time, priority string) time.Time {
	if priority == "Crítica" {
		return start.Add(time.Hour)
	}
	workHours := 24.0
	if priority == "Alta" {
		workHours = 4
	}
	if priority == "Baixa" {
		workHours = 40
	}
	location, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		location = time.Local
	}
	cursor := start.In(location)
	remaining := time.Duration(workHours * float64(time.Hour))
	for remaining > 0 {
		if cursor.Weekday() == time.Saturday {
			cursor = nextWorkday(cursor)
			continue
		}
		if cursor.Weekday() == time.Sunday {
			cursor = nextWorkday(cursor)
			continue
		}
		opening := time.Date(cursor.Year(), cursor.Month(), cursor.Day(), 8, 0, 0, 0, location)
		closing := time.Date(cursor.Year(), cursor.Month(), cursor.Day(), 18, 0, 0, 0, location)
		if cursor.Before(opening) {
			cursor = opening
		}
		if !cursor.Before(closing) {
			cursor = nextWorkday(cursor)
			continue
		}
		available := closing.Sub(cursor)
		if remaining <= available {
			return cursor.Add(remaining).UTC()
		}
		remaining -= available
		cursor = nextWorkday(cursor)
	}
	return cursor.UTC()
}
func nextWorkday(value time.Time) time.Time {
	next := time.Date(value.Year(), value.Month(), value.Day()+1, 8, 0, 0, 0, value.Location())
	for next.Weekday() == time.Saturday || next.Weekday() == time.Sunday {
		next = next.AddDate(0, 0, 1)
	}
	return next
}
