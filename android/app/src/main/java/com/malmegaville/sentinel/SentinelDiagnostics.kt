package com.malmegaville.sentinel

import android.content.Context
import android.content.SharedPreferences

// Keeps the last fatal crash and the last background-check failure on the
// device itself. There is no crash-reporting backend, and "the app keeps
// stopping" is impossible to diagnose from the dashboard alone - these are
// surfaced under Settings -> Diagnostics so the phone can report on itself.
object SentinelDiagnostics {

    private const val KEY_LAST_CRASH_AT = "diag_last_crash_at"
    private const val KEY_LAST_CRASH_TEXT = "diag_last_crash_text"
    private const val KEY_LAST_WORKER_ERROR_AT = "diag_last_worker_error_at"
    private const val KEY_LAST_WORKER_ERROR_TEXT = "diag_last_worker_error_text"
    private const val MAX_STORED_CHARS = 4000

    data class Entry(val atMillis: Long, val text: String)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)

    fun recordCrash(context: Context, throwable: Throwable) {
        prefs(context).edit()
            .putLong(KEY_LAST_CRASH_AT, System.currentTimeMillis())
            .putString(KEY_LAST_CRASH_TEXT, throwable.stackTraceToString().take(MAX_STORED_CHARS))
            .apply()
    }

    fun recordWorkerError(context: Context, throwable: Throwable) {
        prefs(context).edit()
            .putLong(KEY_LAST_WORKER_ERROR_AT, System.currentTimeMillis())
            .putString(KEY_LAST_WORKER_ERROR_TEXT, throwable.stackTraceToString().take(MAX_STORED_CHARS))
            .apply()
    }

    fun lastCrash(context: Context): Entry? = entry(context, KEY_LAST_CRASH_AT, KEY_LAST_CRASH_TEXT)

    fun lastWorkerError(context: Context): Entry? = entry(context, KEY_LAST_WORKER_ERROR_AT, KEY_LAST_WORKER_ERROR_TEXT)

    private fun entry(context: Context, atKey: String, textKey: String): Entry? {
        val prefs = prefs(context)
        val text = prefs.getString(textKey, null) ?: return null
        return Entry(prefs.getLong(atKey, 0L), text)
    }
}
