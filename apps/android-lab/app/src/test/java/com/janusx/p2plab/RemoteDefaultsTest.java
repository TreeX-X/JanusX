package com.janusx.p2plab;

import org.junit.Test;
import java.net.URI;
import static org.junit.Assert.*;

public class RemoteDefaultsTest {
    @Test public void bundledSignalUsesPublicTlsWithoutPairingCredentials() throws Exception {
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
}
