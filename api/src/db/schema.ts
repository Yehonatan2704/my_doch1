import { pgTable, type PgTableExtraConfigValue, type AnyPgColumn, uniqueIndex, index, foreignKey, unique, check, uuid, text, boolean, timestamp, smallint, integer, date, bigint, time, jsonb, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personalNumber: text("personal_number").notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	email: text().notNull(),
	role: text().default('soldier').notNull(),
	groupId: uuid("group_id"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("users_email_uq").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_group_idx").using("btree", table.groupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [groups.id],
			name: "users_group_fk"
		}).onDelete("set null"),
	unique("users_personal_number_key").on(table.personalNumber),
	check("users_personal_number_check", sql`personal_number ~ '^[0-9]{7,9}$'::text`),
	check("users_first_name_check", sql`(char_length(first_name) >= 1) AND (char_length(first_name) <= 50)`),
	check("users_last_name_check", sql`(char_length(last_name) >= 1) AND (char_length(last_name) <= 50)`),
	check("users_email_check", sql`(email = lower(email)) AND (POSITION(('@'::text) IN (email)) > 1)`),
	check("users_role_check", sql`role = ANY (ARRAY['soldier'::text, 'admin'::text])`),
]);

export const groups = pgTable("groups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	code: text().notNull(),
	parentId: uuid("parent_id"),
	commanderId: uuid("commander_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("groups_commander_idx").using("btree", table.commanderId.asc().nullsLast().op("uuid_ops")),
	index("groups_parent_idx").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "groups_parent_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.commanderId],
			foreignColumns: [users.id],
			name: "groups_commander_id_fkey"
		}).onDelete("set null"),
	unique("groups_code_key").on(table.code),
	check("groups_name_check", sql`(char_length(name) >= 1) AND (char_length(name) <= 80)`),
	check("groups_check", sql`(parent_id IS NULL) OR (parent_id <> id)`),
]);

export const statusCategories = pgTable("status_categories", {
	id: smallint().primaryKey().generatedAlwaysAsIdentity({ name: "status_categories_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 32767, cache: 1 }),
	code: text().notNull(),
	nameHe: text("name_he").notNull(),
	icon: text().notNull(),
	sortOrder: smallint("sort_order").notNull(),
}, (table): PgTableExtraConfigValue[] => [
	unique("status_categories_code_key").on(table.code),
]);

export const statusReasons = pgTable("status_reasons", {
	id: smallint().primaryKey().generatedAlwaysAsIdentity({ name: "status_reasons_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 32767, cache: 1 }),
	categoryId: smallint("category_id").notNull(),
	code: text().notNull(),
	nameHe: text("name_he").notNull(),
	requiresDocument: boolean("requires_document").default(false).notNull(),
	allowsNote: boolean("allows_note").default(false).notNull(),
	commanderOnly: boolean("commander_only").default(false).notNull(),
	sortOrder: smallint("sort_order").notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("status_reasons_category_idx").using("btree", table.categoryId.asc().nullsLast().op("int2_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [statusCategories.id],
			name: "status_reasons_category_id_fkey"
		}).onDelete("restrict"),
	unique("status_reasons_code_key").on(table.code),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ownerId: uuid("owner_id").notNull(),
	storagePath: text("storage_path").notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("documents_owner_idx").using("btree", table.ownerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [users.id],
			name: "documents_owner_id_fkey"
		}).onDelete("cascade"),
	unique("documents_storage_path_key").on(table.storagePath),
	check("documents_mime_type_check", sql`mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'application/pdf'::text])`),
	check("documents_size_bytes_check", sql`(size_bytes > 0) AND (size_bytes <= 5242880)`),
]);

export const reports = pgTable("reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	reportDate: date("report_date").notNull(),
	reasonId: smallint("reason_id").notNull(),
	note: text(),
	documentId: uuid("document_id"),
	source: text().default('self').notNull(),
	reportedBy: uuid("reported_by").notNull(),
	lastModifiedBy: uuid("last_modified_by").notNull(),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	finalizedBy: uuid("finalized_by"),
	finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("reports_date_idx").using("btree", table.reportDate.asc().nullsLast().op("date_ops")),
	index("reports_pending_idx").using("btree", table.reportDate.asc().nullsLast().op("date_ops")).where(sql`(approved_at IS NULL)`),
	index("reports_unfinalized_idx").using("btree", table.reportDate.asc().nullsLast().op("date_ops")).where(sql`(finalized_at IS NULL)`),
	index("reports_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.reportDate.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reports_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reasonId],
			foreignColumns: [statusReasons.id],
			name: "reports_reason_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "reports_document_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.reportedBy],
			foreignColumns: [users.id],
			name: "reports_reported_by_fkey"
		}),
	foreignKey({
			columns: [table.lastModifiedBy],
			foreignColumns: [users.id],
			name: "reports_last_modified_by_fkey"
		}),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "reports_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.finalizedBy],
			foreignColumns: [users.id],
			name: "reports_finalized_by_fkey"
		}),
	unique("reports_user_id_report_date_key").on(table.userId, table.reportDate),
	check("reports_note_check", sql`(note IS NULL) OR (char_length(note) <= 200)`),
	check("reports_source_check", sql`source = ANY (ARRAY['self'::text, 'commander'::text, 'hr'::text, 'cpr'::text, 'people_digital'::text, 'nfc'::text])`),
	check("reports_check", sql`(approved_by IS NULL) = (approved_at IS NULL)`),
	check("reports_check1", sql`(finalized_by IS NULL) = (finalized_at IS NULL)`),
]);

