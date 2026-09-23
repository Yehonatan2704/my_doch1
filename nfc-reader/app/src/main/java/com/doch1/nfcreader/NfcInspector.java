package com.doch1.nfcreader;

import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.FormatException;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.nfc.tech.MifareClassic;
import android.nfc.tech.MifareUltralight;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.nfc.tech.NfcA;
import android.nfc.tech.NfcB;
import android.nfc.tech.NfcBarcode;
import android.nfc.tech.NfcF;
import android.nfc.tech.NfcV;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class NfcInspector {
    private NfcInspector() {}

    static ScanResult inspect(Tag tag) {
        List<ScanResult.Field> fields = new ArrayList<>();
        add(fields, "Hardware identifier (hex)", hex(tag.getId()));
        add(fields, "Technologies", shortTechList(tag.getTechList()));

        inspectNfcA(tag, fields);
        inspectNfcB(tag, fields);
        inspectIsoDep(tag, fields);
        CalypsoInspector.inspect(tag, fields);
        inspectNfcF(tag, fields);
        inspectNfcV(tag, fields);
        inspectMifareClassic(tag, fields);
        inspectMifareUltralight(tag, fields);
        inspectNfcBarcode(tag, fields);
        inspectNdef(tag, fields);

        if (NdefFormatable.get(tag) != null) {
            add(fields, "NDEF formattable", "yes (inspector will not format or write)");
        }

        return new ScanResult(System.currentTimeMillis(), fields);
    }

    static String hex(byte[] data) {
        if (data == null) return "(not available)";
        if (data.length == 0) return "(empty)";
        StringBuilder value = new StringBuilder(data.length * 2);
        for (byte item : data) {
            value.append(String.format("%02X", item & 0xFF));
        }
        return value.toString();
    }

    private static void inspectNfcA(Tag tag, List<ScanResult.Field> fields) {
        NfcA value = NfcA.get(tag);
        if (value == null) return;
        add(fields, "NFC-A ATQA (hex)", hex(value.getAtqa()));
        add(fields, "NFC-A SAK", String.format("0x%02X", value.getSak() & 0xFF));
        add(fields, "NFC-A max transceive", value.getMaxTransceiveLength() + " bytes");
    }

    private static void inspectNfcB(Tag tag, List<ScanResult.Field> fields) {
        NfcB value = NfcB.get(tag);
        if (value == null) return;
        add(fields, "NFC-B application data (hex)", hex(value.getApplicationData()));
        add(fields, "NFC-B protocol info (hex)", hex(value.getProtocolInfo()));
        add(fields, "NFC-B max transceive", value.getMaxTransceiveLength() + " bytes");
    }

    private static void inspectIsoDep(Tag tag, List<ScanResult.Field> fields) {
        IsoDep value = IsoDep.get(tag);
        if (value == null) return;
        add(fields, "ISO-DEP", "supported (ISO 14443-4)");
        add(fields, "ISO-DEP historical bytes (hex)", hex(value.getHistoricalBytes()));
        add(fields, "ISO-DEP high-layer response (hex)", hex(value.getHiLayerResponse()));
        add(fields, "ISO-DEP max transceive", value.getMaxTransceiveLength() + " bytes");
        add(fields, "Extended-length APDU", value.isExtendedLengthApduSupported() ? "supported" : "not supported");
    }

    private static void inspectNfcF(Tag tag, List<ScanResult.Field> fields) {
        NfcF value = NfcF.get(tag);
        if (value == null) return;
        add(fields, "NFC-F manufacturer (hex)", hex(value.getManufacturer()));
        add(fields, "NFC-F system code (hex)", hex(value.getSystemCode()));
        add(fields, "NFC-F max transceive", value.getMaxTransceiveLength() + " bytes");
    }

    private static void inspectNfcV(Tag tag, List<ScanResult.Field> fields) {
        NfcV value = NfcV.get(tag);
        if (value == null) return;
        add(fields, "NFC-V response flags", String.format("0x%02X", value.getResponseFlags() & 0xFF));
        add(fields, "NFC-V DSFID", String.format("0x%02X", value.getDsfId() & 0xFF));
        add(fields, "NFC-V max transceive", value.getMaxTransceiveLength() + " bytes");
    }

    private static void inspectMifareClassic(Tag tag, List<ScanResult.Field> fields) {
        MifareClassic value = MifareClassic.get(tag);
        if (value == null) return;
        String type;
        switch (value.getType()) {
            case MifareClassic.TYPE_CLASSIC: type = "Classic"; break;
            case MifareClassic.TYPE_PLUS: type = "Plus"; break;
            case MifareClassic.TYPE_PRO: type = "Pro"; break;
            default: type = "Unknown";
        }
        add(fields, "MIFARE Classic family", type);
        add(fields, "MIFARE size", value.getSize() + " bytes");
        add(fields, "MIFARE sectors / blocks", value.getSectorCount() + " / " + value.getBlockCount());
    }

    private static void inspectMifareUltralight(Tag tag, List<ScanResult.Field> fields) {
        MifareUltralight value = MifareUltralight.get(tag);
        if (value == null) return;
        String type;
        switch (value.getType()) {
            case MifareUltralight.TYPE_ULTRALIGHT: type = "Ultralight"; break;
            case MifareUltralight.TYPE_ULTRALIGHT_C: type = "Ultralight C"; break;
            default: type = "Unknown";
        }
        add(fields, "MIFARE Ultralight family", type);
    }

    private static void inspectNfcBarcode(Tag tag, List<ScanResult.Field> fields) {
        NfcBarcode value = NfcBarcode.get(tag);
        if (value == null) return;
        String type = value.getType() == NfcBarcode.TYPE_KOVIO ? "Kovio" : "Unknown";
        add(fields, "NFC Barcode type", type);
    }

    private static void inspectNdef(Tag tag, List<ScanResult.Field> fields) {
        Ndef value = Ndef.get(tag);
        if (value == null) {
            add(fields, "NDEF", "not exposed");
            return;
        }

        add(fields, "NDEF type", value.getType());
        add(fields, "NDEF max size", value.getMaxSize() + " bytes");
        add(fields, "NDEF writable", value.isWritable() ? "yes" : "no");

        NdefMessage message = value.getCachedNdefMessage();
        try {
            value.connect();
            NdefMessage current = value.getNdefMessage();
            if (current != null) message = current;
        } catch (IOException | FormatException | SecurityException error) {
            add(fields, "NDEF read warning", safeMessage(error));
        } finally {
            try {
                value.close();
            } catch (IOException ignored) {
                // Closing a tag after it has left the RF field may fail; no data is at risk.
            }
        }

        if (message == null) {
            add(fields, "NDEF message", "(empty)");
            return;
        }

        NdefRecord[] records = message.getRecords();
        add(fields, "NDEF record count", String.valueOf(records.length));
        for (int index = 0; index < records.length; index++) {
            appendNdefRecord(fields, index + 1, records[index]);
        }
    }

    private static void appendNdefRecord(List<ScanResult.Field> fields, int index, NdefRecord record) {
        String prefix = "NDEF record " + index;
        add(fields, prefix + " TNF", tnfName(record.getTnf()));
        add(fields, prefix + " type (hex)", hex(record.getType()));
        if (record.getId().length > 0) add(fields, prefix + " identifier (hex)", hex(record.getId()));

        String decoded = decodeNdef(record);
        if (decoded != null && !decoded.isEmpty()) add(fields, prefix + " decoded", decoded);
        add(fields, prefix + " payload (hex)", hex(record.getPayload()));
    }

    private static String decodeNdef(NdefRecord record) {
        if (record.getTnf() == NdefRecord.TNF_WELL_KNOWN
                && Arrays.equals(record.getType(), NdefRecord.RTD_TEXT)) {
            byte[] payload = record.getPayload();
            if (payload.length == 0) return null;
            int languageLength = payload[0] & 0x3F;
            if (payload.length < languageLength + 1) return null;
            Charset charset = (payload[0] & 0x80) == 0 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16;
            return new String(payload, languageLength + 1, payload.length - languageLength - 1, charset);
        }

        if (record.toUri() != null) return record.toUri().toString();
        String mime = record.toMimeType();
        if (mime != null && (mime.startsWith("text/") || mime.endsWith("json"))) {
            return new String(record.getPayload(), StandardCharsets.UTF_8);
        }
        return null;
    }

    private static String shortTechList(String[] technologies) {
        List<String> values = new ArrayList<>();
        for (String technology : technologies) {
            int separator = technology.lastIndexOf('.');
            values.add(separator >= 0 ? technology.substring(separator + 1) : technology);
        }
        return String.join(", ", values);
    }

    private static String tnfName(short value) {
        switch (value) {
            case NdefRecord.TNF_EMPTY: return "empty";
            case NdefRecord.TNF_WELL_KNOWN: return "well-known";
            case NdefRecord.TNF_MIME_MEDIA: return "MIME media";
            case NdefRecord.TNF_ABSOLUTE_URI: return "absolute URI";
            case NdefRecord.TNF_EXTERNAL_TYPE: return "external";
            case NdefRecord.TNF_UNKNOWN: return "unknown";
            case NdefRecord.TNF_UNCHANGED: return "unchanged";
            default: return "unrecognized (" + value + ")";
        }
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
}
