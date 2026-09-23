import { relations } from "drizzle-orm/relations";
import { groups, users, statusCategories, statusReasons, documents, reports, reportAudit, userSettings, userWeekTemplate, pushTokens, emergencyEvents, bases, nfcReaders, userNfcCards, baseVisits, nfcScanEvents, hrAssignments, favorites, emergencyResponses, nfcPresenceDays } from "./schema";

export const usersRelations = relations(users, ({one, many}) => ({
	group: one(groups, {
		fields: [users.groupId],
		references: [groups.id],
		relationName: "users_groupId_groups_id"
	}),
	groups: many(groups, {
		relationName: "groups_commanderId_users_id"
	}),
	documents: many(documents),
	reports_userId: many(reports, {
		relationName: "reports_userId_users_id"
	}),
	reports_reportedBy: many(reports, {
		relationName: "reports_reportedBy_users_id"
	}),
	reports_lastModifiedBy: many(reports, {
		relationName: "reports_lastModifiedBy_users_id"
	}),
	reports_approvedBy: many(reports, {
		relationName: "reports_approvedBy_users_id"
	}),
	reports_finalizedBy: many(reports, {
		relationName: "reports_finalizedBy_users_id"
	}),
	reportAudits_userId: many(reportAudit, {
		relationName: "reportAudit_userId_users_id"
	}),
	reportAudits_actorId: many(reportAudit, {
		relationName: "reportAudit_actorId_users_id"
	}),
	userSettings: many(userSettings),
	userWeekTemplates: many(userWeekTemplate),
	pushTokens: many(pushTokens),
	emergencyEvents_startedBy: many(emergencyEvents, {
		relationName: "emergencyEvents_startedBy_users_id"
	}),
	emergencyEvents_endedBy: many(emergencyEvents, {
		relationName: "emergencyEvents_endedBy_users_id"
	}),
	userNfcCards_userId: many(userNfcCards, {
		relationName: "userNfcCards_userId_users_id"
	}),
	userNfcCards_enrolledBy: many(userNfcCards, {
		relationName: "userNfcCards_enrolledBy_users_id"
	}),
	baseVisits: many(baseVisits),
	nfcScanEvents: many(nfcScanEvents),
	hrAssignments: many(hrAssignments),
	favorites_commanderId: many(favorites, {
		relationName: "favorites_commanderId_users_id"
	}),
	favorites_soldierId: many(favorites, {
		relationName: "favorites_soldierId_users_id"
	}),
	emergencyResponses: many(emergencyResponses),
}));

export const groupsRelations = relations(groups, ({one, many}) => ({
	users: many(users, {
		relationName: "users_groupId_groups_id"
	}),
	group: one(groups, {
		fields: [groups.parentId],
		references: [groups.id],
		relationName: "groups_parentId_groups_id"
	}),
	groups: many(groups, {
		relationName: "groups_parentId_groups_id"
	}),
	user: one(users, {
		fields: [groups.commanderId],
		references: [users.id],
		relationName: "groups_commanderId_users_id"
	}),
	emergencyEvents: many(emergencyEvents),
	hrAssignments: many(hrAssignments),
}));

export const statusReasonsRelations = relations(statusReasons, ({one, many}) => ({
	statusCategory: one(statusCategories, {
		fields: [statusReasons.categoryId],
		references: [statusCategories.id]
	}),
	reports: many(reports),
	reportAudits_oldReasonId: many(reportAudit, {
		relationName: "reportAudit_oldReasonId_statusReasons_id"
	}),
	reportAudits_newReasonId: many(reportAudit, {
		relationName: "reportAudit_newReasonId_statusReasons_id"
	}),
}));

export const statusCategoriesRelations = relations(statusCategories, ({many}) => ({
	statusReasons: many(statusReasons),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	user: one(users, {
		fields: [documents.ownerId],
		references: [users.id]
	}),
	reports: many(reports),
}));

export const reportsRelations = relations(reports, ({one, many}) => ({
	user_userId: one(users, {
		fields: [reports.userId],
		references: [users.id],
		relationName: "reports_userId_users_id"
	}),
	statusReason: one(statusReasons, {
		fields: [reports.reasonId],
		references: [statusReasons.id]
	}),
	document: one(documents, {
		fields: [reports.documentId],
		references: [documents.id]
	}),
	user_reportedBy: one(users, {
		fields: [reports.reportedBy],
		references: [users.id],
		relationName: "reports_reportedBy_users_id"
	}),
	user_lastModifiedBy: one(users, {
		fields: [reports.lastModifiedBy],
		references: [users.id],
		relationName: "reports_lastModifiedBy_users_id"
	}),
	user_approvedBy: one(users, {
		fields: [reports.approvedBy],
		references: [users.id],
		relationName: "reports_approvedBy_users_id"
	}),
	user_finalizedBy: one(users, {
		fields: [reports.finalizedBy],
		references: [users.id],
		relationName: "reports_finalizedBy_users_id"
	}),
	nfcPresenceDays: many(nfcPresenceDays),
}));

