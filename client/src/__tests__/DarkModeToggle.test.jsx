import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import DarkModeToggle from '../components/DarkModeToggle';

describe('DarkModeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  it('renders the toggle button with correct initial light state', () => {
    render(<DarkModeToggle />);
    const btn = screen.getByRole('button', { name: /toggle dark mode/i });
    expect(btn).toBeInTheDocument();
    // Default is light theme, button shows moon icon 🌙 to switch to dark
    expect(btn.textContent).toBe('🌙');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles theme on click and updates attribute and localStorage', () => {
    render(<DarkModeToggle />);
    const btn = screen.getByRole('button', { name: /toggle dark mode/i });
    
    // Toggle to Dark
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(btn.textContent).toBe('☀️');

    // Toggle back to Light
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(btn.textContent).toBe('🌙');
  });

  it('initializes with dark theme if stored in localStorage', () => {
    localStorage.setItem('theme', 'dark');
    render(<DarkModeToggle />);
    const btn = screen.getByRole('button', { name: /toggle dark mode/i });
    
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn.textContent).toBe('☀️');
  });

  it('initializes with dark theme if system preference matches dark', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
      matches: query.includes('dark'),
      media: query,
    })));

    render(<DarkModeToggle />);
    const btn = screen.getByRole('button', { name: /toggle dark mode/i });
    
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn.textContent).toBe('☀️');
  });
});
