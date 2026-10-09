/* Installable app + offline launch. Registration is relative so it
   works from a project sub-path like /Clientflow-Management-Program/.
   Kept in its own file (not inline in index.html) so the site's
   Content Security Policy can refuse every inline script. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err));
  });
}
