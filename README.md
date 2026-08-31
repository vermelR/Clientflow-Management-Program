# 🎧 DJ ClientFlow

A simple, HoneyBook-style client & invoice manager built for DJs. Track clients, manage gigs from inquiry to encore, create and send professional invoices, and see everything on a calendar — all in one organized place.

Run it for yourself, or [host it for many DJs](#cloud-sync-and-multi-user-setup) with accounts, logins and cloud sync.

## ✨ Features

- **Accounts & cloud sync** — sign in with email or Google and your data follows you to every device, with offline support ([setup](#cloud-sync-and-multi-user-setup))

- **Dashboard** — upcoming gigs, money actually collected this year (deposits included), outstanding balances, and overdue alerts at a glance
- **Clients** — contact info, how they found you, music preferences / do-not-play notes, plus each client's full gig & invoice history and lifetime revenue
- **Gigs & Events** — track every booking (wedding, corporate, birthday, club night…) with venue, times, guest count, fee, client needs (equipment, special songs, MC duties) and internal notes. Statuses: Inquiry → Booked → Completed
- **Invoices** — powered by the [RND Invoice Generator](https://github.com/vermelR/Invoice-Generator) format and design: events/sections with nested packages and included items, COMP toggles, named discounts, the hotel & parking clause, and the signature black/orange/blue RND layout. Plus auto-numbering and status tracking (Draft / Sent / Paid, with automatic Overdue detection). Create one straight from a gig and it pre-fills the fee.
  - 💵 **Deposits & partial payments** — log each payment as it lands (amount, date, method, description) and the invoice tracks *Received* vs *Balance due* automatically, marking itself **Partial** and then **Paid** when the balance clears. One-tap buttons for a 25%/50% deposit or the full remaining balance.
  - 🖨 **Print / Save as PDF** — pixel-true RND invoice layout
  - 📨 **Send via Gmail** — connect your Google account and email invoices to clients directly from the site
  - ✉️ **Email (mail app)** — or open a pre-written email in your usual mail app

  Printed and emailed invoices show every payment received and the remaining balance, so a client who paid a deposit sees exactly what's still owed.
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

## Cloud sync and multi-user setup

Out of the box the app saves to the browser it's opened in. Add a free Firebase project and it becomes a real multi-user product: everyone gets a login, their own private data, and automatic sync across every device they use.

**What you get once this is on**

- A **login screen** with email + password, Google sign-in, and password reset
- Every account's clients, gigs and invoices stored privately in the cloud — two DJs sharing a laptop never see each other's data
- **Live sync**: add a gig on your phone, it's on your laptop seconds later
- **Offline support**: keep working with no signal; changes upload when you reconnect
- Nothing lost when a laptop dies — sign in on the new one and everything is there

### One-time setup (~15 minutes)

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com) → *Add project*. The free Spark plan is plenty; no card required.
2. **Add a Web app**: in *Project settings → General → Your apps*, click the `</>` icon. Copy the `firebaseConfig` block it shows you.
3. **Paste it into `firebase-config.js`** in this repo (replacing the `YOUR_...` placeholders) and commit. These values are meant to be public — your data is protected by the security rules in step 6, not by hiding the keys.
4. **Turn on sign-in methods**: *Authentication → Get started → Sign-in method*, enable **Email/Password** and **Google**.
5. **Create the database**: *Firestore Database → Create database* → start in **production mode** → pick a region near you.
6. **Publish the security rules** — this is the step that keeps each account's data private. Open *Firestore Database → Rules*, paste the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
7. **Authorize your domain**: *Authentication → Settings → Authorized domains* → add `vermelr.github.io` (and any custom domain). Without this, Google sign-in is blocked.

Push the change and the live site now opens on a login screen. Anyone can create an account and start managing their own DJ business.

> Leave `firebase-config.js` untouched and the app simply keeps working in single-user mode, saving to the browser — handy for testing locally.

### Free tier, in plain terms

Firestore's free allowance is 50,000 reads and 20,000 writes per day, plus 1 GB stored. This app stores each account as a single small document and only writes when something changes, so a busy DJ uses a tiny fraction of that. Hundreds of users would still fit comfortably.

## 📱 Install it as an app

The site is a PWA, so it installs like a native app and launches offline:

- **iPhone/iPad**: open the site in Safari → Share → *Add to Home Screen*
- **Android**: Chrome → menu → *Install app*
- **Desktop** (Chrome/Edge): the install icon in the address bar

## 💾 Where's my data?

**With cloud sync on**, your data lives in your account — accessible from any device, safe if a laptop dies, and cached locally so the app works offline.

**Without it**, everything is saved in the browser you're using. Use **Settings → Export backup** to download a JSON backup and **Import backup** to restore it elsewhere.

> Either way, exporting an occasional backup is a good habit — and it's the easiest way to move data between accounts.

## 🛠 Tech

Plain HTML, CSS and JavaScript — zero dependencies, zero build step. Easy to customize: colors live in `styles.css` (`:root` variables), all logic in `app.js`.
