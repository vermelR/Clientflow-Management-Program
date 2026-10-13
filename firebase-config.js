/* ============================================================
   DJ ClientFlow — hosting configuration
   ------------------------------------------------------------
   These values connect the app to your Firebase project, so every
   DJ who visits gets their own account and their own private data.

   Paste ONLY the values from the Firebase console's firebaseConfig
   block into the object below. Do not paste the <script> tags or the
   initializeApp() lines the console shows you — the app already does
   that part itself, and stray HTML here stops this file from loading.

   Note: these values are NOT secrets — Firebase web config is meant
   to ship in the browser. Your data is protected by the security
   rules in firestore.rules, not by hiding these keys.
   ============================================================ */

window.DJCF_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBj92ExYd28fk4dhFZW_60N1aHzXnmLg0I",
  authDomain: "rnd---client-management-b21e5.firebaseapp.com",
  projectId: "rnd---client-management-b21e5",
  storageBucket: "rnd---client-management-b21e5.firebasestorage.app",
  messagingSenderId: "285914763098",
  appId: "1:285914763098:web:bd31ca07dbe0169363ad63",
  measurementId: "G-TJ0K83HDB2",
};

/* Your project's OAuth web client id. Fill this in and Gmail sending
   and the calendar stop asking permission every hour: the app renews
   the hour-long Google token quietly in the background instead of
   popping a window. Leave it as-is and everything still works — Google
   just asks again each time the token runs out.

   Find it in Google Cloud Console → APIs & Services → Credentials →
   OAuth 2.0 Client IDs → "Web client (auto created by Google Service)".
   Copy the Client ID; it ends in .apps.googleusercontent.com. While
   you're there, add your site's address under Authorised JavaScript
   origins, or the browser will refuse the silent renewal.

   Like the keys above, this is not a secret. */
window.DJCF_GOOGLE_CLIENT_ID = "1234567890-abc123.apps.googleusercontent.com";

/* Optional branding for the login screen of your hosted app. */
window.DJCF_APP_INFO = {
  productName: "DJ ClientFlow",
  tagline: "Clients, gigs and invoices — all in one place.",
};
