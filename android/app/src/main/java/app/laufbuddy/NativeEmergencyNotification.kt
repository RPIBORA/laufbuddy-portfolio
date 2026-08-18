package app.laufbuddy

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat

object NativeEmergencyNotification {
  private const val CHANNEL = "laufbuddy_pending_emergency"
  private const val ID = 201
  fun show(context: Context, text: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(NotificationChannel(CHANNEL, "LaufBuddy Notruf", NotificationManager.IMPORTANCE_HIGH))
    manager.notify(ID, NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("Notruf")
      .setContentText(text).setOngoing(true).setAutoCancel(false)
      .setCategory(NotificationCompat.CATEGORY_CALL).build())
  }
  fun cancel(context: Context) { (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(ID) }
}
