/* ============================================================
   RAW.RETRO — boot sequence, OSD, audio, invert, scroll engine.

   Plain script. tv.js is the module and talks to us through
   window.RR, a tiny shared bus.
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var RR = window.RR = {
    ready: false,
    _onReady: [],
    onReady: function (fn) { this.ready ? fn() : this._onReady.push(fn); },
    fireReady: function () {
      this.ready = true;
      this._onReady.splice(0).forEach(function (f) { f(); });
    }
  };

  /* ---------------------------------------------------------- */
  /* BOOT                                                        */
  /* ---------------------------------------------------------- */
  var boot   = document.getElementById('boot');
  var pctEl  = document.getElementById('bootPct');
  var fillEl = document.getElementById('bootFill');
  var barEl  = document.getElementById('bootBar');

  var pct = 0, targetPct = 0, bootDone = false;

  /* The fill is quantised to whole blocks so it STACKS rather than slides.
     Rounding down to the block pitch means a block is either down or it is
     not — no half block ever creeps in at the right-hand end, which is what
     would make it read as a smooth bar wearing block clothing. 9px block,
     2px gap, and the run is one gap short because the last block has nothing
     after it. */
  var BLOCK = 9, GAP = 2, PITCH = BLOCK + GAP, PAD = 3;

  /* `shown` is what the BAR is at; `pct` is what the counter says. They are
     the same number once the bar is stacking, but the bar starts from zero at
     the handover and sweeps up to meet the counter, so the blocks appear to
     fill in rather than snapping to 77 all at once. That sweep is what makes
     it read as one bar changing its mind instead of two bars swapping. */
  var shown = 0, stacking = false;

  function stack() {
    if (stacking) return;
    stacking = true;
    shown = 0;
    if (barEl) { barEl.classList.remove('is-sliding'); barEl.classList.add('is-stacking'); }
  }

  function setPct(v) {
    pct = v;
    if (fillEl && barEl) {
      /* quantised to whole blocks: a block is either down or it is not, so no
         half block ever creeps in at the right-hand end */
      var inner = barEl.clientWidth - PAD * 2;
      var n = Math.floor(((inner + GAP) * (shown / 100)) / PITCH);
      fillEl.style.width = Math.max(0, n * PITCH - GAP) + 'px';
    }
    if (pctEl) pctEl.textContent = String(Math.round(v)).padStart(3, '0');
  }

  /* Creep toward 96 while the scene builds; finishBoot waits on it.

     Scripted rather than linear. Nothing real loads at a constant rate, and
     the thing everyone remembers about an XP boot is the bar that sticks —
     so this one runs quick through the thirties, slows as it climbs, and then
     sits at 77 for two and a half seconds before finishing. The counter holds
     at 077 with it, which is what sells the stall.

     Under prefers-reduced-motion it collapses to a single fast ramp: the
     dwell is theatre, and theatre is the first thing that setting asks you to
     drop. */
  var CRAWL = reduce
    ? [{ to: 96, step: 8, every: 30 }]
    : [{ to: 34, step: 5, every: 60 },
       { to: 62, step: 4, every: 80 },
       { to: 77, step: 2, every: 110 },
       { hold: 2400 },
       { to: 90, step: 2, every: 120 },
       { to: 96, step: 2, every: 90 }];

  var leg = 0;
  function crawl() {
    if (leg >= CRAWL.length) { finishBoot(); return; }
    var s = CRAWL[leg];
    /* The stall is the last moment the outcome is unknown, so the marquee
       runs through it and the blocks take over the instant it breaks. */
    if (s.hold) { leg++; setTimeout(function () { stack(); crawl(); }, s.hold); return; }
    if (targetPct >= s.to) { leg++; crawl(); return; }
    targetPct = Math.min(s.to, targetPct + s.step);
    setTimeout(crawl, s.every);
  }

  function tickPct() {
    if (bootDone) return;
    if (stacking) shown += (pct - shown) * 0.12;   // ~400ms to catch up
    setPct(pct + (targetPct - pct) * 0.14);
    requestAnimationFrame(tickPct);
  }

  function finishBoot() {
    var released = false;
    function release() {
      if (released) return; released = true;
      targetPct = 100; setPct(100);
      setTimeout(function () {
        bootDone = true;
        if (boot) boot.classList.add('is-done');
        document.body.classList.remove('is-booting');
        document.body.classList.add('is-lit');
        if (RR.startAudio) RR.startAudio();
      }, reduce ? 60 : 420);
    }
    RR.onReady(release);
    setTimeout(release, 9000);   // never trap anyone behind a slow CDN
  }

  if (reduce) stack();          /* no stall to pivot on, so never slide */
  requestAnimationFrame(tickPct);
  setTimeout(crawl, reduce ? 0 : 200);

  /* ---------------------------------------------------------- */
  /* OSD CLOCK                                                   */
  /*                                                              */
  /* The wall clock, 12-hour, exactly as a camcorder burns it in — */
  /* the timestamps in the footage on the PSP read the same way    */
  /* ("5:19:16 PM"), so the page and the tapes agree.              */
  /*                                                              */
  /* The hour is NOT zero-padded and the minutes and seconds are,  */
  /* which is what every consumer camcorder OSD does. Hour 0 shows  */
  /* as 12, not 0.                                                  */
  /* ---------------------------------------------------------- */
  var clockEl = document.getElementById('osdClock');
  var merEl   = document.getElementById('osdMeridiem');

  function paintClock() {
    var d = new Date();
    var h = d.getHours();
    var mer = h < 12 ? 'AM' : 'PM';
    h = h % 12;
    if (h === 0) h = 12;                       // midnight and noon are 12, not 0
    if (clockEl) {
      clockEl.textContent = h + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0');
    }
    if (merEl) merEl.textContent = mer;
  }

  /* Scheduled to the next real second boundary rather than on a plain
     setInterval(1000). An interval drifts — it fires 1000ms after the LAST
     callback, not on the second itself — so a visible seconds display ends up
     lagging the actual time by an arbitrary fraction and occasionally skips a
     value outright. Re-aiming at each boundary keeps it honest, and it also
     re-syncs for free after the tab has been throttled in the background. */
  function scheduleClock() {
    paintClock();
    setTimeout(scheduleClock, 1000 - (Date.now() % 1000) + 5);
  }
  if (clockEl || merEl) scheduleClock();

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------- */
  /* AUDIO                                                       */
  /*                                                              */
  /* Browsers will not let a page make noise before the visitor    */
  /* has interacted with it, and two things follow from that:      */
  /*                                                              */
  /*  1. `wheel` and `scroll` are NOT user-activation gestures.    */
  /*     This is a scroll-driven site, so the first thing almost   */
  /*     every visitor does is scroll. Arming with {once:true}     */
  /*     would tear the listeners down on that first wheel event,  */
  /*     call play(), have it refused, and kill the audio for the  */
  /*     whole visit. So: never disarm except on confirmed         */
  /*     success.                                                  */
  /*                                                              */
  /*  2. MUTED playback is always allowed, so the track is set     */
  /*     rolling silently from the first frame and is buffered by  */
  /*     the time a real gesture arrives — the gesture only has to */
  /*     unmute, which cannot fail the way a cold play() can.      */
  /*                                                              */
  /* If there is no track on disk the toggle removes itself        */
  /* rather than sitting there doing nothing.                      */
  /* ---------------------------------------------------------- */
  var audio = document.getElementById('bgAudio');
  var btn   = document.getElementById('soundToggle');
  var wanted = false, fadeTimer = null, audible = false;
  var VOL = 0.4;

  /* The <audio> element ships with NO src — only data-src — so the 3.9MB track
     is not competing with first paint. attachTrack() wires it up once the boot
     screen has handed over; everything downstream is unchanged.

     Because of that, "no src yet" and "no track at all" are now different
     states, and the old networkState===3 (NO_SOURCE) probe would report every
     cold page as trackless and delete the toggle. Failure is therefore detected
     ONLY from a real error once a src actually exists. */
  var haveTrack = !!audio;
  var attached = false;
  function noTrack() {
    if (!haveTrack) return;
    haveTrack = false;
    if (btn) btn.remove();
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
  }
  if (audio) audio.addEventListener('error', noTrack);
  else if (btn) btn.remove();

  function attachTrack() {
    if (attached || !audio || !haveTrack) return;
    attached = true;
    var src = audio.getAttribute('data-src');
    if (!src) { noTrack(); return; }
    audio.src = src;
    try { audio.load(); } catch (e) {}
  }

  function fadeTo(target, done) {
    if (!audio) return;
    clearInterval(fadeTimer);
    var step = (target - audio.volume) / 22;
    fadeTimer = setInterval(function () {
      var v = audio.volume + step;
      if ((step > 0 && v >= target) || (step < 0 && v <= target) || step === 0) {
        audio.volume = Math.max(0, Math.min(1, target));
        clearInterval(fadeTimer);
        done && done();
      } else {
        audio.volume = Math.max(0, Math.min(1, v));
      }
    }, 40);
  }

  function reflect() { btn && btn.setAttribute('aria-pressed', wanted ? 'true' : 'false'); }

  function rollSilently() {
    if (!audio) return;
    audio.muted = true;
    audio.volume = 0;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }

  /* Single-flight, and that matters: a wheel and a scroll arrive back to back,
     so two attempts overlap. The second would read `wasMuted` off an element
     the first had already unmuted, then "restore" it to unmuted on failure —
     leaving the track silent AND paused, with nothing left rolling. */
  var inFlight = null;
  function goAudible() {
    if (!audio || !haveTrack) return Promise.resolve(false);
    if (audible) return Promise.resolve(true);
    if (inFlight) return inFlight;

    var wasMuted = audio.muted;
    audio.muted = false;
    /* it has been rolling silently, so the visitor has heard none of it —
       give them the top of the track rather than dropping them mid-phrase */
    if (wasMuted) { try { audio.currentTime = 0; } catch (e) {} }
    audio.volume = 0;

    var p;
    try { p = audio.play(); } catch (e) { p = null; }
    var settle = function (ok) { inFlight = null; return ok; };
    var win  = function () { audible = true; fadeTo(VOL); return settle(true); };
    var lose = function () {
      audio.muted = wasMuted;                                  // Chrome pauses it
      if (wasMuted && audio.paused) rollSilently();
      return settle(false);
    };
    if (!p || !p.then) return Promise.resolve(audio.paused ? lose() : win());
    inFlight = p.then(win, lose);
    return inFlight;
  }

  var ARM = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend', 'wheel', 'scroll'];
  var armed = false;
  function kick() {
    if (!wanted || audible) { disarm(); return; }
    goAudible().then(function (ok) { if (ok) disarm(); });
  }
  function arm() {
    if (armed || !audio) return;
    armed = true;
    /* capture, passive, and NOT `once` — a wheel event that cannot grant
       activation must be free to fail without costing us the next real click */
    ARM.forEach(function (t) { window.addEventListener(t, kick, { capture: true, passive: true }); });
  }
  function disarm() {
    if (!armed) return;
    armed = false;
    ARM.forEach(function (t) { window.removeEventListener(t, kick, true); });
  }

  function setSound(on) {
    if (!audio) return;
    if (on) attachTrack();          // may be the first thing that ever needs it
    wanted = on;
    reflect();
    try { sessionStorage.setItem('rr_sound', on ? '1' : '0'); } catch (e) {}
    if (on) {
      goAudible().then(function (ok) { if (!ok) { rollSilently(); arm(); } });
    } else {
      audible = false;
      disarm();
      fadeTo(0, function () { audio.pause(); });
    }
  }

  if (btn) btn.addEventListener('click', function () { setSound(!wanted); });

  document.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (document.hidden) { audio.pause(); }
    else if (wanted) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
  });

  /* On by default — the track is part of the piece, not a garnish. Remembered
     per session, so anyone who turns it off is not asked twice.

     Note this does NOT just call setSound(true). Autoplay with sound will be
     refused outright on a cold visit, and the whole point of the machinery
     above is what happens next: on refusal the track is set rolling MUTED
     (always permitted) so it buffers, and the arm() listeners wait for the
     first real gesture to unmute it. */
  var soundOnByDefault = true;
  try { if (sessionStorage.getItem('rr_sound') === '0') soundOnByDefault = false; } catch (e) {}
  reflect();

  /* Called from the boot hand-off, so the fetch starts after the visitor is
     looking at the site rather than at the loading bar. */
  function startAudio() {
    if (!audio || !haveTrack || !soundOnByDefault) return;
    attachTrack();
    wanted = true;
    reflect();
    goAudible().then(function (ok) {
      if (ok) return;      // high media engagement — it is simply allowed
      rollSilently();      // otherwise roll it silently and wait for a gesture
      arm();
    });
  }
  RR.startAudio = startAudio;

  /* ---------------------------------------------------------- */
  /* INVERT                                                      */
  /* ---------------------------------------------------------- */
  var invBtn = document.getElementById('invertToggle');
  function setInvert(on) {
    document.body.classList.toggle('is-invert', on);
    if (invBtn) invBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#ffffff' : '#000000');
    if (RR.setShellInvert) RR.setShellInvert(on);   // the TV casing goes pale
    onScroll();                                     // repaint the backdrop tone
    try { localStorage.setItem('rr_invert', on ? '1' : '0'); } catch (e) {}
  }
  if (invBtn) {
    invBtn.addEventListener('click', function () {
      setInvert(!document.body.classList.contains('is-invert'));
    });
  }

  /* ---------------------------------------------------------- */
  /* SCROLL ENGINE                                               */
  /* Three jobs, all off one rAF loop: bleed the backdrop tone   */
  /* across section seams, drift each element at its own rate,   */
  /* and reveal type as it enters.                               */
  /* ---------------------------------------------------------- */
  var backdrop = document.querySelector('.backdrop');
  var secs   = [].slice.call(document.querySelectorAll('.sec'));
  var movers = [].slice.call(document.querySelectorAll('.el, .lay, .lcd'));

  /* drift, as a fraction of the viewport. Opposed signs inside a section are
     what make it read as depth rather than as the whole slab sliding. */
  var DEPTH = {
    'el--star-a': 0.16, 'el--star-b': -0.13, 'el--dice': 0.08,
    'lay--mark': -0.05, 'lay--tag': 0.06,
    'lay--abouth': -0.045, 'lay--bio': 0.035,
    'el--minidv': 0.14, 'el--hi8': -0.11,
    /* These three share a depth on purpose. The panel MUST carry the camera's
       exactly, or the card slides out of the screen it is supposed to be
       playing on. The colophon joins them because it does not: at 0.02
       against the camera's old 0.07 the two closed 72px over the scroll while
       only 39px apart at rest, and the line ended up on the camera's white
       bezel, where dim pixel type cannot be read. Equal depths hold their
       spacing whatever the scroll does. */
    'el--trv': 0.03, 'lcd': 0.03, 'lay--colophon': 0.03,
    'el--star-c': 0.03, 'el--dice-b': 0.03,
    'el--pd170': -0.06
  };
  movers.forEach(function (m) {
    var d = 0;
    for (var k in DEPTH) if (m.classList.contains(k)) d = DEPTH[k];
    m.__d = d;
  });

  /* every section is dark here; the feed stays dark even when inverted so the
     screen keeps reading as emitted light */
  function toneOf(sec) { return sec.classList.contains('sec--light') ? 0 : 1; }

  var ticking = false;
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    var mid = window.scrollY + vh * 0.5;

    if (backdrop && secs.length) {
      var band = vh * 0.6;
      var tone = toneOf(secs[secs.length - 1]);
      for (var i = 0; i < secs.length; i++) {
        var top = secs[i].offsetTop, bot = top + secs[i].offsetHeight;
        if (mid >= top && mid < bot) {
          tone = toneOf(secs[i]);
          if (i < secs.length - 1 && mid > bot - band) {
            tone += (toneOf(secs[i + 1]) - tone) * ((mid - (bot - band)) / band);
          } else if (i > 0 && mid < top + band) {
            tone += (toneOf(secs[i - 1]) - tone) * (1 - (mid - top) / band);
          }
          break;
        }
      }
      var inv = document.body.classList.contains('is-invert');
      var v = Math.round((inv ? tone : 1 - tone) * 255);
      backdrop.style.backgroundColor = 'rgb(' + v + ',' + v + ',' + v + ')';
    }

    for (var j = 0; j < movers.length; j++) {
      var m = movers[j];
      if (!m.__d) continue;
      var r = m.parentNode.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;     // far off-screen
      var p = (r.top + r.height / 2 - vh / 2) / vh;       // -1..1 through the viewport
      m.style.setProperty('--ty', (p * m.__d * vh).toFixed(1) + 'px');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  frame();

  try { if (localStorage.getItem('rr_invert') === '1') setInvert(true); } catch (e) {}

  /* ---------------------------------------------------------- */
  /* REVEALS                                                     */
  /* ---------------------------------------------------------- */
  if ('IntersectionObserver' in window && !reduce) {
    var lays = [].slice.call(document.querySelectorAll('.el, .lay'));
    lays.forEach(function (n) { n.classList.add('rev'); });
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-shown'); ro.unobserve(e.target); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    lays.forEach(function (n) { ro.observe(n); });

    /* Failsafe — nothing may be left invisible because an observer misfired.
       PER ELEMENT, not blanket: it only shows what is actually on screen, so a
       section further down still gets its reveal when you reach it. A blanket
       timeout here would kill every animation past the fold. */
    var guard = null;
    var showIfNear = function () {
      var vh = window.innerHeight, live = 0;
      for (var z = 0; z < lays.length; z++) {
        var el = lays[z];
        if (el.classList.contains('is-shown')) continue;
        live++;
        var r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) { el.classList.add('is-shown'); ro.unobserve(el); }
      }
      if (!live && guard) { clearInterval(guard); guard = null; }
    };
    guard = setInterval(showIfNear, 900);
    showIfNear();
    window.addEventListener('scroll', showIfNear, { passive: true });
    window.addEventListener('resize', showIfNear, { passive: true });
  }

  /* ---------------------------------------------------------- */
  /* SMOOTH IN-PAGE NAV                                          */
  /* ---------------------------------------------------------- */
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
