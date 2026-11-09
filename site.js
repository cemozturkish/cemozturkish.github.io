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
    contentPromise = (draft ? Promise.resolve(draft)
      : fetch('./content.json', { cache:'no-cache' }).then(function(r){
          if(!r.ok) throw new Error('content.json ' + r.status);
          return r.json();
        })).then(function(c){ phoneCrop(c); aboutStyle(c); bgSaturation(c); photoBrightness(c); return c; });
    return contentPromise;
  }

  // On portrait screens (phones) the wide background photo only shows a slice.
  // content.home.mobileFocusX (0 = left edge, 100 = right edge) picks which slice.
  // The home page's head outline + intro spotlight SVGs are re-cropped to match.
  var IMG_W = 1366.09, IMG_H = 768.16;
  function phoneCrop(c){
    var x = c && c.home && typeof c.home.mobileFocusX === 'number' ? c.home.mobileFocusX : 50;
    x = Math.max(0, Math.min(100, x));
    var mq = window.matchMedia('(orientation: portrait)');
    function apply(){
      var on = mq.matches && x !== 50;
      document.querySelectorAll('.bg').forEach(function(el){
        el.style.backgroundPosition = on ? x + '% 50%' : '';
      });
      document.querySelectorAll('svg.contact-zone, svg.intro-spotlight').forEach(function(svg){
        if(!on){
          svg.setAttribute('viewBox', '0 0 ' + IMG_W + ' ' + IMG_H);
          svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
          return;
        }
        // same box as .bg (inset:-20px)
        var W = window.innerWidth + 40, H = window.innerHeight + 40;
        var s = Math.max(W / IMG_W, H / IMG_H);
        var vw = W / s, vh = H / s;
        var vx = (IMG_W - vw) * x / 100, vy = (IMG_H - vh) / 2;
        svg.setAttribute('viewBox', [vx, vy, vw, vh].join(' '));
        svg.setAttribute('preserveAspectRatio', 'none');
      });
    }
    apply();
    window.addEventListener('resize', apply);
  }

  // About text size + spacing chosen in the admin (content.about.style.phone / .desktop).
  // Only the values that were actually set override the page's built-in styles.
  function aboutStyle(c){
    var st = c && c.about && c.about.style;
    if(!st) return;
    function num(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
    function rules(o){
      if(!o) return '';
      var r = '', t = num(o.textSize), g = num(o.gap), el = num(o.eduLineHeight),
          tl = num(o.textLineHeight), pg = num(o.paraGap);
      if(t !== null){
        r += '.about-edu .edu-degree,.about-me-scroll{font-size:' + t + 'px!important}' +
             '.about-edu .edu-school{font-size:' + Math.round(t * 1.17 * 10) / 10 + 'px!important}' +
             '.about-edu .edu-location,.about-edu .edu-date{font-size:' + Math.round(t * 0.9 * 10) / 10 + 'px!important}';
      }
      if(g !== null) r += '.about-edu .edu-entry{margin-bottom:' + g + 'px!important}';
      if(el !== null) r += '.about-edu .edu-entry{line-height:' + el + '!important}';
      if(tl !== null) r += '.about-me-scroll{line-height:' + tl + '!important}';
      if(pg !== null) r += '.about-me-scroll p{margin-bottom:' + pg + 'px!important}';
      return r;
    }
    var css = '';
    var d = rules(st.desktop), p = rules(st.phone);
    if(d) css += '@media (min-width:601px){' + d + '}';
    if(p) css += '@media (max-width:600px){' + p + '}';
    if(!css) return;
    var el = document.getElementById('about-style') || document.head.appendChild(document.createElement('style'));
    el.id = 'about-style';
    el.textContent = css;
  }

  // background photo saturation chosen in the admin (0 = black & white, 100 = original)
  function bgSaturation(c){
    var v = c && c.home && c.home.saturation;
    if(typeof v !== 'number' || !isFinite(v) || v === 100) return;
    v = Math.max(0, Math.min(100, v));
    document.querySelectorAll('.bg').forEach(function(el){ el.style.filter = 'saturate(' + v / 100 + ')'; });
  }

  // brightness of the gallery photos chosen in the admin (0 = black, 100 = original).
  // Done by fading the photos into the near-black page behind them rather than with a
  // CSS brightness() filter: iPhone Safari paints filtered photos inside the blurred
  // slide-in panel as flat grey boxes.
  function photoBrightness(c){
    var v = c && c.home && c.home.photoBrightness;
    if(typeof v !== 'number' || !isFinite(v) || v === 100) return;
    var b = Math.max(0, Math.min(100, v)) / 100;
    var el = document.getElementById('photo-brightness') || document.head.appendChild(document.createElement('style'));
    el.id = 'photo-brightness';
    // 0.9 is the photos' normal resting opacity
    el.textContent = '.masonry img.visible{opacity:' + Math.round(0.9 * b * 1000) / 1000 + '!important}' +
      '@media(prefers-reduced-motion:reduce){.masonry img{opacity:' + Math.round(0.9 * b * 1000) / 1000 + '!important}}';
  }

  // Collapsing resume (Work Experiences). Every section title, organisation row (name +
  // location) and job-title row (title + dates) sticks once it reaches the stack and stays
  // there for the rest of the page, piling up in page order; only the details (bullets,
  // photos) scroll away, cut off at the bottom edge of the stack. Scrolled to the end, the
  // screen shows the whole resume collapsed. Rows keep their normal size while you read and
  // shrink as they lock into the stack (just enough for the full stack to fit on one
  // screen); space is added at the end so the last row can reach its place. Tapping any
  // stacked row (or the page title) scrolls back to it.
  var resumeState = null;
  window.addEventListener('resize', function(){ if(resumeState) resumeState.onResize(); });
  function stackResume(root, scroller, head, pageTitle){
    if(resumeState) resumeState.destroy();
    var GAP = 2;
    root.classList.add('resume-stack');
    // empty section titles take no space
    root.querySelectorAll('h2.exp-section-title').forEach(function(t){ if(!t.textContent.trim()) t.style.display = 'none'; });
    var items = [].filter.call(root.querySelectorAll('h2.exp-section-title, .exp-head, .exp-role'), function(el){
      return el.style.display !== 'none';
    });
    var clipped = [].slice.call(root.querySelectorAll('ul, .masonry'));
    var spacer = document.createElement('div');
    spacer.className = 'stack-spacer';
    root.appendChild(spacer);

    function viewH(){ return scroller === window ? window.innerHeight : scroller.clientHeight; }
    function headH(){ return head ? head.offsetHeight : 0; }
    function docTop(el){
      var r = el.getBoundingClientRect();
      if(scroller === window) return r.top + window.scrollY;
      return r.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    }
    function naturalTop(el){ return docTop(el._marker) + el._marker.offsetHeight; }
    function scrollTo(y){ scroller.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }

    items.forEach(function(el){
      // remembers where the row sits in the page (sticky rows move, this doesn't)
      var marker = document.createElement('div');
      marker.className = 'stack-anchor';
      el.parentNode.insertBefore(marker, el);
      // the row's space above moves into the marker, so the marker's bottom is exactly
      // where the row starts (margins would otherwise collapse unpredictably)
      marker.style.height = getComputedStyle(el).marginTop;
      el.style.setProperty('margin-top', '0px', 'important');
      el._marker = marker;
      el.classList.add('stack-item');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      function go(){ scrollTo(naturalTop(el) - el._stickTop); }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    });
    function toTop(){ scrollTo(0); }
    if(pageTitle){ pageTitle.classList.add('stack-page-title'); pageTitle.addEventListener('click', toTop); }

    // height each row takes once collapsed into the stack, at the current --rs
    function measureCollapsed(){
      root.classList.add('measure-collapsed');
      var rs = parseFloat(root.style.getPropertyValue('--rs')) || 1;
      items.forEach(function(el){ el._collH = el.offsetHeight * rs; });
      root.classList.remove('measure-collapsed');
    }
    function stackHeight(){
      measureCollapsed();
      return items.reduce(function(sum, el){ return sum + el._collH + GAP; }, 0);
    }
    var laidOutFor = null;
    function layout(){
      // 1. scale rows so the whole stack fits on one screen
      // (binary search for the largest size that fits: names wrap less as they shrink,
      // so the height doesn't shrink in proportion)
      // Rows keep their full height in the page while drawn smaller, and a sticky row can't
      // go past the end of its container; so leave room below the stack for that (the
      // rows' full height beyond their shrunk height) and for whatever follows the list.
      items.forEach(function(el){ el.classList.remove('stuck'); el.style.height = ''; });
      var full0 = scroller === window ? document.documentElement.scrollHeight : scroller.scrollHeight;
      var rootEnd = docTop(spacer);                       // where the list ends
      var tail = Math.max(0, full0 - rootEnd - spacer.offsetHeight);
      var extra = items.reduce(function(m, el){ return Math.max(m, el.offsetHeight); }, 0);
      var avail = viewH() - headH() - tail - extra - 6;
      root.style.setProperty('--rs', 1);
      if(stackHeight() > avail){
        var lo = 0.45, hi = 1;
        for(var i = 0; i < 8; i++){
          var mid = (lo + hi) / 2;
          root.style.setProperty('--rs', mid.toFixed(4));
          if(stackHeight() <= avail) lo = mid; else hi = mid;
        }
        root.style.setProperty('--rs', lo.toFixed(4));
      }
      measureCollapsed();
      // 2. give every row its place in the stack
      var top = headH();
      items.forEach(function(el){
        el.classList.remove('stuck'); el.style.height = '';
        el._flowH = el.offsetHeight;          // its normal height while reading
        el.style.top = top + 'px';
        el._stickTop = top;
        top += el._collH + GAP;
      });
      // 3. enough room at the end for the last row to reach its place
      // (worked out without first removing the old spacing, so a re-measure while you're
      // at the bottom doesn't knock you off it)
      var last = items[items.length - 1];
      if(last){
        var full = scroller === window ? document.documentElement.scrollHeight : scroller.scrollHeight;
        var maxScrollWithout = full - spacer.offsetHeight - viewH();
        var needed = naturalTop(last) - last._stickTop;
        spacer.style.height = Math.max(0, Math.ceil(needed - maxScrollWithout) + 2) + 'px';
      }
      laidOutFor = { w: window.innerWidth, h: viewH() };
      update();
    }
    function update(){
      var base = scroller === window ? 0 : scroller.getBoundingClientRect().top;
      var line = head ? head.getBoundingClientRect().bottom : base;
      items.forEach(function(el){
        var r = el.getBoundingClientRect();
        var stuck = r.top - base <= el._stickTop + 0.5;
        if(stuck !== el.classList.contains('stuck')){
          el.classList.toggle('stuck', stuck);
          // keep its normal height in the page while it's drawn smaller, so nothing jumps
          el.style.height = stuck ? el._flowH + 'px' : '';
        }
        if(stuck) line = Math.max(line, base + el._stickTop + el._collH);
      });
      line += GAP;
      // details are cut off at the bottom edge of the stack
      clipped.forEach(function(el){
        var cut = line - el.getBoundingClientRect().top;
        var v = cut > 0 ? 'inset(' + Math.round(cut) + 'px -40px -40px -40px)' : '';
        el.style.clipPath = v; el.style.webkitClipPath = v;
      });
    }
    var ticking = false;
    function onScroll(){
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(function(){ ticking = false; update(); });
    }
    scroller.addEventListener('scroll', onScroll, { passive:true });
    // photos loading change the page length: redo the layout when they do
    var ro = window.ResizeObserver ? new ResizeObserver(function(){ requestAnimationFrame(layout); }) : null;
    if(ro) root.querySelectorAll('.masonry').forEach(function(m){ ro.observe(m); });

    resumeState = {
      // phone toolbars change the height a little while scrolling; ignore that
      onResize: function(){
        if(!laidOutFor || window.innerWidth !== laidOutFor.w || Math.abs(viewH() - laidOutFor.h) > 150) layout();
      },
      destroy: function(){
        scroller.removeEventListener('scroll', onScroll);
        if(ro) ro.disconnect();
        if(pageTitle){ pageTitle.removeEventListener('click', toTop); pageTitle.classList.remove('stack-page-title'); }
        root.classList.remove('resume-stack');
        resumeState = null;
      }
    };
    layout();
  }

  // photos the admin marked as hidden stay in the list but aren't shown
  function visible(owner){
    var hidden = (owner && owner.hidden) || [];
    return ((owner && owner.photos) || []).filter(function(p){ return hidden.indexOf(p) < 0; });
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
      // optional second line under the program / degree
      if(e.degree2){
        h += '<div class="edu-row"><span class="edu-degree" style="margin-top:0">' + inline(e.degree2) + '</span></div>';
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

  // page heading shown at the top of a page (separate from the menu button label);
  // an empty heading hides it
  function heading(p, fallback){
    if(p && typeof p.heading === 'string') return p.heading;
    return fallback !== undefined ? fallback : (p && p.title) || '';
  }

  // text alignment chosen in the admin (left / center / right / justify)
  function alignStyle(v){
    if(['left','center','right','justify'].indexOf(v) < 0) return '';
    return ' style="text-align:' + v + (v === 'justify' ? ';hyphens:auto;-webkit-hyphens:auto' : '') + '"';
  }

  // About: fixed education block on top, scrollable "about me" text below
  function aboutHTML(a){
    a = a || {};
    var eduTitle = typeof a.educationTitle === 'string' ? a.educationTitle : 'EDUCATION';
    var textTitle = typeof a.textTitle === 'string' ? a.textTitle : 'ABOUT ME';
    var text = paragraphsHTML(a.text);
    var h = '<div class="about-edu">' +
      (eduTitle ? '<h2 class="about-section-title">' + inline(eduTitle) + '</h2>' : '') +
      educationHTML(a.education) + '</div>';
    if(text){
      h += '<div class="about-me">' +
        (textTitle ? '<h2 class="about-section-title">' + inline(textTitle) + '</h2>' : '') +
        '<div class="about-me-scroll"' + alignStyle(a.textAlign) + '>' + text + '</div></div>';
    }
    return h;
  }

  function entriesHTML(list){
    if(!list || !list.length) return '';
    return '<div class="exp-list">' + list.map(function(e){
      var h = '<div class="exp-entry"><div class="exp-head">' +
        '<span class="exp-org">' + inline(e.org) + '</span>' +
        (e.location ? '<span class="exp-location">' + inline(e.location) + '</span>' : '') +
        '</div>';
      (e.roles || []).forEach(function(r){
        h += '<div class="exp-role-group">';
        if(r.title || r.date){
          h += '<div class="exp-role"><span class="exp-title">' + inline(r.title) + '</span>' +
            (r.date ? '<span class="exp-date">' + inline(r.date) + '</span>' : '') + '</div>';
        }
        var bullets = (r.bullets || []).filter(function(b){ return String(b).trim(); });
        if(bullets.length){
          h += '<ul>' + bullets.map(function(b){ return '<li>' + inline(b) + '</li>'; }).join('') + '</ul>';
        }
        h += '</div>';
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
    heading: heading,
    aboutHTML: aboutHTML,
    entriesHTML: entriesHTML,
    gallery: gallery,
    visible: visible,
    stackResume: stackResume,
    stopResume: function(){ if(resumeState) resumeState.destroy(); }
  };
})();
