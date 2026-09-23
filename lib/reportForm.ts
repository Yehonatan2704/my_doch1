// F3 form rules, mirrored from the server for UX only (CLAUDE.md rule 4). Pure — unit-tested.
import {
  ALLOWED_MIME,
  FILE_MAX_BYTES,
  NOTE_MAX,
  type PutReportBody,
  type StatusesResponse,
} from '@doch1/shared';
import { report as t } from '../i18n/he';

type Category = StatusesResponse['categories'][number];
type Reason = Category['reasons'][number];

/** F3 step 1: everything except on_base (that's the one-tap). */
export const pickableCategories = (statuses: StatusesResponse | undefined) =>
  (statuses?.categories ?? []).filter((c) => c.code !== 'on_base');

/**
 * F3 step 2: reasons a soldier may pick for themselves. Commander-only reasons are set through
 * the commander screens, never on a self-report — the server refuses them (SPEC §9 row 23).
 */
export const selfReasons = (category: Category | undefined) =>
  (category?.reasons ?? []).filter((r) => !r.commanderOnly);

export type FormState = { reason?: Reason; note: string; documentId?: string | null };

/** Why "שליחת דיווח" is disabled, or null when the form can be sent. */
export function blockedReason(s: FormState): string | null {
  if (!s.reason) return t.pickReason;
  if (s.note.trim().length > NOTE_MAX) return t.noteTooLong;
  if (s.reason.requiresDocument && !s.documentId) return t.documentNeeded;
  return null;
}

/**
 * The PUT body — only fields the reason allows: the server rejects a note it doesn't allow, and
 * an old sick note is dropped when switching to a reason without one.
 */
export function toBody(s: FormState): PutReportBody {
  if (!s.reason) throw new Error('no reason');
  const note = s.note.trim();
  return {
    reasonId: s.reason.id,
    ...(s.reason.allowsNote && note ? { note } : {}),
    ...(s.reason.requiresDocument && s.documentId ? { documentId: s.documentId } : {}),
  };
}

/** Client-side file check before uploading (the server checks magic bytes again). */
export function fileProblem(file: {
  size?: number | null;
  mimeType?: string | null;
}): string | null {
  if (file.size != null && file.size > FILE_MAX_BYTES) return t.fileTooLarge;
  if (file.mimeType && !(ALLOWED_MIME as readonly string[]).includes(file.mimeType))
    return t.fileType;
  return null;
}
