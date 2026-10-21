package com.janusx.p2plab;

import org.junit.Test;
import static org.junit.Assert.*;

public class SignalNetworkCheckTest {
    @Test public void exposesHostnameCertificateFailureEvenWhenWrapped() {
        Throwable error = new java.io.IOException("request metadata must stay private",
            new javax.net.ssl.SSLPeerUnverifiedException("Hostname signal.example not verified:\n subjectAltNames: [other.example]"));
        String result = SignalNetworkCheck.certificateFailure(error);
        assertTrue(result.contains("Hostname signal.example not verified"));
        assertTrue(result.contains("other.example"));
        assertFalse(result.contains("\n"));
        assertFalse(result.contains("request metadata"));
    }

    @Test public void boundsCertificateMessagesAndOmitsUnrelatedErrorDetails() {
        assertEquals("", SignalNetworkCheck.certificateFailure(new java.io.IOException("private payload")));
        String result = SignalNetworkCheck.certificateFailure(new java.security.cert.CertificateExpiredException("x".repeat(3000)));
        assertTrue(result.startsWith("CertificateExpiredException:"));
        assertTrue(result.length() < 1700);
    }

    @Test public void healthProbeUsesSameOriginWithoutQueryCredentials() {
        okhttp3.Request request = SignalNetworkCheck.healthRequest("wss://example.com:8443/signal?invite=private#secret");
        assertEquals("https://example.com:8443/health", request.url().toString());
        assertEquals("GET", request.method());
        assertNull(request.header("Authorization"));
    }

    @Test public void rejectsEmbeddedAccountCredentials() {
        assertThrows(IllegalArgumentException.class,
            () -> SignalNetworkCheck.healthRequest("wss://user:password@example.com/signal"));
    }
}
