import { FILE_MAX_BYTES, type StatusesResponse } from '@doch1/shared';
import { describe, expect, test } from 'vitest';
import { report as t } from '../i18n/he';
import { blockedReason, fileProblem, pickableCategories, selfReasons, toBody } from './reportForm';

const reason = (over: Partial<StatusesResponse['categories'][0]['reasons'][0]> = {}) => ({
  id: 7,
  code: 'x',
  nameHe: 'x',
  requiresDocument: false,
  allowsNote: false,
  commanderOnly: false,
  ...over,
});
const cat = (code: string, reasons = [reason()]) =>
  ({ id: 1, code, nameHe: code, icon: '', reasons }) as StatusesResponse['categories'][0];

describe('F3 categories and reasons', () => {
  test('step 1 has everything except on_base', () => {
    const s = { categories: ['on_base', 'outside_unit', 'abroad'].map((c) => cat(c)) };
    expect(pickableCategories(s).map((c) => c.code)).toEqual(['outside_unit', 'abroad']);
  });
  test('commander-only reasons never appear on a self-report', () => {
    const c = cat('outside_unit', [reason({ id: 1 }), reason({ id: 2, commanderOnly: true })]);
    expect(selfReasons(c).map((r) => r.id)).toEqual([1]);
  });
});

describe('send button rules', () => {
  test('needs a reason', () => {
    expect(blockedReason({ note: '' })).toBe(t.pickReason);
  });
  test('document required until uploaded', () => {
    const r = reason({ requiresDocument: true });
    expect(blockedReason({ reason: r, note: '' })).toBe(t.documentNeeded);
    expect(blockedReason({ reason: r, note: '', documentId: 'doc' })).toBeNull();
  });
  test('note max 200', () => {
    const r = reason({ allowsNote: true });
    expect(blockedReason({ reason: r, note: 'א'.repeat(200) })).toBeNull();
    expect(blockedReason({ reason: r, note: 'א'.repeat(201) })).toBe(t.noteTooLong);
  });
});

describe('PUT body', () => {
  test('note only when the reason allows it, trimmed, never empty', () => {
    expect(toBody({ reason: reason({ allowsNote: true }), note: '  משמרת  ' })).toEqual({
      reasonId: 7,
      note: 'משמרת',
    });
    expect(toBody({ reason: reason({ allowsNote: true }), note: '   ' })).toEqual({ reasonId: 7 });
    expect(toBody({ reason: reason(), note: 'ignored' })).toEqual({ reasonId: 7 });
  });
  test('documentId only for a reason that needs one', () => {
    expect(
      toBody({ reason: reason({ requiresDocument: true }), note: '', documentId: 'd1' }),
    ).toEqual({
      reasonId: 7,
      documentId: 'd1',
    });
    // Switching from גימלים to a reason without a document drops the old one.
    expect(toBody({ reason: reason(), note: '', documentId: 'd1' })).toEqual({ reasonId: 7 });
  });
});

describe('file check (UX only — server checks magic bytes)', () => {
  test.each([
    [{ size: 1000, mimeType: 'application/pdf' }, null],
    [{ size: FILE_MAX_BYTES, mimeType: 'image/jpeg' }, null],
    [{ size: FILE_MAX_BYTES + 1, mimeType: 'image/png' }, t.fileTooLarge],
    [{ size: 10, mimeType: 'image/heic' }, t.fileType],
    [{ size: null, mimeType: null }, null], // unknown: let the server decide
  ])('%j → %s', (file, problem) => {
    expect(fileProblem(file)).toBe(problem);
  });
});
