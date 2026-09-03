package com.malmegaville.sentinel

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.core.content.ContextCompat

// ACTION_USER_PRESENT (unlock) and ACTION_POWER_CONNECTED (USB) are implicit
// broadcasts, and since Android 8.0 the OS simply does not deliver most
// implicit broadcasts to a <receiver> declared in the manifest - only a
// small exempted list (BOOT_COMPLETED among them) still works that way.
// UserPresentReceiver/UsbConnectedReceiver were declared exactly that way
// and, verified live, never fired at all - not "unreliable", never once.
// Registering them dynamically here instead is the only way they can fire,
// and works whenever this process is alive (the dashboard is open, the
// periodic WorkManager job is running, a push just woke the process, etc.);
// it still won't fire if the OS has fully killed the process in the
// background, which is what the guaranteed 15-minute periodic job in
// LostDeviceWorker is for.
class SentinelApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Android 13+ throws a SecurityException from the plain 2-arg
        // registerReceiver() for a targetSdk 34 app unless an export flag is
        // given - ContextCompat.registerReceiver handles that correctly
        // (and is a no-op difference on older OS versions). NOT_EXPORTED
        // since only the OS itself, never another app, should be able to
        // trigger these.
        // This runs unconditionally on every single process start, before
        // any Activity - a failure here means the app can never open at
        // all, not just this one feature failing. Both receivers are a
        // nice-to-have fast path on top of the guaranteed 15-minute
        // periodic job, so losing them is far preferable to losing the app.
        try {
            val userPresentReceiver = UserPresentReceiver()
            ContextCompat.registerReceiver(
                this, userPresentReceiver, IntentFilter(Intent.ACTION_USER_PRESENT), ContextCompat.RECEIVER_NOT_EXPORTED
            )

            val usbConnectedReceiver = UsbConnectedReceiver()
            ContextCompat.registerReceiver(
                this, usbConnectedReceiver, IntentFilter(Intent.ACTION_POWER_CONNECTED), ContextCompat.RECEIVER_NOT_EXPORTED
            )
        } catch (e: Exception) {
            // Best effort - see comment above.
        }
    }
}
