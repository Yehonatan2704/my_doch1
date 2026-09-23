package com.doch1.nfcreader;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * POST /speedgate/scans. One physical scan = one requestId; every retry of that scan reuses it,
 * so the server applies the scan once and replays the same answer (no double entry/exit).
 * Runs on the NFC reader thread, never the UI thread.
 */
final class SpeedgateClient {
    static final class Response {
        final int status; // 0 = no HTTP response (network error)
        final JSONObject body; // may be null
        Response(int status, JSONObject body) {
            this.status = status;
            this.body = body;
        }
    }

    private static final int ATTEMPTS = 3;

    private SpeedgateClient() {}

    static Response scan(String apiUrl, String readerToken, String calypsoSerial, boolean allowHttp) {
        if (!apiUrl.startsWith("https://") && !(allowHttp && apiUrl.startsWith("http://")))
            return new Response(0, null); // release builds never send a credential over plain HTTP
        String payload;
        try {
            payload = new JSONObject()
                    .put("calypsoSerial", calypsoSerial)
                    .put("requestId", UUID.randomUUID().toString())
                    .toString();
        } catch (JSONException impossible) {
            return new Response(0, null);
        }

        Response last = new Response(0, null);
        for (int attempt = 0; attempt < ATTEMPTS; attempt++) {
            if (attempt > 0) sleep(1000L * attempt);
            try {
                last = post(apiUrl + "/speedgate/scans", readerToken, payload);
                // Retry only what may not have been applied: no answer or a server error.
                if (last.status < 500) return last;
            } catch (IOException networkError) {
                last = new Response(0, null);
            }
        }
        return last;
    }

    private static Response post(String url, String readerToken, String payload) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setInstanceFollowRedirects(false); // never re-send the credential elsewhere
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(25_000); // free-plan API may be waking up
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Gate " + readerToken);
            byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
            int status = conn.getResponseCode();
            InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            return new Response(status, parse(stream));
        } finally {
            conn.disconnect();
        }
    }

    private static JSONObject parse(InputStream stream) {
        if (stream == null) return null;
        try (InputStream in = stream) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = in.read(chunk)) != -1 && buffer.size() < 64 * 1024) buffer.write(chunk, 0, read);
            return new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
        } catch (IOException | JSONException error) {
            return null;
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
