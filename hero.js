// A single capsule settles once. Scroll expands the card into the real workspace.
(() => {
  'use strict';
  const hero = document.getElementById('hero');
  const stage = document.getElementById('zoom-stage');
  const canvas = document.getElementById('hero-particles');
  const workspace = hero?.querySelector('.hero-workspace');
  const scene = hero?.querySelector('.hero-scene');
  const preview = document.getElementById('workspace-preview');
  const controls = hero?.querySelector('.workspace-controls');
  const caption = document.getElementById('workspace-caption');
  const views = {
    overview: ['JanusX 黑色工作区：四个 CLI 终端与 CPA 管理页、Markdown 文档预览组成六个分区', '终端与工具独立分屏，让执行、账号管理与文档阅读并排展开。'],
    terminals: ['Claude、Codex、OpenCode 与 Pi 在黑色工作区中组成四格终端分屏', '四个 CLI，各自保留上下文。拖动标签拆分，按任务调整比例。'],
    cpa: ['四终端旁嵌入真实的黑色 CPA 管理页，展示本地空实例', 'Janus 工具箱内嵌 CPA。这里展示本地空实例，未添加账号或发起请求。'],
    documents: ['四终端旁嵌入 Markdown 源码编辑与发布清单预览', 'Markdown 编辑与预览并排，发布清单和笔记始终在手边。']
  };
  if (workspace && preview && controls && caption) {
    workspace.inert = false;
    workspace.setAttribute('aria-hidden', 'false');
    controls.hidden = false;
    let selection = 0;
    controls.addEventListener('click', async event => {
      const button = event.target.closest('[data-workspace]');
      const name = button?.dataset.workspace;
      if (!views[name]) return;
      const current = ++selection;
      const src = `assets/workspace/${name}.png`;
      const next = new Image();
      next.src = src;
      workspace.setAttribute('aria-busy', 'true');
      try {
        await next.decode();
        if (current !== selection) return;
        preview.src = src;
        preview.alt = views[name][0];
        caption.textContent = views[name][1];
        workspace.querySelectorAll('.workspace-image, .workspace-original').forEach(link => { link.href = src; });
        controls.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      } catch {
        if (current === selection) caption.textContent = '这张预览暂时无法加载，请重试或查看原图。';
      } finally {
        if (current === selection) workspace.removeAttribute('aria-busy');
      }
    });
  }
  const context = canvas?.getContext('2d');
  if (!hero || !stage || !context || !workspace) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 855px), (max-height: 620px)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  const mask = document.createElement('canvas');
  mask.width = 520;
  mask.height = 300;
  const ink = mask.getContext('2d', { willReadFrequently: true });
  if (!ink) return;
  ink.strokeStyle = 'rgba(255,255,255,.65)';
  ink.lineWidth = 7;
  ink.beginPath();
  ink.roundRect(65, 55, 390, 190, 95);
  ink.stroke();
  ink.fillStyle = '#fff';
  for (const x of [201, 287]) {
    ink.beginPath();
    ink.roundRect(x, 109, 32, 82, 16);
    ink.fill();
  }
  const pixels = ink.getImageData(0, 0, 520, 300).data;
  const particles = [];
  for (let y = 0; y < 300; y += 3) {
    for (let x = 0; x < 520; x += 3) {
      const alpha = pixels[(y * 520 + x) * 4 + 3];
      if (alpha < 50) continue;
      const seed = ((particles.length * 9301 + 49297) % 233280) / 233280;
      const angle = seed * Math.PI * 2;
      const distance = 35 + seed * 100;
      const sx = x + Math.cos(angle) * distance;
      const sy = y + Math.sin(angle) * distance;
      particles.push({ tx: x, ty: y, sx, sy, x: sx, y: sy, seed,
        color: alpha > 220 ? '#f5f5f5' : (seed > .65 ? '#c6c6c6' : '#777777'),
        size: alpha > 220 ? 1.7 : 1.25 });
    }
  }

  let width = 1, height = 1, scale = 1, offsetX = 0, offsetY = 0;
  let stageTop = 0, travel = 1, progress = 0, target = 0;
  let frame = 0, previousTime = 0, born = null, settled = false;
  let visible = false, desktop = false, pointer = null;

  function requestFrame() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function measure() {
    const bounds = scene.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    scale = Math.min(width * .74 / 520, height * .60 / 300, 1.4);
    offsetX = width / 2 - 260 * scale;
    offsetY = height * .40 - 150 * scale;
    pointer = null;
    requestFrame();
  }

  function readScroll() {
    target = desktop ? Math.min(1, Math.max(0, (scrollY - stageTop + 16) / travel)) : 0;
    requestFrame();
  }

  function layout() {
    desktop = !reduced.matches && !compact.matches;
    document.documentElement.classList.toggle('hero-motion', desktop);
    stageTop = stage.getBoundingClientRect().top + scrollY;
    travel = Math.max(1, parseFloat(getComputedStyle(stage).getPropertyValue('--hero-travel')) * innerHeight / 100);
    if (!desktop) {
      progress = target = 0;
      settled = true;
    }
    readScroll();
    measure();
  }

  function draw(now, dt) {
    const animate = desktop && !settled;
    if (born === null) born = now;
    const age = now - born;
    const attraction = 1 - Math.exp(-dt / 38);
    const dprX = canvas.width / width;
    const dprY = canvas.height / height;
    context.setTransform(dprX, 0, 0, dprY, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    let moving = false;
    for (const particle of particles) {
      const k = animate ? Math.min(1, Math.max(0, (age - particle.seed * 220) / 1500)) : 1;
      const ease = 1 - (1 - k) ** 3;
      let x = particle.sx + (particle.tx - particle.sx) * ease;
      let y = particle.sy + (particle.ty - particle.sy) * ease;
      if (pointer) {
        const dx = particle.tx - pointer.x, dy = particle.ty - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > .01 && distance < 85) {
          const push = (1 - distance / 85) ** 2 * 32;
          x += dx / distance * push;
          y += dy / distance * push;
        }
      }
      if (!desktop) {
        particle.x = x;
        particle.y = y;
      } else {
        particle.x += (x - particle.x) * attraction;
        particle.y += (y - particle.y) * attraction;
      }
      if (k < 1 || Math.abs(x - particle.x) + Math.abs(y - particle.y) > .025) moving = true;
      context.globalAlpha = .28 + .72 * ease;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    if (age >= 1720) settled = true;
    hero.classList.add('hero-canvas-ready');
    return moving;
  }

  function tick(now) {
    frame = 0;
    const dt = previousTime ? Math.min(64, now - previousTime) : 16;
    previousTime = now;
    const difference = target - progress;
    progress = Math.abs(difference) < .0005 || !visible ? target : progress + difference * (1 - Math.exp(-dt / 80));
    const p = progress * progress * (3 - 2 * progress);
    const reveal = desktop ? Math.min(1, Math.max(0, (p - .52) / .38)) : 1;
    hero.style.setProperty('--p', p.toFixed(5));
    hero.style.setProperty('--bleed', (Math.max(0, document.documentElement.clientWidth - stage.clientWidth) * p).toFixed(2) + 'px');
    hero.style.setProperty('--workspace', reveal.toFixed(4));
    workspace.classList.toggle('is-visible', reveal > 0);
    workspace.inert = reveal < .95;
    workspace.setAttribute('aria-hidden', String(reveal < .95));
    scene.setAttribute('aria-hidden', String(desktop && reveal >= .95));
    const moving = visible && (!desktop || reveal < 1) ? draw(now, dt) : false;
    if (Math.abs(target - progress) > .0005 || moving) requestFrame();
  }

  hero.addEventListener('pointermove', event => {
    if (!desktop || !mouse.matches || event.pointerType !== 'mouse') return;
    const bounds = hero.getBoundingClientRect();
    pointer = { x: (event.clientX - bounds.left - offsetX) / scale, y: (event.clientY - bounds.top - offsetY) / scale };
    requestFrame();
  });
  hero.addEventListener('pointerleave', () => { pointer = null; requestFrame(); });
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', layout);
  reduced.addEventListener('change', layout);
  compact.addEventListener('change', layout);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      previousTime = 0;
      readScroll();
    }
  });
  new ResizeObserver(measure).observe(scene);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    previousTime = 0;
    if (visible) requestFrame();
  }).observe(hero);
  layout();
  document.fonts.ready.then(layout);
})();
