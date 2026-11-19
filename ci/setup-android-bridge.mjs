import fs from 'fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const filtersPath = 'public/android-intent-filters.xml';

if (fs.existsSync(manifestPath) && fs.existsSync(filtersPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android.permission.RECORD_AUDIO')) {
    manifest = manifest.replace(
      /<application\b/,
      '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n\n    <application',
    );
  }
  if (!manifest.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
    const rawFilters = fs
      .readFileSync(filtersPath, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    const mainIdx = manifest.indexOf('android.intent.action.MAIN');
    const closeTagIdx =
      mainIdx >= 0 ? manifest.indexOf('</activity>', mainIdx) : manifest.indexOf('</activity>');
    if (closeTagIdx >= 0) {
      manifest =
        manifest.slice(0, closeTagIdx) +
        `\n        ${rawFilters}\n        ` +
        manifest.slice(closeTagIdx);
    }
  }
  fs.writeFileSync(manifestPath, manifest);
}

const mainActivityPath = 'android/app/src/main/java/com/alx/office/MainActivity.java';
if (fs.existsSync(mainActivityPath)) {
  const javaCode = `package com.alx.office;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
  private String pendingFileJson = null;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (this.bridge != null && this.bridge.getWebView() != null) {
      this.bridge.getWebView().addJavascriptInterface(new AlxNativeBridge(), "AlxNativeBridge");
    }
    handleIncomingIntent(getIntent());
  }

  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIncomingIntent(intent);
  }

  private void handleIncomingIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    Uri uri = null;
    if (Intent.ACTION_VIEW.equals(action)) {
      uri = intent.getData();
    } else if (Intent.ACTION_SEND.equals(action)) {
      uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }
    if (uri == null) return;

    try {
      String mimeType = getContentResolver().getType(uri);
      String name = resolveFileName(uri, mimeType);
      InputStream is = getContentResolver().openInputStream(uri);
      if (is == null) return;
      ByteArrayOutputStream baos = new ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int read;
      int total = 0;
      int maxBytes = 25 * 1024 * 1024;
      while ((read = is.read(buf)) != -1) {
        total += read;
        if (total > maxBytes) {
          is.close();
          return;
        }
        baos.write(buf, 0, read);
      }
      is.close();

      String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
      JSONObject json = new JSONObject();
      json.put("name", name);
      json.put("mimeType", mimeType != null ? mimeType : "application/octet-stream");
      json.put("base64", base64);
      pendingFileJson = json.toString();

      if (this.bridge != null && this.bridge.getWebView() != null) {
        this.bridge.getWebView().post(() -> {
          if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().evaluateJavascript(
              "window.dispatchEvent(new Event('alx-native-file'));",
              null
            );
          }
        });
      }
    } catch (Exception ignored) {
    }
  }

  private String resolveFileName(Uri uri, String mimeType) {
    String result = null;
    if ("content".equals(uri.getScheme())) {
      try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
        if (cursor != null && cursor.moveToFirst()) {
          int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
          if (idx >= 0) result = cursor.getString(idx);
        }
      } catch (Exception ignored) {
      }
    }
    if (result == null || result.isEmpty()) {
      result = uri.getLastPathSegment();
    }
    if (result == null || result.isEmpty()) {
      result = "documento";
    }
    if (!result.contains(".") && mimeType != null) {
      if (mimeType.contains("pdf")) result += ".pdf";
      else if (mimeType.contains("wordprocessingml")) result += ".docx";
      else if (mimeType.contains("msword")) result += ".doc";
      else if (mimeType.contains("presentationml")) result += ".pptx";
      else if (mimeType.contains("ms-powerpoint")) result += ".ppt";
      else if (mimeType.contains("text/plain")) result += ".txt";
    }
    return result;
  }

  private class AlxNativeBridge {
    @JavascriptInterface
    public String consumePendingFile() {
      String out = pendingFileJson;
      pendingFileJson = null;
      return out;
    }
  }
}
`;
  fs.writeFileSync(mainActivityPath, javaCode);
}
