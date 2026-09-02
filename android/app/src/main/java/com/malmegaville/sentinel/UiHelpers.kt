package com.malmegaville.sentinel

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

// Shared building blocks for the Dashboard/Captures/Settings tabs, kept
// consistent with the web dashboard's card/badge language (StatusBadge.tsx,
// StatCard.tsx, DeviceCard.tsx) so severity/tone colors mean the same thing
// in both places.
object Ui {
    fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    fun color(context: Context, resId: Int): Int = ContextCompat.getColor(context, resId)

    fun card(context: Context): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = ContextCompat.getDrawable(context, R.drawable.bg_card)
        val pad = dp(context, 18)
        setPadding(pad, pad, pad, pad)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(context, 16)
        }
    }

    fun sectionTitle(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text
        setTextColor(color(context, R.color.text_primary))
        textSize = 17f
        setTypeface(typeface, Typeface.BOLD)
    }

    fun mutedText(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text
        setTextColor(color(context, R.color.text_muted))
        textSize = 13f
    }

    fun bodyText(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text
        setTextColor(color(context, R.color.slate_300))
        textSize = 14f
    }

    fun spacer(context: Context, heightDp: Int): View = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(context, heightDp))
    }

    fun pillBackground(colorInt: Int, alpha: Int = 38): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 999f
        setColor(Color.argb(alpha, Color.red(colorInt), Color.green(colorInt), Color.blue(colorInt)))
    }

    fun badge(context: Context, label: String, colorInt: Int): TextView = TextView(context).apply {
        text = label.uppercase()
        setTextColor(colorInt)
        textSize = 11f
        setTypeface(typeface, Typeface.BOLD)
        letterSpacing = 0.08f
        val padH = dp(context, 12)
        val padV = dp(context, 5)
        setPadding(padH, padV, padH, padV)
        background = pillBackground(colorInt)
    }

    // Mirrors StatusBadge.tsx's severityTone() mapping exactly.
    fun severityColor(context: Context, severity: String): Int = when (severity.lowercase()) {
        "informational" -> color(context, R.color.slate_300)
        "low" -> color(context, R.color.sky_400)
        "medium" -> color(context, R.color.amber_400)
        "high", "critical" -> color(context, R.color.rose_400)
        else -> color(context, R.color.amber_400)
    }

    fun greenButton(context: Context, label: String, onClick: () -> Unit) = android.widget.Button(context).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.BLACK)
        setTypeface(typeface, Typeface.BOLD)
        background = ContextCompat.getDrawable(context, R.drawable.bg_button_green)
        setOnClickListener { onClick() }
    }

    fun outlineButton(context: Context, label: String, onClick: () -> Unit) = android.widget.Button(context).apply {
        text = label
        isAllCaps = false
        setTextColor(color(context, R.color.text_primary))
        background = ContextCompat.getDrawable(context, R.drawable.bg_input)
        setOnClickListener { onClick() }
    }

    fun rowSpaceBetween(context: Context): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }
}
