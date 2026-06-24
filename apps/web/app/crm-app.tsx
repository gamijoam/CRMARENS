"use client";

import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Inbox,
  Loader2,
  LogOut,
  MessageSquareText,
  Plus,
  Send,
  StickyNote,
  UsersRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "inbox" | "contacts" | "leads" | "tasks" | "notes";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

interface Contact {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  tags: string[];
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface Lead {
  id: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  value?: string;
  currency: string;
  status: "open" | "won" | "lost";
  contact: Contact;
  pipeline: Pipeline;
  stage: PipelineStage;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "open" | "done" | "canceled";
  dueAt?: string;
  contact?: Contact;
  lead?: Lead;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  contact?: Contact;
  lead?: Lead;
}

interface Conversation {
  id: string;
  contactId: string;
  channel: "whatsapp" | "instagram" | "messenger";
  status: "open" | "closed";
  assignedUserId?: string | null;
  lastMessageAt?: string;
  contact: Contact;
  messages?: Message[];
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  channel: string;
  text?: string;
  type: string;
  status: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

const navItems: Array<{ id: View; label: string; icon: typeof Inbox }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "contacts", label: "Contactos", icon: UsersRound },
  { id: "leads", label: "Leads", icon: BarChart3 },
  { id: "tasks", label: "Tareas", icon: ClipboardList },
  { id: "notes", label: "Notas", icon: StickyNote }
];

