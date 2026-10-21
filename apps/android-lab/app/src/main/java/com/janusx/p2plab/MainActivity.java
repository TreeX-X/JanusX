package com.janusx.p2plab;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.graphics.Color;
import android.view.inputmethod.InputMethodManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.widget.*;
import org.json.JSONObject;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

public final class MainActivity extends Activity implements LabTransport.Listener {
    private static final int CAMERA_PERMISSION_REQUEST = 2049;
    private EditText signalUrl, invitation, stun, input;
    private TextView output, connectionStatus, terminalStatus;
    private TerminalView terminal;
    private Spinner terminalPicker;
    private Button startButton, sendButton;
    private final java.util.ArrayList<String> terminalIds = new java.util.ArrayList<>();
    private final java.util.ArrayList<String> terminalLabels = new java.util.ArrayList<>();
    private ArrayAdapter<String> terminalAdapter;
    private final java.util.ArrayList<Button> keyButtons = new java.util.ArrayList<>();
    private LabTransport transport;
    private boolean destroyed;
    private int connectionGeneration;
    private boolean ready;
    private boolean approved, creating, terminalAlive;
    private String createRequest = "";
    private String inputRequest = "";
    private String inputSubmitted = "";
    private String pairingSecret = "";
    private String deviceId;
    private String deviceToken = "";
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable connectionTimeout = () -> { if (!ready && transport != null) {
        String hint = transport.timeoutHint(); disconnect(); onStatus("CONNECT timeout: " + hint);
    } };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.rgb(17, 21, 27));
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(page, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            androidx.core.graphics.Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left + dp(12), bars.top + dp(6), bars.right + dp(12), Math.max(bars.bottom, ime.bottom));
            return insets;
        });
        setContentView(page);
        deviceId = getPreferences(0).getString("deviceId", "");
        if (deviceId.isEmpty()) { deviceId = java.util.UUID.randomUUID().toString().replace("-", ""); getPreferences(0).edit().putString("deviceId", deviceId).apply(); }
        TextView title = new TextView(this);
        title.setText("JanusX · 远程终端 " + BuildConfig.VERSION_NAME); title.setTextSize(20); title.setTextColor(Color.WHITE); page.addView(title);
        connectionStatus = label(page, "未连接 · 扫描电脑二维码开始配对");
        LinearLayout connection = row(page);
        button(connection, "扫码配对", v -> scanPairing());
        button(connection, "连接", v -> connect());
        button(connection, "断开", v -> { disconnect(); onStatus("已断开，电脑终端继续运行"); });
        LinearLayout details = new LinearLayout(this); details.setOrientation(LinearLayout.VERTICAL);
        ScrollView detailScroll = new ScrollView(this); detailScroll.addView(details); detailScroll.setVisibility(View.GONE);
        button(connection, "详情", v -> detailScroll.setVisibility(detailScroll.getVisibility() == View.GONE ? View.VISIBLE : View.GONE));
        page.addView(detailScroll, new LinearLayout.LayoutParams(-1, dp(200)));
        signalUrl = field(details, "信令地址", extra("signalUrl", "ws://10.0.2.2:43821/signal"));
        invitation = field(details, "粘贴电脑配对 JSON", extra("invite", getPreferences(0).getString("pairingPayload", "")));
        invitation.setInputType(129);
        stun = field(details, "可选 STUN 地址", extra("stun", ""));
        button(details, "检查 UDP 路径", v -> { if (transport != null) transport.inspectPath(); });
        output = label(details, "连接详情"); output.setTextIsSelectable(true); output.setTextSize(11);
        LinearLayout sessionRow = row(page);
        terminalPicker = new Spinner(this);
        terminalAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, terminalLabels);
        terminalPicker.setAdapter(terminalAdapter); terminalPicker.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.LTGRAY));
        sessionRow.addView(terminalPicker, new LinearLayout.LayoutParams(0, dp(48), 1));
        terminalPicker.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onNothingSelected(AdapterView<?> parent) { }
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (view instanceof TextView) ((TextView)view).setTextColor(Color.WHITE);
                if (position < terminalIds.size() && !terminalIds.get(position).equals(terminalId)) selectTerminal(terminalIds.get(position));
            }
        });
        startButton = button(sessionRow, "新建 Claude", v -> createTerminal());
        terminalStatus = label(page, "等待电脑授权后可新建或恢复 Claude Code");
        terminal = new TerminalView(this, new TerminalView.Listener() {
            public void resync() { subscribe(); }
            public void status(String text) { terminalStatus.setText(text); }
        });
        page.addView(terminal, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout tools = row(page);
        button(tools, "A−", v -> terminal.font(-1)); button(tools, "A+", v -> terminal.font(1));
        button(tools, "适宽", v -> terminal.fit());
        button(tools, "到底部", v -> terminal.bottom()); button(tools, "同步", v -> subscribe());
        LinearLayout composer = row(page);
        input = field(composer, "输入发给 Claude Code 的内容", "");
        input.setLayoutParams(new LinearLayout.LayoutParams(0, dp(48), 1));
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEND);
        input.setOnEditorActionListener((view, action, event) -> { if (action == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) { sendInput(); return true; } return false; });
        sendButton = button(composer, "发送", v -> sendInput());
        sendButton.setLayoutParams(new LinearLayout.LayoutParams(dp(64), dp(44)));
        LinearLayout keys = row(page);
        String[] names = {"Enter", "↑", "↓", "Tab", "Esc", "Ctrl+C"};
        String[] codes = {"enter", "up", "down", "tab", "escape", "interrupt"};
        for (int i = 0; i < names.length; i++) { final String key = codes[i]; keyButtons.add(button(keys, names[i], v -> sendKey(key))); }
        deviceToken = getPreferences(0).getString("deviceToken", "");
        controls();
        if (BuildConfig.DEBUG && getIntent().getBooleanExtra("autoconnect", false)) connect();
    }
    private String terminalId = "";
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView label(LinearLayout parent, String text) {
        TextView view = new TextView(this); view.setText(text); view.setTextColor(Color.rgb(185, 199, 214)); view.setTextSize(12); parent.addView(view); return view;
    }
    private LinearLayout row(LinearLayout parent) { LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); parent.addView(row); return row; }
    private void controls() {
        if (startButton == null) return;
        startButton.setEnabled(approved && !creating); sendButton.setEnabled(approved && terminalAlive && inputRequest.isEmpty());
        terminalPicker.setEnabled(approved);
        for (Button button : keyButtons) button.setEnabled(approved && terminalAlive);
    }
    private String requestId() { return java.util.UUID.randomUUID().toString(); }
    private boolean send(JSONObject message) {
        if (!approved || transport == null || !transport.send(message.toString())) { terminalStatus.setText("发送失败，请检查连接后重试"); return false; }
        return true;
    }
    private void createTerminal() {
        if (creating) return;
        createRequest = requestId();
        if (send(WebRtcTransport.json("id", createRequest, "method", "create"))) { creating = true; terminalStatus.setText("正在电脑启动 Claude Code…"); controls(); }
    }
    private void selectTerminal(String id) {
        terminalId = id; terminalAlive = !terminalLabels.get(terminalIds.indexOf(id)).contains("已退出");
        terminal.select(id); controls(); subscribe();
    }
    private void subscribe() {
        if (approved && !terminalId.isEmpty()) send(WebRtcTransport.json("id", requestId(), "method", "subscribe", "terminalId", terminalId));
    }
    private void sendInput() {
        if (!inputRequest.isEmpty() || !terminalAlive) return;
        String text = input.getText().toString();
        if (text.trim().isEmpty() || text.length() > 4000) { terminalStatus.setText("请输入 1–4000 字的内容"); return; }
        String id = requestId();
        if (send(WebRtcTransport.json("id", id, "method", "input", "terminalId", terminalId, "text", text))) {
            inputRequest = id; inputSubmitted = text; controls();
            ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0);
        }
    }
    private void sendKey(String key) { if (terminalAlive) send(WebRtcTransport.json("id", requestId(), "method", "key", "terminalId", terminalId, "key", key)); }
    private void scanPairing() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION_REQUEST);
            return;
        }
        new IntentIntegrator(this)
            .setCaptureActivity(PairingCaptureActivity.class)
            .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
            .setPrompt("将完整二维码放入框内，保持清晰；无法识别时请放大电脑二维码并稍微拉远手机")
            .setBeepEnabled(false)
            .setBarcodeImageEnabled(false)
            .setOrientationLocked(false)
            .initiateScan();
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) scanPairing();
        else {
            String message = "扫码需要相机权限，可在系统设置中允许；也可以粘贴配对 JSON。";
            onStatus(message);
            Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (result == null) { super.onActivityResult(requestCode, resultCode, data); return; }
        if (result.getContents() == null) { onStatus("扫码已取消或相机不可用，可重试或粘贴配对 JSON。"); return; }
        try {
            String payload = result.getContents().trim();
            validatePairing(payload);
            invitation.setText(payload);
            onStatus("已识别 JanusX 配对二维码，正在连接，请在电脑端批准。");
            connect();
        } catch (Exception e) {
            onStatus("扫码失败：" + e.getMessage());
            Toast.makeText(this, "请扫描有效且未过期的 JanusX 配对二维码", Toast.LENGTH_LONG).show();
        }
    }
    private JSONObject validatePairing(String payload) throws Exception { return validatePairing(payload, false); }
    private JSONObject validatePairing(String payload, boolean reconnect) throws Exception {
        if (payload.length() > 8192) throw new IllegalArgumentException("配对信息过长");
        JSONObject qr = new JSONObject(payload);
        if (qr.getInt("v") != 1) throw new IllegalArgumentException("不支持的配对版本");
        String url = qr.getString("signalUrl");
        android.net.Uri uri = android.net.Uri.parse(url);
        if (url.length() > 2048 || uri.getHost() == null || uri.getUserInfo() != null
            || !("wss".equals(uri.getScheme()) || (BuildConfig.DEBUG && "ws".equals(uri.getScheme()))))
            throw new IllegalArgumentException("信令地址无效");
        if (!qr.getString("invite").matches("[a-f0-9]{48}") || !qr.getString("secret").matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("不是有效的 JanusX 配对信息");
        boolean known = reconnect && !deviceToken.isEmpty() && qr.getString("invite").equals(getPreferences(0).getString("pairedInvite", ""));
        if (qr.getLong("expiresAt") <= System.currentTimeMillis() && !known)
            throw new IllegalArgumentException("二维码已过期，请在电脑端重新开启远程");
        String stunUrl = qr.optString("stun", "");
        if (!stunUrl.isEmpty() && !stunUrl.matches("stun:[^\\s]+"))
            throw new IllegalArgumentException("STUN 地址无效");
        return qr;
    }
    private String extra(String name, String fallback) { String value = getIntent().getStringExtra(name); return value == null ? fallback : value; }
    private EditText field(LinearLayout parent, String hint, String value) {
        EditText field = new EditText(this); field.setSingleLine(true); field.setHint(hint); field.setText(value);
        field.setTextColor(Color.WHITE); field.setHintTextColor(Color.GRAY); field.setTextSize(13); parent.addView(field); return field;
    }
    private Button button(LinearLayout parent, String text, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(text); button.setTextSize(11); button.setAllCaps(false);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setPadding(dp(4), 0, dp(4), 0); button.setOnClickListener(listener);
        parent.addView(button, parent.getOrientation() == LinearLayout.HORIZONTAL ? new LinearLayout.LayoutParams(0, dp(44), 1) : new LinearLayout.LayoutParams(-1, dp(44)));
        return button;
    }
    private void connect() {
        disconnect();
        try {
            pairingSecret = "";
            String payload = invitation.getText().toString().trim();
            if (payload.startsWith("{")) {
                JSONObject qr = validatePairing(payload, true);
                signalUrl.setText(qr.getString("signalUrl")); stun.setText(qr.optString("stun"));
                payload = qr.getString("invite"); pairingSecret = qr.getString("secret");
            }
            final int generation = connectionGeneration;
            transport = new WebRtcTransport(this, new LabTransport.Listener() {
                public void onStatus(String text) { handler.post(() -> { if (generation == connectionGeneration && !destroyed) MainActivity.this.onStatus(text); }); }
                public void onMessage(String message) { handler.post(() -> { if (generation == connectionGeneration && !destroyed) MainActivity.this.onMessage(message); }); }
            });
            transport.connect(signalUrl.getText().toString().trim(), payload, stun.getText().toString().trim(), pairingSecret);
            onStatus("正在连接电脑，请稍候…");
            handler.postDelayed(connectionTimeout, 75000);
        } catch (Exception e) { disconnect(); onStatus("CONNECT failed: " + e.getMessage()); }
    }
    private void disconnect() {
        connectionGeneration++; handler.removeCallbacks(connectionTimeout); ready = false; approved = false; creating = false;
        if (!inputRequest.isEmpty()) terminalStatus.setText("连接中断：输入是否送达尚未确认，请同步后检查再决定是否重发");
        inputRequest = "";
        if (transport != null) { transport.close(); transport = null; }
        controls();
    }
    @Override public void onStatus(String status) {
        Log.i("JanusXP2P", status);
        runOnUiThread(() -> {
            if (destroyed || output == null) return;
            if (status.equals("DATA OPEN")) {
                ready = true; handler.removeCallbacks(connectionTimeout); connectionStatus.setText("UDP 已直连 · 正在请求电脑授权");
                if (transport != null) transport.send(WebRtcTransport.json("type", "hello", "id", "hello-" + deviceId, "deviceId", deviceId, "name", "Android", "secret", pairingSecret, "token", deviceToken).toString());
            } else if (status.contains("DATA CLOSED") || status.contains("PEER FAILED") || status.contains("ICE FAILED") || status.contains("Desktop left") || status.contains("SIGNAL failed") || status.contains("SIGNAL rejected") || status.startsWith("SIGNAL closed")) {
                // Signaling can close while the independent DataChannel remains open.
                if (!ready || !status.startsWith("SIGNAL")) { disconnect(); connectionStatus.setText(status + "\n点击连接可重试，电脑终端继续运行"); }
            } else if (status.startsWith("DESKTOP approved")) connectionStatus.setText("电脑已授权 · UDP 直连");
            else if (status.startsWith("PAIRING pending")) connectionStatus.setText("手机已连接 · 等待电脑批准");
            else if (status.startsWith("TERMINAL created")) terminalStatus.setText("Claude Code 已启动 · 正在同步输出");
            else if (!ready || !status.matches("^(ICE|PEER|GATHER|PATH|SDP|SIGNAL).*")) connectionStatus.setText(status);
            String text = output.getText() + "\n" + status; output.setText(text.substring(Math.max(0, text.length()-6000)));
        });
    }
    @Override public void onMessage(String message) {
        try {
            JSONObject data = new JSONObject(message);
            String type = data.optString("type");
            if (type.equals("approved")) {
                approved = true; deviceToken = data.optString("token", deviceToken);
                JSONObject qr = new JSONObject(invitation.getText().toString());
                getPreferences(0).edit().putString("deviceToken", deviceToken).putString("pairedInvite", qr.getString("invite")).putString("pairingPayload", invitation.getText().toString()).apply();
                String previousId = terminalId; terminalId = ""; terminalIds.clear(); terminalLabels.clear();
                org.json.JSONArray terminals = data.optJSONArray("terminals");
                if (terminals != null) for (int i = 0; i < terminals.length(); i++) {
                    JSONObject item = terminals.getJSONObject(i); terminalIds.add(item.getString("id")); terminalLabels.add("Claude · " + item.optInt("pid") + (item.optBoolean("alive") ? "" : " · 已退出"));
                }
                terminalAdapter.notifyDataSetChanged();
                if (!terminalIds.isEmpty()) {
                    String selected = terminalIds.contains(previousId) ? previousId : terminalIds.get(0);
                    selectTerminal(selected); terminalPicker.setSelection(terminalIds.indexOf(selected));
                } else { terminalAlive = false; terminal.select(""); terminalStatus.setText("电脑已授权 · 点击新建 Claude 开始"); }
                controls(); onStatus("DESKTOP approved workspace " + data.optString("workspaceId"));
            }
            if (type.equals("result") && data.optString("id").equals(createRequest)) { creating = false; controls(); }
            if (type.equals("result") && data.optString("id").equals(inputRequest)) {
                inputRequest = "";
                if (data.optBoolean("ok")) { if (input.getText().toString().equals(inputSubmitted)) input.setText(""); terminalStatus.setText("输入已送达电脑"); }
                controls();
            }
            if (type.equals("result") && data.optBoolean("ok") && data.optJSONObject("value") != null) {
                JSONObject value = data.getJSONObject("value");
                if (value.optInt("pid") > 0) {
                    String id = value.getString("terminalId");
                    if (!terminalIds.contains(id)) { terminalIds.add(id); terminalLabels.add("Claude · " + value.getInt("pid")); terminalAdapter.notifyDataSetChanged(); }
                    selectTerminal(id); terminalPicker.setSelection(terminalIds.indexOf(id));
                    onStatus("TERMINAL created " + terminalId + " pid=" + value.getInt("pid"));
                }
            }
            if (type.equals("output") || type.startsWith("replay-")) terminal.receive(data);
            if ((type.equals("exit") || (type.equals("replay-end") && !data.optBoolean("alive", true))) && data.optString("terminalId").equals(terminalId)) {
                terminalAlive = false; int index = terminalIds.indexOf(terminalId);
                if (index >= 0 && !terminalLabels.get(index).contains("已退出")) { terminalLabels.set(index, terminalLabels.get(index) + " · 已退出"); terminalAdapter.notifyDataSetChanged(); }
                terminalStatus.setText("终端已退出 · 可查看历史或新建终端"); controls();
            }
            if (type.equals("pending")) onStatus("PAIRING pending; 请在电脑底部手机远程面板批准此设备");
            if (type.equals("rejected") || type.equals("revoked")) { disconnect(); onStatus(type.equals("revoked") ? "电脑已撤销授权，请重新扫码配对" : "电脑拒绝了配对申请"); }
            // Keep protocol diagnostics out of the terminal and primary connection status.
            Log.i("JanusXP2P", "RECV " + type);
            // Credentials in approval messages must not be displayed or logged.
            if (type.equals("error") || (type.equals("result") && !data.optBoolean("ok"))) { creating = false; controls(); terminalStatus.setText("电脑返回错误：" + data.optString("message", data.optString("error"))); onStatus("DESKTOP error: " + data.optString("message", data.optString("error"))); }
        } catch (Exception e) { onStatus("RECV invalid application message"); }
    }
    @Override public void onStop() { disconnect(); connectionStatus.setText("已暂停连接 · 返回后点击连接恢复"); super.onStop(); }
    @Override public void onDestroy() { destroyed = true; disconnect(); if (terminal != null) terminal.destroy(); super.onDestroy(); }
}
