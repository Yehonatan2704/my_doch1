// Typed client for every route in SPEC §6. Screens/hooks call `api.*` — never fetch directly.
import {
  ERROR_HTTP,
  type ActiveEmergenciesResponse,
  type ApproveReportsResponse,
  type CommanderGroupsResponse,
  type CommanderPutReportBody,
  type DocumentUrlResponse,
  type EmergencyDetailResponse,
  type ErrorCode,
  type FinalizeReportsResponse,
  type GroupReportsQuery,
  type GroupReportsResponse,
  type MeResponse,
  type PushTokenBody,
  type PutReportBody,
  type PutSettingsBody,
  type PutWeekTemplateBody,
  type Report,
  type ReportsQuery,
  type ReportsResponse,
  type RespondEmergencyBody,
  type Settings,
  type WeekTemplate,
  type StartEmergencyBody,
  type StartEmergencyResponse,
  type StatusesResponse,
  type TodayReportResponse,
  type UploadDocumentResponse,
} from '@doch1/shared';
import { mockReady } from './mock';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string, // safe Hebrew text from the server — OK to show the user
  ) {
    super(message);
  }
}

// Set by the login flow (D2) to return the Supabase access token.
let getToken: () => Promise<string | null> = async () => null;
export const setTokenProvider = (fn: () => Promise<string | null>) => {
  getToken = fn;
};

type Opts = { body?: unknown; query?: Record<string, string | boolean | undefined>; form?: FormData };

async function request<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  await mockReady;
  const qs = opts.query
    ? new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
  } catch {
    throw new ApiError(0, 'INTERNAL', 'אין חיבור לרשת. בדקו את החיבור ונסו שוב');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? ERROR_HTTP.INTERNAL.messageHe);
  }
  return json as T;
}

const p = encodeURIComponent;

// The query string carries "true"/"false"; callers pass real booleans.
type GroupReportsParams = Omit<GroupReportsQuery, 'includeSub' | 'pending'> & {
  includeSub?: boolean;
  pending?: boolean;
};

export const api = {
  // soldier
  me: () => request<MeResponse>('GET', '/me'),
  statuses: () => request<StatusesResponse>('GET', '/statuses'),
  todayReport: () => request<TodayReportResponse>('GET', '/reports/today'),
  reports: (q: ReportsQuery) => request<ReportsResponse>('GET', '/reports', { query: q }),
  putReport: (date: string, body: PutReportBody) =>
    request<Report>('PUT', `/reports/${p(date)}`, { body }),
  deleteReport: (date: string) => request<void>('DELETE', `/reports/${p(date)}`),
  uploadDocument: (form: FormData) =>
    request<UploadDocumentResponse>('POST', '/documents', { form }), // field name: `file`
  settings: () => request<Settings>('GET', '/settings'),
  putSettings: (body: PutSettingsBody) => request<Settings>('PUT', '/settings', { body }),
  getTemplate: () => request<WeekTemplate>('GET', '/settings/template'),
  putTemplate: (body: PutWeekTemplateBody) =>
    request<WeekTemplate>('PUT', '/settings/template', { body }),
  registerPushToken: (body: PushTokenBody) => request<void>('POST', '/push-tokens', { body }),
  activeEmergencies: () => request<ActiveEmergenciesResponse>('GET', '/emergencies/active'),
  respondEmergency: (id: string, body: RespondEmergencyBody) =>
    request<void>('POST', `/emergencies/${p(id)}/respond`, { body }),

  // commander / HR
  commanderGroups: () => request<CommanderGroupsResponse>('GET', '/commander/groups'),
  groupReports: (groupId: string, q: GroupReportsParams = {}) =>
    request<GroupReportsResponse>('GET', `/commander/groups/${p(groupId)}/reports`, { query: q }),
  approveReports: (reportIds: string[]) =>
    request<ApproveReportsResponse>('POST', '/commander/reports/approve', { body: { reportIds } }),
  putSoldierReport: (userId: string, date: string, body: CommanderPutReportBody) =>
    request<Report>('PUT', `/commander/soldiers/${p(userId)}/reports/${p(date)}`, { body }),
  documentUrl: (documentId: string) =>
    request<DocumentUrlResponse>('GET', `/commander/documents/${p(documentId)}/url`),
  addFavorite: (soldierId: string) => request<void>('PUT', `/commander/favorites/${p(soldierId)}`),
  removeFavorite: (soldierId: string) =>
    request<void>('DELETE', `/commander/favorites/${p(soldierId)}`),
  startEmergency: (body: StartEmergencyBody) =>
    request<StartEmergencyResponse>('POST', '/commander/emergencies', { body }),
  emergency: (id: string) => request<EmergencyDetailResponse>('GET', `/commander/emergencies/${p(id)}`),
  endEmergency: (id: string) => request<void>('POST', `/commander/emergencies/${p(id)}/end`),
  finalizeReports: (reportIds: string[]) =>
    request<FinalizeReportsResponse>('POST', '/hr/reports/finalize', { body: { reportIds } }),
  unfinalizeReport: (reportId: string) => request<void>('DELETE', `/hr/reports/${p(reportId)}/finalize`),
};
