/**
 * @file 远控主界面（内联模板，无构建产物）
 * @description 与 JanusX 主界面同款三栏：左工作区 / 中终端 / 右文件树。
 *              中部按状态流转：登录 → 建组织 → 配对 → 远控终端。
 *              token 只放内存，refresh 与 deviceId 放 localStorage，与桌面端语义对齐。
 */

export const TEST_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>JanusX 远控</title>
<style>
  :root {
    --shell-void: #101012; --shell-canvas: #151517; --shell-pane: #191919;
    --shell-pane-chrome: #1e1e1f; --shell-chrome: #1e1e20; --shell-card: #1c1c1f; --shell-hover: #2b2b2e; --shell-active: #333336;
    --shell-border: rgb(255 255 255 / 0.07); --shell-text: #fafafa; --shell-muted: #a1a1a1; --shell-dim: #737373;
    --shell-accent: #f47d43; --shell-accent-strong: #ff9159;
    --shell-accent-soft: rgb(244 125 67 / 0.08); --shell-accent-border: rgb(244 125 67 / 0.42);
    --control-h: 24px;
  }
  * { box-sizing: border-box; }
  /* 滚动条（对标桌面 globals.css）：全局 5px 细橙条 */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgb(255 120 48 / 0.12); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgb(255 120 48 / 0.18); }
  /* xterm 视口覆写（对标桌面）：透明底 + 14px 槽 + 白色滑块 */
  .xterm { width: 100%; height: 100%; padding: 0; }
  .xterm .xterm-viewport { background: transparent !important; }
  .xterm .xterm-scrollable-element > .scrollbar.vertical { width: 14px !important; right: 0 !important; cursor: default !important; background: transparent !important; opacity: 1; }
  .xterm .xterm-scrollable-element > .scrollbar.vertical.invisible { opacity: 0; pointer-events: none; }
  .xterm .xterm-scrollable-element > .scrollbar.vertical:hover { background: rgb(255 255 255 / 0.03) !important; }
  .xterm .xterm-scrollable-element > .scrollbar.vertical > .slider { left: 5px !important; right: 5px !important; width: auto !important; cursor: default !important; pointer-events: auto !important; border-radius: 4px !important; background: rgb(255 255 255 / 0.26) !important; border: 0 !important; }
  .xterm .xterm-scrollable-element > .scrollbar.vertical:hover > .slider { background: rgb(255 255 255 / 0.34) !important; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--shell-void); color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .titlebar { height: 34px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: var(--shell-chrome); border-bottom: 1px solid var(--shell-border); }
  .traffic { display: flex; gap: 7px; }
  .traffic i { width: 11px; height: 11px; border-radius: 50%; font-style: normal; }
  .traffic i:nth-child(1) { background: #ff5f57; } .traffic i:nth-child(2) { background: #febc2e; } .traffic i:nth-child(3) { background: #28c840; }
  .brand { font-weight: 700; color: var(--shell-text); font-size: 13px; }
  .brand small { color: var(--shell-dim); font-weight: 400; }
  .pill { border: 1px solid var(--shell-border); border-radius: 20px; padding: 2px 10px; font-size: 11px; color: var(--shell-dim); }
  .pill.ok { color: #6fb88a; border-color: rgb(111 184 138 / 0.3); background: rgb(111 184 138 / 0.12); }
  .spacer { flex: 1; }
  .acct { color: var(--shell-dim); font-size: 12px; }
  .layout { flex: 1; display: grid; grid-template-columns: 240px minmax(320px, 1fr) 280px; min-height: 0; }
  aside.left { background: var(--shell-chrome); border-right: 1px solid var(--shell-border); display: flex; flex-direction: column; min-height: 0; }
  aside.right { background: var(--shell-chrome); border-left: 1px solid var(--shell-border); overflow: auto; padding: 10px; min-height: 0; }
  .center { background: var(--shell-canvas); min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .side-scroll { flex: 1; overflow: auto; padding: 10px; min-height: 0; }
  .side-foot { border-top: 1px solid var(--shell-border); padding: 8px 10px; font-size: 12px; color: var(--shell-muted); }
  h4 { margin: 4px 0 8px; font-size: 11px; color: var(--shell-dim); font-weight: 600; }
  /* 控件（对标桌面 BrowserSurface + globals：细边框幽灵按钮，accent 只做 1px 边框与文字，不做填充大色块） */
  input, select { height: var(--control-h); font-size: 11px; padding: 0 8px; background: rgb(255 255 255 / 0.03); color: var(--shell-text); border: 1px solid rgb(255 255 255 / 0.08); border-radius: 5px; outline: none; margin: 0; }
  input { width: 100%; }
  input:focus, select:focus { border-color: rgb(255 120 48 / 0.42); background: rgb(255 120 48 / 0.05); }
  select { width: auto; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: var(--control-h); padding: 0 10px; font-size: 11px; color: #999; background: rgb(255 255 255 / 0.03); border: 1px solid rgb(255 255 255 / 0.08); border-radius: 5px; cursor: pointer; white-space: nowrap; margin: 0; transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
  button:hover:not(:disabled) { background: rgb(255 120 48 / 0.1); border-color: rgb(255 120 48 / 0.3); color: #ffb27d; }
  button.primary { background: transparent; border-color: rgb(255 120 48 / 0.24); color: #ffb27d; font-weight: 500; }
  button.primary:hover:not(:disabled) { background: rgb(255 120 48 / 0.08); border-color: rgb(255 120 48 / 0.42); color: #ffb27d; }
  button:disabled { opacity: 0.32; cursor: not-allowed; }
  button.iconBtn { width: var(--control-h); padding: 0; flex-shrink: 0; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #555; }
  .dot.run { background: #4ec9b0; } .dot.exit { background: #e06c75; }
  .orgcard { display: flex; align-items: center; gap: 8px; }
  .avatar { width: 26px; height: 26px; border-radius: 6px; background: rgb(244 125 67 / 0.15); color: var(--shell-accent-strong); display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
  .card { max-width: 440px; margin: 9vh auto; background: var(--shell-canvas); border: 1px solid var(--shell-border); border-radius: 10px; padding: 22px; }
  .card h3 { margin: 0 0 4px; color: var(--shell-text); font-size: 15px; }
  .card p { color: var(--shell-dim); font-size: 12px; }
  .err { color: #d78b92; min-height: 18px; font-size: 12px; }
  /* 中部终端 Tab（对标桌面 BrowserSurface.tabs：单行横滚，唯一主体 Tab 管理） */
  #termList { display: flex; align-items: center; gap: 2px; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; padding: 0; }
  #termList::-webkit-scrollbar { display: none; }
  #termList button { display: inline-flex; align-items: center; gap: 5px; height: 24px; max-width: 150px; min-width: 0; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: rgb(255 255 255 / 0.5); font-family: ui-monospace, Consolas, monospace; font-size: 11px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
  #termList button:hover:not(.active) { background: rgb(255 255 255 / 0.05); color: #ccc; border-color: transparent; }
  #termList button.active { background: rgb(255 255 255 / 0.08); color: #ffb27d; }
  #termList button .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  #termList button .tabClose { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; border-radius: 3px; color: #777; opacity: 0.55; font-size: 12px; line-height: 1; }
  #termList button .tabClose:hover { background: rgb(255 88 88 / 0.14); color: #ff8585; opacity: 1; }
  .termhead { display: flex; align-items: center; gap: 6px; height: 30px; flex-shrink: 0; padding: 0 8px; }
  .termhead h4 { margin: 0; }
  .termbar { display: flex; align-items: center; gap: 6px; height: 34px; flex-shrink: 0; padding: 0 6px; background: var(--shell-pane-chrome); border-top: 1px solid var(--shell-border); border-bottom: 1px solid var(--shell-border); }
  #xtermWrap { flex: 1 1 auto; min-height: 160px; height: auto; margin: 8px 12px 0; border: 1px solid var(--shell-border); border-radius: 8px; background: #0e0f12; padding: 6px; overflow: hidden; }
  #xtermWrap .xterm { height: 100%; }
  pre.term { flex: 1 1 auto; min-height: 0; height: auto; max-height: none; background: #0e0f12; color: #d4d4d4; margin: 8px 12px 0; padding: 10px; border: 1px solid var(--shell-border); border-radius: 8px; overflow: auto; white-space: pre-wrap; word-break: break-all; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; }
  .cmdrow { display: flex; gap: 6px; flex-shrink: 0; margin: 8px 12px; }
  .cmdrow input { flex: 1; font-family: 'Cascadia Mono', Consolas, monospace; }
  .termHint { flex-shrink: 0; margin: 0 12px 2px; }
  .termErrLine { flex-shrink: 0; margin: 0 12px 8px; }
  .card input { height: 30px; margin: 4px 0; }
  .card .btnRow { display: flex; gap: 6px; margin-top: 8px; }
  .statusbar { height: 28px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: var(--shell-chrome); border-top: 1px solid var(--shell-border); font-size: 11px; color: var(--shell-dim); font-family: ui-monospace, Consolas, monospace; }
  .dim { color: var(--shell-dim); font-size: 12px; }
  /* 左栏工作区行（对标桌面 Sidebar）：chevron + 名 + 计数徽标 + 左 accent 条 */
  .ws-row { position: relative; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--shell-text); }
  .ws-row:hover { background: rgb(255 255 255 / 0.04); }
  .ws-row.active { background: rgb(244 125 67 / 0.08); }
  .ws-accent { position: absolute; left: 0; top: 4px; bottom: 4px; width: 2px; border-radius: 0 2px 2px 0; background: transparent; }
  .ws-row.active .ws-accent { background: var(--shell-accent); }
  .ws-chev { width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: #626268; border-radius: 3px; padding: 0; margin: 0; }
  .ws-chev:hover { background: rgb(255 255 255 / 0.05); color: #aaa; }
  .ws-chev svg { transition: transform 200ms ease-out; }
  .ws-chev.exp svg { transform: rotate(90deg); }
  .ws-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .ws-badge { display: inline-flex; height: 20px; align-items: center; gap: 4px; border-radius: 3px; padding: 0 6px; font-family: ui-monospace, Consolas, monospace; font-size: 9px; }
  .ws-badge.run { color: #87d9aa; background: rgb(70 190 125 / 0.08); }
  .ws-badge.idle { color: #77777d; background: rgb(255 255 255 / 0.035); }
  .ws-badge .dot { width: 6px; height: 6px; }
  .ws-badge.run .dot { background: #58c98d; }
  .ws-badge.idle .dot { background: #55555b; }
  .ws-terms { margin: 0 4px 2px 20px; padding: 4px 0; border-left: 1px solid rgb(255 255 255 / 0.055); }
  .ws-term { display: flex; align-items: center; gap: 8px; border-radius: 3px; padding: 6px 8px; margin-bottom: 2px; cursor: pointer; color: #8a8a8a; }
  .ws-term:hover { background: rgb(255 255 255 / 0.04); }
  .ws-term.focus { background: rgb(255 120 48 / 0.055); color: #d8d8d8; }
  .ws-tname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
  .ws-tsub { font-size: 9px; color: #55555b; }
  /* 右栏文件树（对标桌面 FileTreeItem）：缩进 + 三角 + 类型图标 + 选中/忽略态 */
  .ft-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin-bottom: 1px; border-radius: 4px; cursor: pointer; font-size: 12px; color: #999; user-select: none; }
  .ft-row:hover { background: rgb(255 255 255 / 0.03); color: #ccc; }
  .ft-row.sel { color: #ff7830; background: rgb(255 120 48 / 0.1); }
  .ft-row.ign { color: #737373; opacity: 0.68; }
  .ft-row.ign:hover { color: #969696; }
  .ft-row.sel.ign { color: #ff7830; opacity: 1; }
  .ft-chev { width: 6px; height: 6px; flex-shrink: 0; border-right: 1.5px solid #666; border-bottom: 1.5px solid #666; transform: rotate(-45deg); transition: transform 120ms ease; margin-left: 2px; }
  .ft-chev.exp { transform: rotate(45deg); }
  .ft-row.sel .ft-chev { border-color: #ff7830; }
  .ft-sp { width: 8px; flex-shrink: 0; }
  .ft-ico { display: inline-flex; width: 14px; height: 14px; flex: 0 0 14px; align-items: center; justify-content: center; color: rgb(190 190 190 / 0.58); }
  .ft-ico svg { display: block; width: 14px; height: 14px; }
  .ft-ico.folder { color: rgb(194 174 132 / 0.68); }
  .ft-ico.code { color: rgb(145 173 190 / 0.68); }
  .ft-ico.markup { color: rgb(178 158 190 / 0.66); }
  .ft-ico.data { color: rgb(141 181 164 / 0.65); }
  .ft-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ft-row.ign .ft-name { text-decoration: line-through; text-decoration-thickness: 1px; }
</style>
</head>
<body>
<header class="titlebar">
  <span class="traffic"><i></i><i></i><i></i></span>
  <span class="brand">JanusX <small>远控</small></span>
  <span id="pill" class="pill">未登录</span>
  <span class="spacer"></span>
  <span id="acct" class="acct"></span>
  <button id="logoutBtn" onclick="doLogout()" style="display:none">退出</button>
</header>
<div class="layout">
  <aside class="left">
    <div class="side-scroll"><h4>工作区</h4><div id="wsList" class="list"><span class="dim">配对后加载</span></div></div>
    <div class="side-foot"><div class="orgcard"><span class="avatar" id="orgAvatar">?</span><span id="orgName">未登录</span></div></div>
  </aside>
  <section class="center" id="stage">
    <div class="card"><h3>登录 JanusX</h3><p>与桌面端同一套账号。登录后在中部输入配对信息，即可远控。（若只看到此卡且按钮无反应，说明页面 JS 被拦截或不是新版：看底栏版本号）</p>
    <input id="email" placeholder="邮箱" /><input id="password" type="password" placeholder="密码(≥8位)" />
    <input id="name" placeholder="昵称(仅注册)" /><input id="inviteCode" placeholder="邀请码(仅注册，可空)" />
    <div class="btnRow"><button class="primary" onclick="doLogin()">登录</button><button onclick="doRegister()">注册</button></div>
    <div class="err"></div></div>
  </section>
  <aside class="right"><h4>文件树 <span id="ftPath"></span></h4><div id="ftList" class="list"><span class="dim">配对后加载</span></div></aside>
</div>
<footer class="statusbar"><span id="stConn">disconnected</span><span class="spacer"></span><span id="stSeq"></span><span id="stDev"></span><span>web-ui v7</span></footer>

<script>
/* 启动自证：若底栏看不到 js-ok，说明本脚本没跑起来（旧版/缓存/被拦截），先硬刷新 */
window.addEventListener('error', function (ev) {
  try {
    var msg = (ev.message || 'script error') + '';
    var errs = document.querySelectorAll('#stage .err');
    for (var i = 0; i < errs.length; i++) errs[i].textContent = '页面脚本异常：' + msg + '（F12 看 Console）';
    var st = document.getElementById('stConn'); if (st) st.textContent = 'js-error';
  } catch (e) {}
});
var accessToken = null;
var S = { email: '', tenants: [], paired: null, ws: null, wsList: [], expandedWs: {}, dir: '', termId: null, pendingTermId: null, terms: [], ftCache: {}, ftExp: {}, activeFile: null, live: null, livePoll: null, liveSeq: 0, liveData: '', liveTid: null, liveGen: 0, xt: null, xtFit: null, xtResizeObs: null, xtInput: '', usePre: false, escBuf: '', fillWarned: false, resizeSent: null, resizeTimer: null, closedTerms: {} };
function $(id) { return document.getElementById(id); }
function deviceName() { return 'Web (' + (navigator.platform || 'browser') + ')'; }
function deviceId() {
  var id = null;
  try { id = localStorage.getItem('janusx.webtest.deviceId'); } catch (e) {}
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); try { localStorage.setItem('janusx.webtest.deviceId', id); } catch (e) {} }
  return id;
}
function authHeaders() {
  var h = { 'content-type': 'application/json', 'x-janusx-device-id': deviceId() };
  if (accessToken) h.authorization = 'Bearer ' + accessToken;
  return h;
}
function call(path, opts) {
  return fetch(path, opts).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) throw new Error((body && body.message) || ('HTTP ' + res.status));
      return body;
    });
  });
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function setPill(text, ok) { var p = $('pill'); p.textContent = text; p.className = 'pill' + (ok ? ' ok' : ''); var st = $('stConn'); if (st) st.textContent = ok ? 'connected' : 'disconnected'; }
function setOrgFoot(name) { var el = $('orgName'); if (el) el.textContent = name || '未登录'; var av = $('orgAvatar'); if (av) av.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?'; }

/* ---------- 中部舞台 ---------- */
function showLogin(err) {
  setPill('未登录', false);
  $('stage').innerHTML =
    '<div class="card"><h3>登录 JanusX</h3><p>与桌面端同一套账号。登录后在中部输入配对信息，即可远控。</p>' +
    '<input id="email" placeholder="邮箱" /><input id="password" type="password" placeholder="密码(≥8位)" />' +
    '<input id="name" placeholder="昵称(仅注册)" /><input id="inviteCode" placeholder="邀请码(仅注册，可空)" />' +
    '<div class="btnRow"><button class="primary" onclick="doLogin()">登录</button><button onclick="doRegister()">注册</button></div>' +
    '<div class="err">' + esc(err || '') + '</div></div>';
}
function showOrg(err, info) {
  setPill('已登录 ' + S.email, true);
  $('stage').innerHTML =
    '<div class="card"><h3>加入组织</h3><p>远控要求登录账号有所属组织。新建一个，或用邀请码加入。</p>' +
    '<input id="orgName" placeholder="新组织名" /><div class="btnRow"><button class="primary" onclick="doCreateTenant()">建组织并进入</button></div>' +
    '<input id="joinCode" placeholder="邀请码" /><div class="btnRow"><button onclick="doAccept()">接受邀请</button></div>' +
    '<div class="err">' + esc(err || info || '') + '</div></div>';
}
function showPair(err, info) {
  setPill('已登录 ' + S.email, true);
  $('stage').innerHTML =
    '<div class="card"><h3>输入配对信息</h3><p>找被控端要：局域网地址 + 证书指纹 + 5 分钟配对码。单机演示可用“回环自连”。</p>' +
    '<input id="baseUrl" placeholder="远端地址 https://ip:port" /><input id="fp" placeholder="远端指纹(64位hex)" />' +
    '<input id="code" placeholder="配对码" />' +
    '<div class="btnRow"><button class="primary" onclick="doPeerPair()">配对并进入</button><button onclick="doLoopPair()">回环自连</button></div>' +
    '<div class="err">' + esc(err || info || '') + '</div></div>';
}
function showTerminal() {
  var p = S.paired;
  if (!p || (p.kind === 'peer' && !p.hostId)) { showPair('配对信息缺失，请重新配对。', ''); return; }
  setPill('远控中 ' + (p.kind === 'peer' ? String(p.hostId).slice(0, 8) : '本机回环'), true);
  $('stage').innerHTML =
    '<div class="termhead"><h4>终端 <span id="liveId"></span> <span id="liveSeq"></span></h4><span class="spacer"></span><button class="iconBtn" onclick="doDisconnect()" title="断开远控">✕</button></div>' +
    '<div class="termbar"><div id="termList" role="tablist"></div>' +
    '<select id="newEngine" title="新建终端引擎"><option value="codex">codex</option><option value="claude">claude</option><option value="opencode">opencode</option></select>' +
    '<button class="primary" onclick="doCreateTerminal()" title="在当前工作区新建终端">＋ 新建</button><button onclick="doStop()" title="中断当前终端">中断</button>' +
    '<button class="iconBtn" onclick="doRefit()" title="重排终端显示（占满工作区）">⤢</button></div>' +
    '<div id="xtermWrap" style="display:none"></div>' +
    '<pre class="term" id="live">连接中…</pre>' +
    '<div class="dim termHint">直接在终端里输入，回车执行；Ctrl+C 中断；× 销毁终端（与桌面关闭一致）。</div>' +
    '<div class="err termErrLine" id="termErr"></div>';
  loadWorkbench();
}

/* ---------- 账号/组织 ---------- */
function rememberBundle(b) {
  accessToken = b.token;
  try { localStorage.setItem('janusx.webtest.refresh', b.refreshToken); } catch (e) {}
  S.email = (b.user && b.user.email) || S.email;
  S.tenants = b.tenants || S.tenants;
  $('acct').textContent = S.email;
  $('logoutBtn').style.display = '';
  var active = null;
  try { active = (b.tenants || []).filter(function (t) { return t.id === ((b.session || {}).activeTenantId || ''); })[0] || (b.tenants || [])[0]; } catch (e) {}
  setOrgFoot(active ? active.name : S.email);
  var dev = $('stDev'); if (dev) dev.textContent = deviceId().slice(0, 8);
  return b;
}
function doRegister() {
  busyBtn(true);
  call('/api/team/register', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: $('email').value, password: $('password').value, name: $('name').value || undefined, inviteCode: $('inviteCode').value || undefined, device: { deviceId: deviceId(), name: deviceName() } }) })
    .then(function (b) { rememberBundle(b); afterAuth(); }).catch(function (e) { showLogin(e.message); });
}
function doLogin() {
  busyBtn(true);
  call('/api/team/login', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: $('email').value, password: $('password').value, device: { deviceId: deviceId(), name: deviceName() } }) })
    .then(function (b) { rememberBundle(b); afterAuth(); }).catch(function (e) { showLogin(e.message); });
}
/* 点击即时反馈：防止“点了没反应”的误判；请求回包后舞台重绘，按钮自然恢复 */
function busyBtn(on) {
  try {
    var btns = document.querySelectorAll('#stage .card button');
    for (var i = 0; i < btns.length; i++) { btns[i].disabled = !!on; if (on && btns[i].classList.contains('primary')) btns[i].textContent = '请求中…'; }
    var st = $('stConn'); if (st && on) st.textContent = 'requesting…';
  } catch (e) {}
}
function dropTerm() {
  stopLive();
  if (S.resizeTimer) { try { clearTimeout(S.resizeTimer); } catch (e) {} S.resizeTimer = null; }
  S.resizeSent = null;
  if (S.xtResizeObs) { try { S.xtResizeObs.disconnect(); } catch (e) {} S.xtResizeObs = null; }
  if (S.xt) { try { S.xt.dispose(); } catch (e) {} S.xt = null; }
  S.xtFit = null; S.usePre = false; S.xtInput = ''; S.liveSeq = 0; S.liveData = ''; S.pendingTermId = null; S.liveTid = null;
}
function doLogout() {
  call('/api/team/logout', { method: 'POST', headers: authHeaders() }).catch(function () {});
  dropTerm();
  accessToken = null; S = { email: '', tenants: [], paired: null, ws: null, wsList: [], expandedWs: {}, dir: '', termId: null, pendingTermId: null, terms: [], ftCache: {}, ftExp: {}, activeFile: null, live: null, livePoll: null, liveSeq: 0, liveData: '', liveTid: null, liveGen: 0, xt: null, xtFit: null, xtResizeObs: null, xtInput: '', usePre: false, escBuf: '', fillWarned: false, resizeSent: null, resizeTimer: null, closedTerms: {} };
  stopLive(); $('acct').textContent = ''; $('logoutBtn').style.display = 'none'; setOrgFoot('');
  $('wsList').innerHTML = '<span class="dim">配对后加载</span>'; $('ftList').innerHTML = '<span class="dim">配对后加载</span>';
  showLogin('');
}
function afterAuth() {
  if (!S.tenants.length) { showOrg('', ''); return; }
  showPair('', '');
}
function doCreateTenant() {
  call('/api/team/tenants', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: $('orgName').value }) })
    .then(function (b) { rememberBundle(b); showPair('', '已进入组织，可配对。'); }).catch(function (e) { showOrg(e.message, ''); });
}
function doAccept() {
  call('/api/team/accept', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code: $('joinCode').value }) })
    .then(function () { return call('/api/team/me', { headers: authHeaders() }); })
    .then(function (me) { S.tenants = me.tenants || []; showPair('', '已加入组织，可配对。'); })
    .catch(function (e) { showOrg(e.message, ''); });
}

/* ---------- 配对 ---------- */
function peerHost() { return S.paired && S.paired.kind === 'peer' ? S.paired.hostId : ''; }
function doLoopPair() {
  call('/api/remote/issue-code', { method: 'POST', headers: authHeaders() })
    .then(function (c) { return call('/api/remote/redeem', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code: c.code, deviceName: deviceName() }) }); })
    .then(function () { S.paired = { kind: 'local' }; showTerminal(); })
    .catch(function (e) { showPair(e.message, ''); });
}
function doPeerPair() {
  call('/api/peer/pair', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ baseUrl: $('baseUrl').value, fingerprint: $('fp').value, code: $('code').value, deviceName: deviceName() }) })
    .then(function (r) {
      if (!r || typeof r.hostDeviceId !== 'string' || !r.hostDeviceId) { showPair('配对返回异常（缺设备标识），请重试。', ''); return; }
      S.paired = { kind: 'peer', hostId: r.hostDeviceId }; showTerminal();
    })
    .catch(function (e) { showPair(e.message, ''); });
}
function doDisconnect() {
  dropTerm();
  if (S.paired && S.paired.kind === 'peer') call('/api/peer/disconnect', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ hostDeviceId: S.paired.hostId }) }).catch(function () {});
  S.paired = null; S.ws = null; S.termId = null; S.pendingTermId = null;
  $('wsList').innerHTML = '<span class="dim">配对后加载</span>'; $('ftList').innerHTML = '<span class="dim">配对后加载</span>';
  showPair('', '已断开。');
}

/* ---------- 三栏加载（左工作区 / 右文件树 / 中终端） ---------- */
function loadWorkbench() {
  var peer = peerHost();
  var vbase = peer ? '/api/peer/view' : '/api/view';
  var hp = peer ? '?hostDeviceId=' + encodeURIComponent(peer) : '';
  call(vbase + '/workspaces' + hp, { headers: authHeaders() }).then(function (list) {
    S.wsList = list || [];
    if (!S.ws && S.wsList[0]) S.ws = S.wsList[0].id;
    if (S.ws && !S.expandedWs) S.expandedWs = {};
    if (S.ws) S.expandedWs[S.ws] = true;
    var names = {};
    S.wsList.forEach(function (w) { names[w.id] = w.name; });
    $('ftPath').textContent = names[S.ws] || '';
    S.ftCache = {}; S.ftExp = {}; S.activeFile = null;
    renderWs(); loadFiles(); renderTerms();
  }).catch(function (e) { termErr(e.message); });
  var tbase = peer ? '/api/peer/view/terminals?hostDeviceId=' + encodeURIComponent(peer) : '/api/view/terminals';
  call(tbase, { headers: authHeaders() }).then(function (list) {
    S.terms = list || [];
    renderTerms(); renderWs();
  }).catch(function (e) { termErr(e.message); });
}
/* 中部 Tab 为唯一主体：只显示当前工作区终端，左栏嵌套终端仅做快捷跳转，不另建一套管理 */
function visibleTerms() {
  return (S.terms || []).filter(function (t) { return (!S.ws || t.workspaceId === S.ws) && !S.closedTerms[t.terminalId]; });
}
function renderTerms() {
  var box = $('termList'); if (!box) return; box.innerHTML = '';
  var list = visibleTerms();
  list.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.title = t.terminalId;
    b.setAttribute('aria-selected', t.terminalId === S.termId ? 'true' : 'false');
    var dot = document.createElement('i'); dot.className = 'dot' + (t.status === 'running' ? ' run' : t.status === 'exited' ? ' exit' : '');
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = t.terminalId.slice(0, 8) + ' · ' + t.status;
    b.appendChild(dot); b.appendChild(nm);
    var x = document.createElement('span'); x.textContent = '×'; x.title = '销毁该终端'; x.className = 'tabClose';
    x.onclick = function (ev) { closeTabView(t.terminalId, ev); };
    b.appendChild(x);
    if (t.terminalId === S.termId) b.classList.add('active');
    b.onclick = function () { openTerm(t.terminalId); };
    box.appendChild(b);
  });
  /* 销毁失败会留下乐观隐藏：给一个恢复入口，避免终端“丢失” */
  var hiddenCount = (S.terms || []).filter(function (t) { return (!S.ws || t.workspaceId === S.ws) && S.closedTerms[t.terminalId]; }).length;
  if (hiddenCount > 0) {
    var rb = document.createElement('button');
    rb.type = 'button'; rb.title = '销毁失败的终端仍在远端，点击恢复显示';
    rb.style.cssText = 'flex-shrink:0;';
    rb.textContent = '已隐藏(' + hiddenCount + ')·恢复';
    rb.onclick = function () {
      (S.terms || []).forEach(function (t) { if (!S.ws || t.workspaceId === S.ws) delete S.closedTerms[t.terminalId]; });
      reloadTerms();
    };
    box.appendChild(rb);
  }
  /* 新建后等待列表回包期间保持 pending，不被 list[0] 抢占；仅当当前选中已不在列表且无 pending 时才跟随首个。
     关键：新建把 S.termId 提前切到新终端，列表回包后 current 命中但 live 还停留在旧终端，必须 startLive 否则界面只剩占位文案。 */
  var current = null;
  for (var i = 0; i < list.length; i++) { if (list[i].terminalId === S.termId) { current = list[i]; break; } }
  if (current) {
    if (S.pendingTermId === S.termId || S.liveTid !== S.termId) {
      S.pendingTermId = null;
      startLive(); renderWs();
    }
    markActiveTerm(); return;
  }
  if (S.pendingTermId) {
    var pending = null;
    for (var j = 0; j < list.length; j++) { if (list[j].terminalId === S.pendingTermId) { pending = list[j]; break; } }
    if (pending) { S.termId = pending.terminalId; S.pendingTermId = null; startLive(); renderWs(); markActiveTerm(); return; }
    markActiveTerm(); return;
  }
  var first = list[0];
  if (first) { S.termId = first.terminalId; startLive(); }
  else if ($('live')) { xout('[当前工作区暂无终端，点“＋ 新建”]'); }
  markActiveTerm();
}
function markActiveTerm() {
  var box = $('termList'); if (!box) return;
  var btns = box.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].title === S.termId);
}
function doCreateTerminal() {
  if (!S.ws) { termErr('先在左侧选一个工作区'); return; }
  var engineEl = $('newEngine');
  var engine = engineEl ? engineEl.value : 'codex';
  var peer = peerHost();
  termErr('');
  var req = peer
    ? call('/api/peer/create-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ hostDeviceId: peer, workspaceId: S.ws, engine: engine }) })
    : call('/api/remote/create-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ workspaceId: S.ws, engine: engine }) });
  req.then(function (r) {
    if (!r.ok) { termErr(r.message || '建终端失败'); return; }
    if (r.targetTerminalId) {
      delete S.closedTerms[r.targetTerminalId];
      S.pendingTermId = r.targetTerminalId;
      S.termId = r.targetTerminalId;
      if ($('live')) { xclear(); xout('[正在创建终端 ' + String(r.targetTerminalId).slice(0, 8) + '…]'); }
      markActiveTerm();
    }
    reloadTerms();
  }).catch(function (e) { termErr(e.message); });
}
function reloadTerms() {
  var peer = peerHost();
  var tbase = peer ? '/api/peer/view/terminals?hostDeviceId=' + encodeURIComponent(peer) : '/api/view/terminals';
  call(tbase, { headers: authHeaders() }).then(function (list) {
    S.terms = list || [];
    /* 销毁成功的终端已不在列表：顺手清理乐观隐藏，避免集合无限增长 */
    var alive = {};
    S.terms.forEach(function (t) { alive[t.terminalId] = true; });
    Object.keys(S.closedTerms).forEach(function (id) { if (!alive[id]) delete S.closedTerms[id]; });
    /* 当前选中若已被远端销毁（他端删除/× 杀掉），自动跟随同工作区首个 */
    var currentAlive = S.termId && alive[S.termId];
    if (!currentAlive && S.termId) {
      stopLive(); S.termId = null;
      var rest = visibleTerms();
      if (rest[0]) { S.termId = rest[0].terminalId; startLive(); }
      else if ($('live')) { xclear(); xout('[当前工作区暂无终端，点“＋ 新建”]'); }
    }
    renderTerms(); renderWs();
  }).catch(function (e) { termErr(e.message); });
}
/* 左栏工作区行（对标桌面 Sidebar）：chevron 展开嵌套终端 + 计数徽标 + accent 条 */
function wsTerms(id) {
  return (S.terms || []).filter(function (t) { return t.workspaceId === id && !S.closedTerms[t.terminalId]; });
}
function renderWs() {
  var box = $('wsList'); if (!box) return; box.innerHTML = '';
  if (!S.wsList || !S.wsList.length) { box.innerHTML = '<span class="dim">无工作区</span>'; return; }
  S.wsList.forEach(function (w) {
    var terms = wsTerms(w.id);
    var running = terms.filter(function (t) { return t.status === 'running'; }).length;
    var row = document.createElement('div');
    row.className = 'ws-row' + (w.id === S.ws ? ' active' : '');
    var bar = document.createElement('span'); bar.className = 'ws-accent'; row.appendChild(bar);
    var chev = document.createElement('button');
    chev.className = 'ws-chev' + (S.expandedWs[w.id] ? ' exp' : '');
    chev.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5l7 7-7 7"/></svg>';
    chev.title = '展开/收起终端';
    chev.onclick = function (ev) { ev.stopPropagation(); S.expandedWs[w.id] = !S.expandedWs[w.id]; renderWs(); };
    row.appendChild(chev);
    var nm = document.createElement('span'); nm.className = 'ws-name'; nm.textContent = w.name; row.appendChild(nm);
    if (w.terminalCount > 0) {
      var badge = document.createElement('span');
      badge.className = 'ws-badge ' + (running > 0 ? 'run' : 'idle');
      badge.title = running + ' 运行 / 共 ' + w.terminalCount;
      var dot = document.createElement('i'); dot.className = 'dot'; badge.appendChild(dot);
      var num = document.createElement('span'); num.textContent = String(w.terminalCount); badge.appendChild(num);
      row.appendChild(badge);
    }
    row.onclick = function () { selectWs(w.id); };
    box.appendChild(row);
    if (S.expandedWs[w.id] && terms.length) {
      var sub = document.createElement('div'); sub.className = 'ws-terms';
      terms.forEach(function (t) {
        var tr = document.createElement('div');
        tr.className = 'ws-term' + (t.terminalId === S.termId ? ' focus' : '');
        tr.title = t.terminalId;
        var td = document.createElement('i'); td.className = 'dot' + (t.status === 'running' ? ' run' : t.status === 'exited' ? ' exit' : '');
        var tn = document.createElement('span'); tn.className = 'ws-tname'; tn.textContent = t.terminalId.slice(0, 8);
        var ts = document.createElement('span'); ts.className = 'ws-tsub'; ts.textContent = t.status;
        tr.appendChild(td); tr.appendChild(tn); tr.appendChild(ts);
        tr.onclick = function (ev) { ev.stopPropagation(); if (w.id !== S.ws) selectWs(w.id); openTerm(t.terminalId); };
        sub.appendChild(tr);
      });
      box.appendChild(sub);
    }
  });
}
function selectWs(id) {
  if (S.ws === id && S.ftCache && S.ftCache['']) { renderWs(); return; }
  /* 隐藏态跨工作区保留：× 已改为真销毁，已删终端不在列表里自然消失，不再靠清空复活 */
  var pending = S.pendingTermId;
  S.ws = id; S.ftCache = {}; S.ftExp = {}; S.activeFile = null;
  S.termId = null; S.pendingTermId = pending || null;
  stopLive();
  var names = {};
  S.wsList.forEach(function (w) { names[w.id] = w.name; });
  var fp = $('ftPath'); if (fp) fp.textContent = names[id] || '';
  renderWs(); loadFiles(); renderTerms();
}
function openTerm(id) {
  if (S.termId === id) { markActiveTerm(); return; }
  S.termId = id; S.pendingTermId = null; startLive(); renderWs(); markActiveTerm();
}
/* 右栏文件树（对标桌面 FileTreeItem）：缩进 + 三角 + 类型图标 + 选中/忽略态，懒加载 */
function ftIconCls(name, type) {
  if (type === 'directory') return 'folder';
  var ext = name.split('.').pop().toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'sh', 'ps1'].indexOf(ext) >= 0) return 'code';
  if (['md', 'markdown', 'txt'].indexOf(ext) >= 0) return 'markup';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].indexOf(ext) >= 0) return 'markup';
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'cfg'].indexOf(ext) >= 0) return 'data';
  return 'muted';
}
function ftIconSvg(cls, isDir) {
  var inner = isDir
    ? '<path d="M1.5 4.5h5l1.2 1.4h6.8v6.6h-13zM1.5 4.5V3h4.2l1.2 1.5"/>'
    : cls === 'code'
      ? '<path d="m5.5 4-3 4 3 4M10.5 4l3 4-3 4M9 2.8 7 13.2"/>'
      : '<path d="M3 1.8h6.5L13 5.3v8.9H3zM9.5 1.8v3.5H13"/>';
  return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
}
function fetchDir(dir) {
  var peer = peerHost();
  var url = peer
    ? '/api/peer/view/files?hostDeviceId=' + encodeURIComponent(peer) + '&workspaceId=' + encodeURIComponent(S.ws) + '&dir=' + encodeURIComponent(dir)
    : '/api/view/files?workspaceId=' + encodeURIComponent(S.ws) + '&dir=' + encodeURIComponent(dir);
  return call(url, { headers: authHeaders() });
}
function loadFiles() {
  if (!S.ws) return;
  fetchDir('').then(function (list) {
    S.ftCache = { '': list || [] };
    S.ftExp = {};
    renderFt();
  }).catch(function (e) { termErr(e.message); });
}
function toggleFt(node) {
  var key = node.relPath;
  if (S.ftExp[key]) { delete S.ftExp[key]; renderFt(); return; }
  if (S.ftCache[key]) { S.ftExp[key] = true; renderFt(); return; }
  fetchDir(key).then(function (list) {
    S.ftCache[key] = list || [];
    S.ftExp[key] = true;
    renderFt();
  }).catch(function (e) { termErr(e.message); });
}
function renderFtNode(box, node, depth) {
  var isDir = node.type === 'directory';
  var expanded = !!S.ftExp[node.relPath];
  var row = document.createElement('div');
  row.className = 'ft-row' + (S.activeFile === node.relPath ? ' sel' : '') + (node.isGitIgnored ? ' ign' : '');
  row.style.paddingLeft = (8 + depth * 16) + 'px';
  row.title = node.relPath;
  if (isDir) {
    var chev = document.createElement('span');
    chev.className = 'ft-chev' + (expanded ? ' exp' : '');
    row.appendChild(chev);
  } else {
    var sp = document.createElement('span'); sp.className = 'ft-sp'; row.appendChild(sp);
  }
  var ico = document.createElement('span');
  var cls = ftIconCls(node.name, node.type);
  ico.className = 'ft-ico ' + cls;
  ico.innerHTML = ftIconSvg(cls, isDir);
  row.appendChild(ico);
  var nm = document.createElement('span'); nm.className = 'ft-name'; nm.textContent = node.name;
  row.appendChild(nm);
  row.onclick = function () {
    if (isDir) toggleFt(node);
    else { S.activeFile = node.relPath; renderFt(); }
  };
  box.appendChild(row);
  if (isDir && expanded) {
    var kids = S.ftCache[node.relPath];
    if (!kids) { toggleFt(node); return; }
    kids.forEach(function (child) { renderFtNode(box, child, depth + 1); });
  }
}
function renderFt() {
  var box = $('ftList'); if (!box) return; box.innerHTML = '';
  var root = (S.ftCache || {})[''];
  if (!root) return;
  if (!root.length) { box.innerHTML = '<span class="dim">空目录</span>'; return; }
  root.forEach(function (node) { renderFtNode(box, node, 0); });
}
function termErr(m) { var el = $('termErr'); if (el) el.textContent = m; }

