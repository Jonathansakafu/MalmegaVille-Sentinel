package com.malmegaville.sentinel

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Spannable
import android.text.SpannableString
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat

// Shared HUD building blocks for the Android agent, kept token-for-token in
// step with the web console (AppShell.tsx, AuthCard.tsx, index.css .holo-panel)
// and the Windows agent (App.xaml, HoloPanel.cs): sharp cut-corner panels with
// neon edges and corner brackets, mono HUD labels, 42dp grid backdrop.
object Ui {

    private val monoCache = HashMap<Int, Typeface>()

    fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    fun color(context: Context, resId: Int): Int = ContextCompat.getColor(context, resId)

    fun mono(context: Context, weight: Int = 400): Typeface = monoCache.getOrPut(weight) {
        val fontRes = when {
            weight >= 700 -> R.font.jetbrains_mono_bold
            weight >= 600 -> R.font.jetbrains_mono_semibold
            else -> R.font.jetbrains_mono_regular
        }
        ResourcesCompat.getFont(context, fontRes) ?: Typeface.MONOSPACE
    }

    fun withAlpha(colorInt: Int, alpha: Int): Int =
        Color.argb(alpha, Color.red(colorInt), Color.green(colorInt), Color.blue(colorInt))

    // --- Surfaces -----------------------------------------------------------

    fun panelDrawable(context: Context, accent: Int = color(context, R.color.brand_green)): HoloDrawable =
        HoloDrawable(
            fillColor = color(context, R.color.brand_panel_alpha),
            strokeColor = withAlpha(accent, 0x2A),
            accentColor = withAlpha(accent, 0xA6),
            cutPx = dp(context, 14).toFloat(),
            strokePx = 1f,
            bracketOffsetPx = dp(context, 6).toFloat()
        )

    fun insetDrawable(context: Context, accent: Int = color(context, R.color.brand_green)): HoloDrawable =
        HoloDrawable(
            fillColor = withAlpha(color(context, R.color.brand_dark), 0x80),
            strokeColor = withAlpha(accent, 0x26),
            accentColor = withAlpha(accent, 0x66),
            cutPx = dp(context, 8).toFloat(),
            strokePx = 1f,
            bracketOffsetPx = dp(context, 5).toFloat(),
            showBrackets = false
        )

    fun inputDrawable(context: Context): HoloDrawable =
        HoloDrawable(
            fillColor = color(context, R.color.input_background),
            strokeColor = color(context, R.color.input_border),
            accentColor = color(context, R.color.input_border),
            cutPx = 0f,
            strokePx = 1f,
            showBrackets = false
        )

