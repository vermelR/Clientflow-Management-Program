# 🎧 DJ ClientFlow

A simple, HoneyBook-style client & invoice manager built for DJs. Track clients, manage gigs from inquiry to encore, create and send professional invoices, and see everything on a calendar — all in one organized place.

## ✨ Features

- **Dashboard** — upcoming gigs, money collected this year, outstanding invoices, and overdue alerts at a glance
- **Clients** — contact info, how they found you, music preferences / do-not-play notes, plus each client's full gig & invoice history and lifetime revenue
- **Gigs & Events** — track every booking (wedding, corporate, birthday, club night…) with venue, times, guest count, fee, client needs (equipment, special songs, MC duties) and internal notes. Statuses: Inquiry → Booked → Completed
- **Invoices** — professional invoices with line items, tax and discounts, auto-numbering, and status tracking (Draft / Sent / Paid, with automatic Overdue detection). Create one straight from a gig and it pre-fills the fee.
  - 🖨 **Print / Save as PDF** — clean, printable invoice layout
  - ✉️ **Email to client** — opens a pre-written email with the invoice summary
- **Calendar** — month view of all your gigs, color-coded by status
- **Settings & Backup** — your business details for invoice headers, default payment terms, and one-click JSON export/import so your data is never locked in

## 🚀 Getting started

No install, no server, no account. It's a static web app:

1. **Open `index.html` in your browser** — that's it.
2. Or host it for free with **GitHub Pages**: repo *Settings → Pages → Deploy from branch*, pick your branch, and open the URL on any device.

On first launch, click **"Load sample data"** to explore with realistic example clients, gigs, and invoices — or jump straight in and add your first client.

## 💾 Where's my data?

Everything is saved automatically in your browser's local storage — private to your device, works offline. Use **Settings → Export backup** regularly to download a JSON backup, and **Import backup** to restore it or move to another computer.

> Note: clearing your browser data will erase the app's data too, so keep backups!

## 🛠 Tech

Plain HTML, CSS and JavaScript — zero dependencies, zero build step. Easy to customize: colors live in `styles.css` (`:root` variables), all logic in `app.js`.
