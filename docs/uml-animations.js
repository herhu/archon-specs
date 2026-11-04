// uml-animations.js — Archon Specs UML page animations
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

    // ─── 1. Diagram grid: card cascade ─────────────────────────────────────────
    // 14 cards shuffle in like cards dealt onto a table
    var diagGrid = document.querySelector('.uml-diagram-grid');
    if (diagGrid) {
      var cards = Array.from(diagGrid.querySelectorAll('.uml-diagram-card'));
      gsap.set(cards, { opacity: 0, scale: 0.88, y: 16 });

      ScrollTrigger.create({
        trigger: diagGrid,
        start: 'top 78%',
        once: true,
        onEnter: function () {
          gsap.to(cards, {
            opacity: 1, scale: 1, y: 0,
            duration: 0.38,
            stagger: { each: 0.045, from: 'start' },
            ease: 'back.out(1.4)'
          });
        }
      });
    }

    // ─── 2. UML category titles: slide in ──────────────────────────────────────
    var catTitles = document.querySelectorAll('.uml-category-title');
    catTitles.forEach(function (title) {
      gsap.set(title, { opacity: 0, x: -12 });
      ScrollTrigger.create({
        trigger: title,
        start: 'top 88%',
        once: true,
        onEnter: function () {
          gsap.to(title, { opacity: 1, x: 0, duration: 0.32, ease: 'power2.out' });
        }
      });
    });

    // ─── 3. UML spec list items: stagger ───────────────────────────────────────
    var specList = document.querySelector('.uml-spec-list');
    if (specList) {
      var items = Array.from(specList.querySelectorAll('.uml-spec-item'));
      gsap.set(items, { opacity: 0, x: -8 });
      ScrollTrigger.create({
        trigger: specList,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(items, {
            opacity: 1, x: 0,
            duration: 0.3, stagger: 0.07, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 4. Mermaid diagram frame: reveal + line draw effect ───────────────────
    var mermaidFrame = document.querySelector('.uml-diagram-frame');
    if (mermaidFrame) {
      gsap.set(mermaidFrame, { opacity: 0, y: 20 });

      ScrollTrigger.create({
        trigger: mermaidFrame,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(mermaidFrame, {
            opacity: 1, y: 0,
            duration: 0.5, ease: 'power2.out',
            onComplete: function () {
              // After Mermaid has rendered, animate the SVG elements
              animateMermaidSvg();
            }
          });
        }
      });
    }

    // ─── 5. Flow strip steps: sequential left-to-right reveal ──────────────────
    var flowStrip = document.querySelector('.uml-flow-strip');
    if (flowStrip) {
      var steps  = Array.from(flowStrip.querySelectorAll('.uml-flow-step'));
      var arrows = Array.from(flowStrip.querySelectorAll('.uml-flow-arrow'));

      gsap.set(steps, { opacity: 0, y: 12 });
      gsap.set(arrows, { opacity: 0, scaleX: 0, transformOrigin: 'left center' });

      ScrollTrigger.create({
        trigger: flowStrip,
        start: 'top 82%',
        once: true,
        onEnter: function () {
          var tl = gsap.timeline();
          steps.forEach(function (step, i) {
            tl.to(step, { opacity: 1, y: 0, duration: 0.32, ease: 'back.out(1.4)' }, i * 0.18);
            if (arrows[i]) {
              tl.to(arrows[i], { opacity: 1, scaleX: 1, duration: 0.22, ease: 'power2.out' }, i * 0.18 + 0.2);
            }
          });
        }
      });
    }

    // ─── 6. Compile table rows: slide in ───────────────────────────────────────
    var compileTable = document.querySelector('.uml-compile-table');
    if (compileTable) {
      var cRows = Array.from(compileTable.querySelectorAll('.uml-compile-row'));
      gsap.set(cRows, { opacity: 0, x: -10 });
      ScrollTrigger.create({
        trigger: compileTable,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(cRows, {
            opacity: 1, x: 0,
            duration: 0.32, stagger: 0.07, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 7. Failure cards: bounce ──────────────────────────────────────────────
    var failCards = document.querySelectorAll('.failure-card');
    if (failCards.length) {
      gsap.set(failCards, { opacity: 0, y: 20, scale: 0.93 });
      ScrollTrigger.create({
        trigger: failCards[0].parentElement,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(failCards), {
            opacity: 1, y: 0, scale: 1,
            duration: 0.42, stagger: 0.11, ease: 'back.out(1.5)'
          });
        }
      });
    }

    // ─── 8. Section tags: slide left ───────────────────────────────────────────
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

    // ─── 9. Related cards: stagger ─────────────────────────────────────────────
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

  }); // end no-preference

  // ─── Mermaid SVG animation (runs after Mermaid renders) ──────────────────────
  function animateMermaidSvg() {
    // Wait a tick for Mermaid to finish rendering
    setTimeout(function () {
      var mermaidSvg = document.querySelector('.mermaid svg');
      if (!mermaidSvg) return;

      // Find class boxes (foreignObject or rect elements that are nodes)
      var nodes = Array.from(mermaidSvg.querySelectorAll('.node, .classGroup, [class*="node"]'));
      if (!nodes.length) {
        // Fallback: animate all rect and path elements
        nodes = Array.from(mermaidSvg.querySelectorAll('rect, .label'));
      }

      if (nodes.length) {
        gsap.from(nodes, {
          opacity: 0, scale: 0.85, transformOrigin: 'center center',
          duration: 0.4, stagger: 0.12, ease: 'back.out(1.3)'
        });
      }

      // Animate relationship lines drawing in
      var lines = Array.from(mermaidSvg.querySelectorAll('path.relation, path[class*="relation"], line, .edge path'));
      if (lines.length) {
        lines.forEach(function (line) {
          var len = line.getTotalLength ? line.getTotalLength() : 100;
          gsap.set(line, {
            strokeDasharray: len,
            strokeDashoffset: len
          });
        });
        gsap.to(lines, {
          strokeDashoffset: 0,
          duration: 0.8, stagger: 0.15, ease: 'power2.inOut',
          delay: 0.3
        });
      }
    }, 300);
  }

  // Reduced motion fallback
  mm.add('(prefers-reduced-motion: reduce)', function () {
    var selectors = '.uml-diagram-card, .uml-spec-item, .uml-flow-step, .uml-flow-arrow, .uml-compile-row, .failure-card, .related-card, .section-tag, .uml-category-title, .uml-diagram-frame';
    document.querySelectorAll(selectors).forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  });

})();
