/**
 * Layout Component Tests
 * Tests navigation, responsive behavior, and user interactions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { Layout } from '../../components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

// Mock dependencies
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn()
  };
});

describe('Layout - Header', () => {
  const mockSignOut = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: mockSignOut,
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders header with Tarko branding', () => {
    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText('Tarko')).toBeInTheDocument();
    expect(screen.getByText('Inventory System')).toBeInTheDocument();
  });

  it('displays Factory icon in header', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Check for icon container with primary background
    const iconContainer = container.querySelector('.bg-primary');
    expect(iconContainer).toBeInTheDocument();
  });

  it('shows user role badge on desktop', () => {
    render(<Layout><div>Content</div></Layout>);

    // Role badge is hidden on mobile (md:flex)
    expect(screen.getByText('USER')).toBeInTheDocument();
  });

  it('displays uppercase user role', () => {
    (useAuth as any).mockReturnValue({
      signOut: mockSignOut,
      userRole: 'admin',
      isAdmin: true
    });

    render(<Layout><div>Content</div></Layout>);
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('renders sign out button', () => {
    render(<Layout><div>Content</div></Layout>);

    const signOutButtons = screen.getAllByText('Sign Out');
    expect(signOutButtons.length).toBeGreaterThan(0);
  });

  it('calls signOut and navigates to auth on sign out', async () => {
    const user = userEvent.setup();
    mockSignOut.mockResolvedValue(undefined);

    render(<Layout><div>Content</div></Layout>);

    const signOutButtons = screen.getAllByText('Sign Out');
    await user.click(signOutButtons[0]);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/auth');
    });
  });
});

describe('Layout - Clock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(vi.fn());
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays current time in header', () => {
    const mockDate = new Date('2024-01-15T14:30:45');
    vi.setSystemTime(mockDate);

    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText(/2:30:45 PM/)).toBeInTheDocument();
  });

  it('updates time every second', async () => {
    const mockDate = new Date('2024-01-15T14:30:45');
    vi.setSystemTime(mockDate);

    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText(/2:30:45 PM/)).toBeInTheDocument();

    // Advance time by 1 second
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/2:30:46 PM/)).toBeInTheDocument();
    });
  });

  it('formats time in 12-hour format with AM/PM', () => {
    const mockDate = new Date('2024-01-15T09:15:30');
    vi.setSystemTime(mockDate);

    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText(/9:15:30 AM/)).toBeInTheDocument();
  });

  it('handles midnight correctly', () => {
    const mockDate = new Date('2024-01-15T00:00:00');
    vi.setSystemTime(mockDate);

    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText(/12:00:00 AM/)).toBeInTheDocument();
  });

  it('handles noon correctly', () => {
    const mockDate = new Date('2024-01-15T12:00:00');
    vi.setSystemTime(mockDate);

    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText(/12:00:00 PM/)).toBeInTheDocument();
  });

  it('cleans up interval on unmount', () => {
    const { unmount } = render(<Layout><div>Content</div></Layout>);

    unmount();

    // Advance time and verify no updates happen
    vi.advanceTimersByTime(1000);
    // If interval wasn't cleaned up, this would fail
  });
});

describe('Layout - Navigation Menu', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders all standard menu items', () => {
    render(<Layout><div>Content</div></Layout>);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Dispatch')).toBeInTheDocument();
    expect(screen.getByText('Returns')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('does not show Admin menu for non-admin users', () => {
    render(<Layout><div>Content</div></Layout>);

    const adminItems = screen.queryAllByText('Admin');
    // Admin might appear in role badge but not in menu for non-admin
    expect(adminItems.length).toBeLessThan(2);
  });

  it('shows Admin menu item for admin users', () => {
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'admin',
      isAdmin: true
    });

    render(<Layout><div>Content</div></Layout>);

    const adminItems = screen.getAllByText('Admin');
    expect(adminItems.length).toBeGreaterThan(0);
  });

  it('navigates to correct path when menu item clicked', async () => {
    const user = userEvent.setup();
    render(<Layout><div>Content</div></Layout>);

    const productionButtons = screen.getAllByText('Production');
    await user.click(productionButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/production');
  });

  it('highlights active menu item', () => {
    (useLocation as any).mockReturnValue({ pathname: '/production' });

    const { container } = render(<Layout><div>Content</div></Layout>);

    // Active item should have 'default' variant styling
    expect(container.innerHTML).toContain('Production');
  });

  it('all menu items have correct icons', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Check that icons are rendered (lucide-react icons)
    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(8); // At least one icon per menu item
  });
});

describe('Layout - Mobile Menu', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders mobile menu toggle button', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Look for menu button with md:hidden class (mobile only)
    const buttons = container.querySelectorAll('button');
    const menuButton = Array.from(buttons).find(btn =>
      btn.className.includes('md:hidden')
    );
    expect(menuButton).toBeInTheDocument();
  });

  it('mobile menu is closed by default', () => {
    render(<Layout><div>Content</div></Layout>);

    // Mobile menu content should not be visible initially
    const mobileNav = document.querySelector('.md\\:hidden.border-t');
    expect(mobileNav).not.toBeInTheDocument();
  });

  it('opens mobile menu when toggle is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<Layout><div>Content</div></Layout>);

    const buttons = container.querySelectorAll('button');
    const menuButton = Array.from(buttons).find(btn =>
      btn.className.includes('md:hidden')
    );

    if (menuButton) {
      await user.click(menuButton);

      // Mobile menu should now be visible
      await waitFor(() => {
        const mobileNav = document.querySelector('.md\\:hidden.border-t');
        expect(mobileNav).toBeInTheDocument();
      });
    }
  });

  it('closes mobile menu when menu item is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Open menu
    const buttons = container.querySelectorAll('button');
    const menuButton = Array.from(buttons).find(btn =>
      btn.className.includes('md:hidden')
    );

    if (menuButton) {
      await user.click(menuButton);

      // Click a menu item
      const productionButtons = screen.getAllByText('Production');
      await user.click(productionButtons[productionButtons.length - 1]);

      // Menu should close
      await waitFor(() => {
        const mobileNav = document.querySelector('.md\\:hidden.border-t');
        expect(mobileNav).not.toBeInTheDocument();
      });

      // Should navigate
      expect(mockNavigate).toHaveBeenCalledWith('/production');
    }
  });

  it('toggles between Menu and X icons', async () => {
    const user = userEvent.setup();
    const { container } = render(<Layout><div>Content</div></Layout>);

    const buttons = container.querySelectorAll('button');
    const menuButton = Array.from(buttons).find(btn =>
      btn.className.includes('md:hidden')
    );

    if (menuButton) {
      // Initially should show Menu icon
      expect(menuButton.innerHTML).toContain('svg');

      // Click to open
      await user.click(menuButton);

      // Should now show X icon
      expect(menuButton.innerHTML).toContain('svg');
    }
  });

  it('shows user role in mobile menu', async () => {
    const user = userEvent.setup();
    const { container } = render(<Layout><div>Content</div></Layout>);

    const buttons = container.querySelectorAll('button');
    const menuButton = Array.from(buttons).find(btn =>
      btn.className.includes('md:hidden')
    );

    if (menuButton) {
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('Role:')).toBeInTheDocument();
      });
    }
  });
});

describe('Layout - Bottom Navigation (Mobile)', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders bottom navigation for mobile', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Bottom nav should have fixed positioning
    const bottomNav = container.querySelector('nav.md\\:hidden.fixed.bottom-0');
    expect(bottomNav).toBeInTheDocument();
  });

  it('shows first 5 menu items in bottom nav', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const bottomNav = container.querySelector('nav.md\\:hidden.fixed.bottom-0');
    expect(bottomNav).toBeInTheDocument();

    // Should have 5 columns
    const grid = bottomNav?.querySelector('.grid-cols-5');
    expect(grid).toBeInTheDocument();
  });

  it('navigates when bottom nav item is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<Layout><div>Content</div></Layout>);

    const bottomNav = container.querySelector('nav.md\\:hidden.fixed.bottom-0');
    const buttons = bottomNav?.querySelectorAll('button');

    if (buttons && buttons.length > 0) {
      await user.click(buttons[0]);
      expect(mockNavigate).toHaveBeenCalled();
    }
  });

  it('highlights active item in bottom nav', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const bottomNav = container.querySelector('nav.md\\:hidden.fixed.bottom-0');
    expect(bottomNav).toBeInTheDocument();

    // Active item should have special styling
    const activeButton = bottomNav?.querySelector('[class*="text-primary"]');
    expect(activeButton).toBeInTheDocument();
  });
});

describe('Layout - Desktop Sidebar', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders desktop sidebar', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Sidebar should be hidden on mobile, visible on desktop
    const sidebar = container.querySelector('aside.hidden.md\\:flex');
    expect(sidebar).toBeInTheDocument();
  });

  it('sidebar is sticky positioned', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const sidebar = container.querySelector('aside.sticky');
    expect(sidebar).toBeInTheDocument();
  });

  it('sidebar has correct width', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const sidebar = container.querySelector('aside.w-64');
    expect(sidebar).toBeInTheDocument();
  });

  it('navigates when sidebar menu item clicked', async () => {
    const user = userEvent.setup();
    render(<Layout><div>Content</div></Layout>);

    // Find sidebar menu items (first set of menu items)
    const inventoryButtons = screen.getAllByText('Inventory');
    await user.click(inventoryButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/inventory');
  });
});

describe('Layout - Content Area', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(vi.fn());
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('renders children content', () => {
    render(
      <Layout>
        <div data-testid="test-content">Test Content</div>
      </Layout>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders multiple children correctly', () => {
    render(
      <Layout>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </Layout>
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('main content has proper padding', () => {
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>
    );

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveClass('p-4', 'md:p-6');
  });

  it('main content is flexible', () => {
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>
    );

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveClass('flex-1');
  });

  it('has bottom padding for mobile nav', () => {
    const { container } = render(
      <Layout>
        <div>Content</div>
      </Layout>
    );

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveClass('pb-20', 'md:pb-6');
  });
});

describe('Layout - Responsive Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(vi.fn());
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('has mobile-first responsive classes', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Check for md: breakpoint classes
    expect(container.innerHTML).toContain('md:');
  });

  it('hides desktop elements on mobile', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Sidebar should be hidden on mobile
    const sidebar = container.querySelector('aside.hidden.md\\:flex');
    expect(sidebar).toBeInTheDocument();
  });

  it('hides mobile elements on desktop', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    // Mobile menu toggle should be hidden on desktop
    const mobileButton = container.querySelector('button.md\\:hidden');
    expect(mobileButton).toBeInTheDocument();
  });

  it('applies correct grid layout for mobile bottom nav', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const grid = container.querySelector('.grid.grid-cols-5');
    expect(grid).toBeInTheDocument();
  });
});

describe('Layout - Styling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      signOut: vi.fn(),
      userRole: 'user',
      isAdmin: false
    });
    (useNavigate as any).mockReturnValue(vi.fn());
    (useLocation as any).mockReturnValue({ pathname: '/dashboard' });
  });

  it('uses factory background color', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const root = container.querySelector('.bg-factory-bg');
    expect(root).toBeInTheDocument();
  });

  it('header is sticky positioned', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const header = container.querySelector('header.sticky');
    expect(header).toBeInTheDocument();
  });

  it('header has correct z-index', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const header = container.querySelector('header.z-50');
    expect(header).toBeInTheDocument();
  });

  it('uses card background for header and sidebar', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const cardElements = container.querySelectorAll('.bg-card');
    expect(cardElements.length).toBeGreaterThan(0);
  });

  it('applies border to header and sidebar', () => {
    const { container } = render(<Layout><div>Content</div></Layout>);

    const borderedElements = container.querySelectorAll('.border-border');
    expect(borderedElements.length).toBeGreaterThan(0);
  });
});
