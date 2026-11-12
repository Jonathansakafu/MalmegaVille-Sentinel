package com.malmegaville.sentinel

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

// Full-screen access-granted / access-denied sweep, the Android counterpart of
// the web console's BootOverlay. Purely visual and short-lived; it is skipped
// for users who turned animations off at the OS level.
object SentinelCinematic {

    fun show(activity: Activity, granted: Boolean) {
        if (android.provider.Settings.Global.getFloat(
                activity.contentResolver,
                android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
            ) == 0f
        ) return

        val accent = ContextCompat.getColor(activity, if (granted) R.color.brand_green else R.color.brand_danger)
        val root = (activity.findViewById<View>(android.R.id.content) as? ViewGroup) ?: return

        val overlay = FrameLayout(activity).apply {
            setBackgroundColor(ContextCompat.getColor(activity, R.color.brand_dark))
            isClickable = true
            alpha = 0f
        }

        val column = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { gravity = Gravity.CENTER }
            setPadding(Ui.dp(activity, 32), 0, Ui.dp(activity, 32), 0)
        }

        column.addView(
            TextView(activity).apply {
                text = "MALMEGAVILLE SENTINEL"
                setTextColor(accent)
                textSize = 11f
                letterSpacing = 0.32f
                typeface = Typeface.MONOSPACE
                gravity = Gravity.CENTER
            }
        )

        column.addView(
            TextView(activity).apply {
                text = if (granted) "ACCESS GRANTED" else "ACCESS DENIED"
                setTextColor(accent)
                textSize = 26f
                letterSpacing = 0.14f
                typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, Ui.dp(activity, 14), 0, Ui.dp(activity, 14))
            }
        )

        column.addView(
            View(activity).apply {
                layoutParams = LinearLayout.LayoutParams(Ui.dp(activity, 120), Ui.dp(activity, 1))
                setBackgroundColor(accent)
            }
        )

        column.addView(
            TextView(activity).apply {
                text = if (granted) "operator session linked · telemetry encrypted" else "handshake rejected · check credentials"
                setTextColor(ContextCompat.getColor(activity, R.color.text_muted))
                textSize = 12f
                typeface = Typeface.MONOSPACE
                gravity = Gravity.CENTER
                setPadding(0, Ui.dp(activity, 14), 0, 0)
            }
        )

        overlay.addView(column)
        root.addView(
            overlay,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )

        overlay.animate().alpha(1f).setDuration(180).withEndAction {
            overlay.postDelayed({
                overlay.animate().alpha(0f).setDuration(240).withEndAction {
                    (overlay.parent as? ViewGroup)?.removeView(overlay)
                }
            }, if (granted) 1000 else 1300)
        }.start()
    }
}
