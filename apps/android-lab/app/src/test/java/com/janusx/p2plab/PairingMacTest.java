package com.janusx.p2plab;

import org.junit.Test;
import static org.junit.Assert.*;

public class PairingMacTest {
    private final String secret = new String(new char[64]).replace('\0', 'a');
    private final String invite = new String(new char[48]).replace('\0', 'b');
    private final String sdp = "v=0\r\ns=test\r\n";

    @Test public void matchesNodeHmacWithSdpLineEndings() {
        assertEquals("9ce6bb84e2d5d22831109a39bf862f9bc7133d9f610e173b911ee10dc183c591",
            PairingMac.sign(secret, invite, "answer", sdp));
    }

    @Test public void rejectsTamperedSdpWrongRoleAndWrongPairing() {
        String signature = PairingMac.sign(secret, invite, "offer", sdp);
        assertTrue(PairingMac.verify(secret, invite, "offer", sdp, signature));
        assertFalse(PairingMac.verify(secret, invite, "offer", sdp + "x", signature));
        assertFalse(PairingMac.verify(secret, invite, "answer", sdp, signature));
        assertFalse(PairingMac.verify(secret + "x", invite, "offer", sdp, signature));
        assertFalse(PairingMac.verify(secret, invite + "x", "offer", sdp, signature));
        assertFalse(PairingMac.verify(secret, invite, "offer", sdp, ""));
    }
}
