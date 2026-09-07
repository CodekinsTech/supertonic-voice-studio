package com.supertonic.voicestudio;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "AudioDownload")
public class DownloadPlugin extends Plugin {
    private static final String CHANNEL_ID = "wave_downloads";

    @PluginMethod()
    public void saveAudio(PluginCall call) {
        String base64Data = call.getString("data");
        String filename = call.getString("filename", "wave-output.mp3");
        String mime = call.getString("mime", "audio/mpeg");

        if (base64Data == null) {
            call.reject("No data provided");
            return;
        }

        try {
            byte[] audioBytes = Base64.decode(base64Data, Base64.DEFAULT);
            String savedPath;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri uri = getContext().getContentResolver().insert(
                    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);

                if (uri == null) {
                    call.reject("Failed to create media entry");
                    return;
                }

                OutputStream os = getContext().getContentResolver().openOutputStream(uri);
                os.write(audioBytes);
                os.close();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, values, null, null);
                savedPath = "Downloads/" + filename;
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(audioBytes);
                fos.close();
                savedPath = file.getAbsolutePath();
            }

            showNotification(filename, savedPath);
            call.resolve(new com.getcapacitor.JSObject().put("path", savedPath));

        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage());
        }
    }

    private void showNotification(String filename, String path) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Audio file downloads");
            nm.createNotificationChannel(channel);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Download complete")
            .setContentText(filename + " saved to Downloads")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        nm.notify((int) System.currentTimeMillis(), builder.build());
    }
}
