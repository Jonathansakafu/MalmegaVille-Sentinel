package com.malmegaville.sentinel

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import org.json.JSONTokener
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

// The phone runs the exact web console - same routes, same panels, same
// globe - instead of a hand-built native imitation of it. Logging in here
// writes the same `token` key the site uses into this WebView's storage;
// the native side then picks that token up and keeps doing the things a web
// page cannot: registering the phone as a trackable device, the periodic
// lost-device check, camera capture, and SMS relay.
class MainActivity : AppCompatActivity() {

    private val httpClient = OkHttpClient()
    private val api = SentinelApiClient(httpClient)
    private lateinit var prefs: SharedPreferences
    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())
    private var pageReady = false
    private var agentSessionStarted = false

    private val sessionPoll = object : Runnable {
        override fun run() {
            syncSessionFromWeb()
            handler.postDelayed(this, SESSION_POLL_MILLIS)
        }
    }

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val gotForegroundLocation = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            if (gotForegroundLocation) requestBackgroundLocationIfNeeded()
        }

    // Android requires background location to be requested as its own
    // separate step, only after foreground location is already granted -
    // asking for it together with the others in one batch is silently
    // ignored by the system. Without it, a location fix attempted while the
    // app isn't in the foreground (the self-monitoring worker's normal case)
    // can fail outright instead of returning a real GPS position.
    private val requestBackgroundLocationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private fun requestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED) return
        requestBackgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(SentinelPrefs.NAME, Context.MODE_PRIVATE)
        webView = buildWebConsole()
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        requestRuntimePermissions()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebConsole(): WebView {
        val view = WebView(this)
        view.setBackgroundColor(0xFF030605.toInt())
        view.overScrollMode = View.OVER_SCROLL_NEVER

        val debugBuild = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debugBuild)

        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        CookieManager.getInstance().setAcceptCookie(true)

        view.addJavascriptInterface(DownloadBridge(), "SentinelNative")

        view.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                callback?.invoke(origin, true, false)
            }
        }

        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                pageReady = false
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageReady = true
                injectDownloadBridge(view)
                syncSessionFromWeb()
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (uri.host == Uri.parse(SentinelPrefs.WEB_APP_BASE_URL).host) return false
                return openExternally(uri)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    pageReady = false
                    view?.loadDataWithBaseURL(null, offlineHtml, "text/html", "utf-8", null)
                }
            }
        }

        view.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            if (!url.startsWith("blob:")) {
                downloadRemotely(url, userAgent, mimeType)
            }
        })

        view.loadUrl("${SentinelPrefs.WEB_APP_BASE_URL}/dashboard")
        return view
    }

    // The site downloads evidence by fetching the file and clicking a blob:
    // anchor, which a WebView cannot hand to DownloadManager. This shim
    // streams that blob to native code in chunks instead, so the download
    // button behaves the same in the app as in a browser.
    private fun injectDownloadBridge(view: WebView?) {
        view?.evaluateJavascript(DOWNLOAD_BRIDGE_JS, null)
    }

    private fun syncSessionFromWeb() {
        if (!::webView.isInitialized || !pageReady) return
        webView.evaluateJavascript(SESSION_PROBE_JS) { raw ->
            val value = decodeJsString(raw) ?: return@evaluateJavascript
            when {
                value == "E" -> Unit
                value == "T:" -> {
                    // Signed out in the console - stop watching this phone.
                    val stored = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
                    if (!stored.isNullOrBlank()) {
                        prefs.edit().remove(SentinelPrefs.KEY_AUTH_TOKEN).apply()
                        LostDeviceWorker.cancelPeriodic(applicationContext)
                        agentSessionStarted = false
                    }
                }
                value.startsWith("T:") -> {
                    val token = value.removePrefix("T:")
                    if (token.isNotBlank()) ensureAgentSession(token)
                }
            }
        }
    }

    private fun ensureAgentSession(authToken: String) {
        val stored = prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)
        if (stored != authToken) {
            prefs.edit().putString(SentinelPrefs.KEY_AUTH_TOKEN, authToken).apply()
            // A different account signed in - re-pair this phone under it.
            agentSessionStarted = false
        }
        if (agentSessionStarted) return
        agentSessionStarted = true
        registerDeviceToken(authToken)
        activateLostDeviceMonitoring(authToken)
    }

    // Registers this phone as a trackable Device (so it can be marked
    // lost/found from the dashboard like a PC) and schedules the periodic
    // check-in that watches for that flag. Best-effort and silent.
    private fun activateLostDeviceMonitoring(authToken: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val deviceId = SentinelPrefs.getOrCreatePhoneDeviceId(applicationContext)
                val osLabel = "Android ${Build.VERSION.RELEASE}"
                api.registerAsDevice(authToken, deviceId, Build.MODEL ?: "Android device", osLabel)
                LostDeviceWorker.schedulePeriodic(applicationContext)
            } catch (e: Exception) {
                // Best effort - retried on next app open.
            }
        }
    }

    private fun registerDeviceToken(authToken: String) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            val fcmToken = task.result
            CoroutineScope(Dispatchers.IO).launch {
                runCatching { SentinelPrefs.registerDeviceWithBackend(httpClient, authToken, fcmToken) }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        handler.post(sessionPoll)
        // Covers the case where the app process was restarted and the console
        // never re-renders: the native agent keeps running off the stored token.
        prefs.getString(SentinelPrefs.KEY_AUTH_TOKEN, null)?.let { ensureAgentSession(it) }
    }

    override fun onPause() {
        handler.removeCallbacks(sessionPoll)
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacks(sessionPoll)
        webView.destroy()
        super.onDestroy()
    }

    private fun openExternally(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun downloadRemotely(url: String, userAgent: String?, mimeType: String?) {
        try {
            val request = android.app.DownloadManager.Request(Uri.parse(url)).apply {
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url).orEmpty())
                if (!userAgent.isNullOrBlank()) addRequestHeader("User-Agent", userAgent)
                if (!mimeType.isNullOrBlank()) setMimeType(mimeType)
                setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, "sentinel-evidence")
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager).enqueue(request)
            Toast.makeText(this, "Download started", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // --- Blob download bridge -------------------------------------------------

    private class PendingDownload(val file: File, val mime: String)

    private inner class DownloadBridge {
        private val pending = HashMap<String, PendingDownload>()

        @JavascriptInterface
        fun startDownload(name: String, mime: String): String {
            val id = UUID.randomUUID().toString()
            val safeName = name.replace(Regex("[/\\\\:*?\"<>|]"), "_").take(120).ifBlank { "sentinel-capture" }
            val dir = File(cacheDir, "downloads").apply { mkdirs() }
            val file = File(dir, safeName)
            file.delete()
            synchronized(pending) {
                pending[id] = PendingDownload(file, mime.ifBlank { "application/octet-stream" })
            }
            return id
        }

        @JavascriptInterface
        fun appendChunk(id: String, base64: String) {
            val download = synchronized(pending) { pending[id] } ?: return
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                FileOutputStream(download.file, true).use { it.write(bytes) }
            } catch (e: Exception) {
                // finishDownload reports the failure to the user.
            }
        }

        @JavascriptInterface
        fun finishDownload(id: String) {
            val download = synchronized(pending) { pending.remove(id) } ?: return
            publishDownload(download)
        }
    }

    private fun publishDownload(download: PendingDownload) {
        runOnUiThread {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, download.file.name)
                        put(MediaStore.Downloads.MIME_TYPE, download.mime)
                        put(MediaStore.Downloads.IS_PENDING, 1)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Sentinel")
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IOException("Could not create a download entry.")
                    contentResolver.openOutputStream(uri)?.use { out ->
                        download.file.inputStream().use { it.copyTo(out) }
                    } ?: throw IOException("Could not open a download stream.")
                    values.clear()
                    values.put(MediaStore.Downloads.IS_PENDING, 0)
                    contentResolver.update(uri, values, null, null)
                    download.file.delete()
                    Toast.makeText(this, "${download.file.name} saved to Downloads/Sentinel", Toast.LENGTH_LONG).show()
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(filesDir, "downloads")
                    dir.mkdirs()
                    val target = File(dir, download.file.name)
                    download.file.copyTo(target, overwrite = true)
                    download.file.delete()
                    shareDownload(target, download.mime)
                }
            } catch (e: Exception) {
                Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun shareDownload(file: File, mime: String) {
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, "Save ${file.name}"))
    }

    private fun decodeJsString(raw: String?): String? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return runCatching { JSONTokener(raw).nextValue() as? String }.getOrNull()
    }

    // --- Permissions ----------------------------------------------------------

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val notGranted = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (notGranted.isNotEmpty()) {
            requestPermissionLauncher.launch(notGranted.toTypedArray())
        } else {
            requestBackgroundLocationIfNeeded()
        }
    }

    private val offlineHtml = """
        <!doctype html>
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
        html,body{margin:0;height:100%;background:#030605;color:#F2FFF8;font-family:ui-monospace,Menlo,monospace;display:flex;align-items:center;justify-content:center}
        .card{border:1px solid rgba(0,255,136,.16);background:#071009;padding:28px;max-width:340px;margin:16px}
        h1{font-size:14px;letter-spacing:.18em;color:#00FF88;margin:0 0 10px}
        p{font-size:12px;color:#8FA99B;line-height:1.6;margin:0 0 18px}
        a{display:block;text-align:center;padding:12px;border:1px solid #00FF88;color:#030605;background:#00FF88;text-decoration:none;font-size:11px;letter-spacing:.18em}
        </style></head><body><div class="card"><h1>LINK DOWN</h1>
        <p>The console could not be reached. Check this device's connection and try again.</p>
        <a href="${SentinelPrefs.WEB_APP_BASE_URL}/dashboard">RE-ESTABLISH LINK</a></div></body></html>
    """.trimIndent()

    companion object {
        private const val SESSION_POLL_MILLIS = 1500L

        // Returns T:<token>, T: when signed out, E when storage is unreadable
        // (e.g. the offline page), so a transient read can never wipe the
        // stored session.
        private const val SESSION_PROBE_JS =
            "(function(){try{var t=localStorage.getItem('token');return t?('T:'+t):'T:';}catch(e){return 'E';}})()"

        private const val DOWNLOAD_BRIDGE_JS = """
            (function(){
              if (window.__sentinelDownloadBridge) return;
              window.__sentinelDownloadBridge = true;
              var blobs = new Map();
              var original = URL.createObjectURL.bind(URL);
              URL.createObjectURL = function(obj){
                var url = original(obj);
                if (obj instanceof Blob) blobs.set(url, obj);
                return url;
              };
              function toBase64(buffer){
                var bytes = new Uint8Array(buffer);
                var binary = '';
                var step = 0x8000;
                for (var i = 0; i < bytes.length; i += step) {
                  binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
                }
                return btoa(binary);
              }
              document.addEventListener('click', function(event){
                var anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
                if (!anchor) return;
                var href = anchor.getAttribute('href') || '';
                if (href.indexOf('blob:') !== 0) return;
                var blob = blobs.get(href);
                if (!blob || !window.SentinelNative) return;
                event.preventDefault();
                event.stopPropagation();
                var name = anchor.getAttribute('download') || 'sentinel-capture';
                (async function(){
                  var id = window.SentinelNative.startDownload(name, blob.type || 'application/octet-stream');
                  var chunk = 192 * 1024;
                  for (var offset = 0; offset < blob.size; offset += chunk) {
                    var buffer = await blob.slice(offset, offset + chunk).arrayBuffer();
                    window.SentinelNative.appendChunk(id, toBase64(buffer));
                  }
                  window.SentinelNative.finishDownload(id);
                })();
              }, true);
            })();
        """
    }
}
