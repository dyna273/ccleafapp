package com.leafforge.studio;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * LeafForge Studio - a thin native shell around the web app in
 * src/main/assets. It exists so that:
 *   - the studio runs offline, with no browser and no server
 *   - <input type="file"> opens the system file picker (for .bbmodel uploads)
 *   - exports are written to the user's Downloads/LeafForge folder
 */
public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQUEST_FILE = 1001;
    private static final int REQUEST_STORAGE = 1002;
    private static final String DOWNLOAD_SUBFOLDER = "LeafForge";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#0d1117"));
        getWindow().setNavigationBarColor(Color.parseColor("#0b0e14"));
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0e14"));
        root.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(webView);
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // the page itself is a file:// asset and reads its sample models from
        // the same asset tree, so cross file:// reads have to be permitted
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        s.setDefaultTextEncodingName("utf-8");

        webView.setBackgroundColor(Color.parseColor("#0b0e14"));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.addJavascriptInterface(new NativeBridge(), "LeafForgeNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // keep everything inside the app
                return !url.startsWith("file:///android_asset/");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectEnvironment();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE && Build.VERSION.SDK_INT >= 18) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    // Some OEM pickers ignore the fancy MIME list; model files
                    // are JSON, so offer both.
                    intent.setType("*/*");
                    String[] mimes = params.getAcceptTypes();
                    if (mimes != null && mimes.length > 0) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
                    }
                    startActivityForResult(Intent.createChooser(intent, "Choose a model or image"), REQUEST_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    toast("No file picker available");
                    return false;
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl("file:///android_asset/index.html");
        }
    }

    private void injectEnvironment() {
        webView.evaluateJavascript(
                "(function(){window.LEAFFORGE_ANDROID=true;" +
                        "window.LeafForgeNative=window.LeafForgeNative||{};" +
                        "return true;})()",
                null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE) {
            if (filePathCallback == null) {
                super.onActivityResult(requestCode, resultCode, data);
                return;
            }
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[] { Uri.parse(dataString) };
                } else if (Build.VERSION.SDK_INT >= 16 && data.getClipData() != null) {
                    final int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        if (requestCode == REQUEST_STORAGE) {
            boolean granted = grants != null && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                retryPendingSave();
            } else {
                toast("Storage permission is needed to save your export");
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grants);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(final String message) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void toastSaved(final String message) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
            }
        });
    }

    /** Called from JavaScript to write an exported file to shared storage. */
    public class NativeBridge {
        @JavascriptInterface
        public void saveBase64(final String name, final String mime, final String base64) {
            if (base64 == null || base64.length() == 0) return;
            new Thread(new Runnable() {
                public void run() {
                    try {
                        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                        String path = writeToDownloads(name, mime, bytes);
                        toastSaved("Saved to " + path);
                    } catch (Exception e) {
                        toast("Save failed: " + e.getMessage());
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void saveText(final String name, final String mime, final String text) {
            saveBase64(name, mime,
                    Base64.encodeToString(text.getBytes(), Base64.DEFAULT));
        }

        @JavascriptInterface
        public void toast(final String message) {
            MainActivity.this.toast(message);
        }

        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }
    }

    private String pendingName;
    private String pendingMime;
    private byte[] pendingBytes;

    private void retryPendingSave() {
        if (pendingBytes == null) return;
        try {
            String path = writeToDownloads(pendingName, pendingMime, pendingBytes);
            toastSaved("Saved to " + path);
        } catch (Exception e) {
            toast("Save failed: " + e.getMessage());
        }
        pendingBytes = null;
    }

    private String writeToDownloads(String rawName, String mime, byte[] bytes) throws Exception {
        String name = sanitize(rawName);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime != null ? mime : "application/octet-stream");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOAD_SUBFOLDER);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("could not create file");
            OutputStream os = getContentResolver().openOutputStream(uri);
            if (os == null) throw new Exception("could not open file");
            os.write(bytes);
            os.flush();
            os.close();
            return "Downloads/" + DOWNLOAD_SUBFOLDER + "/" + name;
        }

        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingName = name;
                pendingMime = mime;
                pendingBytes = bytes;
                requestPermissions(new String[] { android.Manifest.permission.WRITE_EXTERNAL_STORAGE },
                        REQUEST_STORAGE);
                return "waiting for permission";
            }
        }

        File dir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS), DOWNLOAD_SUBFOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("could not create folder");
        File file = new File(dir, name);
        FileOutputStream fos = new FileOutputStream(file);
        fos.write(bytes);
        fos.flush();
        fos.close();
        return file.getAbsolutePath();
    }

    private static String sanitize(String name) {
        if (name == null || name.length() == 0) return "leafforge-export";
        String cleaned = name.replaceAll("[^A-Za-z0-9._\\- ]+", "_").replaceAll("\\s+", "-");
        cleaned = cleaned.replaceAll("^[-.]+", "");
        if (cleaned.length() > 80) cleaned = cleaned.substring(0, 80);
        if (cleaned.length() == 0) cleaned = "leafforge-export";
        return cleaned;
    }

    /** Utility kept for future use: read an asset as a string. */
    static String readAsset(Context context, String path) throws Exception {
        InputStream is = context.getAssets().open(path);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = is.read(buffer)) != -1) bos.write(buffer, 0, read);
        is.close();
        return new String(bos.toByteArray(), "UTF-8");
    }
}