export function CrmApp() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("crm_token");
    const storedUser = window.localStorage.getItem("crm_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser) as SessionUser);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    void refreshData(token);
  }, [token]);

  useEffect(() => {
    if (!selectedConversationId || !token) {
      setMessages([]);
      return;
    }

    void api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token }).then(setMessages);
  }, [selectedConversationId, token]);

  const selectedConversation = conversations.find((item) => item.id === selectedConversationId);
  const openLeads = leads.filter((lead) => lead.status === "open");
  const openTasks = tasks.filter((task) => task.status === "open");
  const openConversations = conversations.filter((conversation) => conversation.status === "open");

  const pipelineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of openLeads) {
      counts.set(lead.stageId, (counts.get(lead.stageId) ?? 0) + 1);
    }
    return counts;
  }, [openLeads]);

  async function api<T>(path: string, options: RequestInit & { token?: string } = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(Array.isArray(error.message) ? error.message.join(", ") : error.message);
    }

    return response.json() as Promise<T>;
  }

  async function refreshData(activeToken = token) {
    setLoading(true);
    try {
      const [nextContacts, nextPipelines, nextLeads, nextTasks, nextNotes, nextConversations] =
        await Promise.all([
          api<Contact[]>("/contacts", { token: activeToken }),
          api<Pipeline[]>("/pipelines", { token: activeToken }),
          api<Lead[]>("/leads", { token: activeToken }),
          api<Task[]>("/tasks", { token: activeToken }),
          api<Note[]>("/notes", { token: activeToken }),
          api<Conversation[]>("/conversations", { token: activeToken })
        ]);

      setContacts(nextContacts);
      setPipelines(nextPipelines);
      setLeads(nextLeads);
      setTasks(nextTasks);
      setNotes(nextNotes);
      setConversations(nextConversations);
      if (!selectedConversationId && nextConversations[0]) {
        setSelectedConversationId(nextConversations[0].id);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar la data");
    } finally {
      setLoading(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setNotice("");

    try {
      const result = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });
      window.localStorage.setItem("crm_token", result.accessToken);
      window.localStorage.setItem("crm_user", JSON.stringify(result.user));
      setToken(result.accessToken);
      setUser(result.user);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("crm_token");
    window.localStorage.removeItem("crm_user");
    setToken("");
    setUser(null);
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/contacts", {
      fullName: form.get("fullName"),
      phone: form.get("phone") || undefined,
      email: form.get("email") || undefined,
      tags: String(form.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    });
    event.currentTarget.reset();
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/leads", {
      contactId: form.get("contactId"),
      pipelineId: form.get("pipelineId"),
      value: Number(form.get("value") || 0),
      currency: "USD"
    });
    event.currentTarget.reset();
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/tasks", {
      leadId: form.get("leadId") || undefined,
      contactId: form.get("contactId") || undefined,
      title: form.get("title"),
      dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : undefined,
      assignedUserId: user?.id
    });
    event.currentTarget.reset();
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/notes", {
      leadId: form.get("leadId") || undefined,
      contactId: form.get("contactId") || undefined,
      body: form.get("body")
    });
    event.currentTarget.reset();
  }

  async function submitConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/conversations", {
      contactId: form.get("contactId"),
      channel: form.get("channel"),
      assignedUserId: user?.id
    });
    event.currentTarget.reset();
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversationId) {
      setNotice("Selecciona una conversacion");
      return;
    }
    const form = new FormData(event.currentTarget);
    await mutate(`/conversations/${selectedConversationId}/messages`, {
      direction: "outbound",
      type: "text",
      text: form.get("text")
    });
    const nextMessages = await api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token });
    setMessages(nextMessages);
    event.currentTarget.reset();
  }

  async function mutate(path: string, body: unknown, method = "POST") {
    setNotice("");
    try {
      await api(path, {
        method,
        token,
        body: JSON.stringify(body)
      });
      await refreshData();
      setNotice("Cambios guardados");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar");
    }
  }

  async function completeTask(taskId: string) {
    await mutate(`/tasks/${taskId}/status`, { status: "done" }, "PATCH");
  }

  async function winLead(leadId: string) {
    await mutate(`/leads/${leadId}/status`, { status: "won" }, "PATCH");
  }

  async function closeConversation(conversationId: string) {
    await mutate(`/conversations/${conversationId}/close`, {}, "PATCH");
  }

  if (!token || !user) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div>
            <p className="eyebrow">CRM Omnicanal</p>
            <h1>Operacion comercial centralizada</h1>
            <p className="muted-text">
              Entra con la cuenta demo para gestionar contactos, leads, tareas e inbox.
            </p>
          </div>

          <form className="stack-form" onSubmit={login}>
            <label>
              Email
              <input name="email" type="email" defaultValue="admin@demo.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" defaultValue="admin1234" required />
            </label>
            <button className="primary-button" disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
              Entrar
            </button>
            {notice ? <p className="form-message">{notice}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand">
          <div className="brand-mark">CO</div>
          <div>
            <strong>CRM Omnicanal</strong>
            <span>{user.organizationName}</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>

        <button className="ghost-button" onClick={logout} type="button">
          <LogOut size={17} /> Salir
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP conectado</p>
            <h1>{titleForView(view)}</h1>
          </div>
          <button className="secondary-button" onClick={() => void refreshData()} type="button">
            {loading ? <Loader2 className="spin" size={18} /> : <CircleDot size={18} />}
            Actualizar
          </button>
        </header>

        {notice ? <p className="status-banner">{notice}</p> : null}

        <section className="metrics" aria-label="Metricas principales">
          <Metric label="Contactos" value={contacts.length} detail="Base comercial" />
          <Metric label="Leads abiertos" value={openLeads.length} detail="Pipeline activo" />
          <Metric label="Tareas abiertas" value={openTasks.length} detail="Seguimiento" />
          <Metric label="Chats abiertos" value={openConversations.length} detail="Inbox" />
        </section>

        {view === "contacts" ? (
          <ContactsView contacts={contacts} onSubmit={submitContact} />
        ) : null}

        {view === "leads" ? (
          <LeadsView
            contacts={contacts}
            leads={leads}
            pipelineCounts={pipelineCounts}
            pipelines={pipelines}
            onSubmit={submitLead}
            onWin={winLead}
          />
        ) : null}

        {view === "tasks" ? (
          <TasksView contacts={contacts} leads={leads} tasks={tasks} onComplete={completeTask} onSubmit={submitTask} />
        ) : null}

        {view === "notes" ? (
          <NotesView contacts={contacts} leads={leads} notes={notes} onSubmit={submitNote} />
        ) : null}

        {view === "inbox" ? (
          <InboxView
            contacts={contacts}
            conversations={conversations}
            messages={messages}
            selectedConversation={selectedConversation}
            selectedConversationId={selectedConversationId}
            onClose={closeConversation}
            onSelectConversation={setSelectedConversationId}
            onSubmitConversation={submitConversation}
            onSubmitMessage={submitMessage}
          />
        ) : null}
      </section>
    </main>
  );
}

