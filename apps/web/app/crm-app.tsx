"use client";

import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  CornerDownLeft,
  Download,
  FileText,
  History,
  Cable,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Search,
  StickyNote,
  UserCheck,
  UserMinus,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "dashboard" | "inbox" | "contacts" | "leads" | "tasks" | "notes" | "team" | "channels" | "activity" | "reports";
type InboxFilter = "open" | "mine" | "unassigned" | "sla" | "closed";
type SlaState = "ok" | "warning" | "breached";

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
  channels?: Array<{
    channel: string;
    displayName?: string | null;
    externalId: string;
    username?: string | null;
  }>;
}

interface ContactImportRow {
  fullName: string;
  phone?: string;
  email?: string;
  tags: string[];
  issue?: string;
}

interface ContactImportResult {
  created: number;
  skipped: number;
  total: number;
  skippedRows: Array<{
    row: number;
    fullName: string;
    reason: string;
  }>;
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
  assignee?: TeamMember;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "open" | "done" | "canceled";
  dueAt?: string;
  contact?: Contact;
  lead?: Lead;
  assignee?: TeamMember;
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
  createdAt?: string;
  lastMessageAt?: string;
  contact: Contact;
  channelConnection?: Pick<ChannelConnection, "id" | "channel" | "name" | "status">;
  assignee?: TeamMember;
  messages?: Message[];
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  channel: string;
  rawPayload?: Record<string, unknown>;
  text?: string;
  type: string;
  status: string;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: string;
  organizations: Array<{
    role: "owner" | "admin" | "supervisor" | "seller";
    isActive: boolean;
  }>;
}

