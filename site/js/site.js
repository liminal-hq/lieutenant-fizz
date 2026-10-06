// Renders episode cards from episodes.json. All URLs are relative so the site works under any subpath.
(function () {
  var grid = document.getElementById('grid');
  if (!grid || !window.fetch) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function card(ep) {
    var playable = ep.status === 'playable';
    var li = el('li', 'card ' + (playable ? 'playable' : 'soon'));
    if (ep.thumbnail) {
      var img = el('img', 'thumb');
      img.src = ep.thumbnail;
      img.alt = ep.thumbnailAlt || '';
      img.width = 800; img.height = 468; img.loading = 'lazy';
      li.appendChild(img);
    }
    var body = el('div', 'card-body');
    body.appendChild(el('span', 'badge ' + (playable ? 'ok' : 'wait'), playable ? 'Playable' : 'Coming soon'));
    body.appendChild(el('p', 'ep-no', (ep.series ? ep.series + ' — ' : '') + 'Episode ' + ep.number));
    var h = el('h3');
    if (playable) {
      var a = el('a', 'card-link', ep.title);
      a.href = ep.path;
      h.appendChild(a);
    } else {
      h.textContent = ep.title;
    }
    body.appendChild(h);
    body.appendChild(el('p', 'tag', ep.tagline));
    if (playable) body.appendChild(el('span', 'cta', 'Play now →'));
    li.appendChild(body);
    return li;
  }

  fetch('episodes.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var eps = (data.episodes || []).slice().sort(function (a, b) { return a.number - b.number; });
      grid.textContent = '';
      eps.forEach(function (ep) { grid.appendChild(card(ep)); });
      var more = el('li', 'card more');
      var b = el('div', 'card-body');
      b.appendChild(el('h3', null, 'More episodes soon'));
      b.appendChild(el('p', 'tag', 'Zargoth is a big planet. Watch the repository for news.'));
      more.appendChild(b);
      grid.appendChild(more);
    })
    .catch(function () { /* keep the no-JS fallback link */ });
})();
