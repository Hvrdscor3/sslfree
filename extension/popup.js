(async function () {
  const $ = (id) => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let site = '';
  try {
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) site = u.hostname.replace(/^www\./, '');
  } catch (e) {}

  if (!site) {
    $('site').textContent = 'Página del navegador';
    $('state').textContent = 'No se puede filtrar';
    $('toggle').disabled = true;
    $('video').disabled = true;
    return;
  }
  $('site').textContent = site;
  const { enabled } = await chrome.runtime.sendMessage({ type: 'getSite', site });
  const show = (on) => { $('toggle').checked = on; $('state').textContent = on ? 'Activado en este sitio' : 'Desactivado en este sitio'; };
  show(enabled);

  $('toggle').addEventListener('change', async (e) => {
    show(e.target.checked);
    await chrome.runtime.sendMessage({ type: 'setSite', site, enabled: e.target.checked });
    $('hint').hidden = false;
    chrome.tabs.reload(tab.id);
  });

  $('video').addEventListener('click', async () => {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => window.__lb && window.__lb.video(),
    }).catch(() => {});
    window.close();
  });
})();
