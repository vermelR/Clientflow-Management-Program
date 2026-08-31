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

<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBj92ExYd28fk4dhFZW_60N1aHzXnmLg0I",
    authDomain: "rnd---client-management-b21e5.firebaseapp.com",
    projectId: "rnd---client-management-b21e5",
    storageBucket: "rnd---client-management-b21e5.firebasestorage.app",
    messagingSenderId: "285914763098",
    appId: "1:285914763098:web:bd31ca07dbe0169363ad63",
    measurementId: "G-TJ0K83HDB2"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>

/* Optional branding for the login screen of your hosted app. */
window.DJCF_APP_INFO = {
  productName: "DJ ClientFlow",
  tagline: "Clients, gigs and invoices — all in one place.",
};
