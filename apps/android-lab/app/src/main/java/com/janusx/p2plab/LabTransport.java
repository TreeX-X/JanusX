package com.janusx.p2plab;

/** Connection boundary: no terminal, workspace or filesystem logic belongs here. */
public interface LabTransport extends AutoCloseable {
    interface Listener {
        void onStatus(String status);
        void onMessage(String message);
    }
    void connect(String signalUrl, String invitation, String stunUrl, String pairingSecret);
    boolean send(String message);
    void inspectPath();
    void close();
}