export const reportAuditRelations = relations(reportAudit, ({one}) => ({
	user_userId: one(users, {
		fields: [reportAudit.userId],
		references: [users.id],
		relationName: "reportAudit_userId_users_id"
	}),
	user_actorId: one(users, {
		fields: [reportAudit.actorId],
		references: [users.id],
		relationName: "reportAudit_actorId_users_id"
	}),
	statusReason_oldReasonId: one(statusReasons, {
		fields: [reportAudit.oldReasonId],
		references: [statusReasons.id],
		relationName: "reportAudit_oldReasonId_statusReasons_id"
	}),
	statusReason_newReasonId: one(statusReasons, {
		fields: [reportAudit.newReasonId],
		references: [statusReasons.id],
		relationName: "reportAudit_newReasonId_statusReasons_id"
	}),
}));

export const userSettingsRelations = relations(userSettings, ({one}) => ({
	user: one(users, {
		fields: [userSettings.userId],
		references: [users.id]
	}),
}));

export const userWeekTemplateRelations = relations(userWeekTemplate, ({one}) => ({
	user: one(users, {
		fields: [userWeekTemplate.userId],
		references: [users.id]
	}),
}));

export const pushTokensRelations = relations(pushTokens, ({one}) => ({
	user: one(users, {
		fields: [pushTokens.userId],
		references: [users.id]
	}),
}));

export const emergencyEventsRelations = relations(emergencyEvents, ({one, many}) => ({
	group: one(groups, {
		fields: [emergencyEvents.groupId],
		references: [groups.id]
	}),
	user_startedBy: one(users, {
		fields: [emergencyEvents.startedBy],
		references: [users.id],
		relationName: "emergencyEvents_startedBy_users_id"
	}),
	user_endedBy: one(users, {
		fields: [emergencyEvents.endedBy],
		references: [users.id],
		relationName: "emergencyEvents_endedBy_users_id"
	}),
	emergencyResponses: many(emergencyResponses),
}));

export const nfcReadersRelations = relations(nfcReaders, ({one, many}) => ({
	base: one(bases, {
		fields: [nfcReaders.baseId],
		references: [bases.id]
	}),
	nfcScanEvents: many(nfcScanEvents),
}));

export const basesRelations = relations(bases, ({many}) => ({
	nfcReaders: many(nfcReaders),
	baseVisits: many(baseVisits),
	nfcScanEvents: many(nfcScanEvents),
}));

export const userNfcCardsRelations = relations(userNfcCards, ({one, many}) => ({
	user_userId: one(users, {
		fields: [userNfcCards.userId],
		references: [users.id],
		relationName: "userNfcCards_userId_users_id"
	}),
	user_enrolledBy: one(users, {
		fields: [userNfcCards.enrolledBy],
		references: [users.id],
		relationName: "userNfcCards_enrolledBy_users_id"
	}),
	baseVisits: many(baseVisits),
	nfcScanEvents: many(nfcScanEvents),
}));

export const baseVisitsRelations = relations(baseVisits, ({one, many}) => ({
	base: one(bases, {
		fields: [baseVisits.baseId],
		references: [bases.id]
	}),
	user: one(users, {
		fields: [baseVisits.userId],
		references: [users.id]
	}),
	userNfcCard: one(userNfcCards, {
		fields: [baseVisits.cardId],
		references: [userNfcCards.id]
	}),
	nfcScanEvents: many(nfcScanEvents),
	nfcPresenceDays: many(nfcPresenceDays),
}));

export const nfcScanEventsRelations = relations(nfcScanEvents, ({one}) => ({
	nfcReader: one(nfcReaders, {
		fields: [nfcScanEvents.readerId],
		references: [nfcReaders.id]
	}),
	base: one(bases, {
		fields: [nfcScanEvents.baseId],
		references: [bases.id]
	}),
	userNfcCard: one(userNfcCards, {
		fields: [nfcScanEvents.cardId],
		references: [userNfcCards.id]
	}),
	user: one(users, {
		fields: [nfcScanEvents.userId],
		references: [users.id]
	}),
	baseVisit: one(baseVisits, {
		fields: [nfcScanEvents.visitId],
		references: [baseVisits.id]
	}),
}));

export const hrAssignmentsRelations = relations(hrAssignments, ({one}) => ({
	user: one(users, {
		fields: [hrAssignments.hrUserId],
		references: [users.id]
	}),
	group: one(groups, {
		fields: [hrAssignments.groupId],
		references: [groups.id]
	}),
}));

export const favoritesRelations = relations(favorites, ({one}) => ({
	user_commanderId: one(users, {
		fields: [favorites.commanderId],
		references: [users.id],
		relationName: "favorites_commanderId_users_id"
	}),
	user_soldierId: one(users, {
		fields: [favorites.soldierId],
		references: [users.id],
		relationName: "favorites_soldierId_users_id"
	}),
}));

export const emergencyResponsesRelations = relations(emergencyResponses, ({one}) => ({
	emergencyEvent: one(emergencyEvents, {
		fields: [emergencyResponses.eventId],
		references: [emergencyEvents.id]
	}),
	user: one(users, {
		fields: [emergencyResponses.userId],
		references: [users.id]
	}),
}));

export const nfcPresenceDaysRelations = relations(nfcPresenceDays, ({one}) => ({
	baseVisit: one(baseVisits, {
		fields: [nfcPresenceDays.visitId],
		references: [baseVisits.id]
	}),
	report: one(reports, {
		fields: [nfcPresenceDays.reportId],
		references: [reports.id]
	}),
}));