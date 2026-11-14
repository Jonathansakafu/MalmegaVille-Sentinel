package com.malmegaville.sentinel

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Spannable
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
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

// The Android twin of AppShell.tsx + OverviewPage.tsx: the same command bar,
// three-item nav, live ticker, holo panels and real counters as the web
// console, wrapped around the phone's own Dashboard/Captures/Settings tabs.
class DashboardActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_JUST_AUTHENTICATED = "just_authenticated"
    }

    val api = SentinelApiClient()
    lateinit var prefs: SharedPreferences
    lateinit var authToken: String

    private lateinit var contentContainer: LinearLayout
    private lateinit var tabButtons: Map<SentinelTab, Button>
    private lateinit var topClockText: TextView
    private lateinit var tickerText: TextView
    private lateinit var tickerClockText: TextView
    private var activeTab = SentinelTab.DASHBOARD

    private val handler = Handler(Looper.getMainLooper())
    private val clockFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    private var tickerIndex = 0
    private var counterDevices = 0
    private var counterOnline = 0
    private var counterIncidents = 0
    private var counterCritical = 0
    private var counterCaptures = 0

    private val clockRunnable = object : Runnable {
        override fun run() {
            val label = clockFormat.format(Date())
            if (::topClockText.isInitialized) topClockText.text = label
            if (::tickerClockText.isInitialized) tickerClockText.text = label
            handler.postDelayed(this, 1000)
        }
    }

    private val tickerRunnable = object : Runnable {
        override fun run() {
            tickerIndex++
            updateTickerText()
            handler.postDelayed(this, 6000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
        if (token == null) {
            goToLogin()
            return
        }
        authToken = token

        // Android 12+ refuses to start the camera-matched foreground service
        // from the background, so a lost phone's photo can only be taken while
        // this screen is actually open. Running a check here - the one moment
        // the app is guaranteed visible - is what makes the photo possible at
        // all; the periodic job still covers everything else.
        LostDeviceWorker.runOnce(applicationContext, "phone_check")

        setContentView(buildShell())
        showTab(SentinelTab.DASHBOARD)

        handler.post(clockRunnable)
        handler.postDelayed(tickerRunnable, 6000)

        if (intent.getBooleanExtra(EXTRA_JUST_AUTHENTICATED, false)) {
            SentinelSound.grant(this)
            SentinelCinematic.show(this, granted = true)
        } else {
            SentinelSound.boot(this)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(clockRunnable)
        handler.removeCallbacks(tickerRunnable)
        super.onDestroy()
    }

    fun showTab(tab: SentinelTab) {
        activeTab = tab
        tabButtons.forEach { (key, button) -> styleTabButton(button, key == tab) }
        contentContainer.removeAllViews()
        contentContainer.addView(Ui.monoText(this, "LOADING…", 9f, Ui.color(this, R.color.text_hint)))
        updateTickerText()

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

    // --- Shell --------------------------------------------------------------

    private fun buildShell(): View {
        fun dp(value: Int) = Ui.dp(this, value)
        val green = Ui.color(this, R.color.brand_green)
        val danger = Ui.color(this, R.color.brand_danger)

        val root = FrameLayout(this).apply {
            background = HudBackdropDrawable(this@DashboardActivity)
        }
        val chrome = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        // Command bar: brand, exit, tagline, clock.
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(12), dp(20), dp(4))
        }
        val brandRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val brandMark = FrameLayout(this).apply {
            background = HoloDrawable(
                fillColor = Ui.withAlpha(green, 0x1A),
                strokeColor = Ui.withAlpha(green, 0x80),
                accentColor = green,
                cutPx = 0f,
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
        }
        brandMark.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setPadding(dp(3), dp(3), dp(3), dp(3))
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        brandRow.addView(brandMark, LinearLayout.LayoutParams(dp(34), dp(34)))
        val wordmark = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), 0, 0, 0)
        }
        wordmark.addView(
            TextView(this).apply {
                text = "MALMEGAVILLE"
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 11.5f
                letterSpacing = 0.04f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                includeFontPadding = false
            }
        )
        wordmark.addView(
            Ui.monoText(this, "SENTINEL", 8f, Ui.withAlpha(green, 0xE6)).apply {
                letterSpacing = 0.28f
                setPadding(0, dp(2), 0, 0)
            }
        )
        brandRow.addView(wordmark)
        topBar.addView(brandRow, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        topBar.addView(
            TextView(this).apply {
                text = "EXIT"
                typeface = Ui.mono(this@DashboardActivity, 600)
                textSize = 9f
                letterSpacing = 0.18f
                setTextColor(danger)
                includeFontPadding = false
                setPadding(dp(10), dp(8), dp(4), dp(8))
                setOnClickListener {
                    SentinelSound.nav(this@DashboardActivity)
                    logout()
                }
            }
        )
        chrome.addView(topBar)

        val metaRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(2), dp(20), dp(0))
        }
        metaRow.addView(
            Ui.monoText(this, "PROTECT. DETECT. RESPOND.", 8f, Ui.withAlpha(green, 0xC0)).apply {
                letterSpacing = 0.24f
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        topClockText = Ui.monoText(this, "00:00:00", 9.5f, Ui.color(this, R.color.slate_300)).apply {
            letterSpacing = 0.08f
            gravity = Gravity.END
        }
        metaRow.addView(topClockText)
        chrome.addView(metaRow)
        chrome.addView(Ui.spacer(this, 8))
        chrome.addView(Ui.divider(this))

        // Nav tabs.
        val navRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
        }
        val buttons = mutableMapOf<SentinelTab, Button>()
        listOf(
            SentinelTab.DASHBOARD to "Dashboard",
            SentinelTab.CAPTURES to "Captures",
            SentinelTab.SETTINGS to "Settings"
        ).forEach { (tab, label) ->
            val button = Ui.navButton(this, label, tab == activeTab) {
                SentinelSound.nav(this@DashboardActivity)
                showTab(tab)
            }
            navRow.addView(
                button,
                LinearLayout.LayoutParams(0, dp(36), 1f).apply {
                    val m = dp(4)
                    setMargins(m, 0, m, 0)
                }
            )
            buttons[tab] = button
        }
        tabButtons = buttons
        chrome.addView(navRow)
        chrome.addView(Ui.divider(this))

        // Scrolling console content with the slow scan band layered over it.
        contentContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(12), dp(12), dp(20))
        }
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(contentContainer, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val contentLayer = FrameLayout(this)
        contentLayer.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        contentLayer.addView(
            ScanlineView(this),
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        chrome.addView(contentLayer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        // Bottom command strip (StatusBar.tsx).
        chrome.addView(Ui.divider(this))
        val statusBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Ui.color(this@DashboardActivity, R.color.brand_ink))
            setPadding(dp(12), dp(7), dp(20), dp(9))
        }
        tickerText = Ui.monoText(this, "", 8.5f, Ui.color(this, R.color.text_muted)).apply {
            letterSpacing = 0.14f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        statusBar.addView(tickerText, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        tickerClockText = Ui.monoText(this, "00:00:00", 8.5f, Ui.color(this, R.color.text_hint)).apply {
            letterSpacing = 0.06f
            setPadding(dp(10), 0, 0, 0)
        }
        statusBar.addView(tickerClockText)
        chrome.addView(statusBar)

        root.addView(chrome, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(
            View(this).apply {
                background = ConsoleFrameDrawable(this@DashboardActivity)
                isClickable = false
                isFocusable = false
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )

        updateTickerText()
        return root
    }

    private fun styleTabButton(button: Button, active: Boolean) {
        button.background = Ui.navDrawable(this, active)
        button.setTextColor(Ui.navTextColor(this, active))
    }

    private fun updateCounters(devices: JSONArray, incidents: JSONArray, captures: JSONArray) {
        val now = System.currentTimeMillis()
        var online = 0
        for (i in 0 until devices.length()) {
            val lastSeen = parseIso(devices.getJSONObject(i).optString("lastSeen", ""))
            if (lastSeen != null && now - lastSeen < 10 * 60 * 1000) online++
        }
        var critical = 0
        for (i in 0 until incidents.length()) {
            val severity = incidents.getJSONObject(i).optString("severity", "").lowercase()
            if (severity == "high" || severity == "critical") critical++
        }
        counterDevices = devices.length()
        counterOnline = online
        counterIncidents = incidents.length()
        counterCritical = critical
        counterCaptures = captures.length()
        updateTickerText()
    }

    private fun tickerMessages(): List<String> = listOf(
        "$counterOnline/$counterDevices AGENTS REACHABLE · $counterIncidents INCIDENTS LOGGED",
        "$counterCritical CRITICAL · $counterCaptures EVIDENCE RECORDS SECURED",
        "SESSION ENCRYPTED · PROTECT · DETECT · RESPOND"
    )

    private fun updateTickerText() {
        if (!::tickerText.isInitialized) return
        val messages = tickerMessages()
        val message = messages[tickerIndex % messages.size]
        val line = SpannableStringBuilder()
        val arrow = SpannableString("> ")
        arrow.setSpan(
            ForegroundColorSpan(Ui.color(this, R.color.brand_green)),
            0,
            arrow.length,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        line.append(arrow)
        line.append(message)
        tickerText.text = line
    }

    // --- Dashboard tab ------------------------------------------------------

    private fun loadDashboardTab() {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val (devices, incidents, captures) = withContext(Dispatchers.IO) {
                    Triple(api.fetchDevices(authToken), api.fetchIncidents(authToken), api.fetchCaptures(authToken))
                }
                updateCounters(devices, incidents, captures)
                contentContainer.removeAllViews()
                renderDashboardTab(devices, incidents, captures)
            } catch (e: Exception) {
                contentContainer.removeAllViews()
                val card = Ui.card(this@DashboardActivity)
                card.addView(Ui.sectionTitle(this@DashboardActivity, "Command center"))
                card.addView(Ui.spacer(this@DashboardActivity, 8))
                card.addView(Ui.mutedText(this@DashboardActivity, "Failed to load dashboard: ${e.message}"))
                contentContainer.addView(card)
            }
        }
    }

    private fun renderDashboardTab(devices: JSONArray, incidents: JSONArray, captures: JSONArray) {
        val now = System.currentTimeMillis()
        val green = Ui.color(this, R.color.brand_green)
        val cyan = Ui.color(this, R.color.brand_cyan)
        val danger = Ui.color(this, R.color.brand_danger)
        val amber = Ui.color(this, R.color.brand_amber)

        val online = (0 until devices.length()).count {
            val lastSeen = parseIso(devices.getJSONObject(it).optString("lastSeen", ""))
            lastSeen != null && now - lastSeen < 10 * 60 * 1000
        }
        val offline = devices.length() - online
        val critical = (0 until incidents.length()).count {
            val severity = incidents.getJSONObject(it).optString("severity", "").lowercase()
            severity == "high" || severity == "critical"
        }
        val recentIncidents = (0 until incidents.length())
            .map { incidents.getJSONObject(it) }
            .sortedByDescending { parseIso(it.optString("createdAt", "")) ?: 0L }

        val overview = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(Ui.dp(this@DashboardActivity, 2), 0, Ui.dp(this@DashboardActivity, 2), Ui.dp(this@DashboardActivity, 12))
        }
        overview.addView(Ui.hudLabel(this, "Command center"))
        overview.addView(
            Ui.monoValue(this, "SECURITY OVERVIEW", 18f).apply {
                letterSpacing = 0.1f
                setPadding(0, Ui.dp(this@DashboardActivity, 4), 0, 0)
            }
        )
        val overviewMeta = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, Ui.dp(this@DashboardActivity, 10), 0, 0)
        }
        overviewMeta.addView(
            Ui.badge(this, if (critical > 0) "● Link unstable" else "● System online", if (critical > 0) amber else green),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        overviewMeta.addView(
            Ui.outlineButton(this, "Refresh") { loadDashboardTab() },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, Ui.dp(this@DashboardActivity, 34)).apply {
                marginStart = Ui.dp(this@DashboardActivity, 8)
            }
        )
        overview.addView(overviewMeta)
        contentContainer.addView(overview)

        // Four counters, exactly the web overview's labels and hints.
        val grid = GridLayout(this).apply { columnCount = 2 }
        val tiles = listOf(
            Quad("Total devices", devices.length().toString(), "Check-ins · 12h", "▤", green),
            Quad("Online devices", online.toString(), "$offline offline", "◉", cyan),
            Quad("Offline devices", offline.toString(), if (offline > 0) "Needs attention" else "All reachable", "◌", if (offline > 0) danger else green),
            Quad("Threats detected", incidents.length().toString(), "$critical critical", "⚠", danger)
        )
        tiles.forEachIndexed { index, tile ->
            grid.addView(
                statTile(tile.label, tile.value, tile.hint, tile.glyph, tile.tone),
                GridLayout.LayoutParams(GridLayout.spec(index / 2), GridLayout.spec(index % 2, 1f)).apply {
                    width = 0
                    val m = Ui.dp(this@DashboardActivity, 4)
                    setMargins(m, m, m, m)
                }
            )
        }
        contentContainer.addView(grid)
        contentContainer.addView(Ui.spacer(this, 10))

        // Threat activity.
        val incidentCard = Ui.card(this)
        val incidentHeader = Ui.rowSpaceBetween(this)
        incidentHeader.addView(
            Ui.sectionTitle(this, "Threat activity"),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        incidentHeader.addView(Ui.badge(this, "● Live", green))
        incidentCard.addView(incidentHeader)
        incidentCard.addView(Ui.spacer(this, 4))
        if (recentIncidents.isEmpty()) {
            incidentCard.addView(
                Ui.monoText(this, "NO INCIDENTS", 10f, Ui.color(this, R.color.hud_label), bold = true).apply {
                    letterSpacing = 0.14f
                    setPadding(0, Ui.dp(this@DashboardActivity, 16), 0, 0)
                }
            )
            incidentCard.addView(
                Ui.mutedText(this, "Nothing has been flagged on your devices yet.").apply {
                    setPadding(0, Ui.dp(this@DashboardActivity, 4), 0, Ui.dp(this@DashboardActivity, 10))
                }
            )
        } else {
            recentIncidents.take(5).forEachIndexed { index, incident ->
                incidentCard.addView(incidentRow(incident, now))
                if (index < minOf(recentIncidents.size, 5) - 1) incidentCard.addView(Ui.divider(this))
            }
        }
        contentContainer.addView(incidentCard)

        // Device agents.
        val deviceCard = Ui.card(this)
        val deviceHeader = Ui.rowSpaceBetween(this)
        deviceHeader.addView(
            Ui.sectionTitle(this, "Device agents"),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        deviceHeader.addView(Ui.monoText(this, "${devices.length()} REGISTERED", 8f, Ui.color(this, R.color.text_hint)))
        deviceCard.addView(deviceHeader)
        deviceCard.addView(Ui.spacer(this, 8))
        if (devices.length() == 0) {
            deviceCard.addView(
                Ui.mutedText(this, "No agents registered. Install the Sentinel agent or pair a phone to see it here.")
            )
        } else {
            for (i in 0 until devices.length()) {
                deviceCard.addView(deviceRow(devices.getJSONObject(i), now))
                if (i < devices.length() - 1) deviceCard.addView(Ui.spacer(this, 8))
            }
        }
        contentContainer.addView(deviceCard)

        // This phone's agent telemetry - parity with the Windows Settings panel.
        val telemetryCard = Ui.card(this)
        telemetryCard.addView(Ui.sectionTitle(this, "Agent telemetry"))
        telemetryCard.addView(Ui.spacer(this, 4))
        telemetryCard.addView(
            Ui.mutedText(this, "This phone is registered as a device agent and checked by the lost-device protocol.")
        )
        telemetryCard.addView(Ui.spacer(this, 8))
        telemetryCard.addView(telemetryRow("Device ID", SentinelPrefs.getOrCreatePhoneDeviceId(this)))
        telemetryCard.addView(Ui.divider(this))
        telemetryCard.addView(telemetryRow("Machine", Build.MODEL ?: "Android device"))
        telemetryCard.addView(Ui.divider(this))
        telemetryCard.addView(telemetryRow("Service", "SMS relay · Android ${Build.VERSION.RELEASE}"))
        telemetryCard.addView(Ui.divider(this))
        telemetryCard.addView(telemetryRow("Evidence", "${captures.length()} records"))
        contentContainer.addView(telemetryCard)

        // System status.
        val statusCard = Ui.card(this)
        statusCard.addView(Ui.sectionTitle(this, "System status"))
        statusCard.addView(Ui.spacer(this, 4))
        val latestSync = latestSyncMillis(devices)
        val lost = (0 until devices.length()).any { devices.getJSONObject(it).optBoolean("isLost", false) }
        statusCard.addView(statusRow("Core service sync", if (latestSync > 0) relativeTime(latestSync, now) else "No data", latestSync > 0))
        statusCard.addView(Ui.divider(this))
        statusCard.addView(statusRow("Agents reachable", "$online/${devices.length()}", devices.length() > 0 && online == devices.length()))
        statusCard.addView(Ui.divider(this))
        statusCard.addView(statusRow("Lost-device protocol", if (lost) "Armed" else "Standby", !lost))
        statusCard.addView(Ui.divider(this))
        statusCard.addView(statusRow("Evidence store", "${captures.length()} records", captures.length() > 0))
        contentContainer.addView(statusCard)

        // Live event stream.
        val streamCard = Ui.card(this)
        streamCard.addView(Ui.sectionTitle(this, "Live event stream"))
        streamCard.addView(Ui.spacer(this, 8))
        streamCard.addView(buildTerminal(incidents, captures))
        contentContainer.addView(streamCard)
    }

    private fun statTile(label: String, value: String, hint: String, glyph: String, tone: Int): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val tile = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.panelDrawable(this@DashboardActivity, tone)
            setPadding(dp(11), dp(10), dp(11), dp(10))
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val textColumn = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        textColumn.addView(Ui.hudLabel(this, label))
        textColumn.addView(
            Ui.monoValue(this, value, 23f).apply { setPadding(0, dp(5), 0, 0) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        )
        top.addView(textColumn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val glyphBox = FrameLayout(this).apply {
            background = HoloDrawable(
                fillColor = Ui.withAlpha(tone, 0x1A),
                strokeColor = Ui.withAlpha(tone, 0x66),
                accentColor = tone,
                cutPx = 0f,
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
        }
        glyphBox.addView(
            TextView(this).apply {
                text = glyph
                typeface = Ui.mono(this@DashboardActivity, 700)
                textSize = 14f
                setTextColor(tone)
                gravity = Gravity.CENTER
                includeFontPadding = false
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        top.addView(glyphBox, LinearLayout.LayoutParams(dp(27), dp(27)))
        tile.addView(top)
        tile.addView(
            Ui.monoText(this, hint, 7.5f, Ui.color(this, R.color.text_hint)).apply {
                letterSpacing = 0.12f
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                setPadding(0, dp(6), 0, 0)
            }
        )
        return tile
    }

    private fun incidentRow(incident: JSONObject, now: Long): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, dp(10))
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(
            TextView(this).apply {
                text = incident.optString("summary", "")
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 12.5f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                includeFontPadding = false
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(8) }
        )
        val severity = incident.optString("severity", "medium")
        top.addView(Ui.badge(this, severity, Ui.severityColor(this, severity)))
        row.addView(top)
        val whenLabel = (parseIso(incident.optString("createdAt", "")) ?: 0L).let {
            if (it > 0) relativeTime(it, now) else incident.optString("createdAt", "")
        }
        row.addView(
            Ui.monoText(this, "$whenLabel · ${incident.optString("deviceId", "")}", 8f, Ui.color(this, R.color.text_hint)).apply {
                letterSpacing = 0.1f
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                setPadding(0, dp(4), 0, 0)
            }
        )
        return row
    }

    private fun deviceRow(device: JSONObject, now: Long): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val green = Ui.color(this, R.color.brand_green)
        val danger = Ui.color(this, R.color.brand_danger)
        val isLost = device.optBoolean("isLost", false)
        val lastSeen = parseIso(device.optString("lastSeen", ""))
        val isOnline = lastSeen != null && now - lastSeen < 10 * 60 * 1000

        val block = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.insetDrawable(this@DashboardActivity)
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(
            TextView(this).apply {
                text = device.optString("name", "Unknown device")
                setTextColor(Ui.color(this@DashboardActivity, R.color.text_primary))
                textSize = 12.5f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                includeFontPadding = false
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(8) }
        )
        top.addView(
            Ui.badge(this, if (isOnline) "Online" else "Offline", if (isOnline) green else danger)
        )
        block.addView(top)
        block.addView(
            Ui.monoText(this, device.optString("operatingSystem", ""), 8f, Ui.color(this, R.color.text_muted)).apply {
                setPadding(0, dp(3), 0, 0)
            }
        )

        val levelRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, 0)
        }
        levelRow.addView(
            Ui.monoText(this, "THREAT LEVEL", 7.5f, Ui.color(this, R.color.text_hint)).apply { letterSpacing = 0.12f },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        levelRow.addView(
            Ui.monoText(this, if (isLost) "CRITICAL" else "LOW", 8f, if (isLost) danger else green, bold = true)
        )
        block.addView(levelRow)

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val fillWeight = if (isLost) 0.92f else 0.18f
        bar.addView(
            View(this).apply { setBackgroundColor(if (isLost) danger else green) },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, fillWeight)
        )
        bar.addView(
            View(this).apply { setBackgroundColor(0x14FFFFFF) },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f - fillWeight)
        )
        block.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(4) })

        if (lastSeen != null) {
            block.addView(
                Ui.monoText(this, "LAST SEEN ${relativeTime(lastSeen, now).uppercase()}", 7.5f, Ui.color(this, R.color.text_hint)).apply {
                    letterSpacing = 0.12f
                    setPadding(0, dp(6), 0, 0)
                }
            )
        }

        val deviceMongoId = device.optString("_id", "")
        val buttonRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(10), 0, 0)
        }
        buttonRow.addView(
            Ui.primaryButton(this, if (isLost) "Clear lost flag" else "Mark lost") {
                if (deviceMongoId.isBlank()) return@primaryButton
                CoroutineScope(Dispatchers.Main).launch {
                    try {
                        withContext(Dispatchers.IO) { api.setDeviceLostStatus(authToken, deviceMongoId, !isLost) }
                        if (isLost) SentinelSound.grant(this@DashboardActivity) else SentinelSound.alert(this@DashboardActivity)
                        loadDashboardTab()
                    } catch (e: Exception) {
                        SentinelSound.deny(this@DashboardActivity)
                        android.widget.Toast.makeText(this@DashboardActivity, "Failed: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            },
            LinearLayout.LayoutParams(0, dp(40), 1f).apply { marginEnd = dp(6) }
        )
        buttonRow.addView(
            Ui.outlineButton(this, "Remove") {
                if (deviceMongoId.isBlank()) return@outlineButton
                android.app.AlertDialog.Builder(this)
                    .setTitle("Remove device")
                    .setMessage("Remove \"${device.optString("name", "this device")}\" from your inventory? Its past captures are kept.")
                    .setPositiveButton("Remove") { _, _ ->
                        CoroutineScope(Dispatchers.Main).launch {
                            try {
                                withContext(Dispatchers.IO) { api.deleteDevice(authToken, deviceMongoId) }
                                SentinelSound.grant(this@DashboardActivity)
                                loadDashboardTab()
                            } catch (e: Exception) {
                                SentinelSound.deny(this@DashboardActivity)
                                android.widget.Toast.makeText(this@DashboardActivity, "Failed: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            },
            LinearLayout.LayoutParams(0, dp(40), 1f)
        )
        block.addView(buttonRow)
        return block
    }

    private fun telemetryRow(label: String, value: String): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
        }
        row.addView(Ui.hudLabel(this, label))
        row.addView(
            Ui.monoText(this, value, 8.5f, Ui.color(this, R.color.text_primary), bold = true).apply {
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.MIDDLE
                gravity = Gravity.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) }
        )
        return row
    }

    private fun statusRow(label: String, value: String, ok: Boolean): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val green = Ui.color(this, R.color.brand_green)
        val amber = Ui.color(this, R.color.brand_amber)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
        }
        row.addView(
            Ui.monoText(this, if (ok) "✓" else "!", 10f, if (ok) green else amber, bold = true),
            LinearLayout.LayoutParams(dp(16), ViewGroup.LayoutParams.WRAP_CONTENT)
        )
        row.addView(
            Ui.bodyText(this, label),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(6) }
        )
        row.addView(
            Ui.monoText(this, value, 8f, if (ok) green else Ui.color(this, R.color.text_muted), bold = true).apply {
                letterSpacing = 0.12f
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) }
        )
        return row
    }

    private fun buildTerminal(incidents: JSONArray, captures: JSONArray): LinearLayout {
        fun dp(value: Int) = Ui.dp(this, value)
        val green = Ui.color(this, R.color.brand_green)
        val hint = Ui.color(this, R.color.text_hint)
        val terminal = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = HoloDrawable(
                fillColor = 0xE6020805.toInt(),
                strokeColor = 0x2400FF88,
                accentColor = green,
                cutPx = 0f,
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
            setPadding(dp(10), dp(9), dp(10), dp(9))
        }
        val events = mutableListOf<Pair<Long, String>>()
        for (i in 0 until incidents.length()) {
            val incident = incidents.getJSONObject(i)
            val at = parseIso(incident.optString("createdAt", "")) ?: continue
            events.add(at to "[${incident.optString("severity", "").uppercase()}] ${incident.optString("summary", "")} · ${incident.optString("deviceId", "")}")
        }
        for (i in 0 until captures.length()) {
            val capture = captures.getJSONObject(i)
            val at = parseIso(capture.optString("capturedAtUtc", "")) ?: continue
            val type = capture.optString("captureType", "").replace("_", " ").uppercase()
            val skipped = if (capture.optBoolean("skipped", false)) " (skipped)" else ""
            events.add(at to "$type · ${capture.optString("deviceId", "")}$skipped")
        }
        val lines = events.sortedByDescending { it.first }.take(7)

        if (lines.isEmpty()) {
            terminal.addView(
                Ui.monoText(this, "> awaiting telemetry from registered agents…", 8.5f, hint).apply {
                    setLineSpacing(0f, 1.3f)
                }
            )
        } else {
            lines.forEach { (at, text) ->
                val line = SpannableStringBuilder()
                val stamp = SpannableString("[${clockFormat.format(Date(at))}] ")
                stamp.setSpan(ForegroundColorSpan(hint), 0, stamp.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                line.append(stamp)
                val body = SpannableString(text)
                body.setSpan(ForegroundColorSpan(green), 0, body.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                line.append(body)
                terminal.addView(
                    TextView(this).apply {
                        setText(line)
                        typeface = Ui.mono(this@DashboardActivity, 400)
                        textSize = 8.5f
                        includeFontPadding = false
                        setLineSpacing(0f, 1.3f)
                    }
                )
            }
        }
        val prompt = SpannableStringBuilder()
        val user = SpannableString("sentinel@core:~$ ")
        user.setSpan(ForegroundColorSpan(hint), 0, user.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        prompt.append(user)
        val cursor = SpannableString("█")
        cursor.setSpan(ForegroundColorSpan(green), 0, cursor.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        prompt.append(cursor)
        terminal.addView(
            TextView(this).apply {
                setText(prompt)
                typeface = Ui.mono(this@DashboardActivity, 400)
                textSize = 8.5f
                includeFontPadding = false
                setPadding(0, dp(5), 0, 0)
            }
        )
        return terminal
    }

    // --- Formatting helpers -------------------------------------------------

    private fun parseIso(value: String): Long? =
        runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrNull()

    private fun relativeTime(millis: Long, now: Long): String {
        val seconds = ((now - millis) / 1000).coerceAtLeast(0)
        return when {
            seconds < 60 -> "${seconds}s ago"
            seconds < 3600 -> "${seconds / 60}m ago"
            seconds < 86_400 -> "${seconds / 3600}h ago"
            else -> "${seconds / 86_400}d ago"
        }
    }

    private fun latestSyncMillis(devices: JSONArray): Long {
        var latest = 0L
        for (i in 0 until devices.length()) {
            val seen = parseIso(devices.getJSONObject(i).optString("lastSeen", "")) ?: continue
            if (seen > latest) latest = seen
        }
        return latest
    }

    private data class Quad(val label: String, val value: String, val hint: String, val glyph: String, val tone: Int)
}