export const reportAudit = pgTable("report_audit", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "report_audit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	reportId: uuid("report_id"),
	userId: uuid("user_id").notNull(),
	reportDate: date("report_date").notNull(),
	action: text().notNull(),
	actorId: uuid("actor_id").notNull(),
	oldReasonId: smallint("old_reason_id"),
	newReasonId: smallint("new_reason_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("report_audit_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.reportDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "report_audit_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [users.id],
			name: "report_audit_actor_id_fkey"
		}),
	foreignKey({
			columns: [table.oldReasonId],
			foreignColumns: [statusReasons.id],
			name: "report_audit_old_reason_id_fkey"
		}),
	foreignKey({
			columns: [table.newReasonId],
			foreignColumns: [statusReasons.id],
			name: "report_audit_new_reason_id_fkey"
		}),
	check("report_audit_action_check", sql`action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'approve'::text, 'finalize'::text, 'unfinalize'::text])`),
]);

export const userSettings = pgTable("user_settings", {
	userId: uuid("user_id").primaryKey().notNull(),
	reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
	reminderTime: time("reminder_time").default('08:00:00').notNull(),
	nudgeEnabled: boolean("nudge_enabled").default(false).notNull(),
	nudgeIntervalMin: smallint("nudge_interval_min").default(30).notNull(),
	notifyCommanderChange: boolean("notify_commander_change").default(true).notNull(),
	notifyHrChange: boolean("notify_hr_change").default(true).notNull(),
	weeklyReminderEnabled: boolean("weekly_reminder_enabled").default(false).notNull(),
	weeklyReminderDay: smallint("weekly_reminder_day").default(6).notNull(),
	weeklyReminderTime: time("weekly_reminder_time").default('20:00:00').notNull(),
	templateOnboarded: boolean("template_onboarded").default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_settings_user_id_fkey"
		}).onDelete("cascade"),
	check("user_settings_nudge_interval_min_check", sql`nudge_interval_min = ANY (ARRAY[15, 30, 60])`),
	check("user_settings_weekly_reminder_day_check", sql`(weekly_reminder_day >= 0) AND (weekly_reminder_day <= 6)`),
]);

export const userWeekTemplate = pgTable("user_week_template", {
	userId: uuid("user_id").primaryKey().notNull(),
	days: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_week_template_user_id_fkey"
		}).onDelete("cascade"),
	check("user_week_template_days_check", sql`(jsonb_typeof(days) = 'array'::text) AND (jsonb_array_length(days) = 7)`),
]);

