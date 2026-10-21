package com.janusx.p2plab;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

public final class MainActivity extends Activity implements LabTransport.Listener {
    private static final int CAMERA_PERMISSION_REQUEST = 2049;
    private EditText signalUrl, invitation, stun, input;
    private TextView output;
    private LabTransport transport;
    private boolean destroyed;
    private int counter;
    private boolean ready;
    private String pairingSecret = "";
    private String deviceId;
    private String deviceToken = "";
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable connectionTimeout = () -> { if (!ready && transport != null) { disconnect(); onStatus("CONNECT timeout; direct UDP path not established. Retry or change network."); } };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(24, 48, 24, 24);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(page);
        setContentView(scroll);
        deviceId = getPreferences(0).getString("deviceId", "");
        if (deviceId.isEmpty()) { deviceId = java.util.UUID.randomUUID().toString().replace("-", ""); getPreferences(0).edit().putString("deviceId", deviceId).apply(); }
        TextView title = new TextView(this);
        title.setText("JanusX · P2P Lab " + BuildConfig.VERSION_NAME); title.setTextSize(23); page.addView(title);
        TextView description = new TextView(this);
        description.setText("UDP direct · no TURN · mobile terminal MVP\nScan or paste the desktop QR payload. The desktop must approve this device.\nEmulator checks do not prove Internet NAT traversal.");
        page.addView(description);
        signalUrl = field(page, "Signaling URL", extra("signalUrl", "ws://10.0.2.2:43821/signal"));
        button(page, "扫描电脑二维码 / Scan QR", v -> scanPairing());
        invitation = field(page, "Desktop QR payload (scan or paste JSON)", extra("invite", ""));
        invitation.setInputType(129);
        stun = field(page, "Optional stun:host:port (empty for local test)", extra("stun", ""));
        button(page, "Connect", v -> connect());
        button(page, "Disconnect", v -> disconnect());
        input = field(page, "Claude Code input", "你好 JanusX");
        button(page, "Start Claude Code", v -> {
            JSONObject message = WebRtcTransport.json("id", "create-" + (++counter), "method", "create");
            onStatus(transport != null && transport.send(message.toString()) ? "SEND accepted" : "SEND unavailable/backpressure");
        });
        button(page, "Send input", v -> {
            JSONObject message = WebRtcTransport.json("id", "input-" + (++counter), "method", "input", "terminalId", terminalId, "text", input.getText().toString());
            onStatus(transport != null && transport.send(message.toString()) ? "INPUT accepted" : "INPUT unavailable/backpressure");
        });
        button(page, "Subscribe output", v -> {
            JSONObject message = WebRtcTransport.json("id", "sub-" + (++counter), "method", "subscribe", "terminalId", terminalId);
            onStatus(transport != null && transport.send(message.toString()) ? "SUBSCRIBE accepted" : "SUBSCRIBE unavailable/backpressure");
        });
        button(page, "Inspect UDP path", v -> { if (transport != null) transport.inspectPath(); });
        output = new TextView(this); output.setTextIsSelectable(true); output.setTextSize(13); page.addView(output);
        deviceToken = getPreferences(0).getString("deviceToken", "");
        if (BuildConfig.DEBUG && getIntent().getBooleanExtra("autoconnect", false)) connect();
    }
    private String terminalId = "";
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
    private JSONObject validatePairing(String payload) throws Exception {
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
        if (qr.getLong("expiresAt") <= System.currentTimeMillis())
            throw new IllegalArgumentException("二维码已过期，请在电脑端重新开启远程");
        String stunUrl = qr.optString("stun", "");
        if (!stunUrl.isEmpty() && !stunUrl.matches("stun:[^\\s]+"))
            throw new IllegalArgumentException("STUN 地址无效");
        return qr;
    }
    private String extra(String name, String fallback) { String value = getIntent().getStringExtra(name); return value == null ? fallback : value; }
    private EditText field(LinearLayout parent, String hint, String value) {
        EditText field = new EditText(this); field.setSingleLine(true); field.setHint(hint); field.setText(value); parent.addView(field); return field;
    }
    private void button(LinearLayout parent, String text, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(text); button.setOnClickListener(listener); parent.addView(button);
    }
    private void connect() {
        disconnect();
        try {
            pairingSecret = "";
            String payload = invitation.getText().toString().trim();
            if (payload.startsWith("{")) {
                JSONObject qr = validatePairing(payload);
                signalUrl.setText(qr.getString("signalUrl")); stun.setText(qr.optString("stun"));
                payload = qr.getString("invite"); pairingSecret = qr.getString("secret");
            }
            transport = new WebRtcTransport(this, this);
            transport.connect(signalUrl.getText().toString().trim(), payload, stun.getText().toString().trim(), pairingSecret);
            handler.postDelayed(connectionTimeout, 30000);
        } catch (Exception e) { disconnect(); onStatus("CONNECT failed: " + e.getMessage()); }
    }
    private void disconnect() { handler.removeCallbacks(connectionTimeout); ready = false; if (transport != null) { transport.close(); transport = null; } }
    @Override public void onStatus(String status) {
        Log.i("JanusXP2P", status);
        runOnUiThread(() -> { if (!destroyed && output != null) { if (status.equals("DATA OPEN")) { ready = true; handler.removeCallbacks(connectionTimeout); if (transport != null) transport.send(WebRtcTransport.json("type", "hello", "id", "hello-" + deviceId, "deviceId", deviceId, "name", "Android", "secret", pairingSecret, "token", deviceToken).toString()); } String text = output.getText() + "\n" + status; output.setText(text.substring(Math.max(0, text.length()-12000))); } });
    }
    @Override public void onMessage(String message) {
        try {
            JSONObject data = new JSONObject(message);
            String type = data.optString("type");
            if (type.equals("approved")) { deviceToken = data.optString("token", deviceToken); getPreferences(0).edit().putString("deviceToken", deviceToken).apply(); onStatus("DESKTOP approved workspace " + data.optString("workspaceId")); }
            if (type.equals("result") && data.optBoolean("ok") && data.optJSONObject("value") != null) {
                JSONObject value = data.getJSONObject("value");
                terminalId = value.optString("terminalId", terminalId);
                if (value.optInt("pid") > 0) {
                    onStatus("TERMINAL created " + terminalId + " pid=" + value.getInt("pid"));
                    if (transport != null) transport.send(WebRtcTransport.json("id", "sub-" + (++counter), "method", "subscribe", "terminalId", terminalId).toString());
                }
            }
            if (type.equals("output") || type.equals("replay-data")) { String chunk = data.optString("data"); runOnUiThread(() -> { if (!destroyed) output.append("\n" + chunk); }); }
            if (type.equals("pending")) onStatus("PAIRING pending; 请在电脑底部手机远程面板批准此设备");
            onStatus("RECV " + type + (type.equals("pong") ? " RTT(ms)=" + (System.currentTimeMillis()-data.getLong("sentAt")) : ""));
            // Credentials in approval messages must not be displayed or logged.
            if (type.equals("error") || (type.equals("result") && !data.optBoolean("ok"))) onStatus("DESKTOP error: " + data.optString("message", data.optString("error")));
        } catch (Exception e) { onStatus("RECV invalid application message"); }
    }
    @Override public void onStop() { disconnect(); super.onStop(); }
    @Override public void onDestroy() { destroyed = true; disconnect(); super.onDestroy(); }
}
