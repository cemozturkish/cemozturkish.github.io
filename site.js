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
        })).then(function(c){ migrate(c); phoneCrop(c); aboutStyle(c); bgSaturation(c); photoBrightness(c); photoSaturation(c); textColors(c); return c; });
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
  // Builds the Work Experiences list flat: every section title, organisation row, job-title
  // row, bullet list and gallery is a direct child of ONE container that spans the whole
  // list. (Sticky rows must sit directly in a real box that spans the page: Safari won't
  // stick rows inside `display: contents` wrappers.) Returns that container.
  function buildResume(container, sections, makeGallery){
    var list = document.createElement('div');
    list.className = 'exp-list resume-flat';
    var inner = document.createElement('div');
    inner.className = 'exp-entry resume-flat-inner';   // keeps the usual entry styles
    list.appendChild(inner);
    container.appendChild(list);
    (sections || []).forEach(function(sec){
      var h = '<h2 class="exp-section-title">' + esc(sec.title || '') + '</h2>';
      (sec.entries || []).forEach(function(e){
        h += '<div class="exp-head"><span class="exp-org">' + inline(e.org) + '</span>' +
          (e.location ? '<span class="exp-location">' + inline(e.location) + '</span>' : '') + '</div>';
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
      });
      inner.insertAdjacentHTML('beforeend', h);
      if(makeGallery) makeGallery(inner, visible(sec));
    });
    return inner;
  }

  var resumeState = null;
  window.addEventListener('resize', function(){ if(resumeState) resumeState.onResize(); });
  function stackResume(root, scroller, head, pageTitle, size){
    if(resumeState) resumeState.destroy();
    var GAP = 2;
    // how big rows are once stacked (admin: Experiences → Stacked rows size); 0.5–1
    var RS = typeof size === 'number' && isFinite(size) ? Math.max(0.5, Math.min(1, size)) : 0.9;
    var push = 0;          // how far the stack has slid up once it fills the screen
    var stackLimit = 0;    // lowest the stack's bottom may go (from the top of the scroll area)
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
      function go(){ scrollTo(naturalTop(el) - (el._stickTop - pushFor(items.indexOf(el)))); }
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
    // once the stack fills the screen it slides up so row i's bottom stays on screen
    function pushFor(i){
      if(i < 0) return 0;
      var el = items[i];
      return Math.max(0, el._stickTop + el._collH - stackLimit);
    }
    function setPush(p){
      if(p === push) return;
      push = p;
      var hh = headH();
      items.forEach(function(el){
        var t = el._stickTop - push;
        el.style.top = t + 'px';
        // rows that slide up past the header are tucked away (they come back on the way up)
        el.classList.toggle('tucked', t < hh - 1);
      });
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
      stackLimit = viewH() - tail - extra - 6;
      // rows shrink to the chosen size as they stack; when the stack fills the screen it
      // slides up instead of shrinking further (see pushFor)
      root.style.setProperty('--rs', RS);
      measureCollapsed();
      // 2. give every row its place in the stack
      var top = headH();
      items.forEach(function(el){
        el.classList.remove('stuck'); el.style.height = '';
        el._flowH = el.offsetHeight;          // its normal height while reading
        el._stickTop = top;
        top += el._collH + GAP;
      });
      push = -1; setPush(0);
      // 3. enough room at the end for the last row to reach its place
      // (worked out without first removing the old spacing, so a re-measure while you're
      // at the bottom doesn't knock you off it)
      var last = items[items.length - 1];
      if(last){
        var full = scroller === window ? document.documentElement.scrollHeight : scroller.scrollHeight;
        var maxScrollWithout = full - spacer.offsetHeight - viewH();
        var needed = naturalTop(last) - (last._stickTop - pushFor(items.length - 1));
        spacer.style.height = Math.max(0, Math.ceil(needed - maxScrollWithout) + 2) + 'px';
      }
      laidOutFor = { w: window.innerWidth, h: viewH() };
      update();
    }
    function update(){
      var base = scroller === window ? 0 : scroller.getBoundingClientRect().top;
      var line = head ? head.getBoundingClientRect().bottom : base;
      // which rows have reached the stack: row i joins when it touches the bottom of the
      // stack as it was before it (that only depends on the rows above it, so it's stable)
      var scrollY = scroller === window ? window.scrollY : scroller.scrollTop;
      var joined = -1;
      for(var i = 0; i < items.length; i++){
        var nat = naturalTop(items[i]) - scrollY;
        if(nat <= items[i]._stickTop - pushFor(i - 1) + 0.5) joined = i; else break;
      }
      setPush(pushFor(joined));
      items.forEach(function(el){
        // stuck = its place in the page has reached its spot in the stack (worked out from
        // the page position, not the screen, so the stack sliding doesn't confuse it)
        var stuck = naturalTop(el) - scrollY <= el._stickTop - push + 0.5;
        if(stuck !== el.classList.contains('stuck')){
          el.classList.toggle('stuck', stuck);
          // keep its normal height in the page while it's drawn smaller, so nothing jumps
          el.style.height = stuck ? el._flowH + 'px' : '';
        }
        if(stuck && !el.classList.contains('tucked')) line = Math.max(line, base + el._stickTop - push + el._collH);
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
    // the font arriving changes how rows wrap: measure again when it does
    function onFonts(){ requestAnimationFrame(layout); }
    if(document.fonts){
      document.fonts.ready.then(function(){ if(resumeState && resumeState.layout === layout) onFonts(); });
      document.fonts.addEventListener('loadingdone', onFonts);
    }

    resumeState = {
      // phone toolbars change the height a little while scrolling; ignore that
      onResize: function(){
        if(!laidOutFor || window.innerWidth !== laidOutFor.w || Math.abs(viewH() - laidOutFor.h) > 150) layout();
      },
      layout: layout,
      destroy: function(){
        scroller.removeEventListener('scroll', onScroll);
        if(document.fonts) document.fonts.removeEventListener('loadingdone', onFonts);
        if(ro) ro.disconnect();
        if(pageTitle){ pageTitle.removeEventListener('click', toTop); pageTitle.classList.remove('stack-page-title'); }
        root.classList.remove('resume-stack');
        resumeState = null;
      }
    };
    layout();
  }

  // saturation of the gallery photos chosen in the admin (0 = black & white, 100 = original).
  // Not a CSS filter on the photos (iPhone Safari draws filtered photos in the blurred panel
  // as grey boxes): a grey layer over each gallery with the "saturation" blend mode takes the
  // colour out; its opacity sets how much.
  // Each photo then sits in its own frame (.ph): the grey layer only covers that photo, and the
  // photo itself stays solid (dimming for brightness moves to the frame), so nothing turns grey.
  var framePhotos = false;
  function photoSaturation(c){
    var v = c && c.home && c.home.photoSaturation;
    if(typeof v !== 'number' || !isFinite(v) || v === 100) return;
    framePhotos = true;
    var amount = 1 - Math.max(0, Math.min(100, v)) / 100;
    var b = c.home && typeof c.home.photoBrightness === 'number' ? Math.max(0, Math.min(100, c.home.photoBrightness)) / 100 : 1;
    var el = document.getElementById('photo-saturation') || document.head.appendChild(document.createElement('style'));
    el.id = 'photo-saturation';
    el.textContent =
      '.masonry .ph{display:block;position:relative;isolation:isolate;break-inside:avoid;margin-bottom:20px;' +
        'opacity:' + (0.9 * b).toFixed(3) + '}' +
      '.masonry .ph img{margin-bottom:0!important}' +
      '.masonry .ph img.visible{opacity:1!important}' +
      '.masonry .ph::after{content:"";position:absolute;inset:0;background:#808080;mix-blend-mode:saturation;' +
        'opacity:0;transition:opacity .65s ease;pointer-events:none}' +
      '.masonry .ph.visible::after{opacity:' + amount.toFixed(3) + '}';
  }

  // Designs and Events used to be separate pages; they're now one Photos page with a
  // section for each. Older content is converted on the fly (the admin saves it in the
  // new form the next time something is published).
  function migrate(c){
    if(!c || c.photos || !(c.designs || c.events)) return;
    var sections = [];
    [c.designs, c.events].forEach(function(p, i){
      if(!p) return;
      var sec = { title: p.title || (i ? 'EVENTS' : 'DESIGNS'), photos: (p.photos || []).slice() };
      if(p.hidden && p.hidden.length) sec.hidden = p.hidden.slice();
      sections.push(sec);
    });
    c.photos = { title:'PHOTOS', heading:'PHOTOS', sections: sections };
    delete c.designs; delete c.events;
  }

  // Text brightness per kind of text, set in the admin (Colors tab): 0 = black, 100 = white.
  // Drawn as solid greys (not see-through white) so nothing behind shows through letters.
  // (colors.stacked holds separate values for rows once they've locked into a stack)
  var COLOR_TARGETS = {
    names:     ['.exp-org', '.edu-school'],
    roles:     ['.exp-title', '.edu-degree'],
    locations: ['.exp-location', '.edu-location'],
    dates:     ['.exp-date', '.edu-date'],
    text:      ['.exp-entry ul li', '.exp-list ul li', '.about-me-scroll', '.about-me-scroll p'],
    sections:  ['.exp-section-title', '.about-section-title'],
    titles:    ['.panel-title h1', '.page-head h1']
  };
  var STACKED_TARGETS = {
    names:     ['.stack-item.stuck .exp-org'],
    roles:     ['.stack-item.stuck .exp-title'],
    locations: ['.stack-item.stuck .exp-location'],
    dates:     ['.stack-item.stuck .exp-date'],
    sections:  ['.exp-section-title.stack-item.stuck']
  };
  function greyRule(sels, v){
    var g = Math.round(Math.max(0, Math.min(100, v)) * 2.55);
    // :not(#_) lifts these above the page's own rules
    return sels.map(function(sel){ return 'html body ' + sel + ':not(#_)'; }).join(',') +
      '{color:rgb(' + g + ',' + g + ',' + g + ')!important}';
  }
  function textColors(c){
    var cols = c && c.colors;
    if(!cols) return;
    function num(v){ return typeof v === 'number' && isFinite(v); }
    var css = '';
    Object.keys(COLOR_TARGETS).forEach(function(k){
      var v = cols[k];
      // older setting: one value for locations and dates together
      if(!num(v) && (k === 'locations' || k === 'dates')) v = cols.meta;
      if(num(v)) css += greyRule(COLOR_TARGETS[k], v);
    });
    var st = cols.stacked || {};
    Object.keys(STACKED_TARGETS).forEach(function(k){
      if(num(st[k])) css += greyRule(STACKED_TARGETS[k], st[k]);
    });
    // fade between the two when a row locks into the stack
    css += '.resume-stack .stack-item > span{transition:color .3s ease}';
    if(!css) return;
    var el = document.getElementById('text-colors') || document.head.appendChild(document.createElement('style'));
    el.id = 'text-colors';
    el.textContent = css;
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
          if(e.target.parentNode.classList.contains('ph')) e.target.parentNode.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold:.1, root: root || null });
    (photos || []).forEach(function(p, i){
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = src(p);
      img.style.transitionDelay = (i % 8) * 60 + 'ms';
      var holder = img;
      if(framePhotos){                       // see photoSaturation
        holder = document.createElement('span');
        holder.className = 'ph';
        holder.appendChild(img);
      }
      img.onerror = function(){ holder.remove(); };
      el.appendChild(holder);
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
    migrate: migrate,
    stackResume: stackResume,
    buildResume: buildResume,
    stopResume: function(){ if(resumeState) resumeState.destroy(); }
  };
})();
