package com.janusx.p2plab;

import org.junit.Test;
import static org.junit.Assert.*;

public class IceCredentialsTest {
    @Test public void rejectsPreviousGenerationWithoutRejectingLegacyCandidates() {
        assertEquals("new", IceCredentials.ufrag("v=0\r\na=ice-ufrag:new\r\na=ice-pwd:secret\r\n"));
        assertTrue(IceCredentials.belongs("new", "new", "candidate:1 1 udp 1 ::1 1234 typ host ufrag new"));
        assertFalse(IceCredentials.belongs("new", "old", "candidate:1 1 udp 1 ::1 1234 typ host"));
        assertFalse(IceCredentials.belongs("new", "new", "candidate:1 1 udp 1 ::1 1234 typ host ufrag old"));
        assertTrue(IceCredentials.belongs("new", "", "candidate:1 1 udp 1 ::1 1234 typ host"));
    }
}
