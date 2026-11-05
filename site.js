/* Shared renderer: every page draws its wording and photos from content.json,
   which is the file the /admin portal edits. */
(function(){
  var PREVIEW_KEY = 'cms-preview';
  var previewMap = {};

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // plain text with **bold** and *italic*
  function inline(s){
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');
  }

  function src(path){
    if(!path) return '';
    if(previewMap[path]) return previewMap[path];
    if(/^(https?:|blob:|data:|\/)/.test(path)) return path;
    return './' + path;
  }

  // ?preview=1 shows the unpublished draft the admin portal left in this browser
  function readPreview(){
    if(!/[?&]preview=1\b/.test(location.search)) return null;
    try{
      var d = JSON.parse(localStorage.getItem(PREVIEW_KEY));
      if(d && d.content){
        previewMap = d.images || {};
        var tag = document.createElement('div');
        tag.textContent = 'PREVIEW — not published';
        tag.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:10000;' +
          'font:12px/1 system-ui,sans-serif;letter-spacing:.08em;padding:8px 12px;border-radius:999px;' +
          'background:#f5c518;color:#111;pointer-events:none;';
        (document.body ? Promise.resolve() : new Promise(function(r){ document.addEventListener('DOMContentLoaded', r); }))
          .then(function(){ document.body.appendChild(tag); });
        // keep links inside the preview
        document.addEventListener('click', function(e){
          var a = e.target.closest && e.target.closest('a[href]');
          if(!a) return;
          var h = a.getAttribute('href');
          if(/^\.\/[\w-]+\.html$/.test(h)) a.setAttribute('href', h + '?preview=1');
        }, true);
        return d.content;
      }
    }catch(e){}
    return null;
  }

  var contentPromise = null;
  function load(){
    if(contentPromise) return contentPromise;
    var draft = readPreview();
    contentPromise = draft ? Promise.resolve(draft)
      : fetch('./content.json', { cache:'no-cache' }).then(function(r){
          if(!r.ok) throw new Error('content.json ' + r.status);
          return r.json();
        });
    return contentPromise;
  }

  function educationHTML(list){
    return (list || []).map(function(e){
      var h = '<div class="edu-entry"><div class="edu-row">' +
        '<span class="edu-school">' + inline(e.school) + '</span>' +
        (e.location ? '<span class="edu-location">' + inline(e.location) + '</span>' : '') +
        '</div>';
      if(e.degree || e.date){
        h += '<div class="edu-row">' +
          '<span class="edu-degree">' + inline(e.degree) + '</span>' +
          (e.date ? '<span class="edu-date">' + inline(e.date) + '</span>' : '') +
          '</div>';
      }
      return h + '</div>';
    }).join('');
  }

  // free text: a blank line starts a new paragraph, a single line break stays a line break
  function paragraphsHTML(text){
    return String(text || '').split(/\n\s*\n/).map(function(p){ return p.trim(); })
      .filter(Boolean)
      .map(function(p){ return '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function entriesHTML(list){
    if(!list || !list.length) return '';
    return '<div class="exp-list">' + list.map(function(e){
      var h = '<div class="exp-entry"><div class="exp-head">' +
        '<span class="exp-org">' + inline(e.org) + '</span>' +
        (e.location ? '<span class="exp-location">' + inline(e.location) + '</span>' : '') +
        '</div>';
      (e.roles || []).forEach(function(r){
        if(r.title || r.date){
          h += '<div class="exp-role"><span class="exp-title">' + inline(r.title) + '</span>' +
            (r.date ? '<span class="exp-date">' + inline(r.date) + '</span>' : '') + '</div>';
        }
        var bullets = (r.bullets || []).filter(function(b){ return String(b).trim(); });
        if(bullets.length){
          h += '<ul>' + bullets.map(function(b){ return '<li>' + inline(b) + '</li>'; }).join('') + '</ul>';
        }
      });
      return h + '</div>';
    }).join('') + '</div>';
  }

  // fills a .masonry element with photos that fade in as they scroll into view
  function gallery(el, photos, root){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold:.1, root: root || null });
    (photos || []).forEach(function(p, i){
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = src(p);
      img.onerror = function(){ img.remove(); };
      img.style.transitionDelay = (i % 8) * 60 + 'ms';
      el.appendChild(img);
      io.observe(img);
    });
  }

  window.Site = {
    load: load,
    esc: esc,
    inline: inline,
    src: src,
    educationHTML: educationHTML,
    paragraphsHTML: paragraphsHTML,
    entriesHTML: entriesHTML,
    gallery: gallery
  };
})();
