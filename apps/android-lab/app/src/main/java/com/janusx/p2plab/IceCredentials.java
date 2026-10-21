package com.janusx.p2plab;

/** ICE generations are identified by SDP credentials, not candidate IP addresses. */
final class IceCredentials {
    static String ufrag(String sdp) {
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("(?m)^a=ice-ufrag:([^\\r\\n]+)").matcher(sdp);
        return match.find() ? match.group(1) : "";
    }
    static boolean belongs(String expected, String supplied, String candidate) {
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("(?:^| )ufrag ([^ ]+)").matcher(candidate);
        String embedded = match.find() ? match.group(1) : "";
        return (supplied.isEmpty() || supplied.equals(expected)) && (embedded.isEmpty() || embedded.equals(expected));
    }
}
