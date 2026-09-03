package com.malmegaville.sentinel

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.telephony.SmsManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

// Shared constants and the device-registration call, used by both
// MainActivity (initial pairing) and SentinelFirebaseMessagingService
// (silently re-registering when Firebase rotates the push token).
object SentinelPrefs {
    const val NAME = "sentinel_prefs"
    const val KEY_AUTH_TOKEN = "auth_token"
    const val KEY_PHONE_DEVICE_ID = "phone_device_id"
    const val BACKEND_BASE_URL = "https://app-production-fd2d.up.railway.app/api"
    // The web dashboard's own domain (no /api suffix) - for our own hosted
    // pages like map-viewer.html, kept in-app via a WebView rather than
    // handing the user off to a separate Maps app.
    const val WEB_APP_BASE_URL = "https://app-production-fd2d.up.railway.app"

    // A stable identifier for the phone itself, separate from its FCM push
    // token (which is for the relay-pairing feature and rotates over time) -
    // this is what the phone registers as a trackable Device and reports its
    // own lost-status checks under, mirroring DeviceIdentity.cs on Windows.
    //
    // Backed by ANDROID_ID (stable for this app's signing key across
    // uninstall/reinstall - it only changes on factory reset) rather than a
    // random UUID cached in SharedPreferences, which a reinstall wipes.
    // Verified live: a UUID here meant every reinstall registered as a brand
    // new "device" in the account's inventory instead of the same phone
    // checking back in. Falls back to a generated id in the rare case
    // ANDROID_ID is unavailable (some emulators return null/"9774d56d...").
    fun getOrCreatePhoneDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
            return "android-$androidId"
        }

        val existing = prefs.getString(KEY_PHONE_DEVICE_ID, null)
        if (existing != null) return existing
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_PHONE_DEVICE_ID, created).apply()
        return created
    }

    // Shared by the SMS-relay feature (texting on another lost device's
    // behalf) and the lost-device-self-monitoring SMS fallback (this phone
    // reporting on itself when it has no internet).
    fun sendSms(to: String, body: String): Boolean {
        return try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(body)
            smsManager.sendMultipartTextMessage(to, null, parts, null, null)
            true
        } catch (e: Exception) {
            false
        }
    }

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
