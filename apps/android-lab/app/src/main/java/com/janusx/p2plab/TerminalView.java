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
import android.webkit.WebResourceError;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import java.io.ByteArrayInputStream;
import java.util.ArrayDeque;
import org.json.JSONObject;

/** Offline xterm surface. Only bundled assets can invoke the narrow native bridge. */
public final class TerminalView extends WebView {
    public interface Listener { void resync(); void status(String text); }
    private static final String ORIGIN = "appassets.androidplatform.net";
    private final ArrayDeque<String> pending = new ArrayDeque<>();
    private boolean ready, disposed, overflow, failed;
    private int pendingBytes;
    private String selectedId = "";
    private final Listener listener;
    private int reloads, received;
    private final Runnable startupTimeout = this::checkStartup;
    private void checkStartup() {
        if (disposed || ready || failed) return;
        if (reloads++ == 0) {
            listener.status("终端页面启动超时，正在重新加载…");
            loadTerminal();
        } else listener.status("终端页面未就绪（已收到 " + received + " 条输出消息）。请复制日志中的 WebView 版本及终端错误。");
    }

    @SuppressLint("SetJavaScriptEnabled")
    public TerminalView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        setBackgroundColor(Color.rgb(17, 21, 27));
        getSettings().setJavaScriptEnabled(true);
        getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
        getSettings().setAllowFileAccess(false);
        getSettings().setAllowContentAccess(false);
        getSettings().setBlockNetworkLoads(true);
        getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        addJavascriptInterface(new Object() {
            @JavascriptInterface public void ready() {
                post(() -> {
                    if (disposed || failed) return;
                    if (ready) return;
                    ready = true;
                    removeCallbacks(startupTimeout);
                    listener.status(selectedId.isEmpty() ? "终端显示已就绪 · 等待选择或新建终端" : "终端页面已就绪，正在同步电脑输出");
                    evaluateJavascript("window.mobileTerminal.select(" + JSONObject.quote(selectedId) + ")", null);
                    if (overflow) {
                        pending.clear(); overflow = false;
                    } else while (!pending.isEmpty()) evaluateJavascript(pending.remove(), null);
                    pendingBytes = 0;
                    if (!selectedId.isEmpty()) listener.resync();
                });
            }
            @JavascriptInterface public void resync() { post(() -> { if (!disposed) listener.resync(); }); }
            @JavascriptInterface public void status(String text) { post(() -> { if (!disposed) listener.status(text); }); }
            @JavascriptInterface public void failed(String text) { post(() -> fail(text)); }
        }, "AndroidTerminal");
        setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR && message.message().startsWith("Uncaught ")) {
                    fail("终端显示脚本失败：" + message.message().substring(0, Math.min(180, message.message().length()))
                        + "（行 " + message.lineNumber() + "）；请确认已安装最新版，并复制日志中的 WebView 版本。");
                }
                return true;
            }
        });
        setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                ready = false; failed = false; pending.clear(); pendingBytes = 0; overflow = false;
                removeCallbacks(startupTimeout); postDelayed(startupTimeout, 10000);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                String path = request.getUrl().getPath();
                if (request.isForMainFrame() || (path != null && (path.endsWith(".js") || path.endsWith(".css"))))
                    fail("终端页面资源加载失败（" + error.getErrorCode() + "），请点「同步」重试");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if ("https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost()) && path != null
                    && java.util.Arrays.asList("/terminal/index.html", "/terminal/boot.js", "/terminal/terminal.js", "/terminal/xterm.css", "/terminal/terminal.css", "/terminal/favicon.svg").contains(path)) {
                    try {
                        String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
                        return new WebResourceResponse(mime, "UTF-8", context.getAssets().open(path.substring(1)));
                    } catch (java.io.IOException error) {
                        if (!path.endsWith(".svg")) post(() -> fail("终端内置资源缺失：" + path + "；请重新安装最新版"));
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        post(() -> {
            if (disposed) return;
            android.content.pm.PackageInfo engine = WebView.getCurrentWebViewPackage();
            listener.status("WebView=" + (engine == null ? "unknown" : engine.packageName + "/" + engine.versionName)
                + "; Android=" + android.os.Build.VERSION.RELEASE + "; App=" + BuildConfig.VERSION_NAME);
        });
        loadTerminal();
    }
    private void fail(String text) {
        if (disposed || failed) return;
        failed = true; ready = false; removeCallbacks(startupTimeout);
        pending.clear(); pendingBytes = 0; overflow = true;
        listener.status(text.substring(0, Math.min(400, text.length())));
    }
    private void loadTerminal() {
        ready = false; failed = false; pending.clear(); pendingBytes = 0; overflow = false;
        removeCallbacks(startupTimeout);
        loadUrl("https://" + ORIGIN + "/terminal/index.html");
        postDelayed(startupTimeout, 10000);
    }
    public void sync() {
        if (disposed) return;
        // Rebuild only the local renderer, including a ready-but-blank page.
        // The ready callback resubscribes to the existing desktop PTY.
        reloads = 0; loadTerminal();
    }
    private void run(String script) {
        if (disposed || failed) return;
        if (ready) evaluateJavascript(script, null);
        else if (pendingBytes + script.length() <= 2 * 1024 * 1024) { pending.add(script); pendingBytes += script.length(); }
        else { pending.clear(); pendingBytes = 0; overflow = true; }
    }
    public void select(String id) { selectedId = id; run("window.mobileTerminal.select(" + JSONObject.quote(id) + ")"); }
    public void receive(JSONObject message) { received++; run("window.mobileTerminal.receive(" + message + ")"); }
    public void font(int delta) { run("window.mobileTerminal.font(" + delta + ")"); }
    public void bottom() { run("window.mobileTerminal.bottom()"); }
    public void fit() { run("window.mobileTerminal.fit()"); }
    @Override public void destroy() { disposed = true; removeCallbacks(startupTimeout); pending.clear(); removeJavascriptInterface("AndroidTerminal"); super.destroy(); }
}
