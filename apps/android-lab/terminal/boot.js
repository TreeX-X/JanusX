// Loaded before xterm so a failed bundle cannot leave a silent empty surface.
(function () {
  // xterm uses microtasks even when the browser predates this convenience API.
  if (typeof window.queueMicrotask !== 'function') {
    window.queueMicrotask = function (callback) {
      if (typeof callback !== 'function') throw new TypeError('Expected a function');
      Promise.resolve().then(callback).catch(function (error) {
        setTimeout(function () { throw error; }, 0);
      });
    };
  }
  // xterm 6's DOM renderer replaces each visible row through this newer API.
  if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
    Object.defineProperty(Element.prototype, 'replaceChildren', {
      configurable: true, writable: true,
      value: function () {
        var fragment = this.ownerDocument.createDocumentFragment();
        for (var i = 0; i < arguments.length; i++) {
          var child = arguments[i];
          fragment.appendChild(child instanceof Node ? child : this.ownerDocument.createTextNode(String(child)));
        }
        while (this.firstChild) this.removeChild(this.firstChild);
        this.appendChild(fragment);
      }
    });
  }
  var failed = false;
  function failure(text) {
    if (failed) return;
    failed = true;
    var message = '终端显示脚本失败：' + String(text).slice(0, 180) + '。请确认已安装最新版；重复同步不能修复脚本兼容问题。';
    document.getElementById('loading').hidden = false;
    document.getElementById('loading').textContent = message;
    window.AndroidTerminal.failed(message);
  }
  window.addEventListener('error', function (event) {
    // Resource errors (e.g. an icon) are not JavaScript parse/runtime errors.
    if (event.message) failure(event.message);
    else if (event.target && event.target.tagName === 'SCRIPT') failure('内置脚本加载失败');
  }, true);
  window.addEventListener('unhandledrejection', function () {
    failure('脚本异步执行失败');
  });
})();
