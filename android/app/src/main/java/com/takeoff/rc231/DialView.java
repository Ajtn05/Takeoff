package com.takeoff.rc231;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;

/** The physical camera dial, displayed on a centered scale. */
public final class DialView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float value;
    private boolean available;
    public DialView(Context context, AttributeSet attrs) { super(context, attrs); setFocusable(true); }
    void position(double value, boolean available) {
        this.value = (float) Math.max(-1, Math.min(1, value));
        this.available = available;
        setContentDescription(available ? "Camera tilt " + Math.round(this.value * 100) + " percent. Use the remote camera dial." : "Camera dial. No live readings.");
        invalidate();
    }
    @Override protected void onDraw(Canvas canvas) {
        float dp = getResources().getDisplayMetrics().density;
        float y = getHeight() / 2f, left = 6 * dp, right = getWidth() - 6 * dp, center = getWidth() / 2f;
        paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeWidth(3 * dp); paint.setColor(0xFF36505A);
        canvas.drawLine(left, y, right, y, paint);
        float position = center + value * (right - left) / 2f;
        paint.setColor(available ? 0xFFBDEDCA : 0xFF637680);
        canvas.drawLine(center, y, position, y, paint);
        paint.setStrokeWidth(dp); canvas.drawLine(center, y - 5 * dp, center, y + 5 * dp, paint);
        canvas.drawCircle(position, y, 5 * dp, paint);
    }
}