function playIncomingMessageSound(audioContextRef: { current: AudioContext | null }) {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const context = audioContextRef.current ?? new AudioContextConstructor();
  audioContextRef.current = context;

  if (context.state === "suspended") {
    void context.resume();
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(720, now);
  oscillator.frequency.exponentialRampToValueAtTime(920, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
}

interface ChannelConnection {
  id: string;
  channel: "whatsapp" | "instagram" | "messenger";
  config?: {
    accessTokenConfigured?: boolean;
    accessTokenPreview?: string;
    accessTokenUpdatedAt?: string;
    facebookHealth?: Record<string, unknown>;
    instagramHealth?: Record<string, unknown>;
    [key: string]: unknown;
  };
  name: string;
  externalAccountId?: string;
  status: "active" | "inactive";
  _count?: {
    conversations: number;
  };
}

interface InstagramSyncResult {
  error?: string;
  failed?: boolean;
  processed: number;
  skipped: number;
  syncedConversations: number;
  throttled?: boolean;
}

interface ChannelConnectionTestResult {
  error?: string;
  ok: boolean;
  pageName?: string;
  status: string;
}

interface GlobalSearchResults {
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  notes: Note[];
  conversations: Conversation[];
  total: number;
}

interface AuditLog {
  id: string;
  action: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
  actorUserId?: string;
  createdAt: string;
  entityId?: string;
  entityType: string;
  metadata?: Record<string, unknown>;
}

interface DashboardMetrics {
  summary: {
    activeConnections: number;
    contacts: number;
    dueTodayTasks: number;
    leads: number;
    lostLeads: number;
    openConversations: number;
    openLeads: number;
    openTasks: number;
    overdueTasks: number;
    slaBreachedConversations: number;
    slaOkConversations: number;
    slaRules: {
      breachHours: number;
      warningHours: number;
    };
    slaWarningConversations: number;
    teamMembers: number;
    unassignedConversations: number;
    wonLeads: number;
  };
  pipelineByStage: Array<{
    count: number;
    stageId: string;
    stageName: string;
    stagePosition: number;
    value: number;
  }>;
  conversationsByChannel: Array<{
    channel: string;
    count: number;
  }>;
  recentTasks: Array<{
    id: string;
    title: string;
    dueAt?: string;
    leadId?: string;
    assignee?: Pick<TeamMember, "id" | "name" | "email"> | null;
    contact?: Pick<Contact, "id" | "fullName"> | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    actorUserId?: string | null;
    createdAt: string;
    entityType: string;
  }>;
  workload: Array<{
    id: string;
    name: string;
    email: string;
    openConversations: number;
    openLeads: number;
    openTasks: number;
  }>;
}

interface OperationalNotification {
  body: string;
  count?: number;
  entityId?: string;
  entityType: string;
  id: string;
  priority: "urgent" | "attention" | "info";
  targetView: View;
  title: string;
}

interface AssignmentResult {
  assigned: number;
  pending: number;
  skipped: number;
  targets: number;
}

interface ReportSummary {
  period: {
    days: number;
    from: string;
    to: string;
  };
  summary: {
    activities: number;
    chatsBreachedSla: number;
    chatsClosed: number;
    chatsOpened: number;
    chatsWarningSla: number;
    leadsCreated: number;
    leadsLost: number;
    leadsOpen: number;
    leadsValue: number;
    leadsWon: number;
    tasksCompleted: number;
    tasksCreated: number;
    tasksOverdue: number;
  };
  activityByType: Array<{ count: number; name: string }>;
  activityByUser: Array<{
    activity: number;
    closedConversations: number;
    id: string;
    leadsWon: number;
    name: string;
  }>;
  conversationsByChannel: Array<{ channel: string; count: number }>;
  leadsByStatus: Array<{ count: number; name: string }>;
  topAssignees: Array<{
    conversations: number;
    id: string;
    leads: number;
    name: string;
    tasks: number;
  }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

const primaryNavItems: Array<{ id: View; label: string; icon: typeof Inbox }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "contacts", label: "Contactos", icon: UsersRound },
  { id: "leads", label: "Leads", icon: BarChart3 },
  { id: "tasks", label: "Tareas", icon: ClipboardList },
  { id: "notes", label: "Notas", icon: StickyNote }
];

const secondaryNavItems: Array<{ id: View; label: string; icon: typeof Inbox }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "channels", label: "Configuracion", icon: Cable },
  { id: "team", label: "Equipo", icon: ShieldCheck },
  { id: "activity", label: "Actividad", icon: History },
  { id: "reports", label: "Reportes", icon: FileText }
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [channelConnections, setChannelConnections] = useState<ChannelConnection[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reportDays, setReportDays] = useState(30);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [searchAssigneeId, setSearchAssigneeId] = useState("");
  const [searchChannel, setSearchChannel] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const latestConversationMessageRef = useRef<Record<string, string>>({});
  const latestMessageByConversationRef = useRef<Record<string, string>>({});

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

    void api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token })
      .then(setMessages)
      .catch(() => undefined);
  }, [selectedConversationId, token]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) {
      delete latestMessageByConversationRef.current[selectedConversationId];
      return;
    }

    const previousMessageId = latestMessageByConversationRef.current[selectedConversationId];
    latestMessageByConversationRef.current[selectedConversationId] = latestMessage.id;

    if (previousMessageId && previousMessageId !== latestMessage.id && latestMessage.direction === "inbound") {
      playIncomingMessageSound(audioContextRef);
    }
  }, [messages, selectedConversationId]);

  useEffect(() => {
    for (const conversation of conversations) {
      const latestMessage = conversation.messages?.[0];
      if (!latestMessage) {
        continue;
      }

      const previousMessageId = latestConversationMessageRef.current[conversation.id];
      latestConversationMessageRef.current[conversation.id] = latestMessage.id;

      if (
        previousMessageId &&
        previousMessageId !== latestMessage.id &&
        latestMessage.direction === "inbound" &&
        conversation.id !== selectedConversationId
      ) {
        playIncomingMessageSound(audioContextRef);
      }
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshData(token, { silent: true });
      if (selectedConversationId) {
        void api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token })
          .then(setMessages)
          .catch(() => undefined);
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [reportDays, selectedConversationId, token]);

  useEffect(() => {
    if (!token || view !== "inbox" || !["owner", "admin"].includes(user?.role ?? "")) {
      return;
    }

    const interval = window.setInterval(() => {
      void syncInstagramMessages({ silent: true });
    }, 120000);

    return () => window.clearInterval(interval);
  }, [selectedConversationId, token, user?.role, view]);

  useEffect(() => {
    if (!token || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void runGlobalSearch();
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchQuery, searchStatus, searchAssigneeId, searchChannel, token]);

  const selectedConversation = conversations.find((item) => item.id === selectedConversationId);
  const openLeads = leads.filter((lead) => lead.status === "open");
  const openTasks = tasks.filter((task) => task.status === "open");
  const openConversations = conversations.filter((conversation) => conversation.status === "open");
  const filteredConversations = conversations.filter((conversation) => {
    if (inboxFilter === "mine") {
      return conversation.status === "open" && conversation.assignedUserId === user?.id;
    }
    if (inboxFilter === "unassigned") {
      return conversation.status === "open" && !conversation.assignedUserId;
    }
    if (inboxFilter === "sla") {
      return conversation.status === "open" && conversationSla(conversation).state !== "ok";
    }
    return conversation.status === inboxFilter;
  });
  const selectedContactLeads = selectedConversation
    ? leads.filter((lead) => lead.contactId === selectedConversation.contactId)
    : [];
  const selectedContactLeadIds = new Set(selectedContactLeads.map((lead) => lead.id));
  const selectedContactTasks = selectedConversation
    ? tasks.filter(
        (task) =>
          task.contact?.id === selectedConversation.contactId ||
          (task.lead?.id ? selectedContactLeadIds.has(task.lead.id) : false)
      )
    : [];
  const selectedContactNotes = selectedConversation
    ? notes.filter(
        (note) =>
          note.contact?.id === selectedConversation.contactId ||
          (note.lead?.id ? selectedContactLeadIds.has(note.lead.id) : false)
      )
    : [];

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

  async function refreshData(activeToken = token, options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    try {
      const [
        nextContacts,
        nextPipelines,
        nextLeads,
        nextTasks,
        nextNotes,
        nextConversations,
        nextTeamMembers,
        nextChannelConnections,
        nextAuditLogs,
        nextDashboard,
        nextNotifications,
        nextReport
      ] =
        await Promise.all([
          api<Contact[]>("/contacts", { token: activeToken }),
          api<Pipeline[]>("/pipelines", { token: activeToken }),
          api<Lead[]>("/leads", { token: activeToken }),
          api<Task[]>("/tasks", { token: activeToken }),
          api<Note[]>("/notes", { token: activeToken }),
          api<Conversation[]>("/conversations", { token: activeToken }),
          api<TeamMember[]>("/users", { token: activeToken }),
          api<ChannelConnection[]>("/channel-connections", { token: activeToken }),
          api<AuditLog[]>("/audit-logs", { token: activeToken }),
          api<DashboardMetrics>("/dashboard", { token: activeToken }),
          api<OperationalNotification[]>("/notifications", { token: activeToken }),
          api<ReportSummary>(`/reports/summary?days=${reportDays}`, { token: activeToken })
        ]);

      setContacts(nextContacts);
      setPipelines(nextPipelines);
      setLeads(nextLeads);
      setTasks(nextTasks);
      setNotes(nextNotes);
      setConversations(nextConversations);
      setTeamMembers(nextTeamMembers);
      setChannelConnections(nextChannelConnections);
      setAuditLogs(nextAuditLogs);
      setDashboard(nextDashboard);
      setNotifications(nextNotifications);
      setReport(nextReport);
      if (!selectedConversationId && nextConversations[0]) {
        setSelectedConversationId(nextConversations[0].id);
      }
    } catch (error) {
      if (!options.silent) {
        setNotice(error instanceof Error ? error.message : "No se pudo cargar la data");
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function runGlobalSearch() {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (searchStatus) {
        params.set("status", searchStatus);
      }
      if (searchAssigneeId) {
        params.set("assignedUserId", searchAssigneeId);
      }
      if (searchChannel) {
        params.set("channel", searchChannel);
      }
      const result = await api<GlobalSearchResults>(`/search?${params.toString()}`, { token });
      setSearchResults(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo buscar");
    } finally {
      setSearching(false);
    }
  }

  function openSearchResult(viewTarget: View, conversationId?: string) {
    setView(viewTarget);
    if (conversationId) {
      setSelectedConversationId(conversationId);
    }
    setSearchResults(null);
  }

  function openNotification(notification: OperationalNotification) {
    setView(notification.targetView);
    if (notification.targetView === "inbox" && notification.entityId) {
      setSelectedConversationId(notification.entityId);
    }
    setNotificationsOpen(false);
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

  async function importContacts(rows: ContactImportRow[]) {
    setNotice("");
    try {
      const result = await api<ContactImportResult>("/contacts/import", {
        method: "POST",
        token,
        body: JSON.stringify({
          contacts: rows.map((row) => ({
            fullName: row.fullName,
            phone: row.phone || undefined,
            email: row.email || undefined,
            tags: row.tags
          }))
        })
      });
      await refreshData();
      setNotice(`Importacion lista: ${result.created} creados, ${result.skipped} omitidos`);
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo importar");
      return undefined;
    }
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/leads", {
      contactId: form.get("contactId"),
      pipelineId: form.get("pipelineId"),
      value: Number(form.get("value") || 0),
      currency: "USD",
      assignedUserId: form.get("assignedUserId") || undefined
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
      assignedUserId: form.get("assignedUserId") || user?.id
    });
    event.currentTarget.reset();
  }

  async function submitTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/users", {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      role: form.get("role")
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
    const selectedConnection = channelConnections.find((connection) => connection.id === form.get("channelConnectionId"));
    await mutate("/conversations", {
      contactId: form.get("contactId"),
      channel: selectedConnection?.channel ?? form.get("channel"),
      channelConnectionId: form.get("channelConnectionId") || undefined,
      assignedUserId: user?.id
    });
    event.currentTarget.reset();
  }

  async function submitChannelConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/channel-connections", {
      channel: form.get("channel"),
      name: form.get("name"),
      externalAccountId: form.get("externalAccountId") || undefined
    });
    event.currentTarget.reset();
  }

  async function submitChannelConnectionConfig(connectionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accessToken = String(form.get("accessToken") ?? "").trim();
    setNotice("");

    try {
      await api(`/channel-connections/${connectionId}/config`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          ...(accessToken ? { accessToken } : {}),
          externalAccountId: form.get("externalAccountId")
        })
      });
      const syncResult = await api<InstagramSyncResult>("/webhooks/meta/instagram/sync", {
        method: "POST",
        token,
        body: JSON.stringify({ force: true })
      });
      await refreshData();
      setNotice(
        syncResult.failed
          ? `Token guardado, pero Instagram no sincronizo: ${syncResult.error ?? "revisa el token"}`
          : `Token guardado. Sincronizacion: ${syncResult.syncedConversations} conversaciones, ${syncResult.processed} mensajes nuevos`
      );
      formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo sincronizar Instagram");
    }
  }

  async function syncInstagramMessages(options: { force?: boolean; silent?: boolean } = {}) {
    if (!token) {
      return undefined;
    }

    if (!options.silent) {
      setNotice("");
    }

    try {
      const syncResult = await api<InstagramSyncResult>("/webhooks/meta/instagram/sync", {
        method: "POST",
        token,
        body: JSON.stringify({ force: options.force === true })
      });
      await refreshData(token, { silent: options.silent });
      if (selectedConversationId) {
        const nextMessages = await api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token });
        setMessages(nextMessages);
      }

      if (!options.silent) {
        setNotice(
          syncResult.failed
            ? `Instagram no sincronizo: ${syncResult.error ?? "revisa el token"}`
            : syncResult.throttled
            ? "Sincronizacion omitida: Instagram se reviso hace unos segundos"
            : `Sincronizacion: ${syncResult.syncedConversations} conversaciones, ${syncResult.processed} mensajes nuevos`
        );
      }

      return syncResult;
    } catch (error) {
      if (!options.silent) {
        setNotice(error instanceof Error ? error.message : "No se pudo sincronizar Instagram");
      }
      return undefined;
    }
  }

  async function refreshWorkspace() {
    if (view === "inbox" && ["owner", "admin"].includes(user?.role ?? "")) {
      const syncResult = await syncInstagramMessages({ force: true });
      if (syncResult) {
        return;
      }
    }

    await refreshData();
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedConversationId) {
      setNotice("Selecciona una conversacion");
      return;
    }
    const form = new FormData(formElement);
    setNotice("");
    const savedMessage = await api<Message>(`/conversations/${selectedConversationId}/messages`, {
      method: "POST",
      token,
      body: JSON.stringify({
        direction: "outbound",
        type: "text",
        text: form.get("text")
      })
    });
    const nextMessages = await api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token });
    setMessages(nextMessages);
    if (savedMessage.status === "failed") {
      setNotice(providerErrorMessage(savedMessage.rawPayload) ?? "Meta rechazo el envio. Revisa permisos o ventana de respuesta.");
      return;
    }

    setNotice("Mensaje enviado");
    formElement.reset();
  }

  async function submitInboundMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedConversationId) {
      setNotice("Selecciona una conversacion");
      return;
    }
    const form = new FormData(formElement);
    await mutate(`/conversations/${selectedConversationId}/messages`, {
      direction: "inbound",
      type: "text",
      text: form.get("text"),
      rawPayload: { source: "manual-ui" }
    });
    const nextMessages = await api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token });
    setMessages(nextMessages);
    formElement.reset();
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

  async function assignConversationToMe(conversationId: string) {
    await mutate(`/conversations/${conversationId}/assign`, { assignedUserId: user?.id }, "PATCH");
  }

  async function unassignConversation(conversationId: string) {
    await mutate(`/conversations/${conversationId}/assign`, {}, "PATCH");
  }

  async function assignConversation(conversationId: string, assignedUserId: string) {
    await mutate(`/conversations/${conversationId}/assign`, assignedUserId ? { assignedUserId } : {}, "PATCH");
  }

  async function assignLead(leadId: string, assignedUserId: string) {
    await mutate(`/leads/${leadId}/assign`, assignedUserId ? { assignedUserId } : {}, "PATCH");
  }

  async function assignTask(taskId: string, assignedUserId: string) {
    await mutate(`/tasks/${taskId}/assign`, assignedUserId ? { assignedUserId } : {}, "PATCH");
  }

  async function autoAssignLeads() {
    await autoAssign("/assignments/leads/auto", "leads");
  }

  async function autoAssignConversations() {
    await autoAssign("/assignments/conversations/auto", "chats");
  }

  async function autoAssign(path: string, label: string) {
    setNotice("");
    try {
      const result = await api<AssignmentResult>(path, {
        method: "POST",
        token
      });
      await refreshData();
      setNotice(`Asignacion automatica: ${result.assigned} ${label} asignados a ${result.targets} responsables`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo asignar automaticamente");
    }
  }

  async function changeReportDays(days: number) {
    setReportDays(days);
    try {
      const nextReport = await api<ReportSummary>(`/reports/summary?days=${days}`, { token });
      setReport(nextReport);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar el reporte");
    }
  }

  function exportReportCsv() {
    if (!report) {
      return;
    }

    downloadCsv(`crm-report-${report.period.days}d.csv`, reportToCsv(report));
  }

  async function updateChannelConnectionStatus(connectionId: string, status: "active" | "inactive") {
    await mutate(`/channel-connections/${connectionId}/status`, { status }, "PATCH");
  }

  async function testChannelConnection(connectionId: string) {
    setNotice("");
    try {
      const result = await api<ChannelConnectionTestResult>(`/channel-connections/${connectionId}/test`, {
        method: "POST",
        token,
        body: JSON.stringify({})
      });
      await refreshData();
      setNotice(
        result.ok
          ? `Conexion verificada${result.pageName ? `: ${result.pageName}` : ""}`
          : `No se pudo verificar Instagram: ${result.error ?? result.status}`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo probar la conexion");
    }
  }

  async function retryMessage(messageId: string) {
    if (!selectedConversationId) {
      return;
    }

    setNotice("");
    try {
      const updatedMessage = await api<Message>(
        `/conversations/${selectedConversationId}/messages/${messageId}/retry`,
        {
          method: "POST",
          token,
          body: JSON.stringify({})
        }
      );
      const nextMessages = await api<Message[]>(`/conversations/${selectedConversationId}/messages`, { token });
      setMessages(nextMessages);
      await refreshData(token, { silent: true });
      setNotice(updatedMessage.status === "sent" ? "Mensaje reenviado" : "El reintento fallo, revisa el token/canal");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo reintentar el mensaje");
    }
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
          {primaryNavItems.map((item) => {
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

        <details className="nav-more" open={secondaryNavItems.some((item) => item.id === view)}>
          <summary>Mas modulos</summary>
          <nav className="nav-list nav-list-secondary">
            {secondaryNavItems.map((item) => {
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
        </details>

        <button className="ghost-button" onClick={logout} type="button">
          <LogOut size={17} /> Salir
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{titleForView(view)}</h1>
          </div>
          <div className="topbar-tools">
            <GlobalSearch
              assigneeId={searchAssigneeId}
              channel={searchChannel}
              members={teamMembers}
              query={searchQuery}
              results={searchResults}
              searching={searching}
              status={searchStatus}
              onAssigneeChange={setSearchAssigneeId}
              onChannelChange={setSearchChannel}
              onOpenResult={openSearchResult}
              onQueryChange={setSearchQuery}
              onStatusChange={setSearchStatus}
            />
            <NotificationCenter
              notifications={notifications}
              open={notificationsOpen}
              onOpenChange={setNotificationsOpen}
              onSelect={openNotification}
            />
            <button className="secondary-button" onClick={() => void refreshWorkspace()} type="button">
              {loading ? <Loader2 className="spin" size={18} /> : <CircleDot size={18} />}
              Actualizar
            </button>
          </div>
        </header>

        {notice ? <p className="status-banner">{notice}</p> : null}

        {view === "inbox" ? null : (
          <section className="metrics" aria-label="Metricas principales">
            <Metric label="Contactos" value={dashboard?.summary.contacts ?? contacts.length} detail="Base comercial" />
            <Metric label="Leads abiertos" value={dashboard?.summary.openLeads ?? openLeads.length} detail="Pipeline activo" />
            <Metric label="Tareas vencidas" value={dashboard?.summary.overdueTasks ?? 0} detail="Atencion requerida" />
            <Metric
              label="Chats abiertos"
              value={dashboard?.summary.openConversations ?? openConversations.length}
              detail="Inbox"
            />
          </section>
        )}

        {view === "dashboard" ? (
          <DashboardView
            currentUser={user}
            metrics={dashboard}
            members={teamMembers}
            onAutoAssignConversations={autoAssignConversations}
            onAutoAssignLeads={autoAssignLeads}
            onOpenView={setView}
          />
        ) : null}

        {view === "contacts" ? (
          <ContactsView contacts={contacts} onImport={importContacts} onSubmit={submitContact} />
        ) : null}

        {view === "leads" ? (
          <LeadsView
            contacts={contacts}
            leads={leads}
            pipelineCounts={pipelineCounts}
            pipelines={pipelines}
            teamMembers={teamMembers}
            onAssign={assignLead}
            onSubmit={submitLead}
            onWin={winLead}
          />
        ) : null}

        {view === "tasks" ? (
          <TasksView
            contacts={contacts}
            leads={leads}
            tasks={tasks}
            teamMembers={teamMembers}
            onAssign={assignTask}
            onComplete={completeTask}
            onSubmit={submitTask}
          />
        ) : null}

        {view === "notes" ? (
          <NotesView contacts={contacts} leads={leads} notes={notes} onSubmit={submitNote} />
        ) : null}

        {view === "channels" ? (
          <ChannelsView
            connections={channelConnections}
            currentUser={user}
            onSubmit={submitChannelConnection}
            onTestConnection={testChannelConnection}
            onUpdateConfig={submitChannelConnectionConfig}
            onUpdateStatus={updateChannelConnectionStatus}
          />
        ) : null}

        {view === "inbox" ? (
          <InboxView
            channelConnections={channelConnections.filter((connection) => connection.status === "active")}
            contacts={contacts}
            conversations={filteredConversations}
            filter={inboxFilter}
            leads={selectedContactLeads}
            messages={messages}
            notes={selectedContactNotes}
            selectedConversation={selectedConversation}
            selectedConversationId={selectedConversationId}
            tasks={selectedContactTasks}
            teamMembers={teamMembers}
            user={user}
            onAssign={assignConversation}
            onAssignToMe={assignConversationToMe}
            onClose={closeConversation}
            onFilterChange={setInboxFilter}
            onSelectConversation={setSelectedConversationId}
            onSubmitConversation={submitConversation}
            onSubmitInboundMessage={submitInboundMessage}
            onSubmitMessage={submitMessage}
            onRetryMessage={retryMessage}
            onUnassign={unassignConversation}
          />
        ) : null}

        {view === "team" ? (
          <TeamView currentUser={user} members={teamMembers} onSubmit={submitTeamMember} />
        ) : null}

        {view === "activity" ? (
          <ActivityView logs={auditLogs} members={teamMembers} />
        ) : null}

        {view === "reports" ? (
          <ReportsView
            days={reportDays}
            report={report}
            onDaysChange={changeReportDays}
            onExport={exportReportCsv}
          />
        ) : null}
      </section>
    </main>
  );
}

function titleForView(view: View) {
  const titles: Record<View, string> = {
    dashboard: "Dashboard",
    inbox: "Inbox",
    contacts: "Contactos",
    leads: "Leads y pipeline",
    tasks: "Tareas",
    notes: "Notas internas",
    team: "Equipo y permisos",
    channels: "Configuracion",
    activity: "Actividad",
    reports: "Reportes"
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

function NotificationCenter({
  notifications,
  onOpenChange,
  onSelect,
  open
}: {
  notifications: OperationalNotification[];
  onOpenChange: (open: boolean) => void;
  onSelect: (notification: OperationalNotification) => void;
  open: boolean;
}) {
  const urgentCount = notifications.filter((notification) => notification.priority === "urgent").length;
  const badgeCount = notifications.length > 9 ? "9+" : notifications.length;

  return (
    <div className="notification-center">
      <button
        aria-expanded={open}
        aria-label="Notificaciones"
        className={`icon-button notification-trigger ${urgentCount ? "has-urgent" : ""}`}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <Bell size={18} />
        {notifications.length ? <span>{badgeCount}</span> : null}
      </button>

      {open ? (
        <section className="notification-panel" aria-label="Notificaciones operativas">
          <header>
            <div>
              <strong>Notificaciones</strong>
              <small>{notifications.length ? `${notifications.length} pendientes` : "Sin pendientes"}</small>
            </div>
            <button aria-label="Cerrar notificaciones" onClick={() => onOpenChange(false)} type="button">
              <X size={16} />
            </button>
          </header>

          <div className="notification-list">
            {notifications.length ? (
              notifications.map((notification) => (
                <button
                  className={`notification-item ${notification.priority}`}
                  key={notification.id}
                  onClick={() => onSelect(notification)}
                  type="button"
                >
                  <span>{priorityLabel(notification.priority)}</span>
                  <strong>
                    {notification.title}
                    {notification.count ? ` (${notification.count})` : ""}
                  </strong>
                  <small>{notification.body}</small>
                </button>
              ))
            ) : (
              <p className="muted-text">Todo esta en orden por ahora.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DashboardView({
  currentUser,
  members,
  metrics,
  onAutoAssignConversations,
  onAutoAssignLeads,
  onOpenView
}: {
  currentUser: SessionUser;
  members: TeamMember[];
  metrics: DashboardMetrics | null;
  onAutoAssignConversations: () => void;
  onAutoAssignLeads: () => void;
  onOpenView: (view: View) => void;
}) {
  const summary = metrics?.summary;
  const canAutoAssign = ["owner", "admin", "supervisor"].includes(currentUser.role);
  const maxStageCount = Math.max(...(metrics?.pipelineByStage.map((stage) => stage.count) ?? [0]), 1);
  const maxWorkload = Math.max(
    ...(metrics?.workload.map((member) => member.openConversations + member.openLeads + member.openTasks) ?? [0]),
    1
  );

  if (!metrics) {
    return (
      <section className="dashboard-grid">
        <Panel eyebrow="Dashboard" title="Cargando metricas" className="wide-panel">
          <p className="muted-text">Preparando los indicadores operativos.</p>
        </Panel>
      </section>
    );
  }

  return (
    <section className="dashboard-grid">
      <Panel eyebrow="Resumen" title="Pulso comercial" className="dashboard-summary-panel">
        <div className="dashboard-summary">
          <button onClick={() => onOpenView("leads")} type="button">
            <BarChart3 size={18} />
            <span>Leads ganados</span>
            <strong>{summary?.wonLeads ?? 0}</strong>
            <small>{summary?.lostLeads ?? 0} perdidos</small>
          </button>
          <button onClick={() => onOpenView("tasks")} type="button">
            <AlertTriangle size={18} />
            <span>Vencidas</span>
            <strong>{summary?.overdueTasks ?? 0}</strong>
            <small>{summary?.dueTodayTasks ?? 0} vencen hoy</small>
          </button>
          <button onClick={() => onOpenView("inbox")} type="button">
            <MessageSquareText size={18} />
            <span>Sin asignar</span>
            <strong>{summary?.unassignedConversations ?? 0}</strong>
            <small>{summary?.openConversations ?? 0} chats abiertos</small>
          </button>
          <button onClick={() => onOpenView("inbox")} type="button">
            <AlertTriangle size={18} />
            <span>SLA vencido</span>
            <strong>{summary?.slaBreachedConversations ?? 0}</strong>
            <small>{summary?.slaWarningConversations ?? 0} en riesgo</small>
          </button>
          <button onClick={() => onOpenView("channels")} type="button">
            <Cable size={18} />
            <span>Canales activos</span>
            <strong>{summary?.activeConnections ?? 0}</strong>
            <small>{summary?.teamMembers ?? 0} usuarios activos</small>
          </button>
        </div>
      </Panel>

      {canAutoAssign ? (
        <Panel eyebrow="Automatizacion" title="Asignacion rapida" className="dashboard-actions-panel">
          <div className="automation-actions">
            <button className="secondary-button" onClick={() => onAutoAssignLeads()} type="button">
              <UserCheck size={17} /> Repartir leads libres
            </button>
            <button className="secondary-button" onClick={() => onAutoAssignConversations()} type="button">
              <MessageSquareText size={17} /> Repartir chats libres
            </button>
          </div>
          <p className="muted-text">
            Se asigna primero al responsable con menor carga activa para mantener el equipo balanceado.
          </p>
        </Panel>
      ) : null}

      <Panel eyebrow="SLA" title="Atencion de conversaciones" className="dashboard-actions-panel">
        <div className="sla-summary">
          <article className="ok">
            <span>En tiempo</span>
            <strong>{summary?.slaOkConversations ?? 0}</strong>
          </article>
          <article className="warning">
            <span>En riesgo</span>
            <strong>{summary?.slaWarningConversations ?? 0}</strong>
          </article>
          <article className="breached">
            <span>Vencidas</span>
            <strong>{summary?.slaBreachedConversations ?? 0}</strong>
          </article>
        </div>
        <p className="muted-text">
          Riesgo despues de {summary?.slaRules.warningHours ?? 2}h y vencido despues de {summary?.slaRules.breachHours ?? 4}h sin actividad.
        </p>
      </Panel>

      <Panel eyebrow="Pipeline" title="Leads abiertos por etapa">
        <div className="dashboard-bars">
          {metrics.pipelineByStage.length ? (
            metrics.pipelineByStage.map((stage) => (
              <article key={stage.stageId}>
                <div>
                  <strong>{stage.stageName}</strong>
                  <span>{stage.count} leads / {formatMoney(stage.value)}</span>
                </div>
                <div className="bar-track">
                  <div style={{ width: `${Math.max(8, (stage.count / maxStageCount) * 100)}%` }} />
                </div>
              </article>
            ))
          ) : (
            <p className="muted-text">No hay leads abiertos.</p>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Inbox" title="Conversaciones por canal">
        <div className="channel-mix">
          {metrics.conversationsByChannel.length ? (
            metrics.conversationsByChannel.map((item) => (
              <article key={item.channel}>
                <span>{channelLabel(item.channel)}</span>
                <strong>{item.count}</strong>
              </article>
            ))
          ) : (
            <p className="muted-text">No hay conversaciones abiertas.</p>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Seguimiento" title="Tareas criticas">
        <div className="dashboard-list">
          {metrics.recentTasks.length ? (
            metrics.recentTasks.map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.contact?.fullName ?? "Sin contacto"} / {task.assignee?.name ?? "Sin responsable"}</span>
                </div>
                <small>{formatDate(task.dueAt)}</small>
              </article>
            ))
          ) : (
            <p className="muted-text">No hay tareas abiertas.</p>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Equipo" title="Carga operativa">
        <div className="workload-list">
          {metrics.workload.length ? (
            metrics.workload.map((member) => {
              const total = member.openConversations + member.openLeads + member.openTasks;
              return (
                <article key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.openLeads} leads / {member.openTasks} tareas / {member.openConversations} chats</span>
                  </div>
                  <div className="bar-track">
                    <div style={{ width: `${Math.max(8, (total / maxWorkload) * 100)}%` }} />
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted-text">No hay usuarios activos.</p>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Actividad" title="Ultimos movimientos">
        <div className="dashboard-list">
          {metrics.recentActivity.length ? (
            metrics.recentActivity.map((log) => {
              const actor = members.find((member) => member.id === log.actorUserId);
              return (
                <article key={log.id}>
                  <div>
                    <strong>{actionLabel(log.action)}</strong>
                    <span>{entityLabel(log.entityType)} / {actor?.name ?? "Sistema"}</span>
                  </div>
                  <small>{formatDate(log.createdAt)}</small>
                </article>
              );
            })
          ) : (
            <p className="muted-text">Sin actividad reciente.</p>
          )}
        </div>
      </Panel>
    </section>
  );
}

function GlobalSearch({
  assigneeId,
  channel,
  members,
  query,
  results,
  searching,
  status,
  onAssigneeChange,
  onChannelChange,
  onOpenResult,
  onQueryChange,
  onStatusChange
}: {
  assigneeId: string;
  channel: string;
  members: TeamMember[];
  query: string;
  results: GlobalSearchResults | null;
  searching: boolean;
  status: string;
  onAssigneeChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onOpenResult: (view: View, conversationId?: string) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  const hasResults = Boolean(results && results.total > 0);

  return (
    <div className="global-search">
      <label className="search-box">
        <Search size={17} />
        <input
          aria-label="Buscar en CRM"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Buscar contactos, chats, tareas..."
          value={query}
        />
        {searching ? <Loader2 className="spin" size={16} /> : null}
      </label>
      <div className="search-filters">
        <select aria-label="Estado" onChange={(event) => onStatusChange(event.currentTarget.value)} value={status}>
          <option value="">Estado</option>
          <option value="open">Abierto</option>
          <option value="closed">Cerrado</option>
          <option value="done">Completado</option>
          <option value="won">Ganado</option>
          <option value="lost">Perdido</option>
        </select>
        <select aria-label="Responsable" onChange={(event) => onAssigneeChange(event.currentTarget.value)} value={assigneeId}>
          <option value="">Responsable</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
        <select aria-label="Canal" onChange={(event) => onChannelChange(event.currentTarget.value)} value={channel}>
          <option value="">Canal</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="messenger">Messenger</option>
        </select>
      </div>
      {results ? (
        <div className="search-results">
          {hasResults ? (
            <>
              <SearchGroup title="Contactos" view="contacts" items={results.contacts} onOpenResult={onOpenResult}>
                {(contact) => ({
                  key: contact.id,
                  title: contact.fullName,
                  meta: [contact.phone, contact.email].filter(Boolean).join(" / ")
                })}
              </SearchGroup>
              <SearchGroup title="Leads" view="leads" items={results.leads} onOpenResult={onOpenResult}>
                {(lead) => ({
                  key: lead.id,
                  title: lead.contact.fullName,
                  meta: `${lead.pipeline.name} / ${lead.stage.name} / ${lead.status}`
                })}
              </SearchGroup>
              <SearchGroup title="Tareas" view="tasks" items={results.tasks} onOpenResult={onOpenResult}>
                {(task) => ({
                  key: task.id,
                  title: task.title,
                  meta: task.lead?.contact.fullName ?? task.contact?.fullName ?? task.status
                })}
              </SearchGroup>
              <SearchGroup title="Notas" view="notes" items={results.notes} onOpenResult={onOpenResult}>
                {(note) => ({
                  key: note.id,
                  title: note.body,
                  meta: note.lead?.contact.fullName ?? note.contact?.fullName ?? "Nota interna"
                })}
              </SearchGroup>
              <SearchGroup title="Conversaciones" view="inbox" items={results.conversations} onOpenResult={onOpenResult}>
                {(conversation) => ({
                  key: conversation.id,
                  title: contactDisplayName(conversation.contact, conversation.channel),
                  meta: `${channelLabel(conversation.channel)} / ${conversation.status}`,
                  conversationId: conversation.id
                })}
              </SearchGroup>
            </>
          ) : (
            <p className="muted-text">Sin resultados para esta busqueda.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SearchGroup<T>({
  children,
  items,
  onOpenResult,
  title,
  view
}: {
  children: (item: T) => { key: string; title: string; meta?: string; conversationId?: string };
  items: T[];
  onOpenResult: (view: View, conversationId?: string) => void;
  title: string;
  view: View;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section>
      <h3>{title}</h3>
      {items.map((item) => {
        const result = children(item);
        return (
          <button key={result.key} onClick={() => onOpenResult(view, result.conversationId)} type="button">
            <strong>{result.title}</strong>
            {result.meta ? <span>{result.meta}</span> : null}
          </button>
        );
      })}
    </section>
  );
}

function ContactsView({
  contacts,
  onImport,
  onSubmit
}: {
  contacts: Contact[];
  onImport: (rows: ContactImportRow[]) => Promise<ContactImportResult | undefined>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [csvText, setCsvText] = useState("fullName,phone,email,tags\nCliente Ejemplo,+584120000000,cliente@example.com,\"prospecto,whatsapp\"");
  const [previewRows, setPreviewRows] = useState<ContactImportRow[]>([]);
  const [importResult, setImportResult] = useState<ContactImportResult | undefined>();
  const validRows = previewRows.filter((row) => !row.issue);

  function previewCsv(text = csvText) {
    setImportResult(undefined);
    setPreviewRows(parseContactsCsv(text, contacts));
  }

  async function importPreviewRows() {
    const result = await onImport(validRows);
    setImportResult(result);
    if (result) {
      setPreviewRows([]);
    }
  }

  async function loadCsvFile(file?: File) {
    if (!file) {
      return;
    }
    const text = await file.text();
    setCsvText(text);
    previewCsv(text);
  }

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
      <Panel title="Importar CSV" eyebrow="Carga masiva">
        <div className="import-tools">
          <input
            accept=".csv,text/csv"
            aria-label="Seleccionar archivo CSV"
            onChange={(event) => void loadCsvFile(event.currentTarget.files?.[0])}
            type="file"
          />
          <textarea
            onChange={(event) => setCsvText(event.currentTarget.value)}
            rows={6}
            value={csvText}
          />
          <div className="row-actions import-actions">
            <button className="secondary-button" onClick={() => previewCsv()} type="button">
              Previsualizar
            </button>
            <button className="primary-button" disabled={!validRows.length} onClick={() => void importPreviewRows()} type="button">
              Importar {validRows.length || ""}
            </button>
          </div>
        </div>
        {previewRows.length ? (
          <div className="import-preview">
            {previewRows.slice(0, 8).map((row, index) => (
              <article className={row.issue ? "import-row invalid" : "import-row"} key={`${row.email}-${row.phone}-${index}`}>
                <strong>{row.fullName || "Sin nombre"}</strong>
                <span>{[row.phone, row.email, row.tags.join(", ")].filter(Boolean).join(" / ")}</span>
                {row.issue ? <small>{row.issue}</small> : <small>Listo</small>}
              </article>
            ))}
          </div>
        ) : null}
        {importResult ? (
          <p className="muted-text">
            Creados: {importResult.created} / Omitidos: {importResult.skipped} / Total: {importResult.total}
          </p>
        ) : null}
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

function parseContactsCsv(csvText: string, existingContacts: Contact[]) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const [headerLine, ...dataLines] = lines;
  const headers = splitCsvLine(headerLine).map((header) => normalizeHeader(header));
  const emailIndex = headers.indexOf("email");
  const nameIndex = headers.findIndex((header) => ["fullname", "name", "nombre"].includes(header));
  const phoneIndex = headers.findIndex((header) => ["phone", "telefono", "tel"].includes(header));
  const tagsIndex = headers.findIndex((header) => ["tags", "etiquetas"].includes(header));
  const existingEmails = new Set(existingContacts.map((contact) => contact.email?.toLowerCase()).filter(Boolean));
  const existingPhones = new Set(existingContacts.map((contact) => contact.phone).filter(Boolean));
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  return dataLines.map((line) => {
    const columns = splitCsvLine(line);
    const email = emailIndex >= 0 ? columns[emailIndex]?.trim().toLowerCase() : undefined;
    const phone = phoneIndex >= 0 ? columns[phoneIndex]?.trim() : undefined;
    const fullName = nameIndex >= 0 ? columns[nameIndex]?.trim() : "";
    const tags = tagsIndex >= 0 ? splitTags(columns[tagsIndex]) : [];
    let issue: string | undefined;

    if (!fullName || fullName.length < 2) {
      issue = "Nombre requerido";
    } else if (email && existingEmails.has(email)) {
      issue = "Email ya existe";
    } else if (phone && existingPhones.has(phone)) {
      issue = "Telefono ya existe";
    } else if (email && seenEmails.has(email)) {
      issue = "Email duplicado en CSV";
    } else if (phone && seenPhones.has(phone)) {
      issue = "Telefono duplicado en CSV";
    }

    if (email) {
      seenEmails.add(email);
    }
    if (phone) {
      seenPhones.add(phone);
    }

    return { fullName, phone, email, tags, issue };
  });
}

function splitCsvLine(line: string) {
  const columns: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      columns.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  columns.push(current);
  return columns;
}

function splitTags(value?: string) {
  return String(value ?? "")
    .split(/[|;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function LeadsView({
  contacts,
  leads,
  pipelineCounts,
  pipelines,
  teamMembers,
  onAssign,
  onSubmit,
  onWin
}: {
  contacts: Contact[];
  leads: Lead[];
  pipelineCounts: Map<string, number>;
  pipelines: Pipeline[];
  teamMembers: TeamMember[];
  onAssign: (leadId: string, assignedUserId: string) => void;
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
          <select name="assignedUserId">
            <option value="">Responsable</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
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
              action={
                <>
                  <AssigneeSelect
                    assignedUserId={lead.assignee?.id}
                    members={teamMembers}
                    onChange={(assignedUserId) => void onAssign(lead.id, assignedUserId)}
                  />
                  {lead.status === "open" ? <button onClick={() => void onWin(lead.id)}>Ganar</button> : null}
                </>
              }
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
  teamMembers,
  onAssign,
  onComplete,
  onSubmit
}: {
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  teamMembers: TeamMember[];
  onAssign: (taskId: string, assignedUserId: string) => void;
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
          <select name="assignedUserId">
            <option value="">Responsable</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          <button className="primary-button"><Plus size={17} /> Crear tarea</button>
        </form>
      </Panel>
      <Panel title="Tareas" eyebrow="Pendientes">
        <DataList items={tasks} empty="Sin tareas">
          {(task) => (
            <Row
              action={
                <>
                  <AssigneeSelect
                    assignedUserId={task.assignee?.id}
                    members={teamMembers}
                    onChange={(assignedUserId) => void onAssign(task.id, assignedUserId)}
                  />
                  {task.status === "open" ? <button onClick={() => void onComplete(task.id)}>Completar</button> : null}
                </>
              }
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
              meta={note.lead?.contact?.fullName ?? note.contact?.fullName ?? new Date(note.createdAt).toLocaleString()}
              title={note.body}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function ChannelsView({
  connections,
  currentUser,
  onSubmit,
  onTestConnection,
  onUpdateConfig,
  onUpdateStatus
}: {
  connections: ChannelConnection[];
  currentUser: SessionUser;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTestConnection: (connectionId: string) => void;
  onUpdateConfig: (connectionId: string, event: FormEvent<HTMLFormElement>) => void;
  onUpdateStatus: (connectionId: string, status: "active" | "inactive") => void;
}) {
  const canManage = ["owner", "admin"].includes(currentUser.role);
  const metaConnections = connections.filter((connection) => ["instagram", "messenger"].includes(connection.channel));
  const channelTotals = connections.reduce<Record<string, number>>((totals, connection) => {
    totals[connection.channel] = (totals[connection.channel] ?? 0) + 1;
    return totals;
  }, {});

  return (
    <section className="content-grid">
      <Panel title="Nueva conexion" eyebrow="Canales">
        {canManage ? (
          <form className="stack-form" onSubmit={onSubmit}>
            <select name="channel" required>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="messenger">Messenger</option>
            </select>
            <input name="name" placeholder="Nombre interno" required />
            <input name="externalAccountId" placeholder="ID externo simulado" />
            <button className="primary-button"><Cable size={17} /> Crear conexion</button>
          </form>
        ) : (
          <p className="muted-text">Tu rol puede ver conexiones, pero no modificarlas.</p>
        )}
      </Panel>

      <Panel title="Resumen" eyebrow="Omnicanal">
        <div className="channel-summary">
          {(["whatsapp", "instagram", "messenger"] as const).map((channel) => (
            <article key={channel}>
              <strong>{channelLabel(channel)}</strong>
              <span>{channelTotals[channel] ?? 0} conexiones</span>
            </article>
          ))}
        </div>
      </Panel>

      {canManage ? (
        <Panel className="wide-panel" title="Tokens Meta" eyebrow="Admin">
          <div className="settings-list">
            {metaConnections.map((connection) => (
              <form
                className="settings-card"
                key={connection.id}
                onSubmit={(event) => onUpdateConfig(connection.id, event)}
              >
                <div>
                  <strong>{connection.name}</strong>
                  <span className="muted-text">
                    {connection.config?.accessTokenConfigured
                      ? `Token guardado ${connection.config.accessTokenPreview ?? ""}`
                      : "Sin token guardado"}
                  </span>
                  <InstagramHealthPanel
                    health={
                      connection.channel === "messenger"
                        ? connection.config?.facebookHealth
                        : connection.config?.instagramHealth
                    }
                  />
                </div>
                <input
                  name="externalAccountId"
                  placeholder={connection.channel === "messenger" ? "Page ID de Facebook" : "ID cuenta Instagram / Page ID"}
                  defaultValue={connection.externalAccountId ?? ""}
                />
                <input
                  autoComplete="off"
                  name="accessToken"
                  placeholder={`Pega aqui el Page Access Token de ${channelLabel(connection.channel)}`}
                  type="password"
                />
                <button className="primary-button" type="submit">
                  <CheckCircle2 size={17} /> Guardar token
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onTestConnection(connection.id)}
                  type="button"
                >
                  <CircleDot size={17} /> Probar conexion
                </button>
              </form>
            ))}
            {!metaConnections.length ? (
              <p className="muted-text">Crea una conexion de Instagram o Messenger para guardar el token.</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <Panel className="wide-panel" title="Conexiones" eyebrow="Empresa">
        <DataList items={connections} empty="Sin conexiones">
          {(connection) => (
            <Row
              action={
                canManage ? (
                  <button
                    onClick={() =>
                      void onUpdateStatus(connection.id, connection.status === "active" ? "inactive" : "active")
                    }
                    type="button"
                  >
                    {connection.status === "active" ? "Desactivar" : "Activar"}
                  </button>
                ) : undefined
              }
              badge={connection.status}
              key={connection.id}
              meta={`${channelLabel(connection.channel)} / ${connection.externalAccountId ?? "sin ID"} / ${connection._count?.conversations ?? 0} chats`}
              title={connection.name}
            />
          )}
        </DataList>
      </Panel>
    </section>
  );
}

function TeamView({
  currentUser,
  members,
  onSubmit
}: {
  currentUser: SessionUser;
  members: TeamMember[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const canCreate = ["owner", "admin"].includes(currentUser.role);

  return (
    <section className="content-grid">
      <Panel title="Nuevo miembro" eyebrow="Permisos">
        {canCreate ? (
          <form className="stack-form" onSubmit={onSubmit}>
            <input name="name" placeholder="Nombre" required />
            <input name="email" placeholder="Email" required type="email" />
            <input name="password" minLength={8} placeholder="Password temporal" required type="password" />
            <select name="role" required>
              <option value="seller">Vendedor</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button className="primary-button"><UserPlus size={17} /> Crear usuario</button>
          </form>
        ) : (
          <p className="muted-text">Tu rol actual puede ver el equipo, pero no crear usuarios.</p>
        )}
      </Panel>

      <Panel title="Miembros activos" eyebrow="Organizacion">
        <DataList items={members} empty="Sin usuarios">
          {(member) => {
            const membership = member.organizations[0];
            return (
              <Row
                badge={roleLabel(membership?.role)}
                key={member.id}
                meta={`${member.email} / ${member.status}`}
                title={member.name}
              />
            );
          }}
        </DataList>
      </Panel>
    </section>
  );
}

function ActivityView({ logs, members }: { logs: AuditLog[]; members: TeamMember[] }) {
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const actions = [...new Set(logs.map((log) => log.action))].sort();
  const entityTypes = [...new Set(logs.map((log) => log.entityType))].sort();
  const filteredLogs = logs.filter(
    (log) =>
      (!entityType || log.entityType === entityType) &&
      (!actorUserId || log.actorUserId === actorUserId) &&
      (!action || log.action === action)
  );

  return (
    <section className="content-grid">
      <Panel title="Filtros" eyebrow="Auditoria">
        <div className="stack-form">
          <select onChange={(event) => setEntityType(event.currentTarget.value)} value={entityType}>
            <option value="">Tipo de entidad</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>{entityLabel(type)}</option>
            ))}
          </select>
          <select onChange={(event) => setActorUserId(event.currentTarget.value)} value={actorUserId}>
            <option value="">Actor</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          <select onChange={(event) => setAction(event.currentTarget.value)} value={action}>
            <option value="">Accion</option>
            {actions.map((item) => (
              <option key={item} value={item}>{actionLabel(item)}</option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel title="Timeline" eyebrow={`${filteredLogs.length} eventos`}>
        <div className="activity-list">
          {filteredLogs.map((log) => (
            <article className="activity-row" key={log.id}>
              <span className="activity-dot" />
              <div>
                <strong>{actionLabel(log.action)}</strong>
                <p>{log.actor?.name ?? "Sistema"} / {entityLabel(log.entityType)}</p>
                <small>{formatDate(log.createdAt)}{log.entityId ? ` / ${log.entityId}` : ""}</small>
              </div>
            </article>
          ))}
          {!filteredLogs.length ? <p className="muted-text">Sin actividad para estos filtros.</p> : null}
        </div>
      </Panel>
    </section>
  );
}

function ReportsView({
  days,
  onDaysChange,
  onExport,
  report
}: {
  days: number;
  onDaysChange: (days: number) => void;
  onExport: () => void;
  report: ReportSummary | null;
}) {
  const maxAssigneeLoad = Math.max(
    ...(report?.topAssignees.map((item) => item.conversations + item.leads + item.tasks) ?? [0]),
    1
  );

  if (!report) {
    return (
      <section className="reports-grid">
        <Panel eyebrow="Reportes" title="Cargando reporte" className="wide-panel">
          <p className="muted-text">Preparando el resumen ejecutivo.</p>
        </Panel>
      </section>
    );
  }

  return (
    <section className="reports-grid">
      <Panel eyebrow="Periodo" title="Resumen ejecutivo" className="wide-panel">
        <div className="report-toolbar">
          <select onChange={(event) => void onDaysChange(Number(event.currentTarget.value))} value={days}>
            <option value={7}>Ultimos 7 dias</option>
            <option value={30}>Ultimos 30 dias</option>
            <option value={90}>Ultimos 90 dias</option>
            <option value={365}>Ultimos 365 dias</option>
          </select>
          <button className="secondary-button" onClick={onExport} type="button">
            <Download size={17} /> Exportar CSV
          </button>
        </div>
        <p className="muted-text">
          {formatDate(report.period.from)} a {formatDate(report.period.to)}
        </p>
      </Panel>

      <section className="report-metrics wide-panel" aria-label="Metricas del reporte">
        <Metric label="Leads creados" value={report.summary.leadsCreated} detail={`${report.summary.leadsWon} ganados`} />
        <Metric label="Valor estimado" value={Math.round(report.summary.leadsValue)} detail="USD en pipeline" />
        <Metric label="Tareas creadas" value={report.summary.tasksCreated} detail={`${report.summary.tasksCompleted} completadas`} />
        <Metric label="Chats abiertos" value={report.summary.chatsOpened} detail={`${report.summary.chatsClosed} cerrados`} />
      </section>

      <Panel eyebrow="SLA" title="Atencion de chats">
        <div className="sla-summary">
          <article className="ok">
            <span>En tiempo</span>
            <strong>
              {Math.max(
                report.summary.chatsOpened - report.summary.chatsWarningSla - report.summary.chatsBreachedSla,
                0
              )}
            </strong>
          </article>
          <article className="warning">
            <span>En riesgo</span>
            <strong>{report.summary.chatsWarningSla}</strong>
          </article>
          <article className="breached">
            <span>Vencidas</span>
            <strong>{report.summary.chatsBreachedSla}</strong>
          </article>
        </div>
      </Panel>

      <Panel eyebrow="Ventas" title="Leads por estado">
        <ReportList
          empty="Sin leads en el periodo"
          items={report.leadsByStatus.map((item) => ({ label: statusLabel(item.name), value: item.count }))}
        />
      </Panel>

      <Panel eyebrow="Canales" title="Conversaciones por canal">
        <ReportList
          empty="Sin conversaciones en el periodo"
          items={report.conversationsByChannel.map((item) => ({ label: channelLabel(item.channel), value: item.count }))}
        />
      </Panel>

      <Panel eyebrow="Actividad" title="Movimientos por tipo">
        <ReportList
          empty="Sin actividad en el periodo"
          items={report.activityByType.map((item) => ({ label: entityLabel(item.name), value: item.count }))}
        />
      </Panel>

      <Panel eyebrow="Equipo" title="Carga por responsable" className="wide-panel">
        <div className="workload-list">
          {report.topAssignees.length ? (
            report.topAssignees.map((member) => {
              const total = member.conversations + member.leads + member.tasks;
              return (
                <article key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.leads} leads / {member.tasks} tareas / {member.conversations} chats</span>
                  </div>
                  <div className="bar-track">
                    <div style={{ width: `${Math.max(8, (total / maxAssigneeLoad) * 100)}%` }} />
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted-text">Sin responsables activos.</p>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Equipo" title="Actividad por usuario" className="wide-panel">
        <div className="report-table">
          <div>
            <strong>Usuario</strong>
            <strong>Actividad</strong>
            <strong>Leads ganados</strong>
            <strong>Chats cerrados</strong>
          </div>
          {report.activityByUser.map((member) => (
            <div key={member.id}>
              <span>{member.name}</span>
              <span>{member.activity}</span>
              <span>{member.leadsWon}</span>
              <span>{member.closedConversations}</span>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function ReportList({ empty, items }: { empty: string; items: Array<{ label: string; value: number }> }) {
  return (
    <div className="report-list">
      {items.length ? (
        items.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))
      ) : (
        <p className="muted-text">{empty}</p>
      )}
    </div>
  );
}

function SlaPill({ sla }: { sla: { elapsedHours: number; label: string; state: SlaState } }) {
  return <span className={`sla-pill ${sla.state}`}>{sla.label}</span>;
}

function InstagramHealthPanel({ health }: { health?: Record<string, unknown> }) {
  const summary = formatInstagramHealth(health ?? {});
  const state =
    summary.tokenStatus === "valid" && summary.syncStatus !== "failed"
      ? "ok"
      : summary.tokenStatus === "invalid" || summary.syncStatus === "failed"
        ? "failed"
        : "warning";

  return (
    <div className={`instagram-health ${state}`}>
      <div>
        <strong>{summary.title}</strong>
        <span>{summary.detail}</span>
      </div>
      {summary.error ? <small>{summary.error}</small> : null}
    </div>
  );
}

function AssigneeSelect({
  assignedUserId,
  members,
  onChange
}: {
  assignedUserId?: string;
  members: TeamMember[];
  onChange: (assignedUserId: string) => void;
}) {
  return (
    <select
      className="compact-select"
      onChange={(event) => onChange(event.currentTarget.value)}
      value={assignedUserId ?? ""}
    >
      <option value="">Sin responsable</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>{member.name}</option>
      ))}
    </select>
  );
}

function InboxView({
  channelConnections,
  contacts,
  conversations,
  filter,
  leads,
  messages,
  notes,
  selectedConversation,
  selectedConversationId,
  tasks,
  teamMembers,
  user,
  onAssign,
  onAssignToMe,
  onClose,
  onFilterChange,
  onSelectConversation,
  onSubmitConversation,
  onSubmitInboundMessage,
  onSubmitMessage,
  onRetryMessage,
  onUnassign
}: {
  channelConnections: ChannelConnection[];
  contacts: Contact[];
  conversations: Conversation[];
  filter: InboxFilter;
  leads: Lead[];
  messages: Message[];
  notes: Note[];
  selectedConversation?: Conversation;
  selectedConversationId: string;
  tasks: Task[];
  teamMembers: TeamMember[];
  user: SessionUser;
  onAssign: (conversationId: string, assignedUserId: string) => void;
  onAssignToMe: (conversationId: string) => void;
  onClose: (conversationId: string) => void;
  onFilterChange: (filter: InboxFilter) => void;
  onSelectConversation: (conversationId: string) => void;
  onSubmitConversation: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitInboundMessage: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitMessage: (event: FormEvent<HTMLFormElement>) => void;
  onRetryMessage: (messageId: string) => void;
  onUnassign: (conversationId: string) => void;
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "smooth"
    });
  }, [lastMessageId, selectedConversationId]);

  const filterOptions: Array<{ label: string; value: InboxFilter }> = [
    { label: "Abiertos", value: "open" },
    { label: "Mios", value: "mine" },
    { label: "Libres", value: "unassigned" },
    { label: "Urgentes", value: "sla" },
    { label: "Cerrados", value: "closed" }
  ];

  return (
    <section className="inbox-layout">
      <Panel
        action={(
          <button className="secondary-button compact-action" onClick={() => setShowComposer((value) => !value)} type="button">
            <MessageSquareText size={15} /> Nuevo
          </button>
        )}
        className="conversation-panel"
        title="Conversaciones"
      >
        {showComposer ? (
          <form className="stack-form conversation-composer" onSubmit={onSubmitConversation}>
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
            <select name="channelConnectionId">
              <option value="">Sin conexion asignada</option>
              {channelConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {channelLabel(connection.channel)} / {connection.name}
                </option>
              ))}
            </select>
            <button className="primary-button" type="submit"><Plus size={17} /> Crear</button>
          </form>
        ) : null}

        <div className="filter-tabs" role="tablist" aria-label="Filtros de conversaciones">
          {filterOptions.map((option) => (
            <button
              aria-selected={filter === option.value}
              className={filter === option.value ? "active-tab" : ""}
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              className={conversation.id === selectedConversationId ? "conversation-row active-row" : "conversation-row"}
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              type="button"
            >
              <span className="conversation-main">
                <span className="conversation-channel">{channelLabel(conversation.channel)}</span>
                <strong>{contactDisplayName(conversation.contact, conversation.channel)}</strong>
                <em>{conversation.channelConnection?.name ?? conversation.messages?.[0]?.text ?? "Sin mensajes recientes"}</em>
              </span>
              <span className="conversation-meta">
                {conversation.assignedUserId === user.id ? "Mio" : conversation.assignedUserId ? "Asignado" : "Libre"}
                <SlaPill sla={conversationSla(conversation)} />
                <small>{formatDate(conversation.lastMessageAt)}</small>
              </span>
            </button>
          ))}
          {!conversations.length ? <p className="muted-text">No hay conversaciones en este filtro.</p> : null}
        </div>
      </Panel>

      <Panel
        className="chat-panel"
        eyebrow={selectedConversation ? channelLabel(selectedConversation.channel) : undefined}
        title={selectedConversation ? contactDisplayName(selectedConversation.contact, selectedConversation.channel) : "Chat"}
      >
        {selectedConversation ? (
          <div className="chat-actions">
            <span className={`status-pill ${selectedConversation.status}`}>{selectedConversation.status}</span>
            <SlaPill sla={conversationSla(selectedConversation)} />
            <AssigneeSelect
              assignedUserId={selectedConversation.assignedUserId ?? undefined}
              members={teamMembers}
              onChange={(assignedUserId) => void onAssign(selectedConversation.id, assignedUserId)}
            />
            {selectedConversation.assignedUserId === user.id ? (
              <button className="secondary-button" onClick={() => void onUnassign(selectedConversation.id)} type="button">
                <UserMinus size={16} /> Liberar
              </button>
            ) : selectedConversation.status === "open" ? (
              <button className="secondary-button" onClick={() => void onAssignToMe(selectedConversation.id)} type="button">
                <UserCheck size={16} /> Asignarme
              </button>
            ) : null}
            {selectedConversation.status === "open" ? (
              <button className="secondary-button" onClick={() => void onClose(selectedConversation.id)} type="button">
                Cerrar
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="message-list" ref={messageListRef}>
          {messages.map((message) => (
            <article className={`message-bubble ${message.direction}`} key={message.id}>
              <header>
                <strong>
                  {message.direction === "outbound"
                    ? "Agente"
                    : selectedConversation
                      ? contactDisplayName(selectedConversation.contact, selectedConversation.channel)
                      : "Cliente"}
                </strong>
                <time>{formatDate(message.createdAt)}</time>
              </header>
              <p>{message.text}</p>
              <footer className="message-footer">
                <span>{message.status}</span>
                {message.direction === "outbound" && message.status === "failed" ? (
                  <small>{providerErrorMessage(message.rawPayload) ?? "No enviado"}</small>
                ) : null}
                {message.direction === "outbound" && message.status === "failed" ? (
                  <button
                    className="retry-button"
                    onClick={() => void onRetryMessage(message.id)}
                    type="button"
                  >
                    Reintentar
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
          {!messages.length ? <p className="muted-text">Sin mensajes todavia.</p> : null}
        </div>
        <form className="message-form" onSubmit={onSubmitMessage}>
          <input name="text" placeholder="Escribe una respuesta" required />
          <button className="primary-button" type="submit"><Send size={17} /></button>
        </form>
        <details className="dev-tools" open={showDevTools} onToggle={(event) => setShowDevTools(event.currentTarget.open)}>
          <summary>Herramientas</summary>
          <form className="message-form inbound-form" onSubmit={onSubmitInboundMessage}>
            <input name="text" placeholder="Simular mensaje del cliente" required />
            <button className="secondary-button" type="submit"><CornerDownLeft size={17} /></button>
          </form>
        </details>
      </Panel>

      <Panel className="context-panel" title="Cliente">
        {selectedConversation ? (
          <>
            <section className="context-block">
              <h3>{contactDisplayName(selectedConversation.contact, selectedConversation.channel)}</h3>
              <p>{selectedConversation.contact.phone ?? "Sin telefono"}</p>
              <p>{selectedConversation.contact.email ?? "Sin email"}</p>
              <div className="tag-list">
                {selectedConversation.contact.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </section>

            <ContextList title="Leads" empty="Sin oportunidades">
              {leads.map((lead) => (
                <article key={lead.id}>
                  <strong>{lead.stage.name}</strong>
                  <span>{lead.status} / {lead.currency} {lead.value ?? 0}</span>
                </article>
              ))}
            </ContextList>

            <ContextList title="Tareas" empty="Sin tareas">
              {tasks.map((task) => (
                <article key={task.id}>
                  <strong>{task.title}</strong>
                  <span>{task.status}{task.dueAt ? ` / ${formatDate(task.dueAt)}` : ""}</span>
                </article>
              ))}
            </ContextList>

            <ContextList title="Notas" empty="Sin notas">
              {notes.map((note) => (
                <article key={note.id}>
                  <strong>{note.body}</strong>
                  <span>{formatDate(note.createdAt)}</span>
                </article>
              ))}
            </ContextList>
          </>
        ) : (
          <p className="muted-text">Selecciona una conversacion para ver el historial comercial.</p>
        )}
      </Panel>
    </section>
  );
}

function ContextList({ children, empty, title }: { children: React.ReactNode; empty: string; title: string }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="context-block">
      <h3>{title}</h3>
      <div className="mini-list">{hasItems ? children : <p className="muted-text">{empty}</p>}</div>
    </section>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function providerErrorMessage(rawPayload?: Record<string, unknown>) {
  const providers = ["instagramCloud", "messengerCloud", "whatsappCloud", "instagramCloudRetry", "messengerCloudRetry"];
  for (const provider of providers) {
    const payload = rawPayload?.[provider];
    const record = asPlainRecord(payload);
    const nestedPayload = asPlainRecord(record?.payload);
    const errorSource = asPlainRecord(record?.error) ?? asPlainRecord(nestedPayload?.error);
    const message = typeof errorSource?.message === "string" ? errorSource.message : undefined;
    if (message) {
      return message;
    }

    const stringError = typeof record?.error === "string" ? record.error : undefined;
    if (stringError) {
      return stringError;
    }
  }

  return undefined;
}

function asPlainRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-VE", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function conversationSla(conversation: Conversation) {
  if (conversation.status !== "open") {
    return { elapsedHours: 0, label: "Cerrado", state: "ok" as SlaState };
  }

  const referenceValue = conversation.lastMessageAt ?? conversation.createdAt;
  if (!referenceValue) {
    return { elapsedHours: 0, label: "Sin reloj", state: "ok" as SlaState };
  }

  const elapsedHours = Math.max(0, (Date.now() - new Date(referenceValue).getTime()) / (1000 * 60 * 60));
  if (elapsedHours >= 4) {
    return { elapsedHours, label: `SLA vencido ${formatHours(elapsedHours)}`, state: "breached" as SlaState };
  }
  if (elapsedHours >= 2) {
    return { elapsedHours, label: `SLA riesgo ${formatHours(elapsedHours)}`, state: "warning" as SlaState };
  }
  return { elapsedHours, label: `SLA ok ${formatHours(elapsedHours)}`, state: "ok" as SlaState };
}

function formatHours(value: number) {
  if (value < 1) {
    return `${Math.floor(value * 60)}m`;
  }

  return `${Math.floor(value)}h`;
}

function roleLabel(role?: string) {
  const labels: Record<string, string> = {
    admin: "Admin",
    owner: "Owner",
    seller: "Vendedor",
    supervisor: "Supervisor"
  };
  return role ? labels[role] ?? role : "Sin rol";
}

function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    messenger: "Messenger",
    whatsapp: "WhatsApp"
  };
  return labels[channel] ?? channel;
}

function formatInstagramHealth(health: Record<string, unknown>) {
  const tokenStatus = typeof health.tokenStatus === "string" ? health.tokenStatus : undefined;
  const syncStatus = typeof health.lastSyncStatus === "string" ? health.lastSyncStatus : undefined;
  const lastSyncFinishedAt = typeof health.lastSyncFinishedAt === "string" ? health.lastSyncFinishedAt : undefined;
  const lastError = typeof health.lastError === "string" ? health.lastError : undefined;
  const tokenError = typeof health.tokenError === "string" ? health.tokenError : undefined;
  const lastSyncProcessed = typeof health.lastSyncProcessed === "number" ? health.lastSyncProcessed : undefined;
  const syncedConversations = typeof health.syncedConversations === "number" ? health.syncedConversations : undefined;
  const tokenLabel =
    tokenStatus === "valid"
      ? "token valido"
      : tokenStatus === "invalid"
        ? "token invalido"
        : tokenStatus === "unknown"
          ? "token sin validar"
          : "token pendiente";
  const syncLabel = lastSyncFinishedAt
    ? `sync ${syncStatus ?? "ok"} ${formatDate(lastSyncFinishedAt)}`
    : syncStatus
      ? `sync ${syncStatus}`
      : "sin sync reciente";
  const countLabel =
    lastSyncProcessed !== undefined || syncedConversations !== undefined
      ? ` / ${lastSyncProcessed ?? 0} nuevos / ${syncedConversations ?? 0} hilos`
      : "";

  return {
    detail: `${syncLabel}${countLabel}`,
    error: lastError ?? tokenError,
    syncStatus,
    title: tokenLabel,
    tokenStatus
  };
}

function contactDisplayName(contact: Contact, channel?: string) {
  const channelProfile = contact.channels?.find((item) => item.channel === channel);
  if (channelProfile?.username && channelProfile.username !== channelProfile.externalId) {
    return channelProfile.username.startsWith("@") ? channelProfile.username : `@${channelProfile.username}`;
  }

  return channelProfile?.displayName ?? contact.fullName;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    canceled: "Cancelado",
    closed: "Cerrado",
    done: "Completado",
    lost: "Perdido",
    open: "Abierto",
    won: "Ganado"
  };
  return labels[status] ?? status;
}

function priorityLabel(priority: OperationalNotification["priority"]) {
  const labels: Record<OperationalNotification["priority"], string> = {
    attention: "Atencion",
    info: "Info",
    urgent: "Urgente"
  };
  return labels[priority];
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "channel_connection.created": "Conexion creada",
    "channel_connection.status_changed": "Estado de canal cambiado",
    "contact.created": "Contacto creado",
    "contact.deleted": "Contacto eliminado",
    "contacts.imported": "Contactos importados",
    "conversations.auto_assigned": "Chats autoasignados",
    "conversation.assigned": "Chat asignado",
    "conversation.closed": "Chat cerrado",
    "conversation.created": "Chat creado",
    "lead.assigned": "Lead asignado",
    "leads.auto_assigned": "Leads autoasignados",
    "lead.created": "Lead creado",
    "lead.lost": "Lead perdido",
    "lead.open": "Lead abierto",
    "lead.won": "Lead ganado",
    "message.inbound": "Mensaje entrante",
    "message.outbound": "Mensaje enviado",
    "message.status_changed": "Estado de mensaje actualizado",
    "note.created": "Nota creada",
    "note.deleted": "Nota eliminada",
    "note.updated": "Nota actualizada",
    "task.assigned": "Tarea asignada",
    "task.canceled": "Tarea cancelada",
    "task.created": "Tarea creada",
    "task.done": "Tarea completada",
    "task.open": "Tarea abierta",
    "user.created": "Usuario creado"
  };
  return labels[action] ?? action;
}

function entityLabel(entityType: string) {
  const labels: Record<string, string> = {
    channel_connection: "Canal",
    contact: "Contacto",
    conversation: "Conversacion",
    lead: "Lead",
    message: "Mensaje",
    note: "Nota",
    task: "Tarea",
    user: "Usuario"
  };
  return labels[entityType] ?? entityType;
}

function reportToCsv(report: ReportSummary) {
  const rows = [
    ["Seccion", "Metrica", "Valor"],
    ["Periodo", "Dias", report.period.days],
    ["Resumen", "Leads creados", report.summary.leadsCreated],
    ["Resumen", "Leads ganados", report.summary.leadsWon],
    ["Resumen", "Leads perdidos", report.summary.leadsLost],
    ["Resumen", "Valor estimado", report.summary.leadsValue],
    ["Resumen", "Tareas creadas", report.summary.tasksCreated],
    ["Resumen", "Tareas completadas", report.summary.tasksCompleted],
    ["Resumen", "Tareas vencidas", report.summary.tasksOverdue],
    ["Resumen", "Chats abiertos", report.summary.chatsOpened],
    ["Resumen", "Chats cerrados", report.summary.chatsClosed],
    ["SLA", "Chats en riesgo", report.summary.chatsWarningSla],
    ["SLA", "Chats vencidos", report.summary.chatsBreachedSla],
    ...report.conversationsByChannel.map((item) => ["Canales", channelLabel(item.channel), item.count]),
    ...report.leadsByStatus.map((item) => ["Leads", statusLabel(item.name), item.count]),
    ...report.activityByUser.map((item) => ["Usuario", `${item.name} actividad`, item.activity]),
    ...report.activityByUser.map((item) => ["Usuario", `${item.name} leads ganados`, item.leadsWon]),
    ...report.activityByUser.map((item) => ["Usuario", `${item.name} chats cerrados`, item.closedConversations])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function Panel({
  action,
  children,
  className = "",
  eyebrow,
  title
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
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
