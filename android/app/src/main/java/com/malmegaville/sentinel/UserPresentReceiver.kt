package com.malmegaville.sentinel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Best-effort, faster supplementary check: fires immediately when the phone
// is unlocked, if the app's process happens to still be alive to receive it.
// The periodic WorkManager job is the reliable path when it isn't - Android
// can and does kill dynamically-registered receivers' host process.
class UserPresentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_USER_PRESENT) return

        val prefs = context.getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        if (prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null) != null) {
            LostDeviceWorker.runOnce(context, "phone_check")
        }
    }
}
