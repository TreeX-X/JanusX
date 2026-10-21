package com.janusx.p2plab;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class PairingMac {
    static String sign(String secret, String invite, String type, String sdp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal((invite + "\n" + type + "\n" + sdp).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) hex.append(Character.forDigit((b >>> 4) & 15, 16)).append(Character.forDigit(b & 15, 16));
            return hex.toString();
        } catch (GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable", e); }
    }

    static boolean verify(String secret, String invite, String type, String sdp, String signature) {
        return signature.matches("[a-f0-9]{64}") && MessageDigest.isEqual(
            sign(secret, invite, type, sdp).getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
    }
}
