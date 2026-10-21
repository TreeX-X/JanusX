package com.janusx.p2plab;

import org.junit.Test;
import static org.junit.Assert.*;

public class ConnectionDiagnosticsTest {
    @Test public void distinguishesUnreachableSignalFromWaitingForDesktopAndUdpFailure() {
        ConnectionDiagnostics d = new ConnectionDiagnostics();
        assertTrue(d.timeoutHint().contains("信令未连通"));
        d.connected();
        assertTrue(d.timeoutHint().contains("未加入会话"));
        d.joined();
        assertTrue(d.timeoutHint().contains("未收到电脑协商"));
        d.offer();
        assertTrue(d.timeoutHint().contains("SDP 已验证但 UDP 未连通"));
        assertTrue(d.timeoutHint().contains("尚未获得 STUN 映射"));
        assertTrue(d.timeoutHint().contains("尚未收到电脑 UDP 候选"));
    }

    @Test public void mappedCandidatesDoNotClaimSuccessfulConnectivityOrExposeAddresses() {
        ConnectionDiagnostics d = new ConnectionDiagnostics();
        d.connected(); d.joined(); d.offer();
        d.localCandidate("candidate:1 1 udp 123 192.168.1.2 2345 typ host");
        d.localCandidate("candidate:2 1 udp 123 203.0.113.1 2345 typ srflx raddr 192.168.1.2 rport 2345");
        d.remoteCandidate();
        assertTrue(d.timeoutHint().contains("local=2 srflx=1 remote=1"));
        assertTrue(d.timeoutHint().contains("仍需双方路径检查"));
        assertFalse(d.timeoutHint().contains("192.168.1.2"));
        assertFalse(d.timeoutHint().contains("203.0.113.1"));
    }

    @Test public void separatesReceivedAppliedRejectedAndPathChecksForEachAttempt() {
        ConnectionDiagnostics d = new ConnectionDiagnostics();
        d.connected(); d.joined(); d.offer();
        d.localCandidate("candidate:1 1 udp 123 2001:db8::1 2345 typ host");
        d.remoteCandidate(); d.remoteCandidate(); d.applied(); d.rejected();
        d.checks(3, 8, 0, 0);
        assertTrue(d.timeoutHint().contains("applied=1 rejected=1 ipv6=1 round=1"));
        assertTrue(d.timeoutHint().contains("pairs=3 checks=8 responses=0 succeeded=0"));
        assertFalse(d.timeoutHint().contains("2001:db8"));
        d.offer();
        assertTrue(d.timeoutHint().contains("local=0 srflx=0 remote=0 applied=0 rejected=0 ipv6=0 round=2"));
        assertFalse(d.timeoutHint().contains("checks=8"));
    }
}
