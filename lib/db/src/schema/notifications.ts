import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const notificationLogsTable = pgTable("notification_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull(),
  channel: text("channel", { enum: ["whatsapp","sms","email"] }).notNull(),
  status: text("status", { enum: ["queued","sent","failed"] }).notNull().default("queued"),
  recipientId: text("recipient_id"),
  recipientType: text("recipient_type"),
  recipientPhone: text("recipient_phone"),
  recipientEmail: text("recipient_email"),
  payload: jsonb("payload"),
  errorMsg: text("error_msg"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
