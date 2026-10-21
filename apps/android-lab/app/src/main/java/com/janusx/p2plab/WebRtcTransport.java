package com.janusx.p2plab;

import android.content.Context;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;
import org.webrtc.*;

/** Native libwebrtc; no TURN, no application relay and UDP candidates only. */
public final class WebRtcTransport implements LabTransport {
    private final Listener listener;
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
    private final PeerConnectionFactory factory;
    private final OkHttpClient http;
    private final List<IceCandidate> pending = new ArrayList<>();
    private final List<IceCandidate> outgoing = new ArrayList<>();
    private final ConnectionDiagnostics diagnostics = new ConnectionDiagnostics();
    private PeerConnection peer;
    private volatile DataChannel channel;
    private WebSocket socket;
    private boolean remoteReady;
    private boolean descriptionSent, offerSeen, dataOpened;
    private boolean signalJoined;
    private int joinRetries;
    private int peerGeneration;
    private String remoteUfrag = "", localUfrag = "";
    private PeerConnection.RTCConfiguration configuration;
    private String invitation, pairingSecret;
    private volatile boolean closed;

    public WebRtcTransport(Context context, Listener listener) {
        this.listener = listener;
        http = new OkHttpClient.Builder().pingInterval(15, TimeUnit.SECONDS)
            .dns(host -> {
                diagnostics.signalStage("DNS 解析中");
                List<java.net.InetAddress> addresses = okhttp3.Dns.SYSTEM.lookup(host);
                diagnostics.signalStage("DNS 已完成，TCP/TLS、代理或 WebSocket 升级尚未确认");
                return addresses;
            }).build();
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.getApplicationContext()).createInitializationOptions());
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory();
    }

    @Override public void connect(String signalUrl, String invitation, String stunUrl, String pairingSecret) {
        RemoteScope.validate(signalUrl, stunUrl);
        if (closed || socket != null) throw new IllegalStateException("Create a new transport to reconnect");
        if (!signalUrl.startsWith("wss://") && !(BuildConfig.DEBUG && signalUrl.startsWith("ws://")))
            throw new IllegalArgumentException("Use wss:// (debug builds also support local ws://)");
        if (!invitation.matches("[a-f0-9]{48}") || !pairingSecret.matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("Scan or paste the complete desktop QR JSON");
        this.invitation = invitation;
        this.pairingSecret = pairingSecret;
        List<PeerConnection.IceServer> servers = new ArrayList<>();
        if (!stunUrl.trim().isEmpty()) {
            if (!stunUrl.startsWith("stun:")) throw new IllegalArgumentException("Only stun: is allowed; TURN is disabled");
            servers.add(PeerConnection.IceServer.builder(stunUrl).createIceServer());
        }
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(servers);
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        config.tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.DISABLED;
        // Keep IPv4/IPv6 and all available network candidates; a Wi-Fi route may
        // fail while another interface still offers a valid direct path.
        config.disableIPv6OnWifi = false;
        config.candidateNetworkPolicy = PeerConnection.CandidateNetworkPolicy.ALL;
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY;
        configuration = config;
        createPeer();
        openSignal(signalUrl);
    }

    private void openSignal(String signalUrl) {
        diagnostics.signalStage("开始连接，等待 DNS/TCP/TLS 或代理");
        socket = http.newWebSocket(new Request.Builder().url(signalUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) {
                if (closed) { ws.close(1000, "cancelled"); return; }
                diagnostics.connected();
                ws.send(json("type", "join", "role", "client", "invite", invitation).toString());
                listener.onStatus("SIGNAL connected; joining desktop session");
            }
            @Override public void onMessage(WebSocket ws, String text) {
                main.post(() -> {
                    if (closed || socket != ws) return;
                    try { receive(new JSONObject(text)); }
                    catch (Exception e) { listener.onStatus("SIGNAL rejected: invalid message or desktop signature"); close(); }
                });
            }
            @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                if (!closed && socket == ws) listener.onStatus("SIGNAL failed (" + error.getClass().getSimpleName()
                    + (response == null ? "" : ", HTTP " + response.code()) + "): "
                    + (channel != null && channel.state() == DataChannel.State.OPEN ? "UDP 通道继续运行" : diagnostics.timeoutHint()));
            }
            @Override public void onClosed(WebSocket ws, int code, String reason) {
                main.post(() -> {
                    if (closed || socket != ws) return;
                    // The previous socket can still occupy the room while its
                    // disconnect crosses a slow network. Only retry before join.
                    if (code == 1008 && !signalJoined && joinRetries++ < 3) {
                        listener.onStatus("SIGNAL 尚未加入会话，正在自动重试 " + joinRetries + "/3");
                        main.postDelayed(() -> { if (!closed && socket == ws) openSignal(signalUrl); }, 500);
                        return;
                    }
                    listener.onStatus("SIGNAL closed " + code + "; "
                        + (channel != null && channel.state() == DataChannel.State.OPEN ? "UDP 通道继续运行" : diagnostics.timeoutHint()));
                });
            }
            @Override public void onClosing(WebSocket ws, int code, String reason) { ws.close(code, reason); }
        });
    }

    private boolean current(int generation) { return !closed && generation == peerGeneration; }

    private void createPeer() {
        final int generation = ++peerGeneration;
        DataChannel oldChannel = channel; channel = null; lastDataState = null;
        PeerConnection oldPeer = peer; peer = null;
        if (oldChannel != null) { oldChannel.close(); oldChannel.dispose(); }
        if (oldPeer != null) { oldPeer.close(); oldPeer.dispose(); }
        pending.clear(); outgoing.clear(); remoteReady = false; descriptionSent = false;
        peer = factory.createPeerConnection(configuration, new PeerConnection.Observer() {
            public void onSignalingChange(PeerConnection.SignalingState s) { }
            public void onIceConnectionChange(PeerConnection.IceConnectionState s) {
                main.post(() -> {
                    if (!current(generation)) return;
                    if (s == PeerConnection.IceConnectionState.FAILED && !dataOpened) {
                        inspectPath();
                        listener.onStatus("UDP 本轮路径未通，保留信令等待电脑重新打洞；" + diagnostics.timeoutHint());
                    } else listener.onStatus(s == PeerConnection.IceConnectionState.FAILED ? "ICE FAILED: " + diagnostics.timeoutHint() : "ICE " + s);
                });
            }
            public void onConnectionChange(PeerConnection.PeerConnectionState s) {
                main.post(() -> {
                    if (current(generation)) listener.onStatus(s == PeerConnection.PeerConnectionState.FAILED && !dataOpened
                        ? "UDP 等待电脑重试，信令保持连接" : "PEER " + s);
                });
            }
            public void onIceConnectionReceivingChange(boolean receiving) { }
            public void onIceGatheringChange(PeerConnection.IceGatheringState s) {
                main.post(() -> { if (current(generation)) listener.onStatus("GATHER " + s + "; " + diagnostics.candidates()); });
            }
            public void onIceCandidate(IceCandidate c) {
                main.post(() -> { if (current(generation) && isUdp(c.sdp)) {
                    diagnostics.localCandidate(c.sdp);
                    if (descriptionSent) sendCandidate(c);
                    else if (outgoing.size() < 128) outgoing.add(c);
                } });
            }
            public void onIceCandidatesRemoved(IceCandidate[] c) { }
            public void onAddStream(MediaStream s) { }
            public void onRemoveStream(MediaStream s) { }
            public void onRenegotiationNeeded() { }
            public void onAddTrack(RtpReceiver r, MediaStream[] s) { }
            public void onDataChannel(DataChannel dc) { main.post(() -> { if (current(generation)) attach(dc); else { dc.close(); dc.dispose(); } }); }
        });
        if (peer == null) throw new IllegalStateException("Cannot create native PeerConnection");
    }

    private void sendCandidate(IceCandidate c) {
        signal("candidate", json("candidate", c.sdp, "sdpMid", c.sdpMid, "sdpMLineIndex", c.sdpMLineIndex, "usernameFragment", localUfrag));
    }

    private void addCandidate(IceCandidate c) {
        final int generation = peerGeneration;
        peer.addIceCandidate(c, new AddIceObserver() {
            public void onAddSuccess() { main.post(() -> { if (current(generation)) diagnostics.applied(); }); }
            public void onAddFailure(String error) { main.post(() -> {
                if (current(generation)) { diagnostics.rejected(); listener.onStatus("UDP 候选应用失败；" + diagnostics.candidates()); }
            }); }
        });
    }

    private void receive(JSONObject message) throws Exception {
        String type = message.optString("type");
        if (type.equals("offer")) {
            JSONObject data = message.getJSONObject("data");
            if (!PairingMac.verify(pairingSecret, invitation, "offer", data.getString("sdp"), data.optString("mac")))
                throw new IllegalArgumentException("Invalid desktop signature");
            if (dataOpened) return;
            if (offerSeen) createPeer();
            offerSeen = true;
            remoteUfrag = IceCredentials.ufrag(data.getString("sdp"));
            final int generation = peerGeneration;
            diagnostics.offer();
            listener.onStatus("SDP desktop verified; negotiating UDP");
            peer.setRemoteDescription(new SdpAdapter() {
                @Override public void onSetSuccess() {
                    main.post(() -> {
                        if (!current(generation)) return;
                        remoteReady = true;
                        for (IceCandidate c : pending) if (IceCredentials.belongs(remoteUfrag, "", c.sdp)) addCandidate(c);
                        pending.clear();
                        peer.createAnswer(new SdpAdapter() {
                            @Override public void onCreateSuccess(SessionDescription answer) {
                                main.post(() -> {
                                    if (!current(generation)) return;
                                    localUfrag = IceCredentials.ufrag(answer.description);
                                    peer.setLocalDescription(new SdpAdapter() {
                                        @Override public void onSetSuccess() {
                                            main.post(() -> { if (current(generation)) {
                                                signal("answer", json("type", "answer", "sdp", answer.description,
                                                    "mac", PairingMac.sign(pairingSecret, invitation, "answer", answer.description), "offerUfrag", remoteUfrag));
                                                descriptionSent = true;
                                                for (IceCandidate c : outgoing) sendCandidate(c);
                                                outgoing.clear();
                                                listener.onStatus("SDP signed answer sent; checking UDP path");
                                                main.postDelayed(() -> { if (current(generation) && !dataOpened) inspectPath(); }, 8000);
                                            } });
                                        }
                                    }, answer);
                                });
                            }
                        }, new MediaConstraints());
                    });
                }
            }, new SessionDescription(SessionDescription.Type.OFFER, data.getString("sdp")));
        } else if (type.equals("candidate")) {
            JSONObject d = message.getJSONObject("data");
            if (!isUdp(d.getString("candidate"))) return;
            if (offerSeen && !IceCredentials.belongs(remoteUfrag, d.optString("usernameFragment"), d.getString("candidate"))) return;
            diagnostics.remoteCandidate();
            IceCandidate candidate = new IceCandidate(d.optString("sdpMid", "0"), d.getInt("sdpMLineIndex"), d.getString("candidate"));
            if (remoteReady) addCandidate(candidate);
            else if (pending.size() < 128) pending.add(candidate);
        } else if (type.equals("joined")) { signalJoined = true; diagnostics.joined(); listener.onStatus("SIGNAL joined; waiting for desktop offer"); }
        else if (type.equals("peer-left")) { listener.onStatus("Desktop left; scan the current desktop QR to reconnect"); close(); }
        else if (type.equals("error")) listener.onStatus("SIGNAL rejected: " + message.optString("code"));
    }

    private void attach(DataChannel dc) {
        if (closed) { dc.close(); dc.dispose(); return; }
        if (!dc.label().equals("janusx-terminal-v1") && !dc.label().equals("janusx-lab-v1")) { dc.close(); dc.dispose(); listener.onStatus("DATA incompatible protocol"); return; }
        channel = dc;
        dc.registerObserver(new DataChannel.Observer() {
            public void onBufferedAmountChange(long previous) { }
            public void onStateChange() {
                main.post(() -> reportDataState(dc));
            }
            public void onMessage(DataChannel.Buffer buffer) {
                if (closed || channel != dc || buffer.binary || buffer.data.remaining() > 65536) return;
                byte[] bytes = new byte[buffer.data.remaining()];
                buffer.data.get(bytes);
                listener.onMessage(new String(bytes, StandardCharsets.UTF_8));
            }
        });
        // The channel may already be OPEN before the observer is registered.
        reportDataState(dc);
    }

    private DataChannel.State lastDataState;
    private void reportDataState(DataChannel dc) {
        if (closed || channel != dc) return;
        DataChannel.State state = dc.state();
        if (state == lastDataState) return;
        lastDataState = state;
        if (state == DataChannel.State.OPEN) dataOpened = true;
        if (state == DataChannel.State.CLOSED && !dataOpened) { listener.onStatus("UDP 通道尚未建立，等待电脑重试"); return; }
        listener.onStatus("DATA " + state);
        if (state == DataChannel.State.OPEN) inspectPath();
    }

    @Override public boolean send(String message) {
        DataChannel dc = channel;
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        return !closed && dc != null && dc.state() == DataChannel.State.OPEN && bytes.length <= 16384
            && dc.bufferedAmount() < 262144 && dc.send(new DataChannel.Buffer(ByteBuffer.wrap(bytes), false));
    }

    @Override public String timeoutHint() { return diagnostics.timeoutHint(); }

    @Override public synchronized void inspectPath() {
        if (peer == null || closed) return;
        final int generation = peerGeneration;
        peer.getStats(report -> main.post(() -> {
            if (!current(generation)) return;
            Map<String, RTCStats> stats = report.getStatsMap();
            long pairs = 0, requests = 0, responses = 0, succeeded = 0;
            for (RTCStats stat : stats.values()) {
                if (!stat.getType().equals("candidate-pair")) continue;
                pairs++;
                Object sent = stat.getMembers().get("requestsSent"), received = stat.getMembers().get("responsesReceived");
                if (sent instanceof Number) requests += ((Number)sent).longValue();
                if (received instanceof Number) responses += ((Number)received).longValue();
                if ("succeeded".equals(stat.getMembers().get("state"))) succeeded++;
            }
            diagnostics.checks(pairs, requests, responses, succeeded);
            if (!dataOpened) listener.onStatus("UDP 路径诊断；" + diagnostics.timeoutHint());
            for (RTCStats transport : stats.values()) {
                if (!transport.getType().equals("transport")) continue;
                Object selected = transport.getMembers().get("selectedCandidatePairId");
                RTCStats pair = stats.get(String.valueOf(selected));
                if (pair == null) continue;
                RTCStats local = stats.get(String.valueOf(pair.getMembers().get("localCandidateId")));
                RTCStats remote = stats.get(String.valueOf(pair.getMembers().get("remoteCandidateId")));
                if (local == null || remote == null) continue;
                String protocol = String.valueOf(local.getMembers().get("protocol"));
                String left = String.valueOf(local.getMembers().get("candidateType"));
                String right = String.valueOf(remote.getMembers().get("candidateType"));
                if (!protocol.equals("udp") || !"udp".equals(remote.getMembers().get("protocol")) || left.equals("relay") || right.equals("relay")) {
                    listener.onStatus("PATH rejected: requires UDP without relay");
                    close();
                    return;
                }
                listener.onStatus("PATH " + protocol + " " + left + " -> " + right + " RTT(s)=" + pair.getMembers().get("currentRoundTripTime"));
            }
        }));
    }

    private void signal(String type, JSONObject data) {
        WebSocket ws = socket;
        if (!closed && ws != null) ws.send(json("type", type, "data", data).toString());
    }
    private static boolean isUdp(String candidate) { String c = candidate.toLowerCase(java.util.Locale.ROOT); return c.contains(" udp ") && !c.matches(".* typ relay(?: .*)?$"); }
    static JSONObject json(Object... pairs) {
        JSONObject obj = new JSONObject();
        try { for (int i = 0; i < pairs.length; i += 2) obj.put((String)pairs[i], pairs[i+1]); }
        catch (Exception e) { throw new IllegalArgumentException(e); }
        return obj;
    }
    private class SdpAdapter implements SdpObserver {
        private final int generation = peerGeneration;
        public void onCreateSuccess(SessionDescription s) { }
        public void onSetSuccess() { }
        public void onCreateFailure(String s) { main.post(() -> { if (current(generation)) listener.onStatus("SDP creation failed"); }); }
        public void onSetFailure(String s) { main.post(() -> { if (current(generation)) listener.onStatus("SDP rejected"); }); }
    }
    @Override public void close() {
        PeerConnection previousPeer;
        DataChannel previousChannel;
        synchronized (this) {
            if (closed) return;
            closed = true;
            previousPeer = peer; peer = null;
            previousChannel = channel; channel = null;
            pending.clear();
            outgoing.clear();
        }
        // Release the signaling room immediately on explicit disconnect. A
        // graceful WebSocket close may otherwise linger during fast reconnect.
        if (socket != null) socket.cancel();
        // Native disposal can wait for callbacks; never hold their Java monitor here.
        if (previousChannel != null) { previousChannel.close(); previousChannel.dispose(); }
        if (previousPeer != null) { previousPeer.close(); previousPeer.dispose(); }
        factory.dispose();
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }
}
