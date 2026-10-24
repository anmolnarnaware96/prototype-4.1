/* Veritas Chambers — single classic script (works from file:// and http://). */
(function () {
  'use strict';
  var COMPACT_AT = .04, DRIFT_TAU = .32, DRIFT = [8, 5], GRAIN_FPS = 6, PHONE = 700, MIN_SEEK = 1 / 40, WATCHDOG = 4000;
  var clamp = function (n, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, n)); };
  var smooth = function (t) { t = clamp(t); return t * t * (3 - 2 * t); };
  var force = /[?&]motion/.test(location.search);
  var mq = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return mq.matches && !force; };
  if (force) document.documentElement.classList.add('force-motion');

  /* one seek in flight, one pending */
  function seeker(video, onFail) {
    var inflight = false, pending = null, shown = 0, timer = 0, dead = false;
    var usable = function () { return Math.max(0, (video.duration || 0) - 1 / 24); };
    function go(t) { inflight = true; clearTimeout(timer); timer = setTimeout(function () { dead = true; onFail(); }, WATCHDOG); video.currentTime = t; }
    video.addEventListener('seeked', function () {
      clearTimeout(timer); shown = video.currentTime; inflight = false;
      if (pending !== null && Math.abs(pending - shown) >= MIN_SEEK) { var t = pending; pending = null; go(t); } else pending = null;
    });
    return { request: function (f) {
      if (dead || !video.duration) return;
      var t = clamp(f) * usable();
      if (Math.abs(t - shown) < MIN_SEEK && !inflight) return;
      if (inflight) pending = t; else go(t);
    } };
  }

  var ctrl = null;
  function start() {
    if (ctrl || reduced()) return;
    var root = document.documentElement; root.classList.add('js');
    var stageEl = document.querySelector('.stage'), grain = stageEl.querySelector('.grain');
    var scenes = [].slice.call(stageEl.querySelectorAll('.scene'));
    var panels = [].slice.call(document.querySelectorAll('.panel'));
    var bar = document.getElementById('bar');
    var N = scenes.length, vh = innerHeight, geo = [];

    var seekers = scenes.map(function (s) {
      var v = s.querySelector('video'); v.muted = true; v.src = v.dataset.src; v.load();
      v.addEventListener('loadeddata', function () { s.classList.add('live'); }, { once: true });
      v.addEventListener('error', function () { s.classList.remove('live'); });
      return seeker(v, function () { s.classList.remove('live'); });
    });
    function measure() { vh = innerHeight; geo = panels.map(function (p) { return { top: p.offsetTop, h: Math.max(1, p.offsetHeight - vh) }; }); }
    var fadeIn = function (i, y) { return i === 0 ? 1 : smooth((y - (geo[i].top - vh)) / vh); };
    var kids = panels.map(function (p) { return [].slice.call(p.querySelector('.sticky').children); });

    function updateStage(y) {
      panels.forEach(function (p, i) {
        var g = geo[i]; if (!g) return;
        var local = clamp((y - g.top) / g.h);
        seekers[i].request(smooth(local));
        scenes[i].style.opacity = (i < N - 1 && fadeIn(i + 1, y) >= 1) ? 0 : fadeIn(i, y);
        // scroll-driven text: staggered reveal on the way in, lift + blur on the way out
        var enter = clamp((y - (g.top - vh * .6)) / (vh * .6));
        var exit = i < N - 1 ? smooth((local - .8) / .2) : 0;
        kids[i].forEach(function (el, j) {
          var e = smooth(enter * 1.7 - j * .3), v = e * (1 - exit);
          el.style.opacity = v.toFixed(3);
          el.style.transform = 'translate3d(0,' + (((1 - e) * 36) - exit * 28).toFixed(1) + 'px,0)';
          el.style.filter = v < .99 ? 'blur(' + ((1 - v) * 8).toFixed(1) + 'px)' : 'none';
        });
      });
    }

    /* header: full -> compact */
    var compact = null, firstHdr = true;
    function measureBar() {
      var was = bar.classList.contains('compact');
      bar.classList.add('measuring', 'compact'); bar.style.width = 'max-content';
      var w = bar.getBoundingClientRect().width;
      bar.classList.toggle('compact', was); bar.style.width = ''; void bar.offsetWidth; bar.classList.remove('measuring');
      return w;
    }
    function setBar(c, instant) {
      if (c === compact) return; compact = c;
      if (instant) bar.classList.add('measuring');
      var w = c ? measureBar() : null;
      bar.classList.toggle('compact', c); bar.style.width = c ? w + 'px' : '';
      if (instant) { void bar.offsetWidth; bar.classList.remove('measuring'); }
    }
    var wantCompact = function (y) { return innerWidth <= PHONE || y > innerHeight * COMPACT_AT; };

    /* pointer drift (fine pointers only) */
    var fine = matchMedia('(pointer:fine) and (hover:hover)').matches, tg = { x: 0, y: 0 }, cu = { x: 0, y: 0 }, gacc = 0;
    var onMove = function (e) { if (e.pointerType === 'touch') return; tg.x = e.clientX / innerWidth * 2 - 1; tg.y = e.clientY / innerHeight * 2 - 1; };
    var onLeave = function () { tg.x = 0; tg.y = 0; };
    if (fine) { addEventListener('pointermove', onMove, { passive: true }); root.addEventListener('pointerleave', onLeave); }

    var last = performance.now(), raf = 0, resizeT = 0;
    function tick(now) {   // the one and only ticker
      var dt = Math.min(.25, (now - last) / 1000); last = now; var y = scrollY;
      updateStage(y);
      setBar(wantCompact(y), firstHdr); firstHdr = false;
      var hero = panels[1] ? y < panels[1].offsetTop : true;
      if (fine) {
        var k = 1 - Math.exp(-dt / DRIFT_TAU); cu.x += (tg.x - cu.x) * k; cu.y += (tg.y - cu.y) * k;
        stageEl.style.setProperty('--dx', (cu.x * DRIFT[0]).toFixed(2) + 'px'); stageEl.style.setProperty('--dy', (cu.y * DRIFT[1]).toFixed(2) + 'px');
      }
      gacc += dt;
      if (hero && gacc > 1 / GRAIN_FPS) { gacc = 0; grain.style.transform = 'translate(' + (-Math.floor(Math.random() * 180)) + 'px,' + (-Math.floor(Math.random() * 180)) + 'px)'; }
      raf = requestAnimationFrame(tick);
    }
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { measure(); compact = null; setBar(wantCompact(scrollY), true); }, 200); }
    measure(); addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    addEventListener('load', measure);
    raf = requestAnimationFrame(tick);

    ctrl = { stop: function () {
      cancelAnimationFrame(raf); removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); root.removeEventListener('pointerleave', onLeave);
      scenes.forEach(function (s) { s.style.opacity = ''; });
      kids.forEach(function (a) { a.forEach(function (el) { el.style.cssText = ''; }); });
      stageEl.style.removeProperty('--dx'); stageEl.style.removeProperty('--dy'); grain.style.transform = '';
      bar.classList.remove('compact', 'measuring'); bar.style.width = ''; root.classList.remove('js');
    } };
  }
  function stop() { if (ctrl) { ctrl.stop(); ctrl = null; } }
  mq.addEventListener('change', function () { reduced() ? stop() : start(); });
  start();
})();
