/**
 * Dashboard Page Tests
 * Tests dashboard rendering, stats display, and user interactions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import Dashboard from '../../pages/Dashboard';
import { stats } from '@/lib/api';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('@/lib/api', () => ({
  stats: {
    getDashboard: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

// Mock Layout component
vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>
}));

// Mock dashboard components
vi.mock('@/components/dashboard', () => ({
  StatsCard: ({ title, value }: any) => (
    <div data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <span>{title}</span>
      <span>{value}</span>
    </div>
  ),
  QuickActions: () => <div data-testid="quick-actions">Quick Actions</div>,
  InventoryByType: ({ data }: any) => <div data-testid="inventory-by-type">Inventory: {data?.length || 0}</div>,
  LowStockAlerts: ({ items }: any) => <div data-testid="low-stock-alerts">Low Stock: {items?.length || 0}</div>,
  RecentActivity: ({ activities }: any) => <div data-testid="recent-activity">Activity: {activities?.length || 0}</div>,
  TransactionStats: ({ stats }: any) => <div data-testid="transaction-stats">Transactions: {stats?.total_transactions || 0}</div>
}));

const mockDashboardData = {
  totalBatches: 150,
  activeBatches: 120,
  inventoryByType: [
    { product_type: 'HDPE', total_quantity: 5000, batch_count: 50 },
    { product_type: 'Sprinkler', total_quantity: 3000, batch_count: 40 }
  ],
  transactionsStats: {
    total_transactions: 500,
    production_count: 200,
    sales_count: 150,
    return_count: 30,
    scrap_count: 20,
    inventory_ops_count: 100
  },
  lowStockItems: [
    {
      batch_code: 'HDPE-001',
      current_quantity: 50,
      product_type: 'HDPE',
      brand: 'BrandA',
      parameters: { size: '20mm' }
    }
  ],
  recentActivity: [
    {
      id: '1',
      transaction_type: 'production',
      quantity_change: 100,
      created_at: '2024-01-15T10:00:00Z',
      user_name: 'John Doe',
      batch_code: 'HDPE-001',
      product_type: 'HDPE'
    }
  ],
  productDistribution: [
    { product_type: 'HDPE', batch_count: 50, total_quantity: 5000 }
  ]
};

describe('Dashboard - Initial Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('renders dashboard layout wrapper', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  });

  it('renders dashboard heading and subtitle', () => {
    render(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/tarko inventory management overview/i)).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    render(<Dashboard />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<Dashboard />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays loading skeletons while fetching data', () => {
    const { container } = render(<Dashboard />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('Dashboard - Data Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('fetches dashboard stats on mount', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(1);
    });
  });

  it('displays fetched stats correctly', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Batches')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  it('shows error toast when fetch fails', async () => {
    (stats.getDashboard as any).mockRejectedValue(new Error('Network error'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load dashboard stats');
    });
  });

  it('hides loading state after data loads', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  it('handles empty data gracefully', async () => {
    (stats.getDashboard as any).mockResolvedValue({
      data: {
        totalBatches: 0,
        activeBatches: 0,
        inventoryByType: [],
        transactionsStats: {},
        lowStockItems: [],
        recentActivity: [],
        productDistribution: []
      }
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });
});

describe('Dashboard - Main Stat Cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('renders all four main stat cards', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-card-total-batches')).toBeInTheDocument();
      expect(screen.getByTestId('stats-card-active-stock')).toBeInTheDocument();
      expect(screen.getByTestId('stats-card-low-stock-alerts')).toBeInTheDocument();
      expect(screen.getByTestId('stats-card-recent-activity')).toBeInTheDocument();
    });
  });

  it('displays correct values for total batches', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const card = screen.getByTestId('stats-card-total-batches');
      expect(card).toHaveTextContent('150');
    });
  });

  it('displays correct values for active stock', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const card = screen.getByTestId('stats-card-active-stock');
      expect(card).toHaveTextContent('120');
    });
  });

  it('displays low stock alerts count', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const card = screen.getByTestId('stats-card-low-stock-alerts');
      expect(card).toHaveTextContent('1');
    });
  });

  it('displays recent activity count', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const card = screen.getByTestId('stats-card-recent-activity');
      expect(card).toHaveTextContent('500');
    });
  });

  it('handles missing transaction stats gracefully', async () => {
    (stats.getDashboard as any).mockResolvedValue({
      data: { ...mockDashboardData, transactionsStats: {} }
    });

    render(<Dashboard />);

    await waitFor(() => {
      const card = screen.getByTestId('stats-card-recent-activity');
      expect(card).toHaveTextContent('0');
    });
  });
});

describe('Dashboard - Component Sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('renders QuickActions component', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    });
  });

  it('renders InventoryByType with correct data', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const component = screen.getByTestId('inventory-by-type');
      expect(component).toHaveTextContent('Inventory: 2');
    });
  });

  it('renders LowStockAlerts with correct items', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const component = screen.getByTestId('low-stock-alerts');
      expect(component).toHaveTextContent('Low Stock: 1');
    });
  });

  it('renders RecentActivity with correct activities', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const component = screen.getByTestId('recent-activity');
      expect(component).toHaveTextContent('Activity: 1');
    });
  });

  it('renders TransactionStats with correct stats', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const component = screen.getByTestId('transaction-stats');
      expect(component).toHaveTextContent('Transactions: 500');
    });
  });
});

describe('Dashboard - User Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('refreshes data when refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(1);
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it('disables refresh button while loading', () => {
    render(<Dashboard />);

    const refreshButton = screen.getByRole('button', { name: /loading/i });
    expect(refreshButton).toBeDisabled();
  });

  it('enables refresh button after data loads', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      expect(refreshButton).not.toBeDisabled();
    });
  });

  it('shows loading text on refresh button during load', () => {
    render(<Dashboard />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('Dashboard - Auto Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets up auto-refresh interval', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(1);
    });

    // Fast forward 30 seconds
    vi.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(2);
    });
  });

  it('refreshes multiple times at 30 second intervals', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(1);
    });

    // Fast forward 90 seconds (3 intervals)
    vi.advanceTimersByTime(90000);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(4); // Initial + 3 intervals
    });
  });

  it('cleans up interval on unmount', async () => {
    const { unmount } = render(<Dashboard />);

    await waitFor(() => {
      expect(stats.getDashboard).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Fast forward time after unmount
    vi.advanceTimersByTime(30000);

    // Should not call again after unmount
    expect(stats.getDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('Dashboard - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error to console when fetch fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Network error');
    (stats.getDashboard as any).mockRejectedValue(error);

    render(<Dashboard />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching stats:', error);
    });

    consoleErrorSpy.mockRestore();
  });

  it('still renders UI structure when fetch fails', async () => {
    (stats.getDashboard as any).mockRejectedValue(new Error('Network error'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  it('displays zero values when data fetch fails', async () => {
    (stats.getDashboard as any).mockRejectedValue(new Error('Network error'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-card-total-batches')).toHaveTextContent('0');
    });
  });
});

describe('Dashboard - Responsive Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (stats.getDashboard as any).mockResolvedValue({ data: mockDashboardData });
  });

  it('renders with responsive grid classes', () => {
    const { container } = render(<Dashboard />);

    const grids = container.querySelectorAll('[class*="grid"]');
    expect(grids.length).toBeGreaterThan(0);
  });

  it('applies spacing classes correctly', () => {
    const { container } = render(<Dashboard />);

    const spacedDiv = container.querySelector('.space-y-6');
    expect(spacedDiv).toBeInTheDocument();
  });

  it('includes responsive breakpoint classes', () => {
    const { container } = render(<Dashboard />);

    // Check for md: and lg: breakpoint classes
    const hasResponsiveClasses = container.innerHTML.includes('md:') ||
                                  container.innerHTML.includes('lg:');
    expect(hasResponsiveClasses).toBe(true);
  });
});
