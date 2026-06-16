/* ============================================================
   YORE COPROCESSOR — front-end behaviour
   ============================================================ */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = (a, b) => a + Math.random() * (b - a);
  const debounce = (fn, ms = 150) => {
    let id;
    return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  };

  /* prefers-reduced-motion — live (reload on toggle so every loop re-inits) */
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = reduceMQ.matches;
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', () => window.location.reload());

  /* small helpers for visibility-gated rAF loops */
  const rafLoop = (frame) => {
    let id = 0;
    const tick = (ts) => { frame(ts); id = requestAnimationFrame(tick); };
    return {
      start() { if (!id) id = requestAnimationFrame(tick); },
      stop()  { if (id) { cancelAnimationFrame(id); id = 0; } },
    };
  };
  // pause a loop when its anchor element is off-screen OR the tab is hidden
  const gate = (el, loop) => {
    if (!el) { loop.start(); return; }
    let onScreen = true;
    const update = () => { (onScreen && !document.hidden) ? loop.start() : loop.stop(); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; update(); }, { threshold: 0 }).observe(el);
    }
    document.addEventListener('visibilitychange', update);
    update();
  };
  // start/stop an interval based on element visibility
  const gateInterval = (el, fn, ms, runImmediately = true) => {
    let timer = null;
    const start = () => { if (!timer && !document.hidden) { if (runImmediately) fn(); timer = setInterval(fn, ms); } };
    const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };
    let onScreen = true;
    const update = () => { onScreen && !document.hidden ? start() : stop(); };
    if (el && 'IntersectionObserver' in window) {
      new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; update(); }, { threshold: 0 }).observe(el);
    }
    document.addEventListener('visibilitychange', update);
    update();
  };

  /* ----------------------------------------------------------
     1. YEAR
  ---------------------------------------------------------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ----------------------------------------------------------
     2. NAV — scroll state, burger, scroll progress
  ---------------------------------------------------------- */
  const nav = $('#nav');
  const scrollBar = $('#scroll-bar');
  const onScroll = () => {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('is-scrolled', y > 24);
    if (scrollBar) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      scrollBar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#nav-burger');
  if (burger && nav) {
    const links = $('#nav-links');
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    };
    burger.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      setOpen(open);
      if (open && links) { const first = links.querySelector('a'); if (first) first.focus(); }
    });
    $$('.nav__links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
  }

  /* ----------------------------------------------------------
     3. TICKER COPY + TOAST
  ---------------------------------------------------------- */
  const toast = $('#toast');
  let toastTimer;
  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-show'), 2200);
  };
  // token / CA — single source of truth lives in config.js (window.YORE_CONFIG)
  const CFG = window.YORE_CONFIG || { TICKER: '$YORE', COPY_VALUE: '$YORE', HAS_TOKEN: false, TOKEN_MINT: '' };
  const shortCA = (s) => (s && s.length > 14 ? s.slice(0, 5) + '…' + s.slice(-4) : s);
  const copyCA = async () => {
    const text = CFG.COPY_VALUE;
    try {
      await navigator.clipboard.writeText(text);
      showToast(CFG.HAS_TOKEN ? 'Copied CA  ' + shortCA(text) : 'Copied  ' + text);
    } catch {
      showToast((CFG.HAS_TOKEN ? 'CA:  ' : 'Ticker:  ') + text);
    }
  };
  // make the ticker chip / hero ticker copy the mint once it's set, else the ticker
  ['#ticker-chip', '.hero__ticker'].forEach((sel) => {
    $$(sel).forEach((el) => {
      el.style.cursor = 'pointer';
      el.setAttribute('title', CFG.HAS_TOKEN ? 'Copy contract address' : 'Copy ticker');
      el.addEventListener('click', copyCA);
    });
  });
  // drop a live CA anywhere by adding data-yore-ca to an element
  $$('[data-yore-ca]').forEach((el) => {
    el.textContent = CFG.HAS_TOKEN ? shortCA(CFG.TOKEN_MINT) : 'CA: soon';
    el.style.cursor = 'pointer';
    el.addEventListener('click', copyCA);
  });

  /* ----------------------------------------------------------
     4. REVEAL ON SCROLL
  ---------------------------------------------------------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const sibs = $$('.reveal', e.target.parentElement);
          const idx = sibs.indexOf(e.target);
          e.target.style.transitionDelay = (Math.min(idx, 5) * 70) + 'ms';
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ----------------------------------------------------------
     5. ANIMATED COUNTERS
  ---------------------------------------------------------- */
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    if (reduceMotion || target < 2) { el.textContent = prefix + target + suffix; return; }
    const dur = 1400;
    let start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + target + suffix;
    };
    requestAnimationFrame(tick);
  };
  const counters = $$('.stat__num[data-count]');
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach(c => cio.observe(c));
  } else counters.forEach(animateCount);

  /* ----------------------------------------------------------
     6. EYES FOLLOW CURSOR (cached rects, rAF-throttled)
  ---------------------------------------------------------- */
  const eyeEls = $$('.eye');
  if (eyeEls.length && !reduceMotion) {
    let centers = [];
    const measure = () => {
      centers = eyeEls.map(eye => {
        const r = eye.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, pupil: eye.querySelector('i') };
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', debounce(measure), { passive: true });

    let px = 0, py = 0, queued = false;
    const apply = () => {
      queued = false;
      centers.forEach(({ cx, cy, w, pupil }) => {
        if (!pupil || w === 0) return;
        const ang = Math.atan2(py - cy, px - cx);
        const dist = Math.min(5, Math.hypot(px - cx, py - cy) / 40);
        pupil.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
      });
    };
    window.addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(apply); }
    }, { passive: true });

    gateInterval(eyeEls[0], () => {
      centers.forEach(({ w }, i) => {
        if (w === 0) return;
        eyeEls[i].animate(
          [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }],
          { duration: 180, easing: 'ease-in-out' }
        );
      });
    }, 5200, false);
  }

  /* ----------------------------------------------------------
     7. FLOW — ambient sequential lighting (gated)
  ---------------------------------------------------------- */
  const flowSteps = $$('.flow__step');
  if (flowSteps.length && !reduceMotion) {
    let fi = 0;
    gateInterval(flowSteps[0], () => {
      flowSteps.forEach(s => s.classList.remove('is-lit'));
      flowSteps[fi % flowSteps.length].classList.add('is-lit');
      fi++;
    }, 1100, false);
  }

  /* ----------------------------------------------------------
     8. BACKGROUND CANVAS — aurora (offscreen sprites) + pixel drift
  ---------------------------------------------------------- */
  (() => {
    const cv = $('#bg-canvas');
    if (!cv || reduceMotion) { if (cv) cv.style.display = 'none'; return; }
    const ctx = cv.getContext('2d');
    let W, H, dpr, blobs, grains;

    const palette = ['#5b6fe6', '#6f7bf0', '#7c86ee', '#4b4df1']; // darker grains for the light page

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const makeSprite = (b) => {
      // pre-render the radial gradient once per resize (cap internal size)
      const d = Math.max(2, Math.ceil(Math.min(b.r, 900) * 2));
      const scale = d / (b.r * 2);
      const oc = document.createElement('canvas');
      oc.width = d; oc.height = d;
      const octx = oc.getContext('2d');
      const rr = b.r * scale;
      const g = octx.createRadialGradient(rr, rr, 0, rr, rr, rr);
      g.addColorStop(0, b.c + '4d');
      g.addColorStop(0.55, b.c + '1f');
      g.addColorStop(1, b.c + '00');
      octx.fillStyle = g;
      octx.fillRect(0, 0, d, d);
      b.sprite = oc;
    };

    const initScene = () => {
      blobs = [
        { x: W * 0.18, y: H * 0.22, r: Math.max(W, H) * 0.42, c: '#7c86ee', vx: 0.06, vy: 0.04 },
        { x: W * 0.82, y: H * 0.30, r: Math.max(W, H) * 0.40, c: '#9aa9f2', vx: -0.05, vy: 0.05 },
        { x: W * 0.55, y: H * 0.85, r: Math.max(W, H) * 0.46, c: '#8fd9ea', vx: 0.04, vy: -0.05 },
      ];
      blobs.forEach(makeSprite);
      const count = Math.min(90, Math.floor((W * H) / 22000));
      grains = Array.from({ length: count }, () => ({
        x: rand(0, W), y: rand(0, H),
        s: rand(1.2, 2.8),
        vy: rand(0.12, 0.5),
        vx: rand(-0.08, 0.08),
        a: rand(0.15, 0.6),
        c: palette[(Math.random() * palette.length) | 0],
      }));
    };

    resize(); initScene();
    window.addEventListener('resize', debounce(() => { resize(); initScene(); }));

    let mx = W / 2, my = H / 2;
    window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

    let last = 0;
    const FRAME_MS = 1000 / 30; // aurora drift reads identically at 30fps
    const frame = (now) => {
      if (now - last < FRAME_MS) return;
      last = now;
      ctx.clearRect(0, 0, W, H);

      // soft drifting colour pools over the light page gradient
      blobs.forEach(b => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -b.r * 0.3 || b.x > W + b.r * 0.3) b.vx *= -1;
        if (b.y < -b.r * 0.3 || b.y > H + b.r * 0.3) b.vy *= -1;
        const px = b.x + (mx - W / 2) * 0.02;
        const py = b.y + (my - H / 2) * 0.02;
        ctx.drawImage(b.sprite, px - b.r, py - b.r, b.r * 2, b.r * 2);
      });

      // drifting pixel grains (the "sand of time")
      grains.forEach(p => {
        p.y += p.vy; p.x += p.vx;
        if (p.y > H + 4) { p.y = -4; p.x = rand(0, W); }
        if (p.x < -4) p.x = W + 4; if (p.x > W + 4) p.x = -4;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      });
      ctx.globalAlpha = 1;
    };

    // gate on the hero region: cards below the fold then blur a static backdrop
    gate($('#hero') || cv, rafLoop(frame));
  })();

  /* ----------------------------------------------------------
     9. PIXEL HOURGLASS — falling sand + slot ticking
  ---------------------------------------------------------- */
  (() => {
    const cv = $('#hourglass-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');

    const COLS = 22, ROWS = 30;
    let cell, ox, oy, dpr, cssW, cssH;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth || 320;
      const h = w * (ROWS / COLS) * 0.95;
      cssW = w; cssH = h;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = Math.floor(Math.min(w / COLS, h / ROWS));
      ox = (w - cell * COLS) / 2;
      oy = (h - cell * ROWS) / 2;
    };
    resize();
    window.addEventListener('resize', debounce(resize));

    const cx = (COLS - 1) / 2;
    const frameRow = (r) => {
      if (r <= 1 || r >= ROWS - 2) return { wall: true, full: true };
      const mid = (ROWS - 1) / 2;
      const t = Math.abs(r - mid) / mid;
      const half = Math.max(0.6, t * (COLS / 2 - 1.5));
      return { wall: false, left: Math.round(cx - half), right: Math.round(cx + half) };
    };

    let sand = [];
    let total = 0;
    let settledCount = 0;

    const seed = () => {
      sand = [];
      settledCount = 0;
      for (let r = 2; r < (ROWS - 1) / 2 - 0.5; r++) {
        const f = frameRow(r);
        if (f.wall) continue;
        for (let c = f.left + 1; c <= f.right - 1; c++) {
          sand.push({ c: c + 0.5, r: r + 0.5, settled: false, vy: 0 });
        }
      }
      total = sand.length;
    };
    seed();

    const drawCellRect = (c, r, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + c * cell, oy + r * cell, cell - 0.6, cell - 0.6);
    };

    const step = () => {
      const neckRow = (ROWS - 1) / 2;
      const grav = 0.06;
      const bottomHeight = {};

      sand.forEach(g => {
        if (g.settled && g.r > neckRow) {
          const col = Math.round(g.c - 0.5);
          bottomHeight[col] = Math.min(bottomHeight[col] ?? ROWS, Math.floor(g.r));
        }
      });

      sand.forEach(g => {
        if (g.settled) return;
        g.vy = Math.min(g.vy + grav, 0.55);
        let nr = g.r + g.vy;

        const fr = frameRow(Math.floor(nr));
        if (!fr.wall && fr.left !== undefined) {
          const minC = fr.left + 0.8, maxC = fr.right - 0.2;
          if (g.c < minC) g.c += Math.min(0.14, minC - g.c);
          if (g.c > maxC) g.c -= Math.min(0.14, g.c - maxC);
        }

        if (nr > neckRow + 0.5) {
          const col = Math.round(g.c - 0.5);
          const floor = (bottomHeight[col] ?? (ROWS - 2)) - 1;
          const fb = frameRow(Math.floor(nr));
          if (fb.left !== undefined) {
            if (col <= fb.left) g.c += 0.2;
            else if (col >= fb.right) g.c -= 0.2;
          }
          if (nr >= floor) {
            nr = floor;
            if (!g.settled) settledCount++;
            g.settled = true;
            bottomHeight[col] = Math.floor(nr);
          }
        }
        g.r = nr;
        if (g.r >= ROWS - 2.2) { g.r = ROWS - 2.2; if (!g.settled) settledCount++; g.settled = true; }
      });

      if (settledCount >= total - 1) seed(); // refill & flip — purely decorative
    };

    const SHADOW = 'rgba(36,34,82,0.30)';
    const render = () => {
      ctx.clearRect(0, 0, cssW, cssH);

      // pixel drop-shadow pass (echoes the logo/pfp long shadow)
      for (let r = 0; r < ROWS; r++) {
        const f = frameRow(r);
        if (f.wall) { for (let c = 2; c < COLS - 2; c++) drawCellRect(c + 1, r + 1, SHADOW); }
        else if (f.left !== undefined) { drawCellRect(f.left + 1, r + 1, SHADOW); drawCellRect(f.right + 1, r + 1, SHADOW); }
      }
      sand.forEach(g => { if (g.settled) drawCellRect(Math.floor(g.c) + 1, Math.floor(g.r) + 1, SHADOW); });

      // frame (glass) pixels with a subtle vertical tonal shift
      for (let r = 0; r < ROWS; r++) {
        const f = frameRow(r);
        const a = (0.84 + 0.14 * (r / ROWS)).toFixed(3);
        if (f.wall) {
          for (let c = 2; c < COLS - 2; c++) drawCellRect(c, r, `rgba(255,255,255,${a})`);
        } else if (f.left !== undefined) {
          drawCellRect(f.left, r, 'rgba(143,217,234,0.30)');
          drawCellRect(f.right, r, 'rgba(143,217,234,0.30)');
        }
      }

      // sand grains
      sand.forEach(g => {
        const c = Math.floor(g.c), r = Math.floor(g.r);
        const top = g.r < (ROWS - 1) / 2;
        drawCellRect(c, r, top ? 'rgba(179,174,240,0.95)' : 'rgba(143,217,234,0.95)');
      });
    };

    if (reduceMotion) {
      // static mid-flow state: partly-drained top + settled bottom pile
      const mid = (ROWS - 1) / 2;
      sand = [];
      for (let r = Math.floor(mid * 0.55); r < mid - 0.5; r++) {
        const f = frameRow(r);
        if (f.wall) continue;
        for (let c = f.left + 1; c <= f.right - 1; c++) sand.push({ c: c + 0.5, r: r + 0.5, settled: true, vy: 0 });
      }
      for (let r = ROWS - 3; r > mid + 1.5; r--) {
        const f = frameRow(r);
        if (f.wall) continue;
        for (let c = f.left + 1; c <= f.right - 1; c++) sand.push({ c: c + 0.5, r: r + 0.5, settled: true, vy: 0 });
      }
      total = sand.length;
      render();
    } else {
      gate(cv, rafLoop(() => { step(); render(); }));
    }
  })();

  /* ----------------------------------------------------------
     10. MERKLE TREE — build + path highlight (gated)
  ---------------------------------------------------------- */
  (() => {
    const host = $('#merkle-tree');
    if (!host) return;
    const levels = [8, 4, 2, 1];
    const rows = [];
    levels.forEach((n, li) => {
      const row = document.createElement('div');
      row.className = 'merkle-row';
      for (let i = 0; i < n; i++) {
        const node = document.createElement('span');
        node.className = 'merkle-node' + (li === levels.length - 1 ? ' is-root' : '');
        row.appendChild(node);
      }
      host.appendChild(row);
      rows.push(row);
    });

    if (reduceMotion) return;
    let leafIdx = 2;
    const highlightPath = () => {
      $$('.merkle-node', host).forEach(n => n.classList.remove('is-path'));
      let idx = leafIdx;
      rows.forEach((row) => {
        const nodes = row.children;
        if (nodes[idx]) nodes[idx].classList.add('is-path');
        idx = Math.floor(idx / 2);
      });
      leafIdx = (leafIdx + 3) % 8;
    };
    gateInterval(host, highlightPath, 1800, true);
  })();

  /* ----------------------------------------------------------
     11. ASYMMETRY BARS
  ---------------------------------------------------------- */
  (() => {
    const wrap = $('#asym');
    const produce = $('#asym-produce');
    const verify = $('#asym-verify');
    if (!wrap || !produce || !verify) return;
    const run = () => { produce.style.width = '100%'; verify.style.width = '7%'; };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.4 });
      io.observe(wrap);
    } else run();
  })();

  /* ----------------------------------------------------------
     12. REVERSE-DUTCH AUCTION CANVAS (gated)
  ---------------------------------------------------------- */
  (() => {
    const cv = $('#auction-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let dpr, W, H;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth || 460;
      H = W * 0.56;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', debounce(() => { resize(); draw(); }));

    let t = 0;
    let acceptAt = 0.62;
    let phase = 'rise';
    let holdTimer = 0;

    const pad = { l: 36, r: 14, t: 18, b: 26 };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const x0 = pad.l, x1 = W - pad.r, y0 = H - pad.b, y1 = pad.t;
      const plotW = x1 - x0, plotH = y0 - y1;

      ctx.strokeStyle = 'rgba(150,160,255,0.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = y0 - (plotH * i / 4);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(111,116,166,0.9)';
      ctx.font = '10px "Space Grotesk", monospace';
      ctx.fillText('price', 4, y1 + 6);
      ctx.fillText('time →', x1 - 38, y0 + 18);

      const tt = Math.min(t, phase === 'rise' ? 1 : acceptAt);
      ctx.beginPath();
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, '#8fd9ea'); grad.addColorStop(1, '#6f7bf0');
      ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const curveY = (p) => {
        const eased = Math.pow(p / Math.max(acceptAt, 0.001), 0.7);
        return y0 - plotH * Math.min(eased, 1) * 0.92;
      };
      for (let i = 0; i <= 60; i++) {
        const p = (i / 60) * tt;
        const x = x0 + plotW * p;
        const y = curveY(p);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.lineTo(x0 + plotW * tt, y0);
      ctx.lineTo(x0, y0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(111,123,240,0.08)';
      ctx.fill();

      if (t >= acceptAt) {
        const ax = x0 + plotW * acceptAt;
        const ay = curveY(acceptAt);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(111,123,240,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, y0); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#6f7bf0';
        ctx.shadowColor = '#6f7bf0'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#eef0ff';
        ctx.font = '11px "Space Grotesk", monospace';
        ctx.fillText('prover accepts', Math.min(ax + 8, x1 - 80), ay - 8);
      } else {
        const hx = x0 + plotW * tt, hy = curveY(tt);
        ctx.fillStyle = '#8fd9ea';
        ctx.shadowColor = '#8fd9ea'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const advance = () => {
      if (phase === 'rise') {
        t += 0.006;
        if (t >= acceptAt) { phase = 'hold'; holdTimer = 0; }
      } else if (phase === 'hold') {
        holdTimer++;
        if (holdTimer > 150) phase = 'reset';
      } else if (phase === 'reset') {
        t = 0; acceptAt = rand(0.45, 0.8); phase = 'rise';
      }
      draw();
    };

    if (reduceMotion) { t = acceptAt + 0.0001; phase = 'hold'; draw(); }
    else gate(cv, rafLoop(advance));
  })();

  /* ----------------------------------------------------------
     14. DEMO — query runner
  ---------------------------------------------------------- */
  (() => {
    const runBtn = $('#run-demo');
    const term = $('#terminal-body');
    if (!runBtn || !term) return;

    const tabs = $$('.demo__tab');
    const pathBtns = $$('#path-group .seg__btn');
    const result = $('#result');
    const pSteps = $$('.pipeline__step');
    const statusEl = $('#demo-status');

    const extraLabel = $('#extra-label');
    const qExtra = $('#q-extra');
    const slotLabel = $('#slot-label');
    const qSlot = $('#q-slot');

    let queryType = 'balance';
    let path = 'hybrid';
    let busy = false;

    const QUERY_CFG = {
      balance:  { extra: 'Mint', extraVal: 'So111…1112', verb: 'balance-at-slot', unit: 'SOL', slotLabel: 'Target slot', slotVal: '284,910,377' },
      twap:     { extra: 'Pool', extraVal: 'Orca · SOL/USDC', verb: 'TWAP-over-range', unit: 'USDC', slotLabel: 'Slot range', slotVal: '284,900,000 – 284,910,377' },
      holding:  { extra: 'Mint', extraVal: 'EPjFW…Dt1v', verb: 'holding-at-snapshot', unit: 'tokens', slotLabel: 'Snapshot slot', slotVal: '284,910,377' },
    };

    const setQuery = (q) => {
      queryType = q;
      tabs.forEach(t => {
        const on = t.dataset.query === q;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      const cfg = QUERY_CFG[q];
      if (extraLabel) extraLabel.textContent = cfg.extra;
      if (qExtra) qExtra.value = cfg.extraVal;
      if (slotLabel) slotLabel.textContent = cfg.slotLabel;
      if (qSlot) qSlot.value = cfg.slotVal;
    };
    tabs.forEach(t => t.addEventListener('click', () => setQuery(t.dataset.query)));

    pathBtns.forEach(b => b.addEventListener('click', () => {
      path = b.dataset.path;
      pathBtns.forEach(x => {
        const on = x === b;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-pressed', String(on));
      });
    }));

    const line = (html, cls = '') => {
      const p = document.createElement('p');
      p.className = 't-line ' + cls;
      p.innerHTML = html;
      term.appendChild(p);
      term.scrollTop = term.scrollHeight;
      return p;
    };
    const clearTerm = () => { term.innerHTML = ''; };
    const sleep = (ms) => new Promise(r => setTimeout(r, reduceMotion ? Math.min(ms, 60) : ms));

    const hexChar = () => '0123456789abcdef'[(Math.random() * 16) | 0];
    const hash = (n) => '0x' + Array.from({ length: n }, hexChar).join('');

    const setStep = (name, state) => {
      const el = pSteps.find(s => s.dataset.pstep === name);
      if (!el) return;
      el.classList.remove('is-active', 'is-done');
      if (state) el.classList.add(state);
    };
    const resetSteps = () => pSteps.forEach(s => s.classList.remove('is-active', 'is-done'));

    const scrambleLine = async (p, label, finalHash, ticks) => {
      for (let i = 0; i < ticks; i++) {
        p.innerHTML = `${label} <span class="t-val">${hash(16)}</span>`;
        await sleep(reduceMotion ? 0 : 55);
      }
      p.innerHTML = `${label} <span class="t-val">${finalHash}</span>`;
    };

    const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

    const run = async () => {
      if (busy) return;
      busy = true;
      runBtn.disabled = true;
      runBtn.setAttribute('aria-busy', 'true');
      const labelEl = $('#run-label');
      const prevLabel = labelEl ? labelEl.textContent : '';
      if (labelEl) labelEl.textContent = 'Proving…';
      if (statusEl) statusEl.textContent = 'Proving query…';
      if (result) result.hidden = true;
      resetSteps();
      clearTerm();

      const cfg = QUERY_CFG[queryType];
      const wallet = ($('#q-wallet')?.value || 'wallet').trim();
      const slot = (qSlot?.value || cfg.slotVal).trim();
      const extra = (qExtra?.value || '').trim();
      const usedPath = path;

      const valueHigh = Math.random() > 0.5;
      const effPath = usedPath === 'hybrid' ? (valueHigh ? 'ZK' : 'optimistic') : (usedPath === 'zk' ? 'ZK' : 'optimistic');

      // ---- REQUEST ----
      setStep('request', 'is-active');
      line('$ yore request --type <span class="t-key">' + cfg.verb + '</span>', 't-dim');
      await sleep(380);
      line('  wallet  <span class="t-val">' + wallet + '</span>');
      line('  slot    <span class="t-val">' + slot + '</span>   ' + cfg.extra.toLowerCase() + '  <span class="t-val">' + extra + '</span>');
      line('  path    <span class="t-warn">' + usedPath + '</span>' + (usedPath === 'hybrid' ? ' → resolved <span class="t-key">' + effPath + '</span>' : ''));
      await sleep(420);
      line('  request id  <span class="t-val">req_' + hash(8).slice(2) + '</span>   <span class="t-ok">queued ✓</span>');
      setStep('request', 'is-done');

      // ---- COMPUTE ----
      setStep('compute', 'is-active');
      await sleep(300);
      line('');
      const auctionP = line('· reverse-Dutch auction… <span class="blink">▮</span>', 't-dim');
      await sleep(500);
      auctionP.innerHTML = '· prover <span class="t-key">prv_' + hash(6).slice(2) + '</span> accepted · collateral <span class="t-val">≥10×</span> locked <span class="t-ok">✓</span>';
      await sleep(300);
      const idxP = line('· indexing historical state @ slot ' + slot + ' ', 't-dim');
      const totalSegs = 18;
      for (let i = 0; i <= totalSegs; i++) {
        const filled = '█'.repeat(i);
        const empty = '░'.repeat(totalSegs - i);
        idxP.innerHTML = '· indexing historical state  <span class="t-key">' + filled + empty + '</span> ' + Math.round((i / totalSegs) * 100) + '%';
        await sleep(reduceMotion ? 0 : rand(28, 70));
      }
      line('· merkle path against committed root  <span class="t-ok">resolved ✓</span>');
      setStep('compute', 'is-done');

      // ---- PROVE ----
      setStep('prove', 'is-active');
      await sleep(260);
      line('');
      if (effPath === 'ZK') {
        const zp = line('· generating ZK proof (zkVM) …', 't-dim');
        await sleep(280);
        await scrambleLine(zp, '· generating ZK proof (zkVM) …', '', 6);
        zp.innerHTML = '· ZK proof generated · groth16 · alt_bn128 <span class="t-ok">✓</span>';
      } else {
        line('· optimistic result posted + bond · challenge window open <span class="t-warn">⧗</span>', 't-dim');
        await sleep(360);
        line('· no fraud proof submitted · window elapsed <span class="t-ok">✓</span>');
      }
      const proofP = line('· proof  …', 't-dim');
      const finalProof = hash(40);
      await scrambleLine(proofP, '· proof ', finalProof.slice(0, 22) + '…', 8);
      setStep('prove', 'is-done');

      // ---- VERIFY ----
      setStep('verify', 'is-active');
      await sleep(260);
      line('');
      const vP = line('$ yore verify  <span class="t-dim">// single on-chain call</span>', 't-dim');
      await sleep(560);
      vP.innerHTML = '$ yore verify  →  <span class="t-ok">VALID ✓</span>  <span class="t-dim">(1 proof check)</span>';
      setStep('verify', 'is-done');

      // ---- SETTLE ----
      setStep('settle', 'is-active');
      await sleep(300);
      line('· result written on-chain · prover paid auction fee + emissions <span class="t-ok">✓</span>');
      setStep('settle', 'is-done');

      // ---- RESULT ----
      let value;
      if (queryType === 'balance') value = fmt(rand(120, 9800)) + ' ' + cfg.unit;
      else if (queryType === 'twap') value = '$' + fmt(rand(140, 205)) + ' ' + cfg.unit;
      else value = fmt(Math.round(rand(1, 25)) * 1000) + ' ' + cfg.unit;

      if (result) {
        $('#r-value').textContent = value;
        $('#r-proof').textContent = finalProof.slice(0, 30) + '…';
        $('#r-produce').textContent = (effPath === 'ZK' ? fmt(rand(3.2, 8.5)) : fmt(rand(0.4, 1.6))) + ' s';
        $('#r-verify').textContent = '~' + Math.round(rand(2, 9)) + ' ms';
        $('#r-path').textContent = effPath;
        $('#r-status').textContent = 'verified';
        result.hidden = false;
      }
      line('');
      line('# verified historical fact ready for on-chain consumption.', 't-ok');
      if (statusEl) statusEl.textContent = 'Verified: ' + value + '. Proof valid via ' + effPath + ' path.';

      if (labelEl) labelEl.textContent = prevLabel || 'Submit query';
      runBtn.disabled = false;
      runBtn.removeAttribute('aria-busy');
      busy = false;
    };

    runBtn.addEventListener('click', run);
    setQuery('balance');
  })();

})();
