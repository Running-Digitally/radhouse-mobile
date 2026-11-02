package com.runningdigitally.radhouse

import android.util.Base64
import android.webkit.CookieManager
import android.webkit.WebStorage
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val APP_HOST = "radhouse.sati.sh"
private const val ORIGIN = "https://radhouse.sati.sh"

class RadhouseHTTP(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RadhouseHTTP"
  // One native workspace binding for this bridge lifetime; retries keep the same binding.
  private val workspaceTab = UUID.randomUUID().toString()
  private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
    .cookieJar(CookieJar.NO_COOKIES).cache(null).callTimeout(70,TimeUnit.SECONDS)
    .readTimeout(65,TimeUnit.SECONDS).build()
  @ReactMethod fun randomBytes(promise: Promise) {
    val bytes = ByteArray(32)
    try { SecureRandom().nextBytes(bytes); promise.resolve(Base64.encodeToString(bytes,Base64.NO_WRAP)) }
    catch (_: Exception) { promise.reject("random_failed","Secure random unavailable") }
    finally { bytes.fill(0) }
  }
  private fun safe(value: String, limit: Int) = value.length <= limit && value.none { it == '\r' || it == '\n' || it == ';' }
  private fun allowedDestination(url: HttpUrl?, method: String, access: String,
                                 local: String, csrf: String, body: String): Boolean {
    if (url == null || !url.isHttps || url.port != 443 || url.username.isNotEmpty() ||
      url.password.isNotEmpty() || url.fragment != null) return false
    if (url.host == APP_HOST) return true
    return url.host == "login.cloudflareaccess.org" && url.encodedPath.startsWith("/transfer/") &&
      url.query == null && method == "GET" && access.isEmpty() && local.isEmpty() &&
      csrf.isEmpty() && body.isEmpty()
  }
  @ReactMethod fun request(raw: String, method: String, access: String, local: String,
                           csrf: String, body: String, promise: Promise) {
    val url = raw.toHttpUrlOrNull()
    if (!allowedDestination(url, method, access, local, csrf, body) ||
      method !in listOf("GET","POST","PUT","DELETE") || !safe(access,16384) ||
      !safe(local,200) || !safe(csrf,200) || body.toByteArray().size > 262144) {
      promise.reject("denied","Request not allowed"); return
    }
    val admittedURL = requireNotNull(url)
    val app = admittedURL.host == APP_HOST
    val request = Request.Builder().url(admittedURL).header("Accept","application/json")
    if (app) {
      request.header("cf-access-token",access).header("Origin",ORIGIN)
      request.header("X-Radhouse-Browser-Tab",workspaceTab)
      if (local.isNotEmpty()) request.header("Cookie","radhouse_session=$local")
      if (csrf.isNotEmpty()) request.header("x-radhouse-csrf",csrf)
    }
    if (method != "GET") request.method(method, body.toRequestBody("application/json".toMediaType()))
    client.newCall(request.build()).enqueue(object: okhttp3.Callback {
      override fun onFailure(call: Call, e: IOException) { promise.reject("network_failed","Could not complete secure request") }
      override fun onResponse(call: Call, response: Response) {
        response.use {
          try {
            promise.resolve(responseData(it, admittedURL))
          } catch (_: Exception) { promise.reject("network_failed","Could not complete secure request") }
        }
      }
    })
  }
  private fun responseData(response: Response, url: HttpUrl): WritableMap {
    val source = response.body?.source() ?: throw IOException()
    if (source.request(4194305)) throw IOException()
    val result = Arguments.createMap()
    result.putInt("status",response.code)
    result.putString("body",source.readUtf8())
    result.putString("serviceKey",response.header("service-public-key") ?: "")
    result.putString("contentType",response.header("Content-Type") ?: "")
    result.putString("sessionToken",sessionToken(response,url))
    return result
  }
  private fun sessionToken(response: Response, url: HttpUrl): String {
    if (url.host != APP_HOST || url.encodedPath != "/auth/login" || response.code != 200) return ""
    return Cookie.parseAll(url,response.headers).firstOrNull { cookie ->
      cookie.name == "radhouse_session" && cookie.domain == APP_HOST && cookie.path == "/" &&
        cookie.secure && cookie.httpOnly && cookie.hostOnly
    }?.value ?: ""
  }
  @ReactMethod fun syncCookies(access: String, local: String, promise: Promise) {
    if (access.isEmpty() || local.isEmpty() || !safe(access,16384) || !safe(local,200)) {
      promise.reject("denied","Invalid viewer session"); return
    }
    UiThreadUtil.runOnUiThread {
      val store = CookieManager.getInstance()
      store.setCookie(ORIGIN,"CF_Authorization=$access; Path=/; Secure; HttpOnly; SameSite=Strict") { first ->
        store.setCookie(ORIGIN,"radhouse_session=$local; Path=/; Secure; HttpOnly; SameSite=Strict") { second ->
          if (first && second) promise.resolve(null) else promise.reject("cookies_failed","Viewer session unavailable")
        }
      }
    }
  }
  @ReactMethod fun clearCookies(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      WebStorage.getInstance().deleteAllData()
      CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush(); promise.resolve(null) }
    }
  }
}
class RadhouseHTTPPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RadhouseHTTP(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*,*>> = emptyList()
}
