package com.malmegaville.sentinel

import android.app.Dialog
import android.graphics.BitmapFactory
import android.text.TextUtils
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// Android equivalent of CapturesSection.tsx, running on the shared HUD
// surfaces: sharp holo panels, mono HUD labels and the same photo/location/USB
// grouping the web console shows.
object CapturesTab {

    // The backend stores and sends capturedAtUtc as a UTC ISO-8601 instant.
    // The web dashboard already converts it to the viewer's local time
    // (new Date(...).toLocaleString()) - this app was printing the raw UTC
    // string as-is, which reads as "wrong" to anyone outside UTC (e.g. an
    // event at 09:47 local in UTC+3 showed as "06:47").
    private val localFormatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withZone(ZoneId.systemDefault())

    private fun formatCapturedAt(isoUtc: String): String {
        if (isoUtc.isBlank()) return ""
        return runCatching { localFormatter.format(Instant.parse(isoUtc)) }.getOrDefault(isoUtc)
    }

    fun build(activity: DashboardActivity, container: LinearLayout) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val captures = withContext(Dispatchers.IO) { activity.api.fetchCaptures(activity.authToken) }
                container.removeAllViews()
                render(activity, container, captures)
            } catch (e: Exception) {
                container.removeAllViews()
                val card = Ui.card(activity)
                card.addView(Ui.sectionTitle(activity, "Captures"))
                card.addView(Ui.spacer(activity, 8))
                card.addView(Ui.mutedText(activity, "Failed to load captures: ${e.message}"))
                container.addView(card)
            }
        }
    }

    private fun render(activity: DashboardActivity, container: LinearLayout, captures: JSONArray) {
        fun dp(value: Int) = Ui.dp(activity, value)
        val green = Ui.color(activity, R.color.brand_green)

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
            card.addView(Ui.spacer(activity, 4))
            card.addView(
                Ui.monoText(activity, "NO EVIDENCE RECORDED", 10f, Ui.color(activity, R.color.hud_label), bold = true).apply {
                    letterSpacing = 0.14f
                    setPadding(0, dp(14), 0, 0)
                }
            )
            card.addView(
                Ui.mutedText(activity, "Photos, locations and USB file reports appear here after an agent check-in.")
                    .apply { setPadding(0, dp(4), 0, dp(10)) }
            )
            container.addView(card)
            return
        }

        if (photos.isNotEmpty()) {
            val card = Ui.card(activity)
            val header = Ui.rowSpaceBetween(activity)
            header.addView(
                Ui.sectionTitle(activity, "Photos"),
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
            header.addView(Ui.badge(activity, "${photos.size} photos", green))
            card.addView(header)
            card.addView(Ui.spacer(activity, 10))

            // Two columns on a phone keeps the face/detail legible; the web
            // grid goes denser because it has a laptop-width panel.
            val grid = GridLayout(activity).apply { columnCount = 2 }
            photos.forEachIndexed { index, photo ->
                grid.addView(
                    photoThumbnail(activity, photo) { showPhotoDialog(activity, photo, container, locations) },
                    GridLayout.LayoutParams(GridLayout.spec(index / 2), GridLayout.spec(index % 2, 1f)).apply {
                        width = 0
                        height = dp(138)
                        val m = dp(4)
                        setMargins(m, m, m, m)
                    }
                )
            }
            card.addView(grid)
            container.addView(card)
        }

        if (locations.isNotEmpty()) {
            val card = Ui.card(activity)
            val header = Ui.rowSpaceBetween(activity)
            header.addView(
                Ui.sectionTitle(activity, "Locations"),
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
            header.addView(Ui.badge(activity, "${locations.size} fixes", Ui.color(activity, R.color.brand_cyan)))
            card.addView(header)
            card.addView(Ui.spacer(activity, 8))
            locations.forEachIndexed { index, location ->
                card.addView(locationRow(activity, location, container))
                if (index < locations.size - 1) card.addView(Ui.spacer(activity, 8))
            }
            container.addView(card)
        }

        if (files.isNotEmpty()) {
            val card = Ui.card(activity)
            val header = Ui.rowSpaceBetween(activity)
            header.addView(
                Ui.sectionTitle(activity, "USB files"),
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
            header.addView(Ui.badge(activity, "${files.size} copies", Ui.color(activity, R.color.brand_amber)))
            card.addView(header)
            card.addView(Ui.spacer(activity, 8))
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

    private fun photoThumbnail(activity: DashboardActivity, photo: JSONObject, onClick: () -> Unit): FrameLayout {
        fun dp(value: Int) = Ui.dp(activity, value)
        val frame = FrameLayout(activity).apply {
            background = HoloDrawable(
                fillColor = 0x00000000,
                strokeColor = Ui.withAlpha(Ui.color(activity, R.color.brand_green), 0x33),
                accentColor = Ui.color(activity, R.color.brand_green),
                cutPx = 0f,
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
            setPadding(1, 1, 1, 1)
            isClickable = true
            setOnClickListener {
                SentinelSound.click(activity)
                onClick()
            }
        }
        val imageView = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(Ui.color(activity, R.color.brand_dark))
        }
        frame.addView(imageView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val placeholder = Ui.monoText(activity, "LOADING…", 8f, Ui.color(activity, R.color.text_hint)).apply {
            letterSpacing = 0.16f
            gravity = Gravity.CENTER
        }
        frame.addView(placeholder, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val id = captureId(photo)
        if (id != null) {
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    val bytes = withContext(Dispatchers.IO) { activity.api.fetchCaptureBytes(activity.authToken, id) }
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap != null) {
                        imageView.setImageBitmap(bitmap)
                        placeholder.visibility = View.GONE
                    } else {
                        placeholder.text = "UNAVAILABLE"
                        Log.e("SentinelCaptures", "Thumbnail decode returned null for capture $id (${bytes.size} bytes)")
                    }
                } catch (e: Exception) {
                    placeholder.text = "UNAVAILABLE"
                    Log.e("SentinelCaptures", "Thumbnail load failed for capture $id", e)
                }
            }
        }
        return frame
    }

    // The self-monitoring worker captures a photo and its location in the
    // same lost-check cycle, stamping both with the exact same
    // capturedAtUtc - that's what ties a photo to "where it was taken" here,
    // mirroring the sessionId-based grouping the web dashboard uses for the
    // desktop agent's USB captures (which the phone's own captures don't
    // carry a sessionId for). Falls back to the closest location within 5
    // minutes if the timestamps aren't an exact match.
    private fun findMatchingLocation(photo: JSONObject, locations: List<JSONObject>): JSONObject? {
        val photoTime = runCatching { Instant.parse(photo.optString("capturedAtUtc", "")) }.getOrNull() ?: return null
        var best: JSONObject? = null
        var bestDiffSeconds = 5 * 60L
        for (location in locations) {
            val metadata = location.optJSONObject("metadata") ?: continue
            if (metadata.optDouble("latitude", Double.NaN).isNaN() || metadata.optDouble("longitude", Double.NaN).isNaN()) continue
            val locationTime = runCatching { Instant.parse(location.optString("capturedAtUtc", "")) }.getOrNull() ?: continue
            val diff = Math.abs(java.time.Duration.between(photoTime, locationTime).seconds)
            if (diff <= bestDiffSeconds) {
                bestDiffSeconds = diff
                best = location
            }
        }
        return best
    }

    private fun showPhotoDialog(activity: DashboardActivity, photo: JSONObject, listContainer: LinearLayout, locations: List<JSONObject> = emptyList()) {
        fun dp(value: Int) = Ui.dp(activity, value)
        val id = captureId(photo) ?: return
        val dialog = Dialog(activity)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val shell = FrameLayout(activity).apply {
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.panelDrawable(activity)
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        shell.addView(
            root,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        )

        val header = Ui.rowSpaceBetween(activity)
        header.addView(Ui.hudLabel(activity, "Evidence · ${formatCapturedAt(photo.optString("capturedAtUtc", ""))}"))
        header.addView(Ui.badge(activity, "Webcam", Ui.color(activity, R.color.brand_green)))
        root.addView(header)
        root.addView(Ui.spacer(activity, 10))

        val imageView = ImageView(activity).apply {
            adjustViewBounds = true
            background = Ui.inputDrawable(activity)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(300))
        }
        root.addView(imageView)

        // Matches the web dashboard's grouped photo+location+route view - if
        // this photo has a location from the same capture cycle, show where
        // it was taken and the drive there, not just the picture alone.
        val matchedLocation = findMatchingLocation(photo, locations)
        if (matchedLocation != null) {
            val metadata = matchedLocation.optJSONObject("metadata") ?: JSONObject()
            val lat = metadata.optDouble("latitude", Double.NaN)
            val lon = metadata.optDouble("longitude", Double.NaN)
            if (!lat.isNaN() && !lon.isNaN()) {
                root.addView(Ui.spacer(activity, 12))
                root.addView(Ui.hudLabel(activity, "Location & route"))
                root.addView(Ui.spacer(activity, 6))
                val mapWebView = createMapWebView(
                    activity,
                    "${SentinelPrefs.WEB_APP_BASE_URL}/map-viewer.html?lat=$lat&lon=$lon&route=1"
                )
                root.addView(mapWebView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(240)))
            }
        }

        root.addView(Ui.spacer(activity, 12))
        val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        buttonRow.addView(
            Ui.outlineButton(activity, "Close") { dialog.dismiss() },
            LinearLayout.LayoutParams(0, dp(42), 1f).apply { marginEnd = dp(8) }
        )
        buttonRow.addView(
            Ui.dangerButton(activity, "Delete") {
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
            LinearLayout.LayoutParams(0, dp(42), 1f)
        )
        root.addView(buttonRow)

        dialog.setContentView(shell)
        dialog.show()
        dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val bytes = withContext(Dispatchers.IO) { activity.api.fetchCaptureBytes(activity.authToken, id) }
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap != null) {
                    imageView.setImageBitmap(bitmap)
                } else {
                    Log.e("SentinelCaptures", "Full-image decode returned null for capture $id (${bytes.size} bytes)")
                    Toast.makeText(activity, "Photo data couldn't be decoded.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e("SentinelCaptures", "Full-image load failed for capture $id", e)
                Toast.makeText(activity, "Failed to load photo: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun locationRow(activity: DashboardActivity, location: JSONObject, listContainer: LinearLayout): LinearLayout {
        fun dp(value: Int) = Ui.dp(activity, value)
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.insetDrawable(activity)
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val metadata = location.optJSONObject("metadata") ?: JSONObject()
        val lat = metadata.optDouble("latitude", Double.NaN)
        val lon = metadata.optDouble("longitude", Double.NaN)

        row.addView(Ui.hudLabel(activity, "Fix · ${formatCapturedAt(location.optString("capturedAtUtc", ""))}"))
        row.addView(Ui.spacer(activity, 6))

        if (lat.isNaN() || lon.isNaN()) {
            row.addView(Ui.bodyText(activity, "Location unavailable for this attempt."))
        } else {
            val placeText = Ui.monoText(activity, "RESOLVING LOCATION…", 9f, Ui.color(activity, R.color.text_muted)).apply {
                letterSpacing = 0.08f
            }
            row.addView(placeText)
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    val place = withContext(Dispatchers.IO) { activity.api.reverseGeocode(activity.authToken, lat, lon) }
                    placeText.text = place.optString("label", "Unknown location")
                } catch (e: Exception) {
                    placeText.text = "Unknown location"
                }
            }
            row.addView(Ui.spacer(activity, 10))
            val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
            buttonRow.addView(
                Ui.outlineButton(activity, "Open map") { showLocationMapDialog(activity, lat, lon) },
                LinearLayout.LayoutParams(0, dp(40), 1f).apply { marginEnd = dp(8) }
            )
            buttonRow.addView(
                deleteButton(activity, location, listContainer),
                LinearLayout.LayoutParams(0, dp(40), 1f)
            )
            row.addView(buttonRow)
        }
        return row
    }

    // Shared by the standalone "View on Map" dialog and the route map
    // embedded in the photo dialog - both point at our own map-viewer.html
    // (Leaflet + OpenStreetMap, same as the web dashboard) rendered in a
    // WebView, never handing off to a separate Maps app.
    @Suppress("SetJavaScriptEnabled")
    private fun createMapWebView(activity: DashboardActivity, url: String): WebView {
        return WebView(activity).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Route mode asks the page for the viewer's own live position via
            // navigator.geolocation - without both of these, WebView denies
            // that silently regardless of the app's own location permission.
            settings.setGeolocationEnabled(true)
            // Bypasses any stale cached copy of map-viewer.html/leaflet from
            // before it was fixed to be self-hosted (was previously blocked
            // by the site's own CSP when loaded from a CDN) - always fetch
            // the current version fresh.
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    errorCode: Int,
                    description: String?,
                    failingUrl: String?
                ) {
                    Log.e("SentinelMap", "WebView error $errorCode loading $failingUrl: $description")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.d("SentinelMap", "console: ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                    return true
                }

                override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                    // The app itself already holds ACCESS_FINE_LOCATION (granted
                    // during sign-in) - this just relays that same consent to
                    // the page's own geolocation call rather than asking again.
                    callback?.invoke(origin, true, false)
                }
            }
            loadUrl(url)
        }
    }

    // Shows the location on our own map-viewer.html (Leaflet + OpenStreetMap,
    // same as the web dashboard) in a WebView inside a Dialog - stays inside
    // this app the whole time, no external Maps app involved.
    private fun showLocationMapDialog(activity: DashboardActivity, lat: Double, lon: Double) {
        fun dp(value: Int) = Ui.dp(activity, value)
        val webView = createMapWebView(activity, "${SentinelPrefs.WEB_APP_BASE_URL}/map-viewer.html?lat=$lat&lon=$lon")

        val dialog = Dialog(activity)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        val shell = FrameLayout(activity).apply {
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.panelDrawable(activity)
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        shell.addView(root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(Ui.hudLabel(activity, "Captured location"))
        root.addView(Ui.spacer(activity, 8))
        root.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(380)))
        root.addView(Ui.spacer(activity, 12))
        root.addView(
            Ui.outlineButton(activity, "Close") { dialog.dismiss() },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(42))
        )

        dialog.setContentView(shell)
        dialog.show()
        dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun usbFileRow(activity: DashboardActivity, file: JSONObject, listContainer: LinearLayout): LinearLayout {
        fun dp(value: Int) = Ui.dp(activity, value)
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.insetDrawable(activity)
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val top = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(
            Ui.monoText(activity, file.optString("originalFileName", "UNKNOWN"), 10f, Ui.color(activity, R.color.text_primary), bold = true).apply {
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.MIDDLE
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(8) }
        )
        val sizeBytes = file.optLong("sizeBytes", 0)
        val skipped = file.optBoolean("skipped", false)
        top.addView(
            Ui.badge(
                activity,
                if (skipped) "Skipped" else "Copied",
                if (skipped) Ui.color(activity, R.color.brand_amber) else Ui.color(activity, R.color.brand_green)
            )
        )
        row.addView(top)
        row.addView(Ui.spacer(activity, 4))
        val skipReason = file.optString("skipReason", "unknown")
        row.addView(
            Ui.monoText(
                activity,
                "${if (sizeBytes > 0) "%.1f KB".format(sizeBytes / 1024.0) else "—"} · ${if (skipped) "SKIPPED ($skipReason)" else "COPIED"}",
                8f,
                Ui.color(activity, R.color.text_hint)
            ).apply { letterSpacing = 0.1f }
        )
        row.addView(Ui.spacer(activity, 8))
        val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
        buttonRow.addView(
            deleteButton(activity, file, listContainer),
            LinearLayout.LayoutParams(Ui.dp(activity, 88), dp(36))
        )
        row.addView(buttonRow)
        return row
    }

    private fun deleteButton(activity: DashboardActivity, capture: JSONObject, listContainer: LinearLayout): TextView {
        val id = captureId(capture)
        return TextView(activity).apply {
            text = "DELETE"
            typeface = Ui.mono(activity, 600)
            textSize = 8.5f
            letterSpacing = 0.16f
            includeFontPadding = false
            gravity = Gravity.CENTER
            setTextColor(Ui.color(activity, R.color.status_error))
            background = HoloDrawable(
                fillColor = Ui.withAlpha(Ui.color(activity, R.color.brand_danger), 0x14),
                strokeColor = Ui.withAlpha(Ui.color(activity, R.color.brand_danger), 0x4D),
                accentColor = Ui.color(activity, R.color.brand_danger),
                cutPx = Ui.dp(activity, 6).toFloat(),
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
            setOnClickListener {
                SentinelSound.click(activity)
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
