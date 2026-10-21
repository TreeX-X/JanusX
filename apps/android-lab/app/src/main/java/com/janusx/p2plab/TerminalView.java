package com.janusx.p2plab;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.util.ArrayDeque;
import org.json.JSONObject;

/** Offline xterm surface. Only bundled assets can invoke the narrow native bridge. */
public final class TerminalView extends WebView {
    public interface Listener { void resync(); void status(String text); }
    private static final String ORIGIN = "appassets.androidplatform.net";
    private final ArrayDeque<String> pending = new ArrayDeque<>();
    private boolean ready, disposed, overflow;
    private int pendingBytes;
    private String selectedId = "";
    private final Listener listener;

    @SuppressLint("SetJavaScriptEnabled")
    public TerminalView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        setBackgroundColor(Color.rgb(17, 21, 27));
        getSettings().setJavaScriptEnabled(true);
        getSettings().setAllowFileAccess(false);
        getSettings().setAllowContentAccess(false);
        getSettings().setBlockNetworkLoads(true);
        getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        addJavascriptInterface(new Object() {
            @JavascriptInterface public void ready() {
                post(() -> {
                    if (disposed) return;
                    ready = true;
                    if (overflow) {
                        pending.clear(); overflow = false;
                        evaluateJavascript("window.mobileTerminal.select(" + JSONObject.quote(selectedId) + ")", null);
                        listener.resync();
                    } else while (!pending.isEmpty()) evaluateJavascript(pending.remove(), null);
                    pendingBytes = 0;
                });
            }
            @JavascriptInterface public void resync() { post(() -> { if (!disposed) listener.resync(); }); }
            @JavascriptInterface public void status(String text) { post(() -> { if (!disposed) listener.status(text); }); }
        }, "AndroidTerminal");
        setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if ("https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost()) && path != null
                    && java.util.Arrays.asList("/terminal/index.html", "/terminal/terminal.js", "/terminal/xterm.css", "/terminal/terminal.css").contains(path)) {
                    try {
                        String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
                        return new WebResourceResponse(mime, "UTF-8", context.getAssets().open(path.substring(1)));
                    } catch (java.io.IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        loadUrl("https://" + ORIGIN + "/terminal/index.html");
    }
    private void run(String script) {
        if (disposed) return;
        if (ready) evaluateJavascript(script, null);
        else if (pendingBytes + script.length() <= 2 * 1024 * 1024) { pending.add(script); pendingBytes += script.length(); }
        else { pending.clear(); pendingBytes = 0; overflow = true; }
    }
    public void select(String id) { selectedId = id; run("window.mobileTerminal.select(" + JSONObject.quote(id) + ")"); }
    public void receive(JSONObject message) { run("window.mobileTerminal.receive(" + message + ")"); }
    public void font(int delta) { run("window.mobileTerminal.font(" + delta + ")"); }
    public void bottom() { run("window.mobileTerminal.bottom()"); }
    public void fit() { run("window.mobileTerminal.fit()"); }
    @Override public void destroy() { disposed = true; pending.clear(); removeJavascriptInterface("AndroidTerminal"); super.destroy(); }
}
