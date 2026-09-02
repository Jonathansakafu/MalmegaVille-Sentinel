package com.malmegaville.sentinel

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

// Thin wrapper over the same REST API the web dashboard (frontend/src/api.ts)
// and the Windows agent use - returns raw JSONObject/JSONArray rather than
// typed models, since this app mirrors a handful of dashboard screens rather
// than owning a full domain model of its own.
class SentinelApiClient(private val httpClient: OkHttpClient = OkHttpClient()) {

    private val jsonMediaType = "application/json".toMediaType()

    private fun authedRequest(path: String, token: String): Request.Builder =
        Request.Builder()
            .url("${SentinelPrefs.BACKEND_BASE_URL}$path")
            .addHeader("Authorization", "Bearer $token")

    private fun executeJson(request: Request): JSONObject {
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(body).optString("message") }.getOrNull()
                throw IOException(message?.takeIf { it.isNotBlank() } ?: "Request failed (${response.code}).")
            }
            return if (body.isBlank()) JSONObject() else JSONObject(body)
        }
    }

    private fun executeJsonArray(request: Request): JSONArray {
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(body).optString("message") }.getOrNull()
                throw IOException(message?.takeIf { it.isNotBlank() } ?: "Request failed (${response.code}).")
            }
            return if (body.isBlank()) JSONArray() else JSONArray(body)
        }
    }

    fun fetchDevices(token: String): JSONArray =
        executeJsonArray(authedRequest("/devices", token).get().build())

    fun setDeviceLostStatus(token: String, deviceMongoId: String, isLost: Boolean): JSONObject {
        val body = JSONObject().put("isLost", isLost).toString().toRequestBody(jsonMediaType)
        return executeJson(authedRequest("/devices/$deviceMongoId/lost-status", token).patch(body).build())
    }

    fun fetchIncidents(token: String): JSONArray =
        executeJsonArray(authedRequest("/incidents", token).get().build())

    fun fetchCaptures(token: String, deviceId: String? = null): JSONArray {
        val path = if (deviceId != null) "/captures?deviceId=${java.net.URLEncoder.encode(deviceId, "UTF-8")}" else "/captures"
        return executeJsonArray(authedRequest(path, token).get().build())
    }

    fun deleteCapture(token: String, captureId: String) {
        httpClient.newCall(authedRequest("/captures/$captureId", token).delete().build()).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Delete failed (${response.code}).")
            }
        }
    }

    fun fetchCaptureBytes(token: String, captureId: String): ByteArray {
        httpClient.newCall(authedRequest("/captures/$captureId/content", token).get().build()).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Failed to load capture (${response.code}).")
            }
            return response.body?.bytes() ?: ByteArray(0)
        }
    }

    fun fetchNotificationSettings(token: String): JSONObject =
        executeJson(authedRequest("/settings/notifications", token).get().build())

    fun saveNotificationSettings(token: String, alertEmailRecipient: String, alertPhoneNumber: String): JSONObject {
        val body = JSONObject()
            .put("alertEmailRecipient", alertEmailRecipient)
            .put("alertPhoneNumber", alertPhoneNumber)
            .toString()
            .toRequestBody(jsonMediaType)
        return executeJson(authedRequest("/settings/notifications", token).put(body).build())
    }

    fun sendTestAlert(token: String): JSONObject =
        executeJson(authedRequest("/settings/notifications/test", token).post("".toRequestBody(jsonMediaType)).build())

    fun updateUsername(token: String, username: String): JSONObject {
        val body = JSONObject().put("username", username).toString().toRequestBody(jsonMediaType)
        return executeJson(authedRequest("/auth/username", token).patch(body).build())
    }

    fun changePassword(token: String, currentPassword: String, newPassword: String): JSONObject {
        val body = JSONObject()
            .put("currentPassword", currentPassword)
            .put("newPassword", newPassword)
            .toString()
            .toRequestBody(jsonMediaType)
        return executeJson(authedRequest("/auth/password", token).patch(body).build())
    }

    fun fetchTrustedUsbDevices(token: String): JSONArray =
        executeJsonArray(authedRequest("/trusted-usb-devices", token).get().build())

    fun addTrustedUsbDevice(token: String, identifier: String, label: String): JSONObject {
        val body = JSONObject().put("identifier", identifier).put("label", label).toString().toRequestBody(jsonMediaType)
        return executeJson(authedRequest("/trusted-usb-devices", token).post(body).build())
    }

    fun removeTrustedUsbDevice(token: String, id: String) {
        httpClient.newCall(authedRequest("/trusted-usb-devices/$id", token).delete().build()).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Remove failed (${response.code}).")
            }
        }
    }
}
