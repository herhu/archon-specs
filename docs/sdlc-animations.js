// sdlc-animations.js — Archon Specs SDLC page animations
// GSAP-powered. Loaded after GSAP core + ScrollTrigger.
// Isolated IIFE — no globals.

(function () {
  'use strict';

  if (typeof gsap === 'undefined') return;

  // Register plugins
  if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  // The page scrolls inside .content-area, not the window
  var SCROLLER = document.querySelector('.content-area') || window;
  if (typeof ScrollTrigger !== 'undefined' && SCROLLER !== window) {
    ScrollTrigger.defaults({ scroller: SCROLLER });
  }

  // Respect reduced-motion preference
  var mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', function () {

    // ─── 1. SDLC Phase explorer: staggered pop-in ──────────────────────────────
    var phaseWrap = document.getElementById('sdlc-phases');
    if (phaseWrap) {
      var phases     = Array.from(phaseWrap.querySelectorAll('.sdlc-phase'));
      var connectors = Array.from(phaseWrap.querySelectorAll('.sdlc-connector'));

      // Set initial state
      gsap.set(phases, { opacity: 0, y: 22, scale: 0.88 });
      gsap.set(connectors, { opacity: 0, x: -8 });

      ScrollTrigger.create({
        trigger: phaseWrap,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          var tl = gsap.timeline();
          tl.to(phases, {
            opacity: 1, y: 0, scale: 1,
            duration: 0.45, stagger: 0.09, ease: 'back.out(1.7)'
          }).to(connectors, {
            opacity: 1, x: 0,
            duration: 0.28, stagger: 0.06, ease: 'power2.out'
          }, '-=0.3');
        }
      });
    }

    // ─── 2. Failure cards: bounce cascade ──────────────────────────────────────
    var failureCards = document.querySelectorAll('.failure-card');
    if (failureCards.length) {
      gsap.set(failureCards, { opacity: 0, y: 24, scale: 0.92 });
      ScrollTrigger.create({
        trigger: failureCards[0].parentElement,
        start: 'top 78%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(failureCards), {
            opacity: 1, y: 0, scale: 1,
            duration: 0.44, stagger: 0.12, ease: 'back.out(1.5)'
          });
        }
      });
    }

    // ─── 3. Mapping table: time values count down on scroll ────────────────────
    // Target cells with class .mapping-time-new (the "~45 min", "< 60 sec" cells)
    // Parse numeric value and animate from original to 0 (for time comparisons)
    var mappingTable = document.querySelector('.mapping-table');
    if (mappingTable) {
      // Animate rows sliding in
      var rows = Array.from(mappingTable.querySelectorAll('.mapping-row'));
      if (rows.length) {
        gsap.set(rows, { opacity: 0, x: -12 });
        ScrollTrigger.create({
          trigger: mappingTable,
          start: 'top 80%',
          once: true,
          onEnter: function () {
            gsap.to(rows, {
              opacity: 1, x: 0,
              duration: 0.35, stagger: 0.08, ease: 'power2.out'
            });
          }
        });
      }

      // Animate the highlighted time cells with a flash glow
      var timeCells = Array.from(mappingTable.querySelectorAll('.mapping-time-new'));
      if (timeCells.length) {
        ScrollTrigger.create({
          trigger: mappingTable,
          start: 'top 70%',
          once: true,
          onEnter: function () {
            gsap.fromTo(timeCells,
              { scale: 0.85, opacity: 0 },
              {
                scale: 1, opacity: 1,
                duration: 0.5, stagger: 0.1, ease: 'back.out(1.8)',
                delay: 0.4 // after rows have slid in
              }
            );
          }
        });
      }
    }

    // ─── 4. Start grid cards: pop in ───────────────────────────────────────────
    var startCards = document.querySelectorAll('.start-card');
    if (startCards.length) {
      gsap.set(startCards, { opacity: 0, y: 20 });
      ScrollTrigger.create({
        trigger: startCards[0].parentElement,
        start: 'top 80%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(startCards), {
            opacity: 1, y: 0,
            duration: 0.42, stagger: 0.1, ease: 'power2.out'
          });
        }
      });
    }

    // ─── 5. Section headings: slide in from left ───────────────────────────────
    var sectionTags = document.querySelectorAll('.section-tag');
    if (sectionTags.length) {
      gsap.set(sectionTags, { opacity: 0, x: -14 });
      sectionTags.forEach(function (tag) {
        ScrollTrigger.create({
          trigger: tag,
          start: 'top 88%',
          once: true,
          onEnter: function () {
            gsap.to(tag, {
              opacity: 1, x: 0,
              duration: 0.35, ease: 'power2.out'
            });
          }
        });
      });
    }

    // ─── 6. SDLC phase-detail panel: slide + fade ──────────────────────────────
    // Enhance the existing click handler with GSAP (detail panel already built in sdlc.html)
    var detailPanel = document.getElementById('sdlc-detail');
    if (detailPanel) {
      // Override opacity on reveal
      var origDisplay = detailPanel.style.display;
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            if (detailPanel.style.display !== 'none' && detailPanel.style.display !== origDisplay) {
              gsap.fromTo(detailPanel,
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' }
              );
              origDisplay = detailPanel.style.display;
            }
          }
        });
      });
      observer.observe(detailPanel, { attributes: true });
    }

    // ─── 7. Related cards: stagger ─────────────────────────────────────────────
    var relatedCards = document.querySelectorAll('.related-card');
    if (relatedCards.length) {
      gsap.set(relatedCards, { opacity: 0, y: 16 });
      ScrollTrigger.create({
        trigger: relatedCards[0].parentElement,
        start: 'top 82%',
        once: true,
        onEnter: function () {
          gsap.to(Array.from(relatedCards), {
            opacity: 1, y: 0,
            duration: 0.38, stagger: 0.08, ease: 'power2.out'
          });
        }
      });
    }

  }); // end matchMedia no-preference

  // Reduced motion: just make everything visible
  mm.add('(prefers-reduced-motion: reduce)', function () {
    document.querySelectorAll('.failure-card, .start-card, .related-card, .section-tag, .sdlc-phase, .sdlc-connector').forEach(function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  });

})();
