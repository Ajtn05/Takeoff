package com.takeoff.bridge;

/** Hardware values can be change-driven; link checks supply their own heartbeat. */
public final class InputGate {
    public static final long RC_TIMEOUT_MS = 500;
    public static final long CENTER_HOLD_MS = 300;
    private RcSample sample;
    private boolean connected;
    private boolean aircraftConnected;
    private long connectionCheckedAt = -1;
    private long resetAt = -1;
    private long centeredSince = -1;
    private int mode = 2;
    private boolean invertDial;

    public void connection(boolean connected, boolean aircraftConnected, long checkedAt) {
        if (checkedAt < connectionCheckedAt) return;
        long lastLiveAt = sample == null ? connectionCheckedAt : Math.max(connectionCheckedAt, sample.receivedAt);
        boolean monitoringGap = lastLiveAt >= 0 && checkedAt - lastLiveAt > RC_TIMEOUT_MS;
        if (!connected || this.connected != connected || this.aircraftConnected != aircraftConnected || monitoringGap) {
            sample = null;
            centeredSince = -1;
            resetAt = checkedAt;
        }
        this.connected = connected;
        this.aircraftConnected = aircraftConnected;
        connectionCheckedAt = checkedAt;
    }

    public void configure(int mode, boolean invertDial) {
        if (mode < 1 || mode > 3) throw new IllegalArgumentException("Invalid stick mode");
        this.mode = mode;
        this.invertDial = invertDial;
        centeredSince = sample != null && sample.controls(mode, invertDial).isNeutral() && sample.buttonsReleased()
                ? Math.max(connectionCheckedAt, sample.receivedAt) : -1;
    }

    public void accept(RcSample next) {
        if (!connected || aircraftConnected || next.receivedAt < resetAt) return;
        if (sample != null && next.receivedAt < sample.receivedAt) return;
        if (sample == null || next.receivedAt - Math.max(connectionCheckedAt, sample.receivedAt) > RC_TIMEOUT_MS)
            centeredSince = -1;
        sample = next;
        if (next.controls(mode, invertDial).isNeutral() && next.buttonsReleased()) {
            if (centeredSince < 0) centeredSince = next.receivedAt;
        } else centeredSince = -1;
    }

    public RcSample sample() { return sample; }
    public boolean fresh(long now) {
        if (!connected || aircraftConnected || sample == null) return false;
        long lastLiveAt = Math.max(connectionCheckedAt, sample.receivedAt);
        return now >= lastLiveAt && now - lastLiveAt <= RC_TIMEOUT_MS;
    }
    public boolean canEnable(long now) {
        return fresh(now) && centeredSince >= 0 && now - centeredSince >= CENTER_HOLD_MS &&
                sample.controls(mode, invertDial).isNeutral() && sample.buttonsReleased();
    }
    public Controls controls() { return sample == null ? Controls.neutral() : sample.controls(mode, invertDial); }
    public String reason(long now) {
        if (aircraftConnected) return "Switch the drone off before using Takeoff.";
        if (!connected) return "Connect and power on your RC231 remote.";
        if (sample == null) return "Move and release both sticks once to read their centered position.";
        if (!fresh(now)) return "Waiting for the remote connection. Check the USB cable.";
        if (!sample.controls(mode, invertDial).isNeutral()) return "Center both sticks and release the camera dial.";
        if (!sample.buttonsReleased()) return "Release all remote buttons before enabling controls.";
        if (!canEnable(now)) return "Hold both sticks centered for a moment.";
        return "Remote ready. Enable controls when the laptop is paired.";
    }
}
