package com.doch1.nfcreader;

import android.nfc.Tag;
import android.nfc.tech.IsoDep;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Read-only inspection of the public Rav-Kav ticketing application carried by some cards.
 * This class only sends ISO 7816 SELECT and READ RECORD commands. It never authenticates,
 * opens a secure session, decrypts protected data, or writes to the card.
 */
final class CalypsoInspector {
    private static final byte[] RAV_KAV_AID = new byte[] {
            0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41 // "1TIC.ICA"
    };
    private static final int TICKETING_ENVIRONMENT_SFI = 0x07;
    private static final int HOLDER_ID_BIT_OFFSET = 156;
    private static final int MIN_ENVIRONMENT_BITS = HOLDER_ID_BIT_OFFSET + 30;

    private CalypsoInspector() {}

    static void inspect(Tag tag, List<ScanResult.Field> fields) {
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) return;

        try {
            isoDep.connect();
            isoDep.setTimeout(3000);

            ApduResponse select = exchange(isoDep, selectApplicationCommand());
            if (!select.isSuccess()) {
                add(fields, "Rav-Kav / Calypso application",
                        "not exposed (status " + select.statusHex() + ")");
                return;
            }

            add(fields, "Rav-Kav / Calypso application", "found (read-only inspection)");
            add(fields, "Rav-Kav application AID", "1TIC.ICA");
            appendApplicationSerial(fields, select.data);

            ApduResponse environment = exchange(isoDep, readRecordCommand(
                    TICKETING_ENVIRONMENT_SFI, 1));
            if (!environment.isSuccess()) {
                add(fields, "Transit environment record",
                        "not readable (status " + environment.statusHex() + ")");
                return;
            }

            add(fields, "Transit environment record", environment.data.length + " bytes read");
            addSensitive(fields, "Transit environment raw (hex)", NfcInspector.hex(environment.data));
            appendEnvironment(fields, environment.data);
        } catch (IOException | SecurityException error) {
            add(fields, "Rav-Kav read warning", safeMessage(error));
        } finally {
            try {
                isoDep.close();
            } catch (IOException ignored) {
                // The card may have left the RF field. No card data is modified.
            }
        }
    }

    private static void appendEnvironment(List<ScanResult.Field> fields, byte[] data) {
        if (data.length * 8 < MIN_ENVIRONMENT_BITS) {
            add(fields, "Rav-Kav data parsing",
                    "record is shorter than the known public Rav-Kav layout");
            return;
        }

        long networkId = readBits(data, 3, 20);
        String network;
        if (networkId == 0x376FAL) {
            network = "Israel / Israel Defense Forces (0x376FA)";
        } else if (networkId == 0x37602L || networkId == 0x37603L) {
            network = "Rav-Kav (0x" + Long.toHexString(networkId).toUpperCase(Locale.ROOT) + ")";
        } else {
            network = "unrecognized (0x" + Long.toHexString(networkId).toUpperCase(Locale.ROOT) + ")";
        }
        add(fields, "Transit network", network);

        long issuanceNumber = readBits(data, 23, 26);
        addSensitive(fields, "Transit issuance number", Long.toString(issuanceNumber));

        String issueDate = decodeEn1545Date(readBits(data, 49, 14));
        if (issueDate != null) add(fields, "Transit application issued", issueDate);

        String validityEnd = decodeEn1545Date(readBits(data, 63, 14));
        if (validityEnd != null) add(fields, "Transit application valid until", validityEnd);

        String birthDate = decodeBcdDate(readBits(data, 80, 32));
        if (birthDate != null) addSensitive(fields, "Holder birth date", birthDate);

        long companyNumber = readBits(data, 126, 30);
        if (companyNumber != 0) {
            addSensitive(fields, "Company holder identifier", Long.toString(companyNumber));
        }

        long holderId = readBits(data, HOLDER_ID_BIT_OFFSET, 30);
        if (holderId == 0) {
            String explanation = networkId == 0x376FAL
                    ? "not stored in the public IDF transit record"
                    : "not present (anonymous or unregistered transit profile)";
            add(fields, "Personal holder identifier", explanation);
        } else {
            String formatted = holderId <= 999_999_999L
                    ? String.format(Locale.ROOT, "%09d", holderId)
                    : Long.toString(holderId);
            addSensitive(fields, "Personal holder identifier", formatted);
            add(fields, "Transit card profile", "personal");
        }
    }

    /**
     * Speedgate mode: SELECT the application and return only its serial (decimal), or null if the
     * card has none. No record is read, so birth date / holder identifiers are never touched.
     */
    static String readApplicationSerial(Tag tag) throws IOException {
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) return null;
        try {
            isoDep.connect();
            isoDep.setTimeout(3000);
            ApduResponse select = exchange(isoDep, selectApplicationCommand());
            return select.isSuccess() ? serialFrom(select.data) : null;
        } finally {
            try {
                isoDep.close();
            } catch (IOException ignored) {
                // The card may have left the RF field. No card data is modified.
            }
        }
    }

    private static String serialFrom(byte[] fci) {
        byte[] c7 = findTlvValue(fci, 0xC7, 0, fci.length, 0);
        if (c7 == null || c7.length < 8) return null;

        long serial = 0;
        for (int index = 4; index < 8; index++) {
            serial = (serial << 8) | (c7[index] & 0xFFL);
        }
        return Long.toUnsignedString(serial);
    }

    private static void appendApplicationSerial(List<ScanResult.Field> fields, byte[] fci) {
        String serial = serialFrom(fci);
        if (serial != null) addSensitive(fields, "Calypso application serial", serial);
    }

    private static byte[] findTlvValue(byte[] data, int wantedTag, int start, int end, int depth) {
        if (depth > 8) return null;
        int cursor = start;
        while (cursor < end) {
            int firstTagByte = data[cursor++] & 0xFF;
            int tag = firstTagByte;
            if ((firstTagByte & 0x1F) == 0x1F) {
                do {
                    if (cursor >= end) return null;
                    int next = data[cursor++] & 0xFF;
                    tag = (tag << 8) | next;
                    if ((next & 0x80) == 0) break;
                } while (true);
            }
            if (cursor >= end) return null;

            int lengthByte = data[cursor++] & 0xFF;
            int length;
            if ((lengthByte & 0x80) == 0) {
                length = lengthByte;
            } else {
                int count = lengthByte & 0x7F;
                if (count == 0 || count > 3 || cursor + count > end) return null;
                length = 0;
                for (int index = 0; index < count; index++) {
                    length = (length << 8) | (data[cursor++] & 0xFF);
                }
            }
            if (length < 0 || cursor + length > end) return null;

            if (tag == wantedTag) return Arrays.copyOfRange(data, cursor, cursor + length);
            if ((firstTagByte & 0x20) != 0) {
                byte[] nested = findTlvValue(data, wantedTag, cursor, cursor + length, depth + 1);
                if (nested != null) return nested;
            }
            cursor += length;
        }
        return null;
    }

    private static byte[] selectApplicationCommand() {
        byte[] command = new byte[6 + RAV_KAV_AID.length];
        command[0] = 0x00;
        command[1] = (byte) 0xA4;
        command[2] = 0x04;
        command[3] = 0x00;
        command[4] = (byte) RAV_KAV_AID.length;
        System.arraycopy(RAV_KAV_AID, 0, command, 5, RAV_KAV_AID.length);
        command[command.length - 1] = 0x00;
        return command;
    }

    private static byte[] readRecordCommand(int sfi, int record) {
        return new byte[] {
                0x00,
                (byte) 0xB2,
                (byte) record,
                (byte) ((sfi << 3) | 0x04),
                0x00
        };
    }

    private static ApduResponse exchange(IsoDep isoDep, byte[] command) throws IOException {
        byte[] response = isoDep.transceive(command);
        ApduResponse parsed = ApduResponse.parse(response);

        if (parsed.sw1 == 0x6C) {
            byte[] corrected = command.clone();
            corrected[corrected.length - 1] = (byte) parsed.sw2;
            parsed = ApduResponse.parse(isoDep.transceive(corrected));
        }

        ByteArrayOutputStream data = new ByteArrayOutputStream();
        data.write(parsed.data, 0, parsed.data.length);
        while (parsed.sw1 == 0x61) {
            byte[] getResponse = new byte[] {
                    0x00, (byte) 0xC0, 0x00, 0x00, (byte) parsed.sw2
            };
            parsed = ApduResponse.parse(isoDep.transceive(getResponse));
            data.write(parsed.data, 0, parsed.data.length);
        }
        return new ApduResponse(data.toByteArray(), parsed.sw1, parsed.sw2);
    }

    private static long readBits(byte[] data, int offset, int length) {
        long value = 0;
        for (int index = 0; index < length; index++) {
            int absolute = offset + index;
            int bit = (data[absolute / 8] >> (7 - (absolute % 8))) & 1;
            value = (value << 1) | bit;
        }
        return value;
    }

    private static String decodeBcdDate(long value) {
        String hex = String.format(Locale.ROOT, "%08X", value);
        if (!hex.matches("[0-9]{8}")) return null;
        int year = Integer.parseInt(hex.substring(0, 4));
        int month = Integer.parseInt(hex.substring(4, 6));
        int day = Integer.parseInt(hex.substring(6, 8));
        if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        return String.format(Locale.ROOT, "%04d-%02d-%02d", year, month, day);
    }

    private static String decodeEn1545Date(long daysSince1997) {
        if (daysSince1997 == 0) return null;
        java.util.Calendar calendar = java.util.Calendar.getInstance(
                java.util.TimeZone.getTimeZone("UTC"), Locale.ROOT);
        calendar.clear();
        calendar.set(1997, java.util.Calendar.JANUARY, 1);
        calendar.add(java.util.Calendar.DAY_OF_YEAR, (int) daysSince1997);
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
                calendar.get(java.util.Calendar.YEAR),
                calendar.get(java.util.Calendar.MONTH) + 1,
                calendar.get(java.util.Calendar.DAY_OF_MONTH));
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
                ? error.getClass().getSimpleName()
                : error.getClass().getSimpleName() + ": " + message;
    }

    private static void add(List<ScanResult.Field> fields, String label, String value) {
        fields.add(new ScanResult.Field(label, value));
    }

    private static void addSensitive(List<ScanResult.Field> fields, String label, String value) {
        fields.add(new ScanResult.Field(label, value, true));
    }

    private static final class ApduResponse {
        final byte[] data;
        final int sw1;
        final int sw2;

        ApduResponse(byte[] data, int sw1, int sw2) {
            this.data = data;
            this.sw1 = sw1;
            this.sw2 = sw2;
        }

        static ApduResponse parse(byte[] response) throws IOException {
            if (response == null || response.length < 2) {
                throw new IOException("Card returned an invalid APDU response");
            }
            int dataLength = response.length - 2;
            return new ApduResponse(
                    Arrays.copyOf(response, dataLength),
                    response[dataLength] & 0xFF,
                    response[dataLength + 1] & 0xFF);
        }

        boolean isSuccess() {
            return sw1 == 0x90 && sw2 == 0x00;
        }

        String statusHex() {
            return String.format(Locale.ROOT, "%02X%02X", sw1, sw2);
        }
    }
}
