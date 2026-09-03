package com.malmegaville.sentinel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Reschedules the periodic lost-device check-in after a reboot - WorkManager
// re-registers its own pending jobs on boot in most cases, but this makes it
// explicit and doesn't depend on that implementation detail.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        if (prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null) != null) {
            LostDeviceWorker.schedulePeriodic(context)
        }
    }
}
