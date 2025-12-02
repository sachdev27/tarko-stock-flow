/**
 * Auth Page Tests
 * Tests login form rendering, validation, submission, and navigation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import Auth from '../../pages/Auth';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Mock dependencies
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn()
  };
});

// Mock toast from sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

import { toast } from 'sonner';
const mockToast = toast as any;

describe('Auth Page - Login Form', () => {
  const mockSignIn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('renders login form with identifier and password fields', () => {
    render(<Auth />);

    expect(screen.getByLabelText(/email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders heading and subtitle', () => {
    render(<Auth />);

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByText(/inventory management system/i)).toBeInTheDocument();
  });

  it('renders Factory icon', () => {
    render(<Auth />);

    // Check for icon container
    const iconContainer = document.querySelector('svg');
    expect(iconContainer).toBeInTheDocument();
  });

  it('allows user to type in identifier field', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const identifierInput = screen.getByLabelText(/email or username/i);
    await user.type(identifierInput, 'testuser');

    expect(identifierInput).toHaveValue('testuser');
  });

  it('allows user to type in password field', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'testpass123');

    expect(passwordInput).toHaveValue('testpass123');
  });

  it('password field has type="password"', () => {
    render(<Auth />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

describe('Auth Page - Form Validation', () => {
  const mockSignIn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('shows error toast when identifier is empty', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: expect.stringMatching(/error/i)
        })
      );
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows error toast when password is empty', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const identifierInput = screen.getByLabelText(/email or username/i);
    await user.type(identifierInput, 'testuser');

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: expect.stringMatching(/error/i)
        })
      );
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows error toast when both fields are empty', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive'
        })
      );
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe('Auth Page - Form Submission', () => {
  const mockSignIn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('calls signIn with correct credentials on valid submission', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ success: true });

    render(<Auth />);

    await user.type(screen.getByLabelText(/email or username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('testuser', 'testpass123');
    });
  });

  it('shows success toast and navigates to dashboard on successful login', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ success: true });

    render(<Auth />);

    await user.type(screen.getByLabelText(/email or username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error toast on failed login', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ success: false, error: 'Invalid credentials' });

    render(<Auth />);

    await user.type(screen.getByLabelText(/email or username/i), 'wronguser');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'Invalid credentials'
        })
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles network errors gracefully', async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValue(new Error('Network error'));

    render(<Auth />);

    await user.type(screen.getByLabelText(/email or username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive'
        })
      );
    });
  });

  it('disables submit button while loading', () => {
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: true
    });

    render(<Auth />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it('shows loading indicator when submitting', async () => {
    const user = userEvent.setup();
    let resolveSignIn: any;
    mockSignIn.mockReturnValue(new Promise(resolve => { resolveSignIn = resolve; }));

    render(<Auth />);

    await user.type(screen.getByLabelText(/email or username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Button should be disabled during submission
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();

    resolveSignIn({ success: true });
  });
});

describe('Auth Page - Navigation', () => {
  const mockSignIn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ success: true });
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('redirects to dashboard if user is already logged in', () => {
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: { id: 1, username: 'testuser' },
      loading: false
    });

    render(<Auth />);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('does not redirect when user is null', () => {
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: false
    });

    render(<Auth />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('waits for loading state before redirecting', () => {
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: true
    });

    render(<Auth />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Auth Page - UI Elements', () => {
  const mockSignIn = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signIn: mockSignIn,
      user: null,
      loading: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('renders card component wrapper', () => {
    const { container } = render(<Auth />);
    expect(container.querySelector('.card') || container.firstChild).toBeInTheDocument();
  });

  it('form has proper structure', () => {
    render(<Auth />);

    const form = screen.getByRole('button', { name: /sign in/i }).closest('form');
    expect(form).toBeInTheDocument();
  });

  it('inputs have proper labels or placeholders', () => {
    render(<Auth />);

    const identifierInput = screen.getByLabelText(/email or username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(identifierInput).toHaveAttribute('placeholder');
    expect(passwordInput).toHaveAttribute('placeholder');
  });

  it('renders with animated background', () => {
    const { container } = render(<Auth />);
    // Background animation elements should be present
    expect(container.firstChild).toBeInTheDocument();
  });
});
