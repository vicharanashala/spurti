import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentSearch from '../components/StudentSearch';

describe('StudentSearch Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders input and search button', () => {
    render(<StudentSearch />);
    expect(screen.getByPlaceholderText('Enter name or email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('shows error if search query is empty', async () => {
    render(<StudentSearch />);
    const button = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(button);

    expect(await screen.findByText('Please enter a name or email.')).toBeInTheDocument();
  });

  it('calls endpoint and displays student details on success', async () => {
    const mockStudent = {
      name: 'Alice Johnson',
      email: 'alice@dummy.com',
      joiningDate: '2026-06-28T00:00:00.000Z',
      spPoints: 12
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStudent)
    });
    global.fetch = fetchMock;

    render(<StudentSearch />);

    const input = screen.getByPlaceholderText('Enter name or email');
    fireEvent.change(input, { target: { value: 'alice' } });

    const button = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/api/demo-students/search?query=alice');

    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('alice@dummy.com')).toBeInTheDocument();
    expect(screen.getByText('28 Jun 2026')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows "No record found." if endpoint returns 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });
    global.fetch = fetchMock;

    render(<StudentSearch />);

    const input = screen.getByPlaceholderText('Enter name or email');
    fireEvent.change(input, { target: { value: 'unknown' } });

    const button = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(button);

    expect(await screen.findByText('No record found.')).toBeInTheDocument();
  });
});
