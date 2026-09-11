/**
 * @file 浏览器垫片（真 JanusX 界面跑在浏览器里的桥）
 * @description 网关代理 `/app/` 的 renderer 入口 HTML 时注入本脚本：
 *              先于模块脚本执行，定义 `window.electron`，使 `main.tsx` 的
 *              fallback 让路。`team/remote/peer` 走网关变“活”的，
 *              其余命名空间保持与 fallback 一致的降级语义（明确拒绝，
 *              不静默造假）。终端/工作区等重能力仍需桌面端。
 *              注意：本文件生成的是 plain JS 字符串，内部禁用 `${}` 插值。
 */

export function createElectronShim(platform: string): string {
  const safePlatform = platform === 'darwin' || platform === 'linux' ? platform : 'win32'
  return `/* JanusX web shim: team/remote/peer live, rest degraded. */
(function () {
  if (window.electron && !window.__JANUSX_WEB_SHIM__) return;
  window.__JANUSX_WEB_SHIM__ = true;

  function gw(path, opts) {
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          return { ok: false, error: { code: (body && body.code) || 'unavailable', message: (body && body.message) || ('HTTP ' + res.status) } };
        }
        return { ok: true, value: body };
      });
    }).catch(function (err) {
      return { ok: false, error: { code: 'unavailable', message: err instanceof Error ? err.message : 'gateway unreachable' } };
    });
  }
  function post(path, token, body) {
    return gw(path, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body || {}),
    });
  }
  function get(path, token, deviceId) {
    var headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    if (deviceId) headers['x-janusx-device-id'] = deviceId;
    return gw(path, { headers: headers });
  }
  function q(params) {
    return Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k]);
    }).join('&');
  }

  var team = {
    register: function (input) { return post('/api/team/register', null, input); },
    login: function (input) { return post('/api/team/login', null, input); },
    logout: function (token) { return post('/api/team/logout', token, {}); },
    refresh: function (refreshToken) { return post('/api/team/refresh', null, { refreshToken: refreshToken }); },
    me: function (token) { return get('/api/team/me', token); },
    listTenants: function (token) { return get('/api/team/tenants', token); },
    createTenant: function (token, name) { return post('/api/team/tenants', token, { name: name }); },
    switchTenant: function (token, tenantId) { return post('/api/team/switch', token, { tenantId: tenantId }); },
    inviteMember: function (token, tenantId, role) { return post('/api/team/invite', token, { tenantId: tenantId, role: role }); },
    acceptInvite: function (token, code) { return post('/api/team/accept', token, { code: code }); },
    listMembers: function (token, tenantId) { return get('/api/team/members?' + q({ tenantId: tenantId }), token); },
    listProjects: function (token, tenantId) { return get('/api/team/projects?' + q({ tenantId: tenantId }), token); },
    setRole: function (token, tenantId, userId, role) { return post('/api/team/role', token, { tenantId: tenantId, userId: userId, role: role }); },
    setMemberStatus: function (token, tenantId, userId, status) { return post('/api/team/member-status', token, { tenantId: tenantId, userId: userId, status: status }); },
  };

  var remote = {
    issueCode: function (token) { return post('/api/remote/issue-code', token, {}); },
    redeemCode: function (token, code, device) { return post('/api/remote/redeem', token, { code: code, deviceId: device.deviceId, deviceName: device.name }); },
    listTerminals: function (token, deviceId) { return get('/api/remote/terminals', token, deviceId); },
    tail: function (token, deviceId, terminalId) { return get('/api/remote/tail?' + q({ terminalId: terminalId }), token, deviceId); },
    execute: function (token, deviceId, command, opts) {
      return post('/api/remote/execute', token, Object.assign({ command: command, deviceId: deviceId }, opts || {}));
    },
    issueActionToken: function (token, deviceId, terminalId, action) {
      return post('/api/remote/action-token', token, { terminalId: terminalId, action: action, deviceId: deviceId });
    },
    listTrusted: function (token) { return get('/api/remote/trusted', token); },
    revokeDevice: function (token, deviceId) { return post('/api/remote/revoke', token, { deviceId: deviceId }); },
    createTerminal: function (token, deviceId, workspaceId, engine) { return post('/api/remote/create-terminal', token, { deviceId: deviceId, workspaceId: workspaceId, engine: engine }); },
  };

  var peer = {
    hostStatus: function () { return get('/api/peer/host-status'); },
    startHost: function (token, deviceName) { return post('/api/peer/start-host', token, { deviceName: deviceName }); },
    stopHost: function () { return post('/api/peer/stop-host', null, {}); },
    discover: function (timeoutMs) { return get('/api/peer/discover?' + q({ timeoutMs: timeoutMs })); },
    pair: function (token, deviceName, baseUrl, fingerprint, code, expectedDeviceId) {
      return post('/api/peer/pair', token, { deviceName: deviceName, baseUrl: baseUrl, fingerprint: fingerprint, code: code, expectedDeviceId: expectedDeviceId });
    },
    peers: function () { return get('/api/peer/peers'); },
    listTerminals: function (token, hostDeviceId) { return get('/api/peer/terminals?' + q({ hostDeviceId: hostDeviceId }), token); },
    tail: function (token, hostDeviceId, terminalId) { return get('/api/peer/tail?' + q({ hostDeviceId: hostDeviceId, terminalId: terminalId }), token); },
    execute: function (token, hostDeviceId, command, opts) {
      return post('/api/peer/execute', token, Object.assign({ hostDeviceId: hostDeviceId, command: command }, opts || {}));
    },
    disconnect: function (hostDeviceId) { return post('/api/peer/disconnect', null, { hostDeviceId: hostDeviceId }); },
    forget: function (hostDeviceId) { return post('/api/peer/forget', null, { hostDeviceId: hostDeviceId }); },
    viewWorkspaces: function (token, hostDeviceId) { return get('/api/peer/view/workspaces?' + q({ hostDeviceId: hostDeviceId }), token); },
    viewFiles: function (token, hostDeviceId, workspaceId, dir) { return get('/api/peer/view/files?' + q({ hostDeviceId: hostDeviceId, workspaceId: workspaceId, dir: dir }), token); },
    viewTerminals: function (token, hostDeviceId) { return get('/api/peer/view/terminals?' + q({ hostDeviceId: hostDeviceId }), token); },
    createTerminal: function (token, hostDeviceId, workspaceId, engine) { return post('/api/peer/create-terminal', token, { hostDeviceId: hostDeviceId, workspaceId: workspaceId, engine: engine }); },
  };

  // 其余命名空间：与 fallback 同语义的显式降级（on* 返回空订阅，其余拒绝）。
  var BOOT_SNAPSHOT = {
    'workspace.initialize': function () { return Promise.resolve({ loadState: 'no-workspace', workspaces: [], activeWorkspaceId: null }); },
    'workspace.list': function () { return Promise.resolve([]); },
    'terminal.warmup': function () { return Promise.resolve({ ok: true }); },
    'terminal.replay': function () { return Promise.resolve({ data: '', seq: 0 }); },
    'terminal.kill': function () { return Promise.resolve({ success: true }); },
    'browser.getState': function () { return Promise.resolve(null); },
    'agentSettings.get': function () { return Promise.resolve({ approvalMode: 'per-action', agentMaxSteps: 40, safeCompileAutoAllow: true }); },
    'system.getLanguage': function () { return Promise.resolve(null); },
  };
  function stubMethod(ns, method) {
    if (method.indexOf('on') === 0) return function () { return function () {}; };
    var key = ns + '.' + method;
    if (BOOT_SNAPSHOT[key]) return BOOT_SNAPSHOT[key];
    return function () { return Promise.reject(new Error('Web shim: ' + key + ' needs desktop Electron')); };
  }
  function stubNs(ns) {
    return new Proxy({}, { get: function (_, method) { return stubMethod(ns, String(method)); } });
  }

  window.electron = new Proxy({
    platform: '${safePlatform}',
    windowsBuild: undefined,
    janusPersona: '',
    team: team,
    remote: remote,
    peer: peer,
  }, { get: function (base, ns) {
    if (ns in base) return base[ns];
    return stubNs(String(ns));
  } });
})();
`
}
