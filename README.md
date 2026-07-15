# 🎧 DJ ClientFlow

A simple, HoneyBook-style client & invoice manager built for DJs. Track clients, manage gigs from inquiry to encore, create and send professional invoices, and see everything on a calendar — all in one organized place.

## ✨ Features

- **Dashboard** — upcoming gigs, money collected this year, outstanding invoices, and overdue alerts at a glance
- **Clients** — contact info, how they found you, music preferences / do-not-play notes, plus each client's full gig & invoice history and lifetime revenue
- **Gigs & Events** — track every booking (wedding, corporate, birthday, club night…) with venue, times, guest count, fee, client needs (equipment, special songs, MC duties) and internal notes. Statuses: Inquiry → Booked → Completed
- **Invoices** — powered by the [RND Invoice Generator](https://github.com/vermelR/Invoice-Generator) format and design: events/sections with nested packages and included items, COMP toggles, named discounts, the hotel & parking clause, and the signature black/orange/blue RND layout. Plus auto-numbering and status tracking (Draft / Sent / Paid, with automatic Overdue detection). Create one straight from a gig and it pre-fills the fee.
  - 🖨 **Print / Save as PDF** — pixel-true RND invoice layout
  - 📨 **Send via Gmail** — connect your Google account and email invoices to clients directly from the site
  - ✉️ **Email (mail app)** — or open a pre-written email in your usual mail app
- **Calendar** — month view of all your gigs, color-coded by status
- **Settings & Backup** — your business details for invoice headers, default payment terms, and one-click JSON export/import so your data is never locked in

## 🚀 Getting started

No install, no server, no account. It's a static web app:

1. **Open `index.html` in your browser** — that's it.
2. Or host it for free with **GitHub Pages** — a deploy workflow is already included (`.github/workflows/deploy-pages.yml`). One-time setup: go to repo **Settings → Pages** and set **Source** to **GitHub Actions**. From then on, every push deploys automatically to:

   **https://vermelr.github.io/Clientflow-Management-Program/**

On first launch, click **"Load sample data"** to explore with realistic example clients, gigs, and invoices — or jump straight in and add your first client.

## 📨 Gmail setup (send invoices from the site)

The site can send invoice emails through your own Gmail account, right from your browser — no server involved. One-time setup (~5 minutes):

1. Go to [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials) and sign in with the Gmail account you send invoices from.
2. Create a project (any name, e.g. "DJ ClientFlow").
3. Enable the **Gmail API**: *APIs & Services → Library → search "Gmail API" → Enable*.
4. Set up the **OAuth consent screen** (*APIs & Services → OAuth consent screen*): choose **External**, fill in the app name and your email, and add yourself as a **test user**.
5. Create credentials: *Credentials → Create Credentials → **OAuth client ID*** → Application type **Web application**.
   - Under **Authorized JavaScript origins** add your site's URL: `https://vermelr.github.io`
6. Copy the generated **Client ID** (looks like `1234567890-abc123.apps.googleusercontent.com`).
7. In DJ ClientFlow, open **Settings → Gmail**, paste the Client ID, click **Connect Gmail**, and approve the Google sign-in.

Now every invoice has a **"Send via Gmail"** button that emails a beautifully formatted invoice straight to the client and marks it as sent. The connection only asks for permission to *send* email (`gmail.send`) — it can't read your inbox. Sign-in lasts for the browser session; you'll be asked to re-approve occasionally.

> Note: Gmail sign-in requires the site to be served over http(s) — it works on your GitHub Pages URL, not when opening `index.html` directly from disk. The "Email (mail app)" button works everywhere as a fallback.

## 💾 Where's my data?

Everything is saved automatically in your browser's local storage — private to your device, works offline. Use **Settings → Export backup** regularly to download a JSON backup, and **Import backup** to restore it or move to another computer.

> Note: clearing your browser data will erase the app's data too, so keep backups!

## 🛠 Tech

Plain HTML, CSS and JavaScript — zero dependencies, zero build step. Easy to customize: colors live in `styles.css` (`:root` variables), all logic in `app.js`.
