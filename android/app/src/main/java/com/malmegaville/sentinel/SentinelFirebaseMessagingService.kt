package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import okhttp3.OkHttpClient

// Receives the "send this SMS" instruction pushed from the backend
// (mobilePushService.ts) and sends it through this phone's own SIM. A
// data-only message - delivered to this service whenever the app has SMS
// permission and is installed, with no notification shown and no user
// interaction needed, the same way the Windows agent's own captures are
// silent: nothing should visibly announce this app's presence or purpose on
// a device someone has stolen.
class SentinelFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] != "send_sms") {
            return
        }

        val to = data["to"] ?: return
        val body = data["body"] ?: return

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(body)
            smsManager.sendMultipartTextMessage(to, null, parts, null, null)
        } catch (e: Exception) {
            // Best effort - no local error surface, for the reason above.
        }
    }

    override fun onNewToken(token: String) {
        // Firebase can rotate this token at any time; re-register it
        // immediately if we have a stored session, rather than waiting for
        // the user to reopen the app.
        val prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        val authToken = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null) ?: return

        Thread {
            try {
                SentinelPrefs.registerDeviceWithBackend(OkHttpClient(), authToken, token)
            } catch (e: Exception) {
                // Best effort - the app will re-register this on next open anyway.
            }
        }.start()
    }
}
