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

/* Optional branding for the login screen of your hosted app. */
window.DJCF_APP_INFO = {
  productName: "DJ ClientFlow",
  tagline: "Clients, gigs and invoices — all in one place.",
};
