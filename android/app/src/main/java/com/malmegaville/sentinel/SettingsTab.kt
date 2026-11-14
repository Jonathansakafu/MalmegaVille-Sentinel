package com.malmegaville.sentinel

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

// Android equivalent of SettingsPanel.tsx. The web version's "Push
// Notifications" section (browser Web Push) has no mobile equivalent here -
// this app already relays SMS via Firebase Cloud Messaging directly, so
// there's nothing to toggle for it on this screen.
object SettingsTab {

    fun build(activity: DashboardActivity, container: LinearLayout) {
        container.removeAllViews()
        container.addView(buildHeader(activity))
        container.addView(buildNotificationCard(activity))
        container.addView(buildAccountCard(activity))
        container.addView(buildPasswordCard(activity))
        container.addView(buildTrustedUsbCard(activity))
        container.addView(buildIdentityCard(activity))
        container.addView(buildDiagnosticsCard(activity))
        container.addView(buildCommandLinkCard(activity))
    }

    private fun buildHeader(activity: DashboardActivity): LinearLayout {
        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val pad = Ui.dp(activity, 2)
            setPadding(pad, 0, pad, Ui.dp(activity, 12))
        }
        header.addView(Ui.hudLabel(activity, "Configuration"))
        header.addView(
            Ui.monoValue(activity, "SETTINGS", 18f).apply {
                letterSpacing = 0.1f
                setPadding(0, Ui.dp(activity, 4), 0, 0)
            }
        )
        return header
    }

    // The phone can't be inspected over USB while it's out of reach, so the
    // last crash/background failure it saw is kept on the device and shown
    // here - this is what turns "it keeps stopping" into the actual exception.
    private fun buildDiagnosticsCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Diagnostics"))
        card.addView(Ui.spacer(activity, 4))
        card.addView(Ui.mutedText(activity, "The last error this phone recorded, if any. Useful when captures stop arriving."))
        card.addView(Ui.spacer(activity, 10))

        val crash = SentinelDiagnostics.lastCrash(activity)
        val workerError = SentinelDiagnostics.lastWorkerError(activity)
        if (crash == null && workerError == null) {
            card.addView(Ui.bodyText(activity, "No errors recorded."))
            return card
        }
        crash?.let { card.addView(diagnosticEntry(activity, "App crash", it)) }
        if (crash != null && workerError != null) card.addView(Ui.spacer(activity, 10))
        workerError?.let { card.addView(diagnosticEntry(activity, "Background check", it)) }
        return card
    }

    private fun diagnosticEntry(activity: DashboardActivity, label: String, entry: SentinelDiagnostics.Entry): LinearLayout {
        val block = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        val time = runCatching {
            java.text.SimpleDateFormat("MMM d, h:mm a", java.util.Locale.getDefault())
                .format(java.util.Date(entry.atMillis))
        }.getOrDefault("")
        block.addView(Ui.monoText(activity, "$label · $time", 9f, Ui.color(activity, R.color.text_primary), bold = true).apply {
            letterSpacing = 0.08f
        })
        block.addView(Ui.spacer(activity, 4))
        block.addView(
            Ui.mutedText(activity, entry.text.lineSequence().take(8).joinToString("\n"))
        )
        return block
    }

    private fun buildNotificationCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Notification settings"))
        card.addView(Ui.spacer(activity, 4))
        card.addView(Ui.mutedText(activity, "Security alerts are sent to this address/number. Shared with the desktop app."))
        card.addView(Ui.spacer(activity, 12))

        val emailInput = labeledInput(activity, "Alert email address", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        card.addView(emailInput.first)
        card.addView(Ui.spacer(activity, 10))
        val phoneInput = labeledInput(activity, "Alert phone number", InputType.TYPE_CLASS_PHONE)
        card.addView(phoneInput.first)
        card.addView(Ui.spacer(activity, 12))

        val status = statusLine(activity)

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val settings = withContext(Dispatchers.IO) { activity.api.fetchNotificationSettings(activity.authToken) }
                emailInput.second.setText(settings.optString("alertEmailRecipient", ""))
                phoneInput.second.setText(settings.optString("alertPhoneNumber", ""))
            } catch (e: Exception) {
                status.text = "Failed to load: ${e.message}"
            }
        }

        val buttonRow = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
        buttonRow.addView(
            Ui.greenButton(activity, "Save") {
                CoroutineScope(Dispatchers.Main).launch {
                    status.text = "Saving..."
                    try {
                        withContext(Dispatchers.IO) {
                            activity.api.saveNotificationSettings(
                                activity.authToken,
                                emailInput.second.text.toString().trim(),
                                phoneInput.second.text.toString().trim()
                            )
                        }
                        status.text = "Settings saved."
                    } catch (e: Exception) {
                        status.text = "Failed to save: ${e.message}"
                    }
                }
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = Ui.dp(activity, 8) }
        )
        buttonRow.addView(
            Ui.outlineButton(activity, "Send Test Alert") {
                CoroutineScope(Dispatchers.Main).launch {
                    status.text = "Sending test alert..."
                    try {
                        val result = withContext(Dispatchers.IO) { activity.api.sendTestAlert(activity.authToken) }
                        status.text = describeTestResult(result)
                    } catch (e: Exception) {
                        status.text = "Failed to send test alert: ${e.message}"
                    }
                }
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        card.addView(buttonRow)
        card.addView(Ui.spacer(activity, 10))
        card.addView(status)
        return card
    }

    private fun describeTestResult(result: JSONObject): String {
        fun channel(name: String, key: String): String {
            val channelResult = result.optJSONObject(key) ?: return "$name: unknown"
            if (!channelResult.optBoolean("configured", false)) return "$name: not configured"
            return if (channelResult.optBoolean("sent", false)) "$name: sent" else "$name: failed"
        }
        return listOf(
            channel("Email", "email"),
            channel("Push", "push"),
            channel("SMS", "sms"),
            channel("Phone relay", "mobileRelay")
        ).joinToString(" · ")
    }

    private fun buildAccountCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Account"))
        card.addView(Ui.spacer(activity, 12))
        val usernameInput = labeledInput(activity, "Username", InputType.TYPE_CLASS_TEXT)
        card.addView(usernameInput.first)
        card.addView(Ui.spacer(activity, 12))
        val status = statusLine(activity)
        card.addView(
            Ui.greenButton(activity, "Save Username") {
                CoroutineScope(Dispatchers.Main).launch {
                    status.text = "Saving..."
                    try {
                        withContext(Dispatchers.IO) { activity.api.updateUsername(activity.authToken, usernameInput.second.text.toString().trim()) }
                        status.text = "Username updated."
                    } catch (e: Exception) {
                        status.text = "Failed: ${e.message}"
                    }
                }
            }
        )
        card.addView(Ui.spacer(activity, 8))
        card.addView(status)
        return card
    }

    private fun buildPasswordCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Change Password"))
        card.addView(Ui.spacer(activity, 12))
        val currentInput = labeledInput(activity, "Current password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        card.addView(currentInput.first)
        card.addView(Ui.spacer(activity, 10))
        val newInput = labeledInput(activity, "New password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        card.addView(newInput.first)
        card.addView(Ui.spacer(activity, 12))
        val status = statusLine(activity)
        card.addView(
            Ui.greenButton(activity, "Update Password") {
                CoroutineScope(Dispatchers.Main).launch {
                    status.text = "Updating..."
                    try {
                        withContext(Dispatchers.IO) {
                            activity.api.changePassword(activity.authToken, currentInput.second.text.toString(), newInput.second.text.toString())
                        }
                        status.text = "Password updated."
                        currentInput.second.setText("")
                        newInput.second.setText("")
                    } catch (e: Exception) {
                        status.text = "Failed: ${e.message}"
                    }
                }
            }
        )
        card.addView(Ui.spacer(activity, 8))
        card.addView(status)
        return card
    }

    private fun buildTrustedUsbCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Known USB Devices"))
        card.addView(Ui.spacer(activity, 4))
        card.addView(Ui.mutedText(activity, "Devices marked as known don't trigger an alert when plugged in."))
        card.addView(Ui.spacer(activity, 12))

        val listContainer = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        card.addView(listContainer)
        card.addView(Ui.spacer(activity, 12))

        val identifierInput = labeledInput(activity, "Device identifier", InputType.TYPE_CLASS_TEXT)
        card.addView(identifierInput.first)
        card.addView(Ui.spacer(activity, 10))
        val labelInput = labeledInput(activity, "Name", InputType.TYPE_CLASS_TEXT)
        card.addView(labelInput.first)
        card.addView(Ui.spacer(activity, 10))

        val status = statusLine(activity)

        fun reload() {
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    val devices = withContext(Dispatchers.IO) { activity.api.fetchTrustedUsbDevices(activity.authToken) }
                    renderTrustedUsbList(activity, listContainer, devices) { id ->
                        CoroutineScope(Dispatchers.Main).launch {
                            try {
                                withContext(Dispatchers.IO) { activity.api.removeTrustedUsbDevice(activity.authToken, id) }
                                reload()
                            } catch (e: Exception) {
                                Toast.makeText(activity, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                } catch (e: Exception) {
                    status.text = "Failed to load: ${e.message}"
                }
            }
        }

        card.addView(
            Ui.greenButton(activity, "Add") {
                val identifier = identifierInput.second.text.toString().trim()
                val label = labelInput.second.text.toString().trim()
                if (identifier.isBlank() || label.isBlank()) {
                    status.text = "Enter both an identifier and a name."
                    return@greenButton
                }
                CoroutineScope(Dispatchers.Main).launch {
                    status.text = "Adding..."
                    try {
                        withContext(Dispatchers.IO) { activity.api.addTrustedUsbDevice(activity.authToken, identifier, label) }
                        identifierInput.second.setText("")
                        labelInput.second.setText("")
                        status.text = ""
                        reload()
                    } catch (e: Exception) {
                        status.text = "Failed: ${e.message}"
                    }
                }
            }
        )
        card.addView(Ui.spacer(activity, 8))
        card.addView(status)

        reload()
        return card
    }

    private fun renderTrustedUsbList(activity: DashboardActivity, container: LinearLayout, devices: JSONArray, onRemove: (String) -> Unit) {
        container.removeAllViews()
        if (devices.length() == 0) {
            container.addView(Ui.mutedText(activity, "No trusted USB devices yet."))
            return
        }
        for (i in 0 until devices.length()) {
            val device = devices.getJSONObject(i)
            val id = device.optString("_id", device.optString("id", ""))
            val row = Ui.rowSpaceBetween(activity).apply {
                background = Ui.insetDrawable(activity)
                val pad = Ui.dp(activity, 10)
                setPadding(pad, pad, pad, pad)
            }
            val textColumn = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            textColumn.addView(
                TextView(activity).apply {
                    text = device.optString("label", "")
                    setTextColor(Ui.color(activity, R.color.text_primary))
                    typeface = Ui.mono(activity, 600)
                    textSize = 11f
                }
            )
            textColumn.addView(
                Ui.monoText(activity, device.optString("identifier", ""), 8f, Ui.color(activity, R.color.text_hint)).apply {
                    setPadding(0, Ui.dp(activity, 3), 0, 0)
                }
            )
            row.addView(textColumn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(
                TextView(activity).apply {
                    text = "REMOVE"
                    typeface = Ui.mono(activity, 600)
                    textSize = 8.5f
                    letterSpacing = 0.14f
                    setTextColor(Ui.color(activity, R.color.status_error))
                    setPadding(Ui.dp(activity, 8), Ui.dp(activity, 4), Ui.dp(activity, 8), Ui.dp(activity, 4))
                    setOnClickListener { if (id.isNotBlank()) onRemove(id) }
                }
            )
            container.addView(row)
            if (i < devices.length() - 1) container.addView(Ui.spacer(activity, 8))
        }
    }

    private fun statusLine(activity: DashboardActivity): TextView =
        Ui.monoText(activity, "", 9f, Ui.color(activity, R.color.text_hint)).apply {
            letterSpacing = 0.08f
        }

    private fun identityRow(activity: DashboardActivity, label: String, value: String): LinearLayout {
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(0, Ui.dp(activity, 8), 0, Ui.dp(activity, 8))
        }
        row.addView(Ui.hudLabel(activity, label))
        row.addView(
            Ui.monoText(activity, value, 8.5f, Ui.color(activity, R.color.text_primary), bold = true).apply {
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.MIDDLE
                gravity = android.view.Gravity.END
            },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = Ui.dp(activity, 12)
            }
        )
        return row
    }

    private fun buildIdentityCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Device identity"))
        card.addView(Ui.spacer(activity, 4))
        card.addView(Ui.mutedText(activity, "How this phone identifies itself to the command center."))
        card.addView(Ui.spacer(activity, 8))
        card.addView(identityRow(activity, "Device ID", SentinelPrefs.getOrCreatePhoneDeviceId(activity)))
        card.addView(Ui.divider(activity))
        card.addView(identityRow(activity, "Machine", Build.MODEL ?: "Android device"))
        card.addView(Ui.divider(activity))
        card.addView(identityRow(activity, "Platform", "Android ${Build.VERSION.RELEASE}"))
        card.addView(Ui.divider(activity))
        card.addView(identityRow(activity, "Relay", "SMS · paired"))
        return card
    }

    private fun buildCommandLinkCard(activity: DashboardActivity): LinearLayout {
        val card = Ui.card(activity)
        card.addView(Ui.sectionTitle(activity, "Command link"))
        card.addView(Ui.spacer(activity, 4))
        card.addView(Ui.mutedText(activity, "Open the full web console for the globe, timeline, reports and restore center."))
        card.addView(Ui.spacer(activity, 10))
        card.addView(
            Ui.outlineButton(activity, "Open web console") {
                runCatching {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SentinelPrefs.WEB_APP_BASE_URL)))
                }
            }
        )
        return card
    }

    private fun labeledInput(activity: DashboardActivity, label: String, inputType: Int): Pair<LinearLayout, EditText> {
        val wrapper = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        wrapper.addView(Ui.hudLabel(activity, label))
        wrapper.addView(Ui.spacer(activity, 5))
        val input = EditText(activity).apply {
            this.inputType = inputType
            typeface = Ui.mono(activity, 400)
            textSize = 12f
            includeFontPadding = false
            setTextColor(Ui.color(activity, R.color.text_primary))
            setHintTextColor(Ui.color(activity, R.color.text_hint))
            background = Ui.inputDrawable(activity)
            val pad = Ui.dp(activity, 12)
            setPadding(pad, pad, pad, pad)
        }
        wrapper.addView(input)
        return wrapper to input
    }
}
