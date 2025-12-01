/**
 * ProtectedRoute Component Tests
 * Tests authentication-based route protection and authorization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithoutRouter, screen } from '@/test/test-utils';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

const TestComponent = () => <div data-testid="protected-content">Protected Content</div>;

describe('ProtectedRoute - Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /auth when user is not authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/auth" element={<div data-testid="auth-page">Auth Page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <TestComponent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'testuser' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('shows loading indicator when auth state is loading', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: true,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders loading spinner with correct styling', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: true,
      isAdmin: false,
      isUser: false
    });

    const { container } = renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('rounded-full', 'border-b-2', 'border-primary');
  });
});

describe('ProtectedRoute - Admin Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows access when requireAdmin=true and user is admin', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'admin', role: 'admin' },
      loading: false,
      isAdmin: true,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('denies access when requireAdmin=true and user is not admin', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'regularuser', role: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows admin-specific access denied message', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
  });
});

describe('ProtectedRoute - User Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows access when requireUser=true and user has user role', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'user', role: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('allows access when requireUser=true and user is admin', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'admin', role: 'admin' },
      loading: false,
      isAdmin: true,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('denies access when requireUser=true and user is viewer', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 3, username: 'viewer', role: 'viewer' },
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/user or admin access required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows user-specific access denied message', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 3, username: 'viewer' },
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/user or admin access required/i)).toBeInTheDocument();
  });
});

describe('ProtectedRoute - Role Combinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows any authenticated user when no role requirements specified', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 3, username: 'viewer', role: 'viewer' },
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('requireAdmin takes precedence over requireUser', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'user', role: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('admin can access requireUser routes', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'admin', role: 'admin' },
      loading: false,
      isAdmin: true,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireUser>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

describe('ProtectedRoute - Children Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders single child element correctly', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="single-child">Single Child</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('single-child')).toBeInTheDocument();
  });

  it('renders multiple children correctly', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('renders complex nested components', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    const ComplexComponent = () => (
      <div data-testid="complex-parent">
        <header data-testid="header">Header</header>
        <main data-testid="main">Main Content</main>
        <footer data-testid="footer">Footer</footer>
      </div>
    );

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <ComplexComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('complex-parent')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('main')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });
});

describe('ProtectedRoute - Error Messages UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders access denied with proper styling', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    const { container } = renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    const heading = screen.getByText(/access denied/i);
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('text-destructive');
  });

  it('centers error message on screen', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 2, username: 'user' },
      loading: false,
      isAdmin: false,
      isUser: true
    });

    const { container } = renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    const wrapper = container.querySelector('.flex.min-h-screen');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('items-center', 'justify-center');
  });
});

describe('ProtectedRoute - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles undefined user gracefully', () => {
    (useAuth as any).mockReturnValue({
      user: undefined,
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/auth" element={<div data-testid="auth-page">Auth</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <TestComponent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
  });

  it('handles null user correctly', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/auth" element={<div data-testid="auth-page">Auth</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <TestComponent />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
  });

  it('does not render children during loading state', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: true,
      isAdmin: false,
      isUser: false
    });

    renderWithoutRouter(
      <MemoryRouter>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
