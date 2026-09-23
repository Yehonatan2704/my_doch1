import { describe, expect, test } from 'vitest';
import { splitTime, stepTime } from './settings';

describe('stepTime', () => {
  test('hours step and wrap', () => {
    expect(stepTime('08:00', 'hour', 1)).toBe('09:00');
    expect(stepTime('23:30', 'hour', 1)).toBe('00:30');
    expect(stepTime('00:15', 'hour', -1)).toBe('23:15');
  });

  test('minutes step by 5 and wrap without touching the hour', () => {
    expect(stepTime('08:00', 'minute', 1)).toBe('08:05');
    expect(stepTime('08:55', 'minute', 1)).toBe('08:00');
    expect(stepTime('08:00', 'minute', -1)).toBe('08:55');
  });

  test('off-grid minutes snap to the 5-minute grid', () => {
    expect(stepTime('08:07', 'minute', 1)).toBe('08:10');
    expect(stepTime('08:07', 'minute', -1)).toBe('08:05');
    expect(stepTime('08:58', 'minute', 1)).toBe('08:00');
  });

  test('splitTime', () => {
    expect(splitTime('07:45')).toEqual([7, 45]);
  });
});
