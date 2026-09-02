package com.malmegaville.sentinel

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import okhttp3.OkHttpClient

private const val NOTIFICATION_CHANNEL_ID = "sms_relay_status"
private const val NOTIFICATION_ID = 1001

// Receives the "send this SMS" instruction pushed from the backend
// (mobilePushService.ts) and sends it through this phone's own SIM. Unlike
// the Windows agent's captures, which must stay invisible on a device
// someone has stolen, this phone never leaves the owner's hands - so unlike
// an earlier version of this file, failures are reported here via a local
// notification rather than swallowed silently, since there'd be no other
// way for the owner to ever find out something's wrong.
class SentinelFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] != "send_sms") {
            return
        }

        val to = data["to"]
        val body = data["body"]
        if (to.isNullOrBlank() || body.isNullOrBlank()) {
            notifyResult(success = false, detail = "Relay push was missing a phone number or message.")
            return
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            notifyResult(success = false, detail = "SMS permission isn't granted. Open the app and allow it.")
            return
        }

        try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(body)
            smsManager.sendMultipartTextMessage(to, null, parts, null, null)
            // This confirms the OS accepted and dispatched the message, not that
            // it was actually delivered by the carrier - if it never arrives
            // despite this succeeding, the most likely cause is an incorrect
            // destination number.
            notifyResult(success = true, detail = "Relayed an alert to $to.")
        } catch (e: Exception) {
            notifyResult(success = false, detail = "Could not text $to: ${e.message}")
        }
    }

    private fun notifyResult(success: Boolean, detail: String) {
        ensureNotificationChannel()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(if (success) "SMS relay sent" else "SMS relay failed")
            .setContentText(detail)
            .setStyle(NotificationCompat.BigTextStyle().bigText(detail))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return

        manager.createNotificationChannel(
            NotificationChannel(NOTIFICATION_CHANNEL_ID, "SMS relay status", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Tells you whether an SMS alert was relayed successfully."
            }
        )
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
