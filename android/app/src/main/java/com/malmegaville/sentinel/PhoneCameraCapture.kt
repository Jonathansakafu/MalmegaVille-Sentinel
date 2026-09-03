package com.malmegaville.sentinel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine

// Headless single-frame still capture via the low-level Camera2 API, usable
// from a background Worker with no Activity/UI - CameraX's simpler API needs
// a LifecycleOwner, which a background Worker doesn't have. This is the
// least-tested piece of the whole lost-device feature: it's built against
// the well-documented Camera2 callback pattern, but Camera2's threading and
// per-device quirks are genuinely hard to fully verify without a real device.
object PhoneCameraCapture {

    suspend fun captureJpeg(context: Context, preferFrontFacing: Boolean = true): ByteArray? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return null
        }

        val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return null
        val cameraId = selectCameraId(manager, preferFrontFacing) ?: return null

        val thread = HandlerThread("SentinelCameraThread").apply { start() }
        val handler = Handler(thread.looper)

        try {
            return suspendCancellableCoroutine { continuation ->
                var imageReader: ImageReader? = null
                var cameraDevice: CameraDevice? = null
                var captureSession: CameraCaptureSession? = null
                var finished = false

                fun finish(result: ByteArray?) {
                    if (finished) return
                    finished = true
                    if (continuation.isActive) continuation.resumeWith(Result.success(result))
                    try {
                        captureSession?.close()
                        cameraDevice?.close()
                        imageReader?.close()
                    } catch (e: Exception) {
                        // Best effort.
                    }
                }

                try {
                    imageReader = ImageReader.newInstance(1280, 960, ImageFormat.JPEG, 1).apply {
                        setOnImageAvailableListener({ reader ->
                            val image: Image? = reader.acquireLatestImage()
                            val bytes = try {
                                val buffer = image?.planes?.get(0)?.buffer
                                buffer?.let { ByteArray(it.remaining()).also(it::get) }
                            } finally {
                                image?.close()
                            }
                            finish(bytes)
                        }, handler)
                    }

                    manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                        override fun onOpened(device: CameraDevice) {
                            cameraDevice = device
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
                                                val requestBuilder = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                                                requestBuilder.addTarget(surface)
                                                session.capture(requestBuilder.build(), null, handler)
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
}
