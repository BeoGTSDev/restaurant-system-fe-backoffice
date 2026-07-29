"use client";
import ThemeSwitcher from "./ThemeSwitcher";

import { useCallback, useEffect, useState } from "react";

type Station = { code: string; name: string; color: string; prepMinutes: number };
type KitchenItem = {
  id: number; orderId: number; orderNumber?: number; tableName: string; productName: string;
  categoryName: string; quantity: number; status: string; note?: string; stationCode: string;
  stationName: string; stationColor: string; createdAt: string; updatedAt: string; expectedAt?: string | null;
  overdue: boolean; guestLanguage?: string; allergies: string[]; tableNote?: string;
  nationality?: string; guestCount?: string; billCreatedAt?: string; orderedByName?: string;
  courseTiming?: string; priority?: string; prepMinutes?: number; displayName?: string;
  firedAt?: string; cookingAt?: string; pickupAt?: string; servedAt?: string;
  previousStatus?: string;
};
type TableTicket = {
  billId?: number; orderId?: number;
  tableId: number; tableName: string; orderNumber?: number; guestLanguage?: string;
  allergies: string[]; tableNote?: string; earliestExpectedAt?: string | null; items: KitchenItem[];
  nationality?: string; guestCount?: string; billCreatedAt?: string; orderedByName?: string; courseTiming?: string;
  completedAt?: string; durationMinutes?: number;
};
type User = { fullName: string; role: string; permissions: string[] };
type KitchenEvent = { id:number; orderItemId:number; tableId:number; productName?:string; fromStatus?:string; toStatus:string; action:string; reason?:string; performerName?:string; createdAt:string };

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const elapsed = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
const progressPercent = (item: KitchenItem) => Math.min(
  100,
  Math.max(0, Date.now() - new Date(item.cookingAt || Date.now()).getTime())
    / ((item.prepMinutes || 10) * 60000) * 100
);
const progressTone = (item: KitchenItem) => {
  const progress = progressPercent(item);
  return progress >= 90 ? "danger" : progress >= 70 ? "warning" : "safe";
};
const remainingSeconds = (item: KitchenItem) => {
  const startedAt = item.cookingAt;
  if (!startedAt) return (item.prepMinutes || 10) * 60;
  return Math.ceil(((item.prepMinutes || 10) * 60000 - (Date.now() - new Date(startedAt).getTime())) / 1000);
};
const countdown = (item: KitchenItem) => {
  const remaining = remainingSeconds(item);
  const absolute = Math.abs(remaining);
  const minutes = Math.floor(absolute / 60).toString().padStart(2, "0");
  const seconds = (absolute % 60).toString().padStart(2, "0");
  return `${remaining < 0 ? "-" : ""}${minutes}:${seconds}`;
};
const statusChangedAt = (item: KitchenItem) => {
  const value = item.status === "Fired" ? item.firedAt
    : item.status === "Cooking" ? item.cookingAt
    : ["Pickup", "Ready"].includes(item.status) ? item.pickupAt
    : item.status === "Served" ? item.servedAt
    : item.status === "Pending" ? item.createdAt
    : item.updatedAt;
  return value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
};
const itemNoteWithoutDietaryAlert = (note?: string) => String(note || "")
  .split("·")
  .map(value => value.trim())
  .filter(value => value && !/^dietary alert:/i.test(value) && !/^allergy:/i.test(value))
  .join(" / ");

async function api(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.status === 404
      ? "Kitchen API is not available. Restart or redeploy the backend with the latest version."
      : `Kitchen API returned an invalid response (${response.status}).`);
  }
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Kitchen request failed.");
  return json;
}

