(function () {
  'use strict';

  /* Shared navigation flag — set true during smoothTo() so GSAP onUpdate
     callbacks for discrete acts (beats, personas, terminal, wins) skip their
     work until the scroll lands. act-drop (free-scroll diagram) is exempt. */
  var _navigating = false;

  /* ── Pipeline data ──────────────────────────────────────────── */
  var STEPS = [
    { n:'01', label:'Elicitation', icon:'💬', color:'#4a9eff', role:'Analyst',
      desc:'AI asks structured questions — intent, entities, constraints. Nothing gets built until requirements are clear.',
      cmd:'archon elicit  →  12 requirements, 8 entities captured' },
    { n:'02', label:'DesignSpec',  icon:'📐', color:'#a855f7', role:'Architect',
      desc:'Strict zero-ambiguity JSON schema. Every module, entity, endpoint defined before a single file is generated.',
      cmd:'DesignSpec.json locked  (847 lines, 0 ambiguities)' },
    { n:'03', label:'Validation',  icon:'🛡️', color:'#f59e0b', role:'Tech Lead',
      desc:'200+ automated checks: security rules, circular refs, constraint integrity. Once the spec is valid, the AI\'s job is done. What comes next burns zero tokens.',
      cmd:'archon validate  →  ✓ 200 checks passed  (0.8s)' },
    { n:'04', label:'Compilation', icon:'⚙️', color:'#ff5d01', role:'Orchestrator',
      desc:'Our own template engine — built from scratch — wraps every validated module, entity, and endpoint with production-ready code. Zero tokens consumed. One spec in, same 47 files out. Every time.',
      cmd:'archon compile  →  ✓ 47 files generated  (23.1s)' },
    { n:'05', label:'Proof',       icon:'🐳', color:'#22c55e', role:'Developer',
      desc:'Docker compose up. Smoke tests. Swagger renders every endpoint. Output is verified before you ever see it.',
      cmd:'docker compose up  →  ✓ API live :3000  |  swagger :3000/api' },
    { n:'06', label:'Evolution',   icon:'🔄', color:'#94a3b8', role:'System',
      desc:'Add modules safely. Archon diffs the spec, recompiles only what changed. Zero regression. Always.',
      cmd:'archon evolve --add payments  →  ✓ 6 new files, 0 regressions' },
  ];

  /* ── Build progress dots ────────────────────────────────────── */
  (function () {
    var dotsEl = document.getElementById('pl-dots');
    STEPS.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'pl-dot' + (i === 0 ? ' on' : '');
      if (i === 0) d.style.background = s.color;
      d.addEventListener('click', function () { scrollToStep(i); });
      dotsEl.appendChild(d);
    });
  })();

  function scrollToStep(idx) {
    var pl = document.getElementById('pipeline');
    if (!pl) return;
    var plTop = pl.getBoundingClientRect().top + window.scrollY;
    var fraction = idx / STEPS.length;
    window.scrollTo({ top: plTop + pl.offsetHeight * fraction + 2, behavior: 'smooth' });
  }

  /* ── Show step ──────────────────────────────────────────────── */
  var curStep = -1;
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showStep(idx) {
    if (idx === curStep) return;
    var prev = curStep;
    var s = STEPS[idx];
    curStep = idx;

    /* Instant visual tokens */
    var sticky = document.getElementById('pl-sticky');
    if (sticky) sticky.style.setProperty('--pl-color', s.color);
    document.getElementById('pl-accent-bar').style.background = s.color;
    document.getElementById('pl-counter').innerHTML = s.n + ' <span class="pl-of">/ 06</span>';
    document.getElementById('pl-prog-fill').style.background = s.color;
    document.getElementById('pl-bg-num').textContent = s.n;
    document.querySelectorAll('.pl-dot').forEach(function (d, i) {
      d.classList.toggle('on', i === idx);
      d.style.background = i === idx ? s.color : '';
    });
    if (idx > 0) {
      var hint = document.getElementById('pl-hint');
      if (hint && hint.style.animation !== 'none') {
        hint.style.animation = 'none';
        hint.style.opacity = '0';
      }
    }

    /* Content update — animated or instant */
    var stage = document.getElementById('pl-stage');
    var dir = prev < 0 ? 0 : (idx > prev ? 1 : -1);

    function applyContent() {
      document.getElementById('pl-icon').textContent = s.icon;
      document.getElementById('pl-role').textContent = s.role;
      document.getElementById('pl-label').textContent = s.label;
      document.getElementById('pl-desc').textContent = s.desc;
      document.getElementById('pl-cmd').textContent = '→ ' + s.cmd;
    }

    if (dir === 0 || prefersReduced) {
      applyContent();
    } else {
      gsap.killTweensOf(stage);
      gsap.killTweensOf('#pl-bg-num');
      gsap.timeline()
        .to(stage, { y: dir * -26, opacity: 0, duration: 0.14, ease: 'power2.in' })
        .call(function () { applyContent(); gsap.set(stage, { y: dir * 26 }); })
        .to(stage, { y: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
      gsap.fromTo('#pl-bg-num',
        { opacity: 0, scale: 1.12 },
        { opacity: 1, scale: 1, duration: 0.42, ease: 'power2.out' });
    }
  }

  /* ── Seed first step ────────────────────────────────────────── */
  (function () {
    var s = STEPS[0];
    document.getElementById('pl-icon').textContent = s.icon;
    document.getElementById('pl-role').textContent = s.role;
    document.getElementById('pl-label').textContent = s.label;
    document.getElementById('pl-desc').textContent = s.desc;
    document.getElementById('pl-cmd').textContent = '→ ' + s.cmd;
    var sticky = document.getElementById('pl-sticky');
    if (sticky) sticky.style.setProperty('--pl-color', s.color);
    curStep = 0;
  })();

  /* ── Audience tabs ────────────────────────────────────────── */
  document.querySelectorAll('.aud-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.aud-tab').forEach(function (t) { t.classList.remove('on'); });
      document.querySelectorAll('.aud-panel').forEach(function (p) { p.classList.remove('on'); });
      tab.classList.add('on');
      var panel = document.getElementById('aud-' + tab.dataset.for);
      if (panel) panel.classList.add('on');
    });
  });

  /* ── GSAP ──────────────────────────────────────────────────── */
  gsap.registerPlugin(ScrollTrigger);

  /* ── Pipeline scroll tracker — runs for all users ───────────── */
  ScrollTrigger.create({
    trigger: '#pipeline',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: function (self) {
      var idx = Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length));
      showStep(idx);
      var fill = document.getElementById('pl-prog-fill');
      if (fill) fill.style.width = (self.progress * 100).toFixed(2) + '%';
    }
  });

  var mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* Hero counters — run on load */
    function tick(id, target, suffix, duration) {
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: duration || 1.8, ease: 'power2.out', delay: 0.4,
        onUpdate: function () {
          var el = document.getElementById(id);
          if (el) el.innerHTML = Math.round(obj.v) + (suffix || '');
        }
      });
    }
    tick('c1', 47);
    tick('c2', 23, '<span style="font-size:.6em">s</span>', 1.4);
    tick('c3', 200, '', 2.0);

    /* Hero terminal typewriter */
    var lines = [
      { id: 'tl1', text: 'archon compile --spec DesignSpec.json' },
      { id: 'tl2', text: '✓ 200 checks passed  (0.8s)',  row: 'tl2-row' },
      { id: 'tl3', text: '✓ 47 files generated (23.1s)', row: 'tl3-row' },
    ];
    var delays = [0.3, 1.2, 1.8];
    lines.forEach(function (ln, i) {
      var el = document.getElementById(ln.id);
      var rowEl = ln.row ? document.getElementById(ln.row) : null;
      var txt = ln.text;
      var delay = delays[i];
      gsap.delayedCall(delay, function () {
        if (rowEl) rowEl.style.display = 'flex';
        var idx = 0;
        var tid = setInterval(function () {
          if (el) el.textContent = txt.slice(0, ++idx);
          if (idx >= txt.length) clearInterval(tid);
        }, 22);
      });
    });

    /* Pipeline — enter animation (motion users only) */
    ScrollTrigger.create({
      trigger: '#pipeline', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.from('#pl-stage', { y: 36, opacity: 0, duration: 0.7, ease: 'power2.out', delay: 0.05 });
        gsap.from('#pl-bg-num', { scale: 1.18, opacity: 0, duration: 0.85, ease: 'power2.out' });
        gsap.from('#pl-dots', { y: 10, opacity: 0, duration: 0.5, delay: 0.4, ease: 'power2.out' });
        gsap.from('#pl-hint', { opacity: 0, duration: 0.7, delay: 0.6 });
        gsap.from('#pl-eyebrow, #pl-counter', { opacity: 0, duration: 0.5, delay: 0.2, stagger: 0.1 });
      }
    });

    /* Stats pop */
    ScrollTrigger.create({
      trigger: '#stat-row', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.from('.stat', { y: 16, opacity: 0, scale: 0.9, stagger: 0.08, duration: 0.4, ease: 'back.out(1.7)' });
        gsap.from('#code-proof', { y: 12, opacity: 0, duration: 0.5, delay: 0.35, ease: 'power2.out' });
      }
    });

    /* Audience section */
    ScrollTrigger.create({
      trigger: '#audience', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.from('#aud-tabs', { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out' });
        gsap.from('.aud-panel.on', { y: 12, opacity: 0, duration: 0.5, delay: 0.15, ease: 'power2.out' });
      }
    });

    /* CTA */
    ScrollTrigger.create({
      trigger: '#cta', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.from('.cta-big, .cta-sub', { y: 16, opacity: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out' });
        gsap.from('.lk', { x: -10, opacity: 0, stagger: 0.08, duration: 0.4, delay: 0.2, ease: 'power2.out' });
      }
    });
  });

  /* ══ SHOWCASE JS ════════════════════════════════════════════ */

  /* ─── Persona data ─────────────────────────────────────────── */
  var PERSONAS = [
    { num:'01', icon:'💬', name:'ANALYST',      color:'#4a9eff', rgb:'74,158,255',
      output:'Requirements\nContract · 7\nambiguities\nresolved' },
    { num:'02', icon:'📐', name:'ARCHITECT',    color:'#a855f7', rgb:'168,85,247',
      output:'UML Contract\nsha256:a3f9\n...e14b · LOCKED' },
    { num:'03', icon:'🛡️', name:'TECH LEAD',    color:'#f59e0b', rgb:'245,158,11',
      output:'47 files planned\n0 conflicts\n✓ COMPILED' },
    { num:'04', icon:'⚙️', name:'ORCHESTRATOR', color:'#22c55e', rgb:'34,197,94',
      output:'USER APPROVED\n→ Materializing\n47 files...' },
    { num:'05', icon:'🔍', name:'DEVELOPER',    color:'#ff5d01', rgb:'255,93,1',
      output:'47 files\n0 drift\nCI ✓ PASS' },
  ];

  /* Build persona track */
  (function () {
    var track = document.getElementById('persona-track');
    if (!track) return;
    PERSONAS.forEach(function (p, i) {
      if (i > 0) {
        var arr = document.createElement('div');
        arr.className = 'persona-arrow'; arr.id = 'parr-' + i; arr.textContent = '→';
        track.appendChild(arr);
      }
      var card = document.createElement('div');
      card.className = 'persona-card'; card.id = 'pcard-' + i;
      card.style.setProperty('--p-color', p.color);
      card.style.setProperty('--p-rgb', p.rgb);
      card.innerHTML =
        '<span class="persona-num">' + p.num + '</span>' +
        '<span class="persona-icon">' + p.icon + '</span>' +
        '<span class="persona-name">' + p.name + '</span>' +
        '<div class="persona-output" style="white-space:pre">' + p.output + '</div>' +
        '<div class="persona-dot"></div>';
      track.appendChild(card);
    });
  })();

  /* ─── Terminal lines ────────────────────────────────────────── */
  var TERM_LINES = [
    { t:'info', text:'[ARCHON] Detecting environment...' },
    { t:'ok',   text:'  ✓ OS: macOS (arm64)' },
    { t:'ok',   text:'  ✓ Docker: 24.0.6 running' },
    { t:'ok',   text:'  ✓ Node: v20.11.0' },
    { t:'blank' },
    { t:'info', text:'[ARCHON] Generating JWT secret...' },
    { t:'ok',   text:'  ✓ JWT_SECRET=c9f2a4e8... (64-char hex)' },
    { t:'blank' },
    { t:'info', text:'[ARCHON] Building services (no-cache)...' },
    { t:'prog',  text:'  ⠸ api        [████████████░░░░] 68%' },
    { t:'ok',   text:'  ✓ api        [████████████████] 100%' },
    { t:'ok',   text:'  ✓ postgres   [████████████████] 100%' },
    { t:'ok',   text:'  ✓ qdrant     [████████████████] 100%' },
    { t:'blank' },
    { t:'info', text:'[ARCHON] Starting services...' },
    { t:'ok',   text:'  ✓ api      → http://localhost:3001' },
    { t:'ok',   text:'  ✓ postgres → localhost:5432' },
    { t:'ok',   text:'  ✓ qdrant   → localhost:6333' },
    { t:'blank' },
    { t:'info', text:'[ARCHON] Running migrations...' },
    { t:'ok',   text:'  ✓ 16 entities migrated' },
    { t:'ok',   text:'  ✓ 18 FK constraints created' },
    { t:'ok',   text:'  ✓ 6 indexes applied' },
    { t:'blank' },
    { t:'ok',   text:'[ARCHON] Ready.' },
    { t:'ok',   text:'  ✓ 47 files    ✓ 3 services    ✓ 0 errors' },
    { t:'blank' },
    { t:'info', text:'  Swagger: http://localhost:3001/api' },
    { t:'ok',   text:'  Health:  → {"status":"ok","entities":16}' },
  ];

  var termLinesShown = 0;
  function showTermLine(idx) {
    if (idx >= TERM_LINES.length || idx < termLinesShown) return;
    var body = document.getElementById('term-body');
    if (!body) return;
    for (var i = termLinesShown; i <= idx; i++) {
      var ln = TERM_LINES[i];
      var el = document.createElement('span');
      if (ln.t === 'blank') {
        el.className = 't-blank';
      } else {
        el.className = 't-line';
        var cls = ln.t === 'ok' ? 't-ok' : ln.t === 'prog' ? 't-prog' : 't-info';
        el.innerHTML = '<span class="' + cls + '">' + ln.text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
      }
      body.appendChild(el);
    }
    termLinesShown = idx + 1;
    body.scrollTop = body.scrollHeight;
  }

  /* ─── UML diagram reveal ────────────────────────────────────── */
  var UML_DOMAINS = ['identity','auth','workspace','billing','integration'];
  var UML_ENTS_BY_DOMAIN = [
    ['User','Profile','Organization','Role'],
    ['Session','ApiKey','AuditLog'],
    ['Workspace','Document','Team','TeamMember'],
    ['Plan','Subscription','Invoice'],
    ['Webhook','Notification'],
  ];
  var REL_COUNT = 18;

  function setOpacity(id, v) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('opacity', v);
    /* mirror to mobile counterpart (HTML element, use style.opacity) */
    var mel = document.getElementById('m-' + id);
    if (mel) mel.style.opacity = v;
  }

  function animateUML(p) {
    UML_DOMAINS.forEach(function (d) {
      var t = Math.max(0, Math.min(1, p / 0.08));
      setOpacity('dom-' + d, t);
      setOpacity('dlbl-' + d, Math.max(0, Math.min(1, (p - 0.02) / 0.08)));
    });
    var domStarts = [0.08, 0.22, 0.35, 0.50, 0.62];
    var domEnds   = [0.22, 0.35, 0.50, 0.62, 0.73];
    UML_ENTS_BY_DOMAIN.forEach(function (arr, di) {
      arr.forEach(function (name, ei) {
        var s = domStarts[di] + (domEnds[di] - domStarts[di]) * ei / arr.length;
        var e = domStarts[di] + (domEnds[di] - domStarts[di]) * (ei + 1) / arr.length;
        setOpacity('ent-' + name, Math.max(0, Math.min(1, (p - s) / Math.max(e - s, 0.001))));
      });
    });
    for (var ri = 0; ri < REL_COUNT; ri++) {
      var el = document.getElementById('rel-' + ri);
      if (!el) continue;
      var rs = 0.72 + (0.90 - 0.72) * ri / REL_COUNT;
      var re = 0.72 + (0.90 - 0.72) * (ri + 1) / REL_COUNT;
      var frac = Math.max(0, Math.min(1, (p - rs) / Math.max(re - rs, 0.001)));
      var da = parseFloat(el.getAttribute('stroke-dasharray')) || 100;
      el.setAttribute('stroke-dashoffset', da * (1 - frac));
    }
    var badge = document.getElementById('uml-stat-badge');
    if (badge) badge.style.opacity = Math.max(0, Math.min(1, (p - 0.88) / 0.06));
    var cta = document.getElementById('uml-compile-cta');
    if (cta) cta.style.opacity = Math.max(0, Math.min(1, (p - 0.94) / 0.04));
  }

  /* ─── Old-way beat switcher ────────────────────────────────── */
  var activeBeat = -1;
  function showBeat(idx) {
    if (idx === activeBeat) return;
    activeBeat = idx;
    for (var i = 0; i < 4; i++) {
      var b = document.getElementById('beat-' + i);
      if (!b) continue;
      b.classList.toggle('visible', i === idx);
    }
    /* file-stack: show items up to current beat progress (beat 0 only) */
    if (idx === 0) {
      document.querySelectorAll('.file-item').forEach(function (el, i) {
        setTimeout(function () { el.classList.add('shown'); }, i * 120);
      });
    }
    var lbl = document.getElementById('beat-label');
    if (lbl) lbl.textContent = (idx + 1) + ' / 4';
    /* color the sticky border */
    var sticky = document.querySelector('#act-oldway .sc-sticky');
    if (sticky) {
      sticky.style.borderBottomColor = idx >= 3 ? 'rgba(255,93,1,.4)' : 'rgba(239,68,68,.2)';
    }
  }

  /* ─── Persona highlight ─────────────────────────────────────── */
  var personaActive = -1;
  function showPersona(idx) {
    if (idx === personaActive) return;
    var prev = personaActive;
    personaActive = idx;
    PERSONAS.forEach(function (_, i) {
      var card = document.getElementById('pcard-' + i);
      var arr  = document.getElementById('parr-' + i);
      var active = i <= idx;
      /* Stagger new activations (e.g. after tap-navigation snaps to end):
         each newly-activated card delays 90ms per step so they cascade in. */
      var delay = (active && i > prev) ? (i - Math.max(prev, -1) - 1) * 90 : 0;
      if (delay > 0) {
        setTimeout(function (c, a, ar) {
          if (c) c.classList.toggle('active', a);
          if (ar) ar.classList.toggle('lit', a);
        }, delay, card, active, arr);
      } else {
        if (card) card.classList.toggle('active', active);
        if (arr)  arr.classList.toggle('lit',    active);
      }
    });
    var footer = document.getElementById('persona-footer');
    if (footer) {
      var footerDelay = idx >= PERSONAS.length - 1 ? (PERSONAS.length - Math.max(prev,-1) - 1) * 90 : 0;
      setTimeout(function() {
        footer.style.opacity = idx >= PERSONAS.length - 1 ? '1' : '0';
      }, footerDelay);
    }
  }

  /* ─── Wins reveal ────────────────────────────────────────────── */
  function revealWins(p) {
    [0,1,2].forEach(function (i) {
      var card = document.getElementById('win-' + i);
      if (!card) return;
      var t = Math.max(0, Math.min(1, (p - i * 0.18) / 0.14));
      card.style.opacity = t;
      card.style.transform = 'translateY(' + (22 * (1 - t)) + 'px)';
    });
    var pl = document.getElementById('wins-punchline');
    if (pl) pl.style.opacity = Math.max(0, Math.min(1, (p - 0.72) / 0.14));
  }

  /* ─── ScrollTriggers (motion users only) ────────────────────── */
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* ACT 1 — Old Way: 4 beats across 300vh */
    showBeat(0);
    ScrollTrigger.create({
      trigger: '#act-oldway', start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) {
        if (_navigating) return;
        var idx = Math.min(3, Math.floor(self.progress * 4));
        showBeat(idx);
      }
    });

    /* ACT 2 — UML diagram draws in.
       RAF-throttled so fast swipes don't queue 60+ animateUML() calls
       per frame (50+ DOM writes each). One paint per rAF tick max. */
    var _umlRaf = null, _umlProg = 0;
    ScrollTrigger.create({
      trigger: '#act-drop', start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) {
        _umlProg = self.progress;
        if (_umlRaf) return;
        _umlRaf = requestAnimationFrame(function () {
          _umlRaf = null;
          animateUML(_umlProg);
        });
      }
    });

    /* ACT 3 — Personas activate */
    showPersona(-1);
    ScrollTrigger.create({
      trigger: '#act-pipeline', start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) {
        if (_navigating) return;
        var idx = Math.min(PERSONAS.length - 1, Math.floor(self.progress * (PERSONAS.length + 0.5)));
        showPersona(idx);
      }
    });

    /* ACT 4 — Terminal boot */
    var termProgress = 0;
    ScrollTrigger.create({
      trigger: '#act-boot', start: 'top top', end: 'bottom bottom',
      onEnter: function () { showTermLine(2); termProgress = 2; },
      onUpdate: function (self) {
        if (_navigating) return;
        var target = Math.floor(self.progress * TERM_LINES.length);
        if (target > termProgress) { showTermLine(target); termProgress = target; }
      }
    });

    /* ACT 5 — Three wins */
    ScrollTrigger.create({
      trigger: '#act-wins', start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) {
        if (_navigating) return;
        revealWins(self.progress);
      }
    });

    /* Act entrance fade-ins */
    ['act-oldway','act-drop','act-pipeline','act-boot','act-wins'].forEach(function (id) {
      ScrollTrigger.create({
        trigger: '#' + id, start: 'top 88%', once: true,
        onEnter: function () {
          gsap.from('#' + id + ' .sc-badge, #' + id + ' .sc-act-label',
            { opacity: 0, y: -6, duration: 0.4, stagger: 0.08, ease: 'power2.out' });
        }
      });
    });
  });

  /* ─── Reduced-motion: show everything immediately ────────────── */
  (function () {
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    showBeat(3);
    animateUML(1);
    showPersona(4);
    TERM_LINES.forEach(function (_, i) { showTermLine(i); });
    revealWins(1);
  })();

  /* ─── PRESENTER NAVIGATION ────────────────────────────────────
   *  Space / → / ↓  — advance to next beat
   *  ← / ↑          — go back one beat
   *  Normal scroll still works. This gives keyboard clicker control.
   *  Only active while the showcase section is in view.
   * ──────────────────────────────────────────────────────────── */
  (function () {
    /* 9 natural pause points — each is {sectionId, fraction-of-section-height} */
    var STOPS = [
      { id: 'act-oldway',   p: 0.02, label: 'The Grind',     n: '1' },
      { id: 'act-oldway',   p: 0.27, label: 'LLM Trap',      n: '2' },
      { id: 'act-oldway',   p: 0.52, label: 'Drift',         n: '3' },
      { id: 'act-oldway',   p: 0.78, label: 'The Insight',   n: '4' },
      { id: 'act-drop',     p: 0.30, label: 'UML Drawing',   n: '5' },
      { id: 'act-drop',     p: 0.90, label: 'UML Complete',  n: '6' },
      { id: 'act-pipeline', p: 0.88, label: '5 Personas',    n: '7' },
      { id: 'act-boot',     p: 0.90, label: 'Backend Live',  n: '8' },
      { id: 'act-wins',     p: 0.80, label: 'The Numbers',   n: '9' },
    ];

    var _idx   = -1;   // current stop index
    var _busy  = false; // animation in progress

    /* ── helpers ── */
    function stopY(s) {
      var el = document.getElementById(s.id);
      if (!el) return 0;
      /* GSAP ScrollTrigger progress = scroll / (offsetHeight - innerHeight).
         Use the same denominator so p=0.52 lands exactly on GSAP progress 0.52. */
      var elTop = window.scrollY + el.getBoundingClientRect().top;
      return elTop + (el.offsetHeight - window.innerHeight) * s.p;
    }

    function inShowcase() {
      var sc = document.getElementById('uml-showcase');
      if (!sc) return false;
      var r = sc.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }

    /* True while the UML diagram act is the active sticky panel.
       During act-drop we allow free-scroll so the user can drag
       through the diagram animation at their own pace. */
    function inActDrop() {
      var el = document.getElementById('act-drop');
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.top < 5 && r.bottom > window.innerHeight - 5;
    }

    /* Smooth scroll — 380ms ease-out (snappy for presentations).
       Sets _navigating so discrete-act GSAP callbacks hold while scrolling.
       Clears it on completion and forces one GSAP refresh so the correct
       animation state snaps in at the landing position. */
    function smoothTo(y) {
      if (_busy) return;
      _busy = true;
      _navigating = true;
      var s0 = window.scrollY, d = y - s0, t0 = null;
      (function step(ts) {
        if (!t0) t0 = ts;
        var pg = Math.min((ts - t0) / 380, 1);
        var e  = 1 - Math.pow(1 - pg, 3); /* ease-out cubic */
        window.scrollTo(0, s0 + d * e);
        if (pg < 1) {
          requestAnimationFrame(step);
        } else {
          _busy = false;
          _navigating = false;
          ScrollTrigger.update(); /* snap discrete animations to landed state */
        }
      })(performance.now());
    }

    /* ── HUD ── */
    var hud = document.createElement('div');
    hud.id  = 'presenter-hud';
    var _isMobile = window.matchMedia('(max-width: 767px)').matches;
    hud.innerHTML =
      '<span class="hud-stop">— / —</span>' +
      '<span class="hud-sep">|</span>'      +
      '<span class="hud-label">—</span>'    +
      '<span class="hud-sep">|</span>'      +
      '<span class="hud-hint">' + (_isMobile ? 'Tap ▶ next · ◀ back' : 'Space / → next · ← back') + '</span>';
    document.body.appendChild(hud);

    function updateHUD(idx) {
      if (!hud) return;
      if (idx < 0 || idx >= STOPS.length) { hud.classList.remove('visible'); return; }
      var s = STOPS[idx];
      hud.querySelector('.hud-stop').textContent  = s.n + ' / ' + STOPS.length;
      hud.querySelector('.hud-label').textContent = s.label;
      hud.classList.toggle('visible', inShowcase());
    }

    /* ── advance / retreat ── */
    function go(dir) {
      if (!inShowcase()) return;
      if (_busy) return;              /* ignore tap during animation */
      var next = Math.max(0, Math.min(STOPS.length - 1, _idx + dir));
      if (next === _idx) return;      /* already at boundary */
      _idx = next;
      smoothTo(stopY(STOPS[_idx]));
      updateHUD(_idx);
    }

    /* ── keep _idx in sync with free scroll ── */
    var _hudTimer;
    var _wasInShowcase = false;
    window.addEventListener('scroll', function () {
      var nowIn = inShowcase();

      /* snap to stop 0 the moment showcase first enters viewport */
      if (nowIn && !_wasInShowcase) {
        _wasInShowcase = true;
        _idx = 0;
        /* tiny delay lets any residual iOS momentum settle first */
        setTimeout(function () {
          if (inShowcase() && !_busy) smoothTo(stopY(STOPS[0]));
        }, 80);
      } else if (!nowIn) {
        _wasInShowcase = false;
      }

      /* keep _idx synced only when NOT animating */
      if (!_busy) {
        var sy = window.scrollY;
        var best = _idx, bestD = Infinity;
        STOPS.forEach(function (s, i) {
          var d = Math.abs(sy - stopY(s));
          if (d < bestD) { bestD = d; best = i; }
        });
        if (bestD < window.innerHeight * 0.55) _idx = best;
      }

      /* show HUD briefly while in showcase, then fade */
      if (nowIn) {
        hud.classList.add('visible');
        clearTimeout(_hudTimer);
        _hudTimer = setTimeout(function () {
          if (!_busy) updateHUD(_idx);
        }, 2200);
      } else {
        hud.classList.remove('visible');
      }
    }, { passive: true });

    /* ── keyboard ── */
    document.addEventListener('keydown', function (e) {
      if (!inShowcase()) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        if (e.target === document.body || e.target === document.documentElement) {
          e.preventDefault();
          go(1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (e.target === document.body || e.target === document.documentElement) {
          e.preventDefault();
          go(-1);
        }
      }
    });

    /* ── touch navigation ────────────────────────────────────────
     *  act-drop (UML diagram): free scroll — finger drags the
     *  animation at natural pace, no lock.
     *
     *  All other acts: scroll locked, tap to advance.
     *    Tap right 75% → next stop
     *    Tap left  25% → previous stop
     *    Swipe up  ≥35px → next  |  Swipe down ≥35px → previous
     *    Tap/swipe past boundary → exits the showcase section.
     * ─────────────────────────────────────────────────────────── */
    (function () {
      if (!('ontouchstart' in window)) return;

      var showcase = document.getElementById('uml-showcase');
      var _tY = 0, _tX = 0, _tT = 0;

      document.addEventListener('touchstart', function (e) {
        _tY = e.touches[0].clientY;
        _tX = e.touches[0].clientX;
        _tT = Date.now();
      }, { passive: true });

      /* Lock scroll everywhere in showcase EXCEPT act-drop */
      document.addEventListener('touchmove', function (e) {
        if (inShowcase() && !inActDrop()) e.preventDefault();
      }, { passive: false });

      document.addEventListener('touchend', function (e) {
        if (!inShowcase()) return;

        var dy  = _tY - e.changedTouches[0].clientY;
        var adx = Math.abs(_tX - e.changedTouches[0].clientX);
        var ady = Math.abs(dy);
        var dt  = Date.now() - _tT;
        var isTap   = ady < 18 && adx < 18 && dt < 350;
        var isSwipe = ady >= 35 && ady > adx;

        /* act-drop (diagram): swipes scroll the animation naturally —
           only honour TAPS so the user can still advance to the next stop. */
        if (inActDrop() && !isTap) return;

        if (!isTap && !isSwipe) return;

        var dir = isTap
          ? (e.changedTouches[0].clientX < window.innerWidth * 0.25 ? -1 : 1)
          : (dy > 0 ? 1 : -1);

        /* Boundary exits */
        if (dir > 0 && _idx >= STOPS.length - 1) {
          if (showcase) window.scrollTo({ top: window.scrollY + showcase.getBoundingClientRect().bottom + 40, behavior: 'smooth' });
          return;
        }
        if (dir < 0 && _idx <= 0) {
          if (showcase) window.scrollTo({ top: window.scrollY + showcase.getBoundingClientRect().top - window.innerHeight - 40, behavior: 'smooth' });
          return;
        }

        go(dir);
      }, { passive: true });
    })();

  })();

})();
