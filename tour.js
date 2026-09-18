// Motion is opt-in; the still image is also the no-JavaScript fallback.
document.querySelectorAll('.tour-play').forEach(button => {
  const img = button.closest('figure').querySelector('img');
  const label = button.textContent;
  button.hidden = false;
  button.addEventListener('click', () => {
    const playing = button.getAttribute('aria-pressed') !== 'true';
    img.src = playing ? button.dataset.gif : button.dataset.still;
    button.setAttribute('aria-pressed', String(playing));
    button.textContent = playing ? '停止演示 · 查看静态画面' : label;
  });
  img.addEventListener('error', () => {
    if (button.getAttribute('aria-pressed') === 'true') {
      img.src = button.dataset.still;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = '演示加载失败 · 点击重试';
    }
  });
});