export const pushTokens = pgTable("push_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	token: text().notNull(),
	platform: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("push_tokens_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_tokens_user_id_fkey"
		}).onDelete("cascade"),
	unique("push_tokens_token_key").on(table.token),
	check("push_tokens_token_check", sql`char_length(token) <= 255`),
	check("push_tokens_platform_check", sql`platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])`),
]);

export const emergencyEvents = pgTable("emergency_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	groupId: uuid("group_id").notNull(),
	includeSubgroups: boolean("include_subgroups").default(true).notNull(),
	startedBy: uuid("started_by").notNull(),
	message: text(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	endedBy: uuid("ended_by"),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("emergency_one_open_per_group").using("btree", table.groupId.asc().nullsLast().op("uuid_ops")).where(sql`(ended_at IS NULL)`),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [groups.id],
			name: "emergency_events_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.startedBy],
			foreignColumns: [users.id],
			name: "emergency_events_started_by_fkey"
		}),
	foreignKey({
			columns: [table.endedBy],
			foreignColumns: [users.id],
			name: "emergency_events_ended_by_fkey"
		}),
	check("emergency_events_message_check", sql`(message IS NULL) OR (char_length(message) <= 200)`),
	check("emergency_events_check", sql`(ended_at IS NULL) = (ended_by IS NULL)`),
]);

export const bases = pgTable("bases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	timezone: text().default('Asia/Jerusalem').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	unique("bases_code_key").on(table.code),
	check("bases_code_check", sql`code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'::text`),
	check("bases_name_check", sql`(char_length(name) >= 1) AND (char_length(name) <= 80)`),
	check("bases_timezone_check", sql`timezone = 'Asia/Jerusalem'::text`),
]);

export const nfcReaders = pgTable("nfc_readers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	baseId: uuid("base_id").notNull(),
	name: text().notNull(),
	keyHash: text("key_hash").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("nfc_readers_base_idx").using("btree", table.baseId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.baseId],
			foreignColumns: [bases.id],
			name: "nfc_readers_base_id_fkey"
		}).onDelete("restrict"),
	check("nfc_readers_name_check", sql`(char_length(name) >= 1) AND (char_length(name) <= 80)`),
	check("nfc_readers_key_hash_check", sql`key_hash ~ '^[0-9a-f]{64}$'::text`),
]);

export const userNfcCards = pgTable("user_nfc_cards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	serialFingerprint: text("serial_fingerprint").notNull(),
	serialLast4: text("serial_last4").notNull(),
	enrolledBy: uuid("enrolled_by").notNull(),
	enrolledAt: timestamp("enrolled_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("user_nfc_cards_one_active_per_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(revoked_at IS NULL)`),
	index("user_nfc_cards_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_nfc_cards_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.enrolledBy],
			foreignColumns: [users.id],
			name: "user_nfc_cards_enrolled_by_fkey"
		}),
	unique("user_nfc_cards_serial_fingerprint_key").on(table.serialFingerprint),
	check("user_nfc_cards_serial_fingerprint_check", sql`serial_fingerprint ~ '^[0-9a-f]{64}$'::text`),
	check("user_nfc_cards_serial_last4_check", sql`serial_last4 ~ '^[0-9]{1,4}$'::text`),
]);

export const baseVisits = pgTable("base_visits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	baseId: uuid("base_id").notNull(),
	userId: uuid("user_id").notNull(),
	cardId: uuid("card_id").notNull(),
	enteredAt: timestamp("entered_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	exitedAt: timestamp("exited_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("base_visits_base_time_idx").using("btree", table.baseId.asc().nullsLast().op("timestamptz_ops"), table.enteredAt.desc().nullsFirst().op("uuid_ops")),
	uniqueIndex("base_visits_one_open_per_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(exited_at IS NULL)`),
	index("base_visits_user_time_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.enteredAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.baseId],
			foreignColumns: [bases.id],
			name: "base_visits_base_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "base_visits_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [userNfcCards.id],
			name: "base_visits_card_id_fkey"
		}).onDelete("restrict"),
	check("base_visits_check", sql`(exited_at IS NULL) OR (exited_at >= entered_at)`),
]);

