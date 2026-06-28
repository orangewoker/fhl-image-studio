package top.fangtangyuan.fhlstudio.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AndroidJobService : Service() {
    companion object {
        const val ACTION_RUN_JOBS = "top.fangtangyuan.fhlstudio.android.action.RUN_JOBS"
        private const val channelId = "fhl_studio_generation"
        private const val notificationId = 207550870
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        AndroidJobManager.ensureWorker(applicationContext) {
            stopSelf()
        }
        return START_STICKY
    }

    private fun startInForeground() {
        ensureChannel()
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("FHL Studio 正在生成图片")
            .setContentText("关闭界面后任务仍会继续，完成后重新打开即可查看结果。")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(notificationId, notification)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            channelId,
            "FHL Studio 生图任务",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "FHL Studio 后台生图任务进度通知"
        }
        manager.createNotificationChannel(channel)
    }
}
