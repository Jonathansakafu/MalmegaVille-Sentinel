package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
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
// interaction needed - see SentinelFirebaseMessagingService.
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

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
        }

        root.addView(
            TextView(this).apply {
                text = "MalmegaVille Sentinel"
                textSize = 22f
            }
        )

        root.addView(
            TextView(this).apply {
                text = "Sign in to pair this phone. It will relay SMS alerts for a lost/stolen " +
                    "device in the background - nothing else to do here afterward."
                textSize = 14f
                setPadding(0, 0, 0, 32)
            }
        )

        emailInput = EditText(this).apply {
            hint = "Email"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        root.addView(emailInput)

        passwordInput = EditText(this).apply {
            hint = "Password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(passwordInput)

        root.addView(
            Button(this).apply {
                text = "Sign In & Pair This Phone"
                setOnClickListener { signInAndPair() }
            }
        )

        statusText = TextView(this).apply {
            setPadding(0, 32, 0, 0)
        }
        root.addView(statusText)

        setContentView(root)

        requestRuntimePermissions()
        restoreSession()
    }

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
            statusText.text = "Not signed in."
            return
        }
        statusText.text = "Signed in. Re-pairing device..."
        registerDeviceToken(token)
    }

    private fun signInAndPair() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Enter your email and password.", Toast.LENGTH_SHORT).show()
            return
        }

        statusText.text = "Signing in..."

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val token = withContext(Dispatchers.IO) { login(email, password) }
                prefs.edit().putString(SentinelPrefs.KEY_AUTH_TOKEN, token).apply()
                statusText.text = "Signed in. Pairing device..."
                registerDeviceToken(token)
            } catch (e: Exception) {
                statusText.text = "Sign-in failed: ${e.message}"
            }
        }
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

    private fun registerDeviceToken(authToken: String) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                statusText.text = "Could not get a push token: ${task.exception?.message}"
                return@addOnCompleteListener
            }
            val fcmToken = task.result

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    SentinelPrefs.registerDeviceWithBackend(httpClient, authToken, fcmToken)
                    withContext(Dispatchers.Main) {
                        statusText.text = "Paired. This phone will relay SMS alerts when needed."
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        statusText.text = "Pairing failed: ${e.message}"
                    }
                }
            }
        }
    }
}
