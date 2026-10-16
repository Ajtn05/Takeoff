package com.takeoff.bridge;

/** One complete SDK hardware frame. Time is monotonic, never wall-clock time. */
public final class RcSample {
    public static final int FULL_SCALE = 660;
    public static final int DEAD_ZONE = 20;
    public final int leftX, leftY, rightX, rightY, dial;
    public final boolean shutter, record, goHome, pause, function;
    public final String flightMode;
    public final long receivedAt;

    public RcSample(int leftX, int leftY, int rightX, int rightY, int dial,
                    boolean shutter, boolean record, boolean goHome, boolean pause,
                    boolean function, String flightMode, long receivedAt) {
        this.leftX = leftX;
        this.leftY = leftY;
        this.rightX = rightX;
        this.rightY = rightY;
        this.dial = dial;
        this.shutter = shutter;
        this.record = record;
        this.goHome = goHome;
        this.pause = pause;
        this.function = function;
        this.flightMode = flightMode;
        this.receivedAt = receivedAt;
    }

    public static double axis(int raw) {
        if (Math.abs((long) raw) <= DEAD_ZONE) return 0;
        double magnitude = Math.min(FULL_SCALE, Math.abs((long) raw));
        return Math.copySign((magnitude - DEAD_ZONE) / (FULL_SCALE - DEAD_ZONE), raw);
    }

    public Controls controls(int mode, boolean invertDial) {
        double lx = axis(leftX), ly = axis(leftY), rx = axis(rightX), ry = axis(rightY);
        double gimbal = axis(dial) * (invertDial ? -1 : 1);
        switch (mode) {
            case 1: return new Controls(ry, lx, ly, rx, gimbal);
            case 2: return new Controls(ly, lx, ry, rx, gimbal);
            case 3: return new Controls(ry, rx, ly, lx, gimbal);
            default: throw new IllegalArgumentException("Choose stick mode 1, 2 or 3.");
        }
    }

    public boolean buttonsReleased() { return !shutter && !record && !goHome && !pause && !function; }
}
