/* ============================================================
   DJ ClientFlow — Firebase App Check (optional)

   App Check makes Firebase accept requests only from this site,
   so someone who copies the (public) config can't point their own
   script at your database or spam fake sign-ups.

   It switches on when firebase-config.js sets
   window.DJCF_APPCHECK_SITE_KEY to a reCAPTCHA Enterprise site key.
   Leave that empty and nothing here runs. Setup steps are in the
   README under "App Check".
   ============================================================ */

window.DJCF_startAppCheck = async function (app, firebaseVersion) {
  const siteKey = window.DJCF_APPCHECK_SITE_KEY;
  if (!siteKey) return;
  try {
    const mod = await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app-check.js`);
    mod.initializeAppCheck(app, {
      provider: new mod.ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // Without a token, requests are refused once App Check is enforced
    // in the console; until then the app keeps working as before.
    console.warn("App Check could not start", e);
  }
};
