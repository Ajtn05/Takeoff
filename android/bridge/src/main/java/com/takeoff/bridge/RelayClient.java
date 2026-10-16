package com.takeoff.bridge;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

/** Native WebSocket transport: credentials stay in hello, never URLs or logs. */
public final class RelayClient {
    public interface Dispatch { void post(Runnable task); }
    public interface Listener {
        void opened();
        void received(JSONObject message);
        void closed(String reason);
    }
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS)
            .pingInterval(1, TimeUnit.SECONDS).followRedirects(false).build();
    private final Dispatch dispatch;
    private final Listener listener;
    private WebSocket socket;
    private int attempt;

    public RelayClient(Dispatch dispatch, Listener listener) { this.dispatch = dispatch; this.listener = listener; }

    public void connect(PairingLink link) {
        close();
        final int current = ++attempt;
        socket = client.newWebSocket(new Request.Builder().url(link.socketUrl).build(), new WebSocketListener() {
            private void deliver(Runnable task) {
                dispatch.post(() -> { if (attempt == current) task.run(); });
            }
            @Override public void onOpen(WebSocket webSocket, Response response) { deliver(listener::opened); }
            @Override public void onMessage(WebSocket webSocket, String text) {
                if (text.length() > 16384) { webSocket.close(4002, "Message too large"); return; }
                try {
                    JSONObject data = new JSONObject(text);
                    deliver(() -> listener.received(data));
                } catch (Exception error) { webSocket.close(4002, "Invalid server response"); }
            }
            @Override public void onClosing(WebSocket webSocket, int code, String reason) {
                webSocket.close(code, reason);
                deliver(() -> { socket = null; listener.closed(reason.isEmpty() ? "Laptop disconnected. Pair again." : reason); });
            }
            @Override public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                deliver(() -> { socket = null; listener.closed("Cannot reach the laptop. Check Wi-Fi and the pairing link."); });
            }
        });
    }

    public boolean send(JSONObject message) {
        if (socket == null) return false;
        if (socket.queueSize() > 16384) { close(); return false; }
        return socket.send(message.toString());
    }
    public void close() {
        attempt++;
        if (socket != null) socket.close(1000, "Phone app closed");
        socket = null;
    }
    public void shutdown() {
        close(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
