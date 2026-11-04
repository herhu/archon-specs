// ─────────────────────────────────────────────────────────────────────────────
// Archon Specs — Site Analytics
//
// HOW TO ACTIVATE:
//
//  1. GOOGLE ANALYTICS 4
//     → Go to https://analytics.google.com/ → Admin → Create Property
//     → Copy your Measurement ID (looks like G-XXXXXXXXXX)
//     → Replace 'GA_MEASUREMENT_ID' below with your real ID
//
//  2. MICROSOFT CLARITY  (free heatmaps + session recordings)
//     → Go to https://clarity.microsoft.com/ → New Project
//     → Copy your Project ID (looks like abcde12345)
//     → Replace 'CLARITY_PROJECT_ID' below with your real ID
//
// ─────────────────────────────────────────────────────────────────────────────

const GA_ID = "G-9FCYB5EPQ8";
const CLARITY_ID = "x06mb9hqil";

// ── Google Analytics 4 ───────────────────────────────────────────────────────
if (GA_ID && !GA_ID.startsWith("GA_")) {
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", GA_ID);
}

// ── Microsoft Clarity ────────────────────────────────────────────────────────
if (CLARITY_ID && !CLARITY_ID.startsWith("CLARITY_")) {
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_ID);
}
