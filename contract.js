/* ============================================================
   DJ ClientFlow — the client's signing page.

   Opened from a link the DJ sends. It reads one published
   contract document, shows it in full, and lets the client sign
   once: typed or drawn. That signature is the only thing this
   page ever writes back, and the security rules allow it only
   while the contract is live and unsigned.
   ============================================================ */

(() => {
  "use strict";

  const FIREBASE_VERSION = "10.12.5";
  const host = document.getElementById("contractWrap");

  const params = new URLSearchParams(location.search);
  const shareId = (params.get("c") || location.hash.replace(/^#/, "")).trim();

  let fs = null, db = null, ref = null;

  /* ---------------- Helpers ---------------- */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1)
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtStamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  function note(title, body) {
    host.innerHTML = `
      <div class="quote-note">
        <div class="quote-note-mark">📝</div>
        <h1>${esc(title)}</h1>
        <p>${body}</p>
      </div>`;
  }

  function signatureMark(sig) {
    if (!sig) return "";
    if (sig.kind === "drawn" && sig.dataUrl) {
      return `<img class="sig-img" src="${esc(sig.dataUrl)}" alt="Signature of ${esc(sig.name || "")}">`;
    }
    return `<span class="sig-typed">${esc(sig.name || "")}</span>`;
  }

  function signatureBlock(label, sig, placeholder) {
    return `
      <div class="sig-block">
        <div class="sig-mark">${sig ? signatureMark(sig) : `<span class="sig-empty">${esc(placeholder)}</span>`}</div>
        <div class="sig-rule"></div>
        <div class="sig-meta">
          <strong>${esc(label)}</strong>
          ${sig ? `<span>${esc(sig.name || "")}</span><span>Signed ${esc(fmtStamp(sig.signedAt))}</span>`
                : `<span>Not signed yet</span>`}
        </div>
      </div>`;
  }

  function logoHtml(b) {
    if (b.logoImg) return `<img src="${esc(b.logoImg)}" alt="">`;
    return esc(b.logoText || b.name || "");
  }

  /* ---------------- The contract ---------------- */

  function docHtml(data) {
    const b = data.business || {};
    const ct = data.contract || {};
    const client = data.clientSigned ? data.clientSignature : null;

    return `
      <div class="agr-doc">
        <div class="agr-head">
          <div>
            <div class="agr-biz">${esc(b.name || "")}</div>
            <div class="agr-title">${esc(ct.title || "Agreement")}</div>
          </div>
          <div class="agr-logo">${logoHtml(b)}</div>
        </div>
        <div class="agr-meta">
          <span>${esc(ct.number || "")}</span>
          <span>Dated ${fmtDate(ct.date)}</span>
          ${client ? `<span class="agr-executed">FULLY SIGNED</span>` : ""}
        </div>
        <div class="agr-body">
          ${(ct.sections || []).map((sec, i) => `
            <section class="agr-section">
              ${sec.heading ? `<h3>${i + 1}. ${esc(sec.heading)}</h3>` : ""}
              <p>${esc(sec.body).replace(/\n/g, "<br>")}</p>
            </section>`).join("")}
        </div>
        <div class="agr-signatures">
          ${signatureBlock(`${b.name || "DJ"} (DJ)`, data.dj, "Awaiting signature")}
          ${signatureBlock(`${ct.clientLabel || "Client"} (Client)`, client, "Your signature goes here")}
        </div>
      </div>`;
  }

  function signPanelHtml(data) {
    const ct = data.contract || {};
    if (data.clientSigned) {
      const when = data.clientSignature && data.clientSignature.signedAt;
      return `
        <div class="quote-card signed-card">
          <h2>✓ Signed${when ? ` on ${esc(fmtStamp(when))}` : ""}</h2>
          <p>
            Thank you — ${esc((data.business && data.business.name) || "they")} has your signature and a copy of this
            agreement. Keep this link: it always shows the signed contract.
          </p>
          <button class="btn btn-primary" id="signedPrint">🖨 Print / Save PDF</button>
        </div>`;
    }

    return `
      <div class="quote-card sign-card">
        <h2>Sign this agreement</h2>
        <p>
          Read the contract above. When you're happy with it, sign below — typing your name counts as your
          signature, the same way it does on any e-signing service.
        </p>

        <div class="sig-tabs">
          <button class="chip active" data-sig-mode="type">Type it</button>
          <button class="chip" data-sig-mode="draw">Draw it</button>
        </div>

        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Your full legal name *</label>
            <input id="signName" placeholder="e.g. ${esc(ct.clientLabel || "Jordan Blake")}" autocomplete="name">
          </div>
          <div class="field"><label>Your email (optional)</label>
            <input id="signEmail" type="email" placeholder="you@email.com" autocomplete="email">
          </div>
        </div>

        <div id="signTypePane">
          <div class="sig-preview" id="signPreview"><span class="sig-empty">Your name appears here</span></div>
        </div>

        <div id="signDrawPane" class="hidden">
          <div class="sig-pad-wrap">
            <canvas id="signPad" width="900" height="260"></canvas>
            <div class="sig-pad-hint" id="signPadHint">Sign here with your mouse or finger</div>
          </div>
          <button type="button" class="btn btn-sm" id="signClear">Clear</button>
        </div>

        <label class="comp-toggle sign-agree">
          <input type="checkbox" id="signAgree">
          I have read this agreement and agree to its terms.
        </label>

        <div style="margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="signSubmit">✍️ Sign the agreement</button>
          <span class="settings-note" id="signStatus" style="margin:0"></span>
        </div>
      </div>`;
  }

  function pageHtml(data) {
    const b = data.business || {};
    const ct = data.contract || {};
    const when = data.updatedAtMs
      ? new Date(data.updatedAtMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    return `
      <div class="quote-top">
        <div class="quote-top-text">
          <span class="quote-live"><span class="live-dot"></span> ${data.clientSigned ? "Signed agreement" : "Awaiting your signature"}</span>
          <span class="quote-top-sub">${esc(ct.title || "Agreement")} from ${esc(b.name || "")}${when ? ` · issued ${esc(when)}` : ""}</span>
        </div>
        <button class="btn btn-primary" id="contractPrint">🖨 Print / Save PDF</button>
      </div>

      <div class="quote-doc">${docHtml(data)}</div>

      ${signPanelHtml(data)}

      <div class="quote-card">
        <h2>Questions before you sign?</h2>
        <p>
          Get in touch with ${esc(b.ownerName || b.name || "us")} directly:<br>
          ${b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a><br>` : ""}
          ${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ""}
        </p>
      </div>

      <div class="quote-foot">
        Keep this link — it always shows the current version of this agreement.
      </div>`;
  }

  /* ---------------- Signature pad ---------------- */

  let mode = "type";
  let drawn = "";

  function wireSigning(data) {
    const nameEl = document.getElementById("signName");
    if (!nameEl) return;      // already signed: nothing to wire

    // A re-render (the DJ signing while this page is open) rebuilds the
    // pad, so the mode starts from scratch with it.
    mode = "type";
    drawn = "";

    const preview = document.getElementById("signPreview");
    const canvas = document.getElementById("signPad");
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#13100e";

    nameEl.addEventListener("input", () => {
      preview.innerHTML = nameEl.value.trim()
        ? `<span class="sig-typed">${esc(nameEl.value)}</span>`
        : `<span class="sig-empty">Your name appears here</span>`;
    });

    document.querySelectorAll("[data-sig-mode]").forEach(btn => btn.addEventListener("click", () => {
      mode = btn.dataset.sigMode;
      document.querySelectorAll("[data-sig-mode]").forEach(b => b.classList.toggle("active", b === btn));
      document.getElementById("signTypePane").classList.toggle("hidden", mode !== "type");
      document.getElementById("signDrawPane").classList.toggle("hidden", mode !== "draw");
    }));

    let drawing = false;
    const point = e => {
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - r.left) * (canvas.width / r.width),
        y: (src.clientY - r.top) * (canvas.height / r.height),
      };
    };
    const start = e => {
      e.preventDefault();
      drawing = true;
      document.getElementById("signPadHint").classList.add("hidden");
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = e => {
      if (!drawing) return;
      e.preventDefault();
      const p = point(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const end = () => {
      if (!drawing) return;
      drawing = false;
      drawn = canvas.toDataURL("image/png");
    };
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    document.getElementById("signClear").addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawn = "";
      document.getElementById("signPadHint").classList.remove("hidden");
    });

    document.getElementById("signSubmit").addEventListener("click", () => submit(data));
  }

  async function submit(data) {
    const status = document.getElementById("signStatus");
    const btn = document.getElementById("signSubmit");
    const name = document.getElementById("signName").value.trim();
    const email = document.getElementById("signEmail").value.trim();

    if (!name) { status.textContent = "Type your full name first."; document.getElementById("signName").focus(); return; }
    if (!document.getElementById("signAgree").checked) { status.textContent = "Tick the box to confirm you agree."; return; }
    if (mode === "draw" && !drawn) { status.textContent = "Draw your signature, or switch to Type it."; return; }
    if (mode === "draw" && drawn.length > 60000) { status.textContent = "That signature is too detailed — clear it and sign again."; return; }

    const signature = {
      kind: mode === "draw" ? "drawn" : "typed",
      name,
      email,
      dataUrl: mode === "draw" ? drawn : "",
      signedAt: new Date().toISOString(),
    };

    btn.disabled = true;
    status.textContent = "Signing…";
    try {
      await fs.updateDoc(ref, {
        clientSigned: true,
        clientSignature: signature,
        updatedAtMs: Date.now(),
      });
      // The listener re-renders with the signed copy; this is just in
      // case the write lands before the snapshot comes back.
      render({ ...data, clientSigned: true, clientSignature: signature });
    } catch (e) {
      console.error("Signing failed", e);
      btn.disabled = false;
      status.textContent = e && e.code === "permission-denied"
        ? "This contract can't be signed any more — it may have been signed already or withdrawn. Refresh the page."
        : "Couldn't save your signature. Check your connection and try again.";
    }
  }

  /* ---------------- Render & listen ---------------- */

  let lastRendered = "";

  // Anything half-typed into the signing form is put back after a
  // re-render, so an update from the DJ's side can never cost someone
  // the name they were in the middle of typing.
  function captureForm() {
    const name = document.getElementById("signName");
    if (!name) return null;
    return {
      name: name.value,
      email: document.getElementById("signEmail").value,
      agree: document.getElementById("signAgree").checked,
      mode, drawn,
    };
  }

  function restoreForm(kept) {
    if (!kept) return;
    const name = document.getElementById("signName");
    if (!name) return;
    name.value = kept.name;
    name.dispatchEvent(new Event("input"));
    document.getElementById("signEmail").value = kept.email;
    document.getElementById("signAgree").checked = kept.agree;
    if (kept.mode === "draw") {
      document.querySelector('[data-sig-mode="draw"]').click();
      drawn = kept.drawn;
      if (kept.drawn) {
        const canvas = document.getElementById("signPad");
        const img = new Image();
        img.onload = () => canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = kept.drawn;
        document.getElementById("signPadHint").classList.add("hidden");
      }
    }
  }

  function render(data) {
    const json = JSON.stringify(data);
    if (json === lastRendered) return;      // nothing actually changed
    const kept = captureForm();
    lastRendered = json;

    host.innerHTML = pageHtml(data);
    document.title = `${data.contract?.title || "Agreement"} — ${data.business?.name || "DJ ClientFlow"}`;
    document.getElementById("contractPrint")?.addEventListener("click", () => window.print());
    document.getElementById("signedPrint")?.addEventListener("click", () => window.print());
    wireSigning(data);
    restoreForm(kept);
  }

  function renderGone(voided) {
    note(voided ? "This agreement was withdrawn" : "This link isn't active any more",
      voided
        ? "The DJ took this contract back down. If that's a surprise, get in touch with them — they can send a fresh one."
        : "The contract it pointed at was withdrawn or replaced. Ask whoever sent it for a new link — it only takes them a moment.");
  }

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

    try {
      const [appMod, fsMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      ]);
      fs = fsMod;
      db = fsMod.getFirestore(appMod.initializeApp(config));
      ref = fsMod.doc(db, "contracts", shareId);
    } catch (e) {
      console.error("Could not load the viewer", e);
      note("Couldn't load your contract",
        "Check your connection and refresh the page. If it keeps happening, ask whoever sent the link to re-send it.");
      return;
    }

    let seen = false;
    fs.onSnapshot(ref, snap => {
      if (!snap.exists() || snap.data().revoked) { renderGone(false); return; }
      const data = snap.data();
      if (data.voided && !data.clientSigned) { renderGone(true); return; }
      seen = true;
      render(data);
    }, err => {
      console.error("Live updates stopped", err);
      if (err && err.code === "permission-denied") { renderGone(false); return; }
      if (seen) return;     // already readable on screen; leave it alone
      note("Couldn't load your contract",
        "Check your connection and refresh the page. If it keeps happening, ask whoever sent the link to re-send it.");
    });
  }

  start();
})();
