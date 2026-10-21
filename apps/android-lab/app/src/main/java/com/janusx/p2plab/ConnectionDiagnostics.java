package com.janusx.p2plab;

/** Stage and candidate counts only; never record addresses or pairing credentials. */
final class ConnectionDiagnostics {
    private boolean signalConnected, joined, offerReceived;
    private int localUdp, mappedUdp, remoteUdp, applied, rejected, round, ipv6;
    private String checks = "";
    synchronized void connected() { signalConnected = true; }
    synchronized void joined() { joined = true; }
    synchronized void offer() {
        offerReceived = true; round++;
        localUdp = mappedUdp = remoteUdp = applied = rejected = ipv6 = 0;
        checks = "";
    }
    synchronized void applied() { applied++; }
    synchronized void rejected() { rejected++; }
    synchronized void checks(long pairs, long sent, long received, long succeeded) {
        checks = "; pairs=" + pairs + " checks=" + sent + " responses=" + received + " succeeded=" + succeeded;
    }
    synchronized void localCandidate(String sdp) {
        localUdp++;
        if (sdp.toLowerCase(java.util.Locale.ROOT).contains(" typ srflx")) mappedUdp++;
        String[] parts = sdp.trim().split("\\s+");
        if (parts.length > 4 && parts[4].contains(":")) ipv6++;
    }
    synchronized void remoteCandidate() { remoteUdp++; }
    synchronized String candidates() { return "UDP candidates local=" + localUdp + " srflx=" + mappedUdp + " remote=" + remoteUdp
        + " applied=" + applied + " rejected=" + rejected + " ipv6=" + ipv6 + " round=" + round + checks; }
    synchronized String timeoutHint() {
        if (!signalConnected) return "信令未连通：异网需公网 wss:// 地址；局域网 IP 无法供蜂窝网络访问。检查 DNS、TLS、服务器和网络。";
        if (!joined) return "信令已连接但未加入会话：检查信令服务版本与邀请，重新扫描电脑当前二维码。";
        if (!offerReceived) return "已加入信令但未收到电脑协商：确认电脑远程已开启，且双方使用同一公网信令服务和当前二维码。";
        return "SDP 已验证但 UDP 未连通（" + candidates() + "）："
            + (mappedUdp == 0 ? "本机尚未获得 STUN 映射，检查 STUN/UDP；" : "已获得 STUN 映射，仍需双方路径检查；")
            + (remoteUdp == 0 ? "尚未收到电脑 UDP 候选，检查电脑信令/STUN；" : "候选计数不等于已连通，请结合应用结果与检查应答定位两端路径；")
            + "无中继模式无法保证所有 NAT 可达。";
    }
}
