/* ============================================================
   DJ ClientFlow — the client's page.

   Opened from a link the DJ sends. It reads one published
   document (collection "shared") and keeps a live listener on
   it, so a price change or a logged deposit appears here while
   the page sits open. Nothing is written from this page and no
   sign-in is needed; the document only ever holds the fields a
   client is meant to see.
   ============================================================ */

(() => {
  "use strict";

  const FIREBASE_VERSION = "10.12.5";
  const host = document.getElementById("quoteWrap");

  const params = new URLSearchParams(location.search);
  const shareId = (params.get("q") || location.hash.replace(/^#/, "")).trim();

  /* ---------------- Small helpers (standalone: app.js is not loaded) ---- */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  let currency = "USD";
  function money(n) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
    } catch {
      return "$" + (Number(n) || 0).toFixed(2);
    }
  }

  // Parse YYYY-MM-DD as a local date (avoids a UTC off-by-one).
  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1)
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtWhen(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return sameDay ? `today at ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
  }

  function note(title, body) {
    host.innerHTML = `
      <div class="quote-note">
        <div class="quote-note-mark">🎧</div>
        <h1>${esc(title)}</h1>
        <p>${body}</p>
      </div>`;
  }

  /* ---------------- The document itself ---------------- */

  function logoHtml(b) {
    if (b.logoImg) return `<img src="${esc(b.logoImg)}" alt="">`;
    return esc(b.logoText || b.name || "");
  }

  function rowsHtml(d) {
    let rows = "";

    if (d.uploaded) {
      rows += `<tr class="row-event"><td colspan="3">${esc(d.fileName || "Invoice")}</td><td>${money(d.total)}</td></tr>
               <tr class="row-equip"><td colspan="4">The full invoice was sent to you as a PDF by email.</td></tr>`;
    }

    (d.groups || []).forEach(g => {
      const hasItems = (g.items || []).length > 0;
      const groupTotal = !hasItems ? "" : (g.allComp ? "COMP" : money(g.total));
      rows += `<tr class="row-event"><td colspan="3">${esc(g.name || "Services")}</td><td>${groupTotal}</td></tr>`;
      (g.items || []).forEach(it => {
        const price = it.comp ? "COMP" : money(it.price);
        const total = it.comp ? "COMP" : money(it.amount);
        rows += `<tr class="row-pkg"><td>${esc(it.name)}</td><td>${it.qty || 1}</td><td>${price}</td><td>${total}</td></tr>`;
        (it.details || []).forEach(dt => {
          rows += `<tr class="row-equip"><td>${esc(dt.name)}</td><td>${dt.qty || 1}</td><td></td><td></td></tr>`;
        });
      });
    });

    if ((d.discounts || []).length) {
      rows += `<tr class="row-discount-group"><td colspan="3">Discounts</td><td>−${money(d.discountTotal)}</td></tr>`;
      d.discounts.forEach(x => {
        rows += `<tr class="row-discount"><td colspan="3">${esc(x.name)}</td><td>−${money(x.amount)}</td></tr>`;
      });
    }

    if (Number(d.taxRate) > 0) {
      rows += `<tr class="row-event"><td colspan="3">Tax (${esc(d.taxRate)}%)</td><td>${money(d.tax)}</td></tr>`;
    }

    if ((d.payments || []).length) {
      rows += `<tr class="row-discount-group"><td colspan="3">Payments Received</td><td>−${money(d.paid)}</td></tr>`;
      d.payments.forEach(p => {
        const label = [p.note || "Payment", fmtDate(p.date), p.method].filter(Boolean).join(" · ");
        rows += `<tr class="row-payment"><td colspan="3">${esc(label)}</td><td>−${money(p.amount)}</td></tr>`;
      });
    }

    if (d.hotelText) {
      rows += `<tr class="row-hotel"><td class="hotel-label">Hotel &amp; Parking<br>Accommodations</td><td colspan="3">${esc(d.hotelText)}</td></tr>`;
    }

    return rows;
  }

  function docHtml(data) {
    const b = data.business || {};
    const d = data.doc || {};
    const paidInFull = !!d.fullyPaid;
    const billTo = (d.billTo || []).map(l => `<div>${esc(l)}</div>`).join("") || "<div>—</div>";

    return `
      <div class="rnd-doc">
        <div class="rnd-header">
          <div class="rnd-header-left">
            <div class="rnd-company">${esc(b.name || "")}</div>
            <div class="rnd-title">${esc(d.heading || "Invoice")}</div>
          </div>
          <div class="rnd-logo">${logoHtml(b)}</div>
        </div>
        <div class="rnd-meta">
          <div class="rnd-meta-item">${esc(d.heading || "Invoice")} ${esc(d.number || "—")}</div>
          <div class="rnd-meta-item">Issued On: ${fmtDate(d.issueDate)}</div>
          <div class="rnd-meta-item">Due Date: ${fmtDate(d.dueDate)}</div>
          ${paidInFull
            ? `<div class="rnd-meta-item rnd-paid">PAID ${d.paidDate ? fmtDate(d.paidDate) : ""}</div>`
            : (d.payments || []).length ? `<div class="rnd-meta-item rnd-partial">DEPOSIT RECEIVED</div>` : ""}
        </div>
        <div class="rnd-parties">
          <div>
            <div class="rnd-party-label">Prepared for:</div>
            <div class="rnd-party-val">${billTo}</div>
          </div>
          <div>
            <div class="rnd-party-label">Payable to:</div>
            <div class="rnd-party-val">${esc(b.name || "")}<br>${esc(b.address || "").replace(/\n/g, "<br>")}</div>
          </div>
        </div>
        <table class="rnd-table">
          <thead><tr>
            <th style="width:55%">Description</th>
            <th style="width:12%">Quantity</th>
            <th style="width:16%">Price</th>
            <th style="width:17%">Total</th>
          </tr></thead>
          <tbody>${rowsHtml(d)}</tbody>
        </table>
        ${d.notes ? `<div class="rnd-notes">${esc(d.notes).replace(/\n/g, "<br>")}</div>` : ""}
        <div class="rnd-total">
          ${(d.payments || []).length ? `<span class="rnd-total-sub">Total ${money(d.total)} &nbsp;·&nbsp; Received ${money(d.paid)}</span>` : ""}
          <span class="rnd-total-label">${paidInFull ? "Paid in Full:" : (d.payments || []).length ? "Balance Due:" : "Amount Due:"}</span>
          <span class="rnd-total-val">${money(paidInFull ? d.total : Math.max(0, d.balance))}</span>
        </div>
        <div class="rnd-footer">
          <div class="rnd-footer-logo">${logoHtml(b)}</div>
          <div class="rnd-footer-info">
            <span>${esc(b.address || "")}</span>
            <span>${esc(b.phone || "")}</span>
            <span>${esc(b.email || "")}</span>
          </div>
        </div>
      </div>`;
  }

  function pageHtml(data) {
    const b = data.business || {};
    const d = data.doc || {};
    const what = (d.heading || "Invoice").toLowerCase();
    const when = fmtWhen(data.updatedAtMs);

    return `
      <div class="quote-top">
        <div class="quote-top-text">
          <span class="quote-live"><span class="live-dot"></span> Live ${esc(what)}</span>
          <span class="quote-top-sub">This page updates on its own whenever ${esc(b.name || "we")} ${esc(what === "quote" ? "changes the quote" : "updates the invoice")}${when ? ` · last updated ${esc(when)}` : ""}</span>
        </div>
        <button class="btn btn-primary" id="quotePrint">🖨 Print / Save PDF</button>
      </div>

      <div class="quote-doc">${docHtml(data)}</div>

      ${d.paymentInstructions ? `<div class="quote-card">
        <h2>How to pay</h2>
        <p>${esc(d.paymentInstructions).replace(/\n/g, "<br>")}</p>
      </div>` : ""}

      <div class="quote-card">
        <h2>Questions about this ${esc(what)}?</h2>
        <p>
          Get in touch with ${esc(b.ownerName || b.name || "us")} directly:<br>
          ${b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a><br>` : ""}
          ${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ""}
        </p>
      </div>

      <div class="quote-foot">
        Keep this link — it always shows the current version. Nothing you do on this page changes the ${esc(what)}.
      </div>`;
  }

  function renderPage(data) {
    currency = data.currency || "USD";
    host.innerHTML = pageHtml(data);
    document.title = `${data.doc?.heading || "Invoice"} ${data.doc?.number || ""} — ${data.business?.name || "DJ ClientFlow"}`.trim();
    // Re-rendered on every update, so the handler is re-attached each time.
    const btn = document.getElementById("quotePrint");
    if (btn) btn.addEventListener("click", () => window.print());
  }

  function renderGone() {
    note("This link isn't active any more",
      "The quote or invoice it pointed at was switched off or removed. Ask whoever sent it for a fresh link — it only takes them a moment.");
  }

  /* ---------------- Load & listen ---------------- */

  async function start() {
    if (!shareId || !/^[a-z0-9_-]{8,128}$/i.test(shareId)) {
      note("Nothing to show here",
        "This page needs the full link that was sent to you. Open it again straight from the email or message, without trimming the end off.");
      return;
    }

    const config = window.DJCF_FIREBASE_CONFIG;
    if (!config || !config.apiKey || String(config.apiKey).startsWith("YOUR_")) {
      note("This page isn't set up yet",
        "The site it belongs to has no cloud settings saved, so there's nothing for it to load.");
      return;
    }

    let fs, db;
    try {
      const [appMod, fsMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      ]);
      fs = fsMod;
      const app = appMod.initializeApp(config);
      if (window.DJCF_startAppCheck) await window.DJCF_startAppCheck(app, FIREBASE_VERSION);
      db = fsMod.getFirestore(app);
    } catch (e) {
      console.error("Could not load the viewer", e);
      note("Couldn't load your quote",
        "Check your connection and refresh the page. If it keeps happening, ask whoever sent the link to re-send it.");
      return;
    }

    let seen = false;
    fs.onSnapshot(fs.doc(db, "shared", shareId), snap => {
      if (!snap.exists() || snap.data().revoked) { renderGone(); return; }
      seen = true;
      renderPage(snap.data());
    }, err => {
      console.error("Live updates stopped", err);
      if (err && err.code === "permission-denied") { renderGone(); return; }
      // Already showing the document: leave it up rather than replacing
      // a perfectly readable quote with an error.
      if (seen) return;
      note("Couldn't load your quote",
        "Check your connection and refresh the page. If it keeps happening, ask whoever sent the link to re-send it.");
    });
  }

  start();
})();
