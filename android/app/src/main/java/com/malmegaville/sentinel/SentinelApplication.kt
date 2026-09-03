package com.malmegaville.sentinel

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

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

        val userPresentReceiver = UserPresentReceiver()
        registerReceiver(userPresentReceiver, IntentFilter(Intent.ACTION_USER_PRESENT))

        val usbConnectedReceiver = UsbConnectedReceiver()
        registerReceiver(usbConnectedReceiver, IntentFilter(Intent.ACTION_POWER_CONNECTED))
    }
}
