package com.janusx.p2plab;

import org.junit.Test;
import java.net.URI;
import static org.junit.Assert.*;

public class RemoteDefaultsTest {
    @Test public void bundledSignalUsesPublicTlsWithoutPairingCredentials() throws Exception {
        if (BuildConfig.LAN_ONLY) {
            assertEquals("", BuildConfig.DEFAULT_SIGNAL_URL);
            assertEquals("", BuildConfig.DEFAULT_STUN_URL);
            return;
        }
        URI signal = new URI(BuildConfig.DEFAULT_SIGNAL_URL);
        assertEquals("wss", signal.getScheme());
        assertEquals("/signal", signal.getPath());
        assertNotNull(signal.getHost());
        assertFalse(signal.getHost().equals("10.0.2.2"));
        assertNull(signal.getUserInfo());
        assertNull(signal.getQuery());
        assertNull(signal.getFragment());
        assertTrue(BuildConfig.DEFAULT_STUN_URL.startsWith("stun:"));
    }

    @Test public void lanScopeAcceptsPrivateQrAndRejectsPublicOrStun() {
        for (String url : new String[] { "ws://192.168.1.2:43821/signal", "ws://10.0.2.2:43821/signal", "ws://172.16.1.2/signal" })
            RemoteScope.validate(url, "");
        for (String url : new String[] { "wss://example.com/signal", "ws://8.8.8.8/signal", "ws://192.168.999.1/signal", "ws://192.168.1.2/signal#x" }) {
            if (BuildConfig.LAN_ONLY) assertThrows(IllegalArgumentException.class, () -> RemoteScope.validate(url, ""));
            else RemoteScope.validate(url, "");
        }
        if (BuildConfig.LAN_ONLY) assertThrows(IllegalArgumentException.class, () -> RemoteScope.validate("ws://192.168.1.2/signal", "stun:example.com"));
    }
}
