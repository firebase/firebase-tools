import { CronExpressionParser } from "cron-parser";

const WEEKDAYS = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

function normalizeAppEngineSchedule(schedule: string): string | undefined {
  const normalized = schedule.trim().toLowerCase();

  let match = /^every\s+(\d+)\s+minutes?$/.exec(normalized);
  if (match) {
    const interval = Number(match[1]);
    if (!Number.isFinite(interval) || interval <= 0) {
      return undefined;
    }
    return `*/${interval} * * * *`;
  }

  match = /^every\s+(\d+)\s+hours?$/.exec(normalized);
  if (match) {
    const interval = Number(match[1]);
    if (!Number.isFinite(interval) || interval <= 0) {
      return undefined;
    }
    return `0 */${interval} * * *`;
  }

  match = /^every\s+day\s+(\d{1,2}):(\d{2})$/.exec(normalized);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return undefined;
    }
    return `${minute} ${hour} * * *`;
  }

  match = /^every\s+([a-z]{3})(?:day)?\s+(\d{1,2}):(\d{2})$/.exec(normalized);
  if (match) {
    const weekday = match[1];
    const hour = Number(match[2]);
    const minute = Number(match[3]);
    if (!WEEKDAYS.has(weekday) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return undefined;
    }
    return `${minute} ${hour} * * ${weekday.toUpperCase()}`;
  }

  return undefined;
}

function normalizeScheduleExpression(schedule: string): string[] {
  const normalized = schedule.trim();
  const appEngineNormalized = normalizeAppEngineSchedule(normalized);
  if (appEngineNormalized) {
    return [appEngineNormalized];
  }
  return [normalized];
}

/**
 * Returns the next scheduled runtime for a schedule expression.
 * Supports cron syntax and select App Engine-style "every ..." phrases.
 */
export function getNextRun(schedule: string, from: Date, timeZone?: string): Date | undefined {
  for (const expression of normalizeScheduleExpression(schedule)) {
    try {
      const parsed = CronExpressionParser.parse(expression, {
        currentDate: from,
        tz: timeZone,
      });
      return parsed.next().toDate();
    } catch (e: unknown) {
      // Try next normalization candidate.
    }
  }
  return undefined;
}
