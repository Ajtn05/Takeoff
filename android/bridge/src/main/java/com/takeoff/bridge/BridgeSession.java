package com.takeoff.bridge;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;

/** Takeoff protocol v1. All calls, including SDK and socket events, run on one thread. */
public final class BridgeSession {
    public interface Sender { boolean send(JSONObject message); }
    public static final long HOST_TIMEOUT_MS = 3000;
    private final InputGate gate;
    private final Sender sender;
    private final LongSupplier clock;
    private final Map<String, Pending> pending = new LinkedHashMap<>();
    private boolean welcomed, ready, enabling;
    private long generation = -1, sequence, lastStatus = -1, enableRequestedAt;
    private RcSample previous;
    private JSONObject telemetry;
    private String message = "Scan the pairing code from Takeoff on your laptop.";

    private static final class Pending {
        final String action;
        final long generation;
        long at;
        int tries = 1;
        Pending(String action, long generation, long at) {
            this.action = action; this.generation = generation; this.at = at;
        }
    }

    public BridgeSession(InputGate gate, Sender sender, LongSupplier clock) {
        this.gate = gate; this.sender = sender; this.clock = clock;
    }

    public void open(PairingLink link) {
        disconnected("Connecting to the laptop…");
        send(message("hello").put("role", "controller").put("version", 1)
                .put("sessionId", link.sessionId).put("token", link.token));
    }

    public void disconnected(String reason) {
        welcomed = ready = enabling = false;
        generation = -1; sequence = 0; lastStatus = -1;
        previous = null; telemetry = null; pending.clear(); message = reason;
    }

    public boolean ready() { return ready; }
    public boolean paired() { return welcomed; }
    public boolean enabling() { return enabling; }
    public String message() { return message; }
    public void notice(String text) { message = text; }
    public JSONObject telemetry() { return telemetry; }
    public boolean canEnable() {
        return enableBlockReason() == null;
    }
    /** Current prerequisite, shared by the button explanation and the actual guard. */
    public String enableBlockReason() {
        long now = clock.getAsLong();
        if (ready) return "Controls are already active.";
        if (enabling) return "Waiting for the laptop to enable controls…";
        if (!welcomed) return "Pair the laptop first.";
        if (lastStatus < 0 || now - lastStatus > HOST_TIMEOUT_MS)
            return "Waiting for the laptop. Keep the simulator open.";
        if (!gate.canEnable(now)) return gate.reason(now);
        return null;
    }

    public void enable() {
        String blocked = enableBlockReason();
        if (blocked != null) { message = blocked; return; }
        enabling = true;
        enableRequestedAt = clock.getAsLong();
        previous = gate.sample();
        if (send(message("resume").put("generation", generation).put("controls", gate.controls().json())))
            message = "Enabling controls…";
    }

    public void suspend(String reason) {
        boolean notify = welcomed && (ready || enabling);
        ready = enabling = false; previous = null; pending.clear(); message = reason;
        if (notify) send(message("suspend").put("reason", reason));
    }

    public void receive(JSONObject data) throws JSONException {
        String type = data.getString("type");
        if ("welcome".equals(type)) {
            if (!"controller".equals(data.getString("role"))) throw new JSONException("Unexpected role");
            generation = data.getLong("generation");
            if (generation < 0) throw new JSONException("Invalid generation");
            welcomed = true; ready = enabling = false; sequence = 0; pending.clear();
            message = "Laptop paired. Center the sticks and enable controls.";
        } else if ("connection".equals(type) && welcomed) {
            generation = data.getLong("generation");
            if (generation < 0) throw new JSONException("Invalid generation");
            sequence = 0; pending.clear();
            boolean requested = enabling;
            ready = data.getBoolean("ready");
            enabling = false;
            message = data.getString("reason");
            previous = gate.sample();
            if (ready && (!requested || !gate.canEnable(clock.getAsLong()))) {
                suspend("Remote moved before controls were enabled. Center the sticks and enable again.");
            }
        } else if ("status".equals(type) && welcomed) {
            JSONObject status = data.getJSONObject("status");
            status.getBoolean("paused");
            status.getString("mode");
            for (String field : new String[]{"altitude", "heading", "speed", "gimbal"})
                if (!Double.isFinite(status.getDouble(field))) throw new JSONException("Invalid telemetry");
            telemetry = status;
            lastStatus = clock.getAsLong();
        } else if ("ack".equals(type) && data.getLong("generation") == generation) {
            String id = data.getString("id");
            if (pending.remove(id) != null) message = data.getString("message");
        } else if ("error".equals(type)) {
            suspend(data.getString("message"));
        }
    }

