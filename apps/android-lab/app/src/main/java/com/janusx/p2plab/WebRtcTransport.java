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
    private final OkHttpClient http = new OkHttpClient.Builder().pingInterval(15, TimeUnit.SECONDS).build();
    private final List<IceCandidate> pending = new ArrayList<>();
    private final ConnectionDiagnostics diagnostics = new ConnectionDiagnostics();
    private PeerConnection peer;
    private volatile DataChannel channel;
    private WebSocket socket;
    private boolean remoteReady;
    private String invitation, pairingSecret;
    private volatile boolean closed;

    public WebRtcTransport(Context context, Listener listener) {
        this.listener = listener;
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.getApplicationContext()).createInitializationOptions());
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory();
    }

    @Override public void connect(String signalUrl, String invitation, String stunUrl, String pairingSecret) {
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
        peer = factory.createPeerConnection(config, new PeerConnection.Observer() {
            public void onSignalingChange(PeerConnection.SignalingState s) { }
            public void onIceConnectionChange(PeerConnection.IceConnectionState s) {
                if (!closed) listener.onStatus(s == PeerConnection.IceConnectionState.FAILED ? "ICE FAILED: " + diagnostics.timeoutHint() : "ICE " + s);
            }
            public void onConnectionChange(PeerConnection.PeerConnectionState s) { if (!closed) listener.onStatus("PEER " + s); }
            public void onIceConnectionReceivingChange(boolean receiving) { }
            public void onIceGatheringChange(PeerConnection.IceGatheringState s) {
                if (!closed) listener.onStatus("GATHER " + s + "; " + diagnostics.candidates());
            }
            public void onIceCandidate(IceCandidate c) {
                if (!closed && isUdp(c.sdp)) {
                    diagnostics.localCandidate(c.sdp);
                    signal("candidate", json("candidate", c.sdp, "sdpMid", c.sdpMid, "sdpMLineIndex", c.sdpMLineIndex));
                }
            }
            public void onIceCandidatesRemoved(IceCandidate[] c) { }
            public void onAddStream(MediaStream s) { }
            public void onRemoveStream(MediaStream s) { }
            public void onRenegotiationNeeded() { }
            public void onAddTrack(RtpReceiver r, MediaStream[] s) { }
            public void onDataChannel(DataChannel dc) { main.post(() -> attach(dc)); }
        });
        if (peer == null) throw new IllegalStateException("Cannot create native PeerConnection");
        socket = http.newWebSocket(new Request.Builder().url(signalUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) {
                if (closed) { ws.close(1000, "cancelled"); return; }
                diagnostics.connected();
                ws.send(json("type", "join", "role", "client", "invite", invitation).toString());
                listener.onStatus("SIGNAL connected; joining desktop session");
            }
            @Override public void onMessage(WebSocket ws, String text) {
                main.post(() -> {
                    if (closed) return;
                    try { receive(new JSONObject(text)); }
                    catch (Exception e) { listener.onStatus("SIGNAL rejected: invalid message or desktop signature"); close(); }
                });
            }
            @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                if (!closed) listener.onStatus("SIGNAL failed (" + error.getClass().getSimpleName()
                    + (response == null ? "" : ", HTTP " + response.code()) + "): "
                    + (channel != null && channel.state() == DataChannel.State.OPEN ? "UDP 通道继续运行" : diagnostics.timeoutHint()));
            }
            @Override public void onClosed(WebSocket ws, int code, String reason) {
                if (!closed) listener.onStatus("SIGNAL closed " + code + "; "
                    + (channel != null && channel.state() == DataChannel.State.OPEN ? "UDP 通道继续运行" : diagnostics.timeoutHint()));
            }
            @Override public void onClosing(WebSocket ws, int code, String reason) { ws.close(code, reason); }
        });
    }

    private void receive(JSONObject message) throws Exception {
        String type = message.optString("type");
        if (type.equals("offer")) {
            JSONObject data = message.getJSONObject("data");
            if (!PairingMac.verify(pairingSecret, invitation, "offer", data.getString("sdp"), data.optString("mac")))
                throw new IllegalArgumentException("Invalid desktop signature");
            diagnostics.offer();
            listener.onStatus("SDP desktop verified; negotiating UDP");
            peer.setRemoteDescription(new SdpAdapter() {
                @Override public void onSetSuccess() {
                    main.post(() -> {
                        if (closed) return;
                        remoteReady = true;
                        for (IceCandidate c : pending) peer.addIceCandidate(c);
                        pending.clear();
                        peer.createAnswer(new SdpAdapter() {
                            @Override public void onCreateSuccess(SessionDescription answer) {
                                main.post(() -> {
                                    if (closed) return;
                                    peer.setLocalDescription(new SdpAdapter() {
                                        @Override public void onSetSuccess() {
                                            if (!closed) {
                                                signal("answer", json("type", "answer", "sdp", answer.description,
                                                    "mac", PairingMac.sign(pairingSecret, invitation, "answer", answer.description)));
                                                listener.onStatus("SDP signed answer sent; checking UDP path");
                                            }
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
            diagnostics.remoteCandidate();
            IceCandidate candidate = new IceCandidate(d.optString("sdpMid", "0"), d.getInt("sdpMLineIndex"), d.getString("candidate"));
            if (remoteReady) peer.addIceCandidate(candidate);
            else if (pending.size() < 128) pending.add(candidate);
        } else if (type.equals("joined")) { diagnostics.joined(); listener.onStatus("SIGNAL joined; waiting for desktop offer"); }
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
                if (buffer.binary || buffer.data.remaining() > 65536) return;
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
        peer.getStats(report -> {
            Map<String, RTCStats> stats = report.getStatsMap();
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
                    new android.os.Handler(android.os.Looper.getMainLooper()).post(this::close);
                    return;
                }
                listener.onStatus("PATH " + protocol + " " + left + " -> " + right + " RTT(s)=" + pair.getMembers().get("currentRoundTripTime"));
            }
        });
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
        public void onCreateSuccess(SessionDescription s) { }
        public void onSetSuccess() { }
        public void onCreateFailure(String s) { listener.onStatus("SDP creation failed"); }
        public void onSetFailure(String s) { listener.onStatus("SDP rejected"); }
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
        }
        if (socket != null) socket.close(1000, "disconnect");
        // Native disposal can wait for callbacks; never hold their Java monitor here.
        if (previousChannel != null) { previousChannel.close(); previousChannel.dispose(); }
        if (previousPeer != null) { previousPeer.close(); previousPeer.dispose(); }
        factory.dispose();
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }
}
