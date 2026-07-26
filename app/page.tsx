"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Station = { code: string; name: string; color: string; prepMinutes: number };
type KitchenItem = {
  id: number; orderId: number; orderNumber?: number; tableName: string; productName: string;
  categoryName: string; quantity: number; status: string; note?: string; stationCode: string;
  stationName: string; stationColor: string; createdAt: string; updatedAt: string; expectedAt: string;
  overdue: boolean; guestLanguage?: string; allergies: string[]; tableNote?: string;
};
type TableTicket = {
  tableId: number; tableName: string; orderNumber?: number; guestLanguage?: string;
  allergies: string[]; tableNote?: string; earliestExpectedAt: string; items: KitchenItem[];
};
type User = { fullName: string; role: string; permissions: string[] };

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const elapsed = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
const dueIn = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 60000);

async function api(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    cache: "no-store"
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Kitchen request failed.");
  return json;
}

export default function DishUp() {
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : sessionStorage.getItem("dishup-token") || "");
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = sessionStorage.getItem("dishup-user");
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState<"expected" | "station">("expected");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationCode, setStationCode] = useState("HOT");
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [tables, setTables] = useState<TableTicket[]>([]);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const config = await api("/kitchen/config", token);
      setStations(config.data.stations);
      if (view === "expected") {
        const result = await api("/kitchen/expected", token);
        setTables(result.data.tables);
        setItems(result.data.items);
      } else {
        const result = await api(`/kitchen/stations/${stationCode}`, token);
        setItems(result.data.items);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to synchronize kitchen.");
    }
  }, [token, view, stationCode]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const sync = window.setInterval(load, 2500);
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(sync); window.clearInterval(timer); };
  }, [load]);

  const updateStatus = async (itemId: number, status: string) => {
    setUpdating(itemId);
    try {
      await api(`/orders/items/${itemId}/status`, token, { method: "PUT", body: JSON.stringify({ status }) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update item.");
    } finally { setUpdating(null); }
  };

  const summary = useMemo(() => ({
    pending: items.filter(item => ["Pending", "Fired", "Remake"].includes(item.status)).length,
    cooking: items.filter(item => item.status === "Cooking").length,
    ready: items.filter(item => item.status === "Ready").length,
    overdue: items.filter(item => item.overdue).length
  }), [items]);

  if (!token || !user) return <Login onSuccess={(nextToken, nextUser) => {
    sessionStorage.setItem("dishup-token", nextToken);
    sessionStorage.setItem("dishup-user", JSON.stringify(nextUser));
    setToken(nextToken); setUser(nextUser);
  }} />;

  return <main className="kds">
    <header className="topbar">
      <div className="brand"><span>ML</span><div><b>MAISON LUCAS</b><small>KITCHEN / DISH UP</small></div></div>
      <div className="viewSwitch">
        <button className={view === "expected" ? "active" : ""} onClick={() => setView("expected")}>Expected</button>
        <button className={view === "station" ? "active" : ""} onClick={() => setView("station")}>Station</button>
      </div>
      <div className="shiftMeta"><span>{clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><small>{user.fullName} / {user.role}</small></div>
    </header>

    <section className="controlbar">
      <div>
        <p>LIVE KITCHEN CONTROL</p>
        <h1>{view === "expected" ? "Expected / Pass Coordination" : `${stations.find(s => s.code === stationCode)?.name || stationCode} Station`}</h1>
      </div>
      <div className="metrics">
        <Metric label="Waiting" value={summary.pending} tone="neutral" />
        <Metric label="Cooking" value={summary.cooking} tone="amber" />
        <Metric label="Ready" value={summary.ready} tone="green" />
        <Metric label="Late" value={summary.overdue} tone="red" />
      </div>
    </section>

    {error && <div className="errorbar">{error}<button onClick={load}>Retry</button></div>}

    {view === "station" && <nav className="stations">{stations.map(station =>
      <button key={station.code} className={stationCode === station.code ? "active" : ""} style={{ "--station": station.color } as React.CSSProperties} onClick={() => setStationCode(station.code)}>
        <i />{station.name}<em>{stationCode === station.code ? items.length : ""}</em>
      </button>)}</nav>}

    {view === "expected"
      ? <ExpectedBoard tables={tables} updating={updating} onStatus={updateStatus} />
      : <StationBoard items={items} updating={updating} onStatus={updateStatus} />}
  </main>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`metric ${tone}`}><b>{value}</b><span>{label}</span></div>;
}

function ExpectedBoard({ tables, updating, onStatus }: { tables: TableTicket[]; updating: number | null; onStatus: (id: number, status: string) => void }) {
  if (!tables.length) return <Empty />;
  return <section className="expectedGrid">{tables.map(ticket => {
    const ready = ticket.items.filter(item => item.status === "Ready").length;
    const allReady = ready === ticket.items.length;
    const late = ticket.items.some(item => item.overdue);
    return <article className={`tableTicket ${late ? "late" : ""} ${allReady ? "complete" : ""}`} key={ticket.tableId}>
      <div className="ticketHead">
        <div><p>ORDER #{ticket.orderNumber || "-"}</p><h2>{ticket.tableName}</h2></div>
        <div className="ticketTime"><b>{dueIn(ticket.earliestExpectedAt)}</b><span>MIN</span></div>
      </div>
      {ticket.guestLanguage && <div className="guestLanguage">GUEST LANGUAGE / {ticket.guestLanguage}</div>}
      {(ticket.allergies.length > 0 || ticket.tableNote) && <div className="safetyAlert">
        {ticket.allergies.length > 0 && <b>ALLERGY / {ticket.allergies.join(" / ")}</b>}
        {ticket.tableNote && <span>{ticket.tableNote}</span>}
      </div>}
      <div className="ticketItems">{ticket.items.map(item => <div className={`expectedItem ${item.status.toLowerCase()}`} key={item.id}>
        <span className="qty">{item.quantity}</span>
        <div><b>{item.productName}</b><small><i style={{ background: item.stationColor }} />{item.stationName}{item.note ? ` / ${item.note}` : ""}</small></div>
        <em>{item.status}</em>
        {item.status === "Ready" && <button disabled={updating === item.id} onClick={() => onStatus(item.id, "Served")}>Serve</button>}
      </div>)}</div>
      <footer><span>{ready}/{ticket.items.length} READY</span><b>{allReady ? "RUN TABLE NOW" : "WAITING FOR STATIONS"}</b></footer>
    </article>;
  })}</section>;
}

function StationBoard({ items, updating, onStatus }: { items: KitchenItem[]; updating: number | null; onStatus: (id: number, status: string) => void }) {
  const groups = [
    { title: "Waiting", statuses: ["Pending", "Fired", "Remake"] },
    { title: "Cooking", statuses: ["Cooking"] },
    { title: "Ready at pass", statuses: ["Ready"] }
  ];
  return <section className="stationBoard">{groups.map(group => <div className="stationColumn" key={group.title}>
    <header><h2>{group.title}</h2><span>{items.filter(item => group.statuses.includes(item.status)).length}</span></header>
    <div>{items.filter(item => group.statuses.includes(item.status)).map(item =>
      <article className={`stationCard ${item.overdue ? "overdue" : ""}`} key={item.id}>
        <div className="cardTop"><span>{item.tableName}</span><em>#{item.orderNumber || "-"} / {elapsed(item.createdAt)}m</em></div>
        <div className="cardMain"><b>{item.quantity}</b><h3>{item.productName}</h3></div>
        {item.guestLanguage && <p className="language">Guest language / {item.guestLanguage}</p>}
        {item.allergies.length > 0 && <p className="allergy">ALLERGY / {item.allergies.join(" / ")}</p>}
        {item.note && <p className="note">{item.note}</p>}
        <div className="cardAction">
          {["Pending", "Fired", "Remake"].includes(item.status) && <button disabled={updating === item.id} onClick={() => onStatus(item.id, "Cooking")}>Start cooking</button>}
          {item.status === "Cooking" && <button disabled={updating === item.id} onClick={() => onStatus(item.id, "Ready")}>Send to pass</button>}
          {item.status === "Ready" && <span>Waiting at Dish Up</span>}
        </div>
      </article>)}</div>
  </div>)}</section>;
}

function Empty() {
  return <div className="empty"><span>OK</span><h2>Kitchen is clear</h2><p>New items will appear here automatically.</p></div>;
}

function Login({ onSuccess }: { onSuccess: (token: string, user: User) => void }) {
  const [staffCode, setStaffCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/auth/staff-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffCode, pin }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Login failed.");
      if (!json.user.permissions.includes("view_orders")) throw new Error("This account cannot access Dish Up.");
      onSuccess(json.token, json.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Login failed."); }
    finally { setLoading(false); }
  };
  return <main className="loginPage"><form onSubmit={submit}>
    <div className="loginMark">ML</div><p>MAISON LUCAS / KITCHEN</p><h1>Dish Up</h1><span>Expected service and station coordination</span>
    {error && <div className="loginError">{error}</div>}
    <label>Staff code<input value={staffCode} onChange={event => setStaffCode(event.target.value)} placeholder="0001" autoFocus /></label>
    <label>4-digit PIN<input value={pin} onChange={event => setPin(event.target.value)} type="password" inputMode="numeric" maxLength={4} placeholder="----" /></label>
    <button disabled={loading}>{loading ? "Signing in..." : "Open kitchen display"}</button>
  </form></main>;
}
