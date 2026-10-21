// Loaded before xterm so a failed bundle cannot leave a silent empty surface.
(function () {
  function failure(text) {
    var message = '终端页面未能启动：' + text + '。请点「同步」重试，或更新 Android System WebView。';
    document.getElementById('loading').hidden = false;
    document.getElementById('loading').textContent = message;
    window.AndroidTerminal.status(message);
  }
  window.addEventListener('error', function (event) {
    failure(event.message || '内置脚本加载失败');
  });
  window.addEventListener('unhandledrejection', function () {
    failure('脚本异步执行失败');
  });
})();
