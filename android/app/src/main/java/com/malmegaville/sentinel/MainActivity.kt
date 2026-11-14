package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

// This is the only place the account's credentials ever get used; once
// signed in, the app relays SMS in the background with no further UI
// interaction needed - see SentinelFirebaseMessagingService. Styled as the
// AuthCard.tsx "SECURE ACCESS" panel so the phone opens inside the exact same
// console the web dashboard and the Windows agent run in.
class MainActivity : AppCompatActivity() {

    private val httpClient = OkHttpClient()
    private val api = SentinelApiClient(httpClient)
    private lateinit var prefs: SharedPreferences
    private lateinit var statusText: TextView
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val gotForegroundLocation = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (gotForegroundLocation) requestBackgroundLocationIfNeeded()
        }

    // Android requires background location to be requested as its own
    // separate step, only after foreground location is already granted -
    // asking for it together with the others in one batch is silently
    // ignored by the system. Without it, a location fix attempted while the
    // app isn't in the foreground (the self-monitoring worker's normal case)
    // can fail outright instead of returning a real GPS position.
    private val requestBackgroundLocationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op either way - foreground location alone still lets the app work */ }

    private fun requestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED) return
        requestBackgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        setContentView(buildUi())

        SentinelSound.boot(this)
        requestRuntimePermissions()
        restoreSession()
    }

    private fun buildUi(): View {
        fun dp(value: Int) = Ui.dp(this, value)
        val green = Ui.color(this, R.color.brand_green)

        val root = FrameLayout(this).apply {
            background = HudBackdropDrawable(this@MainActivity)
        }

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        root.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        // Centering host: a ScrollView child only gets a viewport height with
        // fillViewport, so the card sits optically centred on tall phones and
        // still scrolls on short ones.
        val host = FrameLayout(this)
        scroll.addView(host, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.panelDrawable(this@MainActivity)
            setPadding(dp(22), dp(24), dp(22), dp(22))
        }
        host.addView(
            card,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
                leftMargin = dp(16)
                rightMargin = dp(16)
                topMargin = dp(24)
                bottomMargin = dp(24)
            }
        )

        // Brand crest in a neon-bordered tile, matching AuthCard.tsx.
        val logoBox = FrameLayout(this).apply {
            background = HoloDrawable(
                fillColor = Ui.withAlpha(green, 0x1A),
                strokeColor = Ui.withAlpha(green, 0x80),
                accentColor = green,
                cutPx = 0f,
                strokePx = 1f,
                bracketOffsetPx = 0f,
                showBrackets = false
            )
            layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).apply { gravity = Gravity.CENTER_HORIZONTAL }
        }
        logoBox.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setPadding(dp(8), dp(8), dp(8), dp(8))
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        card.addView(logoBox)

        card.addView(Ui.spacer(this, 12))
        card.addView(
            Ui.monoText(this, "MALMEGAVILLE SENTINEL", 8.5f, Ui.withAlpha(green, 0xCC)).apply {
                gravity = Gravity.CENTER
                letterSpacing = 0.32f
            }
        )
        card.addView(
            Ui.monoValue(this, "SECURE ACCESS", 20f).apply {
                gravity = Gravity.CENTER
                letterSpacing = 0.16f
                setPadding(0, dp(6), 0, 0)
            }
        )
        card.addView(
            Ui.monoText(this, "AUTHORIZED PERSONNEL ONLY", 8.5f, Ui.color(this@MainActivity, R.color.text_hint)).apply {
                gravity = Gravity.CENTER
                letterSpacing = 0.2f
                setPadding(0, dp(6), 0, 0)
            }
        )

        card.addView(Ui.spacer(this, 16))
        card.addView(Ui.divider(this))
        card.addView(Ui.spacer(this, 16))

        card.addView(Ui.hudLabel(this, "Operator email"))
        emailInput = styledInput("operator@domain", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        card.addView(emailInput, fieldParams(::dp, top = 6, bottom = 14))

        card.addView(Ui.hudLabel(this, "Passphrase"))
        passwordInput = styledInput("••••••••", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        card.addView(passwordInput, fieldParams(::dp, top = 6, bottom = 14))

        statusText = TextView(this).apply {
            typeface = Ui.mono(this@MainActivity, 400)
            textSize = 9.5f
            letterSpacing = 0.06f
            setLineSpacing(0f, 1.2f)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            visibility = View.GONE
        }
        card.addView(statusText, fieldParams(::dp, top = 0, bottom = 12))

        card.addView(
            Ui.primaryButton(this, "JACK IN") { signInAndPair() },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply {
                topMargin = dp(2)
            }
        )

        card.addView(Ui.spacer(this, 16))
        card.addView(Ui.divider(this))
        card.addView(Ui.spacer(this, 12))
        card.addView(
            Ui.monoText(this, "TLS CHANNEL · CREDENTIALS NEVER LEAVE THE VAULT", 7.5f, Ui.color(this@MainActivity, R.color.text_hint)).apply {
                gravity = Gravity.CENTER
                letterSpacing = 0.16f
            }
        )

        // Same chassis as the signed-in console: frame brackets + slow scan band.
        root.addView(
            View(this).apply {
                background = ConsoleFrameDrawable(this@MainActivity)
                isClickable = false
                isFocusable = false
            },
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        root.addView(
            ScanlineView(this),
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )

        return root
    }

    private fun styledInput(hintText: String, type: Int): EditText =
        Ui.textInput(this, hintText, type).apply {
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    if (count != before) SentinelSound.key(this@MainActivity)
                }
                override fun afterTextChanged(s: android.text.Editable?) = Unit
            })
        }

    private fun fieldParams(dp: (Int) -> Int, top: Int, bottom: Int) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(top)
            bottomMargin = dp(bottom)
        }

    private fun setStatus(message: String, tone: StatusTone = StatusTone.MUTED) {
        if (message.isBlank()) {
            statusText.visibility = View.GONE
            return
        }
        val colorInt = when (tone) {
            StatusTone.MUTED -> Ui.color(this, R.color.hud_label)
            StatusTone.SUCCESS -> Ui.color(this, R.color.brand_green)
            StatusTone.ERROR -> Ui.color(this, R.color.status_error)
        }
        statusText.text = message.uppercase()
        statusText.setTextColor(colorInt)
        statusText.background = HoloDrawable(
            fillColor = Ui.withAlpha(colorInt, if (tone == StatusTone.MUTED) 0x0F else 0x1A),
            strokeColor = Ui.withAlpha(colorInt, if (tone == StatusTone.MUTED) 0x33 else 0x66),
            accentColor = colorInt,
            cutPx = 0f,
            strokePx = 1f,
            bracketOffsetPx = 0f,
            showBrackets = false
        )
        statusText.visibility = View.VISIBLE
    }

    private enum class StatusTone { MUTED, SUCCESS, ERROR }

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val notGranted = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (notGranted.isNotEmpty()) {
            requestPermissionLauncher.launch(notGranted.toTypedArray())
        } else {
            // Foreground location was already granted from a previous
            // install of the app - the launcher callback above only fires
            // for a request made just now, so this covers that case too.
            requestBackgroundLocationIfNeeded()
        }
    }

    private fun restoreSession() {
        val token = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
        if (token == null) {
            return
        }
        // Already signed in - go straight to the dashboard, same as any app
        // that remembers you; re-pairing (in case the push token rotated)
        // happens quietly in the background rather than blocking navigation.
        registerDeviceToken(token, silent = true)
        activateLostDeviceMonitoring(token)
        goToDashboard()
    }

    private fun signInAndPair() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isEmpty() || password.isEmpty()) {
            setStatus("Enter your email and passphrase.", StatusTone.ERROR)
            return
        }

        setStatus("Verifying credentials…")
        SentinelSound.boot(this)

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val token = withContext(Dispatchers.IO) { login(email, password) }
                prefs.edit().putString(SentinelPrefs.KEY_AUTH_TOKEN, token).apply()
                registerDeviceToken(token, silent = true)
                activateLostDeviceMonitoring(token)
                goToDashboard(justAuthenticated = true)
            } catch (e: Exception) {
                SentinelSound.deny(this@MainActivity)
                SentinelCinematic.show(this@MainActivity, granted = false)
                setStatus("Access denied · ${e.message}", StatusTone.ERROR)
            }
        }
    }

    // Registers this phone as a trackable Device (so it can be marked
    // lost/found from the dashboard like a PC) and schedules the periodic
    // check-in that watches for that flag. Best-effort and silent - failures
    // here shouldn't block sign-in, and there's nothing useful to show the
    // user about a background registration succeeding or not.
    private fun activateLostDeviceMonitoring(authToken: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val deviceId = SentinelPrefs.getOrCreatePhoneDeviceId(applicationContext)
                val osLabel = "Android ${Build.VERSION.RELEASE}"
                api.registerAsDevice(authToken, deviceId, Build.MODEL ?: "Android device", osLabel)
                LostDeviceWorker.schedulePeriodic(applicationContext)
            } catch (e: Exception) {
                // Best effort - will retry next time this is called (app open).
            }
        }
    }

    private fun goToDashboard(justAuthenticated: Boolean = false) {
        startActivity(
            android.content.Intent(this, DashboardActivity::class.java)
                .putExtra(DashboardActivity.EXTRA_JUST_AUTHENTICATED, justAuthenticated)
        )
        finish()
    }

    private fun login(email: String, password: String): String {
        val json = JSONObject().put("email", email).put("password", password)
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${SentinelPrefs.BACKEND_BASE_URL}/auth/login")
            .post(body)
            .build()

        httpClient.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(responseBody).optString("message") }.getOrNull()
                throw IOException(message?.takeIf { it.isNotBlank() } ?: "Login failed (${response.code}).")
            }
            return JSONObject(responseBody).getString("token")
        }
    }

    private fun registerDeviceToken(authToken: String, silent: Boolean = false) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                if (!silent) setStatus("Could not get a push token: ${task.exception?.message}", StatusTone.ERROR)
                return@addOnCompleteListener
            }
            val fcmToken = task.result

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    SentinelPrefs.registerDeviceWithBackend(httpClient, authToken, fcmToken)
                    if (!silent) {
                        withContext(Dispatchers.Main) {
                            setStatus("Paired. This phone will relay SMS alerts when needed.", StatusTone.SUCCESS)
                        }
                    }
                } catch (e: Exception) {
                    if (!silent) {
                        withContext(Dispatchers.Main) {
                            setStatus("Pairing failed: ${e.message}", StatusTone.ERROR)
                        }
                    }
                }
            }
        }
    }
}
