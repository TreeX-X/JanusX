// Note: preview-only controls; document content is never rewritten on disk.
// .agents/notes/workbench/unified-file-window.md
export const OFFICE_PREVIEW_CONTROLS = String.raw`
<script>
(() => {
  if (document.getElementById('janus-office-controls')) return;
  const zh = (new URLSearchParams(location.search).get('janusLanguage') || document.documentElement.lang).toLowerCase().startsWith('zh');
  const label = (cn, en) => zh ? cn : en;
  const bar = document.createElement('div');
  bar.id = 'janus-office-controls';
  bar.innerHTML = '<button data-action="out">−</button><select data-zoom></select><button data-action="in">+</button><select data-mode></select><button data-action="prev">‹</button><span data-page></span><button data-action="next">›</button>';
  const style = document.createElement('style');
  style.textContent = '#janus-office-controls{position:fixed;top:0;left:0;right:0;height:40px;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 8px;background:#202126;color:#eee;border-bottom:1px solid #45464b;font:12px system-ui;box-sizing:border-box}#janus-office-controls button,#janus-office-controls select{background:#303138;color:#eee;border:1px solid #505158;border-radius:4px;padding:3px 7px;font:inherit;cursor:pointer}#janus-office-controls button:disabled{opacity:.35;cursor:default}#janus-office-controls button:focus-visible,#janus-office-controls select:focus-visible{outline:2px solid #f47d43;outline-offset:1px}html{padding-top:40px!important;box-sizing:border-box}body{height:calc(100vh - 40px)!important}body.janus-ppt .sidebar-toggle{top:48px}body.janus-ppt .main{min-width:0;overflow:auto!important;align-items:flex-start!important}body.janus-ppt .slide-container{margin:0 auto;flex-shrink:0}body.janus-ppt.janus-single .slide-notes{display:none!important}body.janus-ppt .slide-wrapper{position:relative;flex-shrink:0}body.janus-ppt .slide-wrapper>.slide{position:absolute!important;left:0;top:0;transform-origin:top left!important}body.janus-ppt.janus-single .sidebar{display:none!important}body.janus-ppt.janus-single .sidebar-toggle{display:none!important}';
  document.head.append(style);
  style.textContent += 'body.janus-ppt .page-counter{display:none!important}@media(max-width:480px){#janus-office-controls{justify-content:flex-start;overflow-x:auto;white-space:nowrap}#janus-office-controls>*{flex-shrink:0}}';
  // Match the preview's quiet chrome while keeping a 10px native drag target.
  const scrollAreas = 'body.janus-ppt :is(.main,.sidebar),html:has(body.janus-ppt) #janus-office-controls';
  style.textContent += [
    scrollAreas + '{scrollbar-width:auto;scrollbar-color:auto}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar{width:10px;height:10px}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-track{background:transparent}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-thumb{min-height:28px;min-width:28px;border:3px solid transparent;border-radius:10px;background:rgba(164,165,184,.34);background-clip:padding-box}',
    ':is(' + scrollAreas + '):hover::-webkit-scrollbar-thumb{background-color:rgba(164,165,184,.52)}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-thumb:hover{background-color:rgba(190,191,207,.72)}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-thumb:active{background-color:rgba(213,214,228,.85)}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-corner{background:transparent}',
    ':is(' + scrollAreas + ')::-webkit-scrollbar-button{display:none;width:0;height:0}',
    '@media(forced-colors:active){' + scrollAreas + '{scrollbar-color:auto;scrollbar-width:auto}' + ':is(' + scrollAreas + ')::-webkit-scrollbar-thumb{background:ButtonText;background-clip:padding-box}}',
  ].join('\n');
  document.documentElement.append(bar);
  const zoomSelect = bar.querySelector('[data-zoom]');
  const modeSelect = bar.querySelector('[data-mode]');
  const button = action => bar.querySelector('[data-action="' + action + '"]');
  zoomSelect.setAttribute('aria-label', label('预览缩放', 'Preview zoom'));
  zoomSelect.innerHTML = '<option value="fit">' + label('适合窗口', 'Fit window') + '</option>' + [25,50,75,100,125,150,200,300].map(n => '<option value="'+n+'">'+n+'%</option>').join('');
  modeSelect.setAttribute('aria-label', label('页面查看模式', 'Page view'));
  modeSelect.innerHTML = '<option value="single">'+label('单页查看','Single page')+'</option><option value="continuous">'+label('连续查看','Continuous')+'</option>';
  [['out','缩小','Zoom out'],['in','放大','Zoom in'],['prev','上一页','Previous page'],['next','下一页','Next page']].forEach(([action,cn,en]) => { button(action).title = button(action).ariaLabel = label(cn,en); });
  let index = 0, scale = 1;
  const slides = () => [...document.querySelectorAll('.main > .slide-container')];
  const ppt = slides().length > 0;
  document.body.classList.toggle('janus-ppt', ppt);
  [modeSelect, button('prev'), button('next'), bar.querySelector('[data-page]')].forEach(el => el.hidden = !ppt);
  function updateNavigation() {
    const total = slides().length;
    bar.querySelector('[data-page]').textContent = (total ? index+1 : 0)+' / '+total;
    button('prev').disabled = index <= 0;
    button('next').disabled = index >= total-1;
  }
  function apply() {
    if (!bar.isConnected) document.documentElement.append(bar);
    if (!ppt) {
      document.body.style.zoom = '1';
      document.body.style.width = '';
      scale = zoomSelect.value === 'fit' ? Math.min(1, window.innerWidth / Math.max(1, document.body.scrollWidth)) : Number(zoomSelect.value)/100;
      document.body.style.zoom = String(scale);
      document.body.style.width = (100/scale)+'%';
      document.body.style.setProperty('height', ((window.innerHeight-40)/scale)+'px', 'important');
      zoomSelect.options[0].textContent = label('适合窗口','Fit window')+' ('+Math.round(scale*100)+'%)';
      return;
    }
    const pages = slides();
    index = Math.max(0, Math.min(index, pages.length - 1));
    const single = modeSelect.value === 'single';
    document.body.classList.remove('fullscreen');
    document.body.classList.toggle('janus-single', single);
    const main = document.querySelector('.main');
    pages.forEach((page, i) => {
      page.style.display = single && i !== index ? 'none' : 'flex';
      const slide = page.querySelector('.slide');
      if (!slide) return;
      const w = slide.offsetWidth, h = slide.offsetHeight;
      const fit = Math.max(.01, Math.min((main.clientWidth - 40)/w, single ? (main.clientHeight - 40)/h : Infinity));
      const s = zoomSelect.value === 'fit' ? fit : Number(zoomSelect.value)/100;
      if (i === index) scale = s;
      slide.style.transform = 'scale('+s+')';
      slide.parentElement.style.width = w*s+'px';
      slide.parentElement.style.height = h*s+'px';
    });
    zoomSelect.options[0].textContent = label('适合窗口','Fit window')+' ('+Math.round(scale*100)+'%)';
    updateNavigation();
  }
  function navigate(delta) { index += delta; apply(); if(modeSelect.value === 'continuous') slides()[index]?.scrollIntoView({block:'start'}); }
  zoomSelect.onchange = apply;
  modeSelect.onchange = () => { apply(); document.querySelector('.main')?.scrollTo(0,0); };
  button('prev').onclick = () => navigate(-1);
  button('next').onclick = () => navigate(1);
  function zoom(delta) {
    const levels = [25,50,75,100,125,150,200,300];
    const current = zoomSelect.value === 'fit' ? scale*100 : Number(zoomSelect.value);
    zoomSelect.value = String(delta > 0 ? levels.find(n => n > current+1) ?? 300 : [...levels].reverse().find(n => n < current-1) ?? 25);
    apply();
  }
  button('out').onclick = () => zoom(-1);
  button('in').onclick = () => zoom(1);
  document.querySelector('.main')?.addEventListener('scroll', () => {
    if (!ppt || modeSelect.value !== 'continuous') return;
    const viewport = document.querySelector('.main').getBoundingClientRect();
    let mostVisible = 0;
    slides().forEach((page, i) => {
      const box = page.getBoundingClientRect();
      const visible = Math.max(0, Math.min(box.bottom, viewport.bottom)-Math.max(box.top, viewport.top));
      if (visible > mostVisible) { mostVisible = visible; index = i; }
    });
    updateNavigation();
  }, {passive:true});
  window.addEventListener('resize', apply);
  document.addEventListener('keydown', event => {
    if (!ppt || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp','f','F','Escape'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (['f','F','Escape'].includes(event.key)) { modeSelect.value = event.key === 'Escape' ? 'continuous' : modeSelect.value === 'single' ? 'continuous' : 'single'; apply(); }
      else navigate(['ArrowLeft','ArrowUp','PageUp'].includes(event.key) ? -1 : 1);
    }
  }, true);
  document.addEventListener('click', event => {
    const thumb = event.target.closest('.thumb');
    if (thumb && ppt) { index = [...document.querySelectorAll('.sidebar > .thumb')].indexOf(thumb); requestAnimationFrame(apply); }
  });
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; apply(); }); } }).observe(document.querySelector('.main') ?? document.body, {childList:true});
  apply();
})();
</script>`
