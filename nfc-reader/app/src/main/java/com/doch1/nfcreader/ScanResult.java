package com.doch1.nfcreader;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;

final class ScanResult {
    static final class Field {
        final String label;
        final String value;
        final boolean sensitive;

        Field(String label, String value) {
            this(label, value, false);
        }

        Field(String label, String value, boolean sensitive) {
            this.label = label;
            this.value = value;
            this.sensitive = sensitive;
        }
    }

    private final long scannedAtMillis;
    private final List<Field> fields;

    ScanResult(long scannedAtMillis, List<Field> fields) {
        this.scannedAtMillis = scannedAtMillis;
        this.fields = Collections.unmodifiableList(new ArrayList<>(fields));
    }

    long getScannedAtMillis() {
        return scannedAtMillis;
    }

    List<Field> getFields() {
        return fields;
    }

    String asCopyText() {
        StringBuilder value = new StringBuilder("Doch1 NFC Inspector\nScanned at: ")
                .append(DateFormat.getDateTimeInstance().format(new Date(scannedAtMillis)))
                .append('\n');
        for (Field field : fields) {
            value.append(field.label).append(": ");
            if (field.sensitive) {
                value.append("[REDACTED ON COPY]");
            } else {
                value.append(field.value);
            }
            value.append('\n');
        }
        return value.toString().trim();
    }
}
