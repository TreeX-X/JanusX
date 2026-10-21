package com.janusx.p2plab;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import okhttp3.*;

/** Explicit, credential-free HTTPS/HTTP1 and WebSocket probes from this app. */
final class SignalNetworkCheck implements AutoCloseable {
    private final Consumer<String> output;
    private final OkHttpClient http;
    private final OkHttpClient websocketHttp;
    private volatile boolean closed, websocketOpened;
    private volatile String stage = "开始";
    private volatile String httpsResult = "HTTPS 未完成";
    private WebSocket socket;

    SignalNetworkCheck(Context context, Consumer<String> output) {
        this.output = output;
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        NetworkCapabilities caps = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
        report("App 默认网络 VPN=" + (caps == null ? "未知" : caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))
            + "（仅为系统标记，不证明目标流量经过代理节点）");
        http = new OkHttpClient.Builder().protocols(java.util.Collections.singletonList(Protocol.HTTP_1_1))
            .connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).callTimeout(20, TimeUnit.SECONDS)
            .dns(host -> {
                stage = "DNS 解析";
                report(stage);
                List<InetAddress> addresses = Dns.SYSTEM.lookup(host);
                long v6 = addresses.stream().filter(a -> a instanceof java.net.Inet6Address).count();
                stage = "DNS 已完成，等待 TCP/TLS 或代理连接";
                report("DNS IPv4=" + (addresses.size() - v6) + " IPv6=" + v6);
                return addresses;
            })
            .eventListener(new EventListener() {
                @Override public void connectStart(Call call, InetSocketAddress address, Proxy proxy) { stage = "TCP/代理连接"; report(stage); }
                @Override public void secureConnectStart(Call call) { stage = "TLS 握手"; report(stage); }
                @Override public void secureConnectEnd(Call call, Handshake handshake) { stage = "TLS 已完成"; report(stage); }
                @Override public void connectionAcquired(Call call, Connection connection) {
                    stage = "连接已建立，等待 HTTP 响应";
                    report(stage + "; proxy=" + connection.route().proxy().type() + "（DIRECT 也可能由系统 VPN 接管）");
                }
                @Override public void connectFailed(Call call, InetSocketAddress address, Proxy proxy, Protocol protocol, IOException error) {
                    report(stage + " 本次地址失败: " + error.getClass().getSimpleName());
                }
            }).build();
        // OkHttp 4 disables EventListener and network interceptors for WSS.
        // Use a separate pool so HTTPS success cannot mask a fresh WSS failure.
        websocketHttp = http.newBuilder().connectionPool(new ConnectionPool()).build();
    }

    static Request healthRequest(String signalUrl) {
        HttpUrl url = HttpUrl.get(signalUrl.replaceFirst("^ws", "http"));
        if (!url.username().isEmpty() || !url.password().isEmpty()) throw new IllegalArgumentException("信令地址不能包含账号密码");
        return new Request.Builder().url(url.newBuilder().encodedPath("/health").query(null).fragment(null).build()).build();
    }

    /** Only certificate errors include messages; never dump request/QR data. */
    static String certificateFailure(Throwable error) {
        for (int depth = 0; error != null && depth < 6; depth++, error = error.getCause()) {
            if (error instanceof javax.net.ssl.SSLPeerUnverifiedException || error instanceof java.security.cert.CertificateException) {
                String detail = error.getMessage();
                if (detail == null) return error.getClass().getSimpleName();
                detail = detail.replaceAll("[\\p{Cntrl}]+", " ");
                return error.getClass().getSimpleName() + ": " + detail.substring(0, Math.min(detail.length(), 1600));
            }
        }
        return "";
    }

    private void reportCertificateFailure(Throwable error) {
        String detail = certificateFailure(error);
        if (!detail.isEmpty()) report("证书详情 " + detail);
    }

    void start(String signalUrl) {
        if (!signalUrl.startsWith("wss://") && !(BuildConfig.DEBUG && signalUrl.startsWith("ws://")))
            throw new IllegalArgumentException("请使用 wss:// 信令地址");
        Request health = healthRequest(signalUrl);
        report("目标域名=" + health.url().host() + "; HTTPS/HTTP1 检查开始（不携带配对信息）");
        http.newCall(health).enqueue(new Callback() {
            @Override public void onFailure(Call call, IOException error) {
                httpsResult = "HTTPS 失败: " + error.getClass().getSimpleName();
                report(httpsResult + "; 阶段=" + stage);
                reportCertificateFailure(error);
                checkWebSocket(signalUrl);
            }
            @Override public void onResponse(Call call, Response response) {
                try (Response ignored = response) {
                    httpsResult = "HTTPS HTTP " + response.code();
                    report(httpsResult + "（收到响应不等于 WSS 成功）");
                }
                checkWebSocket(signalUrl);
            }
        });
    }

    private synchronized void checkWebSocket(String signalUrl) {
        if (closed) return;
        stage = "WSS 开始，等待 DNS/TCP/TLS 或代理连接";
        report(stage);
        socket = websocketHttp.newWebSocket(new Request.Builder().url(signalUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) {
                websocketOpened = true;
                report("WSS HTTP 101 成功：App 可连接信令；此检查不加入房间，也不验证 UDP");
                ws.cancel();
            }
            @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                if (!websocketOpened) {
                    report("WSS 失败: " + error.getClass().getSimpleName()
                        + (response == null ? "" : "; HTTP " + response.code()) + "; " + httpsResult + "; 最后观测=" + stage
                        + "（WSS 的 TCP/TLS/升级阶段无法单独观测，请结合前面的 HTTPS 检查）");
                    reportCertificateFailure(error);
                }
            }
        });
    }

    private void report(String message) { if (!closed) output.accept("NET " + message); }

    @Override public synchronized void close() {
        closed = true;
        if (socket != null) socket.cancel();
        http.dispatcher().cancelAll();
        http.connectionPool().evictAll();
        websocketHttp.connectionPool().evictAll();
        http.dispatcher().executorService().shutdown();
    }
}