function titleForView(view: View) {
  const titles: Record<View, string> = {
    inbox: "Inbox de conversaciones",
    contacts: "Contactos",
    leads: "Leads y pipeline",
    tasks: "Tareas",
    notes: "Notas internas"
  };
  return titles[view];
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ContactsView({ contacts, onSubmit }: { contacts: Contact[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="content-grid">
      <Panel title="Nuevo contacto" eyebrow="CRM">
        <form className="stack-form" onSubmit={onSubmit}>
          <input name="fullName" placeholder="Nombre completo" required />
          <input name="phone" placeholder="Telefono" />
          <input name="email" placeholder="Email" type="email" />
          <input name="tags" placeholder="Etiquetas separadas por coma" />
          <button className="primary-button"><Plus size={17} /> Crear contacto</button>
        </form>
      </Panel>
      <Panel title="Contactos recientes" eyebrow="Base">
        <DataList items={contacts} empty="Sin contactos">
          {(contact) => (
            <Row
              key={contact.id}
              title={contact.fullName}
              meta={[contact.phone, contact.email].filter(Boolean).join(" · ")}
              badge={contact.tags?.[0]}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function LeadsView({
  contacts,
  leads,
  pipelineCounts,
  pipelines,
  onSubmit,
  onWin
}: {
  contacts: Contact[];
  leads: Lead[];
  pipelineCounts: Map<string, number>;
  pipelines: Pipeline[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onWin: (leadId: string) => void;
}) {
  const pipeline = pipelines[0];
  return (
    <section className="content-grid">
      <Panel title="Nuevo lead" eyebrow="Ventas">
        <form className="stack-form" onSubmit={onSubmit}>
          <select name="contactId" required>
            <option value="">Selecciona contacto</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.fullName}</option>
            ))}
          </select>
          <select name="pipelineId" required>
            {pipelines.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <input name="value" min="0" placeholder="Valor estimado" type="number" />
          <button className="primary-button"><Plus size={17} /> Crear lead</button>
        </form>
      </Panel>

      <Panel title="Embudo" eyebrow="Pipeline">
        <div className="pipeline-list">
          {pipeline?.stages.map((stage) => (
            <div className="pipeline-row" key={stage.id}>
              <span>{stage.name}</span>
              <div className="bar-track">
                <div style={{ width: `${Math.min((pipelineCounts.get(stage.id) ?? 0) * 25, 100)}%` }} />
              </div>
              <strong>{pipelineCounts.get(stage.id) ?? 0}</strong>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="wide-panel" title="Leads recientes" eyebrow="Oportunidades">
        <DataList items={leads} empty="Sin leads">
          {(lead) => (
            <Row
              action={lead.status === "open" ? <button onClick={() => void onWin(lead.id)}>Ganar</button> : undefined}
              badge={lead.status}
              key={lead.id}
              meta={`${lead.pipeline.name} · ${lead.stage.name} · ${lead.currency} ${lead.value ?? 0}`}
              title={lead.contact.fullName}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function TasksView({
  contacts,
  leads,
  tasks,
  onComplete,
  onSubmit
}: {
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  onComplete: (taskId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="content-grid">
      <Panel title="Nueva tarea" eyebrow="Seguimiento">
        <form className="stack-form" onSubmit={onSubmit}>
          <input name="title" placeholder="Titulo" required />
          <select name="leadId">
            <option value="">Asociar a lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.contact.fullName}</option>
            ))}
          </select>
          <select name="contactId">
            <option value="">O asociar a contacto</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.fullName}</option>
            ))}
          </select>
          <input name="dueAt" type="datetime-local" />
          <button className="primary-button"><Plus size={17} /> Crear tarea</button>
        </form>
      </Panel>
      <Panel title="Tareas" eyebrow="Pendientes">
        <DataList items={tasks} empty="Sin tareas">
          {(task) => (
            <Row
              action={task.status === "open" ? <button onClick={() => void onComplete(task.id)}>Completar</button> : undefined}
              badge={task.status}
              key={task.id}
              meta={task.lead?.contact.fullName ?? task.contact?.fullName ?? "Sin asociado"}
              title={task.title}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function NotesView({
  contacts,
  leads,
  notes,
  onSubmit
}: {
  contacts: Contact[];
  leads: Lead[];
  notes: Note[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="content-grid">
      <Panel title="Nueva nota" eyebrow="Contexto">
        <form className="stack-form" onSubmit={onSubmit}>
          <textarea name="body" placeholder="Escribe una nota interna" required rows={4} />
          <select name="leadId">
            <option value="">Asociar a lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.contact.fullName}</option>
            ))}
          </select>
          <select name="contactId">
            <option value="">O asociar a contacto</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.fullName}</option>
            ))}
          </select>
          <button className="primary-button"><Plus size={17} /> Guardar nota</button>
        </form>
      </Panel>
      <Panel title="Notas recientes" eyebrow="Historial">
        <DataList items={notes} empty="Sin notas">
          {(note) => (
            <Row
              key={note.id}
              meta={note.lead?.contact.fullName ?? note.contact?.fullName ?? new Date(note.createdAt).toLocaleString()}
              title={note.body}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function InboxView({
  contacts,
  conversations,
  messages,
  selectedConversation,
  selectedConversationId,
  onClose,
  onSelectConversation,
  onSubmitConversation,
  onSubmitMessage
}: {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  selectedConversation?: Conversation;
  selectedConversationId: string;
  onClose: (conversationId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onSubmitConversation: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="inbox-layout">
      <Panel title="Nueva conversacion" eyebrow="Inbox">
        <form className="stack-form" onSubmit={onSubmitConversation}>
          <select name="contactId" required>
            <option value="">Selecciona contacto</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>{contact.fullName}</option>
            ))}
          </select>
          <select name="channel" required>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Messenger</option>
          </select>
          <button className="primary-button"><MessageSquareText size={17} /> Crear chat</button>
        </form>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              className={conversation.id === selectedConversationId ? "conversation-row active-row" : "conversation-row"}
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              type="button"
            >
              <span>
                <strong>{conversation.contact.fullName}</strong>
                <small>{conversation.channel} · {conversation.status}</small>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="chat-panel" title={selectedConversation?.contact.fullName ?? "Selecciona conversacion"} eyebrow="Mensajes">
        <div className="message-list">
          {messages.map((message) => (
            <article className={`message-bubble ${message.direction}`} key={message.id}>
              <p>{message.text}</p>
              <span>{message.status}</span>
            </article>
          ))}
          {!messages.length ? <p className="muted-text">Sin mensajes todavia.</p> : null}
        </div>
        <form className="message-form" onSubmit={onSubmitMessage}>
          <input name="text" placeholder="Escribe una respuesta" required />
          <button className="primary-button"><Send size={17} /></button>
        </form>
        {selectedConversation?.status === "open" ? (
          <button className="secondary-button" onClick={() => void onClose(selectedConversation.id)} type="button">
            Cerrar conversacion
          </button>
        ) : null}
      </Panel>
    </section>
  );
}

function Panel({
  children,
  className = "",
  eyebrow,
  title
}: {
  children: React.ReactNode;
  className?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function DataList<T>({
  children,
  empty,
  items
}: {
  children: (item: T) => React.ReactNode;
  empty: string;
  items: T[];
}) {
  if (!items.length) {
    return <p className="muted-text">{empty}</p>;
  }
  return <div className="data-list">{items.map(children)}</div>;
}

function Row({
  action,
  badge,
  meta,
  title
}: {
  action?: React.ReactNode;
  badge?: string;
  meta?: string;
  title: string;
}) {
  return (
    <article className="data-row">
      <div>
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      <div className="row-actions">
        {badge ? <small>{badge}</small> : null}
        {action}
      </div>
    </article>
  );
}
