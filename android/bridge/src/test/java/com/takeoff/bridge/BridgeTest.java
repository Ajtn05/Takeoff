package com.takeoff.bridge;

import org.json.JSONObject;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class BridgeTest {
    private static RcSample sample(long at, int lx, int ly, int rx, int ry, int dial, boolean capture, boolean land, boolean pause) {
        return new RcSample(lx, ly, rx, ry, dial, capture, false, land, pause, false, "POSITION_TWO", at);
    }
    private static RcSample centered(long at) { return sample(at, 0, 0, 0, 0, 0, false, false, false); }

    @Test public void fullDeflectionAndDeadZoneAreNormalizedWithoutChangingAxisSigns() {
        assertEquals(0, RcSample.axis(20), 0);
        assertEquals(0, RcSample.axis(-20), 0);
        assertEquals(1, RcSample.axis(660), 0);
        assertEquals(-1, RcSample.axis(-660), 0);
        assertEquals(.5, RcSample.axis(340), 0);
        assertEquals(-1, RcSample.axis(Integer.MIN_VALUE), 0);
        assertEquals(1, RcSample.axis(900), 0);
    }

    @Test public void djiModesMatchTakeoffAxisLayouts() {
        RcSample sample = sample(0, 660, -660, 340, -340, 660, false, false, false);
        Controls one = sample.controls(1, false), two = sample.controls(2, false), three = sample.controls(3, true);
        assertEquals(-.5, one.climb, 0); assertEquals(1, one.yaw, 0);
        assertEquals(-1, one.forward, 0); assertEquals(.5, one.right, 0);
        assertEquals(-1, two.climb, 0); assertEquals(1, two.yaw, 0);
        assertEquals(-.5, two.forward, 0); assertEquals(.5, two.right, 0);
        assertEquals(-.5, three.climb, 0); assertEquals(.5, three.yaw, 0);
        assertEquals(-1, three.forward, 0); assertEquals(1, three.right, 0);
        assertEquals(-1, three.gimbal, 0);
    }

    @Test public void pairingWorksWithHostedLanIpv6AndAppLinks() {
        String fragment = "#session=abc_def&token=token-123";
        assertEquals("wss://takeoff.example/ws", PairingLink.parse("https://takeoff.example/controller" + fragment).socketUrl);
        assertEquals("ws://192.168.1.2:8082/ws", PairingLink.parse("http://192.168.1.2:8082/controller" + fragment).socketUrl);
        assertEquals("ws://[::1]:8080/ws", PairingLink.parse("http://[::1]:8080/controller" + fragment).socketUrl);
        assertEquals("token-123", PairingLink.parse("takeoff://pair?url=https%3A%2F%2Ftakeoff.example%2Fcontroller%23session%3Dabc_def%26token%3Dtoken-123").token);
    }

    @Test public void pairingRejectsPartialLinksCredentialsAndAmbiguousTokens() {
        for (String link : new String[]{"https://takeoff.example/controller", "file:///controller#session=x&token=y",
                "https://user:password@takeoff.example/controller#session=x&token=y",
                "https://takeoff.example/controller#session=x&token=a&token=b",
                "https://takeoff.example/controller?token=y#session=x&token=y", "takeoff://pair?url=takeoff%3A%2F%2Fpair",
                "https://takeoff.example/controller#session=x&token=%0A"}) {
            try { PairingLink.parse(link); fail("Accepted invalid link"); } catch (IllegalArgumentException expected) { }
        }
    }

    @Test public void enablingRequiresAContinuousCenterHoldAndFreshConnectedHardware() {
        InputGate gate = new InputGate();
        gate.connection(true, false, 0);
        gate.accept(centered(100)); assertFalse(gate.canEnable(100));
        gate.accept(centered(400)); assertTrue(gate.canEnable(400));
        assertFalse(gate.canEnable(901));
        gate.accept(centered(1000)); assertFalse(gate.canEnable(1000));
        gate.accept(sample(1200, 100, 0, 0, 0, 0, false, false, false));
        gate.accept(centered(1300)); assertFalse(gate.canEnable(1400));
        gate.accept(centered(1600)); assertTrue(gate.canEnable(1600));
        gate.connection(false, false, 1600); assertFalse(gate.canEnable(1600));
        gate.connection(true, false, 1600); assertFalse(gate.canEnable(1600));
    }

    @Test public void poweredAircraftAndHeldButtonsPreventEnabling() {
        InputGate gate = new InputGate();
        gate.connection(true, true, 0); gate.accept(centered(10)); gate.accept(centered(400));
        assertFalse(gate.canEnable(400)); assertTrue(gate.reason(400).contains("drone off"));
        gate.connection(true, false, 0);
        gate.accept(sample(500, 0, 0, 0, 0, 0, true, false, false));
        assertFalse(gate.canEnable(900));
    }

    @Test public void lateQueuedHardwareFramesCannotReplaceANewerStickReading() {
        InputGate gate = new InputGate(); gate.connection(true, false, 0);
        gate.accept(sample(200, 660, 0, 0, 0, 0, false, false, false));
        gate.accept(centered(100));
        assertEquals(1, gate.controls().yaw, 0);
        assertFalse(gate.canEnable(500));
    }

    private static final class Fixture {
        long now = 100;
        final InputGate gate = new InputGate();
        final List<JSONObject> sent = new ArrayList<>();
        final BridgeSession session = new BridgeSession(gate, message -> { sent.add(message); return true; }, () -> now);
        Fixture() throws Exception {
            gate.connection(true, false, 0); gate.accept(centered(100));
            session.open(PairingLink.parse("http://localhost:8080/controller#session=session&token=token"));
            session.receive(new JSONObject("{\"type\":\"welcome\",\"role\":\"controller\",\"generation\":2}"));
            status(false, "flying");
        }
        void status(boolean paused, String mode) throws Exception {
            session.receive(new JSONObject().put("type", "status").put("status", new JSONObject()
                    .put("paused", paused).put("mode", mode).put("altitude", 3).put("heading", 0).put("speed", 0).put("gimbal", -12)));
        }
        void enable() throws Exception {
            now = 400; gate.accept(centered(now)); session.enable();
            session.receive(new JSONObject("{\"type\":\"connection\",\"ready\":true,\"generation\":3,\"reason\":\"Ready\"}"));
            assertTrue(session.ready()); sent.clear();
        }
        long count(String type) { return sent.stream().filter(message -> type.equals(message.optString("type"))).count(); }
    }

    @Test public void onlyServerAcknowledgedEnablingCanTransmitMappedInputs() throws Exception {
        Fixture f = new Fixture();
        f.session.enable(); assertFalse(f.session.enabling());
        f.enable();
        f.gate.accept(sample(f.now, 660, -660, 340, -340, 660, false, false, false)); f.session.tick();
        JSONObject input = f.sent.get(0);
        assertEquals("input", input.getString("type")); assertEquals(3, input.getLong("generation"));
        assertEquals(1, input.getLong("seq")); assertEquals(-1, input.getJSONObject("controls").getDouble("climb"), 0);
        assertEquals(-.5, input.getJSONObject("controls").getDouble("forward"), 0);
    }

    @Test public void stickMovementWhileEnablingCancelsTheHandshake() throws Exception {
        Fixture f = new Fixture();
        f.now = 400; f.gate.accept(centered(400)); f.session.enable();
        f.gate.accept(sample(400, 0, 200, 0, 0, 0, false, false, false));
        f.session.receive(new JSONObject("{\"type\":\"connection\",\"ready\":true,\"generation\":3,\"reason\":\"Ready\"}"));
        assertFalse(f.session.ready()); assertEquals(1, f.count("suspend"));
        f.session.tick(); assertEquals(0, f.count("input"));
    }

    @Test public void staleRemoteSuspendsEvenWhenSocketRemainsHealthy() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.now = 901; f.status(false, "flying"); f.session.tick();
        assertFalse(f.session.ready()); assertEquals(1, f.count("suspend")); assertEquals(0, f.count("input"));
    }

    @Test public void staleLaptopSuspendsEvenWhenRemoteRemainsHealthy() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.now = 3500; f.gate.accept(centered(f.now)); f.session.tick();
        assertFalse(f.session.ready()); assertEquals(1, f.count("suspend")); assertEquals(0, f.count("input"));
    }

    @Test public void physicalButtonEdgesFireOnceAndRetriesKeepTheSameActionId() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.gate.accept(sample(400, 0, 0, 0, 0, 0, true, false, false));
        f.session.tick(); f.session.tick(); assertEquals(1, f.count("action"));
        JSONObject first = f.sent.stream().filter(message -> "action".equals(message.optString("type"))).findFirst().get();
        assertEquals("capture", first.getString("action"));
        f.now = 900; f.gate.accept(sample(900, 0, 0, 0, 0, 0, true, false, false)); f.session.tick();
        assertEquals(2, f.count("action"));
        JSONObject last = f.sent.get(f.sent.size() - 1); assertEquals(first.getString("id"), last.getString("id"));
        f.session.receive(new JSONObject().put("type", "ack").put("generation", 3)
                .put("id", first.getString("id")).put("ok", true).put("message", "Photo captured"));
        f.now = 1400; f.gate.accept(centered(1400)); f.session.tick(); assertEquals(2, f.count("action"));
    }

    @Test public void pauseButtonStopsInputsBeforeAnyFurtherFlightAction() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.gate.accept(sample(400, 0, 0, 0, 0, 0, true, true, true)); f.session.tick();
        assertFalse(f.session.ready()); assertEquals(1, f.count("suspend"));
        assertEquals(0, f.count("input")); assertEquals(0, f.count("action"));
    }

    @Test public void generationChangeDiscardsActionsAndRequiresManualEnabling() throws Exception {
        Fixture f = new Fixture(); f.enable(); f.session.action("capture");
        f.session.receive(new JSONObject("{\"type\":\"connection\",\"ready\":false,\"generation\":4,\"reason\":\"Laptop paused\"}"));
        f.sent.clear(); f.now = 900; f.gate.accept(centered(900)); f.session.tick();
        assertFalse(f.session.ready()); assertEquals(0, f.count("action")); assertEquals(0, f.count("input"));
    }

    @Test public void appBackgroundSuspendsAndNoReconnectAutomaticallyEnables() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.session.suspend("Phone app left the screen."); f.session.tick();
        assertEquals(1, f.count("suspend")); assertEquals(0, f.count("input"));
        f.session.disconnected("Disconnected"); assertFalse(f.session.paired());
        assertFalse(f.session.ready()); assertFalse(f.session.canEnable());
    }

    @Test public void actionsHonorSimulatorStateAndCenteringForResume() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.session.action("takeoff"); assertEquals(0, f.count("action"));
        f.status(true, "flying"); f.session.action("capture"); f.session.action("land"); assertEquals(0, f.count("action"));
        f.gate.accept(sample(400, 200, 0, 0, 0, 0, false, false, false));
        f.session.action("resume"); assertEquals(0, f.count("action"));
        f.gate.accept(centered(400)); f.session.action("resume"); assertEquals(1, f.count("action"));
    }

    @Test public void pairedLaptopWithoutRemoteReportsTheBlockAndCannotEnable() throws Exception {
        Fixture f = new Fixture();
        f.gate.connection(false, false, f.now);
        assertTrue(f.session.paired());
        assertEquals("Connect and power on your RC231 remote.", f.session.enableBlockReason());
        f.session.enable();
        assertFalse(f.session.enabling());
        assertEquals(0, f.count("resume"));
        assertEquals(f.session.enableBlockReason(), f.session.message());
    }

    @Test public void enablingExplainsHostDelayStickMovementAndHeldButtons() throws Exception {
        Fixture f = new Fixture();
        assertEquals("Hold both sticks centered for a moment.", f.session.enableBlockReason());
        f.now = 400; f.gate.accept(centered(400));
        assertNull(f.session.enableBlockReason());
        f.gate.accept(sample(400, 0, 100, 0, 0, 0, false, false, false));
        assertEquals("Center both sticks and release the camera dial.", f.session.enableBlockReason());
        f.gate.accept(sample(400, 0, 0, 0, 0, 0, true, false, false));
        assertEquals("Release all remote buttons before enabling controls.", f.session.enableBlockReason());
        f.now = 3500; f.gate.accept(centered(f.now));
        assertEquals("Waiting for the laptop. Keep the simulator open.", f.session.enableBlockReason());
        f.session.enable(); assertEquals(0, f.count("resume"));
    }

    @Test public void centeredSticksStayReadyWithoutRepeatedHardwareChanges() {
        InputGate gate = new InputGate();
        gate.connection(true, false, 100);
        RcSample actualFrame = centered(100);
        gate.accept(actualFrame);
        for (long now = 350; now <= 15350; now += 250) {
            gate.connection(true, false, now);
            assertTrue(gate.fresh(now));
            if (now >= 400) assertTrue(gate.canEnable(now));
        }
        assertSame(actualFrame, gate.sample());
        assertEquals(100, gate.sample().receivedAt);
        gate.configure(1, true);
        gate.connection(true, false, 15600);
        assertFalse(gate.canEnable(15600));
        assertTrue(gate.canEnable(15650));
    }

    @Test public void connectionChecksAloneCannotInventACenteredHardwareReading() {
        InputGate gate = new InputGate();
        for (long now = 100; now <= 5100; now += 250) {
            gate.connection(true, false, now);
            assertNull(gate.sample());
            assertFalse(gate.fresh(now));
            assertFalse(gate.canEnable(now));
        }
        assertTrue(gate.reason(5100).startsWith("Move and release"));
    }

    @Test public void heldStickPositionPersistsWhileTheConnectionIsMonitored() throws Exception {
        Fixture f = new Fixture(); f.enable();
        f.gate.accept(sample(400, 0, 0, 0, 340, 0, false, false, false));
        for (f.now = 650; f.now <= 2650; f.now += 250) {
            f.gate.connection(true, false, f.now);
            f.status(false, "flying"); f.session.tick();
            assertTrue(f.session.ready());
            JSONObject input = f.sent.get(f.sent.size() - 1);
            assertEquals("input", input.getString("type"));
            assertEquals(.5, input.getJSONObject("controls").getDouble("forward"), 0);
        }
        f.gate.connection(false, false, f.now);
        f.session.tick();
        assertFalse(f.session.ready());
        assertNull(f.gate.sample());
        f.gate.connection(true, false, f.now + 100);
        assertFalse(f.gate.canEnable(f.now + 400));
    }

    @Test public void monitoringGapCannotReviveOldHardwareValues() {
        InputGate gate = new InputGate();
        gate.connection(true, false, 100); gate.accept(centered(100));
        gate.connection(true, false, 350);
        assertTrue(gate.canEnable(450));
        assertFalse(gate.fresh(851));
        gate.connection(true, false, 900);
        assertNull(gate.sample());
        gate.accept(centered(800));
        assertNull(gate.sample());
        gate.accept(centered(900));
        assertFalse(gate.canEnable(900));
        gate.connection(true, false, 1150);
        assertTrue(gate.canEnable(1200));
    }

    @Test public void lateCallbacksCannotUndoAConnectionLoss() {
        InputGate gate = new InputGate();
        gate.connection(true, false, 100); gate.accept(centered(100));
        gate.connection(false, false, 400);
        gate.connection(true, false, 350); gate.accept(centered(350));
        assertNull(gate.sample()); assertFalse(gate.fresh(450));
        gate.connection(true, false, 500); gate.accept(centered(450));
        assertNull(gate.sample());
        gate.accept(centered(500)); gate.connection(true, false, 750);
        assertTrue(gate.canEnable(800));
    }
}
