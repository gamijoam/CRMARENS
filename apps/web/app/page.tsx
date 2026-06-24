import {
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Inbox,
  MessageSquareText,
  Settings,
  ShieldCheck,
  UsersRound
} from "lucide-react";

const conversations = [
  { name: "Mariela Torres", channel: "WhatsApp", status: "Nuevo", owner: "Sin asignar", time: "2 min" },
  { name: "Auto Norte", channel: "WhatsApp", status: "Interesado", owner: "Carlos", time: "9 min" },
  { name: "David Pena", channel: "Instagram", status: "Soporte", owner: "Rosa", time: "18 min" },
  { name: "Academia Lider", channel: "Messenger", status: "Negociacion", owner: "Gabo", time: "31 min" }
];

const pipeline = [
  { label: "Nuevo", value: 24 },
  { label: "Contactado", value: 18 },
  { label: "Interesado", value: 12 },
  { label: "Negociacion", value: 7 },
  { label: "Ganado", value: 5 }
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegacion principal">
        <div className="brand">
          <div className="brand-mark">CO</div>
          <div>
            <strong>CRM Omnicanal</strong>
            <span>Empresa Demo</span>
          </div>
        </div>

        <nav className="nav-list">
          <a className="active" href="#">
            <Inbox size={18} /> Inbox
          </a>
          <a href="#">
            <UsersRound size={18} /> Contactos
          </a>
          <a href="#">
            <BarChart3 size={18} /> Leads
          </a>
          <a href="#">
            <Building2 size={18} /> Organizacion
          </a>
          <a href="#">
            <Settings size={18} /> Configuracion
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP base</p>
            <h1>Centro de ventas omnicanal</h1>
          </div>
          <button className="primary-button">
            <MessageSquareText size={18} /> Nuevo mensaje
          </button>
        </header>

        <section className="metrics" aria-label="Metricas principales">
          <article>
            <span>Conversaciones abiertas</span>
            <strong>61</strong>
            <small>+12 hoy</small>
          </article>
          <article>
            <span>Tiempo medio respuesta</span>
            <strong>4m 18s</strong>
            <small>Objetivo: 5m</small>
          </article>
          <article>
            <span>Leads activos</span>
            <strong>42</strong>
            <small>Pipeline ventas</small>
          </article>
          <article>
            <span>Asignacion automatica</span>
            <strong>Round-robin</strong>
            <small>Vendedor anterior primero</small>
          </article>
        </section>

        <section className="content-grid">
          <section className="panel inbox-panel" aria-labelledby="inbox-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Inbox</p>
                <h2 id="inbox-title">Conversaciones recientes</h2>
              </div>
              <span className="status-pill"><Clock3 size={14} /> En tiempo real</span>
            </div>

            <div className="conversation-list">
              {conversations.map((item) => (
                <article className="conversation-row" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.channel} · {item.status}</span>
                  </div>
                  <div className="row-meta">
                    <span>{item.owner}</span>
                    <small>{item.time}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="pipeline-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h2 id="pipeline-title">Embudo comercial</h2>
              </div>
              <CheckCircle2 size={20} className="success-icon" />
            </div>

            <div className="pipeline-list">
              {pipeline.map((stage) => (
                <div className="pipeline-row" key={stage.label}>
                  <span>{stage.label}</span>
                  <div className="bar-track">
                    <div style={{ width: `${Math.min(stage.value * 4, 100)}%` }} />
                  </div>
                  <strong>{stage.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel security-panel" aria-labelledby="security-title">
            <ShieldCheck size={22} />
            <div>
              <p className="eyebrow">Base tecnica</p>
              <h2 id="security-title">Multiempresa desde el primer dia</h2>
              <p>
                Cada consulta del backend nace preparada para separar datos por organizacion,
                roles y auditoria.
              </p>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
