// Applies the saved theme before the page draws, so it does not flash.
// A separate file because the Content-Security-Policy does not allow inline scripts.
try {
  var t = localStorage.getItem("theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
