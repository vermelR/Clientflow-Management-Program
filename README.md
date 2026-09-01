# 🎧 DJ ClientFlow

A simple, HoneyBook-style client & invoice manager built for DJs. Track clients, manage gigs from inquiry to encore, create and send professional invoices, and see everything on a calendar — all in one organized place.

Run it for yourself, or [host it for many DJs](#cloud-sync-and-multi-user-setup) with accounts, logins and cloud sync.

## ✨ Features

- **Accounts & cloud sync** — sign in with email or Google and your data follows you to every device, with offline support ([setup](#cloud-sync-and-multi-user-setup))

- **Dashboard** — upcoming gigs, money actually collected this year (deposits included), outstanding balances, and overdue alerts at a glance
- **Clients** — contact info, how they found you, music preferences / do-not-play notes, plus each client's full gig & invoice history and lifetime revenue
- **Gigs & Events** — track every booking (wedding, corporate, birthday, club night…) with venue, times, guest count, fee, client needs (equipment, special songs, MC duties) and internal notes. Statuses: Inquiry → Booked → Completed
- **Invoices** — powered by the [RND Invoice Generator](https://github.com/vermelR/Invoice-Generator) format and design: events/sections with nested packages and included items, COMP toggles, named discounts, the hotel & parking clause, and the signature black/orange/blue RND layout. Plus auto-numbering and status tracking (Draft / Sent / Paid, with automatic Overdue detection). Create one straight from a gig and it pre-fills the fee.
  - 📎 **Upload an existing invoice** — already made one elsewhere, or migrating from another tool? Upload the PDF instead of rebuilding it. It's tracked like any other invoice (status, deposits, balance, client and gig links), previews in the app, downloads, and emails to the client as an attachment. Files under 700 KB sync to your other devices; larger ones (up to 10 MB) stay on the device they were uploaded from.
  - 💵 **Deposits & partial payments** — log each payment as it lands (amount, date, method, description) and the invoice tracks *Received* vs *Balance due* automatically, marking itself **Partial** and then **Paid** when the balance clears. One-tap buttons for a 25%/50% deposit or the full remaining balance.
  - 🖨 **Print / Save as PDF** — pixel-true RND invoice layout
  - 📨 **Send via Gmail** — connect your Google account and email invoices to clients directly from the site
  - ✉️ **Email (mail app)** — or open a pre-written email in your usual mail app

  Printed and emailed invoices show every payment received and the remaining balance, so a client who paid a deposit sees exactly what's still owed.
- **🔔 Reminders** — a discreet pill in the corner of every screen opens a panel showing what's coming up in the next 30 days, closest first, with each gig's payment state at a glance (Paid / balance left / unpaid / not invoiced) plus any overdue invoices. The badge counts only what still needs attention, so it disappears when you're all square.
- **Calendar** — month view of all your gigs, color-coded by status
- **📅 Calendly scheduling** — paste your Calendly link in Settings and a **Send booking link** button appears on every client and gig. Email it to them (via Gmail or your mail app) or copy it to text over; their name and email are already filled in on the booking page, and a gig's details ride along as a note. *They* choose the time that suits them. Turn on **Show booked calls on your calendar** and whatever they pick appears on the Calendar page — see below.
- **Settings & Backup** — your business details for invoice headers, default payment terms, and one-click JSON export/import so your data is never locked in

## 🚀 Getting started

No install, no server, no account. It's a static web app:

1. **Open `index.html` in your browser** — that's it.
2. Or host it for free with **GitHub Pages** — a deploy workflow is already included (`.github/workflows/deploy-pages.yml`). One-time setup: go to repo **Settings → Pages** and set **Source** to **GitHub Actions**. From then on, every push deploys automatically to:

   **https://vermelr.github.io/Clientflow-Management-Program/**

On first launch, click **"Load sample data"** to explore with realistic example clients, gigs, and invoices — or jump straight in and add your first client.

## 📨 Gmail setup (send invoices from the site)

**If cloud sync is on and you signed in with Google, there's nothing to set up.** Gmail sending uses the account you're already signed in with: the first time you hit *Send via Gmail*, Google asks once for permission to send mail on your behalf, and after that it just works. (Signed up with email and password? The same button links your Google account at that moment.) ClientFlow only ever requests permission to **send** — it can't read your inbox.

Two things the app owner does once in the Firebase project's Google Cloud console for this to work: enable the **Gmail API**, and add the `gmail.send` scope on the **OAuth consent screen**. Because that scope is a sensitive one, Google limits an unverified app to 100 users until you submit it for verification — fine while you're testing with a handful of DJs, worth starting early if you plan to go wider.

<details>
<summary><strong>Standalone setup</strong> (only needed when you're not using accounts / cloud sync)</summary>

One-time setup (~5 minutes):

1. Go to [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials) and sign in with the Gmail account you send invoices from.
2. Create a project (any name, e.g. "DJ ClientFlow").
3. Enable the **Gmail API**: *APIs & Services → Library → search "Gmail API" → Enable*.
4. Set up the **OAuth consent screen** (*APIs & Services → OAuth consent screen*): choose **External**, fill in the app name and your email, and add yourself as a **test user**.
5. Create credentials: *Credentials → Create Credentials → **OAuth client ID*** → Application type **Web application**.
   - Under **Authorized JavaScript origins** add your site's URL: `https://vermelr.github.io`
6. Copy the generated **Client ID** (looks like `1234567890-abc123.apps.googleusercontent.com`).
7. In DJ ClientFlow, open **Settings → Gmail**, paste the Client ID, click **Connect Gmail**, and approve the Google sign-in.

Now every invoice has a **"Send via Gmail"** button that emails a beautifully formatted invoice straight to the client and marks it as sent. The connection only asks for permission to *send* email (`gmail.send`) — it can't read your inbox. Sign-in lasts for the browser session; you'll be asked to re-approve occasionally.

</details>

> Note: Gmail sign-in requires the site to be served over http(s) — it works on your GitHub Pages URL, not when opening `index.html` directly from disk. The "Email (mail app)" button works everywhere as a fallback.

## Seeing booked calls on the Calendar page

Once a client books, the time they picked shows up on the Calendar page — but only with this chain connected, because the app has no server to receive Calendly's webhooks:

1. **In Calendly**, connect your Google Calendar (*Account → Calendar connections*) so confirmed bookings are written into it. Calendly does this by default for most accounts.
2. **In ClientFlow**, sign in with that same Google account, then go to **Settings → Calendly → Show booked calls on your calendar** and tick the box. Google asks once for read-only calendar access.
3. **In Google Cloud** (the project behind your Firebase app), enable the **Google Calendar API** and add the `calendar.events.readonly` scope to the OAuth consent screen.

Booked calls then appear on the Calendar page in blue, alongside your gigs. Calendly bookings are flagged, and clicking one shows the details plus an **Add to ClientFlow** button that turns it into a proper gig linked to the client (matched by their email).

The events are read-only — ClientFlow never writes to or changes your Google Calendar.

## Posting updates for your users

**Settings → What's new** shows release notes to everyone using your app. It reads [`updates.json`](updates.json), so publishing an update is: edit that file, commit, done — the next time anyone opens the app they see it, with a dot on the Settings tab until they've read it.

The file starts empty (`{"updates": []}`). Add newest entries **first**:

```json
{
  "updates": [
    {
      "version": "1.1",
      "date": "2026-10-04",
      "title": "Deposits and Calendly",
      "notes": [
        "Record deposits and partial payments on any invoice.",
        "Book client calls straight from a client or gig.",
        "Fixed: overdue invoices now clear once fully paid."
      ]
    },
    {
      "version": "1.0",
      "date": "2026-09-20",
      "title": "First release",
      "notes": ["Clients, gigs, invoices and calendar."]
    }
  ]
}
```

Every field is optional except keeping the shape — an entry can be just a `title` and `notes` if you'd rather not track version numbers. Text is plain text (no HTML), and the app escapes it, so anything you type is displayed exactly as written.

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
