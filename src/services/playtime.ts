/**
 * Play time statistics, derived from sessions this launcher actually ran.
 */

import { WeeklyPlaytimeDay } from '../types/launcher';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The trailing seven days, all at zero, oldest first. */
export function emptyWeek(today: Date = new Date()): WeeklyPlaytimeDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - offset));
    return {
      day: DAY_LABELS[date.getDay()],
      dayName: DAY_NAMES[date.getDay()],
      fullDate: date.toISOString().split('T')[0],
      hours: 0,
      minutes: 0,
      sessions: 0,
    };
  });
}

/** Adds a finished session to the day it belongs to. */
export function recordSession(
  week: WeeklyPlaytimeDay[],
  minutesPlayed: number,
  when: Date = new Date()
): WeeklyPlaytimeDay[] {
  const today = when.toISOString().split('T')[0];
  const known = week.some((entry) => entry.fullDate === today) ? week : emptyWeek(when);

  return known.map((entry) => {
    if (entry.fullDate !== today) return entry;
    const total = entry.hours * 60 + entry.minutes + minutesPlayed;
    return {
      ...entry,
      hours: Math.floor(total / 60),
      minutes: total % 60,
      sessions: entry.sessions + 1,
    };
  });
}
