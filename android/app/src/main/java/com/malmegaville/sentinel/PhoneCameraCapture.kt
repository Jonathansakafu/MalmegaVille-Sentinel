package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.resume

// Headless single-frame still capture via the low-level Camera2 API, usable
// from a background Worker with no Activity/UI - CameraX's simpler API needs
// a LifecycleOwner, which a background Worker doesn't have.
//
// The first still frame a freshly opened Camera2 device produces is usually
// black: auto-exposure/white-balance/focus only start converging once
// requests are actually being processed, so capturing immediately in
// onConfigured returns an unexposed frame. Live evidence of exactly that:
// a phone check-in uploaded a valid 1600x1200 JPEG whose brightest pixel
// was 4/255 - a real file, but a black photo. So this now sends a short
// burst of throwaway captures first (letting 3A converge), turns on the
// torch for a retry, and if a camera still returns a near-black frame it
// tries the other lens and keeps whichever frame is actually exposed.
object PhoneCameraCapture {

    private const val TAG = "SentinelCamera"
    private const val WARMUP_CAPTURES = 5
    private const val WARMUP_INTERVAL_MS = 300L
    // Average luminance (0..255) below this is treated as "no usable photo".
    // A genuinely dark room at night can land here too, which is why a dark
    // frame is not discarded outright - it is only retried with the torch
    // and the other lens, then the brightest attempt is what gets uploaded.
    private const val MIN_USABLE_BRIGHTNESS = 12.0

