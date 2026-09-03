package com.malmegaville.sentinel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

// Thieves often plug a stolen phone into a computer to "flash" it (wipe or
// reflash firmware to erase evidence and bypass locks). This fires an
// immediate check-in the moment the phone is connected via USB, on top of
// the guaranteed 15-minute periodic one.
//
// Real limitation, not glossed over: Android can tell "connected via USB"
// apart from wireless charging, but not "plugged into a computer" apart
// from "plugged into an ordinary USB wall charger" - both report the same
// state at this level. An ordinary charger will also trigger this; that's a
// harmless extra check, not a false alarm sent anywhere.
class UsbConnectedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_POWER_CONNECTED) return

        val prefs = context.getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        if (prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null) == null) return

        val batteryStatus = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val plugged = batteryStatus?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
        if (plugged != BatteryManager.BATTERY_PLUGGED_USB) return

        LostDeviceWorker.runOnce(context, "usb_connect")
    }
}
