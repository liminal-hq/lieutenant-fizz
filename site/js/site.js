// Builds the front page's main menu rows and release log from episodes.json.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Playable episodes get a menu row at the top (newest first) and an EPISODEn.TXT block in the log:
// the newest beside the menu, the rest below it. Coming-soon episodes get a locked row at the bottom
// of the menu and nothing in the log. Without JavaScript, or if the fetch fails, the page keeps its
// static Episode 1 row and block. All URLs are relative so the site works under any subpath.
(function () {
  var menu = document.getElementById('menu');
  var latest = document.getElementById('latest');
  var older = document.getElementById('older');
  if (!menu || !latest || !older || !window.fetch) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function row(parent, label, file, fileCls) {
    parent.appendChild(el('span', 'num'));
    parent.lastChild.setAttribute('aria-hidden', 'true');
    parent.appendChild(el('span', 'label', label));
    parent.appendChild(el('span', 'file' + (fileCls ? ' ' + fileCls : ''), file));
  }

  function playRow(ep) {
    var li = el('li', 'ep');
    var a = el('a');
    a.href = ep.path;
    row(a, 'Play Episode ' + ep.number, ep.file || 'FIZZ' + ep.number + '.EXE', 'ok');
    li.appendChild(a);
    return li;
  }

  function lockedRow(ep) {
    var li = el('li', 'ep locked');
    var div = el('div', 'row');
    row(div, 'Episode ' + ep.number + ' · coming soon', 'LOCKED', 'lock');
    li.appendChild(div);
    return li;
  }

  function block(ep, newest, isNew, menuNumber) {
    var id = ep.id + '-h';
    var s = el('section', 'episode');
    s.setAttribute('aria-labelledby', id);
    var p = el('p', 'prompt');
    p.appendChild(el('span', 'ps', 'C:\\FIZZ>'));
    p.appendChild(document.createTextNode(' type EPISODE' + ep.number + '.TXT'));
    s.appendChild(p);

    var box = el('div', 'box ' + (newest ? 'yellow' : 'grey'));
    var head = el('p', 'box-head');
    var tag = el('b', 'tag', 'EPISODE ' + ep.number + (ep.kind ? ' · ' + ep.kind : ''));
    if (isNew) {
      tag.appendChild(document.createTextNode(' '));
      tag.appendChild(el('span', 'badge', 'NEW'));
    }
    head.appendChild(tag);
    head.appendChild(el('span', 'ok', 'STATUS: PLAYABLE'));
    box.appendChild(head);
    var h = el('h2', 'ep-title', ep.title);
    h.id = id;
    box.appendChild(h);
    if (ep.blurb) box.appendChild(el('p', null, ep.blurb));
    var a = el('a', 'btn' + (newest ? '' : ' grey'));
    a.href = ep.path;
    a.textContent = (newest ? '' : '[' + menuNumber + '] ') + 'Play Episode ' + ep.number + ' ►';
    box.appendChild(a);
    if (newest) box.appendChild(el('p', null, 'Runs in your browser. No install, no modem.'));
    s.appendChild(box);
    return s;
  }

  fetch('episodes.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var eps = data.episodes || [];
      var playable = eps.filter(function (e) { return e.status === 'playable'; })
        .sort(function (a, b) { return b.number - a.number; });
      var locked = eps.filter(function (e) { return e.status !== 'playable'; })
        .sort(function (a, b) { return a.number - b.number; });
      if (!playable.length) return;

      [].slice.call(menu.querySelectorAll('li.ep')).forEach(function (li) { li.remove(); });
      var first = menu.firstChild;
      playable.forEach(function (ep) { menu.insertBefore(playRow(ep), first); });
      locked.forEach(function (ep) { menu.appendChild(lockedRow(ep)); });
      var nums = menu.querySelectorAll('.num');
      for (var i = 0; i < nums.length; i++) nums[i].textContent = '[' + (i + 1) + ']';

      latest.textContent = '';
      older.textContent = '';
      playable.forEach(function (ep, i) {
        var log = i === 0 ? latest : older;
        log.appendChild(block(ep, i === 0, i === 0 && playable.length > 1, i + 1));
      });
    })
    .catch(function () { /* keep the static Episode 1 row and block */ });
})();
