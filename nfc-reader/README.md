# Doch1 Android NFC Inspector

A native Android app for inspecting what a soldier card exposes over NFC before the Doch1 attendance API and database flow are designed.

The app has two modes.

- **Inspector mode** (default, not configured): foreground reader mode scans NFC-A, NFC-B, NFC-F, NFC-V, NFC Barcode, ISO-DEP, MIFARE, and NDEF tags, and for ISO-DEP cards attempts a read-only inspection of the public Rav-Kav/Calypso application (`1TIC.ICA`). Nothing leaves the phone: results stay in memory and copies are redacted.
- **Gate (speedgate) mode** (after configuration): each tap reads **only the Calypso application serial** (a single `SELECT`, no record is read — no birth date or holder identifier) and sends it to the Doch1 API as an entry/exit scan (SPEC F13). This is the only data the app ever transmits, over HTTPS only in release builds.

The app never writes to a card, never authenticates to it, and does not persist scan history.

## Recommended: install with USB from this Mac

The Android command-line tools are already installed on this Mac, and a verified debug APK has already been built.

1. On an NFC-capable Android phone, open **Settings → About phone**.
2. Tap **Build number** seven times. On some phones it is under **Software information**.
3. Return to Settings, open **Developer options**, and enable **USB debugging**.
4. Connect the phone to this Mac with a data-capable USB cable.
5. Unlock the phone and accept **Allow USB debugging?**. Enabling **Always allow from this computer** is optional.
6. From this project directory, check that the phone is visible:

   ```sh
   /opt/homebrew/share/android-commandlinetools/platform-tools/adb devices
   ```

   The phone should be listed with the state `device`, not `unauthorized`.

7. Install or update the inspector:

   ```sh
   /opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

8. Open **Doch1 NFC Inspector** from the phone's app drawer.

ADB installation does not require Play Store publication or Android developer verification. Device-management policies may still block local development apps.

## Alternative: transfer the APK to the phone

The APK is `app/build/outputs/apk/debug/app-debug.apk`. Transfer it to the phone with USB file transfer, Quick Share, or a private Drive folder, then open it from the phone's Files app. Android may ask you to allow that Files/Drive app to **Install unknown apps**. Use this only on a test phone you control; ADB is the recommended development workflow.

## Scan a card

1. In Android Settings, make sure **NFC** is enabled.
2. Open **Doch1 NFC Inspector**. The status must say **Reader active — hold a card near the phone**.
3. Keep the screen unlocked and the inspector in the foreground.
4. Hold the card flat against the back of the phone. Start near the upper-middle area and move it slowly; NFC antenna position differs by model.
5. Keep it still until the phone sounds/vibrates and the app shows **Card detected**.
6. Scroll through the fields or tap **Copy redacted result**. Personal values remain visible locally but are omitted from copied text.
7. Remove the card for two seconds before scanning it again.

For identifier testing, scan the same card twice and a second card once.

No Play Store account is required to build and run a debug APK from Android Studio. Device/vendor policies may still restrict installing local applications.

## Gate (speedgate) mode

1. **HR provisions a reader** for a base (API, logged in as an HR admin):
   `POST /api/v1/nfc/readers` with `{"baseCode": "test-base", "name": "שער ראשי"}` → a one-time `readerToken`.
2. **HR enrolls each soldier's card**: `PUT /api/v1/nfc/cards` with `{"personalNumber": "…", "calypsoSerial": "…"}`. (The serial is shown in inspector mode on that card.)
3. On the gate phone, open the app → **הגדרת שער** → enter the API URL (e.g. `https://doch1-api.onrender.com/api/v1`) and the reader token → **שמירה**.
   The token is encrypted with an Android Keystore key; the field is cleared after saving. Release builds accept only `https://` URLs; debug builds also accept `http://` for a local dev API.
4. Taps now show **כניסה / יציאה**, duplicates (same card within 10 s), unknown cards, inactive users, and "open at another base".
   Each tap has its own request id; network retries reuse it, so a flaky connection can't record a scan twice.
5. **איפוס הגדרות השער** removes the URL, the token, and the Keystore key.

The free Render API sleeps when idle; the first tap after a while can take up to a minute.

## What it reports

- Hardware identifier exposed by Android
- Complete Android tag technology list
- NFC-A ATQA and SAK
- NFC-B application data and protocol info
- ISO-DEP historical bytes, high-layer response, and APDU capability metadata
- Public Rav-Kav/Calypso application presence, application serial, transit environment metadata, and—when exposed—a personal holder identifier and birth date
- Recognition of the IDF transit issuer (`0x376FA`); IDF-issued cards may deliberately omit a public personal holder identifier
- NFC-F manufacturer and system code
- NFC-V flags and DSFID
- MIFARE family and unprotected geometry metadata
- NDEF capacity, write status, decoded Text/URI data, and raw hexadecimal records

The inspector sends only the standard ISO 7816 `SELECT` and `READ RECORD` commands needed for the known public Rav-Kav application. It does not attempt authentication, decryption, secure-session access, or any write command. Protected application data still requires issuer authorization and credentials.

## Safe test procedure

1. Scan the same test card twice and confirm whether the hardware identifier is stable.
2. Scan a second test card and confirm the identifier differs.
3. Record only tag type, technology names, field lengths, stability, and heavily redacted values.
4. Never commit real card identifiers or personal data to this repository.

For the next development step, share only:

- The technology names, such as `NfcA`, `IsoDep`, `Ndef`, or `MifareClassic`
- Hardware identifier byte length and whether it stayed identical across scans
- Whether a second card produced a different identifier
- Whether NDEF was exposed
- Lengths of historical/application/protocol fields
- Heavily redacted examples, such as `04AB…91EF`; never a complete identifier or personal number
