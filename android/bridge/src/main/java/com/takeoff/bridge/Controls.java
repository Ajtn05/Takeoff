package com.takeoff.bridge;

import org.json.JSONException;
import org.json.JSONObject;

public final class Controls {
    public final double climb, yaw, forward, right, gimbal;

    public Controls(double climb, double yaw, double forward, double right, double gimbal) {
        this.climb = climb;
        this.yaw = yaw;
        this.forward = forward;
        this.right = right;
        this.gimbal = gimbal;
    }

    public static Controls neutral() { return new Controls(0, 0, 0, 0, 0); }

    public boolean isNeutral() {
        return climb == 0 && yaw == 0 && forward == 0 && right == 0 && gimbal == 0;
    }

    public JSONObject json() {
        try {
            return new JSONObject().put("climb", climb).put("yaw", yaw).put("forward", forward)
                    .put("right", right).put("gimbal", gimbal);
        } catch (JSONException error) { throw new IllegalArgumentException(error); }
    }
}
