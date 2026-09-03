package com.malmegaville.sentinel

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class SentinelTab { DASHBOARD, CAPTURES, SETTINGS }

// The Android equivalent of DashboardPage.tsx: same three tabs (Dashboard,
// Captures, Settings) as Header.tsx, swapped inside one activity rather than
// a client-side router, since there's no deep-linking need here.
class DashboardActivity : AppCompatActivity() {

    val api = SentinelApiClient()
    lateinit var prefs: SharedPreferences
    lateinit var authToken: String

    private lateinit var contentContainer: LinearLayout
    private lateinit var tabButtons: Map<SentinelTab, Button>
    private var activeTab = SentinelTab.DASHBOARD

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
        if (token == null) {
            goToLogin()
            return
        }
        authToken = token

        setContentView(buildShell())
        showTab(SentinelTab.DASHBOARD)
    }

    fun showTab(tab: SentinelTab) {
        activeTab = tab
        tabButtons.forEach { (key, button) -> styleTabButton(button, key == tab) }
        contentContainer.removeAllViews()
        contentContainer.addView(Ui.mutedText(this, "Loading..."))

        when (tab) {
            SentinelTab.DASHBOARD -> loadDashboardTab()
            SentinelTab.CAPTURES -> CapturesTab.build(this, contentContainer)
            SentinelTab.SETTINGS -> SettingsTab.build(this, contentContainer)
        }
    }

    fun logout() {
        prefs.edit().remove(SentinelPrefs.KEY_AUTH_TOKEN).apply()
        goToLogin()
    }

    private fun goToLogin() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun buildShell(): ScrollView {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Ui.color(this@DashboardActivity, R.color.brand_dark))
            setPadding(dp(16), dp(32), dp(16), dp(32))
        }

        // Header: logo + welcome text + logout, mirroring Header.tsx's top row.
        val headerCard = Ui.card(this)
        val headerRow = Ui.rowSpaceBetween(this)
        val logoAndText = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        logoAndText.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                layoutParams = LinearLayout.LayoutParams(dp(40), dp(40)).apply { marginEnd = dp(12) }
            }
        )
        logoAndText.addView(
            TextView(this).apply {
                text = "MalmegaVille Sentinel"
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
            }
        )
        headerRow.addView(logoAndText)
        headerRow.addView(
            Button(this).apply {
                text = "Logout"
                isAllCaps = false
                textSize = 13f
                setTextColor(Ui.color(this@DashboardActivity, R.color.status_error))
                background = null
                setOnClickListener { logout() }
            }
        )
        headerCard.addView(headerRow)

        // Tab row, matching Header.tsx's nav.
        val tabRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(14)
            }
        }
        val buttons = mutableMapOf<SentinelTab, Button>()
        listOf(SentinelTab.DASHBOARD to "Dashboard", SentinelTab.CAPTURES to "Captures", SentinelTab.SETTINGS to "Settings")
            .forEach { (tab, label) ->
                val button = Button(this).apply {
                    text = label
                    isAllCaps = false
                    textSize = 13f
                    setTypeface(typeface, Typeface.BOLD)
                    setOnClickListener { showTab(tab) }
                }
                tabRow.addView(
                    button,
                    LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        val m = dp(4)
                        setMargins(m, 0, m, 0)
                    }
                )
                buttons[tab] = button
            }
        tabButtons = buttons
        headerCard.addView(tabRow)
        root.addView(headerCard)

        contentContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(contentContainer)

        return ScrollView(this).apply { addView(root) }
    }

    private fun styleTabButton(button: Button, active: Boolean) {
        if (active) {
            button.setTextColor(android.graphics.Color.BLACK)
            button.background = androidx.core.content.ContextCompat.getDrawable(this, R.drawable.bg_button_green)
        } else {
            button.setTextColor(Ui.color(this, R.color.text_muted))
            button.background = androidx.core.content.ContextCompat.getDrawable(this, R.drawable.bg_input)
        }
    }

    // --- Dashboard tab: stats + incidents + device inventory (own lost/found toggle) ---

    private fun loadDashboardTab() {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val (devices, incidents) = withContext(Dispatchers.IO) {
                    api.fetchDevices(authToken) to api.fetchIncidents(authToken)
                }
                contentContainer.removeAllViews()
                renderDashboardTab(devices, incidents)
            } catch (e: Exception) {
                contentContainer.removeAllViews()
                contentContainer.addView(Ui.mutedText(this@DashboardActivity, "Failed to load dashboard: ${e.message}"))
            }
        }
    }

    private fun renderDashboardTab(devices: JSONArray, incidents: JSONArray) {
        val highRisk = (0 until incidents.length()).count {
            val severity = incidents.getJSONObject(it).optString("severity", "").lowercase()
            severity == "high" || severity == "critical"
        }

        // Stat grid (2 columns), mirroring StatCard.tsx's 4 tiles.
        val statGrid = GridLayout(this).apply {
            columnCount = 2
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        listOf(
            "Devices" to devices.length().toString(),
            "Incidents" to incidents.length().toString(),
            "High Risk" to highRisk.toString(),
            "Last Sync" to lastSyncLabel(devices)
        ).forEachIndexed { index, (label, value) ->
            statGrid.addView(
                statTile(label, value),
                GridLayout.LayoutParams(
                    GridLayout.spec(index / 2, 1f),
                    GridLayout.spec(index % 2, 1f)
                ).apply {
                    width = 0
                    val m = Ui.dp(this@DashboardActivity, 6)
                    setMargins(m, m, m, m)
                }
            )
        }
        contentContainer.addView(statGrid)
        contentContainer.addView(Ui.spacer(this, 16))

        // Recent incidents.
        val incidentsCard = Ui.card(this)
        incidentsCard.addView(Ui.sectionTitle(this, "Recent Incidents"))
        incidentsCard.addView(Ui.spacer(this, 8))
        if (incidents.length() == 0) {
            incidentsCard.addView(Ui.mutedText(this, "No incidents have been recorded yet."))
        } else {
            val dateFormat = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault())
            for (i in 0 until minOf(incidents.length(), 5)) {
                val incident = incidents.getJSONObject(i)
                incidentsCard.addView(incidentRow(incident, dateFormat))
                if (i < minOf(incidents.length(), 5) - 1) incidentsCard.addView(Ui.spacer(this, 10))
            }
        }
        contentContainer.addView(incidentsCard)

        // Device inventory.
        val devicesCard = Ui.card(this)
        devicesCard.addView(Ui.sectionTitle(this, "Device Inventory"))
        devicesCard.addView(Ui.spacer(this, 8))
        if (devices.length() == 0) {
            devicesCard.addView(Ui.mutedText(this, "No devices registered yet."))
        } else {
            for (i in 0 until devices.length()) {
                devicesCard.addView(deviceRow(devices.getJSONObject(i)))
                if (i < devices.length() - 1) devicesCard.addView(Ui.spacer(this, 12))
            }
        }
        contentContainer.addView(devicesCard)
    }

    private fun lastSyncLabel(devices: JSONArray): String {
        var latest = 0L
        for (i in 0 until devices.length()) {
            val lastSeen = devices.getJSONObject(i).optString("lastSeen", "")
            val parsed = runCatching { java.time.Instant.parse(lastSeen).toEpochMilli() }.getOrNull() ?: continue
            if (parsed > latest) latest = parsed
        }
        if (latest == 0L) return "No data"
        val diffSeconds = (System.currentTimeMillis() - latest) / 1000
        return when {
            diffSeconds < 60 -> "${diffSeconds}s ago"
            diffSeconds < 3600 -> "${diffSeconds / 60}m ago"
            diffSeconds < 86400 -> "${diffSeconds / 3600}h ago"
            else -> "${diffSeconds / 86400}d ago"
        }
    }

    private fun statTile(label: String, value: String): LinearLayout {
        val tile = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(this@DashboardActivity, R.drawable.bg_card)
            val pad = Ui.dp(this@DashboardActivity, 14)
            setPadding(pad, pad, pad, pad)
        }
        tile.addView(
            TextView(this).apply {
                text = value
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 22f
                setTypeface(typeface, Typeface.BOLD)
            }
        )
        tile.addView(
            TextView(this).apply {
                text = label.uppercase()
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_muted))
                textSize = 11f
                letterSpacing = 0.08f
            }
        )
        return tile
    }

    private fun incidentRow(incident: JSONObject, dateFormat: SimpleDateFormat): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(this@DashboardActivity, R.drawable.bg_input)
        }
        val top = Ui.rowSpaceBetween(this)
        val createdAt = incident.optString("createdAt", "")
        val formatted = runCatching { dateFormat.format(Date(java.time.Instant.parse(createdAt).toEpochMilli())) }.getOrDefault(createdAt)
        top.addView(Ui.mutedText(this, formatted))
        val severity = incident.optString("severity", "medium")
        top.addView(Ui.badge(this, severity, Ui.severityColor(this, severity)))
        row.addView(top)
        row.addView(Ui.spacer(this, 6))
        row.addView(
            TextView(this).apply {
                text = incident.optString("summary", "")
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
            }
        )
        row.addView(Ui.spacer(this, 4))
        row.addView(Ui.bodyText(this, "Device: ${incident.optString("deviceId", "")} · Threat score: ${incident.optDouble("threatScore", 0.0).toInt()}"))
        return row
    }

    private fun deviceRow(device: JSONObject): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = androidx.core.content.ContextCompat.getDrawable(this@DashboardActivity, R.drawable.bg_input)
        }
        val top = Ui.rowSpaceBetween(this)
        top.addView(
            TextView(this).apply {
                text = device.optString("name", "Unknown device")
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
            }
        )
        top.addView(Ui.mutedText(this, device.optString("operatingSystem", "")))
        row.addView(top)
        row.addView(Ui.spacer(this, 6))

        val isLost = device.optBoolean("isLost", false)
        row.addView(
            Ui.badge(
                this,
                if (isLost) "Lost / Stolen" else "Safe",
                if (isLost) Ui.color(this, R.color.rose_400) else Ui.color(this, R.color.brand_green)
            )
        )
        row.addView(Ui.spacer(this, 6))
        row.addView(Ui.mutedText(this, "Last seen: ${device.optString("lastSeen", "")}"))
        row.addView(Ui.spacer(this, 10))

        val deviceMongoId = device.optString("_id", "")
        row.addView(
            Ui.greenButton(this, if (isLost) "Clear Lost Flag" else "Mark as Lost/Stolen") {
                if (deviceMongoId.isBlank()) return@greenButton
                CoroutineScope(Dispatchers.Main).launch {
                    try {
                        withContext(Dispatchers.IO) { api.setDeviceLostStatus(authToken, deviceMongoId, !isLost) }
                        loadDashboardTab()
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(this@DashboardActivity, "Failed: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
        row.addView(Ui.spacer(this, 8))
        row.addView(
            Ui.outlineButton(this, "Remove") {
                if (deviceMongoId.isBlank()) return@outlineButton
                android.app.AlertDialog.Builder(this)
                    .setTitle("Remove device")
                    .setMessage("Remove \"${device.optString("name", "this device")}\" from your inventory? Its past captures are kept.")
                    .setPositiveButton("Remove") { _, _ ->
                        CoroutineScope(Dispatchers.Main).launch {
                            try {
                                withContext(Dispatchers.IO) { api.deleteDevice(authToken, deviceMongoId) }
                                loadDashboardTab()
                            } catch (e: Exception) {
                                android.widget.Toast.makeText(this@DashboardActivity, "Failed: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
        )
        return row
    }
}
