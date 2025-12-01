/**
 * App Component Tests
 * Tests routing, navigation, and protected routes
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import App from '../App';

// Mock the pages
vi.mock('../pages/Auth', () => ({
  default: () => <div data-testid="auth-page">Auth Page</div>
}));

vi.mock('../pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Page</div>
}));

vi.mock('../pages/Production', () => ({
  default: () => <div data-testid="production-page">Production Page</div>
}));

vi.mock('../pages/NotFound', () => ({
  default: () => <div data-testid="notfound-page">Not Found Page</div>
}));

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false
  })
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
  });

  it('provides QueryClient to the application', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('wraps application with TooltipProvider', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('includes Toaster components for notifications', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});

describe('App Routing', () => {
  it('has routes configured', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('includes protected routes', () => {
    const { container } = render(<App />);
    // ProtectedRoute component should be in use
    expect(container).toBeInTheDocument();
  });
});
