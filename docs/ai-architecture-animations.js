// ai-architecture-animations.js — Archon Specs AI Architecture page animations
// GSAP-powered. Loaded after GSAP core + ScrollTrigger.
// Isolated IIFE — no globals.

(function () {
  'use strict';

  if (typeof gsap === 'undefined') return;

  if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  // The page scrolls inside .content-area, not the window
  var SCROLLER = document.querySelector('.content-area') || window;
  if (typeof ScrollTrigger !== 'undefined' && SCROLLER !== window) {
    ScrollTrigger.defaults({ scroller: SCROLLER });
  }

  var mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', function () {

    // ─── 1. Two-meanings grid: cards flip in ───────────────────────────────────
    var meaningGrid = document.querySelector('.aia-meaning-grid');
    if (meaningGrid) {
      var cards = Array.from(meaningGrid.querySelectorAll('.aia-meaning-card'));
      gsap.set(cards, { opacity: 0, y: 24, scale: 0.92 });
      ScrollTrigger.create({
        trigger: meaningGrid,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(cards, {
            opacity: 1, y: 0, scale: 1,
            duration: 0.46, stagger: 0.14, ease: 'back.out(1.5)'
          });
        }
      });
    }

    // ─── 2. Stat strip: numbers count up ───────────────────────────────────────
    var statStrip = document.querySelector('.aia-stat-strip');
    if (statStrip) {
      var stats = Array.from(statStrip.querySelectorAll('.aia-stat-num'));

      gsap.set(statStrip, { opacity: 0, y: 18 });
      ScrollTrigger.create({
        trigger: statStrip,
        start: 'top 82%',
        once: true,
        onEnter: function () {
          // Fade in the strip first
          gsap.to(statStrip, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });

          // Count up each stat
          stats.forEach(function (el) {
            var text    = el.textContent.trim();
            var suffix  = text.replace(/[\d.]/g, ''); // '%', '×', or ''
            var numStr  = text.replace(/[^\d.]/g, '');
            var target  = parseFloat(numStr);
            if (isNaN(target) || target === 0) return;

            var state = { val: 0 };
            gsap.to(state, {
              val: target,
              duration: 1.4,
              delay: 0.3,
              ease: 'power2.out',
              onUpdate: function () {
                var display = target % 1 === 0
                  ? Math.round(state.val)
                  : state.val.toFixed(1);
                el.textContent = display + suffix;
              },
              onComplete: function () {
                el.textContent = text; // restore exact original
              }
            });
          });
        }
      });
    }

    // ─── 3. Compiler diagram: staged animation ─────────────────────────────────
    var compilerDiagram = document.querySelector('.aia-compiler-diagram');
    if (compilerDiagram) {
      var inputBox  = compilerDiagram.querySelector('.aia-compiler-input');
      var arrowEl   = compilerDiagram.querySelector('.aia-compiler-arrow');
      var outputBox = compilerDiagram.querySelector('.aia-compiler-outputs');
      var outItems  = Array.from(compilerDiagram.querySelectorAll('.aia-compiler-out'));

      gsap.set([inputBox, arrowEl, outputBox].filter(Boolean), { opacity: 0 });
      gsap.set(outItems, { opacity: 0, x: 12 });

      ScrollTrigger.create({
        trigger: compilerDiagram,
        start: 'top 78%',
        once: true,
        onEnter: function () {
          var tl = gsap.timeline();

          // 1. Input box fades in
          tl.to(inputBox, { opacity: 1, duration: 0.38, ease: 'power2.out' })

          // 2. Arrow pulses with orange glow
          .to(arrowEl, { opacity: 1, duration: 0.28, ease: 'power2.out' }, '+=0.1')
          .to(arrowEl, {
            boxShadow: '0 0 24px rgba(255,93,1,0.5)',
            duration: 0.3, yoyo: true, repeat: 3, ease: 'power2.inOut'
          }, '+=0.1')

          // 3. Output box fades in
          .to(outputBox, { opacity: 1, duration: 0.32, ease: 'power2.out' }, '-=0.2')

          // 4. Output items stagger in from right
          .to(outItems, {
            opacity: 1, x: 0,
            duration: 0.28, stagger: 0.07, ease: 'back.out(1.3)'
          }, '-=0.1');
        }
      });
    }

    // ─── 4. Agent pipeline: nodes and content stagger ─────────────────────────
    var pipeline = document.querySelector('.aia-agent-pipeline');
    if (pipeline) {
      var agentRows    = Array.from(pipeline.querySelectorAll('.aia-agent-row'));
      var agentNodes   = Array.from(pipeline.querySelectorAll('.aia-agent-node'));
      var agentContent = Array.from(pipeline.querySelectorAll('.aia-agent-content'));

      gsap.set(agentNodes, { opacity: 0, scale: 0 });
      gsap.set(agentContent, { opacity: 0, x: 18 });

      ScrollTrigger.create({
        trigger: pipeline,
        start: 'top 78%',
        once: true,
        onEnter: function () {
          var tl = gsap.timeline();

          agentNodes.forEach(function (node, i) {
            // Node pops in
            tl.to(node, {
              opacity: 1, scale: 1,
              duration: 0.38, ease: 'back.out(2)'
            }, i * 0.18)
            // Content slides in alongside
            .to(agentContent[i], {
              opacity: 1, x: 0,
              duration: 0.36, ease: 'power2.out'
            }, i * 0.18 + 0.1);
          });
        }
      });
    }

    // ─── 5. Compare table rows: slide in ───────────────────────────────────────
    var compareTable = document.querySelector('.aia-compare-table');
    if (compareTable) {
      var cRows = Array.from(compareTable.querySelectorAll('.aia-compare-row'));
      gsap.set(cRows, { opacity: 0, x: -10 });
      ScrollTrigger.create({
        trigger: compareTable,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(cRows, {
            opacity: 1, x: 0,
            duration: 0.3, stagger: 0.065, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 6. Pattern cards: pop in ──────────────────────────────────────────────
    var patternGrid = document.querySelector('.aia-pattern-grid');
    if (patternGrid) {
      var patCards = Array.from(patternGrid.querySelectorAll('.aia-pattern-card'));
      gsap.set(patCards, { opacity: 0, y: 20, scale: 0.93 });
      ScrollTrigger.create({
        trigger: patternGrid,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(patCards, {
            opacity: 1, y: 0, scale: 1,
            duration: 0.42, stagger: 0.1, ease: 'back.out(1.4)'
          });
        }
      });
    }

    // ─── 7. Start grid cards: pop in ───────────────────────────────────────────
    var startCards = document.querySelectorAll('.start-card');
    if (startCards.length) {
      gsap.set(startCards, { opacity: 0, y: 20 });
      ScrollTrigger.create({
        trigger: startCards[0].parentElement,
        start: 'top 82%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(startCards), {
            opacity: 1, y: 0,
            duration: 0.4, stagger: 0.1, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 8. Related cards: stagger ─────────────────────────────────────────────
    var relCards = document.querySelectorAll('.related-card');
    if (relCards.length) {
      gsap.set(relCards, { opacity: 0, y: 14 });
      ScrollTrigger.create({
        trigger: relCards[0].parentElement,
        start: 'top 82%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(relCards), {
            opacity: 1, y: 0,
            duration: 0.36, stagger: 0.08, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 9. Section tags: slide in ─────────────────────────────────────────────
    document.querySelectorAll('.section-tag').forEach(function (tag) {
      gsap.set(tag, { opacity: 0, x: -12 });
      ScrollTrigger.create({
        trigger: tag,
        start: 'top 90%',
        once: true,
        onEnter: function () {
          gsap.to(tag, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' });
        }
      });
    });

    // ─── 10. Callouts: fade up ────────────────────────────────────────────────
    document.querySelectorAll('.callout').forEach(function (callout) {
      gsap.set(callout, { opacity: 0, y: 12 });
      ScrollTrigger.create({
        trigger: callout,
        start: 'top 85%',
        once: true,
        onEnter: function () {
          gsap.to(callout, { opacity: 1, y: 0, duration: 0.38, ease: 'power2.out' });
        }
      });
    });

    // ─── 11. Quickstart strip steps: left-to-right ────────────────────────────
    var qsStrip = document.querySelector('.quickstart-strip');
    if (qsStrip) {
      var qsSteps  = Array.from(qsStrip.querySelectorAll('.qs-step'));
      var qsArrows = Array.from(qsStrip.querySelectorAll('.qs-arrow'));

      gsap.set(qsSteps, { opacity: 0, y: 10 });
      gsap.set(qsArrows, { opacity: 0 });

      ScrollTrigger.create({
        trigger: qsStrip,
        start: 'top 84%',
        once: true,
        onEnter: function () {
          var tl = gsap.timeline();
          qsSteps.forEach(function (step, i) {
            tl.to(step, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' }, i * 0.14);
            if (qsArrows[i]) {
              tl.to(qsArrows[i], { opacity: 1, duration: 0.2 }, i * 0.14 + 0.18);
            }
          });
        }
      });
    }

  }); // end no-preference

  // Reduced-motion fallback
  mm.add('(prefers-reduced-motion: reduce)', function () {
    var selectors = '.aia-meaning-card, .aia-stat-strip, .aia-compiler-input, .aia-compiler-arrow, .aia-compiler-outputs, .aia-compiler-out, .aia-agent-node, .aia-agent-content, .aia-compare-row, .aia-pattern-card, .start-card, .related-card, .section-tag, .callout, .qs-step, .qs-arrow';
    document.querySelectorAll(selectors).forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  });

  // Refresh ScrollTrigger after layout settles
  if (typeof ScrollTrigger !== 'undefined') {
    setTimeout(function () { ScrollTrigger.refresh(); }, 200);
  }

})();