/* ---------- 真终端（xterm，失败降级文本流） ---------- */
function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var el = document.createElement('script');
    el.src = src; el.onload = function () { resolve(); }; el.onerror = function () { reject(new Error('load ' + src)); };
    document.head.appendChild(el);
  });
}
/* fit 必须在可见布局后量：双 rAF 等待浏览器完成样式与布局，否则量出 0 尺寸。
   量完必须验：xterm.css/字体晚到会让 cell 量错，终端缩在左上角；canvas 远小于容器则延迟重试自愈。 */
var FIT_RETRY_DELAYS = [120, 300, 700, 1500];
function termContentWidth() {
  /* 量真实内容宽度：xterm v6 默认 DOM 渲染（.xterm-rows），旧版 canvas 渲染看 canvas；
     外层 .xterm 被本站 CSS 拉到 100%，量它永远“正常”，必须看内容本身 */
  try {
    var el = S.xt && S.xt.element;
    if (!el || !el.querySelector) return 0;
    var rows = el.querySelector('.xterm-rows');
    if (rows && rows.clientWidth) return rows.clientWidth;
    var canvas = el.querySelector('canvas');
    return (canvas && canvas.clientWidth) || 0;
  } catch (e) { return 0; }
}
function updateDimsLabel() {
  try {
    var liveId = $('liveId');
    if (!liveId || !S.xt || S.usePre) return;
    var wrap = $('xtermWrap');
    liveId.textContent = (S.termId || '').slice(0, 8) + ' ' + S.xt.cols + '×' + S.xt.rows;
    liveId.title = 'canvas ' + termCanvasWidth() + 'px / wrap ' + (wrap ? wrap.clientWidth + '×' + wrap.clientHeight + 'px' : '?');
  } catch (e) {}
}
function fitTerminal(attempt) {
  attempt = attempt || 0;
  if (S.usePre || !S.xt || !S.xtFit) return;
  var wrap = $('xtermWrap');
  if (!wrap || wrap.style.display === 'none') return;
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
  raf(function () {
    raf(function () {
      try { S.xtFit.fit(); } catch (e) {}
      updateDimsLabel();
      maybeSendResize();
      /* 自愈：内容像素远小于容器说明这次量错了（样式/字体/布局未稳），按退避重试；
         内容还没渲染出来（0 宽）同样重试；耗尽仍失败则明示而非静默缩着 */
      try {
        var cw = termContentWidth();
        if (wrap.clientWidth > 0 && (cw === 0 || wrap.clientWidth / cw > 1.6)) {
          if (attempt < FIT_RETRY_DELAYS.length) {
            setTimeout(function () { fitTerminal(attempt + 1); }, FIT_RETRY_DELAYS[attempt]);
          } else if (!S.fillWarned) {
            S.fillWarned = true;
            termErr('终端未占满（' + S.xt.cols + '×' + S.xt.rows + ' / 容器 ' + wrap.clientWidth + '×' + wrap.clientHeight + 'px），点右上 ⤢ 重排');
          }
        } else if (S.fillWarned) {
          S.fillWarned = false;
          if ($('termErr') && $('termErr').textContent.indexOf('终端未占满') === 0) termErr('');
        }
      } catch (e) {}
    });
  });
}
function doRefit() { fitTerminal(0); setTimeout(function () { fitTerminal(0); }, 120); }
/* 前端 fit 出列行数后回传被控端 PTY（防抖 + 变更才发）：被控 TUI 按新尺寸重绘才会占满 */
function maybeSendResize() {
  if (S.usePre || !S.xt || !S.termId) return;
  var cols = S.xt.cols, rows = S.xt.rows;
  if (!cols || !rows) return;
  var sent = S.resizeSent;
  if (sent && sent.tid === S.termId && sent.cols === cols && sent.rows === rows) return;
  var tid = S.termId;
  if (S.resizeTimer) { try { clearTimeout(S.resizeTimer); } catch (e) {} S.resizeTimer = null; }
  S.resizeTimer = setTimeout(function () {
    S.resizeTimer = null;
    if (S.termId !== tid || !S.xt || S.xt.cols !== cols || S.xt.rows !== rows) return;
    S.resizeSent = { tid: tid, cols: cols, rows: rows };
    var peer = peerHost();
    var req = peer
      ? call('/api/peer/resize-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ hostDeviceId: peer, terminalId: tid, cols: cols, rows: rows }) })
      : call('/api/remote/resize-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ terminalId: tid, cols: cols, rows: rows }) });
    req.catch(function () {});
  }, 300);
}
/* xterm 与文本视图互斥显隐：切终端/重连后统一收敛，避免新旧节点错位 */
function syncTermView() {
  var wrap = $('xtermWrap'); var pre = $('live');
  if (S.xt && !S.usePre) {
    if (wrap) wrap.style.display = '';
    if (pre) pre.style.display = 'none';
  } else if (pre) {
    pre.style.display = '';
  }
}
/* xterm.css 越早到，首 fit 越准：配对前即预载，避免 open 时字体度量缺失 */
function ensureXtermCss() {
  try {
    if (document.querySelector('link[data-xterm]')) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.setAttribute('data-xterm', '1'); css.href = '/__janusx/xterm.css';
    document.head.appendChild(css);
  } catch (e) {}
}
function ensureXterm() {
  /* 重进终端 stage 会重建 DOM：旧实例绑在已 detach 的节点上，必须重建，否则新容器永远空白 */
  if (S.xt && S.xt.element && !S.xt.element.isConnected) {
    try { S.xt.dispose(); } catch (e) {}
    S.xt = null; S.xtFit = null;
    if (S.xtResizeObs) { try { S.xtResizeObs.disconnect(); } catch (e) {} S.xtResizeObs = null; }
  }
  if (S.xt || S.usePre) { syncTermView(); fitTerminal(0); return Promise.resolve(); }
  ensureXtermCss();
  return loadScript('/__janusx/xterm.js').then(function () { return loadScript('/__janusx/addon-fit.js'); }).then(function () {
    /* 先显示容器再 open：display:none 时 open 会量出 0 尺寸，fit 算出极小行列，终端只占左上角 */
    syncTermView();
    var term = new Terminal({ fontFamily: "'Cascadia Mono', Consolas, monospace", fontSize: 12, theme: { background: '#0e0f12', foreground: '#d4d4d4' } });
    var fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open($('xtermWrap'));
    S.xt = term; S.xtFit = fit;
    syncTermView(); fitTerminal(0);
    term.onData(function (data) { onTermKey(data); });
    window.addEventListener('resize', function () { fitTerminal(0); });
    /* 中部工作区占满后容器尺寸会变：观察 wrap 尺寸变化即 refit */
    try {
      if (window.ResizeObserver && !S.xtResizeObs) {
        var obs = new ResizeObserver(function () { fitTerminal(0); });
        obs.observe($('xtermWrap'));
        S.xtResizeObs = obs;
      }
    } catch (e) {}
  }).catch(function () {
    S.usePre = true;
    syncTermView();
  });
}
/* 文本降级路径的 ANSI 净化：xterm 能渲染转义序列，<pre> 不能，直接显示就是满屏数据码。
   注意：本文件是外层模板字符串，服务端 JS 里的反斜杠需双写（\\x1b 才会在页面里留下 \x1b）。 */
function stripAnsiForPre(text) {
  var s = String(text == null ? '' : text);
  /* OSC（ESC ] ... BEL 或 ESC \)先清，否则残留可读字符 */
  s = s.replace(/\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)/g, '');
  /* CSI / DCS / 通用 ESC 序列 */
  s = s.replace(/\\x1b\\[[0-9;?]*[A-Za-z]/g, '').replace(/\\x1b\\([0-9A-B]/g, '').replace(/\\x1b[()][0-9A-Za-z]/g, '').replace(/\\x1b[#>%()=+\\/\\\\*]/g, '').replace(/\\x9b[0-9;?]*[A-Za-z]/g, '');
  /* 残留控制码（保留换行回车制表），其余全部去掉 */
  s = s.replace(/[\\x00-\\x08\\x0b-\\x0c\\x0e-\\x1f\\x7f]/g, '');
  /* PTY 进度条常用单回车回行：在 <pre> 里把“同行覆盖”折成只留最后一段，避免 spinner 刷屏 */
  var lines = s.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('\\r') >= 0) {
      var parts = lines[i].split('\\r');
      lines[i] = parts[parts.length - 1];
    }
  }
  return lines.join('\\n');
}
/* 输出统一入口：xterm 优先（原生渲染 ANSI），失败回文本（先净化再追加，避免数据码刷屏） */
function xout(text) {
  if (S.xt && !S.usePre) { try { S.xt.write(text); return; } catch (e) { S.usePre = true; } }
  var pre = $('live'); if (!pre) return;
  var clean = stripAnsiForPre(text);
  if (!clean) return;
  pre.style.display = '';
  /* 文本模式有界：超过 200KB 截头，防止常驻 spinner 把 DOM 撑爆 */
  var next = pre.textContent + clean;
  if (next.length > 200 * 1024) next = next.slice(-200 * 1024);
  pre.textContent = next; pre.scrollTop = pre.scrollHeight;
}
function xclear() {
  S.xtInput = '';
  if (S.xt && !S.usePre) { try { S.xt.clear(); return; } catch (e) {} }
  var pre = $('live'); if (pre) { pre.style.display = ''; pre.textContent = ''; }
}
function xprompt() { /* 保留空壳：提示符由被控端真实输出，不再合成 */ }
/* 受控语义：远端只收整行，xterm 侧本地回显 + 行缓冲；Ctrl+C 走中断。
   转义序列（方向键/鼠标上报等）整段吞掉，不污染行缓冲；Delete 键视同退格。
   注意：鼠标跟踪开启后悬停会产生 ESC[<...M Flood，旧逻辑在 '[' 处即截断导致 '<0;..' 漏为可打印输入，
   表现为“鼠标放上去就一直有内容输入”。此处按 CSI/OSC 状态机完整吞掉。 */
function onTermKey(data) {
  if (!S.termId) return;
  for (var i = 0; i < data.length; i++) {
    var ch = data[i];
    var code = data.charCodeAt(i);
    if (S.escBuf) {
      S.escBuf += ch;
      var intro = S.escBuf.charAt(1);
      if (S.escBuf.length === 2) {
        if (ch === '[' || ch === ']' || ch === 'O') continue;
        if (ch === '(' || ch === ')' || ch === '#' || ch === '%' || ch === 'P' || ch === 'X' || ch === '^' || ch === '_') continue;
        S.escBuf = '';
        continue;
      }
      if (intro === '[') {
        /* X10 鼠标：ESC[M 后跟 3 个原始字节（可 <64），不能按 final 字节判断，需按长度吞 */
        if (S.escBuf.length >= 3 && S.escBuf.charAt(2) === 'M') {
          if (S.escBuf.length >= 6) S.escBuf = '';
          continue;
        }
        if (S.escBuf.length <= 2) continue;
        if (code >= 64 && code <= 126) S.escBuf = '';
        if (S.escBuf.length > 64) S.escBuf = '';
        continue;
      }
      if (intro === 'O') {
        if (S.escBuf.length >= 3) S.escBuf = '';
        continue;
      }
      if (intro === ']') {
        if (code === 7) S.escBuf = '';
        else if (ch === '\\\\' && S.escBuf.slice(-2) === '\\x1b\\\\') S.escBuf = '';
        if (S.escBuf.length > 256) S.escBuf = '';
        continue;
      }
      if (S.escBuf.length >= 3) S.escBuf = '';
      continue;
    }
    if (code === 27) { S.escBuf = ch; continue; }
    if (code === 13) { var line = S.xtInput; S.xtInput = ''; xout('\\r\\n'); sendLine(line); }
    else if (code === 3) { S.xtInput = ''; xout('^C'); xout('\\r\\n'); doStop(); }
    else if (code === 127 || code === 8) { if (S.xtInput.length) { S.xtInput = S.xtInput.slice(0, -1); xout('\b \b'); } }
    else if (code >= 32 || code === 9) { S.xtInput += ch; xout(ch); }
  }
}
function sendLine(text) {
  if (!text.trim()) return;
  var exec = peerHost() ? peerExec : localExec;
  exec({ type: 'bind', terminalId: S.termId }).then(function (bind) {
    if (!bind.ok) { termErr(bind.message); return null; }
    return exec({ type: 'follow-up', text: text });
  }).then(function (r) {
    if (!r) return;
    if (!r.ok) termErr(r.message);
  }).catch(function (e) { termErr(e.message); });
}

/* ---------- 终端实时 + 发送 ---------- */
function stopLive() {
  S.liveGen = (S.liveGen || 0) + 1;
  S.liveTid = null;
  if (S.live) { try { S.live.close(); } catch (e) {} S.live = null; }
  if (S.livePoll) { clearInterval(S.livePoll); S.livePoll = null; }
  var sq = $('liveSeq'); if (sq) sq.textContent = '(已停)';
}
function startLive() {
  stopLive();
  var tid = S.termId; if (!tid || !$('stage')) return;
  var liveId = $('liveId'); if (liveId) liveId.textContent = tid.slice(0, 8);
  markActiveTerm();
  var myGen = S.liveGen;
  S.liveTid = tid;
  ensureXterm().then(function () {
    /* 切 tab 很快时旧 promise 后 resolve：代际已过期则直接丢弃，避免清掉新终端视图 */
    if (myGen !== S.liveGen || S.termId !== tid) return;
    xclear();
    S.liveSeq = 0; S.liveData = '';
    var peer = peerHost();
    if (peer) {
      /* 增量拉取：只写新增段；环形缓冲截头导致非前缀时先清屏再写尾部，避免整量重复追加 */
      var pull = function () {
        call('/api/peer/tail?hostDeviceId=' + encodeURIComponent(peer) + '&terminalId=' + encodeURIComponent(tid), { headers: authHeaders() })
          .then(function (r) {
            if (S.termId !== tid) return;
            var data = r.data || '';
            var seq = typeof r.seq === 'number' ? r.seq : S.liveSeq;
            if (seq < S.liveSeq) { S.liveSeq = seq; S.liveData = ''; xclear(); if (data) xout(data); S.liveData = data; setSeq(seq); return; }
            if (seq === S.liveSeq) return;
            var chunk = data.indexOf(S.liveData) === 0 ? data.slice(S.liveData.length) : data;
            var reset = data.indexOf(S.liveData) !== 0;
            S.liveSeq = seq;
            S.liveData = data;
            if (reset) xclear();
            if (chunk) xout(chunk);
            setSeq(seq);
          })
          .catch(function (e) { termErr(e.message); stopLive(); });
      };
      pull(); S.livePoll = setInterval(pull, 2000);
      return;
    }
    var params = 'terminalId=' + encodeURIComponent(tid) + '&deviceId=' + encodeURIComponent(deviceId()) + '&token=' + encodeURIComponent(accessToken || '');
    var src = new EventSource('/api/view/stream?' + params);
    S.live = src;
    src.onmessage = function (ev) {
      try {
        var f = JSON.parse(ev.data);
        if (S.termId !== tid) return;
        if (f.error || f.status === 'exited') { setSeq(f.seq); stopLive(); return; }
        /* 服务端截头重发会带 reset：先清屏再写，避免 32KB 尾部重复堆积；seq 回退同样清屏 */
        if (typeof f.seq === 'number' && f.seq < S.liveSeq) { S.liveSeq = f.seq; S.liveData = ''; xclear(); }
        if (f.reset) xclear();
        if (f.chunk) xout(f.chunk);
        if (typeof f.seq === 'number') { S.liveSeq = f.seq; }
        /* 本地维护 liveData 仅用于 peer 模式去重；SSE 模式以 seq + reset 为准 */
        setSeq(f.seq);
      } catch (e) {}
    };
    src.onerror = function () { stopLive(); };
  });
}
function setSeq(seq) {
  if (typeof seq !== 'number' || !isFinite(seq)) return;
  $('liveSeq').textContent = 'seq=' + seq;
  var sq = $('stSeq'); if (sq) sq.textContent = 'seq=' + seq;
}
function peerExec(cmd) {
  return call('/api/peer/execute', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ hostDeviceId: peerHost(), command: cmd }) });
}
function localExec(cmd) {
  return call('/api/remote/execute', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ command: cmd }) });
}
/* tab 关闭即真销毁远端终端（与桌面关闭一致）：先乐观隐藏保证即时响应，再调接口，失败则报错并以服务端列表为准 */
function closeTabView(id, ev) {
  if (ev) ev.stopPropagation();
  S.closedTerms[id] = true;
  if (S.pendingTermId === id) S.pendingTermId = null;
  if (S.termId === id) {
    stopLive(); S.termId = null;
    var rest = (S.terms || []).filter(function (t) { return (!S.ws || t.workspaceId === S.ws) && !S.closedTerms[t.terminalId]; });
    if (rest[0]) { S.termId = rest[0].terminalId; startLive(); }
    else if ($('live')) { xclear(); xout('[终端已关闭，点“＋ 新建”继续]'); }
  }
  renderTerms(); renderWs();
  var peer = peerHost();
  var req = peer
    ? call('/api/peer/kill-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ hostDeviceId: peer, terminalId: id }) })
    : call('/api/remote/kill-terminal', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ terminalId: id }) });
  req.then(function (r) {
    if (r && r.success === false) termErr((r && r.message) || '销毁终端失败');
    reloadTerms();
  }).catch(function (e) { termErr(e.message); reloadTerms(); });
}
function doStop() {
  var tid = S.termId; if (!tid) return;
  var exec = peerHost() ? peerExec : localExec;
  exec({ type: 'bind', terminalId: tid }).then(function () { return exec({ type: 'stop' }); })
    .then(function (r) { if (r && !r.ok) termErr(r.message); })
    .catch(function (e) { termErr(e.message); });
}

showLogin('');
try { ensureXtermCss(); } catch (e) {}
try { var bootDev = $('stDev'); if (bootDev) bootDev.textContent = 'js-ok ' + deviceId().slice(0, 8); } catch (e) {}
</script>
</body>
</html>`
