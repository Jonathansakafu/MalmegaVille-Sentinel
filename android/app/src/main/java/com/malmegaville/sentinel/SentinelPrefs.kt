package com.malmegaville.sentinel

import android.os.Build
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

// Shared constants and the device-registration call, used by both
// MainActivity (initial pairing) and SentinelFirebaseMessagingService
// (silently re-registering when Firebase rotates the push token).
object SentinelPrefs {
    const val NAME = "sentinel_prefs"
    const val KEY_AUTH_TOKEN = "auth_token"
    const val BACKEND_BASE_URL = "https://app-production-fd2d.up.railway.app/api"

    fun registerDeviceWithBackend(httpClient: OkHttpClient, authToken: String, fcmToken: String) {
        val json = JSONObject()
            .put("fcmToken", fcmToken)
            .put("deviceLabel", Build.MODEL ?: "Android device")
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$BACKEND_BASE_URL/mobile-devices/register")
            .addHeader("Authorization", "Bearer $authToken")
            .post(body)
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Registration failed (${response.code}).")
            }
        }
    }
}
