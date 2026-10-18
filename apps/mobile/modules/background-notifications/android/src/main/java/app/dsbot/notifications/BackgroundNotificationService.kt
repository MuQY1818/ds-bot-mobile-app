package app.dsbot.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class BackgroundNotificationService : Service() {
  private val executor = Executors.newSingleThreadScheduledExecutor()
  private val lock = Any()
  @Volatile private var locale = "en"
  private var config: ReceiverConfig? = null
  private var generation = 0L
  private var cursor = 0L
  private var failures = 0
  private var job: ScheduledFuture<*>? = null
  @Volatile private var connection: HttpURLConnection? = null
  @Volatile private var state = "connecting"
  private val manager get() = getSystemService(NotificationManager::class.java)

  override fun onCreate() {
    super.onCreate()
    BackgroundReceiver.instance = this
    locale = BackgroundReceiver.pending?.locale ?: locale
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(NotificationChannel(STATUS_CHANNEL, text("DS Bot background connection", "DS Bot 后台连接"), NotificationManager.IMPORTANCE_LOW))
      manager.createNotificationChannel(NotificationChannel(ALERT_CHANNEL, "DS Bot", NotificationManager.IMPORTANCE_HIGH))
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      BackgroundReceiver.userStopped = true
      getSharedPreferences("ds-bot-background", 0).edit().putBoolean("user-stopped", true).apply()
      BackgroundReceiver.reason = "stopped"
      stopSelf()
      return START_NOT_STICKY
    }
    val next = BackgroundReceiver.pending
    BackgroundReceiver.pending = null
    if (next == null) { stopSelf(); return START_NOT_STICKY }
    locale = next.locale
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(STATUS_ID, statusNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
      else startForeground(STATUS_ID, statusNotification())
    } catch (_: Exception) { BackgroundReceiver.reason = "permission-required"; stopSelf(); return START_NOT_STICKY }
    synchronized(lock) {
      generation++
      config = next
      cursor = next.cursor
      failures = 0
      state = "connecting"
      job?.cancel(true)
      connection?.disconnect()
      schedule(generation, 0)
    }
    return START_NOT_STICKY
  }

  fun status(): Map<String, Any> = synchronized(lock) {
    mapOf("running" to (config != null), "state" to state, "serverId" to (config?.serverId ?: ""), "cursor" to cursor, "expiresAt" to (config?.expiresAt ?: 0L), "userStopped" to BackgroundReceiver.userStopped)
  }

  fun advanceCursor(serverId: String, next: Long) = synchronized(lock) {
    if (config?.serverId == serverId) cursor = maxOf(cursor, next)
  }

  fun updateLocale(value: String) {
    locale = if (value == "zh") "zh" else "en"
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(STATUS_CHANNEL, text("DS Bot background connection", "DS Bot 后台连接"), NotificationManager.IMPORTANCE_LOW))
    if (config != null) manager.notify(STATUS_ID, statusNotification())
  }
  private fun text(english: String, chinese: String) = if (locale == "zh") chinese else english

  private fun schedule(epoch: Long, delay: Long) {
    job = executor.schedule({ poll(epoch) }, delay, TimeUnit.SECONDS)
  }

  private fun poll(epoch: Long) {
    val current: ReceiverConfig
    val after: Long
    synchronized(lock) {
      if (epoch != generation || config == null) return
      current = config!!
      after = cursor
    }
    if (current.expiresAt <= System.currentTimeMillis()) { finish("authorization-required", epoch); return }
    if ((Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) || !manager.areNotificationsEnabled()) { finish("permission-required", epoch); return }
    var delay = 10L
    try {
      val request = URL(current.url + "/mobile/v1/notifications/background").openConnection() as HttpURLConnection
      if (current.tlsPin.isNotEmpty()) {
        val secure = request as javax.net.ssl.HttpsURLConnection
        secure.sslSocketFactory = LocalTLS.factory(current.tlsPin).first
        secure.hostnameVerifier = okhttp3.OkHttpClient().hostnameVerifier
      }
      connection = request
      request.instanceFollowRedirects = false
      request.connectTimeout = 8000
      request.readTimeout = 10000
      request.requestMethod = "POST"
      request.setRequestProperty("Authorization", "Bearer " + current.token)
      request.setRequestProperty("Content-Type", "application/json")
      request.doOutput = true
      request.outputStream.use { it.write(JSONObject().put("cursor", after).toString().toByteArray(Charsets.UTF_8)) }
      val code = request.responseCode
      if (code == 401 || code == 403) { finish("authorization-required", epoch); return }
      check(code == 200) { "The host could not deliver notifications" }
      val bytes = request.inputStream.use { input ->
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          check(out.size() + count <= 256 * 1024) { "The notification response is too large" }
          out.write(buffer, 0, count)
        }
        out.toByteArray()
      }
      val response = JSONObject(String(bytes, Charsets.UTF_8))
      val next = response.getLong("cursor")
      val items = response.getJSONArray("items")
      check(next >= after && items.length() <= 100) { "The notification cursor is invalid" }
      synchronized(lock) {
        if (generation != epoch || config !== current) return
        if (!BackgroundReceiver.foreground && response.optBoolean("deliveryEnabled", false)) {
          // Coalesce a burst; inbox metadata remains available in the app.
          for (i in maxOf(0, items.length() - 3) until items.length()) {
            val item = items.getJSONObject(i)
            val id = item.getLong("id")
            val conversation = item.getString("conversationId")
            if (id > cursor && id <= next && conversation.length in 1..256) showAlert(current.serverId, conversation, id, item.getString("kind"))
          }
        }
        cursor = maxOf(cursor, next)
        failures = 0
        state = "connected"
        manager.notify(STATUS_ID, statusNotification())
      }
    } catch (_: Exception) {
      synchronized(lock) {
        if (generation != epoch) return
        failures++
        delay = minOf(60L, 10L * (1L shl minOf(failures, 3)))
        state = "reconnecting"
        manager.notify(STATUS_ID, statusNotification())
      }
    } finally { connection?.disconnect(); connection = null }
    synchronized(lock) { if (generation == epoch && config != null) schedule(epoch, delay) }
  }

  private fun builder(channel: String): Notification.Builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else Notification.Builder(this)
  private fun openApp(serverId: String? = null, conversation: String? = null, id: Long = 0): PendingIntent {
    val intent = packageManager.getLaunchIntentForPackage(packageName)!!
    if (serverId != null && conversation != null) {
      intent.data = Uri.Builder().scheme("dsbot").authority("notification").appendQueryParameter("serverId", serverId).appendQueryParameter("conversationId", conversation).appendQueryParameter("notificationId", id.toString()).build()
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun statusNotification(): Notification {
    val stop = PendingIntent.getService(this, 1, Intent(this, javaClass).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val message = if (state == "reconnecting") text("Connection lost. Reconnecting…", "网络中断，正在重连") else text("Receiving replies, questions and approvals", "后台接收新回复、提问和审批")
    return builder(STATUS_CHANNEL).setSmallIcon(R.drawable.ds_bot_notification).setContentTitle(text("DS Bot background reception is on", "DS Bot 后台通知已开启")).setContentText(message).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(openApp()).addAction(Notification.Action.Builder(null, text("Stop", "停止"), stop).build()).build()
  }
  private fun showAlert(serverId: String, conversation: String, id: Long, kind: String) {
    val title = when (kind) { "reply" -> text("New reply from your Bot", "Bot 有新回复"); "question" -> text("Your Bot has a question", "Bot 等待你的回答"); "approval" -> text("A tool needs your approval", "工具需要你的确认"); else -> return }
    val notification = builder(ALERT_CHANNEL).setSmallIcon(R.drawable.ds_bot_notification).setContentTitle(title).setContentText(text("Open DS Bot to view details", "打开 DS Bot 查看详情")).setContentIntent(openApp(serverId, conversation, id)).setAutoCancel(true).setCategory(Notification.CATEGORY_MESSAGE).setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE).build()
    manager.notify("ds-bot:" + serverId + ":" + conversation, (id % Int.MAX_VALUE).toInt(), notification)
  }
  private fun finish(reason: String, epoch: Long) {
    synchronized(lock) { if (generation != epoch) return; config = null; generation++; BackgroundReceiver.reason = reason }
    stopSelf()
  }
  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf(); super.onTaskRemoved(rootIntent) }
  override fun onDestroy() {
    synchronized(lock) { config = null; generation++; job?.cancel(true) }
    connection?.disconnect()
    executor.shutdownNow()
    BackgroundReceiver.instance = null
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val STATUS_CHANNEL = "ds-bot-background"
    private const val ALERT_CHANNEL = "ds-bot"
    private const val STATUS_ID = 42001
    private const val STOP = "app.dsbot.notifications.STOP"
  }
}
