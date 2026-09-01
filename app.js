/* ============================================================
   DJ ClientFlow — client, gig & invoice manager for DJs
   Invoice engine & design integrated from RND Invoice Generator
   (github.com/vermelR/Invoice-Generator).
   All data lives in localStorage. No server required.
   ============================================================ */

(() => {
  "use strict";

  const BASE_KEY = "djclientflow.v1";
  const GMAIL_TOKEN_KEY = "djclientflow.gmailToken";
  const GUEST_KEY = "djclientflow.guestMode";

  // Each signed-in account caches into its own slot, so two DJs sharing
  // a laptop never see each other's clients. Guests use the base key.
  let activeUid = null;
  function storageKey() {
    return activeUid ? `${BASE_KEY}.${activeUid}` : BASE_KEY;
  }

  /* ---------------- State ---------------- */

  const RND_HOTEL_TEXT = "Client to provide 1 room with 2 beds for night of events as well as one day before and after at the performance venue. If venue does not have a hotel onsite, accommodations must be made within 3 miles of the venue and approved by RND Entertainment. For any contracts containing larger setups, additional rooms may be required for additional production team members. If parking is not available onsite for oversized vehicles, reimbursements are required.";

  const GENERIC_HOTEL_TEXT = "Client to provide 1 room with 2 beds for the night of the event, as well as one day before and after, at the performance venue. If the venue does not have a hotel onsite, accommodations must be made within 3 miles of the venue and approved in advance. For contracts containing larger setups, additional rooms may be required for additional production team members. If parking is not available onsite for oversized vehicles, reimbursement is required.";

  // When the app is hosted for multiple DJs, every new account starts
  // blank — nobody should inherit another business's details.
  const defaultSettings = () => (accountsMode() ? {
    businessName: "My DJ Business",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    logoText: "",
    logoImg: "",
    ...sharedDefaults(GENERIC_HOTEL_TEXT),
  } : {
    businessName: "RND Entertainment",
    ownerName: "",
    email: "officialdjrnd@gmail.com",
    phone: "+1 732-535-2244",
    address: "1120 Staghorn Dr., North Brunswick, NJ 08902",
    logoText: "RND",
    logoImg: "",
    ...sharedDefaults(RND_HOTEL_TEXT),
  });

  function sharedDefaults(hotelText) {
    return {
      currency: "USD",
      taxRate: 0,
      invoicePrefix: "INV-",
      nextInvoiceNumber: 1,
      paymentInstructions: "Payment accepted via Venmo, Zelle, or check. Thank you for your business!",
      defaultDueDays: 14,
      hotelText,
      googleClientId: "",
      firebaseConfig: null,
      calendlyUrl: "",
      showGoogleCalendar: false,
    };
  }

  // Convert flat legacy invoices ({items, discount}) to the RND
  // grouped model ({groups, discounts, hotel clause}).
  function migrateInvoice(inv) {
    if (inv.groups) {
      inv.discounts = inv.discounts || [];
      inv.groups.forEach(g => {
        g.items = g.items || [];
        g.items.forEach(it => { it.details = it.details || []; });
      });
      return withPayments(inv);
    }
    const items = (inv.items || []).map(it => ({
      name: it.desc || "", qty: Number(it.qty) || 1,
      price: Number(it.rate) || 0, comp: false, details: [],
    }));
    const migrated = {
      ...inv,
      groups: [{ name: "Services", items }],
      discounts: Number(inv.discount) ? [{ name: "Discount", amount: Number(inv.discount) }] : [],
      hotelEnabled: false,
      hotelText: "",
    };
    delete migrated.items;
    delete migrated.discount;
    return withPayments(migrated);
  }

  // Invoices predating payment tracking: a "paid" one gets a single
  // payment record for its full total so revenue math still adds up.
  function withPayments(inv) {
    if (!Array.isArray(inv.payments)) inv.payments = [];
    if (inv.status === "paid" && !inv.payments.length) {
      inv.payments.push({
        id: uid(),
        date: inv.paidDate || inv.issueDate || todayISO(),
        amount: invTotal(inv),
        method: "",
        note: "Paid in full",
      });
    }
    return inv;
  }

  let state = load();

  function emptyState() {
    return { settings: defaultSettings(), clients: [], events: [], invoices: [] };
  }

  function load() {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyState();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Never silently discard saved work: stash the unreadable copy
      // under its own key so it can still be recovered by hand.
      console.error("Saved data could not be parsed", e);
      try { localStorage.setItem(storageKey() + ".corrupt", raw); } catch { /* quota */ }
      return emptyState();
    }

    const base = {
      settings: { ...defaultSettings(), ...(parsed.settings || {}) },
      clients: parsed.clients || [],
      events: parsed.events || [],
      invoices: parsed.invoices || [],
    };
    try {
      base.invoices = base.invoices.map(migrateInvoice);
    } catch (e) {
      // Keep the records as-is rather than losing them to a migration bug.
      console.error("Invoice migration failed — loading records unmigrated", e);
    }
    return base;
  }

  function save() {
    saveLocal();
    queueCloudPush();
  }

  function saveLocal() {
    localStorage.setItem(storageKey(), JSON.stringify(state));
    document.getElementById("sidebarBizName").textContent = state.settings.businessName || "DJ ClientFlow";
  }

  /* ---------------- Utils ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Declared as a hoisted function: load() runs before this point and
  // migration needs it to mint ids for synthesized payment records.
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

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

  // A gig can run over several days; everything that asks "is this over?"
  // should look at the last day, not the first.
  function eventEnd(e) {
    return e.endDate && e.endDate > e.date ? e.endDate : e.date;
  }
  function isMultiDay(e) { return eventEnd(e) !== e.date; }

  // Calls are colour-coded apart from paying gigs on the calendar, but a
  // cancelled one should still read as cancelled.
  function isCall(e) { return e.type === "Client Call" && e.status !== "cancelled"; }

  function fmtDateRange(start, end) {
    if (!end || end <= start) return fmtDate(start);
    const a = parseISO(start), b = parseISO(end);
    const sameYear = a.getFullYear() === b.getFullYear();
    const sameMonth = sameYear && a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${b.getDate()}, ${b.getFullYear()}`;
    }
    const left = a.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
    return `${left} – ${fmtDate(end)}`;
  }

  // Every date a gig occupies, so multi-day bookings fill the calendar.
  function eventDays(e) {
    const days = [e.date];
    let cursor = e.date;
    const last = eventEnd(e);
    while (cursor < last && days.length < 60) {
      cursor = addDaysISO(cursor, 1);
      days.push(cursor);
    }
    return days;
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

  function itemAmount(it) {
    if (it.comp) return 0;
    return (Number(it.price) || 0) * (Number(it.qty) || 1);
  }
  function groupSum(g) {
    return (g.items || []).reduce((s, it) => s + itemAmount(it), 0);
  }
  // Hoisted declaration on purpose: load() runs migration before this
  // point in the file, and that path calls invTotal → invSubtotal.
  function isUploaded(inv) { return !!inv && inv.kind === "uploaded"; }

  function invSubtotal(inv) {
    // An uploaded PDF has no line items — its total is typed in by hand.
    if (isUploaded(inv)) return Number(inv.manualTotal) || 0;
    return (inv.groups || []).reduce((s, g) => s + groupSum(g), 0);
  }
  function invTax(inv) {
    if (isUploaded(inv)) return 0;
    return invSubtotal(inv) * ((Number(inv.taxRate) || 0) / 100);
  }
  function invDiscountTotal(inv) {
    if (isUploaded(inv)) return 0;
    return (inv.discounts || []).reduce((s, d) => s + Math.abs(Number(d.amount) || 0), 0);
  }
  function invTotal(inv) { return invSubtotal(inv) + invTax(inv) - invDiscountTotal(inv); }

  /* ---------------- Payments (deposits & partial payments) ---------------- */

  function invPaid(inv) {
    return (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  // Rounded to cents so float dust never leaves a $0.00 balance "unpaid".
  function invBalance(inv) {
    return Math.round((invTotal(inv) - invPaid(inv)) * 100) / 100;
  }
  function isFullyPaid(inv) { return invBalance(inv) <= 0; }

  const PAYMENT_METHODS = ["Venmo", "Zelle", "Cash", "Check", "Credit card", "Bank transfer", "PayPal", "Other"];

  // Derived display status: a deposit makes an invoice "partial",
  // and anything past its due date with a balance is "overdue".
  function invStatus(inv) {
    if (isFullyPaid(inv) && invPaid(inv) > 0) return "paid";
    if (inv.status === "draft") return "draft";
    if (inv.dueDate && inv.dueDate < todayISO()) return "overdue";
    if (invPaid(inv) > 0) return "partial";
    return inv.status;
  }

  const STATUS_LABEL = {
    draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", partial: "Partial",
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
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
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
    releaseObjectUrls();
  }

  $("#modalOverlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (remindersOpen()) closeReminders();
    closeModal();
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
    if (currentView === "settings" && view !== "settings") {
      commitSettingsRef?.();       // don't lose edits by navigating away
      commitSettingsRef = null;
    }
    currentView = view;
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    render();
  }

  function render() {
    (views[currentView] || renderDashboard)($("#main"));
    refreshRemindersBadge();
    if (remindersOpen()) renderReminders();
  }

  /* ---------------- Sidebar toggle ---------------- */

  const SIDEBAR_KEY = "djclientflow.sidebarHidden";
  const isNarrow = () => window.matchMedia("(max-width: 860px)").matches;

  function setSidebar(hidden, remember = true) {
    $("#appShell").classList.toggle("sidebar-hidden", hidden);
    $("#menuToggle").setAttribute("aria-expanded", String(!hidden));
    // On phones the sidebar is an overlay, so the choice isn't worth
    // remembering — it should always start out of the way.
    if (remember && !isNarrow()) localStorage.setItem(SIDEBAR_KEY, hidden ? "1" : "0");
  }

  function toggleSidebar() {
    setSidebar(!$("#appShell").classList.contains("sidebar-hidden"));
  }

  $("#menuToggle").addEventListener("click", toggleSidebar);
  $("#sidebarBackdrop").addEventListener("click", () => setSidebar(true, false));

  // Start collapsed on a small screen; otherwise honour the last choice.
  setSidebar(isNarrow() || localStorage.getItem(SIDEBAR_KEY) === "1", false);

  let lastNarrow = isNarrow();
  window.addEventListener("resize", () => {
    const narrow = isNarrow();
    if (narrow === lastNarrow) return;      // only react to crossing the breakpoint
    lastNarrow = narrow;
    setSidebar(narrow ? true : localStorage.getItem(SIDEBAR_KEY) === "1", false);
  });

  $$(".nav-item").forEach(btn => btn.addEventListener("click", () => {
    go(btn.dataset.view);
    if (isNarrow()) setSidebar(true, false);   // drawer closes behind you
  }));

  /* ================= DASHBOARD ================= */

  function renderDashboard(root) {
    const today = todayISO();
    const year = new Date().getFullYear();

    const upcoming = state.events
      .filter(e => eventEnd(e) >= today && e.status !== "cancelled" && e.status !== "completed")
      .sort((a, b) => a.date.localeCompare(b.date));

    // Money actually received this year, deposits included.
    const paidThisYear = state.invoices
      .flatMap(i => i.payments || [])
      .filter(p => (p.date || "").startsWith(String(year)))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    // What's still owed on anything sent out, net of deposits.
    const outstanding = state.invoices
      .filter(i => i.status !== "draft" && !isFullyPaid(i))
      .reduce((s, i) => s + invBalance(i), 0);

    const overdueCount = state.invoices.filter(i => invStatus(i) === "overdue").length;
    const depositCount = state.invoices.filter(i => invStatus(i) === "partial").length;

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
          <button class="btn" id="dashUploadInvoice">📎 Add existing invoice</button>
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
          <div class="stat-note">Payments &amp; deposits received</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Outstanding balance</div>
          <div class="stat-value ${outstanding > 0 ? "warn" : ""}">${money(outstanding)}</div>
          <div class="stat-note">${overdueCount ? `⚠️ ${overdueCount} overdue` : depositCount ? `${depositCount} partly paid` : "Awaiting payment"}</div>
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
                  <td class="nowrap">${fmtDateShort(e.date)}${isMultiDay(e) ? `<span class="sub">through ${fmtDateShort(eventEnd(e))}</span>` : e.startTime ? `<span class="sub">${fmtTime(e.startTime)}</span>` : ""}</td>
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
                  <td class="right nowrap">${money(invTotal(i))}${invPaid(i) > 0 && !isFullyPaid(i) ? `<span class="sub">${money(invBalance(i))} left</span>` : ""}</td>
                  <td>${badge(invStatus(i))}</td>
                </tr>`).join("")}
            </tbody></table></div>`
          : `<div class="empty-state"><p>No invoices yet.</p></div>`}
        </div>
      </div>`;

    $("#dashNewClient", root).addEventListener("click", () => openClientForm());
    $("#dashNewEvent", root).addEventListener("click", () => openEventForm());
    $("#dashNewInvoice", root).addEventListener("click", () => openInvoiceForm());
    $("#dashUploadInvoice", root).addEventListener("click", () => openUploadInvoiceForm());
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
  // Set while the Settings view is mounted; lets cards that re-render the
  // page flush any typing in the main form first.
  let commitSettingsRef = null;

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
              const paid = state.invoices.filter(i => i.clientId === c.id)
                .reduce((s, i) => s + invPaid(i), 0);
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
    const paid = invs.reduce((s, i) => s + invPaid(i), 0);
    const owed = invs.filter(i => i.status !== "draft").reduce((s, i) => s + Math.max(0, invBalance(i)), 0);

    openModal(modalShell(c.name, `
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Email</div><div class="val">${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : "—"}</div></div>
        <div class="detail-item"><div class="lbl">Phone</div><div class="val">${escapeHtml(c.phone || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Company</div><div class="val">${escapeHtml(c.company || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Source</div><div class="val">${escapeHtml(c.source || "—")}</div></div>
        <div class="detail-item"><div class="lbl">Lifetime paid</div><div class="val"><strong>${money(paid)}</strong></div></div>
        ${owed > 0 ? `<div class="detail-item"><div class="lbl">Still owed</div><div class="val"><strong style="color:var(--amber)">${money(owed)}</strong></div></div>` : ""}
      </div>
      ${c.notes ? `<div class="section-label">Notes</div><div class="notes-box">${escapeHtml(c.notes)}</div>` : ""}

      <div class="section-label">Gigs (${gigs.length})</div>
      ${gigs.length ? `<div class="table-wrap"><table><tbody>
        ${gigs.map(e => `<tr class="clickable" data-open-event="${e.id}">
          <td class="nowrap">${escapeHtml(fmtDateRange(e.date, eventEnd(e)))}</td><td>${escapeHtml(e.title)}</td><td>${badge(e.status)}</td>
        </tr>`).join("")}
      </tbody></table></div>` : `<div class="notes-box">No gigs yet for this client.</div>`}

      <div class="section-label">Invoices (${invs.length})</div>
      ${invs.length ? `<div class="table-wrap"><table><tbody>
        ${invs.map(i => `<tr class="clickable" data-open-invoice="${i.id}">
          <td class="nowrap">${escapeHtml(i.number)}</td>
          <td class="right nowrap">${money(invTotal(i))}${invPaid(i) > 0 && !isFullyPaid(i) ? `<span class="sub">${money(invBalance(i))} left</span>` : ""}</td>
          <td>${badge(invStatus(i))}</td>
        </tr>`).join("")}
      </tbody></table></div>` : `<div class="notes-box">No invoices yet for this client.</div>`}

      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn" id="detailScheduleCall">📅 Send booking link</button>
        <button class="btn" id="detailNewGig">+ Gig for this client</button>
        <button class="btn" id="detailUploadInv">📎 Add existing invoice</button>
        <button class="btn" id="detailNewInv">+ Invoice</button>
        <button class="btn btn-primary" id="detailEdit">Edit client</button>
      </div>`), true);

    $("#detailEdit").addEventListener("click", () => openClientForm(id));
    $("#detailNewGig").addEventListener("click", () => openEventForm(null, id));
    $("#detailNewInv").addEventListener("click", () => openInvoiceForm(null, { clientId: id }));
    $("#detailUploadInv").addEventListener("click", () => openUploadInvoiceForm(null, { clientId: id }));
    $("#detailScheduleCall").addEventListener("click", () => openBookingLinkModal({ clientId: id }));
    bindRowOpeners($("#modal"));
  }

  /* ================= EVENTS / GIGS ================= */

  let eventFilter = "upcoming";

  const EVENT_TYPES = ["Wedding", "Sangeet", "Mehndi", "Baraat", "Reception", "Birthday", "Corporate", "Club Night", "School Dance", "Private Party", "Festival", "Client Call", "Other"];

  function renderEvents(root) {
    const today = todayISO();
    let list = [...state.events];
    if (eventFilter === "upcoming") list = list.filter(e => eventEnd(e) >= today && e.status !== "cancelled");
    else if (eventFilter === "past") list = list.filter(e => eventEnd(e) < today);
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
                <td class="nowrap">${isMultiDay(e) ? escapeHtml(fmtDateRange(e.date, eventEnd(e))) : fmtDateShort(e.date)}${e.startTime ? `<span class="sub">${fmtTime(e.startTime)}${e.endTime ? " – " + fmtTime(e.endTime) : ""}</span>` : ""}</td>
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

  // A gig is done with only when it's been invoiced and every one of
  // those invoices is paid off. No invoice yet, or a balance still
  // owing, means there's more to bill.
  function gigSettled(ev) {
    const invs = state.invoices.filter(i => i.eventId === ev.id);
    return invs.length > 0 && invs.every(i => invStatus(i) === "paid");
  }

  // Gigs you'd still bill for. Completed-and-paid ones drop off the list —
  // except the one an invoice is already linked to, which must stay
  // selectable or editing would silently unlink it.
  function invoiceableEvents(keepId) {
    return [...state.events]
      .filter(e => e.id === keepId || !(e.status === "completed" && gigSettled(e)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function gigNote(e) {
    if (e.status !== "completed") return "";
    if (gigSettled(e)) return " — completed &amp; paid";
    return state.invoices.some(i => i.eventId === e.id)
      ? " — completed, balance due"
      : " — completed, not invoiced";
  }

  function gigOptions(selectedId) {
    return `<option value="">— None —</option>` + invoiceableEvents(selectedId).map(e =>
      `<option value="${e.id}" ${e.id === selectedId ? "selected" : ""}>${escapeHtml(e.title)} (${fmtDate(e.date)})${gigNote(e)}</option>`
    ).join("");
  }

  function clientOptions(selectedId) {
    const opts = [...state.clients].sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`);
    return `<option value="">— Select client —</option>` + opts.join("");
  }

  function openEventForm(id, presetClientId, preset = {}) {
    const ev = id ? eventById(id) : null;
    if (!state.clients.length) {
      toast("Add a client first — gigs are linked to clients");
      openClientForm();
      return;
    }
    const val = (field, fallback = "") => ev?.[field] ?? preset[field] ?? fallback;
    const selectedType = ev?.type ?? preset.type ?? "";
    const selectedStatus = ev?.status ?? preset.status ?? "inquiry";

    openModal(modalShell(ev ? "Edit gig" : preset.title ? "Add to your calendar" : "New gig", `
      <form id="eventForm">
        <div class="form-grid">
          <div class="field full"><label>Event title *</label><input name="title" required value="${escapeHtml(val("title"))}" placeholder="e.g. Johnson Wedding Reception"></div>
          <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(ev?.clientId || presetClientId)}</select></div>
          <div class="field"><label>Event type</label>
            <select name="type">${EVENT_TYPES.map(t => `<option ${selectedType === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Date *</label><input name="date" type="date" required value="${escapeHtml(val("date", todayISO()))}"></div>
          <div class="field"><label>End date <span class="field-hint">multi-day events only</span></label>
            <input name="endDate" type="date" value="${escapeHtml(val("endDate"))}">
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${["inquiry", "booked", "completed", "cancelled"].map(s => `<option value="${s}" ${selectedStatus === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Start time</label><input name="startTime" type="time" value="${escapeHtml(val("startTime"))}"></div>
          <div class="field"><label>End time</label><input name="endTime" type="time" value="${escapeHtml(val("endTime"))}"></div>
          <div class="field"><label>Venue</label><input name="venue" value="${escapeHtml(val("venue"))}" placeholder="The Grand Ballroom"></div>
          <div class="field"><label>Venue address</label><input name="address" value="${escapeHtml(ev?.address || "")}" placeholder="123 Main St"></div>
          <div class="field"><label>Guest count</label><input name="guestCount" type="number" min="0" value="${escapeHtml(ev?.guestCount || "")}"></div>
          <div class="field"><label>Performance fee</label><input name="fee" type="number" min="0" step="0.01" value="${escapeHtml(ev?.fee || "")}" placeholder="0.00"></div>
          <div class="field full"><label>Client needs &amp; requests</label><textarea name="needs" placeholder="Equipment, special songs, first dance, MC duties, uplighting…">${escapeHtml(val("needs"))}</textarea></div>
          <div class="field full"><label>Internal notes</label><textarea name="notes" placeholder="Load-in details, contact on site, parking…">${escapeHtml(val("notes"))}</textarea></div>
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
      if (data.endDate && data.endDate < data.date) {
        toast("The end date can't be before the start date");
        return;
      }
      if (data.endDate === data.date) data.endDate = "";   // single day
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
        <div class="detail-item"><div class="lbl">Date${isMultiDay(e) ? "s" : ""}</div><div class="val">${isMultiDay(e) ? escapeHtml(fmtDateRange(e.date, eventEnd(e))) : fmtDateShort(e.date)}</div></div>
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
      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn" id="evScheduleCall">📅 Send booking link</button>
        <button class="btn" id="evUploadInvoice">📎 Add existing invoice</button>
        <button class="btn" id="evInvoice">Create invoice for this gig</button>
        <button class="btn btn-primary" id="evEdit">Edit gig</button>
      </div>`), true);

    $("#evEdit").addEventListener("click", () => openEventForm(id));
    $("#evInvoice").addEventListener("click", () => openInvoiceForm(null, { clientId: e.clientId, eventId: id }));
    $("#evUploadInvoice").addEventListener("click", () => openUploadInvoiceForm(null, { clientId: e.clientId, eventId: id }));
    $("#evScheduleCall").addEventListener("click", () => openBookingLinkModal({ clientId: e.clientId, eventId: id }));
    bindRowOpeners($("#modal"));
  }

  /* ================= INVOICES ================= */

  let invoiceFilter = "all";

  function renderInvoices(root) {
    let list = [...state.invoices];
    if (invoiceFilter !== "all") list = list.filter(i => invStatus(i) === invoiceFilter);
    list.sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));

    const chips = [["all", "All"], ["draft", "Drafts"], ["sent", "Sent"], ["partial", "Partly paid"], ["overdue", "Overdue"], ["paid", "Paid"]];

    const totalOwed = state.invoices
      .filter(i => i.status !== "draft" && !isFullyPaid(i))
      .reduce((s, i) => s + invBalance(i), 0);

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Invoices</div>
          <div class="view-sub">${totalOwed > 0 ? `<strong>${money(totalOwed)}</strong> still owed across open invoices` : "Everything is paid up — nice work!"}</div>
        </div>
        <div class="header-actions">
          <button class="btn" id="uploadInvoice">📎 Upload existing invoice</button>
          <button class="btn btn-primary" id="addInvoice">+ New invoice</button>
        </div>
      </div>

      <div class="filter-row">
        ${chips.map(([k, lbl]) => `<button class="chip ${invoiceFilter === k ? "active" : ""}" data-filter="${k}">${lbl}</button>`).join("")}
      </div>

      <div class="card">
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Client</th><th>Issued</th><th>Due</th><th class="right">Total</th><th class="right">Paid</th><th class="right">Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${list.map(i => {
              const paid = invPaid(i), bal = invBalance(i);
              return `
              <tr class="clickable" data-open-invoice="${i.id}">
                <td class="nowrap"><strong>${escapeHtml(i.number)}</strong>${isUploaded(i) ? ` <span class="pdf-tag" title="Uploaded PDF">PDF</span>` : ""}</td>
                <td>${escapeHtml(clientName(i.clientId))}${i.eventId && eventById(i.eventId) ? `<span class="sub">${escapeHtml(eventById(i.eventId).title)}</span>` : ""}</td>
                <td class="nowrap">${fmtDate(i.issueDate)}</td>
                <td class="nowrap">${fmtDate(i.dueDate)}</td>
                <td class="right nowrap">${money(invTotal(i))}</td>
                <td class="right nowrap ${paid > 0 ? "amt-paid" : "amt-none"}">${paid > 0 ? money(paid) : "—"}</td>
                <td class="right nowrap"><strong class="${bal > 0 ? "amt-due" : "amt-paid"}">${bal > 0 ? money(bal) : "—"}</strong></td>
                <td>${badge(invStatus(i))}</td>
                <td class="right nowrap"><button class="btn btn-sm" data-edit-invoice="${i.id}">Edit</button></td>
              </tr>`;
            }).join("")}
          </tbody></table></div>`
        : `<div class="empty-state"><div class="big">📄</div><p>No invoices here yet.</p>
           <button class="btn btn-primary" id="emptyAddInvoice">+ New invoice</button>
           <button class="btn" id="emptyUploadInvoice">📎 Upload an existing one</button></div>`}
      </div>`;

    $("#addInvoice", root).addEventListener("click", () => openInvoiceForm());
    $("#uploadInvoice", root).addEventListener("click", () => openUploadInvoiceForm());
    $("#emptyAddInvoice", root)?.addEventListener("click", () => openInvoiceForm());
    $("#emptyUploadInvoice", root)?.addEventListener("click", () => openUploadInvoiceForm());
    $$("[data-filter]", root).forEach(ch => ch.addEventListener("click", () => {
      invoiceFilter = ch.dataset.filter;
      renderInvoices(root);
    }));
    $$("[data-edit-invoice]", root).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const inv = invoiceById(b.dataset.editInvoice);
      // Uploaded PDFs have no line items to edit — only their details.
      if (isUploaded(inv)) openUploadInvoiceForm(inv.id);
      else openInvoiceForm(inv.id);
    }));
    bindRowOpeners(root);
  }

  /* ---------- Invoice editor (RND grouped model) ---------- */

  const newItem = () => ({ name: "", qty: 1, price: "", comp: false, details: [] });
  const newGroup = () => ({ name: "", items: [newItem()] });

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
    const clientId = inv?.clientId || preset.clientId || "";
    const eventId = inv?.eventId || preset.eventId || "";

    // Working copy the editor mutates; committed on submit.
    let draft;
    if (inv) {
      draft = JSON.parse(JSON.stringify({
        groups: inv.groups, discounts: inv.discounts,
        hotelEnabled: !!inv.hotelEnabled, hotelText: inv.hotelText || s.hotelText,
      }));
      if (!draft.groups.length) draft.groups = [newGroup()];
    } else {
      let groups = [newGroup()];
      if (preset.eventId) {
        const ev = eventById(preset.eventId);
        if (ev) groups = [{
          name: ev.title,
          items: [{ name: `DJ services — ${fmtDate(ev.date)}`, qty: 1, price: ev.fee || "", comp: false, details: [] }],
        }];
      }
      draft = { groups, discounts: [], hotelEnabled: true, hotelText: s.hotelText };
    }

    openModal(modalShell(inv ? `Edit invoice ${inv.number}` : "New invoice", `
      ${inv ? "" : `<div class="switch-note">
        Already have this invoice as a PDF?
        <button type="button" class="linkish" id="switchToUpload">Upload it instead →</button>
      </div>`}
      <form id="invoiceForm">
        <div class="form-grid">
          <div class="field"><label>Invoice #</label><input name="number" value="${escapeHtml(number)}"></div>
          <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(clientId)}</select></div>
          <div class="field"><label>Linked gig (optional)</label>
            <select name="eventId">${gigOptions(eventId)}</select>
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${["draft", "sent", "paid"].map(st => `<option value="${st}" ${(inv?.status || "draft") === st ? "selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Issue date</label><input name="issueDate" type="date" value="${escapeHtml(issueDate)}"></div>
          <div class="field"><label>Due date</label><input name="dueDate" type="date" value="${escapeHtml(dueDate)}"></div>
        </div>

        <div class="section-label">Events / line items
          <span class="section-hint">Group items under each event (Sangeet, Reception…). Included items show on the invoice without a price. COMP = included free.</span>
        </div>
        <div id="invGroups"></div>
        <button type="button" class="btn btn-sm" id="addGroup">+ Add event / section</button>

        <div class="section-label">Discounts</div>
        <div id="invDiscounts"></div>
        <button type="button" class="btn btn-sm" id="addDiscount">+ Add discount</button>

        <div class="section-label">Hotel &amp; parking clause</div>
        <label class="comp-toggle" style="margin-bottom:8px">
          <input type="checkbox" id="hotelEnabled" ${draft.hotelEnabled ? "checked" : ""}> Include hotel &amp; parking clause on invoice
        </label>
        <textarea id="hotelText" class="field-textarea" rows="3">${escapeHtml(draft.hotelText)}</textarea>

        <div class="invoice-totals">
          <div class="totals-row"><span class="lbl">Subtotal</span><span id="tSubtotal">$0.00</span></div>
          <div class="totals-row">
            <span class="lbl">Tax % <input id="taxRateInput" type="number" min="0" step="0.01" class="mini-num" value="${escapeHtml(inv?.taxRate ?? s.taxRate ?? 0)}"></span>
            <span id="tTax">$0.00</span>
          </div>
          <div class="totals-row"><span class="lbl">Discounts</span><span id="tDiscount">−$0.00</span></div>
          <div class="totals-row grand"><span class="lbl">Amount due</span><span id="tTotal">$0.00</span></div>
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
    const groupsEl = $("#invGroups");
    const discountsEl = $("#invDiscounts");

    // Carry whatever's already chosen over to the upload form.
    $("#switchToUpload")?.addEventListener("click", () => openUploadInvoiceForm(null, {
      clientId: form.clientId.value || clientId,
      eventId: form.eventId.value || eventId,
    }));

    function renderEditor() {
      groupsEl.innerHTML = draft.groups.map((g, gi) => `
        <div class="group-card">
          <div class="group-head">
            <input class="ed" data-g="${gi}" data-f="name" value="${escapeHtml(g.name)}" placeholder="Event / section name (e.g. Reception — 400 People)">
            <button type="button" class="remove-line" data-act="rm-group" data-g="${gi}" title="Remove section">✕</button>
          </div>
          ${g.items.map((it, ii) => `
            <div class="item-block">
              <div class="item-row">
                <input class="ed" data-g="${gi}" data-i="${ii}" data-f="name" value="${escapeHtml(it.name)}" placeholder="Package / item (e.g. Sound Package)">
                <input class="ed" type="number" min="0" step="0.5" data-g="${gi}" data-i="${ii}" data-f="qty" value="${escapeHtml(it.qty)}" title="Qty">
                <input class="ed" type="number" min="0" step="0.01" data-g="${gi}" data-i="${ii}" data-f="price" value="${escapeHtml(it.comp ? "" : it.price)}" placeholder="Price" ${it.comp ? "disabled" : ""}>
                <label class="comp-toggle" title="Complimentary — shows COMP on invoice">
                  <input type="checkbox" class="ed" data-g="${gi}" data-i="${ii}" data-f="comp" ${it.comp ? "checked" : ""}> COMP
                </label>
                <button type="button" class="remove-line" data-act="rm-item" data-g="${gi}" data-i="${ii}" title="Remove item">✕</button>
              </div>
              <div class="detail-rows">
                ${it.details.map((dt, di) => `
                  <div class="detail-row">
                    <input class="ed" data-g="${gi}" data-i="${ii}" data-d="${di}" data-f="name" value="${escapeHtml(dt.name)}" placeholder="Included item (e.g. RCF 945, Wireless Microphone)">
                    <input class="ed" type="number" min="0" data-g="${gi}" data-i="${ii}" data-d="${di}" data-f="qty" value="${escapeHtml(dt.qty)}" title="Qty">
                    <button type="button" class="remove-line" data-act="rm-detail" data-g="${gi}" data-i="${ii}" data-d="${di}" title="Remove">✕</button>
                  </div>`).join("")}
                <button type="button" class="btn btn-sm btn-ghost" data-act="add-detail" data-g="${gi}" data-i="${ii}">+ Included item</button>
              </div>
            </div>`).join("")}
          <button type="button" class="btn btn-sm btn-ghost" data-act="add-item" data-g="${gi}">+ Add item</button>
        </div>`).join("");

      discountsEl.innerHTML = draft.discounts.length ? draft.discounts.map((d, di) => `
        <div class="detail-row discount-row">
          <input class="edd" data-di="${di}" data-f="name" value="${escapeHtml(d.name)}" placeholder="Discount label (e.g. Friends + Family)">
          <input class="edd" type="number" min="0" step="0.01" data-di="${di}" data-f="amount" value="${escapeHtml(d.amount)}" placeholder="Amount">
          <button type="button" class="remove-line" data-act="rm-discount" data-di="${di}" title="Remove">✕</button>
        </div>`).join("") : "";
      recalc();
    }

    function draftTotals() {
      return {
        groups: draft.groups, discounts: draft.discounts,
        taxRate: Number($("#taxRateInput").value) || 0,
      };
    }

    function recalc() {
      const d = draftTotals();
      $("#tSubtotal").textContent = money(invSubtotal(d));
      $("#tTax").textContent = money(invTax(d));
      $("#tDiscount").textContent = "−" + money(invDiscountTotal(d));
      $("#tTotal").textContent = money(invTotal(d));
    }

    form.addEventListener("input", e => {
      const el = e.target;
      if (el.classList.contains("ed")) {
        const g = Number(el.dataset.g), f = el.dataset.f;
        const grp = draft.groups[g];
        if (!grp) return;
        if (el.dataset.d !== undefined) {
          const det = grp.items[Number(el.dataset.i)]?.details[Number(el.dataset.d)];
          if (det) det[f] = el.value;
        } else if (el.dataset.i !== undefined) {
          const it = grp.items[Number(el.dataset.i)];
          if (!it) return;
          if (f === "comp") { it.comp = el.checked; renderEditor(); return; }
          it[f] = el.value;
        } else {
          grp[f] = el.value;
        }
      } else if (el.classList.contains("edd")) {
        const d = draft.discounts[Number(el.dataset.di)];
        if (d) d[el.dataset.f] = el.value;
      } else if (el.id === "hotelEnabled") {
        draft.hotelEnabled = el.checked;
      } else if (el.id === "hotelText") {
        draft.hotelText = el.value;
      }
      recalc();
    });

    form.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const g = Number(btn.dataset.g), i = Number(btn.dataset.i), d = Number(btn.dataset.d), di = Number(btn.dataset.di);
      const act = btn.dataset.act;
      if (act === "rm-group") { if (draft.groups.length > 1) draft.groups.splice(g, 1); else draft.groups = [newGroup()]; }
      else if (act === "add-item") draft.groups[g].items.push(newItem());
      else if (act === "rm-item") { const items = draft.groups[g].items; if (items.length > 1) items.splice(i, 1); else draft.groups[g].items = [newItem()]; }
      else if (act === "add-detail") draft.groups[g].items[i].details.push({ name: "", qty: 1 });
      else if (act === "rm-detail") draft.groups[g].items[i].details.splice(d, 1);
      else if (act === "rm-discount") draft.discounts.splice(di, 1);
      else return;
      renderEditor();
    });

    $("#addGroup").addEventListener("click", () => { draft.groups.push(newGroup()); renderEditor(); });
    $("#addDiscount").addEventListener("click", () => { draft.discounts.push({ name: "", amount: "" }); renderEditor(); });
    renderEditor();

    $("#cancelModal").addEventListener("click", closeModal);
    $("#deleteInvoice")?.addEventListener("click", () => {
      if (!confirm("Delete this invoice?")) return;
      state.invoices = state.invoices.filter(x => x.id !== id);
      save(); closeModal(); render(); toast("Invoice deleted");
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());

      // Drop empty rows; normalize numbers.
      const groups = draft.groups.map(g => ({
        name: g.name.trim(),
        items: g.items
          .filter(it => it.name.trim() || it.price !== "" || it.details.some(dt => dt.name.trim()))
          .map(it => ({
            name: it.name.trim(), qty: Number(it.qty) || 1,
            price: it.comp ? 0 : (Number(it.price) || 0), comp: !!it.comp,
            details: it.details.filter(dt => dt.name.trim()).map(dt => ({ name: dt.name.trim(), qty: Number(dt.qty) || 1 })),
          })),
      })).filter(g => g.name || g.items.length);

      if (!groups.some(g => g.items.length)) { toast("Add at least one line item"); return; }

      const discounts = draft.discounts
        .filter(d => d.name.trim() || d.amount !== "")
        .map(d => ({ name: d.name.trim() || "Discount", amount: Math.abs(Number(d.amount) || 0) }));

      const data = {
        number: fd.number || number,
        clientId: fd.clientId,
        eventId: fd.eventId,
        status: fd.status,
        issueDate: fd.issueDate,
        dueDate: fd.dueDate,
        groups, discounts,
        hotelEnabled: draft.hotelEnabled,
        hotelText: draft.hotelText,
        taxRate: Number($("#taxRateInput").value) || 0,
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
      openInvoiceDetail(inv ? id : state.invoices[state.invoices.length - 1].id);
    });
  }

  /* ---------- Upload an existing invoice (PDF) ---------- */

  function openUploadInvoiceForm(id, preset = {}) {
    const inv = id ? invoiceById(id) : null;
    if (!state.clients.length) {
      toast("Add a client first — invoices are billed to clients");
      openClientForm();
      return;
    }
    const s = state.settings;
    const issueDate = inv?.issueDate || todayISO();
    const clientId = inv?.clientId || preset.clientId || "";
    const eventId = inv?.eventId || preset.eventId || "";
    // Coming from a gig, its fee is the most likely total.
    const presetTotal = inv?.manualTotal ?? (preset.eventId ? eventById(preset.eventId)?.fee : "") ?? "";

    openModal(modalShell(inv ? `Edit ${inv.number}` : "Upload an existing invoice", `
      <form id="uploadInvForm">
        <p class="settings-note">
          ${inv
            ? "Update the details, or swap in a new version of the file."
            : "Already made this invoice somewhere else? Upload the PDF and track it here — payments, deposits and status all work the same, with no need to rebuild it."}
        </p>

        <div class="field full">
          <label>Invoice PDF ${inv ? "(leave empty to keep the current file)" : "*"}</label>
          <input type="file" name="file" accept="application/pdf,.pdf,image/*" ${inv ? "" : "required"}>
          ${inv?.file ? `<div class="file-current">📎 ${escapeHtml(inv.file.name)} · ${fmtBytes(inv.file.size)}${inv.file.synced === false ? " · this device only" : ""}</div>` : ""}
          <div class="file-hint">PDFs up to ${fmtBytes(SYNC_FILE_LIMIT)} sync to your other devices. Larger files (up to ${fmtBytes(MAX_FILE_SIZE)}) still upload, but stay on this device.</div>
        </div>

        <div class="form-grid">
          <div class="field"><label>Invoice #</label>
            <input name="number" value="${escapeHtml(inv?.number || s.invoicePrefix + String(s.nextInvoiceNumber).padStart(3, "0"))}">
          </div>
          <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(clientId)}</select></div>
          <div class="field"><label>Linked gig (optional)</label>
            <select name="eventId">${gigOptions(eventId)}</select>
          </div>
          <div class="field"><label>Invoice total *</label>
            <input name="manualTotal" type="number" step="0.01" min="0" required value="${escapeHtml(presetTotal)}" placeholder="0.00">
          </div>
          <div class="field"><label>Issue date</label><input name="issueDate" type="date" value="${escapeHtml(issueDate)}"></div>
          <div class="field"><label>Due date</label>
            <input name="dueDate" type="date" value="${escapeHtml(inv?.dueDate || addDaysISO(issueDate, s.defaultDueDays || 14))}">
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${["draft", "sent", "paid"].map(st => `<option value="${st}" ${(inv?.status || "sent") === st ? "selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><label>Notes</label>
            <textarea name="notes" placeholder="Anything worth remembering about this invoice…">${escapeHtml(inv?.notes || "")}</textarea>
          </div>
        </div>

        <div class="modal-actions">
          ${inv ? `<button type="button" class="btn btn-danger" id="deleteUploadInv">Delete</button>` : ""}
          <button type="button" class="btn" id="cancelModal">Cancel</button>
          <button type="submit" class="btn btn-primary" id="uploadSubmit">${inv ? "Save changes" : "Upload invoice"}</button>
        </div>
      </form>`), true);

    $("#cancelModal").addEventListener("click", closeModal);
    $("#deleteUploadInv")?.addEventListener("click", async () => {
      if (!confirm("Delete this invoice and its uploaded file?")) return;
      if (inv.file?.id) await deleteAttachment(inv.file.id);
      state.invoices = state.invoices.filter(x => x.id !== id);
      save(); closeModal(); render(); toast("Invoice deleted");
    });

    $("#uploadInvForm").addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.target;
      const fd = Object.fromEntries(new FormData(form).entries());
      const file = form.file.files[0];

      if (!inv && !file) { toast("Choose a PDF to upload"); return; }
      if (file && file.size > MAX_FILE_SIZE) {
        toast(`That file is ${fmtBytes(file.size)} — the limit is ${fmtBytes(MAX_FILE_SIZE)}`);
        return;
      }

      const btn = $("#uploadSubmit");
      btn.disabled = true;
      btn.textContent = file ? "Uploading…" : "Saving…";

      try {
        let fileMeta = inv?.file || null;
        if (file) {
          const fileId = uid();
          const data = await readFileAsBase64(file);
          const rec = { name: file.name, type: file.type || "application/pdf", size: file.size, data };
          const { cached, synced } = await saveAttachment(fileId, rec);
          if (!cached && !synced) throw new Error("The file could not be saved");
          // Replacing a file leaves the old one behind otherwise.
          if (inv?.file?.id) await deleteAttachment(inv.file.id);
          fileMeta = { id: fileId, name: rec.name, type: rec.type, size: rec.size, synced };
          if (!synced && cloud.user) {
            toast(`Saved — ${fmtBytes(file.size)} is too big to sync, so it stays on this device`);
          }
        }

        const data = {
          kind: "uploaded",
          number: fd.number || "",
          clientId: fd.clientId,
          eventId: fd.eventId,
          status: fd.status,
          issueDate: fd.issueDate,
          dueDate: fd.dueDate,
          manualTotal: Number(fd.manualTotal) || 0,
          notes: fd.notes,
          file: fileMeta,
          groups: [], discounts: [], taxRate: 0,
        };

        if (inv) {
          if (data.status === "paid" && inv.status !== "paid") data.paidDate = todayISO();
          Object.assign(inv, data);
        } else {
          const record = { id: uid(), payments: [], ...data };
          if (record.status === "paid") {
            record.paidDate = todayISO();
            record.payments = [{ id: uid(), date: todayISO(), amount: record.manualTotal, method: "", note: "Paid in full" }];
          }
          state.invoices.push(record);
          state.settings.nextInvoiceNumber = (state.settings.nextInvoiceNumber || 1) + 1;
        }

        save(); closeModal(); render();
        toast(inv ? "Invoice updated" : "Invoice uploaded 📎");
        openInvoiceDetail(inv ? id : state.invoices[state.invoices.length - 1].id);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = inv ? "Save changes" : "Upload invoice";
        toast(err.message || "Upload failed — please try again");
      }
    });
  }

  // Renders the uploaded file into an already-open invoice detail modal.
  async function mountAttachmentPreview(inv) {
    const host = $("#pdfHost");
    if (!host) return;
    const rec = inv.file ? await loadAttachment(inv.file.id) : null;
    if (!$("#pdfHost")) return;   // modal closed while loading

    if (!rec) {
      host.innerHTML = `<div class="pdf-missing">
        <strong>File not available on this device.</strong><br>
        ${inv.file && inv.file.synced === false
          ? "It was too large to sync, so it only exists on the device it was uploaded from. Upload it again here to attach a copy."
          : "It may still be downloading, or it was removed. Try again, or upload the file again from Edit."}
      </div>`;
      return;
    }

    const url = trackObjectUrl(URL.createObjectURL(attachmentBlob(rec)));
    const isPdf = (rec.type || "").includes("pdf");
    // Some browsers (notably iOS Safari) won't render a PDF inline, so
    // always point at the buttons that definitely work.
    host.innerHTML = isPdf
      ? `<iframe class="pdf-frame" src="${url}#view=FitH" title="${escapeHtml(rec.name)}"></iframe>
         <div class="pdf-fallback">Preview not showing? Use <strong>Open / Print</strong> or <strong>Download</strong> below.</div>`
      : `<img class="pdf-image" src="${url}" alt="${escapeHtml(rec.name)}">`;

    const dl = $("#invDownload");
    if (dl) { dl.href = url; dl.download = rec.name; }
    const open = $("#invOpenPdf");
    if (open) open.addEventListener("click", () => window.open(url, "_blank"));
  }

  /* ---------- Invoice document (RND Entertainment design) ---------- */

  function logoHtml() {
    const s = state.settings;
    if (s.logoImg) return `<img src="${s.logoImg}" alt="logo">`;
    return escapeHtml(s.logoText || s.businessName || "");
  }

  function invoiceDocHtml(inv) {
    const s = state.settings;
    const c = clientById(inv.clientId);
    const ev = inv.eventId ? eventById(inv.eventId) : null;
    const status = invStatus(inv);
    const title = inv.status === "draft" ? "Draft Invoice" : "Invoice";

    let rows = "";
    (inv.groups || []).forEach(g => {
      const hasItems = g.items.length > 0;
      if (!g.name && !hasItems) return;
      const anyNonComp = g.items.some(it => !it.comp);
      const evTotal = !hasItems ? "" : (!anyNonComp ? "COMP" : money(groupSum(g)));
      rows += `<tr class="row-event"><td colspan="3">${escapeHtml(g.name || "Services")}</td><td>${evTotal}</td></tr>`;
      g.items.forEach(it => {
        if (!it.name) return;
        const price = it.comp ? "COMP" : money(Number(it.price) || 0);
        const total = it.comp ? "COMP" : money(itemAmount(it));
        rows += `<tr class="row-pkg"><td>${escapeHtml(it.name)}</td><td>${it.qty || 1}</td><td>${price}</td><td>${total}</td></tr>`;
        (it.details || []).forEach(dt => {
          if (!dt.name) return;
          rows += `<tr class="row-equip"><td>${escapeHtml(dt.name)}</td><td>${dt.qty || 1}</td><td></td><td></td></tr>`;
        });
      });
    });

    if ((inv.discounts || []).length) {
      const discTotal = -invDiscountTotal(inv);
      rows += `<tr class="row-discount-group"><td colspan="3">Discounts</td><td>−${money(-discTotal)}</td></tr>`;
      inv.discounts.forEach(d => {
        rows += `<tr class="row-discount"><td colspan="3">${escapeHtml(d.name)}</td><td>−${money(Math.abs(Number(d.amount) || 0))}</td></tr>`;
      });
    }

    if (Number(inv.taxRate) > 0) {
      rows += `<tr class="row-event"><td colspan="3">Tax (${inv.taxRate}%)</td><td>${money(invTax(inv))}</td></tr>`;
    }

    const payments = inv.payments || [];
    if (payments.length) {
      rows += `<tr class="row-discount-group"><td colspan="3">Payments Received</td><td>−${money(invPaid(inv))}</td></tr>`;
      payments.forEach(p => {
        const label = [p.note || "Payment", fmtDate(p.date), p.method].filter(Boolean).join(" · ");
        rows += `<tr class="row-payment"><td colspan="3">${escapeHtml(label)}</td><td>−${money(Number(p.amount) || 0)}</td></tr>`;
      });
    }

    if (inv.hotelEnabled && inv.hotelText) {
      rows += `<tr class="row-hotel"><td class="hotel-label">Hotel &amp; Parking<br>Accommodations</td><td colspan="3">${escapeHtml(inv.hotelText)}</td></tr>`;
    }

    const billLines = [
      c?.name, c?.company, c?.email, c?.phone,
      ev ? `${ev.title} — ${fmtDate(ev.date)}` : null,
      ev?.venue,
    ].filter(Boolean).map(l => `<div>${escapeHtml(l)}</div>`).join("") || "<div>N/A</div>";

    return `
      <div class="rnd-doc">
        <div class="rnd-header">
          <div class="rnd-header-left">
            <div class="rnd-company">${escapeHtml(s.businessName || "Your Company")}</div>
            <div class="rnd-title">${title}</div>
          </div>
          <div class="rnd-logo">${logoHtml()}</div>
        </div>
        <div class="rnd-meta">
          <div class="rnd-meta-item">Invoice ${escapeHtml(inv.number || "—")}</div>
          <div class="rnd-meta-item">Issued On: ${fmtDate(inv.issueDate)}</div>
          <div class="rnd-meta-item">Due Date: ${fmtDate(inv.dueDate)}</div>
          ${status === "paid" ? `<div class="rnd-meta-item rnd-paid">PAID ${inv.paidDate ? fmtDate(inv.paidDate) : ""}</div>`
            : payments.length ? `<div class="rnd-meta-item rnd-partial">DEPOSIT RECEIVED</div>` : ""}
        </div>
        <div class="rnd-parties">
          <div>
            <div class="rnd-party-label">Bill to:</div>
            <div class="rnd-party-val">${billLines}</div>
          </div>
          <div>
            <div class="rnd-party-label">Payable to:</div>
            <div class="rnd-party-val">${escapeHtml(s.businessName || "")}<br>${escapeHtml(s.address || "").replace(/\n/g, "<br>")}</div>
          </div>
        </div>
        <table class="rnd-table">
          <thead><tr>
            <th style="width:55%">Description</th>
            <th style="width:12%">Quantity</th>
            <th style="width:16%">Price</th>
            <th style="width:17%">Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${inv.notes ? `<div class="rnd-notes">${escapeHtml(inv.notes).replace(/\n/g, "<br>")}</div>` : ""}
        <div class="rnd-total">
          ${payments.length ? `<span class="rnd-total-sub">Invoice total ${money(invTotal(inv))} &nbsp;·&nbsp; Received ${money(invPaid(inv))}</span>` : ""}
          <span class="rnd-total-label">${isFullyPaid(inv) && invPaid(inv) > 0 ? "Paid in Full:" : payments.length ? "Balance Due:" : "Amount Due:"}</span>
          <span class="rnd-total-val">${money(isFullyPaid(inv) && invPaid(inv) > 0 ? invTotal(inv) : invBalance(inv))}</span>
        </div>
        <div class="rnd-footer">
          <div class="rnd-footer-logo">${logoHtml()}</div>
          <div class="rnd-footer-info">
            <span>${escapeHtml(s.address || "")}</span>
            <span>${escapeHtml(s.phone || "")}</span>
            <span>${escapeHtml(s.email || "")}</span>
          </div>
        </div>
      </div>`;
  }

  function openInvoiceDetail(id) {
    const inv = invoiceById(id);
    if (!inv) return;
    const c = clientById(inv.clientId);
    const status = invStatus(inv);
    const gmailOn = !!state.settings.googleClientId;

    const total = invTotal(inv), paid = invPaid(inv), balance = invBalance(inv);
    const payments = [...(inv.payments || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const pct = total > 0 ? Math.max(0, Math.min(100, (paid / total) * 100)) : 0;

    openModal(modalShell(`Invoice ${inv.number}`, `
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${badge(status)}
        <span style="color:var(--muted);font-size:13px">${c ? "Billed to " + escapeHtml(c.name) : ""}${inv.paidDate ? " · paid in full " + fmtDate(inv.paidDate) : ""}</span>
      </div>

      <div class="pay-panel">
        <div class="pay-summary">
          <div class="pay-stat"><div class="lbl">Invoice total</div><div class="val">${money(total)}</div></div>
          <div class="pay-stat"><div class="lbl">Received</div><div class="val pos">${money(paid)}</div></div>
          <div class="pay-stat"><div class="lbl">Balance due</div><div class="val ${balance > 0 ? "warn" : "pos"}">${money(Math.max(0, balance))}</div></div>
        </div>
        ${paid > 0 ? `<div class="pay-bar"><div class="pay-bar-fill" style="width:${pct}%"></div></div>
          <div class="pay-bar-note">${pct >= 100 ? "Paid in full 🎉" : `${Math.round(pct)}% collected`}</div>` : ""}

        ${payments.length ? `<div class="table-wrap"><table class="pay-table">
          <thead><tr><th>Date</th><th>Description</th><th>Method</th><th class="right">Amount</th><th></th></tr></thead>
          <tbody>
            ${payments.map(p => `<tr>
              <td class="nowrap">${fmtDate(p.date)}</td>
              <td>${escapeHtml(p.note || "Payment")}</td>
              <td>${escapeHtml(p.method || "—")}</td>
              <td class="right nowrap amt-paid">${money(Number(p.amount) || 0)}</td>
              <td class="right"><button class="remove-line" data-del-payment="${p.id}" title="Delete this payment">✕</button></td>
            </tr>`).join("")}
          </tbody></table></div>`
        : `<div class="pay-empty">No payments recorded yet. Log a deposit as soon as it lands so the balance stays accurate.</div>`}

        ${balance > 0 ? `<div class="pay-actions">
          <button class="btn btn-primary btn-sm" id="invAddPayment">+ Record payment / deposit</button>
          ${!paid ? `<button class="btn btn-sm" id="invDeposit50">Log 50% deposit (${money(total / 2)})</button>` : ""}
          <button class="btn btn-sm" id="invPayFull">Mark balance paid (${money(balance)})</button>
        </div>` : `<div class="pay-actions"><button class="btn btn-sm" id="invAddPayment">+ Record another payment</button></div>`}
      </div>

      ${isUploaded(inv)
        ? `<div class="pdf-panel">
             <div class="pdf-head">
               <span>📎 ${escapeHtml(inv.file?.name || "Uploaded invoice")}${inv.file ? ` · ${fmtBytes(inv.file.size)}` : ""}</span>
               ${inv.file?.synced === false ? `<span class="pdf-local">this device only</span>` : ""}
             </div>
             <div id="pdfHost" class="pdf-host"><div class="pdf-loading">Loading file…</div></div>
           </div>`
        : `<div class="doc-preview">${invoiceDocHtml(inv)}</div>`}
      <div class="modal-actions" style="flex-wrap:wrap">
        ${status === "draft" ? `<button class="btn" id="invMarkSent">Mark sent</button>` : ""}
        ${isUploaded(inv)
          ? `<a class="btn" id="invDownload" href="#" download>⬇ Download</a>
             <button class="btn" id="invOpenPdf">🖨 Open / Print</button>`
          : `<button class="btn" id="invPrint">🖨 Print / PDF</button>`}
        ${c?.email ? `<button class="btn" id="invEmail">✉️ Email (mail app)</button>` : ""}
        ${c?.email ? `<button class="btn btn-primary" id="invGmail">📨 Send via Gmail${isUploaded(inv) ? " with PDF" : ""}</button>` : ""}
        <button class="btn" id="invEdit">Edit</button>
      </div>
      ${!gmailOn && c?.email ? `<div class="gmail-hint">Tip: connect Gmail in <a href="#" id="goSettings">Settings</a> to send invoices directly from here.</div>` : ""}`), true);

    $("#invEdit").addEventListener("click", () => isUploaded(inv) ? openUploadInvoiceForm(id) : openInvoiceForm(id));
    if (isUploaded(inv)) mountAttachmentPreview(inv);
    $("#invAddPayment")?.addEventListener("click", () => openPaymentForm(id));
    $("#invDeposit50")?.addEventListener("click", () =>
      openPaymentForm(id, { amount: Math.round((total / 2) * 100) / 100, note: "Deposit" }));
    $("#invPayFull")?.addEventListener("click", () =>
      openPaymentForm(id, { amount: balance, note: paid > 0 ? "Final balance" : "Paid in full" }));
    $$("[data-del-payment]", $("#modal")).forEach(b => b.addEventListener("click", () => {
      if (!confirm("Delete this payment record?")) return;
      inv.payments = (inv.payments || []).filter(p => p.id !== b.dataset.delPayment);
      // Deleting a payment can un-settle an invoice that was fully paid.
      if (inv.status === "paid" && invBalance(inv) > 0) { inv.status = "sent"; delete inv.paidDate; }
      save(); render(); openInvoiceDetail(id); toast("Payment deleted");
    }));
    $("#invMarkSent")?.addEventListener("click", () => {
      inv.status = "sent";
      save(); render(); openInvoiceDetail(id); toast("Marked as sent");
    });
    $("#invPrint")?.addEventListener("click", () => printInvoice(inv));
    $("#invEmail")?.addEventListener("click", () => emailInvoice(inv));
    $("#invGmail")?.addEventListener("click", () => sendInvoiceViaGmail(inv, id));
    $("#goSettings")?.addEventListener("click", e => { e.preventDefault(); closeModal(); go("settings"); });
  }

  function openPaymentForm(invId, preset = {}) {
    const inv = invoiceById(invId);
    if (!inv) return;
    const balance = invBalance(inv);
    const amount = preset.amount != null ? preset.amount : Math.max(0, balance);
    const isFirst = !invPaid(inv);

    openModal(modalShell("Record a payment", `
      <form id="paymentForm">
        <p class="settings-note" style="margin-bottom:16px">
          Invoice ${escapeHtml(inv.number)} — ${escapeHtml(clientName(inv.clientId))}<br>
          Total ${money(invTotal(inv))} · Balance due <strong>${money(Math.max(0, balance))}</strong>
        </p>
        <div class="form-grid">
          <div class="field"><label>Amount received *</label>
            <input name="amount" type="number" step="0.01" min="0.01" required value="${escapeHtml(amount || "")}" autofocus>
          </div>
          <div class="field"><label>Date received</label>
            <input name="date" type="date" value="${todayISO()}">
          </div>
          <div class="field"><label>Payment method</label>
            <select name="method">
              <option value="">— Not specified —</option>
              ${PAYMENT_METHODS.map(m => `<option ${preset.method === m ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Description</label>
            <input name="note" value="${escapeHtml(preset.note || (isFirst ? "Deposit" : "Payment"))}" placeholder="Deposit, final balance…">
          </div>
        </div>
        <div class="quick-amounts">
          <span class="quick-label">Quick fill:</span>
          <button type="button" class="chip" data-amt="${Math.round(invTotal(inv) * 0.25 * 100) / 100}">25% deposit</button>
          <button type="button" class="chip" data-amt="${Math.round(invTotal(inv) * 0.5 * 100) / 100}">50% deposit</button>
          <button type="button" class="chip" data-amt="${Math.max(0, balance)}">Full balance</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" id="cancelPayment">Cancel</button>
          <button type="submit" class="btn btn-primary">Record payment</button>
        </div>
      </form>`));

    const form = $("#paymentForm");
    $("#cancelPayment").addEventListener("click", () => openInvoiceDetail(invId));
    $$(".quick-amounts .chip", form).forEach(b => b.addEventListener("click", () => {
      form.amount.value = b.dataset.amt;
      form.amount.focus();
    }));

    form.addEventListener("submit", e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      const amt = Number(fd.amount);
      if (!(amt > 0)) { toast("Enter an amount greater than zero"); return; }
      inv.payments = inv.payments || [];
      inv.payments.push({
        id: uid(), date: fd.date || todayISO(), amount: amt,
        method: fd.method || "", note: fd.note || "Payment",
      });
      // Settle the invoice automatically once nothing is left owing.
      if (invBalance(inv) <= 0) {
        inv.status = "paid";
        inv.paidDate = fd.date || todayISO();
      } else if (inv.status === "draft") {
        inv.status = "sent";
      }
      save(); render(); openInvoiceDetail(invId);
      toast(invBalance(inv) <= 0
        ? `Paid in full 🎉 ${money(amt)} recorded`
        : `${money(amt)} recorded — ${money(invBalance(inv))} still due`);
    });
  }

  function printInvoice(inv) {
    $("#printArea").innerHTML = invoiceDocHtml(inv);
    window.print();
  }

  /* ---------- Email: mailto fallback ---------- */

  function invoiceEmailSubject(inv) {
    const s = state.settings;
    if (isFullyPaid(inv) && invPaid(inv) > 0) return `Invoice ${inv.number} from ${s.businessName} — paid in full, thank you!`;
    if (invPaid(inv) > 0) return `Invoice ${inv.number} from ${s.businessName} — ${money(invBalance(inv))} balance due`;
    return `Invoice ${inv.number} from ${s.businessName} — ${money(invTotal(inv))}`;
  }

  function invoiceEmailText(inv) {
    const s = state.settings;
    const c = clientById(inv.clientId);
    const lines = [
      `Hi ${c ? c.name.split(" ")[0] : "there"},`,
      ``,
      `Here is your invoice from ${s.businessName}:`,
      ``,
      `Invoice: ${inv.number}`,
      `Issued: ${fmtDate(inv.issueDate)}`,
      `Due: ${fmtDate(inv.dueDate)}`,
      ``,
    ];
    if (isUploaded(inv)) {
      lines.push(`The full invoice is attached as a PDF.`);
    } else {
      (inv.groups || []).forEach(g => {
        if (g.name || g.items.length) lines.push(`${g.name || "Services"}:`);
        g.items.forEach(it => {
          lines.push(`  • ${it.name} — ${it.qty} × ${it.comp ? "COMP" : money(it.price)}${it.comp ? "" : " = " + money(itemAmount(it))}`);
          (it.details || []).forEach(dt => lines.push(`      - ${dt.name} × ${dt.qty}`));
        });
      });
    }
    (inv.discounts || []).forEach(d => lines.push(`  Discount — ${d.name}: −${money(d.amount)}`));
    if (Number(inv.taxRate) > 0) lines.push(`  Tax (${inv.taxRate}%): ${money(invTax(inv))}`);
    lines.push(``, `Invoice total: ${money(invTotal(inv))}`);
    (inv.payments || []).forEach(p =>
      lines.push(`  ${p.note || "Payment"} received ${fmtDate(p.date)}${p.method ? ` (${p.method})` : ""}: −${money(p.amount)}`));
    if (invPaid(inv) > 0) {
      lines.push(isFullyPaid(inv)
        ? `Paid in full — thank you! Nothing further is due.`
        : `Balance due: ${money(invBalance(inv))}`);
    } else {
      lines.push(`Amount due: ${money(invTotal(inv))}`);
    }
    lines.push(``);
    if (inv.notes) lines.push(inv.notes, ``);
    lines.push(`Thank you!`, s.ownerName || s.businessName, s.phone || "");
    return lines.join("\n");
  }

  function emailInvoice(inv) {
    const c = clientById(inv.clientId);
    if (!c?.email) { toast("This client has no email address on file"); return; }
    const url = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(invoiceEmailSubject(inv))}&body=${encodeURIComponent(invoiceEmailText(inv))}`;
    window.location.href = url;
    if (inv.status === "draft") {
      inv.status = "sent";
      save(); render();
      toast("Email drafted — invoice marked as sent");
    }
  }

  // Google's own wording for these failures names the fix (often with a
  // link), so show it in full rather than truncating it into a toast.
  function showGoogleProblem(err, api) {
    const msg = err.message || "Something went wrong.";
    const url = (msg.match(/https?:\/\/\S+/) || [])[0];
    const body = url ? msg.replace(url, "").replace(/\s*\.\s*$/, "") : msg;

    openModal(modalShell(`${api} isn't set up yet`, `
      <p class="settings-note" style="margin-bottom:14px">${escapeHtml(body)}</p>
      ${url ? `<p class="settings-note"><a href="${escapeHtml(url.replace(/[.,)]+$/, ""))}" target="_blank" rel="noopener">Open the Google Cloud page to fix it →</a></p>` : ""}
      ${err.setupNeeded ? `
        <div class="notes-box" style="margin-top:12px">
          <strong>The usual checklist</strong><br>
          1. Enable the <strong>${escapeHtml(api)} API</strong> in the Google Cloud project behind your Firebase app.<br>
          2. Add the ${api === "Gmail" ? "<code>gmail.send</code>" : "<code>calendar.events.readonly</code>"} scope on the <strong>OAuth consent screen</strong>.<br>
          3. While the app is unverified, add yourself under <strong>Test users</strong>.<br>
          4. Come back here and hit send again.
        </div>` : ""}
      ${err.needsConsent ? `
        <div class="notes-box" style="margin-top:12px">
          Tick every permission box on the Google screen — unticking the ${api === "Gmail" ? "sending" : "calendar"} one leaves the app without access.
        </div>` : ""}
      <div class="modal-actions">
        <button class="btn" id="googleProblemClose">Close</button>
        <button class="btn btn-primary" id="googleProblemRetry">Try again</button>
      </div>`));

    $("#googleProblemClose").addEventListener("click", closeModal);
    $("#googleProblemRetry").addEventListener("click", async () => {
      closeModal();
      try {
        await ensureGoogleScope(api === "Gmail" ? GMAIL_SCOPE : CALENDAR_SCOPE);
        toast("Connected — try sending again");
      } catch (e) {
        toast(e.message || "Still not connected");
      }
    });
  }

  /* ---------- Gmail integration (Google Identity Services) ---------- */

  let gmailToken = null;
  try { gmailToken = JSON.parse(sessionStorage.getItem(GMAIL_TOKEN_KEY)); } catch { /* ignore */ }

  function gmailReady() {
    return gmailToken && Date.now() < gmailToken.expiresAt - 60000;
  }

  let gsiPromise = null;
  function loadGsi() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client";
      sc.async = true;
      sc.onload = resolve;
      sc.onerror = () => { gsiPromise = null; reject(new Error("Could not load Google sign-in — check your internet connection")); };
      document.head.appendChild(sc);
    });
    return gsiPromise;
  }

  const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

  // True when we can piggyback on the account the user already signed
  // in with, instead of a second, separately-configured Google login.
  function canUseAccountForGmail() {
    return !!(cloud.auth?.currentUser && cloud.authMod);
  }

  // Asks Google for permission to send mail on the *already signed-in*
  // account. Firebase hands back the OAuth access token from the popup,
  // which is exactly what the Gmail API wants.
  function grantedScopes() { return (gmailToken?.scopes) || []; }

  function hasGoogleScope(scope) {
    return gmailReady() && grantedScopes().includes(scope);
  }

  // Asks for a scope only if it isn't already granted, and always asks
  // for the union so enabling a second feature can't revoke the first.
  async function ensureGoogleScope(scope) {
    if (hasGoogleScope(scope)) return;
    if (!canUseAccountForGmail()) {
      if (scope === GMAIL_SCOPE) return connectGmail();
      throw new Error("Sign in with your Google account to use this.");
    }
    const wanted = [...new Set([...grantedScopes(), scope])];
    return connectGmailViaAccount(wanted);
  }

  async function connectGmailViaAccount(scopes = [GMAIL_SCOPE]) {
    const { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup } = cloud.authMod;
    const user = cloud.auth.currentUser;

    const provider = new GoogleAuthProvider();
    scopes.forEach(s => provider.addScope(s));

    const hasGoogle = (user.providerData || []).some(p => p.providerId === "google.com");
    let result;
    try {
      // Already a Google account: re-auth to obtain a token with the
      // new scope. Signed up with email/password: link Google to it.
      result = hasGoogle
        ? await reauthenticateWithPopup(user, provider)
        : await linkWithPopup(user, provider);
    } catch (e) {
      if (e?.code === "auth/provider-already-linked") {
        result = await reauthenticateWithPopup(user, provider);
      } else if (e?.code === "auth/credential-already-in-use") {
        throw new Error("That Google account is already used by another ClientFlow account.");
      } else if (e?.code === "auth/user-mismatch") {
        throw new Error("Pick the Google account you signed in with.");
      } else {
        throw new Error(authErrorMessage(e));
      }
    }

    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) {
      throw new Error("Google didn't return access for your account — try again.");
    }

    // Record what Google actually granted, not what we asked for. A
    // permission the user unticks (or that isn't on the consent screen)
    // would otherwise look enabled here and fail on every send.
    const granted = await grantedScopesFor(cred.accessToken, scopes);
    const missing = scopes.filter(s => !granted.includes(s));
    if (missing.length) {
      const what = missing.includes(GMAIL_SCOPE) ? "send email" : "read your calendar";
      throw new Error(`Google didn't grant permission to ${what}. Try again and leave that checkbox ticked — if it never appears, the scope still needs adding to your OAuth consent screen.`);
    }

    gmailToken = {
      token: cred.accessToken,
      // Google's tokens last an hour; refresh a little early.
      expiresAt: Date.now() + 3500 * 1000,
      via: "account",
      scopes: granted,
      email: result.user?.email || user.email || "",
    };
    try { sessionStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify(gmailToken)); } catch { /* ignore */ }
  }

  // Google will tell us exactly which scopes a token carries.
  async function grantedScopesFor(accessToken, requested) {
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
      if (!res.ok) return requested;             // can't verify — don't block the user
      const info = await res.json();
      return String(info.scope || "").split(/\s+/).filter(Boolean);
    } catch {
      return requested;
    }
  }

  async function connectGmail() {
    // Preferred path: reuse the signed-in account, no extra setup.
    if (canUseAccountForGmail()) return connectGmailViaAccount();

    const clientId = (state.settings.googleClientId || "").trim();
    if (!clientId) {
      throw new Error("Add your Google OAuth Client ID in Settings → Gmail first");
    }
    if (location.protocol === "file:") {
      throw new Error("Gmail sign-in needs the site served over http(s) — use your GitHub Pages URL");
    }
    await loadGsi();
    return new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.send",
        callback: resp => {
          if (resp.error) { reject(new Error("Google sign-in failed: " + resp.error)); return; }
          gmailToken = {
            token: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
            scopes: [GMAIL_SCOPE],
          };
          try { sessionStorage.setItem(GMAIL_TOKEN_KEY, JSON.stringify(gmailToken)); } catch { /* ignore */ }
          resolve();
        },
        error_callback: err => reject(new Error("Google sign-in was closed or blocked" + (err?.type ? ` (${err.type})` : ""))),
      });
      tc.requestAccessToken();
    });
  }

  function disconnectGmail() {
    gmailToken = null;
    sessionStorage.removeItem(GMAIL_TOKEN_KEY);
  }

  const b64utf8 = str => btoa(unescape(encodeURIComponent(str)));

  function invoiceEmailHtml(inv) {
    const s = state.settings;
    const c = clientById(inv.clientId);
    const rowStyle = 'padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;';
    let rows = "";
    if (isUploaded(inv)) {
      rows += `<tr><td colspan="3" style="${rowStyle}">📎 Invoice attached as a PDF</td><td style="${rowStyle}text-align:right;">${money(invTotal(inv))}</td></tr>`;
    }
    (inv.groups || []).forEach(g => {
      rows += `<tr><td colspan="3" style="${rowStyle}font-weight:bold;color:#e85d26;border-bottom:2px solid #3b7dd8;">${escapeHtml(g.name || "Services")}</td><td style="${rowStyle}text-align:right;font-weight:bold;color:#e85d26;border-bottom:2px solid #3b7dd8;">${g.items.some(it => !it.comp) ? money(groupSum(g)) : "COMP"}</td></tr>`;
      g.items.forEach(it => {
        if (!it.name) return;
        rows += `<tr><td style="${rowStyle}padding-left:24px;color:#3b7dd8;">${escapeHtml(it.name)}</td><td style="${rowStyle}text-align:right;">${it.qty || 1}</td><td style="${rowStyle}text-align:right;">${it.comp ? "COMP" : money(it.price)}</td><td style="${rowStyle}text-align:right;">${it.comp ? "COMP" : money(itemAmount(it))}</td></tr>`;
        (it.details || []).forEach(dt => {
          if (!dt.name) return;
          rows += `<tr><td style="${rowStyle}padding-left:44px;color:#666;font-size:13px;">${escapeHtml(dt.name)}</td><td style="${rowStyle}text-align:right;color:#666;font-size:13px;">${dt.qty || 1}</td><td style="${rowStyle}"></td><td style="${rowStyle}"></td></tr>`;
        });
      });
    });
    (inv.discounts || []).forEach(d => {
      rows += `<tr><td colspan="3" style="${rowStyle}color:#c0392b;">Discount — ${escapeHtml(d.name)}</td><td style="${rowStyle}text-align:right;color:#c0392b;">−${money(d.amount)}</td></tr>`;
    });
    if (Number(inv.taxRate) > 0) {
      rows += `<tr><td colspan="3" style="${rowStyle}">Tax (${inv.taxRate}%)</td><td style="${rowStyle}text-align:right;">${money(invTax(inv))}</td></tr>`;
    }
    (inv.payments || []).forEach(p => {
      const label = [p.note || "Payment", "received " + fmtDate(p.date), p.method].filter(Boolean).join(" · ");
      rows += `<tr><td colspan="3" style="${rowStyle}color:#27ae60;">${escapeHtml(label)}</td><td style="${rowStyle}text-align:right;color:#27ae60;">−${money(Number(p.amount) || 0)}</td></tr>`;
    });

    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
      <div style="max-width:640px;margin:0 auto;background:#fff;">
        <div style="background:#111;color:#fff;padding:28px 32px;">
          <div style="font-size:12px;color:#ccc;letter-spacing:1px;">${escapeHtml(s.businessName)}</div>
          <div style="font-size:30px;font-weight:300;">Invoice ${escapeHtml(inv.number)}</div>
        </div>
        <div style="padding:16px 32px;border-bottom:2px solid #ddd;font-size:13px;color:#555;">
          Issued: ${fmtDate(inv.issueDate)} &nbsp;·&nbsp; Due: <strong style="color:#222;">${fmtDate(inv.dueDate)}</strong>
        </div>
        <div style="padding:18px 32px 6px;font-size:14px;">Hi ${escapeHtml(c ? c.name.split(" ")[0] : "there")},<br><br>Here is your invoice from ${escapeHtml(s.businessName)}:</div>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <thead><tr style="background:#111;color:#fff;">
            <th style="padding:9px 12px;text-align:left;font-size:12px;">Description</th>
            <th style="padding:9px 12px;text-align:right;font-size:12px;">Qty</th>
            <th style="padding:9px 12px;text-align:right;font-size:12px;">Price</th>
            <th style="padding:9px 12px;text-align:right;font-size:12px;">Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="background:#111;color:#fff;padding:14px 32px;text-align:right;font-size:16px;">
          ${invPaid(inv) > 0 ? `<div style="font-size:12px;color:#aaa;margin-bottom:4px;">Invoice total ${money(invTotal(inv))} &nbsp;·&nbsp; Received ${money(invPaid(inv))}</div>` : ""}
          ${isFullyPaid(inv) && invPaid(inv) > 0
            ? `<span style="color:#27ae60;">Paid in Full:</span> <strong style="font-size:20px;color:#27ae60;">${money(invTotal(inv))}</strong>`
            : `${invPaid(inv) > 0 ? "Balance Due" : "Amount Due"}: <strong style="font-size:20px;">${money(invBalance(inv))}</strong>`}
        </div>
        ${inv.hotelEnabled && inv.hotelText ? `<div style="padding:16px 32px 0;font-size:12px;color:#666;line-height:1.6;"><strong style="color:#e85d26;">Hotel &amp; Parking Accommodations:</strong><br>${escapeHtml(inv.hotelText)}</div>` : ""}
        ${inv.notes ? `<div style="padding:16px 32px 0;font-size:13px;color:#555;line-height:1.6;">${escapeHtml(inv.notes).replace(/\n/g, "<br>")}</div>` : ""}
        <div style="padding:22px 32px 28px;font-size:13px;color:#555;line-height:1.7;">
          Thank you!<br><strong>${escapeHtml(s.ownerName || s.businessName)}</strong><br>
          ${escapeHtml(s.phone || "")}<br>${escapeHtml(s.email || "")}
        </div>
      </div>
    </body></html>`;
  }

  async function gmailSend(to, subject, html, attachment = null) {
    const headers = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64utf8(subject)}?=`,
      "MIME-Version: 1.0",
    ];
    let mime;

    if (attachment) {
      const boundary = "djcf_" + uid();
      mime = [
        ...headers,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64utf8(html),
        "",
        `--${boundary}`,
        `Content-Type: ${attachment.type || "application/pdf"}; name="${attachment.name}"`,
        `Content-Disposition: attachment; filename="${attachment.name}"`,
        "Content-Transfer-Encoding: base64",
        "",
        // Gmail wants base64 wrapped at 76 characters per line.
        attachment.data.replace(/(.{76})/g, "$1\r\n"),
        "",
        `--${boundary}--`,
      ].join("\r\n");
    } else {
      mime = [
        ...headers,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64utf8(html),
      ].join("\r\n");
    }

    // Raw MIME is already ASCII here, so btoa is safe without re-encoding.
    const raw = btoa(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${gmailToken.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw await googleApiError(res, "Gmail");
  }

  // Turns a Google API failure into something actionable. Only a 401 is
  // worth re-authenticating for; a 403 means the project or the consent
  // is wrong, and popping the sign-in window again just loops.
  async function googleApiError(res, api) {
    let payload = {};
    try { payload = await res.json(); } catch { /* no body */ }
    const gerr = payload.error || {};
    const detail = gerr.message || "";
    const reason = (gerr.errors?.[0]?.reason || gerr.status || "").toLowerCase();

    if (res.status === 401) {
      disconnectGmail();
      const err = new Error("Google sign-in expired — reconnecting…");
      err.expired = true;          // caller renews the token and retries once
      return err;
    }

    if (res.status === 403) {
      if (/has not been used in project|is disabled|accessnotconfigured/i.test(detail + reason)) {
        const err = new Error(`The ${api} API isn't enabled on your Google Cloud project yet. ${detail}`);
        err.setupNeeded = true;
        return err;
      }
      if (/insufficient|scope|permission/i.test(detail + reason)) {
        disconnectGmail();       // the grant is genuinely missing, so start over
        const err = new Error(`Google didn't grant permission to use ${api}. Reconnect and make sure the permission checkbox stays ticked.`);
        err.needsConsent = true;
        return err;
      }
      return new Error(detail || `${api} refused the request (403).`);
    }

    return new Error(detail || `${api} error (${res.status}).`);
  }

  async function sendInvoiceViaGmail(inv, id) {
    const c = clientById(inv.clientId);
    if (!c?.email) { toast("This client has no email address on file"); return; }
    try {
      if (!hasGoogleScope(GMAIL_SCOPE)) {
        toast("Connecting to Gmail…");
        await ensureGoogleScope(GMAIL_SCOPE);
      }
      // An uploaded invoice goes out as the client's own PDF attachment.
      let attachment = null;
      if (isUploaded(inv) && inv.file) {
        const rec = await loadAttachment(inv.file.id);
        if (!rec) { toast("That invoice file isn't available on this device"); return; }
        attachment = rec;
      }
      toast(attachment ? "Sending with PDF…" : "Sending…");
      try {
        await gmailSend(c.email, invoiceEmailSubject(inv), invoiceEmailHtml(inv), attachment);
      } catch (err) {
        // Tokens last an hour; renew and retry once so an expiry is
        // invisible rather than a failed send the user has to repeat.
        if (!err?.expired) throw err;
        await ensureGoogleScope(GMAIL_SCOPE);
        await gmailSend(c.email, invoiceEmailSubject(inv), invoiceEmailHtml(inv), attachment);
      }
      if (inv.status !== "paid") inv.status = "sent";
      save(); render();
      toast(`Invoice ${inv.number} emailed to ${c.email} 🎉`);
      openInvoiceDetail(id);
    } catch (err) {
      console.warn(err);
      if (err?.setupNeeded || err?.needsConsent) showGoogleProblem(err, "Gmail");
      else toast(err.message || "Could not send via Gmail");
    }
  }

  /* ================= CALENDAR ================= */

  function renderCalendar(root) {
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    const monthLabel = calCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = todayISO();

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(y, m, i - firstDow + 1);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      cells.push({ iso, day: dt.getDate(), other: dt.getMonth() !== m });
    }

    // Multi-day gigs occupy every day they run, flagged so the later
    // days read as a continuation rather than a second booking.
    const eventsByDate = {};
    state.events.forEach(e => {
      eventDays(e).forEach((iso, i) => {
        (eventsByDate[iso] = eventsByDate[iso] || []).push({ ev: e, continues: i > 0 });
      });
    });

    // Booked calls come from Google Calendar, which is where Calendly
    // puts them once a client picks a time.
    const showGoogle = googleCalendarOn();
    const monthKey = `${y}-${m}`;
    if (showGoogle && gcal.monthKey !== monthKey && !gcal.loading) {
      loadGoogleMonth(y, m, () => { if (currentView === "calendar") renderCalendar(root); });
    }
    const googleByDate = {};
    if (showGoogle && gcal.monthKey === monthKey) {
      gcal.events.forEach(e => { (googleByDate[e.date] = googleByDate[e.date] || []).push(e); });
    }

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
              ${(eventsByDate[cell.iso] || []).map(({ ev: e, continues }) => `
                <div class="cal-event status-${e.status}${isCall(e) ? " type-call" : ""}${continues ? " continues" : ""}" data-open-event="${e.id}"
                     title="${escapeHtml(e.title)} — ${escapeHtml(clientName(e.clientId))}${isMultiDay(e) ? ` (${fmtDateRange(e.date, eventEnd(e))})` : ""}">
                  ${continues ? "↳ " : e.startTime ? fmtTime(e.startTime).replace(" ", "") + " " : ""}${escapeHtml(e.title)}
                </div>`).join("")}
              ${(googleByDate[cell.iso] || []).map((e, i) => `
                <div class="cal-event gcal-event${e.fromCalendly ? " is-call" : ""}" data-gcal="${cell.iso}|${i}" title="${escapeHtml(e.title)}${e.startTime ? " · " + fmtTime(e.startTime) : ""}">
                  ${e.startTime ? fmtTime(e.startTime).replace(" ", "") + " " : ""}${escapeHtml(e.title)}
                </div>`).join("")}
            </div>`).join("")}
        </div>
        <div class="cal-legend">
          <span><span class="legend-dot" style="background:var(--accent)"></span>Booked</span>
          <span><span class="legend-dot" style="background:var(--amber)"></span>Inquiry</span>
          <span><span class="legend-dot" style="background:var(--green)"></span>Completed</span>
          <span><span class="legend-dot" style="background:var(--teal)"></span>Client call</span>
          <span><span class="legend-dot" style="background:var(--muted)"></span>Cancelled</span>
          ${showGoogle ? `<span><span class="legend-dot" style="background:#2f6fd0"></span>From Google Calendar${gcal.loading ? " (loading…)" : ""}</span>` : ""}
        </div>
        ${showGoogle && gcal.error ? `<div class="cal-error">⚠️ ${escapeHtml(gcal.error)}</div>` : ""}
        ${!showGoogle && calendlyLink() ? `<div class="cal-hint">
          Want calls your clients book to appear here automatically?
          <button class="linkish" id="calEnableGoogle">Turn on Google Calendar in Settings →</button>
        </div>` : ""}
      </div>`;

    $("#calPrev", root).addEventListener("click", () => { calCursor = new Date(y, m - 1, 1); renderCalendar(root); });
    $("#calNext", root).addEventListener("click", () => { calCursor = new Date(y, m + 1, 1); renderCalendar(root); });
    $("#calToday", root).addEventListener("click", () => { calCursor = new Date(); renderCalendar(root); });
    $("#calAddEvent", root).addEventListener("click", () => openEventForm());
    $("#calEnableGoogle", root)?.addEventListener("click", () => go("settings"));
    $$("[data-gcal]", root).forEach(el => el.addEventListener("click", () => {
      const [iso, idx] = el.dataset.gcal.split("|");
      openGoogleEventDetail(googleByDate[iso]?.[Number(idx)]);
    }));
    bindRowOpeners(root);
  }

  // Read-only view of something on the DJ's Google Calendar, with a way
  // to pull it into ClientFlow as a proper gig if it matters.
  function openGoogleEventDetail(e) {
    if (!e) return;
    const guessedClient = state.clients.find(c =>
      c.email && e.attendees.some(a => a.toLowerCase() === c.email.toLowerCase()));

    openModal(modalShell(e.title, `
      <div style="margin-bottom:12px"><span class="badge badge-sent">From Google Calendar</span>
        ${e.fromCalendly ? `<span class="badge badge-booked" style="margin-left:6px">Calendly booking</span>` : ""}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="lbl">Date${isMultiDay(e) ? "s" : ""}</div><div class="val">${isMultiDay(e) ? escapeHtml(fmtDateRange(e.date, eventEnd(e))) : fmtDateShort(e.date)}</div></div>
        <div class="detail-item"><div class="lbl">Time</div><div class="val">${e.allDay ? "All day" : fmtTime(e.startTime)}</div></div>
        ${e.location ? `<div class="detail-item"><div class="lbl">Where</div><div class="val">${escapeHtml(e.location)}</div></div>` : ""}
        ${guessedClient ? `<div class="detail-item"><div class="lbl">Client</div><div class="val">${escapeHtml(guessedClient.name)}</div></div>` : ""}
        ${e.attendees.length ? `<div class="detail-item"><div class="lbl">Guests</div><div class="val">${escapeHtml(e.attendees.join(", "))}</div></div>` : ""}
      </div>
      ${e.description ? `<div class="section-label">Details</div><div class="notes-box">${escapeHtml(e.description).slice(0, 1200)}</div>` : ""}
      <div class="modal-actions" style="flex-wrap:wrap">
        ${e.link ? `<a class="btn" href="${escapeHtml(e.link)}" target="_blank" rel="noopener">Open in Google Calendar</a>` : ""}
        ${state.clients.length ? `<button class="btn btn-primary" id="gcalToGig">Add to ClientFlow</button>` : ""}
      </div>`), true);

    $("#gcalToGig")?.addEventListener("click", () => openEventForm(null, guessedClient?.id, {
      title: e.title,
      type: "Client Call",
      status: "booked",
      date: e.date,
      startTime: e.startTime,
      notes: [e.location, e.description].filter(Boolean).join("\n").slice(0, 500),
    }));
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
            <div class="field"><label>Invoice logo text</label><input name="logoText" value="${escapeHtml(s.logoText)}" placeholder="RND"></div>
            <div class="field"><label>Invoice logo image</label>
              <input type="file" id="logoImgInput" accept="image/*">
              ${s.logoImg ? `<button type="button" class="btn btn-sm" id="clearLogoImg" style="margin-top:6px">✕ Remove image</button>` : ""}
            </div>
            <div class="field"><label>Invoice prefix</label><input name="invoicePrefix" value="${escapeHtml(s.invoicePrefix)}"></div>
            <div class="field"><label>Next invoice number</label><input name="nextInvoiceNumber" type="number" min="1" value="${escapeHtml(s.nextInvoiceNumber)}"></div>
            <div class="field"><label>Default tax rate (%)</label><input name="taxRate" type="number" min="0" step="0.01" value="${escapeHtml(s.taxRate)}"></div>
            <div class="field"><label>Default payment terms (days)</label><input name="defaultDueDays" type="number" min="0" value="${escapeHtml(s.defaultDueDays)}"></div>
            <div class="field full"><label>Default invoice notes / payment instructions</label>
              <textarea name="paymentInstructions">${escapeHtml(s.paymentInstructions)}</textarea>
            </div>
            <div class="field full"><label>Default hotel &amp; parking clause</label>
              <textarea name="hotelText" rows="4">${escapeHtml(s.hotelText)}</textarea>
            </div>
          </div>
          <div class="modal-actions" style="justify-content:flex-start;align-items:center;gap:12px">
            <button type="submit" class="btn btn-primary">Save settings</button>
            <span class="saved-note" id="settingsSaved"></span>
          </div>
        </form>
      </div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px" id="updatesCard"></div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px" id="cloudCard"></div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px">
        <div class="card-title">📅 Calendly — let clients book calls with you</div>
        <p class="settings-note">
          Paste your Calendly scheduling link and a <strong>Schedule a call</strong> button appears on every
          client and gig. It opens your booking page with their name and email already filled in — and when
          they pick a time, you can drop the call straight onto your ClientFlow calendar.
          Your link looks like <code>https://calendly.com/your-name/30min</code>
          (grab it from Calendly → Event Types → Copy link).
        </p>
        <div class="form-grid">
          <div class="field full"><label>Your Calendly link</label>
            <input id="calendlyUrl" value="${escapeHtml(s.calendlyUrl)}" placeholder="https://calendly.com/your-name/consultation">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">
          <button class="btn" id="saveCalendly">Save link</button>
          ${s.calendlyUrl ? `<button class="btn" id="testCalendly">Preview booking page</button>` : ""}
          <span class="settings-note" style="margin:0">${s.calendlyUrl ? "✅ Ready to send" : "Not set up"}</span>
        </div>

        <div class="sub-setting">
          <div class="card-title" style="margin-bottom:8px">Show booked calls on your calendar</div>
          <p class="settings-note">
            When a client books, Calendly puts the call in the Google Calendar it's connected to.
            Turn this on and the Calendar page reads those bookings back, so the time
            <em>they</em> chose shows up here — no need to copy it over by hand.
            ${canUseAccountForGmail()
              ? `Uses the Google account you're signed in with (${escapeHtml(cloud.user.email || "")}), read-only.`
              : `<strong>Sign in with your Google account first</strong> — this reads your calendar through that account.`}
          </p>
          <label class="comp-toggle" style="font-size:13.5px">
            <input type="checkbox" id="showGcal" ${s.showGoogleCalendar ? "checked" : ""} ${canUseAccountForGmail() ? "" : "disabled"}>
            Show my Google Calendar events on the Calendar page
          </label>
          <div class="settings-note" id="gcalStatus" style="margin:10px 0 0"></div>
        </div>
      </div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px">
        <div class="card-title">📨 Gmail — send invoices from the site</div>
        ${canUseAccountForGmail() ? `
          <p class="settings-note">
            Email invoices to clients straight from here, sent from
            <strong>${escapeHtml(cloud.user.email || "your Google account")}</strong> — the account you're already
            signed in with. The first time you send, Google asks once for permission to send mail on your behalf;
            after that it's automatic. ClientFlow only ever gets permission to <em>send</em> — never to read your inbox.
          </p>
          <div style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap">
            <button class="btn btn-primary" id="gmailConnect">${gmailReady() ? "Reconnect" : "Enable Gmail sending"}</button>
            ${gmailReady() ? `<button class="btn" id="gmailDisconnect">Turn off</button>` : ""}
            <span class="settings-note" id="gmailStatus" style="margin:0">
              ${gmailReady()
                ? `✅ Ready${gmailToken?.email ? " — sending as " + escapeHtml(gmailToken.email) : ""}`
                : "Not enabled yet — you can also just hit Send on an invoice"}
            </span>
          </div>`
        : `
          <p class="settings-note">
            Connect your Google account to email invoices to clients directly from this site (no mail app needed).
            One-time setup: create a free OAuth Client ID in
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>
            (see the README for a 5-minute walkthrough), paste it below, then hit Connect.
            ${accountsMode() ? `<br><strong>Tip:</strong> sign in to your ClientFlow account and this step disappears — Gmail then uses that account.` : ""}
          </p>
          <div class="form-grid">
            <div class="field full"><label>Google OAuth Client ID</label>
              <input id="googleClientId" value="${escapeHtml(s.googleClientId)}" placeholder="1234567890-abc123.apps.googleusercontent.com">
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-primary" id="gmailConnect">${gmailReady() ? "Reconnect Gmail" : "Connect Gmail"}</button>
            ${gmailReady() ? `<button class="btn" id="gmailDisconnect">Disconnect</button>` : ""}
            <span class="settings-note" id="gmailStatus" style="margin:0">
              ${gmailReady() ? "✅ Connected — you can send invoices via Gmail" : "Not connected"}
            </span>
          </div>`}
      </div>

      <div class="card card-pad" style="max-width:720px;margin-top:20px">
        <div class="card-title">Data backup</div>
        <p class="settings-note" id="backupNote">
          Export a backup file any time — handy before big changes, or to move data between accounts.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="exportData">⬇ Export backup (JSON)</button>
          <button class="btn" id="importData">⬆ Import backup</button>
          <input type="file" id="importFile" accept="application/json" class="hidden">
          <button class="btn btn-danger" id="clearData">Erase all data</button>
        </div>
      </div>`;

    renderCloudCard();
    renderUpdatesCard();

    const settingsForm = $("#settingsForm", root);

    // Everything else in the app saves the moment you act, so these
    // fields do too — typing your business name and then clicking away
    // (or using a button in another card, which re-renders this one)
    // used to lose it silently.
    function commitSettings() {
      const data = Object.fromEntries(new FormData(settingsForm).entries());
      data.taxRate = Number(data.taxRate) || 0;
      data.nextInvoiceNumber = Number(data.nextInvoiceNumber) || 1;
      data.defaultDueDays = Number(data.defaultDueDays) || 14;
      Object.assign(state.settings, data);
      // These live in their own cards but are saved together.
      const cidEl = $("#googleClientId", root);   // absent when Gmail rides on the signed-in account
      if (cidEl) state.settings.googleClientId = cidEl.value.trim();
      const calEl = $("#calendlyUrl", root);
      if (calEl) state.settings.calendlyUrl = calEl.value.trim();
      save();
    }
    commitSettingsRef = commitSettings;   // so other cards can flush first

    let settingsSaveTimer;
    const savedNote = $("#settingsSaved", root);
    settingsForm.addEventListener("input", () => {
      clearTimeout(settingsSaveTimer);
      settingsSaveTimer = setTimeout(() => {
        commitSettings();
        if (savedNote) {
          savedNote.textContent = "Saved ✓";
          savedNote.classList.add("show");
          setTimeout(() => savedNote.classList.remove("show"), 1800);
        }
      }, 600);
    });

    settingsForm.addEventListener("submit", e => {
      e.preventDefault();
      clearTimeout(settingsSaveTimer);
      commitSettings();
      toast("Settings saved");
    });

    $("#saveCalendly", root).addEventListener("click", () => {
      commitSettingsRef?.();       // keep anything typed in the main form
      const raw = $("#calendlyUrl", root).value.trim();
      if (raw && !/^https:\/\/\S+\.\S+/.test(raw)) {
        toast("That doesn't look like a link — paste the full https:// address");
        return;
      }
      state.settings.calendlyUrl = raw;
      save();
      renderSettings(root);
      toast(raw ? "Calendly link saved 📅" : "Calendly link cleared");
    });
    $("#testCalendly", root)?.addEventListener("click", () => window.open(calendlyLink(), "_blank", "noopener"));

    $("#showGcal", root)?.addEventListener("change", async e => {
      const on = e.target.checked;
      const status = $("#gcalStatus", root);
      if (!on) {
        state.settings.showGoogleCalendar = false;
        gcal = { monthKey: null, events: [], loading: false, error: "" };
        save();
        status.textContent = "";
        toast("Google Calendar hidden");
        return;
      }
      try {
        status.textContent = "Asking Google for read access…";
        await ensureGoogleScope(CALENDAR_SCOPE);
        state.settings.showGoogleCalendar = true;
        gcal = { monthKey: null, events: [], loading: false, error: "" };
        save();
        status.textContent = "✅ Connected — booked calls now show on your Calendar page";
        toast("Google Calendar connected 🗓");
      } catch (err) {
        console.warn(err);
        e.target.checked = false;
        state.settings.showGoogleCalendar = false;
        save();
        status.textContent = "⚠️ " + (err.message || "Could not connect");
      }
    });

    $("#logoImgInput", root).addEventListener("change", e => {
      commitSettingsRef?.();
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 400 * 1024) { toast("Logo image too large — keep it under 400 KB"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        state.settings.logoImg = reader.result;
        save(); renderSettings(root); toast("Logo image saved");
      };
      reader.readAsDataURL(file);
    });
    $("#clearLogoImg", root)?.addEventListener("click", () => {
      state.settings.logoImg = "";
      save(); renderSettings(root); toast("Logo image removed");
    });

    $("#gmailConnect", root).addEventListener("click", async () => {
      commitSettingsRef?.();
      const cidEl = $("#googleClientId", root);   // absent when Gmail rides on the signed-in account
      if (cidEl) state.settings.googleClientId = cidEl.value.trim();
      save();
      const status = $("#gmailStatus", root);
      try {
        status.textContent = canUseAccountForGmail()
          ? "Asking Google for sending permission…"
          : "Opening Google sign-in…";
        await connectGmail();
        status.textContent = "✅ Connected — you can send invoices via Gmail";
        toast("Gmail ready 🎉");
        renderSettings(root);
      } catch (err) {
        status.textContent = "⚠️ " + err.message;
      }
    });
    $("#gmailDisconnect", root)?.addEventListener("click", () => {
      disconnectGmail();
      renderSettings(root);
      toast("Gmail disconnected");
    });

    $("#exportData", root).addEventListener("click", async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        // Uploaded PDFs live outside `state`, so pull them in or the
        // backup would quietly lose them.
        const attachments = {};
        for (const inv of state.invoices) {
          if (!isUploaded(inv) || !inv.file?.id) continue;
          const rec = await loadAttachment(inv.file.id);
          if (rec) attachments[inv.file.id] = rec;
        }
        const payload = { ...state, attachments };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `djclientflow-backup-${todayISO()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        const n = Object.keys(attachments).length;
        toast(n ? `Backup downloaded (with ${n} uploaded file${n === 1 ? "" : "s"})` : "Backup downloaded");
      } catch (err) {
        console.error(err);
        toast("Export failed");
      } finally {
        btn.disabled = false;
      }
    });

    $("#importData", root).addEventListener("click", () => $("#importFile", root).click());
    $("#importFile", root).addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.settings || !Array.isArray(data.clients)) throw new Error("Not a valid backup");
          if (!confirm("Importing will replace ALL current data. Continue?")) return;
          const keptLocal = {};
          LOCAL_ONLY_SETTINGS.forEach(k => { keptLocal[k] = state.settings[k]; });
          state = {
            settings: { ...defaultSettings(), ...data.settings, ...keptLocal },
            clients: data.clients || [],
            events: data.events || [],
            invoices: (data.invoices || []).map(migrateInvoice),
          };
          save(); render(); toast("Backup imported");

          // Put any uploaded files back where the app looks for them.
          const attachments = data.attachments || {};
          const ids = Object.keys(attachments);
          for (const fileId of ids) {
            await saveAttachment(fileId, attachments[fileId]);
          }
          if (ids.length) toast(`Restored ${ids.length} uploaded file${ids.length === 1 ? "" : "s"}`);
        } catch (err) {
          console.warn(err);
          toast("Import failed — that file isn't a valid backup");
        }
      };
      reader.readAsText(file);
    });

    $("#clearData", root).addEventListener("click", () => {
      const scope = cloud.user
        ? "This permanently erases ALL clients, gigs and invoices in your account, on every device."
        : "This permanently erases ALL clients, gigs and invoices in this browser.";
      if (!confirm(scope + " Are you sure?")) return;
      if (!confirm("Last chance — really erase everything?")) return;
      state = emptyState();
      save(); render(); toast("All data erased");
    });
  }

  function renderCloudCard() {
    const card = document.getElementById("cloudCard");
    if (!card) return;
    const cfg = state.settings.firebaseConfig;
    const configured = firebaseConfigured();
    const signedIn = !!cloud.user;
    const hosted = accountsMode();
    const lastSync = cloud.lastSyncedAt
      ? new Date(cloud.lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;

    const statusLine = !configured
      ? `<span class="cloud-dot off"></span> Not set up — your data lives only in this browser`
      : signedIn
        ? `<span class="cloud-dot ${cloud.status === "live" ? "on" : "warn"}"></span> Signed in as <strong>${escapeHtml(cloud.user.email || "your account")}</strong>${lastSync ? ` · last synced ${lastSync}` : ""}`
        : cloud.status === "connecting"
          ? `<span class="cloud-dot warn"></span> Connecting…`
          : `<span class="cloud-dot warn"></span> Signed out — sign in to sync this device`;

    // In hosted mode the keys belong to the site owner, so end users
    // only ever see their account status.
    card.innerHTML = `
      <div class="card-title">☁️ Your account &amp; sync</div>
      <p class="settings-note">
        ${hosted
          ? `Your clients, gigs and invoices are stored in your own private account. Sign in on any laptop or phone and everything is there — changes sync between devices automatically, and the app keeps working offline.`
          : `Sign in with Google to store your data in your own Firebase project and reach it from any device. Setup takes about 15 minutes; the <a href="https://github.com/vermelR/Clientflow-Management-Program#cloud-sync-and-multi-user-setup" target="_blank" rel="noopener">README walks you through it</a>.`}
      </p>

      <div class="cloud-status-line">${statusLine}</div>
      ${cloud.error ? `<div class="cloud-error">⚠️ ${escapeHtml(cloud.error)}</div>` : ""}

      ${hosted ? "" : `
        <div class="field full" style="margin-top:14px">
          <label>Firebase config ${configured ? `<span class="ok-chip">✓ saved</span>` : ""}</label>
          <textarea id="firebaseCfg" rows="6" class="field-textarea" placeholder='Paste the whole block from the Firebase console, e.g.

const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "my-dj-app.firebaseapp.com",
  projectId: "my-dj-app",
  appId: "1:123…:web:abc…"
};'>${cfg ? escapeHtml(JSON.stringify(cfg, null, 2)) : ""}</textarea>
        </div>`}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        ${hosted ? "" : `<button class="btn" id="saveFirebaseCfg">Save config</button>`}
        ${configured && !signedIn ? `<button class="btn btn-primary" id="cloudSignIn">Sign in${hosted ? "" : " with Google"}</button>` : ""}
        ${signedIn ? `<button class="btn" id="cloudSyncNow">Sync now</button>` : ""}
        ${signedIn ? `<button class="btn" id="cloudSignOut">Sign out</button>` : ""}
      </div>`;

    if (hosted && configured && !signedIn) {
      $("#cloudSignIn", card)?.addEventListener("click", () => {
        localStorage.removeItem(GUEST_KEY);
        authMode = "signin";
        showAuthScreen();
      });
    }

    $("#saveFirebaseCfg", card)?.addEventListener("click", () => {
      const text = $("#firebaseCfg", card).value.trim();
      if (!text) {
        state.settings.firebaseConfig = null;
        save(); setCloudStatus("off"); toast("Cloud config cleared");
        return;
      }
      const parsed = parseFirebaseConfig(text);
      if (!parsed) {
        toast("Couldn't read that — paste the whole firebaseConfig block");
        return;
      }
      state.settings.firebaseConfig = parsed;
      save();
      toast("Config saved — now sign in with Google");
      initCloud();
    });
    $("#cloudSignIn", card)?.addEventListener("click", cloudSignIn);
    $("#cloudSignOut", card)?.addEventListener("click", cloudSignOut);
    $("#cloudSyncNow", card)?.addEventListener("click", async () => {
      await pushCloud();
      toast("Synced ☁️");
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
    const c3 = { id: uid(), name: "Priya Singh", email: "priya.s@example.com", phone: "(555) 917-6642", company: "", source: "Google search", notes: "Multi-day wedding: Mehndi, Sangeet, Baraat, Ceremony, Reception. Big production!", createdAt: iso(-15) };
    state.clients.push(c1, c2, c3);

    const e1 = { id: uid(), clientId: c1.id, title: "Johnson Wedding Reception", type: "Wedding", date: iso(18), startTime: "17:00", endTime: "23:00", venue: "The Grand Ballroom", address: "220 Harbor View Dr", guestCount: "140", fee: 1800, status: "booked", needs: "Ceremony audio + reception. Uplighting (blush). First dance: 'At Last'. MC for toasts and cake cutting.", notes: "Load in 3pm via service elevator. Coordinator: Dana (555) 300-1123." };
    const e2 = { id: uid(), clientId: c2.id, title: "BrightPath Summer Party", type: "Corporate", date: iso(32), startTime: "18:30", endTime: "22:30", venue: "Rooftop at The Meridian", address: "88 5th Ave", guestCount: "75", fee: 1200, status: "booked", needs: "Open-format set, clean edits only. Wireless mic for CEO welcome speech.", notes: "" };
    const e3 = { id: uid(), clientId: c3.id, title: "Singh Wedding — Sangeet", type: "Sangeet", date: iso(9), startTime: "16:00", endTime: "23:00", venue: "Casa Bella Events", address: "412 Sunset Blvd", guestCount: "350", fee: 1600, status: "inquiry", needs: "Full sound package, LED dandiya sticks, bilingual MC.", notes: "Waiting on signed contract & deposit. Part of multi-day booking." };
    const e4 = { id: uid(), clientId: c1.id, title: "Johnson Engagement Party", type: "Private Party", date: iso(-45), startTime: "19:00", endTime: "23:00", venue: "Private residence", address: "", guestCount: "50", fee: 600, status: "completed", needs: "", notes: "Went great — led to wedding booking." };
    state.events.push(e1, e2, e3, e4);

    const p = state.settings.invoicePrefix;
    let n = state.settings.nextInvoiceNumber;
    const num = () => p + String(n++).padStart(3, "0");

    state.invoices.push(
      {
        id: uid(), number: num(), clientId: c1.id, eventId: e4.id, status: "paid",
        issueDate: iso(-44), dueDate: iso(-30), paidDate: iso(-38),
        groups: [{ name: "Engagement Party", items: [{ name: "DJ services — 4 hours", qty: 1, price: 600, comp: false, details: [] }] }],
        discounts: [], hotelEnabled: false, hotelText: "",
        taxRate: 0, notes: "Thank you!",
        payments: [
          { id: uid(), date: iso(-52), amount: 200, method: "Venmo", note: "Deposit" },
          { id: uid(), date: iso(-38), amount: 400, method: "Zelle", note: "Final balance" },
        ],
      },
      {
        id: uid(), number: num(), clientId: c1.id, eventId: e1.id, status: "sent",
        issueDate: iso(-10), dueDate: iso(4),
        groups: [{
          name: "Wedding Reception",
          items: [
            { name: "Wedding DJ package — ceremony + reception (6 hours)", qty: 1, price: 1500, comp: false, details: [
              { name: "RCF 945", qty: 2 }, { name: "Wireless Microphone", qty: 2 }, { name: "Facade", qty: 1 },
            ] },
            { name: "Uplighting package (8 fixtures)", qty: 1, price: 300, comp: false, details: [] },
            { name: "Cocktail hour speaker", qty: 1, price: 0, comp: true, details: [] },
          ],
        }],
        discounts: [], hotelEnabled: false, hotelText: "",
        taxRate: 0, notes: "50% deposit received. Balance due before event date.",
        payments: [{ id: uid(), date: iso(-9), amount: 900, method: "Zelle", note: "50% deposit" }],
      },
      {
        id: uid(), number: num(), clientId: c3.id, eventId: e3.id, status: "draft",
        issueDate: iso(0), dueDate: iso(14),
        groups: [
          {
            name: "Sangeet (350 People)",
            items: [{ name: "Sound Package", qty: 1, price: 1600, comp: false, details: [
              { name: "RCF 945", qty: 2 }, { name: "RCF SUB 708", qty: 2 },
              { name: "Wireless Microphone", qty: 2 }, { name: "Facade", qty: 1 },
            ] }, { name: "LED Dandiya Sticks", qty: 1, price: 0, comp: true, details: [] }],
          },
          {
            name: "Travel + Labor",
            items: [{ name: "Travel + Labor", qty: 1, price: 500, comp: false, details: [] }],
          },
        ],
        discounts: [{ name: "Multiple Day", amount: 350 }],
        hotelEnabled: true, hotelText: state.settings.hotelText,
        taxRate: 0, notes: state.settings.paymentInstructions, payments: [],
      },
    );
    state.settings.nextInvoiceNumber = n;

    save(); render();
    toast("Sample data loaded — explore away! 🎉");
  }

  /* ================= REMINDERS =================
     A discreet panel: what's coming up soon, closest first, and where
     the money stands on each one. */

  const REMINDER_WINDOW_DAYS = 30;

  // Money owed across every invoice attached to a gig.
  function gigPaymentSummary(ev) {
    const invs = state.invoices.filter(i => i.eventId === ev.id);
    if (!invs.length) return { kind: "none", label: "Not invoiced" };

    const total = invs.reduce((s, i) => s + invTotal(i), 0);
    const paid = invs.reduce((s, i) => s + invPaid(i), 0);
    const balance = Math.round((total - paid) * 100) / 100;
    const overdue = invs.some(i => invStatus(i) === "overdue");

    if (balance <= 0 && paid > 0) return { kind: "paid", label: "Paid" };
    if (paid > 0) return { kind: overdue ? "overdue" : "partial", label: `${money(balance)} left`, balance };
    return { kind: overdue ? "overdue" : "unpaid", label: `${money(balance)} due`, balance };
  }

  function relativeDay(iso) {
    const days = Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days < 7) return `In ${days} days`;
    if (days < 14) return "Next week";
    return `In ${Math.round(days / 7)} weeks`;
  }

  function upcomingReminders() {
    const today = todayISO();
    const end = addDaysISO(today, REMINDER_WINDOW_DAYS);
    return state.events
      .filter(e => eventEnd(e) >= today && e.date <= end && e.status !== "cancelled")
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""))
      .map(e => ({ ev: e, pay: gigPaymentSummary(e) }));
  }

  function overdueReminders() {
    return state.invoices
      .filter(i => invStatus(i) === "overdue")
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  }

  function remindersNeedingAction() {
    return upcomingReminders().filter(r => r.pay.kind !== "paid").length + overdueReminders().length;
  }

  function refreshRemindersBadge() {
    const badge = document.getElementById("remindersCount");
    if (!badge) return;
    const n = remindersNeedingAction();
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  }

  function renderReminders() {
    const panel = document.getElementById("remindersPanel");
    if (!panel) return;
    const list = upcomingReminders();
    const overdue = overdueReminders();
    const owed = list.reduce((s, r) => s + (r.pay.balance || 0), 0);

    panel.innerHTML = `
      <div class="rem-head">
        <div>
          <div class="rem-title">Reminders</div>
          <div class="rem-sub">Next ${REMINDER_WINDOW_DAYS} days${owed > 0 ? ` · ${money(owed)} outstanding` : ""}</div>
        </div>
        <button class="rem-close" id="remClose" aria-label="Close">&times;</button>
      </div>

      ${overdue.length ? `
        <div class="rem-section">
          <div class="rem-section-title">⚠️ Overdue invoices</div>
          ${overdue.map(i => `
            <button class="rem-row overdue" data-rem-invoice="${i.id}">
              <div class="rem-row-main">
                <div class="rem-row-title">${escapeHtml(i.number)} · ${escapeHtml(clientName(i.clientId))}</div>
                <div class="rem-row-meta">Due ${fmtDate(i.dueDate)}</div>
              </div>
              <span class="rem-chip overdue">${money(invBalance(i))}</span>
            </button>`).join("")}
        </div>` : ""}

      <div class="rem-section">
        <div class="rem-section-title">Upcoming gigs</div>
        ${list.length ? list.map(({ ev, pay }) => `
          <button class="rem-row" data-rem-event="${ev.id}">
            <div class="rem-when">
              <div class="rem-when-day">${parseISO(ev.date).toLocaleDateString("en-US", { day: "numeric" })}</div>
              <div class="rem-when-mon">${parseISO(ev.date).toLocaleDateString("en-US", { month: "short" })}</div>
            </div>
            <div class="rem-row-main">
              <div class="rem-row-title">${escapeHtml(ev.title)}</div>
              <div class="rem-row-meta">${relativeDay(ev.date)}${ev.startTime ? " · " + fmtTime(ev.startTime) : ""} · ${escapeHtml(clientName(ev.clientId))}</div>
            </div>
            <span class="rem-chip ${pay.kind}">${pay.label}</span>
          </button>`).join("")
        : `<div class="rem-empty">Nothing booked in the next ${REMINDER_WINDOW_DAYS} days.</div>`}
      </div>`;

    $("#remClose", panel).addEventListener("click", closeReminders);
    $$("[data-rem-event]", panel).forEach(el => el.addEventListener("click", () => {
      closeReminders();
      openEventDetail(el.dataset.remEvent);
    }));
    $$("[data-rem-invoice]", panel).forEach(el => el.addEventListener("click", () => {
      closeReminders();
      openInvoiceDetail(el.dataset.remInvoice);
    }));
  }

  function openReminders() {
    renderReminders();
    $("#remindersPanel").classList.add("open");
    $("#remindersBackdrop").classList.add("show");
    $("#remindersBtn").setAttribute("aria-expanded", "true");
  }

  function closeReminders() {
    $("#remindersPanel").classList.remove("open");
    $("#remindersBackdrop").classList.remove("show");
    $("#remindersBtn").setAttribute("aria-expanded", "false");
  }

  function remindersOpen() {
    return $("#remindersPanel").classList.contains("open");
  }

  $("#remindersBtn").addEventListener("click", () => remindersOpen() ? closeReminders() : openReminders());
  $("#remindersBackdrop").addEventListener("click", closeReminders);

  /* ================= WHAT'S NEW (release notes) =================
     Entries live in updates.json next to the app, so publishing an
     update is a file edit and a deploy — every user then sees it. */

  const SEEN_UPDATE_KEY = "djclientflow.lastSeenUpdate";
  let updatesCache = null;   // null = not loaded yet, array once fetched

  async function fetchUpdates() {
    if (updatesCache) return updatesCache;
    // fetch() can't read file:// URLs, so don't try when the page was
    // opened straight from disk — there is nothing to publish locally.
    if (!location.protocol.startsWith("http")) {
      updatesCache = [];
      return updatesCache;
    }
    try {
      // The service worker is network-first, so this picks up a fresh
      // deploy immediately and falls back to the cached copy offline.
      const res = await fetch("updates.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`updates.json returned ${res.status}`);
      const data = await res.json();
      updatesCache = Array.isArray(data) ? data : (data.updates || []);
    } catch (e) {
      console.warn("Could not load updates.json", e);
      updatesCache = [];
    }
    return updatesCache;
  }

  const updateKey = u => String(u.version || u.date || u.title || "");

  async function refreshUpdatesBadge() {
    const list = await fetchUpdates();
    const dot = document.getElementById("updatesDot");
    if (!dot) return;
    const newest = list.length ? updateKey(list[0]) : "";
    const unseen = newest && localStorage.getItem(SEEN_UPDATE_KEY) !== newest;
    dot.classList.toggle("hidden", !unseen);
  }

  function markUpdatesSeen() {
    if (updatesCache?.length) {
      localStorage.setItem(SEEN_UPDATE_KEY, updateKey(updatesCache[0]));
    }
    document.getElementById("updatesDot")?.classList.add("hidden");
  }

  async function renderUpdatesCard() {
    const card = document.getElementById("updatesCard");
    if (!card) return;
    const list = await fetchUpdates();
    if (!document.getElementById("updatesCard")) return;   // navigated away

    card.innerHTML = `
      <div class="card-title">🆕 What's new</div>
      ${list.length ? `
        <p class="settings-note">Everything that's changed in ${escapeHtml(appInfo().productName)}, newest first.</p>
        <ol class="update-list">
          ${list.map(u => `
            <li class="update-entry">
              <div class="update-head">
                ${u.version ? `<span class="update-version">${escapeHtml(u.version)}</span>` : ""}
                ${u.title ? `<span class="update-title">${escapeHtml(u.title)}</span>` : ""}
                ${u.date ? `<span class="update-date">${escapeHtml(fmtDate(u.date) === "—" ? u.date : fmtDate(u.date))}</span>` : ""}
              </div>
              ${Array.isArray(u.notes) && u.notes.length
                ? `<ul class="update-notes">${u.notes.map(n => `<li>${escapeHtml(typeof n === "string" ? n : n.text || "")}</li>`).join("")}</ul>`
                : ""}
            </li>`).join("")}
        </ol>`
      : `<p class="settings-note" style="margin:0">
           No updates posted yet. New features and fixes will show up here.
         </p>`}`;

    markUpdatesSeen();
  }

  /* ================= CALENDLY (send the client a booking link) =========
     The client chooses their own time, so the app's job is to get a
     personalised link to them. Whatever they book lands in the DJ's
     Google Calendar (Calendly writes it there), which the Calendar
     page then reads back — see the Google Calendar section below. */

  function calendlyLink() { return (state.settings.calendlyUrl || "").trim(); }

  // Calendly reads these query params to prefill its booking form, so
  // the client doesn't retype details we already have.
  function calendlyPrefillUrl(base, { name, email, note } = {}) {
    let url;
    try { url = new URL(base); } catch { return base; }
    if (name) url.searchParams.set("name", name);
    if (email) url.searchParams.set("email", email);
    if (note) url.searchParams.set("a1", note);
    return url.toString();
  }

  function bookingContext({ clientId, eventId } = {}) {
    const c = clientById(clientId);
    const ev = eventId ? eventById(eventId) : null;
    const note = ev
      ? `${ev.title} — ${fmtDate(ev.date)}${ev.venue ? " @ " + ev.venue : ""}`
      : c ? `Client: ${c.name}` : "";
    return { c, ev, url: calendlyPrefillUrl(calendlyLink(), { name: c?.name, email: c?.email, note }) };
  }

  function bookingEmailSubject(ev) {
    const s = state.settings;
    return ev ? `Let's set up a call about ${ev.title}` : `Let's set up a call — ${s.businessName}`;
  }

  function bookingEmailText(c, ev, url) {
    const s = state.settings;
    return [
      `Hi ${c ? c.name.split(" ")[0] : "there"},`,
      ``,
      ev
        ? `Looking forward to ${ev.title}! Let's find a time to talk through the details.`
        : `Let's find a time to talk.`,
      ``,
      `Pick whichever slot suits you best here:`,
      url,
      ``,
      `Talk soon,`,
      s.ownerName || s.businessName,
      s.phone || "",
    ].filter(l => l !== undefined).join("\n");
  }

  function bookingEmailHtml(c, ev, url) {
    const s = state.settings;
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
      <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px 32px;">
        <div style="font-size:13px;color:#888;letter-spacing:1px;">${escapeHtml(s.businessName)}</div>
        <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(c ? c.name.split(" ")[0] : "there")},</p>
        <p style="font-size:15px;line-height:1.6;">
          ${ev ? `Looking forward to <strong>${escapeHtml(ev.title)}</strong>! Let's find a time to talk through the details.`
               : "Let's find a time to talk."}
        </p>
        <p style="font-size:15px;line-height:1.6;">Pick whichever slot suits you best:</p>
        <p style="margin:22px 0;">
          <a href="${escapeHtml(url)}" style="background:#7c5cff;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:8px;display:inline-block;font-size:15px;">Choose a time</a>
        </p>
        <p style="font-size:12.5px;color:#777;line-height:1.6;">Or paste this into your browser:<br>
          <a href="${escapeHtml(url)}" style="color:#7c5cff;">${escapeHtml(url)}</a>
        </p>
        <p style="font-size:14px;line-height:1.7;color:#444;margin-top:26px;">
          Talk soon,<br><strong>${escapeHtml(s.ownerName || s.businessName)}</strong><br>${escapeHtml(s.phone || "")}
        </p>
      </div>
    </body></html>`;
  }

  function openBookingLinkModal({ clientId, eventId } = {}) {
    if (!calendlyLink()) {
      toast("Add your Calendly link in Settings first");
      closeModal();
      go("settings");
      return;
    }
    const { c, ev, url } = bookingContext({ clientId, eventId });
    const gmailPossible = !!(c?.email && (canUseAccountForGmail() || state.settings.googleClientId));

    openModal(modalShell("Send a booking link", `
      <p class="settings-note">
        ${c ? escapeHtml(c.name) : "Your client"} picks the time that works for them.
        Their name${c?.email ? " and email are" : " is"} already filled in on the booking page,
        and whatever they choose lands on your calendar.
      </p>

      <div class="field full">
        <label>Their booking link</label>
        <input id="bookingUrl" readonly value="${escapeHtml(url)}">
      </div>

      <div class="booking-actions">
        <button class="btn" id="copyBookingLink">🔗 Copy link</button>
        ${c?.email ? `<button class="btn" id="mailBookingLink">✉️ Email (mail app)</button>` : ""}
        ${gmailPossible ? `<button class="btn btn-primary" id="gmailBookingLink">📨 Send via Gmail</button>` : ""}
        <button class="btn" id="previewBookingLink">👁 Preview page</button>
      </div>
      ${!c?.email ? `<div class="gmail-hint">This client has no email on file — copy the link and text it to them, or add an email address first.</div>` : ""}`));

    $("#copyBookingLink").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("Booking link copied 🔗");
      } catch {
        // Clipboard permission denied: select it so it can be copied by hand.
        const input = $("#bookingUrl");
        input.focus();
        input.select();
        toast("Press Ctrl/Cmd+C to copy");
      }
    });

    $("#previewBookingLink").addEventListener("click", () => window.open(url, "_blank", "noopener"));

    $("#mailBookingLink")?.addEventListener("click", () => {
      const href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(bookingEmailSubject(ev))}&body=${encodeURIComponent(bookingEmailText(c, ev, url))}`;
      window.location.href = href;
      toast("Opening your mail app…");
    });

    $("#gmailBookingLink")?.addEventListener("click", async () => {
      const btn = $("#gmailBookingLink");
      btn.disabled = true;
      try {
        if (!hasGoogleScope(GMAIL_SCOPE)) { toast("Connecting to Gmail…"); await ensureGoogleScope(GMAIL_SCOPE); }
        toast("Sending…");
        try {
          await gmailSend(c.email, bookingEmailSubject(ev), bookingEmailHtml(c, ev, url));
        } catch (err) {
          if (!err?.expired) throw err;
          await ensureGoogleScope(GMAIL_SCOPE);
          await gmailSend(c.email, bookingEmailSubject(ev), bookingEmailHtml(c, ev, url));
        }
        closeModal();
        toast(`Booking link sent to ${c.email} 📅`);
      } catch (err) {
        console.warn(err);
        btn.disabled = false;
        toast(err.message || "Could not send — try the mail app instead");
      }
    });
  }

  /* ================= GOOGLE CALENDAR (booked calls, read-only) ========
     Calendly writes confirmed bookings into the Google Calendar of the
     account it's connected to. Reading that calendar back is how a time
     the client chose on their own shows up here — no server needed. */

  const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

  let gcal = { monthKey: null, events: [], loading: false, error: "" };

  function googleCalendarOn() {
    return !!state.settings.showGoogleCalendar && canUseAccountForGmail();
  }

  async function fetchGoogleEvents(y, m) {
    await ensureGoogleScope(CALENDAR_SCOPE);
    const timeMin = new Date(y, m, 1).toISOString();
    const timeMax = new Date(y, m + 1, 1).toISOString();
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250",
    });
    const run = () => fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${gmailToken.token}` },
    });

    let res = await run();
    if (res.status === 401) {
      // Token aged out mid-session: renew silently and try once more.
      const first = await googleApiError(res, "Google Calendar");
      if (first.expired) {
        await ensureGoogleScope(CALENDAR_SCOPE);
        res = await run();
      }
    }
    if (!res.ok) throw await googleApiError(res, "Google Calendar");
    const data = await res.json();
    return (data.items || [])
      .filter(it => it.status !== "cancelled")
      .map(it => {
        const startRaw = it.start?.dateTime || it.start?.date || "";
        const allDay = !it.start?.dateTime;
        const d = startRaw ? new Date(startRaw) : null;
        return {
          id: it.id,
          title: it.summary || "(busy)",
          date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "",
          startTime: allDay || !d ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          allDay,
          link: it.htmlLink || "",
          location: it.location || "",
          description: it.description || "",
          attendees: (it.attendees || []).map(a => a.email).filter(Boolean),
          // Calendly stamps its bookings, which lets us flag them.
          fromCalendly: /calendly/i.test(`${it.description || ""} ${it.location || ""} ${it.source?.url || ""}`),
        };
      })
      .filter(e => e.date);
  }

  async function loadGoogleMonth(y, m, rerender) {
    const key = `${y}-${m}`;
    if (gcal.loading) return;
    gcal = { ...gcal, monthKey: key, loading: true, error: "" };
    rerender();
    try {
      const events = await fetchGoogleEvents(y, m);
      gcal = { monthKey: key, events, loading: false, error: "" };
    } catch (e) {
      console.warn("Google Calendar load failed", e);
      gcal = { monthKey: key, events: [], loading: false, error: e.message || "Could not load Google Calendar" };
    }
    rerender();
  }

  /* ================= ATTACHMENTS (uploaded invoice PDFs) =================
     Files are cached in IndexedDB on the device and, when small enough,
     mirrored to their own Firestore document so they follow the account
     to other devices. The main data document only ever holds metadata. */

  const ATTACH_DB = "djclientflow-files";
  const ATTACH_STORE = "files";
  const SYNC_FILE_LIMIT = 700 * 1024;        // base64 of this still fits one Firestore doc
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  let attachDbPromise = null;
  function attachDb() {
    if (attachDbPromise) return attachDbPromise;
    attachDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(ATTACH_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATTACH_STORE)) db.createObjectStore(ATTACH_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return attachDbPromise;
  }

  function idbRun(mode, fn) {
    return attachDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(ATTACH_STORE, mode);
      const req = fn(tx.objectStore(ATTACH_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function fileDocRef(fileId) {
    if (!cloud.user || !cloud.db || !cloud.fs) return null;
    return cloud.fs.doc(cloud.db, "djclientflow", cloud.user.uid, "files", fileId);
  }

  // rec: { name, type, size, data } where data is base64 without the data: prefix
  async function saveAttachment(fileId, rec) {
    let cached = true;
    try { await idbRun("readwrite", store => store.put(rec, fileId)); }
    catch (e) { cached = false; console.warn("Could not cache file locally", e); }

    const ref = fileDocRef(fileId);
    // null means "no account to sync to", which is different from
    // "should have synced but didn't" — only the latter is worth flagging.
    let synced = ref ? false : null;
    if (ref && rec.size <= SYNC_FILE_LIMIT) {
      try { await cloud.fs.setDoc(ref, rec); synced = true; }
      catch (e) { console.warn("Could not sync file to the cloud", e); }
    }
    return { cached, synced };
  }

  async function loadAttachment(fileId) {
    try {
      const local = await idbRun("readonly", store => store.get(fileId));
      if (local) return local;
    } catch (e) { console.warn("Local file read failed", e); }

    const ref = fileDocRef(fileId);
    if (!ref) return null;
    try {
      const snap = await cloud.fs.getDoc(ref);
      if (!snap.exists()) return null;
      const rec = snap.data();
      try { await idbRun("readwrite", store => store.put(rec, fileId)); } catch { /* cache is optional */ }
      return rec;
    } catch (e) {
      console.warn("Cloud file read failed", e);
      return null;
    }
  }

  async function deleteAttachment(fileId) {
    try { await idbRun("readwrite", store => store.delete(fileId)); } catch { /* ignore */ }
    const ref = fileDocRef(fileId);
    if (ref) { try { await cloud.fs.deleteDoc(ref); } catch (e) { console.warn(e); } }
  }

  function attachmentBlob(rec) {
    const bin = atob(rec.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: rec.type || "application/pdf" });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function fmtBytes(n) {
    if (!n) return "0 KB";
    return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  // Blob URLs opened for a preview are revoked when the modal closes.
  let openObjectUrls = [];
  function trackObjectUrl(url) { openObjectUrls.push(url); return url; }
  function releaseObjectUrls() {
    openObjectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    openObjectUrls = [];
  }

  /* ================= CLOUD SYNC (Firebase) =================
     One document per signed-in user holds the whole database.
     Firestore's realtime listener keeps every device in step and
     its offline cache means the app keeps working with no signal. */

  const FIREBASE_VERSION = "10.12.5";
  const DEVICE_KEY = "djclientflow.deviceId";
  const LINKED_KEY = "djclientflow.linkedUid";
  const PRELINK_BACKUP_KEY = BASE_KEY + ".prelink-backup";
  const CLOUD_DOC_LIMIT = 900000; // Firestore caps a document at 1 MB.

  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) { deviceId = uid(); localStorage.setItem(DEVICE_KEY, deviceId); }

  const cloud = {
    status: "off", // off | connecting | signed-out | live | error
    user: null, error: "", lastSyncedAt: null,
    auth: null, db: null, docRef: null, unsub: null,
    fs: null, authMod: null, applyingRemote: false, pushTimer: null, booted: false,
  };

  // Settings that stay on this device: the Firebase keys are needed
  // *before* sync can start, so they must never arrive from the cloud.
  const LOCAL_ONLY_SETTINGS = ["firebaseConfig"];

  // A config baked into firebase-config.js turns the app into a
  // multi-user product: everyone signs into their own account.
  function hostedConfig() {
    const c = window.DJCF_FIREBASE_CONFIG;
    if (!c || !c.apiKey || String(c.apiKey).startsWith("YOUR_")) return null;
    return c;
  }
  function accountsMode() { return !!hostedConfig(); }
  function activeConfig() { return hostedConfig() || state.settings.firebaseConfig || null; }

  function firebaseConfigured() {
    const c = activeConfig();
    return !!(c && c.apiKey && c.projectId && c.appId);
  }

  const appInfo = () => ({
    productName: "DJ ClientFlow",
    tagline: "Clients, gigs and invoices — all in one place.",
    ...(window.DJCF_APP_INFO || {}),
  });

  // Accepts the config block copied straight out of the Firebase console.
  function parseFirebaseConfig(text) {
    const out = {};
    ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"].forEach(k => {
      const m = String(text).match(new RegExp(k + "\\s*[:=]\\s*[\"'`]([^\"'`]+)[\"'`]"));
      if (m) out[k] = m[1];
    });
    return out.apiKey && out.projectId && out.appId ? out : null;
  }

  function setCloudStatus(status, error = "") {
    cloud.status = status;
    cloud.error = error;
    refreshCloudUi();
  }

  function cloudLabel() {
    switch (cloud.status) {
      case "live": return navigator.onLine ? "☁️ Synced" : "☁️ Offline — will sync";
      case "connecting": return "☁️ Connecting…";
      case "signed-out": return "☁️ Sign in to sync";
      case "error": return "⚠️ Sync problem";
      default: return "💾 This device only";
    }
  }

  function refreshCloudUi() {
    const el = document.getElementById("cloudStatus");
    if (el) {
      el.textContent = cloudLabel();
      el.className = "cloud-status status-" + cloud.status;
      el.title = cloud.user ? `Signed in as ${cloud.user.email}` : "";
    }

    const box = document.getElementById("accountBox");
    if (box) {
      if (cloud.user) {
        const name = cloud.user.displayName || cloud.user.email || "Your account";
        const initial = (name[0] || "?").toUpperCase();
        box.classList.remove("hidden");
        box.innerHTML = `
          <div class="acct-row">
            <div class="acct-avatar">${escapeHtml(initial)}</div>
            <div class="acct-meta">
              <div class="acct-name">${escapeHtml(name)}</div>
              <div class="acct-email">${escapeHtml(cloud.user.email || "")}</div>
            </div>
          </div>
          <button class="acct-signout" id="sidebarSignOut">Sign out</button>`;
        $("#sidebarSignOut", box).addEventListener("click", cloudSignOut);
      } else if (accountsMode() && isGuest()) {
        box.classList.remove("hidden");
        box.innerHTML = `<button class="acct-signin" id="sidebarSignIn">Sign in to sync →</button>`;
        $("#sidebarSignIn", box).addEventListener("click", () => {
          localStorage.removeItem(GUEST_KEY);
          authMode = "signin";
          showAuthScreen();
        });
      } else {
        box.classList.add("hidden");
        box.innerHTML = "";
      }
    }

    const hint = document.getElementById("sidebarHint");
    if (hint) {
      hint.textContent = cloud.user
        ? "Your data is saved to your account and synced to every device."
        : accountsMode()
          ? "Guest mode — data stays in this browser until you sign in."
          : "Turn on cloud sync in Settings to reach your data from any device.";
    }

    if (currentView === "settings") renderCloudCard();
  }

  async function initCloud() {
    if (!firebaseConfigured()) {
      setCloudStatus("off");
      showApp();
      return;
    }
    setCloudStatus("connecting");
    if (accountsMode() && !isGuest()) showAuthScreen({ loading: true });
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      ]);
      cloud.fs = fsMod;
      cloud.authMod = authMod;
      const app = appMod.initializeApp(activeConfig());
      cloud.auth = authMod.getAuth(app);
      // Offline cache: the app still works with no connection and
      // queues writes until it is back.
      try {
        cloud.db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({}) });
      } catch {
        cloud.db = fsMod.getFirestore(app);
      }
      authMod.onAuthStateChanged(cloud.auth, user => {
        cloud.booted = true;
        if (user) onSignedIn(user);
        else onSignedOut();
      });
    } catch (e) {
      console.error("Cloud sync failed to start", e);
      cloud.booted = true;
      setCloudStatus("error", navigator.onLine
        ? "Could not reach the sign-in service. Check the Firebase config."
        : "You're offline — showing the data saved on this device.");
      // Never strand someone behind a login screen that cannot load:
      // fall back to whatever this device already has.
      showApp();
    }
  }

  function onSignedIn(user) {
    cloud.user = user;
    const previousKey = storageKey();
    activeUid = user.uid;
    // Load (or start) this account's own local cache before syncing.
    state = load();
    saveLocal();
    guestDataPendingImport = localStorage.getItem(GUEST_KEY) === "1" ? previousKey : null;
    localStorage.removeItem(GUEST_KEY);
    showApp();
    go("dashboard");
    startSync(user);
  }

  function onSignedOut() {
    cloud.user = null;
    stopSync();
    activeUid = null;
    setCloudStatus(accountsMode() ? "signed-out" : "off");
    if (accountsMode() && !isGuest()) {
      state = emptyState();   // nothing of the last account stays on screen
      authMode = "signin";
      authValues = { name: "", email: "" };
      showAuthScreen();
    } else {
      state = load();
      showApp();
      render();
    }
  }

  function isGuest() { return localStorage.getItem(GUEST_KEY) === "1"; }

  function continueAsGuest() {
    localStorage.setItem(GUEST_KEY, "1");
    activeUid = null;
    state = load();
    showApp();
    render();
    refreshCloudUi();
    toast("Using this device only — create an account any time to sync");
  }

  async function cloudSignOut() {
    if (!confirm("Sign out? Your data stays safe in your account.")) return;
    localStorage.removeItem(LINKED_KEY);
    localStorage.removeItem(GUEST_KEY);
    try { await cloud.authMod.signOut(cloud.auth); } catch (e) { console.warn(e); }
    if (!accountsMode()) { activeUid = null; state = load(); render(); }
    toast("Signed out");
  }

  function authErrorMessage(e) {
    const map = {
      "auth/invalid-email": "That email address doesn't look right.",
      "auth/missing-password": "Enter your password.",
      "auth/weak-password": "Password needs to be at least 6 characters.",
      "auth/email-already-in-use": "That email already has an account — try signing in instead.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/wrong-password": "Email or password is incorrect.",
      "auth/user-not-found": "No account with that email yet — create one below.",
      "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
      "auth/popup-closed-by-user": "Sign-in window closed.",
      "auth/popup-blocked": "Your browser blocked the popup — allow popups and retry.",
      "auth/unauthorized-domain": "This site's domain isn't authorized in Firebase → Authentication → Settings → Authorized domains.",
      "auth/operation-not-allowed": "That sign-in method isn't enabled in your Firebase project yet.",
      "auth/network-request-failed": "Network problem — check your connection.",
    };
    return map[e?.code] || e?.message || "Something went wrong. Please try again.";
  }

  /* ---------------- Login screen ---------------- */

  let authMode = "signin"; // signin | signup | reset
  let guestDataPendingImport = null;
  // Kept across re-renders so a wrong password never costs someone
  // the name and email they already typed.
  let authValues = { name: "", email: "" };

  function showApp() {
    const screen = $("#authScreen");
    screen.classList.add("hidden");
    screen.innerHTML = "";        // don't leave a stale login form in the DOM
    authValues = { name: "", email: "" };
    $("#appShell").classList.remove("hidden");
  }

  function showAuthScreen(opts = {}) {
    $("#appShell").classList.add("hidden");
    const screen = $("#authScreen");
    screen.classList.remove("hidden");
    renderAuthScreen(opts);
  }

  function renderAuthScreen({ loading = false, busy = false, error = "", notice = "" } = {}) {
    const info = appInfo();
    const screen = $("#authScreen");

    if (loading) {
      screen.innerHTML = `
        <div class="auth-card">
          <div class="auth-logo">🎧</div>
          <div class="auth-brand">${escapeHtml(info.productName)}</div>
          <div class="auth-loading">Loading…</div>
        </div>`;
      return;
    }

    const isSignup = authMode === "signup";
    const isReset = authMode === "reset";
    const title = isSignup ? "Create your account" : isReset ? "Reset your password" : "Welcome back";
    const cta = isSignup ? "Create account" : isReset ? "Send reset link" : "Sign in";

    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">🎧</div>
        <div class="auth-brand">${escapeHtml(info.productName)}</div>
        <div class="auth-tagline">${escapeHtml(info.tagline)}</div>

        <div class="auth-title">${title}</div>
        ${error ? `<div class="auth-error">${escapeHtml(error)}</div>` : ""}
        ${notice ? `<div class="auth-notice">${escapeHtml(notice)}</div>` : ""}

        <form id="authForm" novalidate>
          ${isSignup ? `
            <div class="field"><label>Your name</label>
              <input name="name" autocomplete="name" placeholder="DJ RND" value="${escapeHtml(authValues.name)}">
            </div>` : ""}
          <div class="field"><label>Email</label>
            <input name="email" type="email" autocomplete="email" required placeholder="you@email.com" value="${escapeHtml(authValues.email)}">
          </div>
          ${!isReset ? `
            <div class="field"><label>Password</label>
              <input name="password" type="password" required
                     autocomplete="${isSignup ? "new-password" : "current-password"}"
                     placeholder="${isSignup ? "At least 6 characters" : "Your password"}">
            </div>` : ""}
          <button type="submit" class="btn btn-primary auth-submit" ${busy ? "disabled" : ""}>
            ${busy ? "Working…" : cta}
          </button>
        </form>

        ${!isReset ? `
          <div class="auth-divider"><span>or</span></div>
          <button class="btn auth-google" id="authGoogle" ${busy ? "disabled" : ""}>
            <span class="g-mark">G</span> Continue with Google
          </button>` : ""}

        <div class="auth-links">
          ${authMode === "signin" ? `
            <button class="linkish" data-mode="signup">Create an account</button>
            <button class="linkish" data-mode="reset">Forgot password?</button>` : ""}
          ${authMode === "signup" ? `<button class="linkish" data-mode="signin">I already have an account</button>` : ""}
          ${authMode === "reset" ? `<button class="linkish" data-mode="signin">Back to sign in</button>` : ""}
        </div>

        <div class="auth-guest">
          <button class="linkish subtle" id="authGuest">Skip — just use this device</button>
        </div>
      </div>`;

    // Carry typed values through mode switches too.
    const form = $("#authForm", screen);
    form.addEventListener("input", () => {
      authValues.name = form.name?.value ?? authValues.name;
      authValues.email = form.email?.value ?? authValues.email;
    });

    $$("[data-mode]", screen).forEach(b => b.addEventListener("click", () => {
      authMode = b.dataset.mode;
      renderAuthScreen();
    }));
    $("#authGuest", screen).addEventListener("click", continueAsGuest);
    $("#authGoogle", screen)?.addEventListener("click", googleSignIn);
    $("#authForm", screen).addEventListener("submit", submitAuthForm);
  }

  async function submitAuthForm(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const email = (fd.email || "").trim();
    const password = fd.password || "";
    authValues = { name: fd.name || "", email };
    const {
      createUserWithEmailAndPassword, signInWithEmailAndPassword,
      sendPasswordResetEmail, updateProfile,
    } = cloud.authMod;

    renderAuthScreen({ busy: true });
    try {
      if (authMode === "reset") {
        await sendPasswordResetEmail(cloud.auth, email);
        authMode = "signin";
        renderAuthScreen({ notice: `Password reset link sent to ${email}. Check your inbox.` });
        return;
      }
      if (authMode === "signup") {
        const cred = await createUserWithEmailAndPassword(cloud.auth, email, password);
        if (fd.name) {
          try { await updateProfile(cred.user, { displayName: fd.name }); } catch { /* non-fatal */ }
          pendingOwnerName = fd.name;
        }
      } else {
        await signInWithEmailAndPassword(cloud.auth, email, password);
      }
      // onAuthStateChanged takes it from here.
    } catch (err) {
      console.warn(err);
      renderAuthScreen({ error: authErrorMessage(err) });
    }
  }

  let pendingOwnerName = "";

  async function googleSignIn() {
    renderAuthScreen({ busy: true });
    try {
      const provider = new cloud.authMod.GoogleAuthProvider();
      await cloud.authMod.signInWithPopup(cloud.auth, provider);
    } catch (err) {
      console.warn(err);
      renderAuthScreen({ error: authErrorMessage(err) });
    }
  }

  // Legacy/self-host path: sign in from Settings without the full gate.
  async function cloudSignIn() {
    if (!firebaseConfigured()) { toast("Add your Firebase config first"); return; }
    if (!cloud.auth) await initCloud();
    if (!cloud.auth) return;
    try {
      await cloud.authMod.signInWithPopup(cloud.auth, new cloud.authMod.GoogleAuthProvider());
      toast("Signed in — your data now syncs ☁️");
    } catch (e) {
      console.warn(e);
      setCloudStatus("signed-out", authErrorMessage(e));
      toast(authErrorMessage(e));
    }
  }

  function stopSync() {
    if (cloud.unsub) { cloud.unsub(); cloud.unsub = null; }
    cloud.docRef = null;
  }

  function startSync(user) {
    const { doc, onSnapshot } = cloud.fs;
    stopSync();
    cloud.docRef = doc(cloud.db, "djclientflow", user.uid);
    let first = true;
    setCloudStatus("connecting");

    cloud.unsub = onSnapshot(cloud.docRef, { includeMetadataChanges: true }, snap => {
      // Skip the echo of our own not-yet-acknowledged write.
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.exists() ? snap.data() : null;

      if (first) {
        first = false;
        reconcileFirstSync(user, data);
        setCloudStatus("live");
        return;
      }
      if (!data) return;
      cloud.lastSyncedAt = Date.now();
      if (data.deviceId === deviceId) { setCloudStatus("live"); return; }
      applyRemote(data);
      toast("Updated from another device ☁️");
      setCloudStatus("live");
    }, err => {
      console.error("Sync listener failed", err);
      setCloudStatus("error", err?.code === "permission-denied"
        ? "Firestore rules are blocking access — see the README setup step."
        : "Lost connection to the cloud; local saving still works.");
    });
  }

  // First snapshot after signing in on a device decides who wins.
  function reconcileFirstSync(user, remote) {
    const hasData = s => s && (s.clients.length || s.events.length || s.invoices.length);
    const alreadyLinked = localStorage.getItem(LINKED_KEY) === user.uid;

    if (remote && (!hasData(state) || alreadyLinked)) {
      applyRemote(remote);                   // the account's cloud copy is truth
    } else if (remote) {
      // This device had its own records: keep both, never drop anything.
      try { localStorage.setItem(PRELINK_BACKUP_KEY, JSON.stringify(state)); } catch { /* quota */ }
      const added = mergeRemoteIntoLocal(remote);
      pushCloud(true);
      toast(added
        ? `Merged with your account — ${added} record${added === 1 ? "" : "s"} added ☁️`
        : "Merged with your account ☁️");
    } else {
      // Brand new account: personalize it, and offer to carry over
      // anything created before signing up.
      if (pendingOwnerName && !state.settings.ownerName) state.settings.ownerName = pendingOwnerName;
      if (user.email && !state.settings.email) state.settings.email = user.email;
      pendingOwnerName = "";
      offerGuestImport();
      pushCloud(true);
      toast("Account ready — your data now syncs ☁️");
    }
    localStorage.setItem(LINKED_KEY, user.uid);
    cloud.lastSyncedAt = Date.now();
  }

  // Someone who tried the app as a guest and then signed up keeps their work.
  function offerGuestImport() {
    if (!guestDataPendingImport) return;
    const raw = localStorage.getItem(guestDataPendingImport);
    guestDataPendingImport = null;
    if (!raw) return;
    let guestState;
    try { guestState = JSON.parse(raw); } catch { return; }
    const count = (guestState.clients || []).length + (guestState.events || []).length + (guestState.invoices || []).length;
    if (!count) return;
    if (!confirm(`Bring the ${count} record${count === 1 ? "" : "s"} you created before signing up into this account?`)) return;
    state.clients = guestState.clients || [];
    state.events = guestState.events || [];
    state.invoices = (guestState.invoices || []).map(migrateInvoice);
    const keptLocal = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { keptLocal[k] = state.settings[k]; });
    state.settings = { ...state.settings, ...(guestState.settings || {}), ...keptLocal };
    saveLocal();
    render();
  }

  function remoteToState(data) {
    const keptLocal = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { keptLocal[k] = state.settings[k]; });
    return {
      settings: { ...defaultSettings(), ...(data.settings || {}), ...keptLocal },
      clients: data.clients || [],
      events: data.events || [],
      invoices: (data.invoices || []).map(migrateInvoice),
    };
  }

  function applyRemote(data) {
    cloud.applyingRemote = true;
    try {
      state = remoteToState(data);
      saveLocal();
      render();
    } finally {
      cloud.applyingRemote = false;
    }
    cloud.lastSyncedAt = Date.now();
  }

  // Union by id — the cloud copy wins a tie, local-only records are kept.
  function mergeRemoteIntoLocal(data) {
    const remote = remoteToState(data);
    let added = 0;
    ["clients", "events", "invoices"].forEach(key => {
      const merged = new Map((remote[key] || []).map(r => [r.id, r]));
      (state[key] || []).forEach(localRec => {
        if (!merged.has(localRec.id)) { merged.set(localRec.id, localRec); added++; }
      });
      remote[key] = [...merged.values()];
    });
    state = remote;
    saveLocal();
    render();
    return added;
  }

  function queueCloudPush() {
    if (cloud.status !== "live" || cloud.applyingRemote || !cloud.docRef) return;
    clearTimeout(cloud.pushTimer);
    cloud.pushTimer = setTimeout(() => pushCloud(), 900);
  }

  async function pushCloud(silent = false) {
    if (!cloud.docRef || !cloud.fs) return;
    const settings = { ...state.settings };
    LOCAL_ONLY_SETTINGS.forEach(k => delete settings[k]);
    const payload = {
      settings, clients: state.clients, events: state.events, invoices: state.invoices,
      deviceId, updatedAt: cloud.fs.serverTimestamp(), schema: 2,
    };
    if (JSON.stringify(payload).length > CLOUD_DOC_LIMIT) {
      setCloudStatus("error", "Your data is too large to sync — a big logo image is the usual cause.");
      if (!silent) toast("Too large to sync — try a smaller logo image");
      return;
    }
    try {
      await cloud.fs.setDoc(cloud.docRef, payload);
      cloud.lastSyncedAt = Date.now();
      setCloudStatus("live");
    } catch (e) {
      console.error("Cloud push failed", e);
      // Firestore retries queued writes itself once back online.
      setCloudStatus(navigator.onLine ? "error" : "live",
        navigator.onLine ? (e?.message || "Could not save to the cloud") : "");
    }
  }

  window.addEventListener("online", () => { if (cloud.status !== "off") refreshCloudUi(); });
  window.addEventListener("offline", refreshCloudUi);

  /* ---------------- Init ---------------- */

  saveLocal(); // syncs sidebar business name without a cloud round-trip
  render();
  refreshCloudUi();
  initCloud();
  refreshUpdatesBadge();
})();
