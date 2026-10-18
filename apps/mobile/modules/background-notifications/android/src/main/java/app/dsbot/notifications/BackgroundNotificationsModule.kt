package app.dsbot.notifications

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URI

class BackgroundNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DSBotBackgroundNotifications")
    OnActivityEntersForeground { BackgroundReceiver.foreground = true }
    OnActivityEntersBackground { BackgroundReceiver.foreground = false }

    AsyncFunction("start") { url: String, serverId: String, token: String, cursor: Double, expiresAt: Double, locale: String, tlsPin: String ->
      check(tlsPin.isEmpty() || LocalTLS.validPin(tlsPin)) { "Invalid computer identity" }
      val context = appContext.reactContext ?: error("The mobile app is unavailable")
      check(appContext.currentActivity != null && BackgroundReceiver.foreground) { "Open the app to enable background notifications" }
      val origin = URI(url)
      check(origin.scheme == "https" && !origin.host.isNullOrBlank() && origin.userInfo == null && origin.query == null && origin.fragment == null && origin.path in listOf("", "/")) { "Background notifications require an HTTPS host origin" }
      check(serverId.length in 1..128 && token.matches(Regex("[A-Za-z0-9_-]{43}")) && cursor.isFinite() && cursor >= 0 && cursor <= 9007199254740991.0 && cursor % 1 == 0.0 && expiresAt.isFinite() && expiresAt < Long.MAX_VALUE.toDouble() && expiresAt > System.currentTimeMillis()) { "Background registration is invalid" }
      check(Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { "Allow system notifications first" }
      BackgroundReceiver.pending = ReceiverConfig(url.trimEnd('/'), serverId, token, cursor.toLong(), expiresAt.toLong(), if (locale == "zh") "zh" else "en", tlsPin)
      BackgroundReceiver.userStopped = false
      context.getSharedPreferences("ds-bot-background", 0).edit().putBoolean("user-stopped", false).apply()
      val intent = Intent(context, BackgroundNotificationService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (_: Exception) {
        BackgroundReceiver.pending = null
        error("The system could not start background notifications; keep the app open and try again")
      }
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setLocale") { locale: String ->
      val selected = if (locale == "zh") "zh" else "en"
      BackgroundReceiver.pending = BackgroundReceiver.pending?.copy(locale = selected)
      BackgroundReceiver.instance?.updateLocale(selected)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") {
      BackgroundReceiver.pending = null
      appContext.reactContext?.stopService(Intent(appContext.reactContext, BackgroundNotificationService::class.java))
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("status") {
      if (appContext.reactContext?.getSharedPreferences("ds-bot-background", 0)?.getBoolean("user-stopped", false) == true) BackgroundReceiver.userStopped = true
      BackgroundReceiver.status()
    }
    AsyncFunction("advanceCursor") { serverId: String, cursor: Double ->
      if (cursor >= 0 && cursor % 1 == 0.0) BackgroundReceiver.instance?.advanceCursor(serverId, cursor.toLong())
    }
  }
}

internal data class ReceiverConfig(val url: String, val serverId: String, val token: String, val cursor: Long, val expiresAt: Long, val locale: String, val tlsPin: String)
internal object BackgroundReceiver {
  @Volatile var instance: BackgroundNotificationService? = null
  @Volatile var pending: ReceiverConfig? = null
  @Volatile var foreground = true
  @Volatile var userStopped = false
  @Volatile var reason = "stopped"
  fun status(): Map<String, Any> = instance?.status() ?: mapOf("running" to false, "state" to reason, "userStopped" to userStopped)
}
