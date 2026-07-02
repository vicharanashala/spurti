import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SpProgressBar, { calculateMaxSp } from '../components/SpProgressBar';

describe('SpProgressBar Component and Helper', () => {
  describe('calculateMaxSp Helper', () => {
    it('calculates max SP as 20 for 1 day active', () => {
      const maxSp = calculateMaxSp('2026-05-15', '2026-05-15');
      expect(maxSp).toBe(20);
    });

    it('calculates max SP as 100 for 5 days active', () => {
      const maxSp = calculateMaxSp('2026-05-15', '2026-05-19');
      expect(maxSp).toBe(100);
    });

    it('calculates max SP correctly across month boundaries', () => {
      const maxSp = calculateMaxSp('2026-05-30', '2026-06-02');
      // May 30, May 31, June 1, June 2 = 4 days active
      expect(maxSp).toBe(80);
    });
  });

  describe('SpProgressBar Rendering', () => {
    const startDate = '2026-05-15';
    const mockCurrentDateStr = '2026-05-24T12:00:00'; // 10 days active => Max SP = 200

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(mockCurrentDateStr));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders SP ratio, percentage, and progress bar width correctly at 50%', () => {
      render(<SpProgressBar totalSp={100} internshipStartDate={startDate} />);
      
      expect(screen.getByText('100 / 200 SP')).toBeInTheDocument();
      expect(screen.getByText('50% of Max Possible')).toBeInTheDocument();
      
      const fill = screen.getByTestId('progress-fill');
      expect(fill).toHaveStyle({ width: '50%' });

      const motivationText = screen.getByTestId('progress-motivation');
      expect(motivationText.textContent).toContain('Good progress');
    });

    it('renders motivate text and progress bar width correctly at 80%', () => {
      render(<SpProgressBar totalSp={160} internshipStartDate={startDate} />);
      
      expect(screen.getByText('160 / 200 SP')).toBeInTheDocument();
      expect(screen.getByText('80% of Max Possible')).toBeInTheDocument();
      
      const fill = screen.getByTestId('progress-fill');
      expect(fill).toHaveStyle({ width: '80%' });

      const motivationText = screen.getByTestId('progress-motivation');
      expect(motivationText.textContent).toContain('Excellent participation energy');
    });

    it('caps progress bar fill width at 100% when student has higher SP than max', () => {
      render(<SpProgressBar totalSp={250} internshipStartDate={startDate} />);
      
      expect(screen.getByText('250 / 200 SP')).toBeInTheDocument();
      expect(screen.getByText('125% of Max Possible')).toBeInTheDocument();
      
      const fill = screen.getByTestId('progress-fill');
      expect(fill).toHaveStyle({ width: '100%' });

      const motivationText = screen.getByTestId('progress-motivation');
      expect(motivationText.textContent).toContain('Phenomenal consistency');
    });
  });
});
