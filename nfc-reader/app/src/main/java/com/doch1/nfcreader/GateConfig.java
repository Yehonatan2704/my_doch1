package com.doch1.nfcreader;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Speedgate configuration. The API URL lives in plain preferences; the reader token (the device's
 * only credential) is encrypted with an AES-256/GCM key that never leaves Android Keystore.
 * Backups are disabled in the manifest, so neither is copied off the device.
 */
final class GateConfig {
    private static final String PREFS = "doch1.gate";
    private static final String KEY_URL = "api_url";
    private static final String KEY_TOKEN = "reader_token_enc";
    private static final String KEY_ALIAS = "doch1-gate-reader-token";

    // <readerId UUID>.<32 random bytes, base64url> — exactly what POST /nfc/readers returns.
    private static final Pattern TOKEN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$");

    private GateConfig() {}

    static boolean isConfigured(Context context) {
        SharedPreferences p = prefs(context);
        return p.contains(KEY_URL) && p.contains(KEY_TOKEN);
    }

    static String apiUrl(Context context) {
        return prefs(context).getString(KEY_URL, null);
    }

    /** Null if the token can't be decrypted (e.g. the Keystore key was wiped) — reconfigure. */
    static String readerToken(Context context) {
        String stored = prefs(context).getString(KEY_TOKEN, null);
        if (stored == null) return null;
        String[] parts = stored.split(":", 2);
        if (parts.length != 2) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(),
                    new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException | java.io.IOException error) {
            return null;
        }
    }

    /** Validates and stores. Returns a user-facing error, or null on success. */
    static String save(Context context, String rawUrl, String rawToken) {
        String url = rawUrl == null ? "" : rawUrl.trim().replaceAll("/+$", "");
        String token = rawToken == null ? "" : rawToken.trim();
        if (!url.startsWith("https://") && !(isDebuggable(context) && url.startsWith("http://")))
            return "כתובת השרת חייבת להתחיל ב-https://";
        if (!TOKEN.matcher(token).matches()) return "טוקן הקורא אינו תקין";
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] sealed = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(sealed, Base64.NO_WRAP);
            prefs(context).edit().putString(KEY_URL, url).putString(KEY_TOKEN, stored).apply();
            return null;
        } catch (GeneralSecurityException | java.io.IOException error) {
            return "שמירת הטוקן נכשלה";
        }
    }

    static void clear(Context context) {
        prefs(context).edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            keyStore.deleteEntry(KEY_ALIAS);
        } catch (GeneralSecurityException | java.io.IOException ignored) {
            // Nothing to delete.
        }
    }

    /** Plain HTTP is allowed only in debuggable builds (local testing against a dev API). */
    static boolean isDebuggable(Context context) {
        return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws GeneralSecurityException, java.io.IOException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(
                    KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            return generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
    }
}
