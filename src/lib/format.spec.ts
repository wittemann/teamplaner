import { describe, expect, it } from 'vitest';
import { dayOfMonth, deadline, longDate, month, shortDate, time, weekday } from './format.ts';

describe('format', () => {
  // 09:30 in Berlin (summer time)
  const iso = '2027-04-17T07:30:00.000Z';

  it('formats in Berlin time', () => {
    expect(weekday(iso)).toBe('Sa');
    expect(dayOfMonth(iso)).toBe('17');
    expect(month(iso)).toBe('Apr');
    expect(shortDate(iso)).toBe('17.04.');
    expect(time(iso)).toBe('9:30');
    expect(longDate(iso)).toBe('Samstag, 17. April 2027');
  });

  it('writes full hours of a deadline without minutes', () => {
    expect(deadline('2027-04-15T18:00:00.000Z')).toBe('Do 15.04., 20 Uhr');
    expect(deadline('2027-04-15T18:30:00.000Z')).toBe('Do 15.04., 20:30 Uhr');
  });

  it('uses the date in Berlin around midnight', () => {
    expect(shortDate('2027-04-16T22:30:00.000Z')).toBe('17.04.');
  });
});
