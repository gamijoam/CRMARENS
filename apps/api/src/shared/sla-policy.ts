export const SLA_WARNING_HOURS = 2;
export const SLA_BREACH_HOURS = 4;

export type ConversationSlaState = "ok" | "warning" | "breached";

export function getConversationSlaState(referenceDate: Date, now = new Date()): ConversationSlaState {
  const elapsedMs = now.getTime() - referenceDate.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours >= SLA_BREACH_HOURS) {
    return "breached";
  }

  if (elapsedHours >= SLA_WARNING_HOURS) {
    return "warning";
  }

  return "ok";
}
