package com.doch1.nfcreader;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URI;
import java.text.DateFormat;
import java.util.Date;

public final class MainActivity extends Activity implements NfcAdapter.ReaderCallback {
    private static final long DUPLICATE_WINDOW_MS = 1800L;

    private NfcAdapter nfcAdapter;
    private TextView statusView;
    private LinearLayout resultContainer;
    private Button readerButton;
    private Button copyButton;
    private LinearLayout gateCard;
    private TextView introTitle;
    private TextView introBody;
    private boolean readerRequested = true;
    private ScanResult lastResult;
    private String lastTagId;
    private long lastTagAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        nfcAdapter = NfcAdapter.getDefaultAdapter(this);
        setContentView(buildContent());
        updateAvailability();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateAvailability();
        if (readerRequested) enableReader();
    }

    @Override
    protected void onPause() {
        if (nfcAdapter != null) nfcAdapter.disableReaderMode(this);
        super.onPause();
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        String id = NfcInspector.hex(tag.getId());
        long now = SystemClock.elapsedRealtime();
        synchronized (this) {
            if (id.equals(lastTagId) && now - lastTagAt < DUPLICATE_WINDOW_MS) return;
            lastTagId = id;
            lastTagAt = now;
        }

        if (GateConfig.isConfigured(this)) {
            handleGateScan(tag);
            return;
        }

        try {
            ScanResult result = NfcInspector.inspect(tag);
            runOnUiThread(() -> showResult(result));
        } catch (RuntimeException error) {
            runOnUiThread(() -> showError("Could not inspect this card: " + error.getClass().getSimpleName()));
        }
    }

    private View buildContent() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(color(R.color.surface_background));

        TextView toolbar = new TextView(this);
        toolbar.setText("Doch1 NFC Inspector");
        toolbar.setTextColor(color(R.color.brand_ink));
        toolbar.setTextSize(22);
        toolbar.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(20), dp(16), dp(20), dp(16));
        toolbar.setBackgroundColor(color(R.color.brand_yellow));
        root.addView(toolbar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(20), dp(20), dp(36));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        LinearLayout intro = card();
        introTitle = text("", 18, true, R.color.brand_ink);
        intro.addView(introTitle);
        introBody = text("", 15, false, R.color.text_secondary);
        introBody.setPadding(0, dp(8), 0, 0);
        intro.addView(introBody);
        content.addView(intro, matchWithBottomMargin(16));

        gateCard = card();
        content.addView(gateCard, matchWithBottomMargin(16));
        renderGateCard();

        statusView = text("Checking NFC…", 16, true, R.color.brand_ink);
        statusView.setPadding(dp(16), dp(14), dp(16), dp(14));
        statusView.setBackground(rounded(color(R.color.surface_card), 14));
        content.addView(statusView, matchWithBottomMargin(12));

        readerButton = new Button(this);
        readerButton.setText("Stop reader");
        readerButton.setTextColor(Color.WHITE);
        readerButton.setTextSize(16);
        readerButton.setAllCaps(false);
        readerButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(color(R.color.brand_ink)));
        readerButton.setMinHeight(dp(52));
        readerButton.setOnClickListener(view -> toggleReader());
        content.addView(readerButton, matchWithBottomMargin(16));

        copyButton = new Button(this);
        copyButton.setText("Copy redacted result");
        copyButton.setAllCaps(false);
        copyButton.setEnabled(false);
        copyButton.setOnClickListener(view -> copyResult());
        content.addView(copyButton, matchWithBottomMargin(12));

        resultContainer = card();
        resultContainer.addView(text("No card scanned yet", 18, true, R.color.brand_ink));
        TextView hint = text("Keep this screen open and move the card close to the phone's NFC antenna.", 15, false, R.color.text_secondary);
        hint.setPadding(0, dp(8), 0, 0);
        resultContainer.addView(hint);
        content.addView(resultContainer, matchWithBottomMargin(16));

        TextView warning = text(
                "Personal card data is shown only on this screen. Copying automatically redacts sensitive values.",
                13, true, R.color.warning);
        warning.setPadding(dp(4), 0, dp(4), 0);
        content.addView(warning);

        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        return root;
    }

    private void toggleReader() {
        readerRequested = !readerRequested;
        if (readerRequested) {
            enableReader();
        } else {
            if (nfcAdapter != null) nfcAdapter.disableReaderMode(this);
            statusView.setText("Reader paused");
            readerButton.setText("Start reader");
        }
    }

    private void enableReader() {
        statusView.setTextColor(color(R.color.brand_ink));
        if (nfcAdapter == null) {
            statusView.setText("This Android device has no NFC reader");
            readerButton.setEnabled(false);
            return;
        }
        if (!nfcAdapter.isEnabled()) {
            statusView.setText("NFC is off. Enable it in Android Settings.");
            readerButton.setText("Open NFC settings");
            readerButton.setEnabled(true);
            readerButton.setOnClickListener(view -> startActivity(new android.content.Intent(Settings.ACTION_NFC_SETTINGS)));
            return;
        }

        readerButton.setOnClickListener(view -> toggleReader());
        int flags = NfcAdapter.FLAG_READER_NFC_A
                | NfcAdapter.FLAG_READER_NFC_B
                | NfcAdapter.FLAG_READER_NFC_F
                | NfcAdapter.FLAG_READER_NFC_V
                | NfcAdapter.FLAG_READER_NFC_BARCODE;
        Bundle options = new Bundle();
        options.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        nfcAdapter.enableReaderMode(this, this, flags, options);
        statusView.setText("Reader active — hold a card near the phone");
        readerButton.setText("Stop reader");
        readerButton.setEnabled(true);
    }

    private void updateAvailability() {
        if (nfcAdapter == null) {
            statusView.setText("This Android device has no NFC reader");
            readerButton.setEnabled(false);
        } else if (!nfcAdapter.isEnabled()) {
            statusView.setText("NFC is off. Enable it in Android Settings.");
        }
    }

    private void showResult(ScanResult result) {
        lastResult = result;
        copyButton.setEnabled(true);
        statusView.setTextColor(color(R.color.brand_ink));
        statusView.setText("Card detected — reader remains active");
        resultContainer.removeAllViews();

        TextView heading = text("Last scan", 19, true, R.color.brand_ink);
        resultContainer.addView(heading);
        TextView time = text(
                DateFormat.getDateTimeInstance().format(new Date(result.getScannedAtMillis())),
                13, false, R.color.text_secondary);
        time.setPadding(0, dp(2), 0, dp(10));
        resultContainer.addView(time);

        for (ScanResult.Field field : result.getFields()) {
            TextView label = text(field.label, 13, true, R.color.text_secondary);
            label.setPadding(0, dp(10), 0, dp(2));
            resultContainer.addView(label);

            TextView value = text(field.value, 15, false, R.color.brand_ink);
            value.setTypeface(Typeface.MONOSPACE);
            value.setTextIsSelectable(true);
            resultContainer.addView(value);
        }
    }

    // ---------- speedgate mode ----------

    /** Configured: shows the target server + reset. Not configured: the one-time setup form. */
    private void renderGateCard() {
        gateCard.removeAllViews();
        boolean configured = GateConfig.isConfigured(this);
        introTitle.setText(configured ? "מצב שער (Speedgate)" : "Local inspection only");
        introBody.setText(configured
                ? "סריקת כרטיס רושמת כניסה או יציאה. נקרא ונשלח רק המספר הסידורי של יישום Calypso — שום נתון אישי אחר."
                : "Hold a card near the back of this phone. Data stays in memory and is never sent to Doch1 or written to the card.");

        if (configured) {
            gateCard.addView(text("השער מחובר לשרת", 17, true, R.color.brand_ink));
            TextView host = text(host(GateConfig.apiUrl(this)), 14, false, R.color.text_secondary);
            host.setPadding(0, dp(4), 0, dp(12));
            gateCard.addView(host);
            Button reset = new Button(this);
            reset.setText("איפוס הגדרות השער");
            reset.setAllCaps(false);
            reset.setOnClickListener(view -> {
                GateConfig.clear(this);
                renderGateCard();
            });
            gateCard.addView(reset);
            return;
        }

        gateCard.addView(text("הגדרת שער (Speedgate)", 17, true, R.color.brand_ink));
        TextView help = text("הזינו את כתובת ה-API ואת טוקן הקורא החד-פעמי שקיבל משא״ן.", 14, false, R.color.text_secondary);
        help.setPadding(0, dp(4), 0, dp(8));
        gateCard.addView(help);
        EditText url = input("https://doch1-api.onrender.com/api/v1", InputType.TYPE_TEXT_VARIATION_URI);
        EditText token = input("טוקן קורא", InputType.TYPE_TEXT_VARIATION_PASSWORD);
        gateCard.addView(url);
        gateCard.addView(token);
        Button save = new Button(this);
        save.setText("שמירה");
        save.setAllCaps(false);
        save.setOnClickListener(view -> {
            String error = GateConfig.save(this, url.getText().toString(), token.getText().toString());
            token.setText(""); // the plaintext token doesn't linger in the field
            if (error != null) {
                Toast.makeText(this, error, Toast.LENGTH_LONG).show();
            } else {
                renderGateCard();
            }
        });
        gateCard.addView(save);
    }

    /** NFC reader thread. Reads only the serial, then blocks on the API call (retries inside). */
    private void handleGateScan(Tag tag) {
        String serial;
        try {
            serial = CalypsoInspector.readApplicationSerial(tag);
        } catch (IOException | SecurityException error) {
            runOnUiThread(() -> showGateMessage("הכרטיס זז מהר מדי — נסו שוב", R.color.warning, null, null));
            return;
        }
        if (serial == null) {
            runOnUiThread(() -> showGateMessage("לא זוהה כרטיס חוגר", R.color.danger, null, null));
            return;
        }
        String url = GateConfig.apiUrl(this);
        String token = GateConfig.readerToken(this);
        if (url == null || token == null) {
            runOnUiThread(() -> showGateMessage("הגדרות השער אבדו — יש להגדיר מחדש", R.color.danger, null, null));
            return;
        }
        runOnUiThread(() -> statusView.setText("שולח…"));
        SpeedgateClient.Response response =
                SpeedgateClient.scan(url, token, serial, GateConfig.isDebuggable(this));
        runOnUiThread(() -> showGateResponse(response));
    }

    private void showGateResponse(SpeedgateClient.Response r) {
        if (r.status == 200 && r.body != null) {
            JSONObject soldier = r.body.optJSONObject("soldier");
            String name = soldier == null ? null
                    : soldier.optString("firstName") + " " + soldier.optString("lastName");
            int conflicts = 0;
            JSONArray days = r.body.optJSONArray("reportDays");
            for (int i = 0; days != null && i < days.length(); i++) {
                JSONObject day = days.optJSONObject(i);
                if (day != null && day.optString("result").endsWith("conflict")) conflicts++;
            }
            String detail = conflicts > 0 ? conflicts + " ימים לא עודכנו — כבר קיים דיווח אחר" : null;
            switch (r.body.optString("result")) {
                case "entry":
                    showGateMessage("כניסה ✓", R.color.success, name, detail);
                    break;
                case "exit":
                    showGateMessage("יציאה ✓", R.color.info, name, detail);
                    break;
                case "duplicate":
                    showGateMessage("סריקה כפולה — לא נרשם שינוי", R.color.text_secondary, name, null);
                    break;
                case "unknown_card":
                    showGateMessage("כרטיס לא רשום במערכת", R.color.danger, null, "יש לפנות למשא״ן לרישום הכרטיס");
                    break;
                case "inactive_user":
                    showGateMessage("משתמש לא פעיל", R.color.danger, null, "יש לפנות למשא״ן");
                    break;
                case "wrong_base":
                    showGateMessage("רשום/ה כנמצא/ת בבסיס אחר", R.color.warning, name, "יש לסרוק יציאה בבסיס ההוא");
                    break;
                default:
                    showGateMessage("תשובה לא מוכרת מהשרת", R.color.danger, null, null);
            }
        } else if (r.status == 401) {
            showGateMessage("הקורא לא מורשה", R.color.danger, null, "יש להפיק טוקן חדש ולהגדיר את השער מחדש");
        } else if (r.status == 429) {
            showGateMessage("יותר מדי סריקות", R.color.warning, null, "המתינו רגע ונסו שוב");
        } else if (r.status == 0) {
            showGateMessage("אין חיבור לשרת", R.color.danger, null, "הסריקה לא נרשמה — נסו שוב");
        } else {
            showGateMessage("שגיאה בשרת", R.color.danger, null, "HTTP " + r.status + " — הסריקה לא נרשמה");
        }
    }

    private void showGateMessage(String title, int colorResource, String name, String detail) {
        lastResult = null;
        copyButton.setEnabled(false);
        statusView.setTextColor(color(R.color.brand_ink));
        statusView.setText("הקורא פעיל — קרבו כרטיס");
        resultContainer.removeAllViews();
        resultContainer.addView(text(title, 26, true, colorResource));
        if (name != null) {
            TextView who = text(name, 20, true, R.color.brand_ink);
            who.setPadding(0, dp(6), 0, 0);
            resultContainer.addView(who);
        }
        if (detail != null) {
            TextView more = text(detail, 15, false, R.color.text_secondary);
            more.setPadding(0, dp(6), 0, 0);
            resultContainer.addView(more);
        }
        TextView time = text(DateFormat.getTimeInstance().format(new Date()), 13, false, R.color.text_secondary);
        time.setPadding(0, dp(10), 0, 0);
        resultContainer.addView(time);
    }

    private EditText input(String hint, int variation) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setInputType(InputType.TYPE_CLASS_TEXT | variation);
        return field;
    }

    private static String host(String url) {
        try {
            return URI.create(url).getHost();
        } catch (RuntimeException invalid) {
            return "";
        }
    }

    private void showError(String message) {
        statusView.setText(message);
        statusView.setTextColor(color(R.color.danger));
    }

    private void copyResult() {
        if (lastResult == null) return;
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("Doch1 NFC result", lastResult.asCopyText()));
        Toast.makeText(this, "Redacted result copied", Toast.LENGTH_SHORT).show();
    }

    private LinearLayout card() {
        LinearLayout value = new LinearLayout(this);
        value.setOrientation(LinearLayout.VERTICAL);
        value.setPadding(dp(16), dp(16), dp(16), dp(16));
        value.setBackground(rounded(color(R.color.surface_card), 16));
        return value;
    }

    private TextView text(String value, int sizeSp, boolean bold, int colorResource) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color(colorResource));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int fillColor, int radiusDp) {
        GradientDrawable value = new GradientDrawable();
        value.setColor(fillColor);
        value.setCornerRadius(dp(radiusDp));
        return value;
    }

    private LinearLayout.LayoutParams matchWithBottomMargin(int marginDp) {
        LinearLayout.LayoutParams value = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        value.bottomMargin = dp(marginDp);
        return value;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int color(int resource) {
        return getColor(resource);
    }
}
