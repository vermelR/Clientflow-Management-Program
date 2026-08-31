/* ============================================================
   DJ ClientFlow — hosting configuration
   ------------------------------------------------------------
   Fill this in ONCE to run the app as a real product where each
   DJ signs up with their own account and gets their own private
   data. Everyone who visits your site shares this config; their
   accounts and records stay separate (enforced by Firestore
   security rules — see firestore.rules and the README).

   1. Create a free project at https://console.firebase.google.com
   2. Add a Web app; copy the firebaseConfig values it shows you
   3. Paste them below and deploy
   4. Enable Email/Password + Google sign-in, create a Firestore
      database, and publish the rules from firestore.rules

   Leave the placeholders as they are and the app simply runs in
   single-user mode, saving to the browser it's opened in.

   Note: these values are NOT secrets — Firebase web config is meant
   to ship in the browser. Your data is protected by the security
   rules, not by hiding these keys.
   ============================================================ */

window.DJCF_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/* Optional branding for the login screen of your hosted app. */
window.DJCF_APP_INFO = {
  productName: "DJ ClientFlow",
  tagline: "Clients, gigs and invoices — all in one place.",
};