    suspend fun captureJpeg(context: Context, preferFrontFacing: Boolean = true): ByteArray? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return null
        }

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return null
        val preferredId = selectCameraId(manager, preferFrontFacing) ?: return null
        val attemptOrder = listOf(preferredId) + manager.cameraIdList.filter { it != preferredId }

        var best: ByteArray? = null
        var bestBrightness = -1.0

        for ((index, cameraId) in attemptOrder.withIndex()) {
            // Torch is only used for retries: the preferred lens (usually the
            // front camera, which has no flash) is tried first without
            // lighting up the room, and only a dark result escalates.
            val useTorch = index > 0 && hasFlash(manager, cameraId)
            val bytes = captureWithWarmup(manager, cameraId, useTorch) ?: continue
            val brightness = averageBrightness(bytes)
            Log.i(TAG, "Camera $cameraId captured ${bytes.size} bytes, brightness=${"%.1f".format(brightness)}")
            if (brightness > bestBrightness) {
                best = bytes
                bestBrightness = brightness
            }
            if (brightness >= MIN_USABLE_BRIGHTNESS) break
        }

        if (best == null) {
            Log.e(TAG, "No camera returned an image")
        }
        return best
    }

    private suspend fun captureWithWarmup(manager: CameraManager, cameraId: String, useTorch: Boolean): ByteArray? {
        val thread = HandlerThread("SentinelCameraThread").apply { start() }
        val handler = Handler(thread.looper)

        try {
            return suspendCancellableCoroutine { continuation ->
                var imageReader: ImageReader? = null
                var cameraDevice: CameraDevice? = null
                var captureSession: CameraCaptureSession? = null
                val finished = AtomicBoolean(false)
                // Set once the final still request has started on the sensor;
                // frames from the warm-up burst carry older timestamps and
                // are discarded by the listener below.
                val finalTimestamp = AtomicLong(-1L)

                fun release() {
                    runCatching { if (useTorch) manager.setTorchMode(cameraId, false) }
                    runCatching { captureSession?.close() }
                    runCatching { cameraDevice?.close() }
                    runCatching { imageReader?.close() }
                }

                fun finish(result: ByteArray?) {
                    if (!finished.compareAndSet(false, true)) return
                    release()
                    if (continuation.isActive) continuation.resume(result)
                }

                try {
                    // 1280x960 is a 4:3 guess that not every sensor offers as
                    // a JPEG output - ImageReader.newInstance throws for an
                    // unsupported size, which read as "camera never works" on
                    // those devices. Ask the camera what it actually supports.
                    val jpegSize = selectJpegSize(manager, cameraId)
                    imageReader = ImageReader.newInstance(jpegSize.width, jpegSize.height, ImageFormat.JPEG, 2).apply {
                        setOnImageAvailableListener({ reader ->
                            val image = reader.acquireLatestImage()
                            if (image != null) {
                                try {
                                    val expected = finalTimestamp.get()
                                    if (expected < 0L || image.timestamp < expected) return@setOnImageAvailableListener
                                    val buffer = image.planes.getOrNull(0)?.buffer
                                    val bytes = buffer?.let { ByteArray(it.remaining()).also(it::get) }
                                    finish(bytes)
                                } finally {
                                    image.close()
                                }
                            }
                        }, handler)
                    }

                    manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                        override fun onOpened(device: CameraDevice) {
                            cameraDevice = device
                            if (useTorch) {
                                runCatching { manager.setTorchMode(cameraId, true) }
                                    .onFailure { Log.w(TAG, "Could not enable torch for camera $cameraId", it) }
                            }
                            val surface = imageReader?.surface
                            if (surface == null) {
                                finish(null)
                                return
                            }
                            try {
                                device.createCaptureSession(
                                    listOf(surface),
                                    object : CameraCaptureSession.StateCallback() {
                                        override fun onConfigured(session: CameraCaptureSession) {
                                            captureSession = session
                                            try {
                                                // Throwaway warm-up frames: each
                                                // request advances AE/AWB/AF one
                                                // step, so by the time the real
                                                // capture is requested the
                                                // sensor is already exposing for
                                                // the actual scene.
                                                val warmupBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                                                warmupBuilder.addTarget(surface)
                                                applyModes(warmupBuilder)
                                                val warmupRequest = warmupBuilder.build()
                                                repeat(WARMUP_CAPTURES) { index ->
                                                    handler.postDelayed({
                                                        runCatching { session.capture(warmupRequest, null, handler) }
                                                    }, index * WARMUP_INTERVAL_MS)
                                                }

                                                handler.postDelayed({
                                                    try {
                                                        val stillBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                                                        stillBuilder.addTarget(surface)
                                                        applyModes(stillBuilder)
                                                        session.capture(
                                                            stillBuilder.build(),
                                                            object : CameraCaptureSession.CaptureCallback() {
                                                                override fun onCaptureStarted(
                                                                    session: CameraCaptureSession,
                                                                    request: CaptureRequest,
                                                                    timestamp: Long,
                                                                    frameNumber: Long
                                                                ) {
                                                                    finalTimestamp.set(timestamp)
                                                                }
                                                            },
                                                            handler
                                                        )
                                                    } catch (e: Exception) {
                                                        finish(null)
                                                    }
                                                }, (WARMUP_CAPTURES + 1) * WARMUP_INTERVAL_MS)
                                            } catch (e: Exception) {
                                                finish(null)
                                            }
                                        }

                                        override fun onConfigureFailed(session: CameraCaptureSession) = finish(null)
                                    },
                                    handler
                                )
                            } catch (e: Exception) {
                                finish(null)
                            }
                        }

                        override fun onDisconnected(device: CameraDevice) = finish(null)
                        override fun onError(device: CameraDevice, error: Int) = finish(null)
                    }, handler)
                } catch (e: Exception) {
                    finish(null)
                }

                continuation.invokeOnCancellation { finish(null) }
            }
        } finally {
            thread.quitSafely()
        }
    }

    private fun applyModes(builder: CaptureRequest.Builder) {
        // Individual modes are applied independently: a device that lacks
        // one of these controls (e.g. no autofocus) rejects only that key,
        // and the rest of the request still goes through.
        runCatching { builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO) }
        runCatching { builder.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON) }
        runCatching { builder.set(CaptureRequest.CONTROL_AWB_MODE, CameraMetadata.CONTROL_AWB_MODE_AUTO) }
        runCatching { builder.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE) }
    }

    private fun hasFlash(manager: CameraManager, cameraId: String): Boolean =
        runCatching {
            manager.getCameraCharacteristics(cameraId).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        }.getOrDefault(false)

    private fun averageBrightness(jpeg: ByteArray): Double {
        return runCatching {
            val options = BitmapFactory.Options().apply { inSampleSize = 8 }
            val decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, options) ?: return 0.0
            val sampleWidth = 24
            val sampleHeight = 24
            val scaled = Bitmap.createScaledBitmap(decoded, sampleWidth, sampleHeight, false)
            if (scaled !== decoded) decoded.recycle()
            val pixels = IntArray(sampleWidth * sampleHeight)
            scaled.getPixels(pixels, 0, sampleWidth, 0, 0, sampleWidth, sampleHeight)
            scaled.recycle()
            var total = 0.0
            for (pixel in pixels) {
                total += (((pixel shr 16) and 0xFF) + ((pixel shr 8) and 0xFF) + (pixel and 0xFF)) / 3.0
            }
            total / pixels.size
        }.getOrDefault(0.0)
    }

    private fun selectCameraId(manager: CameraManager, preferFrontFacing: Boolean): String? {
        val ids = manager.cameraIdList
        if (ids.isEmpty()) return null
        if (preferFrontFacing) {
            for (id in ids) {
                val characteristics = manager.getCameraCharacteristics(id)
                if (characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT) {
                    return id
                }
            }
        }
        return ids[0]
    }

    private fun selectJpegSize(manager: CameraManager, cameraId: String): Size {
        val sizes = try {
            manager.getCameraCharacteristics(cameraId)
                .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                ?.getOutputSizes(ImageFormat.JPEG)
                ?.toList()
                .orEmpty()
        } catch (e: Exception) {
            emptyList()
        }
        if (sizes.isEmpty()) return Size(1280, 960)
        // Enough detail to identify a face, small enough that a 15-minute
        // check-in doesn't burn through mobile data.
        return sizes.filter { it.width <= 1600 }.maxByOrNull { it.width * it.height }
            ?: sizes.minByOrNull { it.width * it.height }!!
    }
}
