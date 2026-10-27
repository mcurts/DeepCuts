/* Hides the pre-rendered landing page before the first paint when it isn't what this visit will
   show (ADR-0057). index.html carries the signed-out landing page as plain HTML so a first visit
   paints before the app's JavaScript arrives; every other address is served the same file, and a
   signed-in visitor gets Home at `/`. For those, `data-shell="off"` hides the landing (src/prerender.tsx)
   and the page stays blank until the app renders, as before. The key is SIGNED_IN_HINT_KEY in
   src/adapters/local/signedInHint.ts (signedInHint.test.ts checks they match). Hand-written: a
   separate same-origin file, so the CSP stays script-src 'self'. */
;(function () {
  var off = location.pathname !== '/'
  try {
    if (!off) off = JSON.parse(localStorage.getItem('deepcuts:v1:signed-in')) === true
  } catch (e) {}
  if (off) document.documentElement.setAttribute('data-shell', 'off')
})()
