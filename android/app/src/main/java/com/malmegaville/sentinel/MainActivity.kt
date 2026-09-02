package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
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
// interaction needed - see SentinelFirebaseMessagingService. Styling
// mirrors the web dashboard's AuthCard (frontend/src/components/AuthCard.tsx)
// and its brand palette (frontend/tailwind.config.ts) so this reads as the
// same product, not a bare utility screen.
class MainActivity : AppCompatActivity() {

    private val httpClient = OkHttpClient()
    private lateinit var prefs: SharedPreferences
    private lateinit var statusText: TextView
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { /* no-op */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        setContentView(buildUi())

        requestRuntimePermissions()
        restoreSession()
    }

    private fun buildUi(): ScrollView {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()

        val outer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.brand_dark))
            setPadding(dp(24), dp(48), dp(24), dp(48))
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_card)
            setPadding(dp(28), dp(32), dp(28), dp(28))
        }

        card.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                layoutParams = LinearLayout.LayoutParams(dp(88), dp(88)).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    bottomMargin = dp(16)
                }
            }
        )

        card.addView(
            TextView(this).apply {
                text = "MalmegaVille Sentinel"
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
                textSize = 20f
                setTypeface(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER
            }
        )

        card.addView(
            TextView(this).apply {
                text = "Sign in to pair this phone. It will relay SMS alerts for a lost/stolen " +
                    "device in the background - nothing else to do here afterward."
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_muted))
                textSize = 14f
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, dp(24))
            }
        )

        emailInput = styledInput("Email", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        card.addView(emailInput, formFieldParams(::dp))

        passwordInput = styledInput("Password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        card.addView(passwordInput, formFieldParams(::dp))

        card.addView(
            Button(this).apply {
                text = "Sign In & Pair This Phone"
                isAllCaps = false
                setTextColor(Color.BLACK)
                setTypeface(typeface, Typeface.BOLD)
                background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_button_green)
                setOnClickListener { signInAndPair() }
            },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply {
                topMargin = dp(4)
            }
        )

        statusText = TextView(this).apply {
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_muted))
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, 0)
        }
        card.addView(statusText)

        outer.addView(
            card,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        )

        return ScrollView(this).apply { addView(outer) }
    }

    private fun styledInput(hintText: String, type: Int): EditText = EditText(this).apply {
        hint = hintText
        inputType = type
        setHintTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_hint))
        setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
        background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_input)
    }

    private fun formFieldParams(dp: (Int) -> Int) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(14)
        }

    private fun setStatus(message: String, tone: StatusTone = StatusTone.MUTED) {
        val colorRes = when (tone) {
            StatusTone.MUTED -> R.color.text_muted
            StatusTone.SUCCESS -> R.color.brand_green
            StatusTone.ERROR -> R.color.status_error
        }
        statusText.text = message
        statusText.setTextColor(ContextCompat.getColor(this, colorRes))
    }

    private enum class StatusTone { MUTED, SUCCESS, ERROR }

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(Manifest.permission.SEND_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val notGranted = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (notGranted.isNotEmpty()) {
            requestPermissionLauncher.launch(notGranted.toTypedArray())
        }
    }

    private fun restoreSession() {
        val token = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
        if (token == null) {
            setStatus("Not signed in.")
            return
        }
        // Already signed in - go straight to the dashboard, same as any app
        // that remembers you; re-pairing (in case the push token rotated)
        // happens quietly in the background rather than blocking navigation.
        registerDeviceToken(token, silent = true)
        goToDashboard()
    }

    private fun signInAndPair() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Enter your email and password.", Toast.LENGTH_SHORT).show()
            return
        }

        setStatus("Signing in...")

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val token = withContext(Dispatchers.IO) { login(email, password) }
                prefs.edit().putString(SentinelPrefs.KEY_AUTH_TOKEN, token).apply()
                registerDeviceToken(token, silent = true)
                goToDashboard()
            } catch (e: Exception) {
                setStatus("Sign-in failed: ${e.message}", StatusTone.ERROR)
            }
        }
    }

    private fun goToDashboard() {
        startActivity(android.content.Intent(this, DashboardActivity::class.java))
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
