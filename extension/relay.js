/* Mundo aislado: recoge los avisos de inject.js y suma lo bloqueado al contador del icono. */
(function () {
  var last = 0;
  window.addEventListener('__lb_msg', function (e) {
    var msg;
    try { msg = JSON.parse(e.detail); } catch (err) { return; }
    if (!msg || msg.type !== 'stats') return;
    var n = Number(msg.data) || 0;
    if (n <= last) return;
    var delta = n - last;
    last = n;
    try { chrome.runtime.sendMessage({ type: 'blocked', delta: delta }); } catch (err) {}
  });
})();