export const nfcScanEvents = pgTable("nfc_scan_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	readerId: uuid("reader_id").notNull(),
	baseId: uuid("base_id").notNull(),
	cardId: uuid("card_id"),
	userId: uuid("user_id"),
	cardFingerprint: text("card_fingerprint").notNull(),
	requestId: uuid("request_id").notNull(),
	result: text().notNull(),
	visitId: uuid("visit_id"),
	scannedAt: timestamp("scanned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("nfc_scan_events_base_time_idx").using("btree", table.baseId.asc().nullsLast().op("timestamptz_ops"), table.scannedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("nfc_scan_events_card_time_idx").using("btree", table.cardFingerprint.asc().nullsLast().op("text_ops"), table.scannedAt.desc().nullsFirst().op("text_ops")),
	index("nfc_scan_events_user_time_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.scannedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.readerId],
			foreignColumns: [nfcReaders.id],
			name: "nfc_scan_events_reader_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.baseId],
			foreignColumns: [bases.id],
			name: "nfc_scan_events_base_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [userNfcCards.id],
			name: "nfc_scan_events_card_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "nfc_scan_events_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.visitId],
			foreignColumns: [baseVisits.id],
			name: "nfc_scan_events_visit_id_fkey"
		}).onDelete("set null"),
	unique("nfc_scan_events_reader_id_request_id_key").on(table.readerId, table.requestId),
	check("nfc_scan_events_card_fingerprint_check", sql`card_fingerprint ~ '^[0-9a-f]{64}$'::text`),
	check("nfc_scan_events_result_check", sql`result = ANY (ARRAY['entry'::text, 'exit'::text, 'duplicate'::text, 'unknown_card'::text, 'inactive_user'::text, 'wrong_base'::text])`),
]);

export const hrAssignments = pgTable("hr_assignments", {
	hrUserId: uuid("hr_user_id").notNull(),
	groupId: uuid("group_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("hr_assignments_group_idx").using("btree", table.groupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.hrUserId],
			foreignColumns: [users.id],
			name: "hr_assignments_hr_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [groups.id],
			name: "hr_assignments_group_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.hrUserId, table.groupId], name: "hr_assignments_pkey"}),
]);

export const favorites = pgTable("favorites", {
	commanderId: uuid("commander_id").notNull(),
	soldierId: uuid("soldier_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.commanderId],
			foreignColumns: [users.id],
			name: "favorites_commander_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.soldierId],
			foreignColumns: [users.id],
			name: "favorites_soldier_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.commanderId, table.soldierId], name: "favorites_pkey"}),
	check("favorites_check", sql`commander_id <> soldier_id`),
]);

export const emergencyResponses = pgTable("emergency_responses", {
	eventId: uuid("event_id").notNull(),
	userId: uuid("user_id").notNull(),
	status: text().notNull(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [emergencyEvents.id],
			name: "emergency_responses_event_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "emergency_responses_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.eventId, table.userId], name: "emergency_responses_pkey"}),
	check("emergency_responses_status_check", sql`status = ANY (ARRAY['ok'::text, 'need_help'::text])`),
]);

export const nfcPresenceDays = pgTable("nfc_presence_days", {
	visitId: uuid("visit_id").notNull(),
	reportDate: date("report_date").notNull(),
	reportId: uuid("report_id"),
	result: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("nfc_presence_days_date_idx").using("btree", table.reportDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.visitId],
			foreignColumns: [baseVisits.id],
			name: "nfc_presence_days_visit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reportId],
			foreignColumns: [reports.id],
			name: "nfc_presence_days_report_id_fkey"
		}).onDelete("set null"),
	primaryKey({ columns: [table.visitId, table.reportDate], name: "nfc_presence_days_pkey"}),
	check("nfc_presence_days_result_check", sql`result = ANY (ARRAY['created'::text, 'already_present'::text, 'conflict'::text, 'finalized_conflict'::text])`),
]);
