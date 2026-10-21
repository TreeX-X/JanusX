package com.janusx.p2plab;

import java.net.URI;

/** LAN test distribution never opens public signaling or configures STUN. */
final class RemoteScope {
    static void validate(String signalUrl, String stunUrl) {
        if (!BuildConfig.LAN_ONLY) return;
        URI uri;
        try { uri = URI.create(signalUrl); }
        catch (IllegalArgumentException error) { throw new IllegalArgumentException("局域网信令地址无效"); }
        String host = uri.getHost();
        if (!"ws".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null || uri.getFragment() != null
                || !privateIpv4(host) || !stunUrl.trim().isEmpty())
            throw new IllegalArgumentException("此为局域网测试版，请扫描同一局域网电脑生成的二维码；不支持公网信令或 STUN");
    }

    private static boolean privateIpv4(String host) {
        String[] octets = host.split("\\.", -1);
        if (octets.length != 4) return false;
        int[] ip = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!octets[i].matches("[0-9]{1,3}")) return false;
            ip[i] = Integer.parseInt(octets[i]);
            if (ip[i] > 255) return false;
        }
        return ip[0] == 10 || ip[0] == 127 || (ip[0] == 192 && ip[1] == 168)
                || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31);
    }
}
