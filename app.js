/* ============================================================
   DJ ClientFlow — client, gig & invoice manager for DJs
   All data lives in localStorage. No server required.
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "djclientflow.v1";

  /* ---------------- State ---------------- */

  const defaultSettings = () => ({
    businessName: "My DJ Business",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    currency: "USD",
    taxRate: 0,
    invoicePrefix: "INV-",
    nextInvoiceNumber: 1,
    paymentInstructions: "Payment accepted via Venmo, Zelle, or check. Thank you for your business!",
    defaultDueDays: 14,
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          settings: { ...defaultSettings(), ...(parsed.settings || {}) },
          clients: parsed.clients || [],
          events: parsed.events || [],
          invoices: parsed.invoices || [],
        };
      }
    } catch (e) { console.error("Failed to load data", e); }
    return { settings: defaultSettings(), clients: [], events: [], invoices: [] };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.getElementById("sidebarBizName").textContent = state.settings.businessName || "DJ ClientFlow";
  }

  /* ---------------- Utils ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function money(n) {
    const cur = state.settings.currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n || 0);
    } catch {
      return "$" + (n || 0).toFixed(2);
    }
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addDaysISO(iso, days) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Parse YYYY-MM-DD as a local date (avoids UTC off-by-one).
  function parseISO(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtDateShort(iso) {
    if (!iso) return "—";
    return parseISO(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function fmtTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function clientById(id) { return state.clients.find(c => c.id === id); }
  function eventById(id) { return state.events.find(e => e.id === id); }
  function invoiceById(id) { return state.invoices.find(i => i.id === id); }
  function clientName(id) { const c = clientById(id); return c ? c.name : "Unknown client"; }

  /* ---------------- Invoice math & status ---------------- */

  function invSubtotal(inv) {
    return (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  }
  function invTax(inv) { return invSubtotal(inv) * ((Number(inv.taxRate) || 0) / 100); }
  function invTotal(inv) { return invSubtotal(inv) + invTax(inv) - (Number(inv.discount) || 0); }

  // "sent" invoices past their due date display as overdue.
  function invStatus(inv) {
    if (inv.status === "sent" && inv.dueDate && inv.dueDate < todayISO()) return "overdue";
    return inv.status;
  }

  const STATUS_LABEL = {
    draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue",
    inquiry: "Inquiry", booked: "Booked", completed: "Completed", cancelled: "Cancelled",
  };

  function badge(status) {
    return `<span class="badge badge-${status}">${STATUS_LABEL[status] || status}</span>`;
  }

  /* ---------------- Toast ---------------- */

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  /* ---------------- Modal ---------------- */

  function openModal(html, large = false) {
    const overlay = $("#modalOverlay");
    const modal = $("#modal");
    modal.className = "modal" + (large ? " modal-lg" : "");
    modal.innerHTML = html;
    overlay.classList.remove("hidden");
    $(".modal-close", modal)?.addEventListener("click", closeModal);
    const firstInput = $("input, select, textarea", modal);
    if (firstInput) setTimeout(() => firstInput.focus(), 40);
  }

  function closeModal() {
    $("#modalOverlay").classList.add("hidden");
    $("#modal").innerHTML = "";
  }

  $("#modalOverlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  function modalShell(title, bodyHtml) {
    return `
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(title)}</div>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>
      ${bodyHtml}`;
  }

  /* ---------------- Router ---------------- */

  let currentView = "dashboard";
  let calCursor = new Date(); // month shown on calendar

  const views = {
    dashboard: renderDashboard,
    clients: renderClients,
    events: renderEvents,
    invoices: renderInvoices,
    calendar: renderCalendar,
    settings: renderSettings,
  };

  function go(view) {
    currentView = view;
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    render();
  }

  function render() {
    (views[currentView] || renderDashboard)($("#main"));
  }

  $$(".nav-item").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.view)));

  /* ================= DASHBOARD ================= */

  function renderDashboard(root) {
    const today = todayISO();
    const year = new Date().getFullYear();

    const upcoming = state.events
      .filter(e => e.date >= today && e.status !== "cancelled" && e.status !== "completed")
      .sort((a, b) => a.date.localeCompare(b.date));

    const paidThisYear = state.invoices
      .filter(i => i.status === "paid" && (i.paidDate || i.issueDate || "").startsWith(String(year)))
      .reduce((s, i) => s + invTotal(i), 0);

    const outstanding = state.invoices
      .filter(i => invStatus(i) === "sent" || invStatus(i) === "overdue")
      .reduce((s, i) => s + invTotal(i), 0);

    const overdueCount = state.invoices.filter(i => invStatus(i) === "overdue").length;

    const recentInvoices = [...state.invoices]
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""))
      .slice(0, 6);

    const isEmpty = !state.clients.length && !state.events.length && !state.invoices.length;

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Dashboard</div>
          <div class="view-sub">Welcome back${state.settings.ownerName ? ", " + escapeHtml(state.settings.ownerName) : ""}! Here's what's happening.</div>
        </div>
        <div class="header-actions">
          <button class="btn" id="dashNewClient">+ Client</button>
          <button class="btn" id="dashNewEvent">+ Gig</button>
          <button class="btn btn-primary" id="dashNewInvoice">+ Invoice</button>
        </div>
      </div>

      ${isEmpty ? `
        <div class="card card-pad empty-state">
          <div class="big">🎧</div>
          <p><strong>Welcome to ${escapeHtml(state.settings.businessName)}!</strong><br>
          Add your first client to get rolling, or load sample data to explore the app.</p>
          <button class="btn btn-primary" id="loadSample">Load sample data</button>
          <button class="btn" id="emptyAddClient">Add my first client</button>
        </div>` : ""}

      <div class="stat-grid">
        <div class="card stat">
          <div class="stat-label">Upcoming gigs</div>
          <div class="stat-value">${upcoming.length}</div>
          <div class="stat-note">${upcoming[0] ? "Next: " + fmtDateShort(upcoming[0].date) : "Nothing booked yet"}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Collected in ${year}</div>
          <div class="stat-value pos">${money(paidThisYear)}</div>
          <div class="stat-note">Paid invoices</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Outstanding</div>
          <div class="stat-value ${outstanding > 0 ? "warn" : ""}">${money(outstanding)}</div>
          <div class="stat-note">${overdueCount ? `⚠️ ${overdueCount} overdue` : "Awaiting payment"}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Clients</div>
          <div class="stat-value">${state.clients.length}</div>
          <div class="stat-note">In your book</div>
        </div>
      </div>

      <div class="two-col">
        <div class="card card-pad">
          <div class="card-title">Next gigs</div>
          ${upcoming.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Event</th><th>Client</th><th></th></tr></thead>
            <tbody>
              ${upcoming.slice(0, 6).map(e => `
                <tr class="clickable" data-open-event="${e.id}">
                  <td class="nowrap">${fmtDateShort(e.date)}${e.startTime ? `<span class="sub">${fmtTime(e.startTime)}</span>` : ""}</td>
                  <td>${escapeHtml(e.title)}<span class="sub">${escapeHtml(e.venue || "")}</span></td>
                  <td>${escapeHtml(clientName(e.clientId))}</td>
                  <td>${badge(e.status)}</td>
                </tr>`).join("")}
            </tbody></table></div>`
          : `<div class="empty-state"><p>No upcoming gigs. Time to book some!</p></div>`}
        </div>

        <div class="card card-pad">
          <div class="card-title">Recent invoices</div>
          ${recentInvoices.length ? `<div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Client</th><th class="right">Amount</th><th></th></tr></thead>
            <tbody>
              ${recentInvoices.map(i => `
                <tr class="clickable" data-open-invoice="${i.id}">
                  <td class="nowrap">${escapeHtml(i.number)}</td>
                  <td>${escapeHtml(clientName(i.clientId))}<span class="sub">${fmtDate(i.issueDate)}</span></td>
                  <td class="right nowrap">${money(invTotal(i))}</td>
                  <td>${badge(invStatus(i))}</td>
                </tr>`).join("")}
            </tbody></table></div>`
          : `<div class="empty-state"><p>No invoices yet.</p></div>`}
        </div>
      </div>`;

    $("#dashNewClient", root).addEventListener("click", () => openClientForm());
    $("#dashNewEvent", root).addEventListener("click", () => openEventForm());
    $("#dashNewInvoice", root).addEventListener("click", () => openInvoiceForm());
    $("#loadSample", root)?.addEventListener("click", loadSampleData);
    $("#emptyAddClient", root)?.addEventListener("click", () => openClientForm());
    bindRowOpeners(root);
  }

  function bindRowOpeners(root) {
    $$("[data-open-event]", root).forEach(el =>
      el.addEventListener("click", () => openEventDetail(el.dataset.openEvent)));
    $$("[data-open-invoice]", root).forEach(el =>
      el.addEventListener("click", () => openInvoiceDetail(el.dataset.openInvoice)));
    $$("[data-open-client]", root).forEach(el =>
      el.addEventListener("click", () => openClientDetail(el.dataset.openClient)));
  }

  /* ================= CLIENTS ================= */

  let clientSearch = "";

  function renderClients(root) {
    const q = clientSearch.toLowerCase();
    const list = state.clients
      .filter(c => !q || [c.name, c.email, c.phone, c.company].join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Clients</div>
          <div class="view-sub">${state.clients.length} client${state.clients.length === 1 ? "" : "s"} in your book</div>
        </div>
        <div class="header-actions">
          <input class="search-input" id="clientSearch" placeholder="Search clients…" value="${escapeHtml(clientSearch)}">
          <button class="btn btn-primary" id="addClient">+ New client</button>
        </div>
      </div>

      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Gigs</th><th class="right">Lifetime paid</th><th></th></tr></thead>
          <tbody>
            ${list.map(c => {
              const gigs = state.events.filter(e => e.clientId === c.id);
              const paid = state.invoices.filter(i => i.clientId === c.id && i.status === "paid")
                .reduce((s, i) => s + invTotal(i), 0);
              return `
              <tr class="clickable" data-open-client="${c.id}">
                <td><strong>${escapeHtml(c.name)}</strong>${c.company ? `<span class="sub">${escapeHtml(c.company)}</span>` : ""}</td>
                <td>${escapeHtml(c.email || "—")}<span class="sub">${escapeHtml(c.phone || "")}</span></td>
                <td>${gigs.length}</td>
                <td class="right nowrap">${money(paid)}</td>
                <td class="right nowrap">
                  <button class="btn btn-sm" data-edit-client="${c.id}">Edit</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody></table></div>`
        : `<div class="empty-state"><div class="big">👥</div><p>${q ? "No clients match your search." : "No clients yet. Add your first one!"}</p>
           ${q ? "" : `<button class="btn btn-primary" id="emptyAddClient2">+ New client</button>`}</div>`}
      </div>`;

    $("#addClient", root).addEventListener("click", () => openClientForm());
    $("#emptyAddClient2", root)?.addEventListener("click", () => openClientForm());
    const search = $("#clientSearch", root);
    search.addEventListener("input", () => {
      clientSearch = search.value;
      renderClients(root);
      const s = $("#clientSearch", root);
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    });
    $$("[data-edit-client]", root).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      openClientForm(b.dataset.editClient);
    }));
    bindRowOpeners(root);
  }

  function openClientForm(id) {
    const c = id ? clientById(id) : null;
    openModal(modalShell(c ? "Edit client" : "New client", `
      <form id="clientForm">
        <div class="form-grid">
          <div class="field full"><label>Name *</label><input name="name" required value="${escapeHtml(c?.name || "")}" placeholder="e.g. Sarah Johnson"></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(c?.email || "")}" placeholder="sarah@email.com"></div>
          <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(c?.phone || "")}" placeholder="(555) 123-4567"></div>
          <div class="field"><label>Company / Organization</label><input name="company" value="${escapeHtml(c?.company || "")}" placeholder="Optional"></div>
          <div class="field"><label>How they found you</label><input name="source" value="${escapeHtml(c?.source || "")}" placeholder="Referral, Instagram…"></div>
          <div class="field full"><label>Notes</label><textarea name="notes" placeholder="Preferences, music taste, do-not-play list…">${escapeHtml(c?.notes || "")}</textarea></div>
        </div>
        <div class="modal-actions">
          ${c ? `<button type="button" class="btn btn-danger" id="deleteClient">Delete</button>` : ""}
          <button type="button" class="btn" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary">${c ? "Save changes" : "Add client"}</button>
        </div>
      </form>`));

    $("#cancelModal").addEventListener("click", closeModal);
    $("#deleteClient")?.addEventListener("click", () => {
      const hasData = state.events.some(e => e.clientId === id) || state.invoices.some(i => i.clientId === id);
      const msg = hasData
        ? "This client has gigs and/or invoices linked to them, which will be kept but unlinked. Delete anyway?"
        : "Delete this client?";
      if (!confirm(msg)) return;
      state.clients = state.clients.filter(x => x.id !== id);
      save(); closeModal(); render(); toast("Client deleted");
    });
    $("#clientForm").addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (c) Object.assign(c, data);
      else state.clients.push({ id: uid(), createdAt: todayISO(), ...data });
      save(); closeModal(); render();
      toast(c ? "Client updated" : "Client added");
    });
  }

  function openClientDetail(id) {
    const c = clientById(id);
    if (!c) return;
    const gigs = state.events.filter(e => e.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
    const invs = state.invoices.filter(i => i.clientId === id).sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));
    const paid = invs.filter(i => i.status === "paid").reduce((s, i) => s + invTotal(i), 0);

    openModal(modalShell(c.name, `
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Email</div><div class="val">${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : "—"}</div></div>
        <div class="detail-item"><div class="lbl">Phone</div><div class="val">${escapeHtml(c.phone || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Company</div><div class="val">${escapeHtml(c.company || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Source</div><div class="val">${escapeHtml(c.source || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Lifetime paid</div><div class="val"><strong>${money(paid)}</strong></div></div>
      </div>
      ${c.notes ? `<div class="section-label">Notes</div><div class="notes-box">${escapeHtml(c.notes)}</div>` : ""}

      <div class="section-label">Gigs (${gigs.length})</div>
      ${gigs.length ? `<div class="table-wrap"><table><tbody>
        ${gigs.map(e => `<tr class="clickable" data-open-event="${e.id}">
          <td class="nowrap">${fmtDate(e.date)}</td><td>${escapeHtml(e.title)}</td><td>${badge(e.status)}</td>
        </tr>`).join("")}
      </tbody></table></div>` : `<div class="notes-box">No gigs yet for this client.</div>`}

      <div class="section-label">Invoices (${invs.length})</div>
      ${invs.length ? `<div class="table-wrap"><table><tbody>
        ${invs.map(i => `<tr class="clickable" data-open-invoice="${i.id}">
          <td class="nowrap">${escapeHtml(i.number)}</td><td class="right nowrap">${money(invTotal(i))}</td><td>${badge(invStatus(i))}</td>
        </tr>`).join("")}
      </tbody></table></div>` : `<div class="notes-box">No invoices yet for this client.</div>`}

      <div class="modal-actions">
        <button class="btn" id="detailNewGig">+ Gig for this client</button>
        <button class="btn" id="detailNewInv">+ Invoice</button>
        <button class="btn btn-primary" id="detailEdit">Edit client</button>
      </div>`, ), true);

    $("#detailEdit").addEventListener("click", () => openClientForm(id));
    $("#detailNewGig").addEventListener("click", () => openEventForm(null, id));
    $("#detailNewInv").addEventListener("click", () => openInvoiceForm(null, { clientId: id }));
    bindRowOpeners($("#modal"));
  }

  /* ================= EVENTS / GIGS ================= */

  let eventFilter = "upcoming";

  const EVENT_TYPES = ["Wedding", "Birthday", "Corporate", "Club Night", "School Dance", "Private Party", "Festival", "Other"];

  function renderEvents(root) {
    const today = todayISO();
    let list = [...state.events];
    if (eventFilter === "upcoming") list = list.filter(e => e.date >= today && e.status !== "cancelled");
    else if (eventFilter === "past") list = list.filter(e => e.date < today);
    else if (eventFilter !== "all") list = list.filter(e => e.status === eventFilter);
    list.sort((a, b) => eventFilter === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));

    const chips = [
      ["upcoming", "Upcoming"], ["all", "All"], ["inquiry", "Inquiries"],
      ["booked", "Booked"], ["completed", "Completed"], ["past", "Past"],
    ];

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Gigs &amp; Events</div>
          <div class="view-sub">Track every booking from inquiry to encore</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="addEvent">+ New gig</button>
        </div>
      </div>

      <div class="filter-row">
        ${chips.map(([k, lbl]) => `<button class="chip ${eventFilter === k ? "active" : ""}" data-filter="${k}">${lbl}</button>`).join("")}
      </div>

      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Event</th><th>Client</th><th>Venue</th><th class="right">Fee</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${list.map(e => `
              <tr class="clickable" data-open-event="${e.id}">
                <td class="nowrap">${fmtDateShort(e.date)}${e.startTime ? `<span class="sub">${fmtTime(e.startTime)}${e.endTime ? " – " + fmtTime(e.endTime) : ""}</span>` : ""}</td>
                <td><strong>${escapeHtml(e.title)}</strong><span class="sub">${escapeHtml(e.type || "")}</span></td>
                <td>${escapeHtml(clientName(e.clientId))}</td>
                <td>${escapeHtml(e.venue || "—")}</td>
                <td class="right nowrap">${e.fee ? money(e.fee) : "—"}</td>
                <td>${badge(e.status)}</td>
                <td class="right nowrap"><button class="btn btn-sm" data-edit-event="${e.id}">Edit</button></td>
              </tr>`).join("")}
          </tbody></table></div>`
        : `<div class="empty-state"><div class="big">🎶</div><p>No gigs here yet.</p>
           <button class="btn btn-primary" id="emptyAddEvent">+ New gig</button></div>`}
      </div>`;

    $("#addEvent", root).addEventListener("click", () => openEventForm());
    $("#emptyAddEvent", root)?.addEventListener("click", () => openEventForm());
    $$("[data-filter]", root).forEach(ch => ch.addEventListener("click", () => {
      eventFilter = ch.dataset.filter;
      renderEvents(root);
    }));
    $$("[data-edit-event]", root).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      openEventForm(b.dataset.editEvent);
    }));
    bindRowOpeners(root);
  }

  function clientOptions(selectedId) {
    const opts = [...state.clients].sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`);
    return `<option value="">— Select client —</option>` + opts.join("");
  }

  function openEventForm(id, presetClientId) {
    const ev = id ? eventById(id) : null;
    if (!state.clients.length) {
      toast("Add a client first — gigs are linked to clients");
      openClientForm();
      return;
    }
    openModal(modalShell(ev ? "Edit gig" : "New gig", `
      <form id="eventForm">
        <div class="form-grid">
          <div class="field full"><label>Event title *</label><input name="title" required value="${escapeHtml(ev?.title || "")}" placeholder="e.g. Johnson Wedding Reception"></div>
          <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(ev?.clientId || presetClientId)}</select></div>
          <div class="field"><label>Event type</label>
            <select name="type">${EVENT_TYPES.map(t => `<option ${ev?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Date *</label><input name="date" type="date" required value="${escapeHtml(ev?.date || todayISO())}"></div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${["inquiry", "booked", "completed", "cancelled"].map(s => `<option value="${s}" ${(ev?.status || "inquiry") === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Start time</label><input name="startTime" type="time" value="${escapeHtml(ev?.startTime || "")}"></div>
          <div class="field"><label>End time</label><input name="endTime" type="time" value="${escapeHtml(ev?.endTime || "")}"></div>
          <div class="field"><label>Venue</label><input name="venue" value="${escapeHtml(ev?.venue || "")}" placeholder="The Grand Ballroom"></div>
          <div class="field"><label>Venue address</label><input name="address" value="${escapeHtml(ev?.address || "")}" placeholder="123 Main St"></div>
          <div class="field"><label>Guest count</label><input name="guestCount" type="number" min="0" value="${escapeHtml(ev?.guestCount || "")}"></div>
          <div class="field"><label>Performance fee</label><input name="fee" type="number" min="0" step="0.01" value="${escapeHtml(ev?.fee || "")}" placeholder="0.00"></div>
          <div class="field full"><label>Client needs &amp; requests</label><textarea name="needs" placeholder="Equipment, special songs, first dance, MC duties, uplighting…">${escapeHtml(ev?.needs || "")}</textarea></div>
          <div class="field full"><label>Internal notes</label><textarea name="notes" placeholder="Load-in details, contact on site, parking…">${escapeHtml(ev?.notes || "")}</textarea></div>
        </div>
        <div class="modal-actions">
          ${ev ? `<button type="button" class="btn btn-danger" id="deleteEvent">Delete</button>` : ""}
          <button type="button" class="btn" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary">${ev ? "Save changes" : "Add gig"}</button>
        </div>
      </form>`), true);

    $("#cancelModal").addEventListener("click", closeModal);
    $("#deleteEvent")?.addEventListener("click", () => {
      if (!confirm("Delete this gig?")) return;
      state.events = state.events.filter(x => x.id !== id);
      save(); closeModal(); render(); toast("Gig deleted");
    });
    $("#eventForm").addEventListener("submit", e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.fee = data.fee ? Number(data.fee) : "";
      if (ev) Object.assign(ev, data);
      else state.events.push({ id: uid(), ...data });
      save(); closeModal(); render();
      toast(ev ? "Gig updated" : "Gig added");
    });
  }

  function openEventDetail(id) {
    const e = eventById(id);
    if (!e) return;
    const c = clientById(e.clientId);
    const invs = state.invoices.filter(i => i.eventId === id);

    openModal(modalShell(e.title, `
      <div style="margin-bottom:14px">${badge(e.status)}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Date</div><div class="val">${fmtDateShort(e.date)}</div></div>
        <div class="detail-item"><div class="lbl">Time</div><div class="val">${e.startTime ? fmtTime(e.startTime) + (e.endTime ? " – " + fmtTime(e.endTime) : "") : "—"}</div></div>
        <div class="detail-item"><div class="lbl">Type</div><div class="val">${escapeHtml(e.type || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Client</div><div class="val">${c ? `<a href="#" data-open-client="${c.id}">${escapeHtml(c.name)}</a>` : "—"}</div></div>
        <div class="detail-item"><div class="lbl">Venue</div><div class="val">${escapeHtml(e.venue || "—")}${e.address ? `<br><span style="color:var(--muted);font-size:12.5px">${escapeHtml(e.address)}</span>` : ""}</div></div>
        <div class="detail-item"><div class="lbl">Guests</div><div class="val">${escapeHtml(e.guestCount || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Fee</div><div class="val"><strong>${e.fee ? money(e.fee) : "—"}</strong></div></div>
      </div>
      ${e.needs ? `<div class="section-label">Client needs &amp; requests</div><div class="notes-box">${escapeHtml(e.needs)}</div>` : ""}
      ${e.notes ? `<div class="section-label">Internal notes</div><div class="notes-box">${escapeHtml(e.notes)}</div>` : ""}
      ${invs.length ? `<div class="section-label">Linked invoices</div>
        <div class="table-wrap"><table><tbody>${invs.map(i => `
          <tr class="clickable" data-open-invoice="${i.id}"><td>${escapeHtml(i.number)}</td><td class="right">${money(invTotal(i))}</td><td>${badge(invStatus(i))}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
      <div class="modal-actions">
        <button class="btn" id="evInvoice">Create invoice for this gig</button>
        <button class="btn btn-primary" id="evEdit">Edit gig</button>
      </div>`), true);

    $("#evEdit").addEventListener("click", () => openEventForm(id));
    $("#evInvoice").addEventListener("click", () => openInvoiceForm(null, { clientId: e.clientId, eventId: id }));
    bindRowOpeners($("#modal"));
  }

  /* ================= INVOICES ================= */

  let invoiceFilter = "all";

  function renderInvoices(root) {
    let list = [...state.invoices];
    if (invoiceFilter !== "all") list = list.filter(i => invStatus(i) === invoiceFilter);
    list.sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));

    const chips = [["all", "All"], ["draft", "Drafts"], ["sent", "Sent"], ["overdue", "Overdue"], ["paid", "Paid"]];

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Invoices</div>
          <div class="view-sub">Create, send and track payments</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="addInvoice">+ New invoice</button>
        </div>
      </div>

      <div class="filter-row">
        ${chips.map(([k, lbl]) => `<button class="chip ${invoiceFilter === k ? "active" : ""}" data-filter="${k}">${lbl}</button>`).join("")}
      </div>

      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Client</th><th>Issued</th><th>Due</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${list.map(i => `
              <tr class="clickable" data-open-invoice="${i.id}">
                <td class="nowrap"><strong>${escapeHtml(i.number)}</strong></td>
                <td>${escapeHtml(clientName(i.clientId))}${i.eventId && eventById(i.eventId) ? `<span class="sub">${escapeHtml(eventById(i.eventId).title)}</span>` : ""}</td>
                <td class="nowrap">${fmtDate(i.issueDate)}</td>
                <td class="nowrap">${fmtDate(i.dueDate)}</td>
                <td class="right nowrap"><strong>${money(invTotal(i))}</strong></td>
                <td>${badge(invStatus(i))}</td>
                <td class="right nowrap"><button class="btn btn-sm" data-edit-invoice="${i.id}">Edit</button></td>
              </tr>`).join("")}
          </tbody></table></div>`
        : `<div class="empty-state"><div class="big">📄</div><p>No invoices here yet.</p>
           <button class="btn btn-primary" id="emptyAddInvoice">+ New invoice</button></div>`}
      </div>`;

    $("#addInvoice", root).addEventListener("click", () => openInvoiceForm());
    $("#emptyAddInvoice", root)?.addEventListener("click", () => openInvoiceForm());
    $$("[data-filter]", root).forEach(ch => ch.addEventListener("click", () => {
      invoiceFilter = ch.dataset.filter;
      renderInvoices(root);
    }));
    $$("[data-edit-invoice]", root).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      openInvoiceForm(b.dataset.editInvoice);
    }));
    bindRowOpeners(root);
  }

  function lineItemRowHtml(item = { desc: "", qty: 1, rate: "" }) {
    return `
      <div class="line-item-row">
        <input class="li-desc" placeholder="Description (e.g. DJ services — 5 hours)" value="${escapeHtml(item.desc)}">
        <input class="li-qty" type="number" min="0" step="0.5" value="${escapeHtml(item.qty)}">
        <input class="li-rate" type="number" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(item.rate)}">
        <div class="line-item-total">$0.00</div>
        <button type="button" class="remove-line" title="Remove line">✕</button>
      </div>`;
  }

  function openInvoiceForm(id, preset = {}) {
    const inv = id ? invoiceById(id) : null;
    if (!state.clients.length) {
      toast("Add a client first — invoices are billed to clients");
      openClientForm();
      return;
    }

    const s = state.settings;
    const number = inv ? inv.number : s.invoicePrefix + String(s.nextInvoiceNumber).padStart(3, "0");
    const issueDate = inv?.issueDate || todayISO();
    const dueDate = inv?.dueDate || addDaysISO(issueDate, s.defaultDueDays || 14);

    // Pre-fill a line item from the linked gig's fee when creating from a gig.
    let items = inv?.items?.length ? inv.items : null;
    if (!items && preset.eventId) {
      const ev = eventById(preset.eventId);
      if (ev) items = [{ desc: `DJ services — ${ev.title} (${fmtDate(ev.date)})`, qty: 1, rate: ev.fee || "" }];
    }
    if (!items) items = [{ desc: "", qty: 1, rate: "" }];

    const clientId = inv?.clientId || preset.clientId || "";
    const eventId = inv?.eventId || preset.eventId || "";

    openModal(modalShell(inv ? `Edit invoice ${inv.number}` : "New invoice", `
      <form id="invoiceForm">
        <div class="form-grid">
          <div class="field"><label>Invoice #</label><input name="number" value="${escapeHtml(number)}"></div>
          <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(clientId)}</select></div>
          <div class="field"><label>Linked gig (optional)</label>
            <select name="eventId" id="invEventSel">
              <option value="">— None —</option>
              ${state.events.sort((a, b) => b.date.localeCompare(a.date)).map(e =>
                `<option value="${e.id}" ${e.id === eventId ? "selected" : ""}>${escapeHtml(e.title)} (${fmtDate(e.date)})</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${["draft", "sent", "paid"].map(st => `<option value="${st}" ${(inv?.status || "draft") === st ? "selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Issue date</label><input name="issueDate" type="date" value="${escapeHtml(issueDate)}"></div>
          <div class="field"><label>Due date</label><input name="dueDate" type="date" value="${escapeHtml(dueDate)}"></div>
        </div>

        <div class="section-label">Line items</div>
        <div class="line-item-head"><div>Description</div><div>Qty</div><div>Rate</div><div style="text-align:right">Total</div><div></div></div>
        <div class="line-items" id="lineItems">
          ${items.map(it => lineItemRowHtml(it)).join("")}
        </div>
        <button type="button" class="btn btn-sm" id="addLine">+ Add line</button>

        <div class="invoice-totals">
          <div class="totals-row"><span class="lbl">Subtotal</span><span id="tSubtotal">$0.00</span></div>
          <div class="totals-row">
            <span class="lbl">Tax % <input id="taxRateInput" type="number" min="0" step="0.01" style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:6px" value="${escapeHtml(inv?.taxRate ?? s.taxRate ?? 0)}"></span>
            <span id="tTax">$0.00</span>
          </div>
          <div class="totals-row">
            <span class="lbl">Discount $ <input id="discountInput" type="number" min="0" step="0.01" style="width:90px;padding:4px 6px;border:1px solid var(--border);border-radius:6px" value="${escapeHtml(inv?.discount || 0)}"></span>
            <span id="tDiscount">$0.00</span>
          </div>
          <div class="totals-row grand"><span class="lbl">Total</span><span id="tTotal">$0.00</span></div>
        </div>

        <div class="field" style="margin-top:14px"><label>Notes to client</label>
          <textarea name="notes" placeholder="Deposit terms, thank-you note…">${escapeHtml(inv?.notes ?? s.paymentInstructions ?? "")}</textarea>
        </div>

        <div class="modal-actions">
          ${inv ? `<button type="button" class="btn btn-danger" id="deleteInvoice">Delete</button>` : ""}
          <button type="button" class="btn" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary">${inv ? "Save changes" : "Create invoice"}</button>
        </div>
      </form>`), true);

    const form = $("#invoiceForm");
    const lineItemsEl = $("#lineItems");

    function readItems() {
      return $$(".line-item-row", lineItemsEl).map(row => ({
        desc: $(".li-desc", row).value,
        qty: Number($(".li-qty", row).value) || 0,
        rate: Number($(".li-rate", row).value) || 0,
      }));
    }

    function recalc() {
      const draft = {
        items: readItems(),
        taxRate: Number($("#taxRateInput").value) || 0,
        discount: Number($("#discountInput").value) || 0,
      };
      $$(".line-item-row", lineItemsEl).forEach(row => {
        const qty = Number($(".li-qty", row).value) || 0;
        const rate = Number($(".li-rate", row).value) || 0;
        $(".line-item-total", row).textContent = money(qty * rate);
      });
      $("#tSubtotal").textContent = money(invSubtotal(draft));
      $("#tTax").textContent = money(invTax(draft));
      $("#tDiscount").textContent = "−" + money(draft.discount);
      $("#tTotal").textContent = money(invTotal(draft));
    }

    form.addEventListener("input", recalc);
    lineItemsEl.addEventListener("click", e => {
      const btn = e.target.closest(".remove-line");
      if (!btn) return;
      if ($$(".line-item-row", lineItemsEl).length > 1) btn.closest(".line-item-row").remove();
      recalc();
    });
    $("#addLine").addEventListener("click", () => {
      lineItemsEl.insertAdjacentHTML("beforeend", lineItemRowHtml());
      recalc();
    });
    recalc();

    $("#cancelModal").addEventListener("click", closeModal);
    $("#deleteInvoice")?.addEventListener("click", () => {
      if (!confirm("Delete this invoice?")) return;
      state.invoices = state.invoices.filter(x => x.id !== id);
      save(); closeModal(); render(); toast("Invoice deleted");
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const items = readItems().filter(it => it.desc || it.rate);
      if (!items.length) { toast("Add at least one line item"); return; }
      const data = {
        number: fd.number || number,
        clientId: fd.clientId,
        eventId: fd.eventId,
        status: fd.status,
        issueDate: fd.issueDate,
        dueDate: fd.dueDate,
        items,
        taxRate: Number($("#taxRateInput").value) || 0,
        discount: Number($("#discountInput").value) || 0,
        notes: fd.notes,
      };
      if (inv) {
        if (data.status === "paid" && inv.status !== "paid") data.paidDate = todayISO();
        Object.assign(inv, data);
      } else {
        if (data.status === "paid") data.paidDate = todayISO();
        state.invoices.push({ id: uid(), ...data });
        state.settings.nextInvoiceNumber = (state.settings.nextInvoiceNumber || 1) + 1;
      }
      save(); closeModal(); render();
      toast(inv ? "Invoice updated" : `Invoice ${data.number} created`);
      if (!inv) openInvoiceDetail(state.invoices[state.invoices.length - 1].id);
    });
  }

  function openInvoiceDetail(id) {
    const inv = invoiceById(id);
    if (!inv) return;
    const c = clientById(inv.clientId);
    const ev = inv.eventId ? eventById(inv.eventId) : null;
    const status = invStatus(inv);

    openModal(modalShell(`Invoice ${inv.number}`, `
      <div style="margin-bottom:14px">${badge(status)}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Billed to</div><div class="val">${c ? escapeHtml(c.name) : "—"}${c?.email ? `<br><span style="font-size:12.5px;color:var(--muted)">${escapeHtml(c.email)}</span>` : ""}</div></div>
        <div class="detail-item"><div class="lbl">Issued</div><div class="val">${fmtDate(inv.issueDate)}</div></div>
        <div class="detail-item"><div class="lbl">Due</div><div class="val">${fmtDate(inv.dueDate)}</div></div>
        ${ev ? `<div class="detail-item"><div class="lbl">Gig</div><div class="val">${escapeHtml(ev.title)}</div></div>` : ""}
        ${inv.paidDate ? `<div class="detail-item"><div class="lbl">Paid on</div><div class="val">${fmtDate(inv.paidDate)}</div></div>` : ""}
      </div>

      <div class="table-wrap"><table>
        <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${inv.items.map(it => `<tr>
            <td>${escapeHtml(it.desc)}</td>
            <td class="right">${it.qty}</td>
            <td class="right nowrap">${money(it.rate)}</td>
            <td class="right nowrap">${money(it.qty * it.rate)}</td>
          </tr>`).join("")}
        </tbody></table></div>

      <div class="invoice-totals">
        <div class="totals-row"><span class="lbl">Subtotal</span><span>${money(invSubtotal(inv))}</span></div>
        ${inv.taxRate ? `<div class="totals-row"><span class="lbl">Tax (${inv.taxRate}%)</span><span>${money(invTax(inv))}</span></div>` : ""}
        ${inv.discount ? `<div class="totals-row"><span class="lbl">Discount</span><span>−${money(inv.discount)}</span></div>` : ""}
        <div class="totals-row grand"><span class="lbl">Total</span><span>${money(invTotal(inv))}</span></div>
      </div>

      ${inv.notes ? `<div class="section-label">Notes</div><div class="notes-box">${escapeHtml(inv.notes)}</div>` : ""}

      <div class="modal-actions">
        ${status !== "paid" ? `<button class="btn" id="invMarkPaid">✓ Mark paid</button>` : ""}
        ${status === "draft" ? `<button class="btn" id="invMarkSent">Mark sent</button>` : ""}
        <button class="btn" id="invPrint">🖨 Print / PDF</button>
        ${c?.email ? `<button class="btn btn-primary" id="invEmail">✉️ Email to client</button>` : ""}
        <button class="btn" id="invEdit">Edit</button>
      </div>`), true);

    $("#invEdit").addEventListener("click", () => openInvoiceForm(id));
    $("#invMarkPaid")?.addEventListener("click", () => {
      inv.status = "paid";
      inv.paidDate = todayISO();
      save(); render(); openInvoiceDetail(id); toast("Marked as paid 🎉");
    });
    $("#invMarkSent")?.addEventListener("click", () => {
      inv.status = "sent";
      save(); render(); openInvoiceDetail(id); toast("Marked as sent");
    });
    $("#invPrint").addEventListener("click", () => printInvoice(inv));
    $("#invEmail")?.addEventListener("click", () => emailInvoice(inv));
  }

  function printInvoice(inv) {
    const s = state.settings;
    const c = clientById(inv.clientId);
    const ev = inv.eventId ? eventById(inv.eventId) : null;

    $("#printArea").innerHTML = `
      <div class="inv-doc">
        <div class="inv-top">
          <div>
            <div class="inv-biz-name">${escapeHtml(s.businessName)}</div>
            <div style="font-size:13px;color:#555;line-height:1.6;margin-top:4px">
              ${s.ownerName ? escapeHtml(s.ownerName) + "<br>" : ""}
              ${s.email ? escapeHtml(s.email) + "<br>" : ""}
              ${s.phone ? escapeHtml(s.phone) + "<br>" : ""}
              ${s.address ? escapeHtml(s.address) : ""}
            </div>
          </div>
          <div>
            <h1>INVOICE</h1>
            <div class="inv-meta">
              <strong>${escapeHtml(inv.number)}</strong><br>
              Issued: ${fmtDate(inv.issueDate)}<br>
              Due: ${fmtDate(inv.dueDate)}
            </div>
          </div>
        </div>
        <div class="inv-parties">
          <div class="inv-party">
            <div class="lbl">Bill to</div>
            <strong>${c ? escapeHtml(c.name) : ""}</strong><br>
            ${c?.company ? escapeHtml(c.company) + "<br>" : ""}
            ${c?.email ? escapeHtml(c.email) + "<br>" : ""}
            ${c?.phone ? escapeHtml(c.phone) : ""}
          </div>
          ${ev ? `<div class="inv-party">
            <div class="lbl">Event</div>
            <strong>${escapeHtml(ev.title)}</strong><br>
            ${fmtDate(ev.date)}${ev.startTime ? " · " + fmtTime(ev.startTime) : ""}<br>
            ${ev.venue ? escapeHtml(ev.venue) : ""}
          </div>` : ""}
        </div>
        <table>
          <thead><tr><th style="text-align:left">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${inv.items.map(it => `<tr>
              <td>${escapeHtml(it.desc)}</td>
              <td style="text-align:right">${it.qty}</td>
              <td style="text-align:right">${money(it.rate)}</td>
              <td style="text-align:right">${money(it.qty * it.rate)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="inv-totals">
          <div class="row"><span>Subtotal</span><span>${money(invSubtotal(inv))}</span></div>
          ${inv.taxRate ? `<div class="row"><span>Tax (${inv.taxRate}%)</span><span>${money(invTax(inv))}</span></div>` : ""}
          ${inv.discount ? `<div class="row"><span>Discount</span><span>−${money(inv.discount)}</span></div>` : ""}
          <div class="row grand"><span>Total due</span><span>${money(invTotal(inv))}</span></div>
        </div>
        ${inv.notes ? `<div class="inv-notes"><div class="lbl">Notes</div>${escapeHtml(inv.notes)}</div>` : ""}
        <div class="inv-notes" style="margin-top:40px;text-align:center">Thank you for your business! 🎶</div>
      </div>`;
    window.print();
  }

  function emailInvoice(inv) {
    const s = state.settings;
    const c = clientById(inv.clientId);
    if (!c?.email) { toast("This client has no email address on file"); return; }
    const subject = `Invoice ${inv.number} from ${s.businessName} — ${money(invTotal(inv))}`;
    const lines = [
      `Hi ${c.name.split(" ")[0]},`,
      ``,
      `Here is your invoice from ${s.businessName}:`,
      ``,
      `Invoice: ${inv.number}`,
      `Issued: ${fmtDate(inv.issueDate)}`,
      `Due: ${fmtDate(inv.dueDate)}`,
      ``,
      ...inv.items.map(it => `• ${it.desc} — ${it.qty} × ${money(it.rate)} = ${money(it.qty * it.rate)}`),
      ``,
      `Total due: ${money(invTotal(inv))}`,
      ``,
      inv.notes || "",
      ``,
      `Thank you!`,
      s.ownerName || s.businessName,
      s.phone || "",
    ];
    const url = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = url;
    if (inv.status === "draft") {
      inv.status = "sent";
      save(); render();
      toast("Email drafted — invoice marked as sent");
    }
  }

  /* ================= CALENDAR ================= */

  function renderCalendar(root) {
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    const monthLabel = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();
    const today = todayISO();

    // Build 6 weeks of cells.
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dayOffset = i - firstDow;
      let cy = y, cm = m, cd;
      let other = false;
      if (dayOffset < 0) { cd = daysInPrev + dayOffset + 1; cm = m - 1; other = true; }
      else if (dayOffset >= daysInMonth) { cd = dayOffset - daysInMonth + 1; cm = m + 1; other = true; }
      else cd = dayOffset + 1;
      const dt = new Date(cy, cm, cd);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      cells.push({ iso, day: dt.getDate(), other });
    }

    const eventsByDate = {};
    state.events.forEach(e => {
      (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e);
    });

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Calendar</div>
          <div class="view-sub">All your gigs at a glance</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="calAddEvent">+ New gig</button>
        </div>
      </div>

      <div class="card card-pad">
        <div class="cal-header">
          <button class="btn btn-icon" id="calPrev">‹</button>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="cal-month-label">${monthLabel}</div>
            <button class="btn btn-sm" id="calToday">Today</button>
          </div>
          <button class="btn btn-icon" id="calNext">›</button>
        </div>
        <div class="cal-grid">
          ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("")}
          ${cells.map(cell => `
            <div class="cal-cell ${cell.other ? "other-month" : ""} ${cell.iso === today ? "today" : ""}">
              <div class="cal-daynum">${cell.day}</div>
              ${(eventsByDate[cell.iso] || []).map(e => `
                <div class="cal-event status-${e.status}" data-open-event="${e.id}" title="${escapeHtml(e.title)} — ${escapeHtml(clientName(e.clientId))}">
                  ${e.startTime ? fmtTime(e.startTime).replace(" ", "") + " " : ""}${escapeHtml(e.title)}
                </div>`).join("")}
            </div>`).join("")}
        </div>
        <div class="cal-legend">
          <span><span class="legend-dot" style="background:var(--accent)"></span>Booked</span>
          <span><span class="legend-dot" style="background:var(--amber)"></span>Inquiry</span>
          <span><span class="legend-dot" style="background:var(--green)"></span>Completed</span>
          <span><span class="legend-dot" style="background:var(--muted)"></span>Cancelled</span>
        </div>
      </div>`;

    $("#calPrev", root).addEventListener("click", () => { calCursor = new Date(y, m - 1, 1); renderCalendar(root); });
    $("#calNext", root).addEventListener("click", () => { calCursor = new Date(y, m + 1, 1); renderCalendar(root); });
    $("#calToday", root).addEventListener("click", () => { calCursor = new Date(); renderCalendar(root); });
    $("#calAddEvent", root).addEventListener("click", () => openEventForm());
    bindRowOpeners(root);
  }

  /* ================= SETTINGS ================= */

  function renderSettings(root) {
    const s = state.settings;
    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Settings</div>
          <div class="view-sub">Your business details appear on invoices</div>
        </div>
      </div>

      <div class="card card-pad" style="max-width:720px">
        <form id="settingsForm">
          <div class="form-grid">
            <div class="field"><label>Business name</label><input name="businessName" value="${escapeHtml(s.businessName)}"></div>
            <div class="field"><label>Your name</label><input name="ownerName" value="${escapeHtml(s.ownerName)}"></div>
            <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(s.email)}"></div>
            <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(s.phone)}"></div>
            <div class="field full"><label>Business address</label><input name="address" value="${escapeHtml(s.address)}"></div>
            <div class="field"><label>Invoice prefix</label><input name="invoicePrefix" value="${escapeHtml(s.invoicePrefix)}"></div>
            <div class="field"><label>Next invoice number</label><input name="nextInvoiceNumber" type="number" min="1" value="${escapeHtml(s.nextInvoiceNumber)}"></div>
            <div class="field"><label>Default tax rate (%)</label><input name="taxRate" type="number" min="0" step="0.01" value="${escapeHtml(s.taxRate)}"></div>
            <div class="field"><label>Default payment terms (days)</label><input name="defaultDueDays" type="number" min="0" value="${escapeHtml(s.defaultDueDays)}"></div>
            <div class="field full"><label>Default invoice notes / payment instructions</label>
              <textarea name="paymentInstructions">${escapeHtml(s.paymentInstructions)}</textarea>
            </div>
          </div>
          <div class="modal-actions" style="justify-content:flex-start">
            <button type="submit" class="btn btn-primary">Save settings</button>
          </div>
        </form>
      </div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px">
        <div class="card-title">Data backup</div>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">
          Your data lives in this browser only. Export a backup file regularly, and import it to restore or move to another device.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="exportData">⬇ Export backup (JSON)</button>
          <button class="btn" id="importData">⬆ Import backup</button>
          <input type="file" id="importFile" accept="application/json" class="hidden">
          <button class="btn btn-danger" id="clearData">Erase all data</button>
        </div>
      </div>`;

    $("#settingsForm", root).addEventListener("submit", e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.taxRate = Number(data.taxRate) || 0;
      data.nextInvoiceNumber = Number(data.nextInvoiceNumber) || 1;
      data.defaultDueDays = Number(data.defaultDueDays) || 14;
      Object.assign(state.settings, data);
      save(); toast("Settings saved");
    });

    $("#exportData", root).addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `djclientflow-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Backup downloaded");
    });

    $("#importData", root).addEventListener("click", () => $("#importFile", root).click());
    $("#importFile", root).addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.settings || !Array.isArray(data.clients)) throw new Error("Not a valid backup");
          if (!confirm("Importing will replace ALL current data. Continue?")) return;
          state = {
            settings: { ...defaultSettings(), ...data.settings },
            clients: data.clients || [],
            events: data.events || [],
            invoices: data.invoices || [],
          };
          save(); render(); toast("Backup imported");
        } catch {
          toast("Import failed — that file isn't a valid backup");
        }
      };
      reader.readAsText(file);
    });

    $("#clearData", root).addEventListener("click", () => {
      if (!confirm("This permanently erases ALL clients, gigs and invoices in this browser. Are you sure?")) return;
      if (!confirm("Last chance — really erase everything?")) return;
      state = { settings: defaultSettings(), clients: [], events: [], invoices: [] };
      save(); render(); toast("All data erased");
    });
  }

  /* ================= SAMPLE DATA ================= */

  function loadSampleData() {
    const t = new Date();
    const iso = (offsetDays) => {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + offsetDays);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const c1 = { id: uid(), name: "Sarah Johnson", email: "sarah.j@example.com", phone: "(555) 201-8834", company: "", source: "Instagram", notes: "Getting married! Loves 90s R&B and Motown. Do-not-play: Chicken Dance.", createdAt: iso(-60) };
    const c2 = { id: uid(), name: "Marcus Lee", email: "marcus@brightpath.example.com", phone: "(555) 448-2210", company: "BrightPath Marketing", source: "Referral from past client", notes: "Corporate contact — books quarterly staff parties.", createdAt: iso(-40) };
    const c3 = { id: uid(), name: "Emily Torres", email: "emtorres@example.com", phone: "(555) 917-6642", company: "", source: "Google search", notes: "Daughter's quinceañera. Wants lots of reggaeton and a strong MC presence.", createdAt: iso(-15) };
    state.clients.push(c1, c2, c3);

    const e1 = { id: uid(), clientId: c1.id, title: "Johnson Wedding Reception", type: "Wedding", date: iso(18), startTime: "17:00", endTime: "23:00", venue: "The Grand Ballroom", address: "220 Harbor View Dr", guestCount: "140", fee: 1800, status: "booked", needs: "Ceremony audio + reception. Uplighting (blush). First dance: 'At Last'. MC for toasts and cake cutting.", notes: "Load in 3pm via service elevator. Coordinator: Dana (555) 300-1123." };
    const e2 = { id: uid(), clientId: c2.id, title: "BrightPath Summer Party", type: "Corporate", date: iso(32), startTime: "18:30", endTime: "22:30", venue: "Rooftop at The Meridian", address: "88 5th Ave", guestCount: "75", fee: 1200, status: "booked", needs: "Open-format set, clean edits only. Wireless mic for CEO welcome speech.", notes: "" };
    const e3 = { id: uid(), clientId: c3.id, title: "Torres Quinceañera", type: "Private Party", date: iso(9), startTime: "16:00", endTime: "22:00", venue: "Casa Bella Events", address: "412 Sunset Blvd", guestCount: "110", fee: 1100, status: "inquiry", needs: "Bilingual MC, court dance choreography track, lots of reggaeton + cumbia.", notes: "Waiting on signed contract & deposit." };
    const e4 = { id: uid(), clientId: c1.id, title: "Johnson Engagement Party", type: "Private Party", date: iso(-45), startTime: "19:00", endTime: "23:00", venue: "Private residence", address: "", guestCount: "50", fee: 600, status: "completed", needs: "", notes: "Went great — led to wedding booking." };
    state.events.push(e1, e2, e3, e4);

    const p = state.settings.invoicePrefix;
    let n = state.settings.nextInvoiceNumber;
    const num = () => p + String(n++).padStart(3, "0");

    state.invoices.push(
      {
        id: uid(), number: num(), clientId: c1.id, eventId: e4.id, status: "paid",
        issueDate: iso(-44), dueDate: iso(-30), paidDate: iso(-38),
        items: [{ desc: "DJ services — Engagement Party (4 hours)", qty: 1, rate: 600 }],
        taxRate: 0, discount: 0, notes: "Thank you!",
      },
      {
        id: uid(), number: num(), clientId: c1.id, eventId: e1.id, status: "sent",
        issueDate: iso(-10), dueDate: iso(4),
        items: [
          { desc: "Wedding DJ package — ceremony + reception (6 hours)", qty: 1, rate: 1500 },
          { desc: "Uplighting package (8 fixtures)", qty: 1, rate: 300 },
        ],
        taxRate: 0, discount: 0, notes: "50% deposit received. Balance due before event date.",
      },
      {
        id: uid(), number: num(), clientId: c2.id, eventId: e2.id, status: "draft",
        issueDate: iso(0), dueDate: iso(14),
        items: [{ desc: "Corporate event DJ — 4 hours", qty: 1, rate: 1200 }],
        taxRate: 0, discount: 0, notes: state.settings.paymentInstructions,
      },
    );
    state.settings.nextInvoiceNumber = n;

    save(); render();
    toast("Sample data loaded — explore away! 🎉");
  }

  /* ---------------- Init ---------------- */

  save(); // syncs sidebar business name
  render();
})();
