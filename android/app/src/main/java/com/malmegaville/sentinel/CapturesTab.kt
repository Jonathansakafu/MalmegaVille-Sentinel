package com.malmegaville.sentinel

import android.app.Dialog
import android.graphics.BitmapFactory
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

// Android equivalent of CapturesSection.tsx. Deliberately simpler in one
// spot versus the web version: locations show a simple pinned map (our own
// map-viewer.html, in an in-app WebView popup - never hands off to a
// separate Maps app) rather than the web dashboard's full interactive
// route/live-tracking map. USB files are listed with delete but not
// downloadable to the phone (there's little
// reason to copy a stolen device's files onto the relay phone too).
object CapturesTab {

    fun build(activity: DashboardActivity, container: LinearLayout) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val captures = withContext(Dispatchers.IO) { activity.api.fetchCaptures(activity.authToken) }
                container.removeAllViews()
                render(activity, container, captures)
            } catch (e: Exception) {
                container.removeAllViews()
                container.addView(Ui.mutedText(activity, "Failed to load captures: ${e.message}"))
            }
        }
    }

    private fun render(activity: DashboardActivity, container: LinearLayout, captures: JSONArray) {
        val photos = mutableListOf<JSONObject>()
        val locations = mutableListOf<JSONObject>()
        val files = mutableListOf<JSONObject>()
        for (i in 0 until captures.length()) {
            val capture = captures.getJSONObject(i)
            when (capture.optString("captureType")) {
                "webcam_photo" -> photos.add(capture)
                "location" -> locations.add(capture)
                "usb_file", "usb_manifest" -> files.add(capture)
            }
        }

        if (captures.length() == 0) {
            val card = Ui.card(activity)
            card.addView(Ui.sectionTitle(activity, "Captures"))
            card.addView(Ui.spacer(activity, 8))
            card.addView(Ui.mutedText(activity, "No captures recorded yet."))
            container.addView(card)
            return
        }

        if (photos.isNotEmpty()) {
            val card = Ui.card(activity)
            card.addView(Ui.sectionTitle(activity, "Photos"))
            card.addView(Ui.spacer(activity, 10))
            val grid = GridLayout(activity).apply { columnCount = 3 }
            photos.forEachIndexed { index, photo ->
                grid.addView(
                    photoThumbnail(activity, photo) { showPhotoDialog(activity, photo, container) },
                    GridLayout.LayoutParams(GridLayout.spec(index / 3), GridLayout.spec(index % 3, 1f)).apply {
                        width = 0
                        height = Ui.dp(activity, 100)
                        val m = Ui.dp(activity, 4)
                        setMargins(m, m, m, m)
                    }
                )
            }
            card.addView(grid)
            container.addView(card)
        }

        if (locations.isNotEmpty()) {
            val card = Ui.card(activity)
            card.addView(Ui.sectionTitle(activity, "Locations"))
            card.addView(Ui.spacer(activity, 10))
            locations.forEachIndexed { index, location ->
                card.addView(locationRow(activity, location, container))
                if (index < locations.size - 1) card.addView(Ui.spacer(activity, 10))
            }
            container.addView(card)
        }

        if (files.isNotEmpty()) {
            val card = Ui.card(activity)
            card.addView(Ui.sectionTitle(activity, "USB Files"))
            card.addView(Ui.spacer(activity, 10))
            files.forEachIndexed { index, file ->
                card.addView(usbFileRow(activity, file, container))
                if (index < files.size - 1) card.addView(Ui.spacer(activity, 8))
            }
            container.addView(card)
        }
    }

    private fun captureId(capture: JSONObject): String? {
        val id = capture.optString("_id", capture.optString("id", ""))
        return id.ifBlank { null }
    }

    private fun photoThumbnail(activity: DashboardActivity, photo: JSONObject, onClick: () -> Unit): ImageView {
        val imageView = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(Ui.color(activity, R.color.slate_900))
            setOnClickListener { onClick() }
        }
        val id = captureId(photo)
        if (id != null) {
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    val bytes = withContext(Dispatchers.IO) { activity.api.fetchCaptureBytes(activity.authToken, id) }
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap != null) imageView.setImageBitmap(bitmap)
                } catch (e: Exception) {
                    // Best effort - thumbnail just stays blank.
                }
            }
        }
        return imageView
    }

    private fun showPhotoDialog(activity: DashboardActivity, photo: JSONObject, listContainer: LinearLayout) {
        val id = captureId(photo) ?: return
        val dialog = Dialog(activity)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(activity, R.drawable.bg_card)
            val pad = Ui.dp(activity, 16)
            setPadding(pad, pad, pad, pad)
        }

        val imageView = ImageView(activity).apply {
            adjustViewBounds = true
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(activity, 280))
        }
        root.addView(imageView)
        root.addView(Ui.spacer(activity, 12))
        root.addView(Ui.mutedText(activity, photo.optString("capturedAtUtc", "")))
        root.addView(Ui.spacer(activity, 12))

        val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        buttonRow.addView(
            Ui.outlineButton(activity, "Close") { dialog.dismiss() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = Ui.dp(activity, 8) }
        )
        buttonRow.addView(
            Ui.greenButton(activity, "Delete") {
                CoroutineScope(Dispatchers.Main).launch {
                    try {
                        withContext(Dispatchers.IO) { activity.api.deleteCapture(activity.authToken, id) }
                        dialog.dismiss()
                        build(activity, listContainer)
                    } catch (e: Exception) {
                        Toast.makeText(activity, "Delete failed: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        root.addView(buttonRow)

        dialog.setContentView(root)
        dialog.show()

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val bytes = withContext(Dispatchers.IO) { activity.api.fetchCaptureBytes(activity.authToken, id) }
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap != null) imageView.setImageBitmap(bitmap)
            } catch (e: Exception) {
                // Leave the placeholder if it fails to load.
            }
        }
    }

    private fun locationRow(activity: DashboardActivity, location: JSONObject, listContainer: LinearLayout): LinearLayout {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(activity, R.drawable.bg_input)
        }
        val metadata = location.optJSONObject("metadata") ?: JSONObject()
        val lat = metadata.optDouble("latitude", Double.NaN)
        val lon = metadata.optDouble("longitude", Double.NaN)

        row.addView(Ui.mutedText(activity, location.optString("capturedAtUtc", "")))
        row.addView(Ui.spacer(activity, 4))

        if (lat.isNaN() || lon.isNaN()) {
            row.addView(Ui.bodyText(activity, "Location unavailable for this attempt."))
        } else {
            row.addView(Ui.bodyText(activity, "%.5f, %.5f".format(lat, lon)))
            row.addView(Ui.spacer(activity, 8))
            val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
            buttonRow.addView(
                Ui.outlineButton(activity, "View on Map") { showLocationMapDialog(activity, lat, lon) },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = Ui.dp(activity, 8) }
            )
            buttonRow.addView(deleteButton(activity, location, listContainer))
            row.addView(buttonRow)
        }
        return row
    }

    // Shows the location on our own map-viewer.html (Leaflet + OpenStreetMap,
    // same as the web dashboard) in a WebView inside a Dialog - stays inside
    // this app the whole time, no external Maps app involved.
    @Suppress("SetJavaScriptEnabled")
    private fun showLocationMapDialog(activity: DashboardActivity, lat: Double, lon: Double) {
        val webView = WebView(activity).apply {
            settings.javaScriptEnabled = true
            loadUrl("${SentinelPrefs.WEB_APP_BASE_URL}/map-viewer.html?lat=$lat&lon=$lon")
        }

        val dialog = Dialog(activity)
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(activity, R.drawable.bg_card)
            val pad = Ui.dp(activity, 12)
            setPadding(pad, pad, pad, pad)
        }
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(activity, 420)))
        root.addView(Ui.spacer(activity, 12))
        root.addView(Ui.outlineButton(activity, "Close") { dialog.dismiss() })

        dialog.setContentView(root)
        dialog.show()
    }

    private fun usbFileRow(activity: DashboardActivity, file: JSONObject, listContainer: LinearLayout): LinearLayout {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(activity, R.drawable.bg_input)
        }
        row.addView(
            TextView(activity).apply {
                text = file.optString("originalFileName", "Unknown")
                setTextColor(Ui.color(activity, R.color.text_primary))
                textSize = 14f
            }
        )
        row.addView(Ui.spacer(activity, 4))
        val sizeBytes = file.optLong("sizeBytes", 0)
        val skipped = file.optBoolean("skipped", false)
        val skipReason = file.optString("skipReason", "unknown")
        row.addView(
            Ui.mutedText(
                activity,
                "${if (sizeBytes > 0) "%.1f KB".format(sizeBytes / 1024.0) else "—"} · ${if (skipped) "Skipped ($skipReason)" else "Copied"}"
            )
        )
        row.addView(Ui.spacer(activity, 6))
        val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
        buttonRow.addView(deleteButton(activity, file, listContainer))
        row.addView(buttonRow)
        return row
    }

    private fun deleteButton(activity: DashboardActivity, capture: JSONObject, listContainer: LinearLayout): TextView {
        val id = captureId(capture)
        return TextView(activity).apply {
            text = "Delete"
            setTextColor(Ui.color(activity, R.color.status_error))
            textSize = 13f
            setPadding(Ui.dp(activity, 8), Ui.dp(activity, 4), Ui.dp(activity, 8), Ui.dp(activity, 4))
            setOnClickListener {
                if (id == null) return@setOnClickListener
                android.app.AlertDialog.Builder(activity)
                    .setMessage("Delete this capture permanently? This cannot be undone.")
                    .setPositiveButton("Delete") { _, _ ->
                        CoroutineScope(Dispatchers.Main).launch {
                            try {
                                withContext(Dispatchers.IO) { activity.api.deleteCapture(activity.authToken, id) }
                                build(activity, listContainer)
                            } catch (e: Exception) {
                                Toast.makeText(activity, "Delete failed: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
        }
    }
}
