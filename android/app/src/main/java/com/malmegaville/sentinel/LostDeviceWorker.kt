package com.malmegaville.sentinel

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

// The Android equivalent of the Windows agent's own lost-device monitoring
// (SystemMonitoringHostedService + LostStatusClient + WebcamCapture +
// LocationCapture): checks whether THIS phone is flagged lost, and if so,
// captures a photo + location and reports it - through the normal backend
// API when there's internet, or via a direct SMS (using this phone's own
// SIM, no internet needed) when there isn't, mirroring the PC's own
// direct-modem SMS fallback.
//
// Android platform limits that don't exist on Windows: periodic background
// work can't run more often than every 15 minutes (an OS floor, not
// something configurable here), and camera/location need a one-time visible
// permission prompt rather than the silent grant used on Windows.
class LostDeviceWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val api = SentinelApiClient()

    override suspend fun doWork(): Result {
        // This worker runs constantly in the background (every 15 minutes,
        // plus every unlock) and shares the same process as whatever
        // Activity the user has open - an uncaught exception anywhere below
        // doesn't just fail this one check-in, it crashes the whole app,
        // which is exactly what "MalmegaVille keeps stopping" at seemingly
        // random moments turned out to be. A wide catch-all here is the
        // right tradeoff: a failed check-in silently retrying next cycle
        // beats taking the whole app down.
        return try {
            doWorkInternal()
        } catch (e: Exception) {
            Result.success()
        }
    }

    private suspend fun doWorkInternal(): Result {
        val prefs = applicationContext.getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        if (prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null) == null) {
            return Result.success()
        }

        val deviceId = SentinelPrefs.getOrCreatePhoneDeviceId(applicationContext)
        val trigger = inputData.getString(KEY_TRIGGER) ?: "phone_check"

        // Checking "am I lost?" is itself a network call - with no internet
        // at all, it fails before ever learning the answer, which would
        // otherwise make the SMS fallback below unreachable exactly when
        // it's needed most. So the last successful answer is cached and
        // reused here, the same way the Windows agent's LostStatusClient
        // keeps serving its last known value when a refresh fails.
        val freshStatus = runCatching { withContext(Dispatchers.IO) { api.checkLostStatus(deviceId) } }.getOrNull()
        if (freshStatus != null) {
            prefs.edit()
                .putBoolean(KEY_CACHED_IS_LOST, freshStatus.optBoolean("isLost", false))
                .putString(KEY_CACHED_OWNER_PHONE, freshStatus.optString("phoneNumber", ""))
                .apply()
        }

        val isLost = freshStatus?.optBoolean("isLost", false) ?: prefs.getBoolean(KEY_CACHED_IS_LOST, false)
        if (!isLost) {
            return Result.success()
        }

        val ownerPhoneNumber = (freshStatus?.optString("phoneNumber", "") ?: prefs.getString(KEY_CACHED_OWNER_PHONE, ""))
            ?.takeIf { it.isNotBlank() }
        val capturedAt = Instant.now().toString()
        val location = getCurrentLocation(applicationContext)

        if (hasInternetConnection(applicationContext)) {
            // Android blocks camera access from a plain background process
            // since Android 9 - not a bug to work around, a deliberate
            // anti-spyware protection with no silent bypass. Verified live:
            // capture succeeded once right after the app was foregrounded,
            // then failed on every later background-triggered unlock.
            // Briefly promoting to a foreground service (which forces a
            // visible notification for the few seconds capture takes - an
            // Android requirement, not a choice) is the only way to get a
            // real camera fix from here.
            runCatching { setForeground(createCaptureForegroundInfo()) }
            val photoBytes = runCatching { PhoneCameraCapture.captureJpeg(applicationContext) }.getOrNull()
            if (photoBytes != null) {
                runCatching {
                    withContext(Dispatchers.IO) { api.uploadSelfCapturePhoto(deviceId, trigger, capturedAt, photoBytes) }
                }
            }
            runCatching {
                withContext(Dispatchers.IO) {
                    api.uploadSelfCaptureLocation(
                        deviceId, trigger, capturedAt,
                        location?.latitude, location?.longitude, location?.accuracy
                    )
                }
            }
        } else if (ownerPhoneNumber != null && canSendThrottledSms(prefs)) {
            // No internet at all - the same "no internet required" fallback
            // the Windows agent's own modem-SMS path provides, just from the
            // lost phone's side instead of a lost PC's side. Throttled to at
            // most once an hour (see canSendThrottledSms) - the 15-minute
            // check-in interval alone would otherwise text on every single
            // cycle for as long as the phone stays lost and offline.
            val text = if (location != null) {
                "MalmegaVille Sentinel: this device was accessed while marked lost. " +
                    "Location: https://maps.google.com/?q=${location.latitude},${location.longitude}"
            } else {
                "MalmegaVille Sentinel: this device was accessed while marked lost. Location unavailable."
            }
            if (SentinelPrefs.sendSms(ownerPhoneNumber, text)) {
                prefs.edit().putLong(KEY_LAST_SMS_SENT_AT, System.currentTimeMillis()).apply()
            }
        }

        return Result.success()
    }

    // Deliberately requests a fresh-ish fix rather than the passively cached
    // "last known location" - the phone may well have moved since whatever
    // last determined that cached value, which could be stale by hours. High
    // accuracy specifically favors GPS, the only positioning method that
    // works with zero internet at all (WiFi/cell-tower positioning both
    // require looking the signal up against an online database).
    //
    // Uses CurrentLocationRequest with an explicit 25s window and accepts a
    // fix up to 2 minutes old, rather than the bare Priority overload with no
    // timeout - a brand new GPS fix can take a while to acquire (especially
    // indoors), and without a bound this either waited indefinitely or the
    // underlying implementation gave up too quickly, silently falling back
    // to the server's much less accurate IP-based location every time.
    private suspend fun getCurrentLocation(context: Context): Location? {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) return null

        val client = LocationServices.getFusedLocationProviderClient(context)
        val cancellationSource = CancellationTokenSource()
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(25_000)
            .setMaxUpdateAgeMillis(2 * 60 * 1000)
            .build()
        return suspendCancellableCoroutine { continuation ->
            try {
                client.getCurrentLocation(request, cancellationSource.token)
                    .addOnSuccessListener { location -> if (continuation.isActive) continuation.resume(location) }
                    .addOnFailureListener { if (continuation.isActive) continuation.resume(null) }
                continuation.invokeOnCancellation { cancellationSource.cancel() }
            } catch (e: Exception) {
                // Was SecurityException-only - too narrow. Play Services can
                // throw other things too (an outdated/misbehaving Play
                // Services install being the likeliest culprit on a less
                // common OEM device), and those weren't being caught here at
                // all, crashing the whole app from a background worker.
                if (continuation.isActive) continuation.resume(null)
            }
        }
    }

    // Worded generically on purpose - this can run while whoever currently
    // has the phone unlocks it, and the point of the capture is to identify
    // them, not warn them it's happening.
    private fun createCaptureForegroundInfo(): ForegroundInfo {
        val channelId = "sentinel_security_check"
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val existing = manager.getNotificationChannel(channelId)
            if (existing == null) {
                manager.createNotificationChannel(
                    NotificationChannel(channelId, "Security check", NotificationManager.IMPORTANCE_MIN)
                )
            }
        }
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setContentTitle("MalmegaVille Sentinel")
            .setContentText("Running a security check…")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun canSendThrottledSms(prefs: android.content.SharedPreferences): Boolean {
        val lastSentAt = prefs.getLong(KEY_LAST_SMS_SENT_AT, 0L)
        return System.currentTimeMillis() - lastSentAt >= SMS_THROTTLE_MILLIS
    }

    // NET_CAPABILITY_VALIDATED requires Android to have already finished its
    // own background connectivity probe (an HTTP check to a Google server)
    // for the active network - right after an unlock, or on carriers that
    // interfere with that probe, this can still be false for a genuinely
    // working connection. Verified live: this caused the offline SMS
    // fallback to fire (and the much less accurate server-side IP location
    // to be used instead of GPS) on a phone that actually had data the whole
    // time. NET_CAPABILITY_INTERNET alone (the network's own declared
    // capability) is a looser but much more reliable signal for "is there
    // actually a network to try".
    private fun hasInternetConnection(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    companion object {
        const val KEY_TRIGGER = "trigger"
        private const val KEY_CACHED_IS_LOST = "cached_is_lost"
        private const val KEY_CACHED_OWNER_PHONE = "cached_owner_phone"
        private const val KEY_LAST_SMS_SENT_AT = "last_lost_device_sms_sent_at"
        private val SMS_THROTTLE_MILLIS = TimeUnit.HOURS.toMillis(1)
        private const val NOTIFICATION_ID = 4171
        private const val UNIQUE_PERIODIC_NAME = "lost_device_periodic_check"

        // The 15-minute interval is WorkManager's enforced minimum for
        // periodic work - Android does not allow more frequent background
        // scheduling for regular apps.
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<LostDeviceWorker>(15, TimeUnit.MINUTES)
                .setInputData(workDataOf(KEY_TRIGGER to "phone_check"))
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        // Best-effort immediate check (e.g. right after unlock), on top of
        // the guaranteed periodic schedule above.
        fun runOnce(context: Context, trigger: String) {
            val request = OneTimeWorkRequestBuilder<LostDeviceWorker>()
                .setInputData(workDataOf(KEY_TRIGGER to trigger))
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
