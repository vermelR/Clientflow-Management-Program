# 🎧 DJ ClientFlow

A simple, HoneyBook-style client & invoice manager built for DJs. Track clients, manage gigs from inquiry to encore, create and send professional invoices, and see everything on a calendar — all in one organized place.

Run it for yourself, or [host it for many DJs](#cloud-sync-and-multi-user-setup) with accounts, logins and cloud sync.

## ✨ Features

- **Accounts & cloud sync** — sign in with email or Google and your data follows you to every device, with offline support ([setup](#cloud-sync-and-multi-user-setup))

- **Dashboard** — upcoming gigs, money actually collected this year (deposits included), outstanding balances, and overdue alerts at a glance
- **Clients** — contact info, how they found you, music preferences / do-not-play notes, plus each client's full gig & invoice history and lifetime revenue
- **Gigs & Events** — track every booking (wedding, corporate, birthday, club night…) with venue, times, guest count, fee, client needs (equipment, special songs, MC duties) and internal notes. Statuses: Inquiry → Booked → Completed. Multi-day bookings take an **end date** and run across every day on the calendar.
  - 🗂 **Running order** — a wedding weekend is one booking with several functions. Give each one its own date, time and (if it moves) its own venue — Grah Shanti, Mehndi, Sangeet, Baraat, Reception — and they show on the calendar under their day, on the gig, and in the contract as dated sub-sections.
- **Invoices** — powered by the [RND Invoice Generator](https://github.com/vermelR/Invoice-Generator) format and design: events/sections with nested packages and included items, COMP toggles, named discounts, the hotel & parking clause, and the signature black/orange/blue RND layout. Plus auto-numbering and status tracking (Draft / Sent / Paid, with automatic Overdue detection). Create one straight from a gig and it pre-fills the fee.
  - 📎 **Upload an existing invoice** — already made one elsewhere, or migrating from another tool? Upload the PDF instead of rebuilding it. It's tracked like any other invoice (status, deposits, balance, client and gig links), previews in the app, downloads, and emails to the client as an attachment. Files under 700 KB sync to your other devices; larger ones (up to 10 MB) stay on the device they were uploaded from.
  - 💵 **Deposits & partial payments** — log each payment as it lands (amount, date, method, description) and the invoice tracks *Received* vs *Balance due* automatically, marking itself **Partial** and then **Paid** when the balance clears. One-tap buttons for a 25%/50% deposit or the full remaining balance.
  - 🖨 **Print / Save as PDF** — pixel-true RND invoice layout
  - 📨 **Send via Gmail** — connect your Google account and email invoices to clients directly from the site
  - ✉️ **Email (mail app)** — or open a pre-written email in your usual mail app

  Printed and emailed invoices show every payment received and the remaining balance, so a client who paid a deposit sees exactly what's still owed.
- **🔗 Live quote links** — open any quote or invoice and hit **Share live link**: ClientFlow publishes it to a private page at a long, unguessable address and gives you the link to copy, text, or email (via Gmail or your mail app). From then on the page keeps itself current — change a price, add a package, log a deposit, and what they're looking at updates on its own, even if they already have it open. No re-sending, no "ignore the last PDF". They see the quote and what's still owed; they never see your other clients or your internal notes. One click switches the link off again, and old links politely explain they're no longer active. Requires cloud sync (see below).
- **📝 Contracts & e-signing** — ClientFlow doesn't come with a contract of its own: the first time you open Contracts it asks for yours. Paste in the agreement you already use (it's split into editable sections automatically) or start from a blank outline of the usual headings. From then on you draw one up per gig in seconds: the client, venue, dates, fee, deposit, overtime rate and cancellation terms are merged in from records you already have. Sign it yourself — typed or drawn with a mouse or finger — then send the client a private link. They read it, sign on their phone or laptop, and the signature lands back in the app on its own, timestamped and stored against the contract. The wording is frozen the moment a contract is created, so what gets signed can never drift from what was read. Statuses track the whole thing: Draft → Out for signature → Signed, with a Void option and a withdraw-the-link button. Requires cloud sync.
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
6. **Publish the security rules** — this is the step that keeps each account's data private. If you deploy with Firebase Hosting (below) this happens automatically. Otherwise open *Firestore Database → Rules*, paste the contents of [`firestore.rules`](firestore.rules), and click **Publish**. Re-paste them whenever this file changes in the repo. **This version's app needs this version's rules**, so publish them before or together with the new code.
7. **Authorize your domain**: *Authentication → Settings → Authorized domains* → add `vermelr.github.io` (and any custom domain). Without this, Google sign-in is blocked.

Push the change and the live site now opens on a login screen. Anyone can create an account and start managing their own DJ business.

> Leave `firebase-config.js` untouched and the app simply keeps working in single-user mode, saving to the browser — handy for testing locally.

### Bring your own contract

Nobody is handed somebody else's agreement. A new account starts with no template at all, and the first contract walks you through one of two routes: **paste the contract you already use** — copied out of Word, Google Docs or a PDF, split into sections on its numbered or titled lines — or **start from a blank outline** of the standard headings with nothing written in them. Either way the wording is yours.

For a booking with several functions, `{{eventSchedule}}` writes the running order out under each date and `{{eventVenues}}` lists each venue with the dates it covers, so a three-day wedding reads the way it should instead of being squeezed into one date and time.

Where your contract names a particular client, date or fee, swap that bit for a placeholder (`{{clientName}}`, `{{eventDate}}`, `{{fee}}`, `{{depositPercent}}` and so on — the editor lists them all and drops them in at the cursor) and it fills itself in on every contract after that.

### How contract signing works

Each contract you send gets its own `contracts/{id}` document, published at a 32-character random link. The rules let anyone with the exact link read that one document — nothing can list the collection — and allow exactly **one** write without signing in: adding the client's signature, once, to a contract that is still live and unsigned. Any other change to the document is refused unless it comes from your account. Once signed, the contract can't be signed again, and withdrawing or voiding it closes the link for good.

A typed signature is stored as the name itself; a drawn one as a small image. Both are kept with the date and time they were given, on the contract record in your account. That time comes from Firebase's own clock: the rules refuse a signature unless its timestamp is the moment the server received it, so nobody can backdate or postdate a signature from their device.

That puts it on the same footing as the common e-signing services for an ordinary services agreement: the signer had the document in front of them, agreed to it explicitly, and the record shows what was signed and when. It is not a qualified/notarised signature, and it isn't legal advice — if a particular client or venue demands a specific signing standard, use whatever they require.

### How live quote links stay private

A shared quote lives in its own `shared/{id}` document, separate from your account's data. The id is 32 random hex characters, and the rules allow fetching **one** document by its exact id — nothing can list the collection to go hunting for others. Only the account that created a shared document can change it or switch it off. The published copy carries the quote, your business details and what's been paid; it deliberately leaves out the client's own email and phone number and anything else in your database, because a link can always be forwarded.

### Free tier, in plain terms

Firestore's free allowance is 50,000 reads and 20,000 writes per day, plus 1 GB stored. Each client, gig, invoice and contract is its own small document, and a save only writes the records that actually changed, so a busy DJ uses a tiny fraction of that. Hundreds of users would still fit comfortably.

### How account data is stored

```
djclientflow/{uid}                  settings
djclientflow/{uid}/clients/{id}     one document per client
djclientflow/{uid}/events/{id}      one per gig
djclientflow/{uid}/invoices/{id}    one per invoice
djclientflow/{uid}/contracts/{id}   one per contract
djclientflow/{uid}/files/{id}       uploaded invoice PDFs
djclientflow/{uid}/backups/{id}     copy kept when an account was moved to this layout
```

Firestore caps a single document at 1 MB. Earlier versions kept a whole account in one document, which a busy DJ (lots of signed contracts with drawn signatures, say) would eventually fill, at which point saving stops. Accounts in that older format are moved over automatically the first time they sign in: a full copy of the old document is saved under `backups/` first, then every record is written as its own document. The old lists stay in the account document, frozen, for a week so a tab still running an older copy of the app keeps showing data; the rules stop that older copy from writing the old format back. After a week the next sign-in clears them.

## 🔒 Hosting on Firebase (recommended)

GitHub Pages works, but every repo you publish shares one address (`yourname.github.io`), and the browser treats that whole address as one site. Anything stored by one page there, including this app's offline copy of your client list, can be read by any other page you host there. Firebase Hosting gives the app its own address, lets it send security headers GitHub Pages can't, and deploys your security rules from the repo instead of by copy and paste.

`firebase.json` sets these headers on every page:

- **Content-Security-Policy**: scripts load only from this site and the Google/Firebase hosts the app uses; no inline scripts, no plugins, and no other site can frame the app.
- **Strict-Transport-Security**: browsers only ever use HTTPS.
- **X-Frame-Options**, **X-Content-Type-Options**, **Referrer-Policy**, **Permissions-Policy**: clickjacking, MIME sniffing, leaky referrers and unused device permissions are all switched off.

### One-time setup

1. Install the tools: `npm install` (Node 20+; the app itself still has no dependencies).
2. Sign in and deploy once by hand: `npx firebase login`, then `npm run deploy`. Your site is live at `https://rnd---client-management-b21e5.web.app`.
3. **Add your own domain**: Firebase Console → Hosting → *Add custom domain* (for example `clients.yourbusiness.com`) and follow the DNS steps.
4. Add the new domain(s) to *Authentication → Settings → Authorized domains*.
5. **Automatic deploys**: in Google Cloud → IAM → Service accounts, create a key for a service account with the *Firebase Hosting Admin* and *Firebase Rules Admin* roles. Paste the JSON into the repo's *Settings → Secrets and variables → Actions* as `FIREBASE_SERVICE_ACCOUNT`. From then on every push runs the security-rules tests and, if they pass, deploys the site and rules together.
6. When the Firebase address works for you, turn off GitHub Pages (*Settings → Pages*) and remove `vermelr.github.io` from Authorized domains, so there's only one copy of the app.

### Lock down the API key

The Firebase web config is public by design, but you can stop anyone else's site from using it. In Google Cloud → *APIs & Services → Credentials*, open the "Browser key" Firebase created and set **Application restrictions → Websites** to your domains (`https://clients.yourbusiness.com/*`, `https://rnd---client-management-b21e5.web.app/*`, `https://rnd---client-management-b21e5.firebaseapp.com/*`). Also turn on *Authentication → Settings → User account management → Email enumeration protection*.

### App Check

App Check makes Firebase accept requests only from your site, which stops scripted fake sign-ups and anyone poking at your database with a copied config.

1. Firebase Console → App Check → register the web app with **reCAPTCHA Enterprise** and copy the site key.
2. Paste it into `firebase-config.js` as `window.DJCF_APPCHECK_SITE_KEY`.
3. Deploy, use the app for a few days, and check App Check's metrics show your traffic as verified.
4. Then click **Enforce** for Firestore and Authentication.

### Testing the security rules

`npm test` starts the Firestore emulator (needs Java 21) and runs `tests/firestore.rules.test.mjs`: account privacy, the old-format lock, and every way someone might try to tamper with a contract signature.

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

Plain HTML, CSS and JavaScript — zero dependencies, zero build step. Easy to customize: colors live in `styles.css` (`:root` variables), all logic in `app.js`. The client-facing pages are their own small files — `quote.html` + `quote.js` for a live quote, `contract.html` + `contract.js` for signing — and share the same stylesheet, so what a client opens looks exactly like what you print.
