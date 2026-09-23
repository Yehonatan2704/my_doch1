// Inferred types only — never hand-write a type that a schema already describes.
// Requests use z.input (what the client sends); responses use z.infer (what it receives).
import type { z } from 'zod';
import type * as s from './schemas';
import type {
  CATEGORY_CODES,
  ERROR_CODES,
  REASON_CODES,
  REPORT_SOURCES,
  EMERGENCY_RESPONSE_STATUSES,
  INTEGRATION_SYSTEMS,
} from './constants';

export type CategoryCode = (typeof CATEGORY_CODES)[number];
export type ReasonCode = (typeof REASON_CODES)[number];
export type ReportSource = (typeof REPORT_SOURCES)[number];
export type EmergencyResponseStatus = (typeof EMERGENCY_RESPONSE_STATUSES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type IntegrationSystem = (typeof INTEGRATION_SYSTEMS)[number];

// shared shapes
export type ErrorResponse = z.infer<typeof s.errorResponseSchema>;
export type PersonRef = z.infer<typeof s.personRefSchema>;
export type Report = z.infer<typeof s.reportSchema>;
export type GroupNode = z.infer<typeof s.groupNodeSchema>;
export type Settings = z.infer<typeof s.settingsSchema>;

// soldier
export type MeResponse = z.infer<typeof s.meResponseSchema>;
export type StatusesResponse = z.infer<typeof s.statusesResponseSchema>;
export type StatusCategory = StatusesResponse['categories'][number];
export type StatusReason = StatusCategory['reasons'][number];
export type TodayReportResponse = z.infer<typeof s.todayReportResponseSchema>;
export type ReportsQuery = z.input<typeof s.reportsQuerySchema>;
export type ReportsResponse = z.infer<typeof s.reportsResponseSchema>;
export type PutReportBody = z.input<typeof s.putReportBodySchema>;
export type UploadDocumentResponse = z.infer<typeof s.uploadDocumentResponseSchema>;
export type PutSettingsBody = z.input<typeof s.putSettingsBodySchema>;
export type TemplateEntry = z.infer<typeof s.templateEntrySchema>;
export type WeekTemplate = z.infer<typeof s.weekTemplateSchema>;
export type PutWeekTemplateBody = z.input<typeof s.putWeekTemplateBodySchema>;
export type PushTokenBody = z.input<typeof s.pushTokenBodySchema>;
export type ActiveEmergenciesResponse = z.infer<typeof s.activeEmergenciesResponseSchema>;
export type ActiveEmergency = ActiveEmergenciesResponse['events'][number];
export type RespondEmergencyBody = z.input<typeof s.respondEmergencyBodySchema>;

// commander / HR
export type CommanderGroupsResponse = z.infer<typeof s.commanderGroupsResponseSchema>;
export type GroupReportsQuery = z.input<typeof s.groupReportsQuerySchema>;
export type GroupReportsResponse = z.infer<typeof s.groupReportsResponseSchema>;
export type GroupReportRow = GroupReportsResponse['rows'][number];
export type ReportIdsBody = z.input<typeof s.reportIdsBodySchema>;
export type ApproveReportsResponse = z.infer<typeof s.approveReportsResponseSchema>;
export type FinalizeReportsResponse = z.infer<typeof s.finalizeReportsResponseSchema>;
export type CommanderPutReportBody = z.input<typeof s.commanderPutReportBodySchema>;
export type DocumentUrlResponse = z.infer<typeof s.documentUrlResponseSchema>;
export type StartEmergencyBody = z.input<typeof s.startEmergencyBodySchema>;
export type StartEmergencyResponse = z.infer<typeof s.startEmergencyResponseSchema>;
export type EmergencyDetailResponse = z.infer<typeof s.emergencyDetailResponseSchema>;

// integrations (I1)
export type IntegrationSoldiersQuery = z.input<typeof s.integrationSoldiersQuerySchema>;
export type IntegrationSoldier = z.infer<typeof s.integrationSoldierSchema>;
export type IntegrationSoldiersResponse = z.infer<typeof s.integrationSoldiersResponseSchema>;
export type CprSickLeaveBody = z.input<typeof s.cprSickLeaveBodySchema>;
export type AnnualLeaveBody = z.input<typeof s.annualLeaveBodySchema>;
export type IntegrationResult = z.infer<typeof s.integrationResultSchema>;

// NFC speedgate
export type EnrollNfcCardBody = z.input<typeof s.enrollNfcCardBodySchema>;
export type RevokeNfcCardBody = z.input<typeof s.revokeNfcCardBodySchema>;
export type NfcCardEnrollmentResponse = z.infer<typeof s.nfcCardEnrollmentResponseSchema>;
export type CreateNfcReaderBody = z.input<typeof s.createNfcReaderBodySchema>;
export type CreateNfcReaderResponse = z.infer<typeof s.createNfcReaderResponseSchema>;
export type SpeedgateScanBody = z.input<typeof s.speedgateScanBodySchema>;
export type SpeedgateScanResponse = z.infer<typeof s.speedgateScanResponseSchema>;