    public void action(String action) {
        if (!ready || !gate.fresh(clock.getAsLong()) || telemetry == null) return;
        String mode = telemetry.optString("mode");
        boolean paused = telemetry.optBoolean("paused", true);
        if ("takeoff".equals(action)) {
            if (!"grounded".equals(mode)) return;
        } else if ("resume".equals(action)) {
            if (!paused || "collided".equals(mode) || !gate.controls().isNeutral() || !gate.sample().buttonsReleased()) return;
        } else if ("land".equals(action)) {
            if (paused || !"flying".equals(mode)) return;
        } else if ("capture".equals(action)) {
            if (paused || "collided".equals(mode)) return;
        } else return;
        for (Pending request : pending.values()) if (request.action.equals(action)) return;
        String id = UUID.randomUUID().toString();
        Pending request = new Pending(action, generation, clock.getAsLong());
        pending.put(id, request);
        sendAction(id, request);
    }

    /** Called every 50 ms while the activity is in the foreground. */
    public void tick() {
        long now = clock.getAsLong();
        if ((ready || enabling) && !gate.fresh(now)) { suspend(gate.reason(now)); return; }
        if ((ready || enabling) && (lastStatus < 0 || now - lastStatus > HOST_TIMEOUT_MS)) {
            suspend("Laptop connection delayed. Enable controls after reconnecting."); return;
        }
        if (enabling && (!gate.controls().isNeutral() || !gate.sample().buttonsReleased())) {
            suspend("Remote moved before controls were enabled. Center the sticks and enable again."); return;
        }
        if (enabling && now - enableRequestedAt > HOST_TIMEOUT_MS) {
            suspend("Enabling controls timed out. Pair the laptop again."); return;
        }
        if (!ready) return;
        RcSample current = gate.sample();
        if (previous != null) {
            if (current.pause && !previous.pause) {
                suspend("Remote pause button pressed. Enable controls to resume."); return;
            }
            if ((current.shutter && !previous.shutter) || (current.record && !previous.record)) action("capture");
            if (current.goHome && !previous.goHome) action("land");
        }
        previous = current;
        if (!ready) return;
        send(message("input").put("generation", generation).put("seq", ++sequence)
                .put("controls", gate.controls().json()));
        if (!ready) return;
        for (Iterator<Map.Entry<String, Pending>> iterator = pending.entrySet().iterator(); iterator.hasNext();) {
            Map.Entry<String, Pending> item = iterator.next();
            Pending request = item.getValue();
            if (now - request.at < 500) continue;
            if (request.tries >= 3) {
                iterator.remove(); message = "Action was not confirmed. Check the laptop."; continue;
            }
            request.at = now; request.tries++;
            // Send failure clears pending; stop iteration immediately in that case.
            if (!sendAction(item.getKey(), request)) return;
        }
    }

    private boolean sendAction(String id, Pending request) {
        return send(message("action").put("generation", request.generation).put("id", id).put("action", request.action));
    }
    private boolean send(JsonBuilder builder) {
        if (sender.send(builder.value)) return true;
        disconnected("Connection unavailable. Pair the laptop again.");
        return false;
    }
    private static JsonBuilder message(String type) { return new JsonBuilder().put("type", type); }
    // org.json methods declare checked exceptions on Android, unlike some JVM releases.
    private static final class JsonBuilder {
        final JSONObject value = new JSONObject();
        JsonBuilder put(String key, Object value) {
            try { this.value.put(key, value); return this; }
            catch (JSONException error) { throw new IllegalArgumentException(error); }
        }
    }
}