    fun card(context: Context): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = panelDrawable(context)
        val pad = dp(context, 16)
        setPadding(pad, pad, pad, pad)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(context, 14) }
    }

    fun divider(context: Context): View = View(context).apply {
        setBackgroundColor(withAlpha(color(context, R.color.brand_green), 0x1F))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, maxOf(1, dp(context, 1)))
    }

    // --- Typography ---------------------------------------------------------

    fun hudLabel(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text.uppercase()
        typeface = mono(context, 500)
        textSize = 9.5f
        letterSpacing = 0.18f
        setTextColor(withAlpha(color(context, R.color.hud_label), 0xC4))
    }

    fun monoText(
        context: Context,
        text: String,
        size: Float = 10f,
        colorInt: Int = color(context, R.color.text_muted),
        bold: Boolean = false
    ): TextView = TextView(context).apply {
        this.text = text
        typeface = mono(context, if (bold) 700 else 400)
        textSize = size
        letterSpacing = 0.08f
        setTextColor(colorInt)
        includeFontPadding = false
    }

    fun monoValue(
        context: Context,
        text: String,
        size: Float = 22f,
        colorInt: Int = color(context, R.color.text_primary)
    ): TextView = TextView(context).apply {
        this.text = text
        typeface = mono(context, 700)
        textSize = size
        letterSpacing = 0.02f
        setTextColor(colorInt)
        includeFontPadding = false
    }

    fun sectionTitle(context: Context, text: String): TextView = TextView(context).apply {
        val marker = SpannableString("▍ ")
        marker.setSpan(
            ForegroundColorSpan(color(context, R.color.brand_green)),
            0,
            marker.length,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        val title = SpannableString(text.uppercase())
        title.setSpan(
            ForegroundColorSpan(color(context, R.color.text_primary)),
            0,
            title.length,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        setText(TextUtils.concat(marker, title))
        typeface = mono(context, 600)
        textSize = 12.5f
        letterSpacing = 0.12f
        includeFontPadding = false
    }

    fun mutedText(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text
        textSize = 12.5f
        setTextColor(color(context, R.color.text_muted))
        setLineSpacing(0f, 1.15f)
    }

    fun bodyText(context: Context, text: String): TextView = TextView(context).apply {
        this.text = text
        textSize = 13.5f
        setTextColor(color(context, R.color.slate_300))
        setLineSpacing(0f, 1.15f)
    }

    fun spacer(context: Context, heightDp: Int): View = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(context, heightDp))
    }

    // --- Badges -------------------------------------------------------------

    fun pillBackground(colorInt: Int, alpha: Int = 38): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 0f
        setColor(Color.argb(alpha, Color.red(colorInt), Color.green(colorInt), Color.blue(colorInt)))
    }

    // Sharp outlined chip, matching StatusBadge/severity pills in the console.
    fun badge(context: Context, label: String, colorInt: Int): TextView = TextView(context).apply {
        text = label.uppercase()
        setTextColor(colorInt)
        typeface = mono(context, 600)
        textSize = 8.5f
        letterSpacing = 0.14f
        includeFontPadding = false
        val padH = dp(context, 6)
        val padV = dp(context, 3)
        setPadding(padH, padV, padH, padV)
        background = HoloDrawable(
            fillColor = withAlpha(colorInt, 0x1A),
            strokeColor = withAlpha(colorInt, 0x66),
            accentColor = colorInt,
            cutPx = 0f,
            showBrackets = false
        )
    }

    // Mirrors StatusBadge.tsx's severityTone() mapping exactly.
    fun severityColor(context: Context, severity: String): Int = when (severity.lowercase()) {
        "informational" -> color(context, R.color.slate_300)
        "low" -> color(context, R.color.sky_400)
        "medium" -> color(context, R.color.amber_400)
        "high", "critical" -> color(context, R.color.rose_400)
        else -> color(context, R.color.amber_400)
    }

    // --- Controls -----------------------------------------------------------

    private fun styledButton(
        context: Context,
        label: String,
        fill: Int,
        stroke: Int,
        textColor: Int,
        bold: Boolean,
        onClick: () -> Unit
    ): Button = Button(context).apply {
        text = label.uppercase()
        isAllCaps = false
        typeface = mono(context, if (bold) 700 else 600)
        textSize = 10f
        letterSpacing = 0.16f
        includeFontPadding = false
        setTextColor(textColor)
        backgroundTintList = null
        stateListAnimator = null
        minHeight = 0
        minWidth = 0
        gravity = Gravity.CENTER
        setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10))
        background = HoloDrawable(
            fillColor = fill,
            strokeColor = stroke,
            accentColor = stroke,
            cutPx = dp(context, 8).toFloat(),
            strokePx = 1f,
            bracketOffsetPx = 0f,
            showBrackets = false
        )
        setOnClickListener {
            SentinelSound.click(context)
            onClick()
        }
    }

    fun primaryButton(context: Context, label: String, onClick: () -> Unit): Button {
        val green = color(context, R.color.brand_green)
        return styledButton(context, label, withAlpha(green, 0x1F), green, green, bold = true, onClick = onClick)
    }

    // Kept under the original name so every existing tab keeps compiling.
    fun greenButton(context: Context, label: String, onClick: () -> Unit): Button = primaryButton(context, label, onClick)

    fun outlineButton(context: Context, label: String, onClick: () -> Unit): Button {
        val green = color(context, R.color.brand_green)
        return styledButton(
            context,
            label,
            fill = Color.TRANSPARENT,
            stroke = withAlpha(green, 0x4D),
            textColor = color(context, R.color.slate_300),
            bold = false,
            onClick = onClick
        )
    }

    fun dangerButton(context: Context, label: String, onClick: () -> Unit): Button {
        val danger = color(context, R.color.brand_danger)
        return styledButton(context, label, withAlpha(danger, 0x1A), withAlpha(danger, 0x66), danger, bold = false, onClick = onClick)
    }

    fun navDrawable(context: Context, active: Boolean): HoloDrawable {
        val green = color(context, R.color.brand_green)
        return if (active) {
            HoloDrawable(green, green, green, dp(context, 8).toFloat(), 1f, 0f, false)
        } else {
            HoloDrawable(Color.TRANSPARENT, withAlpha(green, 0x33), green, dp(context, 8).toFloat(), 1f, 0f, false)
        }
    }

    fun navTextColor(context: Context, active: Boolean): Int =
        if (active) Color.BLACK else color(context, R.color.hud_label)

    fun navButton(context: Context, label: String, active: Boolean, onClick: () -> Unit): Button = Button(context).apply {
        text = label.uppercase()
        isAllCaps = false
        typeface = mono(context, 700)
        textSize = 9f
        letterSpacing = 0.16f
        includeFontPadding = false
        setTextColor(navTextColor(context, active))
        backgroundTintList = null
        stateListAnimator = null
        minHeight = 0
        minWidth = 0
        gravity = Gravity.CENTER
        setPadding(0, dp(context, 8), 0, dp(context, 8))
        background = navDrawable(context, active)
        setOnClickListener {
            SentinelSound.click(context)
            onClick()
        }
    }

    fun textInput(context: Context, hintText: String, inputType: Int): EditText = EditText(context).apply {
        hint = hintText
        this.inputType = inputType
        typeface = mono(context, 400)
        textSize = 12f
        setHintTextColor(color(context, R.color.text_hint))
        setTextColor(color(context, R.color.text_primary))
        includeFontPadding = false
        background = inputDrawable(context)
        setPadding(dp(context, 12), dp(context, 12), dp(context, 12), dp(context, 12))
    }

    fun rowSpaceBetween(context: Context): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }
}