export default function DishUp() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"dine" | "desserts" | "fired" | "history" | "logs" | "station">("dine");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationCode, setStationCode] = useState("HOT");
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [tables, setTables] = useState<TableTicket[]>([]);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState("all");
  const [events, setEvents] = useState<KitchenEvent[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [focusTableId, setFocusTableId] = useState<number | null>(null);
  const canViewDishUp = Boolean(user?.permissions.some(permission => ["view_dishup", "manage_expeditor", "update_order_status"].includes(permission)));
  const canExpedite = Boolean(user?.permissions.some(permission => ["manage_expeditor", "update_order_status"].includes(permission)));
  const canWorkStation = Boolean(user?.permissions.some(permission => ["work_kitchen_station", "update_order_status"].includes(permission)));
  const canViewLogs = Boolean(user?.permissions.some(permission => ["view_kitchen_logs", "update_order_status"].includes(permission)));

  useEffect(() => {
    const restoreSession = window.setTimeout(() => {
      const savedUser = sessionStorage.getItem("dishup-user");
      setToken(sessionStorage.getItem("dishup-token") || "");
      setUser(savedUser ? JSON.parse(savedUser) : null);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreSession);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const config = await api("/kitchen/config", token);
      setStations(config.data.stations);
      if (view === "logs") {
        const result = await api("/kitchen/logs", token);
        setEvents(result.data.events || []);
        setItems([]);
      } else if (view === "history") {
        const result = await api("/kitchen/history", token);
        setTables(result.data.tables || []); setItems(result.data.items || []);
      } else if (view !== "station") {
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

  useEffect(() => {
    if (!focusTableId || view === "logs") return;
    const timer = window.setTimeout(() => {
      document.getElementById(`ticket-${focusTableId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [focusTableId, view, tables]);

  const updateStationSelection = async (status: "Cooking" | "Pickup") => {
    const stationSelection = items.filter(item => selected.includes(item.id));
    const allowed = status === "Cooking"
      ? stationSelection.every(item => ["Fired", "Remake"].includes(item.status))
      : stationSelection.every(item => item.status === "Cooking");
    if (!stationSelection.length || !allowed) return;
    setUpdating(stationSelection[0].id);
    try {
      await api("/kitchen/actions", token, {
        method: "POST",
        body: JSON.stringify({
          itemIds: stationSelection.map(item => item.id),
          action: status === "Cooking" ? "COOK" : "PICKUP"
        })
      });
      setSelected([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update station items.");
    } finally { setUpdating(null); }
  };

  const runAction = async (action: string, selectedReason = "") => {
    const allowed: Record<string, string[]> = {
      FIRE: ["Pending"], ASAP: ["Pending", "Fired", "Remake"], DONE: ["Pickup", "Ready"],
      FAIL: ["Fired", "Cooking", "Pickup", "Ready", "Served"],
      CANCEL: ["Pending", "Fired", "Cooking", "Pickup", "Ready", "Remake"]
    };
    const actionItems = tables.flatMap(table => table.items).filter(item => selected.includes(item.id));
    const selectedStatuses = actionItems.map(item => item.status);
    if (!selected.length || (allowed[action] && selectedStatuses.some(status => !allowed[action].includes(status)))) return;
    if (action === "RETURN" && actionItems.some(item => !item.previousStatus)) return;
    if (action === "FAIL" && !selectedReason) {
      setFailOpen(true);
      return;
    }
    setUpdating(selected[0]);
    try {
      await api(action === "RETURN" ? "/kitchen/return" : "/kitchen/actions", token, {
        method: "POST", body: JSON.stringify(action === "RETURN" ? { itemIds: selected } : { itemIds: selected, action, reason: selectedReason })
      });
      setFailOpen(false); setSelected([]); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kitchen action failed."); }
    finally { setUpdating(null); }
  };

  if (!hydrated) return null;

  if (token && user && !canViewDishUp) {
    return <AccessDenied user={user} onLogout={() => {
      sessionStorage.removeItem("dishup-token");
      sessionStorage.removeItem("dishup-user");
      setToken("");
      setUser(null);
    }} />;
  }

  if (!token || !user) return <Login onSuccess={(nextToken, nextUser) => {
    sessionStorage.setItem("dishup-token", nextToken);
    sessionStorage.setItem("dishup-user", JSON.stringify(nextUser));
    setToken(nextToken); setUser(nextUser);
  }} />;
  const selectedItems = tables.flatMap(table => table.items).filter(item => selected.includes(item.id));
  const selectedStatuses = selectedItems.map(item => item.status);
  const actionEnabled = (action: string) => {
    const allowed: Record<string, string[]> = {
      FIRE: ["Pending"], ASAP: ["Pending", "Fired", "Remake"], DONE: ["Pickup", "Ready"],
      FAIL: ["Fired", "Cooking", "Pickup", "Ready", "Served"],
      CANCEL: ["Pending", "Fired", "Cooking", "Pickup", "Ready", "Remake"],
      RETURN: ["Pending", "Fired", "Cooking", "Pickup", "Ready", "Served", "Remake", "Cancelled"]
    };
    if (!selectedStatuses.length) return false;
    if (action === "RETURN") return selectedItems.every(item => Boolean(item.previousStatus));
    return selectedStatuses.every(status => allowed[action].includes(status));
  };

  return <main className={`kds ${view === "station" ? "stationMode" : ""}`}>
    {view === "station" ? <header className="stationHeader">
      <div><small>MAISON LUCAS / KITCHEN STATION</small><h1>{stations.find(station => station.code === stationCode)?.name || stationCode}</h1></div>
      <div className="stationCommands">
        <button disabled={!selected.length || !items.filter(item => selected.includes(item.id)).every(item => ["Fired","Remake"].includes(item.status))} onClick={() => updateStationSelection("Cooking")}>START COOKING</button>
        <button disabled={!selected.length || !items.filter(item => selected.includes(item.id)).every(item => item.status === "Cooking")} onClick={() => updateStationSelection("Pickup")}>READY TO PICKUP</button>
        <button className="stationDeselect" disabled={!selected.length} onClick={() => setSelected([])}>DESELECT</button>
      </div>
      <div className="stationClock"><small>{clock.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"2-digit" })}</small><b>{clock.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" })}</b></div>
      <ThemeSwitcher />
      <div className="profileMenu">
        <button className="avatarButton" onClick={() => setProfileOpen(value => !value)}>{user.fullName.slice(0,1).toUpperCase()}</button>
        {profileOpen && <div className="profileDropdown"><b>{user.fullName}</b><small>{user.role}</small>
          <button onClick={() => { setView("dine"); setProfileOpen(false); }}>Return to Expeditor</button>
          {canWorkStation && <><p>SWITCH STATION</p><div className="stationChoices">{stations.map(station => <button key={station.code} onClick={() => { setStationCode(station.code); setProfileOpen(false); }}>{station.name}</button>)}</div></>}
          <button onClick={() => { sessionStorage.clear(); setToken(""); setUser(null); }}>Logout</button>
        </div>}
      </div>
    </header> : <header className="topbar">
      <div className="dateClock"><small>{clock.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"2-digit" })}</small><b>{clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</b></div>
      <nav className="viewSwitch">{[
        ["dine","Dine-in","◉",tables.length],["desserts","Desserts","△",items.filter(item => /dessert|pastry|cake/i.test(item.categoryName)).length],
        ["fired","Fired","♨",items.filter(item => ["Fired","Cooking","Pickup","Remake"].includes(item.status)).length],
        ["history","History","▣",0],["logs","Logs","◷",events.length]
      ].filter(([key]) => !["desserts", "fired"].includes(String(key)) && (key !== "logs" || canViewLogs)).map(([key,label,icon,count]) => <button key={String(key)} className={view === key ? "active" : ""} onClick={() => { setView(key as typeof view); setSelected([]); setFocusTableId(null); }}>
        <i>{icon}</i><span>{label}</span>{Number(count) > 0 && <em>{count}</em>}
      </button>)}</nav>
      {canExpedite && <div className={`commandBar ${selected.length ? "enabled" : "disabled"}`} aria-disabled={!selected.length}>
        <button disabled={!actionEnabled("FIRE")} className="fire" onClick={() => runAction("FIRE")}>FIRE</button><button disabled={!actionEnabled("ASAP")} className="asap" onClick={() => runAction("ASAP")}>ASAP</button>
        <button disabled={!actionEnabled("DONE")} className="done" onClick={() => runAction("DONE")}>DONE</button><button disabled={!actionEnabled("FAIL")} className="fail" onClick={() => setFailOpen(true)}>FAIL</button>
        <button disabled={!actionEnabled("CANCEL")} className="iconCommand cancel" title="Cancel" onClick={() => runAction("CANCEL")}>×</button>
        <button disabled={!actionEnabled("RETURN")} className="iconCommand" title="Return" onClick={() => runAction("RETURN")}>↶</button>
      </div>}
      <ThemeSwitcher />
      <div className="profileMenu">
        <button className="avatarButton" onClick={() => setProfileOpen(value => !value)}>{user.fullName.slice(0,1).toUpperCase()}</button>
        {profileOpen && <div className="profileDropdown"><b>{user.fullName}</b><small>{user.role}</small>
          <button onClick={() => { setView("dine"); setProfileOpen(false); }}>Join Expeditor</button>
          {canWorkStation && <><p>JOIN STATION</p>
          <div className="stationChoices">{stations.map(station => <button key={station.code} onClick={() => { setStationCode(station.code); setView("station"); setProfileOpen(false); }}>{station.name}</button>)}</div></>}
          <button onClick={() => { sessionStorage.clear(); setToken(""); setUser(null); }}>Logout</button>
        </div>}
      </div>
    </header>}

    {error && <div className="errorbar">{error}<button onClick={load}>Retry</button></div>}

    {failOpen && <div className="failOverlay" role="presentation" onMouseDown={() => setFailOpen(false)}>
      <section className="failDialog" role="dialog" aria-modal="true" aria-label="Select remake reason" onMouseDown={event => event.stopPropagation()}>
        <header><div><small>REMAKE ITEM</small><h2>Select failure reason</h2></div><button onClick={() => setFailOpen(false)}>×</button></header>
        <p>Tap one reason to send the selected item(s) back as an ASAP remake.</p>
        <div>{["Skill fail","Ingredient fail","Quality fail","Temperature fail","Dropped or damaged","Guest request"].map(reason =>
          <button key={reason} onClick={() => runAction("FAIL", reason)}>{reason}</button>)}</div>
      </section>
    </div>}

    {view === "logs" ? <LogsBoard events={events} filter={filter} onFilter={setFilter} onOpen={async event => {
      setFocusTableId(event.tableId);
      setFilter("all");
      const expected = await api("/kitchen/expected", token);
      setView((expected.data.tables || []).some((table: TableTicket) => table.tableId === event.tableId) ? "dine" : "history");
    }} /> : view !== "station"
      ? <ExpectedBoard tables={tables} selected={selected} onSelect={id => canExpedite && setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} mode={view} filter={filter} onFilter={setFilter} onClear={() => setSelected([])} />
      : <StationBoard items={items} updating={updating} selected={selected} onSelect={id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} />}
  </main>;
}

function LogsBoard({ events, filter, onFilter, onOpen }: { events: KitchenEvent[]; filter: string; onFilter:(value:string)=>void; onOpen:(event:KitchenEvent)=>void | Promise<void> }) {
  const statuses = ["all","Pending","Fired","Cooking","Pickup","Served","Remake","Cancelled"];
  const visible = filter === "all" ? events : events.filter(event => event.toStatus.toLowerCase() === filter.toLowerCase());
  return <section className="logsPage"><div className="logFilters">{statuses.map(status => <button className={filter.toLowerCase() === status.toLowerCase() ? "active" : ""} onClick={() => onFilter(status)} key={status}>{status}</button>)}</div>
    <div className="logTable"><header><span>Time</span><span>Table</span><span>Item</span><span>Dish name</span><span>Status</span><span>Action by</span></header>
    {visible.map(event => <article role="button" tabIndex={0} onClick={() => onOpen(event)} onKeyDown={key => key.key === "Enter" && onOpen(event)} key={event.id}><time>{new Date(event.createdAt).toLocaleString("en-GB")}</time><b>{event.tableId}</b><span>#{event.orderItemId}</span><strong>{event.productName || `Item #${event.orderItemId}`}</strong><em>{event.toStatus}</em><span>{event.performerName || "System"}</span></article>)}</div></section>;
}

function ExpectedBoard({ tables, selected, onSelect, mode, filter, onFilter, onClear }: {
  tables: TableTicket[];
  selected: number[]; onSelect: (id: number) => void; mode: string; filter: string; onFilter: (value: string) => void; onClear: () => void;
}) {
  const [page, setPage] = useState(1);
  const matches = (item: KitchenItem) => {
    if (mode === "desserts" && !/dessert|pastry|cake|ice cream/i.test(item.categoryName)) return false;
    if (mode === "fired" && !["Fired","Cooking","Pickup","Ready","Remake"].includes(item.status)) return false;
    if (filter === "new") return item.status === "Pending";
    if (filter === "overtime") return item.status === "Cooking" && Boolean(item.cookingAt) && remainingSeconds(item) < 0;
    if (filter === "cooking") return item.status === "Cooking";
    if (filter === "pickup") return ["Pickup","Ready"].includes(item.status);
    if (filter === "remake") return item.status === "Remake" || item.priority === "REMAKE";
    return true;
  };
  const visibleTables = tables.map(table => ({ ...table, items: table.items.filter(matches) })).filter(table => table.items.length);
  const totalPages = Math.max(1, Math.ceil(visibleTables.length / 5));
  const safePage = Math.min(page, totalPages);
  const pageTables = visibleTables.slice((safePage - 1) * 5, safePage * 5);
  const filterCount = (value:string) => tables.flatMap(table => table.items).filter(item => value === "all" || (value === "new" && item.status === "Pending") || (value === "overtime" && item.status === "Cooking" && Boolean(item.cookingAt) && remainingSeconds(item) < 0) || (value === "cooking" && item.status === "Cooking") || (value === "pickup" && ["Pickup","Ready"].includes(item.status)) || (value === "remake" && (item.status === "Remake" || item.priority === "REMAKE"))).length;
  return <><div className="queueTools"><div>{["all","new","overtime","cooking","pickup","remake"].map(value =>
    <button key={value} className={filter === value ? "active" : ""} onClick={() => { setPage(1); onFilter(value); }}><b>{filterCount(value)}</b><span>{value}</span></button>)}</div>
    <div className={`selectionControls ${selected.length ? "enabled" : "disabled"}`}><b>{selected.length} selected</b><button disabled={!selected.length} onClick={onClear}>Deselect all</button></div>
    <aside>{selected.length > 0 && <><b>{selected.length} selected</b><button onClick={onClear}>Deselect all</button></>}<span className="pager"><button onClick={() => setPage(1)} disabled={safePage === 1}>≪</button><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={safePage === 1}>‹</button><b>{safePage} / {totalPages}</b><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={safePage === totalPages}>›</button><button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>≫</button></span></aside></div>
  {!visibleTables.length ? <Empty /> : <section className={`expectedGrid ${mode === "history" ? "historyGrid" : ""}`}>{pageTables.map(ticket => {
    const ready = ticket.items.filter(item => item.status === "Ready").length;
    const allReady = ready === ticket.items.length;
    const late = ticket.items.some(item => item.status === "Cooking" && Boolean(item.cookingAt) && remainingSeconds(item) < 0);
    return <article id={`ticket-${ticket.tableId}`} className={`tableTicket ${late ? "late" : ""} ${allReady ? "complete" : ""}`} key={ticket.billId || ticket.orderId || ticket.tableId}>
      <div className="ticketHead">
        <div><p>{String(ticket.nationality || ticket.guestLanguage || "--").slice(0,3).toUpperCase()} / {ticket.guestCount || "?"} GUESTS</p><h2>{ticket.tableName}</h2></div>
        <div className="ticketOrderer"><small>LAST ORDER BY</small><b>{ticket.orderedByName || "Staff"}</b></div>
        <div className="ticketTime"><b>{mode === "history" ? Number(ticket.durationMinutes || 0) : elapsed(ticket.billCreatedAt || ticket.earliestExpectedAt || new Date().toISOString())}</b><span>{mode === "history" ? "TOTAL MIN" : "BILL MIN"}</span></div>
      </div>
      {ticket.allergies.length > 0 && <div className="allergyHeader"><span>{ticket.allergies.join(" / ")}</span></div>}
      {ticket.tableNote && <div className={`requestHeader request-${ticket.tableNote.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}><span>{ticket.tableNote}</span></div>}
      <div className="courseStrip">{(ticket.courseTiming || "ALL_NOW").replace("_", " ")}</div>
      <div className="ticketItems">{ticket.items.slice().sort((left, right) => left.stationName.localeCompare(right.stationName) || left.id - right.id).map((item, index, sortedItems) => <div data-station={item.stationName} onClick={() => onSelect(item.id)} className={`expectedItem ${index === 0 || sortedItems[index - 1].stationName !== item.stationName ? "stationStart" : ""} ${item.status.toLowerCase()} ${selected.includes(item.id) ? "selected" : ""} ${mode === "history" ? "historyItem" : ""}`} key={item.id}>
        {mode !== "history" && item.cookingAt && <span className={`progressFill ${progressTone(item)}`} style={{ width: `${progressPercent(item)}%` }} />}
        {(index === 0 || sortedItems[index - 1].stationName !== item.stationName) && <span className="stationLabel" aria-label={`Station group: ${item.stationName}`} />}
        <span className="qty">{item.quantity}</span>
        <div><b>{item.productName}</b>{itemNoteWithoutDietaryAlert(item.note) && <small>{itemNoteWithoutDietaryAlert(item.note)}</small>}</div>
        <div className="itemState">
          <time>{mode === "history" ? statusChangedAt(item) : item.status === "Cooking" ? countdown(item) : statusChangedAt(item)}</time>
          <em>{item.status}</em>
        </div>
      </div>)}</div>
    </article>;
  })}</section>}</>;
}

function StationBoard({ items, updating, selected, onSelect }: { items: KitchenItem[]; updating: number | null; selected: number[]; onSelect: (id: number) => void }) {
  const groups = [
    { title: "Waiting", statuses: ["Pending", "Fired", "Remake"] },
    { title: "Cooking", statuses: ["Cooking"] },
    { title: "Pickup", statuses: ["Pickup", "Ready"] }
  ];
  return <section className="stationBoard">{groups.map(group => <div className="stationColumn" key={group.title}>
    <header><h2>{group.title}</h2><span>{items.filter(item => group.statuses.includes(item.status)).length}</span></header>
    <div className="stationList">{items.filter(item => group.statuses.includes(item.status)).map(item =>
      <article onClick={() => !updating && onSelect(item.id)} className={`stationCard ${item.overdue ? "overdue" : ""} ${item.status.toLowerCase()} ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
        {item.status === "Cooking" && <span
          className={`stationProgress ${progressTone(item)}`}
          style={{ width: `${progressPercent(item)}%` }}
        />}
        <div className="stationCardRow">
          <div className="stationTable"><b>{item.tableName}</b><small>#{item.orderNumber || "-"}</small></div>
          <b>{item.quantity}</b>
          <div className="stationDish"><h3>{item.productName}</h3>{item.note && <small>{item.note}</small>}</div>
          <div className="stationState">{item.status === "Cooking" && <time className={remainingSeconds(item) < 0 ? "late" : ""}>{countdown(item)}</time>}<em>{item.status}</em></div>
        </div>
      </article>)}</div>
  </div>)}</section>;
}

function Empty() {
  return <div className="empty"><span>OK</span><h2>Kitchen is clear</h2><p>New items will appear here automatically.</p></div>;
}

function AccessDenied({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <main className="loginPage"><form onSubmit={event => { event.preventDefault(); onLogout(); }}>
    <div className="loginMark">ML</div>
    <p>MAISON LUCAS / KITCHEN</p>
    <h1>Kitchen access required</h1>
    <span>{user.fullName} / {user.role}</span>
    <div className="loginError">This role does not have the Update Order Status permission. Grant it in Roles &amp; Access or sign in with a kitchen account.</div>
    <button>Sign in with another account</button>
  </form></main>;
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
      if (!json.user.permissions.includes("update_order_status")) throw new Error("This account cannot operate Dish Up.");
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
