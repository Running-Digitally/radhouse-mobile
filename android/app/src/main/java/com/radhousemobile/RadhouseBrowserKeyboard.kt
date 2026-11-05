package com.runningdigitally.radhouse

import android.content.Context
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.IllegalViewOperationException
import com.facebook.react.uimanager.ViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

/** Opens the local IME for the existing guarded viewer input; never transports text. */
class RadhouseBrowserKeyboard(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RadhouseBrowserKeyboard"

  @ReactMethod fun show(viewTag: Int) {
    UiThreadUtil.runOnUiThread {
      val wrapper = try {
        UIManagerHelper.getUIManagerForReactTag(reactApplicationContext, viewTag)
          ?.resolveView(viewTag) as? RNCWebViewWrapper
      } catch (_: IllegalViewOperationException) { null } ?: return@runOnUiThread
      val web = wrapper.webView
      val url = web.url ?: return@runOnUiThread
      if (!ROOT.matches(url) || !available(web)) return@runOnUiThread
      web.requestFocus()
      // The callback runs after the existing command has synchronously focused its
      // IME field. Showing the IME before that leaves Android with no input target.
      web.evaluateJavascript(SHOW) { focused ->
        if (focused == "true" && web.url == url && available(web) && web.hasFocus()) {
          val input = web.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
          input.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT)
        }
      }
    }
  }

  private fun available(web: WebView) = web.isAttachedToWindow && web.isShown && web.hasWindowFocus()

  private companion object {
    val ROOT = Regex("https://radhouse\\.sati\\.sh/mobile/browser\\?tab=[0-9a-fA-F-]{36}")
    const val SHOW = """(function(){
      window.RadhouseMobileBrowser?.command({action:'keyboard'});
      let field = document.activeElement;
      while (field?.tagName === 'IFRAME') field = field.contentDocument?.activeElement;
      return field?.id === 'keyboard-input-assist' && /^(INPUT|TEXTAREA)$/.test(field.tagName);
    })();"""
  }
}

class RadhouseBrowserKeyboardPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(RadhouseBrowserKeyboard(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
