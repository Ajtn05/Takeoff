package com.takeoff.rc231;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

/** Labeled, read-only display of a physical stick. */
public final class StickView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float x, y;
    private boolean available;
    private String side = "", horizontal = "Yaw", vertical = "Climb";
    public StickView(Context context, AttributeSet attrs) { super(context, attrs); setFocusable(true); }
    void axes(String side, String horizontal, String vertical) {
        this.side = side; this.horizontal = horizontal; this.vertical = vertical;
        describe(); invalidate();
    }
    void position(int x, int y, boolean available) {
        float nextX = Math.max(-1, Math.min(1, x / 660f)), nextY = Math.max(-1, Math.min(1, y / 660f));
        if (this.x == nextX && this.y == nextY && this.available == available) return;
        this.x = nextX; this.y = nextY; this.available = available;
        describe(); invalidate();
    }
    private void describe() {
        setContentDescription(side + " stick. " + horizontal + " left and right, " + vertical + " up and down. " +
                (available ? horizontal + " " + Math.round(x * 100) + " percent, " + vertical + " " + Math.round(y * 100) + " percent." : "No live readings."));
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float dp = getResources().getDisplayMetrics().density, sp = getResources().getDisplayMetrics().scaledDensity;
        float cx = getWidth() / 2f, cy = getHeight() / 2f, radius = Math.min(cx, cy) - 5 * dp;
        if (radius <= 0) return;
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new RadialGradient(cx, cy, radius, new int[]{0xFF22343E, 0xFF14232D}, null, Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, radius, paint); paint.setShader(null);
        paint.setColor(0xFF3F575F); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp);
        canvas.drawCircle(cx, cy, radius, paint);
        paint.setColor(0xFF36505A);
        canvas.drawLine(cx - radius * .58f, cy, cx + radius * .58f, cy, paint);
        canvas.drawLine(cx, cy - radius * .58f, cx, cy + radius * .58f, paint);
        paint.setPathEffect(new DashPathEffect(new float[]{3 * dp, 4 * dp}, 0));
        canvas.drawCircle(cx, cy, radius * .45f, paint); paint.setPathEffect(null);
        paint.setStyle(Paint.Style.FILL); paint.setTextAlign(Paint.Align.CENTER); paint.setColor(0xFFA2B7BA);
        paint.setTextSize(9 * sp);
        canvas.drawText("Climb".equals(vertical) ? "ASCEND" : "FORWARD", cx, cy - radius * .69f, paint);
        canvas.drawText("Climb".equals(vertical) ? "DESCEND" : "BACK", cx, cy + radius * .81f, paint);
        paint.setTextSize(14 * sp);
        canvas.drawText("←", cx - radius * .77f, cy + 5 * sp, paint);
        canvas.drawText("→", cx + radius * .77f, cy + 5 * sp, paint);
        float px = cx + x * radius * .6f, py = cy - y * radius * .6f;
        paint.setColor(available ? 0x334F9E79 : 0x223F575F); canvas.drawCircle(px, py, 14 * dp, paint);
        paint.setColor(available ? 0xFFBDEDCA : 0xFF637680); canvas.drawCircle(px, py, 8 * dp, paint);
        paint.setColor(available ? 0xFF173129 : 0xFF2A3941); canvas.drawCircle(px, py, 3 * dp, paint);
    }
}
