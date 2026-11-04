// guides-journey.js — Archon Specs animated build journey
// GSAP-powered: all sequences run on proper timelines (killable, scrubbable).
// Loads after GSAP + plugins. Isolated IIFE — no globals.

(function () {
  'use strict';

  // ─── Phase definitions ───────────────────────────────────────────────────────
  var PHASES = [
    {
      id: 'spec',
      agentPhase: 'You',
      agentIcon: '💬',
      agentName: 'Plain language',
      agentRole: 'Describe your system in any words you like. No syntax to learn. No schema to fill in. Just talk to your AI agent the way you normally would.',
      agentOutput: 'spec.archon',
      agentColor: '#ff5d01',
      leftLabel: 'Your intent',
      renderLeft: renderSpec,
    },
    {
      id: 'analyst',
      agentPhase: 'Phase 1 · Discovery',
      agentIcon: '🧭',
      agentName: 'The Analyst',
      agentRole: 'Extracts business rules, actors, domain events, and constraints. Asks focused questions to pin down what you really need. Locks everything into a Requirement Contract.',
      agentOutput: 'RequirementContract.json',
      agentColor: '#60a5fa',
      leftLabel: 'Domains detected',
      renderLeft: renderAnalyst,
    },
    {
      id: 'architect',
      agentPhase: 'Phase 2 · System Design',
      agentIcon: '📐',
      agentName: 'The Architect',
      agentRole: 'Maps requirements into bounded contexts, draws the UML class diagram you\'ll approve, wires module dependencies. You iterate until the diagram matches your intent.',
      agentOutput: 'ArchitectureContract.json',
      agentColor: '#c084fc',
      leftLabel: 'Domain architecture',
      renderLeft: renderArchitect,
    },
    {
      id: 'techlead',
      agentPhase: 'Phase 3 · Compilation',
      agentIcon: '🛡️',
      agentName: 'The Tech Lead',
      agentRole: 'Compiles every shard into a single DesignSpec.json, runs schema validation, fingerprints the spec for immutability, then produces the exact execution plan you review before anything ships.',
      agentOutput: 'DesignSpec.json',
      agentColor: '#f59e0b',
      leftLabel: 'Shards locked',
      renderLeft: renderTechLead,
    },
    {
      id: 'orchestrator',
      agentPhase: 'Phase 4 · Materialization',
      agentIcon: '⚙️',
      agentName: 'The Orchestrator',
      agentRole: 'Presents the execution plan, waits for your explicit approval token, then streams the entire codebase to disk. Hard block: rejects any materialize call that isn\'t in USER_APPROVED state.',
      agentOutput: 'ExecutionPlan.json',
      agentColor: '#10b981',
      leftLabel: 'Compiling',
      renderLeft: renderOrchestrator,
    },
    {
      id: 'developer',
      agentPhase: 'Phase 5 · Verification',
      agentIcon: '🔬',
      agentName: 'The Developer',
      agentRole: 'Verifies lineage, reconciles any file that drifted from the spec, logs every decision to .antigravity/decisions/. Your codebase never silently diverges from its source of truth.',
      agentOutput: '47 production files',
      agentColor: '#f472b6',
      leftLabel: 'Files materialized',
      renderLeft: renderDeveloper,
    },
  ];

  // ─── Content data ─────────────────────────────────────────────────────────────
  var SPEC_TEXT = [
    'Project {',
    '  name: BookingPlatform',
    '  version: 1.0',
    '}',
    '',
    'Room {',
    '  id: uuid primary',
    '  number: string',
    '  type: string',
    '  pricePerNight: decimal',
    '}',
    '',
    'Reservation {',
    '  id: uuid primary',
    '  roomId: Room',
    '  customerId: Customer',
    '  checkIn: datetime',
    '  checkOut: datetime',
    '  status: string',
    '}',
    '',
    'Customer {',
    '  id: uuid primary',
    '  email: string',
    '  name: string',
    '  phone: string',
    '}',
  ].join('\n');

  var DOMAINS = [
    { name: 'Booking',  entities: ['Room', 'Reservation'], color: '#60a5fa' },
    { name: 'Customer', entities: ['Customer', 'Profile'],  color: '#c084fc' },
    { name: 'Platform', entities: ['Auth', 'Health', 'Config', 'Logging'], color: '#f59e0b' },
  ];

  var SHARDS = [
    { name: 'booking.shard.json',  entities: 2, color: '#60a5fa' },
    { name: 'customer.shard.json', entities: 2, color: '#c084fc' },
    { name: 'auth.shard.json',     entities: 3, color: '#f59e0b' },
    { name: 'health.shard.json',   entities: 1, color: '#10b981' },
    { name: 'config.shard.json',   entities: 2, color: '#f472b6' },
    { name: 'infra.shard.json',    entities: 4, color: '#9daab6' },
  ];

  var COMPILE_STAGES = [
    'Parse spec shards',
    'Validate schema',
    'Fingerprint spec',
    'Build execution plan',
    'Await your approval →',
  ];

  var SAMPLE_FILES = [
    { path: 'src/modules/room/',         name: 'room.entity.ts',           ext: 'ts'     },
    { path: 'src/modules/room/',         name: 'room.controller.ts',        ext: 'ts'     },
    { path: 'src/modules/room/',         name: 'room.service.ts',           ext: 'ts'     },
    { path: 'src/modules/room/',         name: 'room.module.ts',            ext: 'ts'     },
    { path: 'src/modules/room/dto/',     name: 'create-room.dto.ts',        ext: 'ts'     },
    { path: 'src/modules/room/dto/',     name: 'update-room.dto.ts',        ext: 'ts'     },
    { path: 'src/modules/reservation/',  name: 'reservation.entity.ts',     ext: 'ts'     },
    { path: 'src/modules/reservation/',  name: 'reservation.controller.ts', ext: 'ts'     },
    { path: 'src/modules/reservation/',  name: 'reservation.service.ts',    ext: 'ts'     },
    { path: 'src/modules/reservation/',  name: 'reservation.module.ts',     ext: 'ts'     },
    { path: 'src/modules/customer/',     name: 'customer.entity.ts',        ext: 'ts'     },
    { path: 'src/modules/customer/',     name: 'customer.controller.ts',    ext: 'ts'     },
    { path: 'src/modules/customer/',     name: 'customer.service.ts',       ext: 'ts'     },
    { path: 'src/modules/customer/',     name: 'customer.module.ts',        ext: 'ts'     },
    { path: 'src/auth/',                 name: 'jwt.guard.ts',              ext: 'ts'     },
    { path: 'src/auth/',                 name: 'jwt.strategy.ts',           ext: 'ts'     },
    { path: 'src/auth/',                 name: 'auth.module.ts',            ext: 'ts'     },
    { path: 'src/config/',               name: 'database.config.ts',        ext: 'ts'     },
    { path: 'src/config/',               name: 'jwt.config.ts',             ext: 'ts'     },
    { path: 'src/shared/filters/',       name: 'http-exception.filter.ts',  ext: 'ts'     },
    { path: 'src/shared/middleware/',    name: 'rate-limit.middleware.ts',  ext: 'ts'     },
    { path: 'src/shared/interceptors/',  name: 'logging.interceptor.ts',    ext: 'ts'     },
    { path: 'src/health/',               name: 'health.controller.ts',      ext: 'ts'     },
    { path: 'src/health/',               name: 'health.module.ts',          ext: 'ts'     },
    { path: 'src/',                      name: 'app.module.ts',             ext: 'ts'     },
    { path: 'src/',                      name: 'main.ts',                   ext: 'ts'     },
    { path: 'migrations/',               name: '001_init_room.sql',         ext: 'sql'    },
    { path: 'migrations/',               name: '002_init_reservation.sql',  ext: 'sql'    },
    { path: 'migrations/',               name: '003_init_customer.sql',     ext: 'sql'    },
    { path: '',                          name: 'Dockerfile',                ext: 'docker' },
    { path: '',                          name: 'docker-compose.yml',        ext: 'yml'    },
    { path: '',                          name: 'Jenkinsfile',               ext: 'jenkins'},
    { path: 'terraform/',                name: 'main.tf',                   ext: 'tf'     },
    { path: 'terraform/',                name: 'variables.tf',              ext: 'tf'     },
    { path: '',                          name: '.env.example',              ext: 'env'    },
    { path: '',                          name: 'package.json',              ext: 'json'   },
    { path: '',                          name: 'tsconfig.json',             ext: 'json'   },
    { path: '',                          name: '.eslintrc.js',              ext: 'js'     },
    { path: '',                          name: '.prettierrc',               ext: 'json'   },
    { path: '',                          name: 'jest.config.ts',            ext: 'ts'     },
    { path: '',                          name: 'README.md',                 ext: 'md'     },
    { path: '',                          name: 'sonar-project.properties',  ext: 'props'  },
    { path: '',                          name: 'newrelic.js',               ext: 'js'     },
    { path: '.husky/',                   name: 'pre-commit',                ext: 'sh'     },
    { path: '.husky/',                   name: 'commit-msg',                ext: 'sh'     },
    { path: '',                          name: '.gitignore',                ext: 'git'    },
    { path: '',                          name: 'archon.config.json',        ext: 'json'   },
  ];

  var EXT_COLORS = {
    ts: '#60a5fa', js: '#f59e0b', sql: '#10b981', tf: '#c084fc',
    yml: '#f472b6', json: '#ff5d01', md: '#9daab6', sh: '#34d399',
    docker: '#2dd4bf', jenkins: '#e879f9', env: '#fbbf24',
    git: '#9daab6', props: '#9daab6',
  };

  var PIPELINE_DETAILS = [
    { i: 0, title: 'Parse',       desc: 'Reads the spec.archon DSL (or ASCII UML) and produces a DiagramIR — a language-agnostic intermediate representation of every entity, field, and relation.' },
    { i: 1, title: 'Transform',   desc: 'Converts DiagramIR into the structured DesignSpec.json, resolving cross-references, applying domain heuristics, and wiring Handlebars helpers to template slots.' },
    { i: 2, title: 'Validate',    desc: 'Runs Zod schema rules: minimum entity count, field type legality, foreign-key integrity, circular-dependency detection. Rejects before a byte of code is written.' },
    { i: 3, title: 'Plan',        desc: 'Diffs the DesignSpec against workspace state and produces an ExecutionPlan — the exact list of files to create, update, or preserve. You review and approve this plan.' },
    { i: 4, title: 'Generate',    desc: 'Feeds each DesignSpec module through Handlebars templates to produce TypeScript (NestJS + TypeORM), SQL migrations, Dockerfiles, CI configs. No LLM. Same output every time.' },
    { i: 5, title: 'Materialize', desc: 'Streams each generated file to disk via the governance gateway, computing a semantic hash for every @ArchonManual() block so manual edits survive future re-runs.' },
  ];

  // ─── State ────────────────────────────────────────────────────────────────────
  var currentStep = 0;
  var isUserControlled = false;
  var autoTimer = null;
  var activeTl = null; // single GSAP timeline — kill() on step change

  // ─── DOM refs ─────────────────────────────────────────────────────────────────
  var artifactEl, paneLabel, agentCardEl, dotsEls, stepLabelEl, prevBtn, nextBtn, wrapEl;

  // ─── Kill active animation timeline ─────────────────────────────────────────
  function killActiveTl() {
    if (activeTl) {
      activeTl.kill();
      activeTl = null;
    }
  }

  // ─── Left panel renderers ────────────────────────────────────────────────────

  function renderSpec(el) {
    el.innerHTML =
      '<div class="jny-spec-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge">spec.archon</span>' +
          '<span class="jny-typing-badge" id="jny-typing-badge">typing…</span>' +
        '</div>' +
        '<pre class="jny-spec-pre" id="jny-spec-text"></pre>' +
        '<span class="jny-cursor" id="jny-cursor">█</span>' +
      '</div>';

    var textEl  = document.getElementById('jny-spec-text');
    var cursor  = document.getElementById('jny-cursor');
    var badge   = document.getElementById('jny-typing-badge');
    if (!textEl) return;

    // GSAP typewriter: character-by-character via timeline onUpdate
    var chars = SPEC_TEXT.split('');
    var state = { count: 0 };
    activeTl = gsap.timeline();
    activeTl.to(state, {
      count: chars.length,
      duration: chars.length * 0.018,
      ease: 'none',
      onUpdate: function () {
        var n = Math.round(state.count);
        textEl.textContent = chars.slice(0, n).join('');
      },
      onComplete: function () {
        if (cursor) cursor.style.display = 'none';
        if (badge) { badge.textContent = 'done'; badge.classList.add('jny-typing-done'); }
      }
    });
  }

  function renderAnalyst(el) {
    var highlighted = SPEC_TEXT
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(Room|Reservation|Customer|Project)\s*\{/g, function (m) {
        return '<mark class="jny-entity-mark">' + m + '</mark>';
      });

    el.innerHTML =
      '<div class="jny-analyst-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge">spec.archon</span>' +
          '<span class="jny-file-badge jny-badge-blue">3 entities · 3 domains</span>' +
        '</div>' +
        '<pre class="jny-spec-pre jny-spec-dimmed">' + highlighted + '</pre>' +
        '<div class="jny-domain-chips" id="jny-domain-chips">' +
          '<div class="jny-domain-chip" style="border-color:#60a5fa;color:#60a5fa;">📦 Booking</div>' +
          '<div class="jny-domain-chip" style="border-color:#c084fc;color:#c084fc;">👤 Customer</div>' +
          '<div class="jny-domain-chip" style="border-color:#f59e0b;color:#f59e0b;">⚙️ Platform</div>' +
        '</div>' +
      '</div>';

    var chips = el.querySelectorAll('.jny-domain-chip');
    activeTl = gsap.timeline();
    activeTl.from(Array.from(chips), {
      opacity: 0, y: 12, scale: 0.9,
      duration: 0.38, stagger: 0.1, ease: 'back.out(1.6)'
    });
  }

  function renderArchitect(el) {
    var boxes = DOMAINS.map(function (d) {
      var chips = d.entities.map(function (e) {
        return '<span class="jny-entity-chip" style="border-color:' + d.color + '40;">' + e + '</span>';
      }).join('');
      return '<div class="jny-domain-box reveal-item" style="border-color:' + d.color + '28;background:' + d.color + '08;">' +
        '<div class="jny-domain-title" style="color:' + d.color + ';">' + d.name + '</div>' +
        '<div class="jny-domain-entities">' + chips + '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="jny-arch-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge">ArchitectureContract.json</span>' +
        '</div>' +
        '<div class="jny-domains-grid">' + boxes + '</div>' +
        '<div class="jny-approval-note">' +
          '<span class="jny-check">⟳</span> UML class diagram generated — <strong>awaiting your approval</strong>' +
        '</div>' +
      '</div>';

    activeTl = gsap.timeline();
    activeTl.from(Array.from(el.querySelectorAll('.jny-domain-box')), {
      opacity: 0, y: 18, scale: 0.88,
      duration: 0.42, stagger: 0.13, ease: 'back.out(1.4)'
    });
  }

  function renderTechLead(el) {
    var rows = SHARDS.map(function (s) {
      return '<div class="jny-shard-row reveal-item">' +
        '<span class="jny-shard-icon" style="color:' + s.color + ';">🔒</span>' +
        '<span class="jny-shard-name">' + s.name + '</span>' +
        '<span class="jny-shard-meta">' + s.entities + ' entities</span>' +
        '<span class="jny-shard-badge" style="background:' + s.color + '18;color:' + s.color + ';">locked</span>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="jny-shards-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge">DesignSpec.json</span>' +
          '<span class="jny-file-badge jny-badge-ok">6 shards compiled</span>' +
        '</div>' +
        rows +
        '<div class="jny-compile-done">' +
          '<span class="jny-check-ok">✓</span> Spec fingerprinted — execution plan ready' +
        '</div>' +
      '</div>';

    activeTl = gsap.timeline();
    activeTl.from(Array.from(el.querySelectorAll('.jny-shard-row')), {
      opacity: 0, x: -10,
      duration: 0.28, stagger: 0.07, ease: 'power2.out'
    });
  }

  function renderOrchestrator(el) {
    var stageRows = COMPILE_STAGES.map(function (label, i) {
      var isApproval = i === COMPILE_STAGES.length - 1;
      return '<div class="jny-compile-row" data-ci="' + i + '">' +
        '<span class="jny-stage-dot" id="jny-sdot-' + i + '"></span>' +
        '<span class="jny-stage-label">' + label + '</span>' +
        '<span class="jny-stage-ok" id="jny-sok-' + i + '" style="opacity:0;color:' +
          (isApproval ? 'var(--brand)' : '#10b981') + ';">' +
          (isApproval ? '✓ APPROVED' : '✓') +
        '</span>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="jny-orchestrator-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge">ExecutionPlan.json</span>' +
        '</div>' +
        '<div class="jny-compile-stages">' + stageRows + '</div>' +
        '<div class="jny-prog-wrap">' +
          '<div class="jny-prog-bar" id="jny-prog-bar" style="width:0%"></div>' +
        '</div>' +
        '<div class="jny-prog-label" id="jny-prog-label">initializing…</div>' +
      '</div>';

    // Build a single GSAP timeline for the compile sequence
    var stages    = Array.from(el.querySelectorAll('.jny-compile-row'));
    var bar       = el.querySelector('#jny-prog-bar');
    var labelEl   = el.querySelector('#jny-prog-label');
    var stepLabels = ['Parsing spec…', 'Validating schema…', 'Fingerprinting…', 'Planning…', 'Awaiting approval…'];

    activeTl = gsap.timeline({ delay: 0.2 });

    stages.forEach(function (row, idx) {
      var okEl  = el.querySelector('#jny-sok-' + idx);
      var pct   = ((idx + 1) / stages.length * 100).toFixed(1) + '%';

      activeTl
        // Activate the row
        .call(function () {
          stages.forEach(function (r) { r.classList.remove('active'); });
          row.classList.add('active');
          if (labelEl) labelEl.textContent = stepLabels[idx] || '';
        })
        // Animate progress bar
        .to(bar, { width: pct, duration: 0.4, ease: 'power2.out' })
        // Show checkmark
        .to(okEl, { opacity: 1, duration: 0.2 }, '-=0.1')
        // Hold before next stage
        .addPause('+=' + (idx < stages.length - 1 ? 0.3 : 0));
    });
  }

  function renderDeveloper(el) {
    var fileRows = SAMPLE_FILES.map(function (f) {
      var color = EXT_COLORS[f.ext] || '#9daab6';
      return '<div class="jny-file-row">' +
        '<span class="jny-file-ext" style="color:' + color + ';">' + f.ext + '</span>' +
        '<span class="jny-file-path">' +
          (f.path ? '<span class="jny-file-dir">' + f.path + '</span>' : '') +
          '<strong>' + f.name + '</strong>' +
        '</span>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="jny-files-wrap">' +
        '<div class="jny-pane-bar">' +
          '<span class="jny-file-badge jny-badge-ok">Production workspace</span>' +
          '<span class="jny-file-counter" id="jny-file-counter">0 / ' + SAMPLE_FILES.length + ' files</span>' +
        '</div>' +
        '<div class="jny-file-list" id="jny-file-list">' + fileRows + '</div>' +
        '<div class="jny-final-note" id="jny-final-note" style="opacity:0">' +
          '<span class="jny-check-ok">✓</span> ' + SAMPLE_FILES.length + ' files · zero hallucinations · production baseline' +
        '</div>' +
      '</div>';

    var rows      = Array.from(el.querySelectorAll('.jny-file-row'));
    var counterEl = el.querySelector('#jny-file-counter');
    var noteEl    = el.querySelector('#jny-final-note');
    var state     = { val: 0 };

    // Single timeline: stagger file rows + counter tick + final note
    activeTl = gsap.timeline();

    activeTl
      .from(rows, {
        opacity: 0, x: -8,
        duration: 0.18,
        stagger: 0.032,
        ease: 'power2.out'
      })
      .to(state, {
        val: SAMPLE_FILES.length,
        duration: rows.length * 0.032,
        ease: 'none',
        onUpdate: function () {
          if (counterEl) {
            counterEl.textContent = Math.round(state.val) + ' / ' + SAMPLE_FILES.length + ' files';
          }
        }
      }, '<') // start counter at same time as file rows
      .to(noteEl, {
        opacity: 1, y: 0,
        duration: 0.4, ease: 'power2.out'
      }, '+=0.2');
  }

  // ─── Agent card render ────────────────────────────────────────────────────────
  function renderAgent(phase) {
    if (!agentCardEl) return;
    agentCardEl.innerHTML =
      '<div class="jny-agent-phase" style="color:' + phase.agentColor + ';">' + phase.agentPhase + '</div>' +
      '<div class="jny-agent-icon">' + phase.agentIcon + '</div>' +
      '<div class="jny-agent-name">' + phase.agentName + '</div>' +
      '<p class="jny-agent-role">' + phase.agentRole + '</p>' +
      '<div class="jny-agent-output">' +
        '<span class="jny-output-label">Output artifact</span>' +
        '<code class="jny-output-value">' + phase.agentOutput + '</code>' +
      '</div>';
  }

  // ─── Step machine ─────────────────────────────────────────────────────────────
  function goToStep(n) {
    if (n < 0 || n >= PHASES.length) return;
    isUserControlled = true;
    clearAutoTimer();
    currentStep = n;
    renderStep();
  }

  function renderStep() {
    var phase = PHASES[currentStep];

    // Kill any running animation timeline
    killActiveTl();

    // Dots
    dotsEls.forEach(function (d, i) { d.classList.toggle('active', i === currentStep); });

    // Label
    if (stepLabelEl) stepLabelEl.textContent = (currentStep + 1) + ' of ' + PHASES.length;

    // Buttons
    if (prevBtn) prevBtn.disabled = currentStep === 0;
    if (nextBtn) {
      nextBtn.textContent = currentStep === PHASES.length - 1 ? '✓ Complete' : 'Next →';
      nextBtn.disabled = currentStep === PHASES.length - 1;
    }

    // Update pane label
    if (paneLabel) paneLabel.textContent = phase.leftLabel;

    // Animate out → render → animate in
    var targets = [artifactEl, agentCardEl].filter(Boolean);
    gsap.to(targets, {
      opacity: 0, y: 8, duration: 0.16, ease: 'power2.in',
      onComplete: function () {
        phase.renderLeft(artifactEl);
        renderAgent(phase);
        gsap.to(targets, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', stagger: 0.04 });
      }
    });
  }

  // ─── Auto-advance ─────────────────────────────────────────────────────────────
  function clearAutoTimer() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  function scheduleAutoAdvance() {
    clearAutoTimer();
    if (isUserControlled) return;
    autoTimer = setTimeout(function () {
      if (!isUserControlled && currentStep < PHASES.length - 1) {
        currentStep++;
        renderStep();
        scheduleAutoAdvance();
      }
    }, 3400);
  }

  // ─── Pipeline interactive ─────────────────────────────────────────────────────
  function initPipeline() {
    var stages   = document.querySelectorAll('.pipeline-stage');
    var detailEl = document.getElementById('pipeline-detail');
    if (!stages.length || !detailEl) return;

    stages.forEach(function (g) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', function () {
        var i    = parseInt(g.getAttribute('data-i'), 10);
        var info = PIPELINE_DETAILS[i];
        if (!info) return;

        // Highlight clicked rect with orange flash
        var rect = g.querySelector('rect');
        if (rect) {
          gsap.fromTo(rect,
            { fill: '#ff5d01' },
            { fill: '', duration: 0.6, ease: 'power2.out', clearProps: 'fill' }
          );
        }

        stages.forEach(function (s) { s.classList.remove('pipeline-stage-active'); });
        g.classList.add('pipeline-stage-active');

        detailEl.innerHTML =
          '<div class="pipeline-detail-inner">' +
            '<strong>' + info.title + '</strong> — ' + info.desc +
          '</div>';

        gsap.fromTo(detailEl,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' }
        );
        detailEl.style.display = 'block';
      });
    });
  }

  // ─── Scroll reveal ────────────────────────────────────────────────────────────
  function initReveal() {
    var revEls = document.querySelectorAll('.reveal');
    if (!revEls.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
    revEls.forEach(function (el) { obs.observe(el); });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    wrapEl = document.getElementById('journey-wrap');
    if (!wrapEl) return;

    artifactEl  = document.getElementById('journey-artifact');
    paneLabel   = document.getElementById('journey-pane-label');
    agentCardEl = document.getElementById('journey-agent-card');
    dotsEls     = Array.from(document.querySelectorAll('.jny-dot'));
    stepLabelEl = document.getElementById('jny-step-label');
    prevBtn     = document.getElementById('jny-prev');
    nextBtn     = document.getElementById('jny-next');

    // Dot clicks
    dotsEls.forEach(function (d, i) {
      d.addEventListener('click', function () { goToStep(i); });
    });

    // Prev / Next buttons
    if (prevBtn) prevBtn.addEventListener('click', function () { goToStep(currentStep - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (currentStep < PHASES.length - 1) goToStep(currentStep + 1);
    });

    // Keyboard ← →
    document.addEventListener('keydown', function (e) {
      if (!wrapEl) return;
      var rect = wrapEl.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goToStep(currentStep + (e.key === 'ArrowRight' ? 1 : -1));
      }
    });

    // IntersectionObserver — auto-start when section enters viewport
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !isUserControlled) {
          renderStep();
          scheduleAutoAdvance();
        }
      });
    }, { threshold: 0.25 });
    io.observe(wrapEl);

    // Render initial state
    renderStep();
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────────
  function bootstrap() {
    // Register TextPlugin if available
    if (typeof gsap !== 'undefined' && typeof TextPlugin !== 'undefined') {
      gsap.registerPlugin(TextPlugin);
    }
    init();
    initReveal();
    initPipeline();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
