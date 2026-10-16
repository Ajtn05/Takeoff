package com.takeoff.bridge;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Drives the native Java bridge against Takeoff's real Node relay, using synthetic SDK frames. */
public final class LiveRelayProbe {
    public static void main(String[] args) throws Exception {
        PairingLink link = PairingLink.parse(new BufferedReader(new InputStreamReader(System.in)).readLine());
        LinkedBlockingQueue<Runnable> events = new LinkedBlockingQueue<>();
        InputGate gate = new InputGate();
        gate.connection(true, false, System.nanoTime() / 1_000_000);
        BridgeSession[] session = new BridgeSession[1];
        boolean[] acknowledged = {false, false};
        RelayClient relay = new RelayClient(events::add, new RelayClient.Listener() {
            @Override public void opened() { session[0].open(link); }
            @Override public void received(JSONObject data) {
                try {
                    session[0].receive(data);
                    if ("ack".equals(data.optString("type")) && data.optBoolean("ok")) {
                        if ("Native capture confirmed".equals(data.optString("message"))) acknowledged[0] = true;
                        if ("Native landing confirmed".equals(data.optString("message"))) acknowledged[1] = true;
                    }
                } catch (Exception error) { throw new IllegalStateException(error); }
            }
            @Override public void closed(String reason) { session[0].disconnected(reason); }
        });
        session[0] = new BridgeSession(gate, relay::send, () -> System.nanoTime() / 1_000_000);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
        long lastConnectionCheck = -1, heldSince = -1;
        boolean initialReading = false;
        try {
            relay.connect(link);
            while (System.nanoTime() < deadline) {
                Runnable event = events.poll(20, TimeUnit.MILLISECONDS);
                if (event != null) event.run();
                long now = System.nanoTime() / 1_000_000;
                if (lastConnectionCheck < 0 || now - lastConnectionCheck >= 250) {
                    gate.connection(true, false, now);
                    lastConnectionCheck = now;
                }
                boolean active = session[0].ready();
                // Deliver values only when they change, as on the physical RC231.
                if (!initialReading || (active && heldSince < 0)) {
                    gate.accept(new RcSample(0, 0, 0, active ? 660 : 0, active ? 340 : 0,
                            active, false, active, false, false, "POSITION_TWO", now));
                    initialReading = true;
                    if (active) heldSince = now;
                }
                if (session[0].canEnable()) session[0].enable();
                session[0].tick();
                if (heldSince >= 0 && now - heldSince >= 1500 && !session[0].ready())
                    throw new AssertionError("Unchanged sticks paused despite a monitored connection");
                if (acknowledged[0] && acknowledged[1] && heldSince >= 0 && now - heldSince >= 1500) {
                    gate.connection(false, false, now);
                    session[0].tick();
                    if (session[0].ready()) throw new AssertionError("Disconnected remote remained enabled");
                    System.out.println("Native bridge: pairing, held sticks without extra SDK callbacks, capture, landing, acknowledgements and USB loss passed.");
                    return;
                }
            }
            throw new AssertionError("Native relay round trip timed out");
        } finally { relay.shutdown(); }
    }
}
