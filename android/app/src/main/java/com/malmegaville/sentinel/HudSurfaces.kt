package com.malmegaville.sentinel

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.view.View
import android.view.animation.LinearInterpolator

/**
 * Android twin of the web console's `.holo-panel`: a sharp panel with two
 * clipped corners, a thin neon edge and the two HUD corner brackets. Sized in
 * pixels so callers pass dp-converted values.
 */
class HoloDrawable(
    private val fillColor: Int,
    private val strokeColor: Int,
    private val accentColor: Int = strokeColor,
    private val cutPx: Float = 0f,
    private val strokePx: Float = 1f,
    private val bracketOffsetPx: Float = 6f,
    private val showBrackets: Boolean = true
) : Drawable() {

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = fillColor
    }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = strokeColor
        strokeWidth = strokePx
    }
    private val bracketPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = accentColor
        strokeWidth = strokePx
    }
    private val path = Path()

    override fun draw(canvas: Canvas) {
        val b = bounds
        val width = b.width().toFloat()
        val height = b.height().toFloat()
        if (width <= 0f || height <= 0f) return

        val inset = strokePx / 2f
        val left = b.left + inset
        val top = b.top + inset
        val right = b.right - inset
        val bottom = b.bottom - inset
        val cut = cutPx.coerceAtMost(minOf(width, height) / 3f)

        path.reset()
        if (cut <= 0f) {
            path.addRect(left, top, right, bottom, Path.Direction.CW)
        } else {
            path.moveTo(left + cut, top)
            path.lineTo(right, top)
            path.lineTo(right, bottom - cut)
            path.lineTo(right - cut, bottom)
            path.lineTo(left, bottom)
            path.lineTo(left, top + cut)
            path.close()
        }

        canvas.drawPath(path, fillPaint)
        canvas.drawPath(path, strokePaint)

        if (!showBrackets) return

        val size = 10f * (bracketOffsetPx / 6f)
        val offset = bracketOffsetPx
        // Top-right bracket
        canvas.drawLine(right - offset - size, top + offset, right - offset, top + offset, bracketPaint)
        canvas.drawLine(right - offset, top + offset, right - offset, top + offset + size, bracketPaint)
        // Bottom-left bracket
        canvas.drawLine(left + offset, bottom - offset - size, left + offset, bottom - offset, bracketPaint)
        canvas.drawLine(left + offset, bottom - offset, left + offset + size, bottom - offset, bracketPaint)
    }

    override fun setAlpha(alpha: Int) = Unit

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

/**
 * The shell backdrop: 42dp neon grid plus the same two ambient radial glows
 * the web body paints (green from the top, cyan from the bottom-right).
 */
class HudBackdropDrawable(context: Context) : Drawable() {

    private val density = context.resources.displayMetrics.density
    private val gridStep = 42f * density

    private val basePaint = Paint().apply { color = Color.rgb(0x03, 0x06, 0x05) }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = maxOf(1f, density)
        color = Color.argb(0x0D, 0x00, 0xFF, 0x88)
    }
    private val topGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bottomGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun draw(canvas: Canvas) {
        val b = bounds
        val width = b.width().toFloat()
        val height = b.height().toFloat()
        if (width <= 0f || height <= 0f) return

        canvas.drawRect(b, basePaint)

        topGlowPaint.shader = RadialGradient(
            b.left + width / 2f,
            b.top.toFloat(),
            maxOf(width * 0.8f, height * 0.5f),
            intArrayOf(Color.argb(0x1A, 0x00, 0xFF, 0x88), Color.TRANSPARENT),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(b, topGlowPaint)

        bottomGlowPaint.shader = RadialGradient(
            b.right.toFloat(),
            b.bottom.toFloat(),
            maxOf(width * 0.7f, height * 0.7f),
            intArrayOf(Color.argb(0x14, 0x00, 0xD9, 0xFF), Color.TRANSPARENT),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(b, bottomGlowPaint)

        var x = b.left + gridStep
        while (x < b.right) {
            canvas.drawLine(x, b.top.toFloat(), x, b.bottom.toFloat(), gridPaint)
            x += gridStep
        }
        var y = b.top + gridStep
        while (y < b.bottom) {
            canvas.drawLine(b.left.toFloat(), y, b.right.toFloat(), y, gridPaint)
            y += gridStep
        }
    }

    override fun setAlpha(alpha: Int) = Unit

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.OPAQUE
}

/** Decorative console frame: double hairline inset plus four neon brackets. */
class ConsoleFrameDrawable(context: Context) : Drawable() {

    private val density = context.resources.displayMetrics.density

    private val outerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = maxOf(1f, density)
        color = Color.argb(0x33, 0x00, 0xFF, 0x88)
    }
    private val innerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = maxOf(1f, density)
        color = Color.argb(0x0F, 0x00, 0xFF, 0x88)
    }
    private val bracketPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        color = Color.rgb(0x00, 0xFF, 0x88)
    }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val width = b.width().toFloat()
        val height = b.height().toFloat()
        if (width <= 0f || height <= 0f) return

        val outer = 2f * density
        val inner = 6f * density
        canvas.drawRect(b.left + outer, b.top + outer, b.right - outer, b.bottom - outer, outerPaint)
        canvas.drawRect(b.left + inner, b.top + inner, b.right - inner, b.bottom - inner, innerPaint)

        val size = 12f * density
        val pad = 2f * density
        val left = b.left + pad
        val top = b.top + pad
        val right = b.right - pad
        val bottom = b.bottom - pad

        canvas.drawLine(left, top, left + size, top, bracketPaint)
        canvas.drawLine(left, top, left, top + size, bracketPaint)
        canvas.drawLine(right, top, right - size, top, bracketPaint)
        canvas.drawLine(right, top, right, top + size, bracketPaint)
        canvas.drawLine(left, bottom, left + size, bottom, bracketPaint)
        canvas.drawLine(left, bottom, left, bottom - size, bracketPaint)
        canvas.drawLine(right, bottom, right - size, bottom, bracketPaint)
        canvas.drawLine(right, bottom, right, bottom - size, bracketPaint)
    }

    override fun setAlpha(alpha: Int) = Unit

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

/** The slow green scan band painted over the shell, matching `.scan-overlay`. */
class ScanlineView(context: Context) : View(context) {

    private val bandHeight = 220f * resources.displayMetrics.density
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var offset = -bandHeight
    private var animator: ValueAnimator? = null

    init {
        isClickable = false
        isFocusable = false
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (height <= 0) return

        paint.shader = LinearGradient(
            0f,
            0f,
            0f,
            bandHeight,
            intArrayOf(
                Color.argb(0x00, 0x00, 0xFF, 0x88),
                Color.argb(0x0F, 0x00, 0xFF, 0x88),
                Color.argb(0x00, 0x00, 0xFF, 0x88)
            ),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP
        )

        animator?.cancel()
        animator = ValueAnimator.ofFloat(-bandHeight, height + bandHeight).apply {
            duration = 11000
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                offset = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawRect(0f, offset, width.toFloat(), offset + bandHeight, paint)
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        super.onDetachedFromWindow()
    }
}
