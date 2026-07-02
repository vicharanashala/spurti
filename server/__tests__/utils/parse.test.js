import { parseCsv, parseDate, parseZoomDate } from '../../utils/parse.js';

describe('parseCsv', () => {
  test('parses simple CSV', () => {
    const rows = parseCsv('name,email\nTest,test@example.com');
    expect(rows).toEqual([['name', 'email'], ['Test', 'test@example.com']]);
  });

  test('handles quoted fields with commas', () => {
    const rows = parseCsv('name,email\n"Doe, John",john@example.com');
    expect(rows).toEqual([['name', 'email'], ['Doe, John', 'john@example.com']]);
  });

  test('handles double quotes inside quoted field', () => {
    const rows = parseCsv('name\n"She said ""hello"""');
    expect(rows).toEqual([['name'], ['She said "hello"']]);
  });

  test('handles BOM character', () => {
    const rows = parseCsv('\uFEFFname,email\nTest,test@example.com');
    expect(rows[0]).toEqual(['name', 'email']);
  });

  test('handles empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseDate', () => {
  test('parses "15 May 2026" format', () => {
    const d = parseDate('15 May 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
  });

  test('parses "2026-05-15" ISO format', () => {
    const d = parseDate('2026-05-15');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
  });

  test('returns null for unparseable input', () => {
    expect(parseDate('invalid')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('parseZoomDate', () => {
  test('parses AM time correctly', () => {
    const d = parseZoomDate('5/15/2026 9:30:00 AM');
    expect(d).toBeInstanceOf(Date);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  test('parses PM time correctly', () => {
    const d = parseZoomDate('5/15/2026 2:30:00 PM');
    expect(d).toBeInstanceOf(Date);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  test('12 PM is noon', () => {
    const d = parseZoomDate('5/15/2026 12:00:00 PM');
    expect(d.getHours()).toBe(12);
  });

  test('12 AM is midnight', () => {
    const d = parseZoomDate('5/15/2026 12:00:00 AM');
    expect(d.getHours()).toBe(0);
  });

  test('returns fallback for invalid input', () => {
    const fallback = new Date('2026-01-01');
    expect(parseZoomDate('invalid', fallback)).toBe(fallback);
  });
});