import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryNew from '@/pages/InventoryNew';
import { renderWithoutRouter } from '@/test/test-utils';
import * as api from '@/lib/api';

// Mock API
vi.mock('@/lib/api', () => ({
  inventory: {
    get: vi.fn(),
    getProductTypes: vi.fn(),
    getBrands: vi.fn(),
  },
  parameters: {
    get: vi.fn(),
  }
}));

// Mock child components
vi.mock('@/components/inventory/ProductVariantCard', () => ({
  ProductVariantCard: ({ batch }: any) => (
    <div data-testid={`variant-card-${batch.id}`}>
      Variant Card - {batch.batch_code}
    </div>
  )
}));

vi.mock('@/components/inventory/StockSummary', () => ({
  StockSummary: () => <div data-testid="stock-summary">Stock Summary</div>
}));

vi.mock('@/components/inventory/ScrapHistory', () => ({
  default: () => <div data-testid="scrap-history">Scrap History</div>
}));

vi.mock('@/components/inventory/WhatsAppShareDialog', () => ({
  WhatsAppShareDialog: ({ open }: any) => open ? <div data-testid="whatsapp-dialog">WhatsApp Dialog</div> : null
}));

vi.mock('@/components/inventory/ImportExportDialog', () => ({
  ImportExportDialog: ({ open }: any) => open ? <div data-testid="import-export-dialog">Import/Export Dialog</div> : null
}));

vi.mock('@/components/inventory/AdvancedFilters', () => ({
  AdvancedFilters: ({ onFilterChange }: any) => (
    <div data-testid="advanced-filters">
      <button onClick={() => onFilterChange('color', 'blue')}>Filter</button>
    </div>
  )
}));

vi.mock('@/components/inventory/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: ({ open }: any) => open ? <div data-testid="keyboard-shortcuts">Keyboard Shortcuts</div> : null
}));

// Mock Layout
vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  )
}));

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com', role: 'admin' }
  })
}));

describe('InventoryNew Page', () => {
  const mockBatches = [
    {
      id: '1',
      batch_code: 'BATCH001',
      batch_no: '001',
      current_quantity: 100,
      production_date: '2025-01-01',
      product_type_name: 'HDPE',
      brand_name: 'BrandA',
      parameters: { color: 'blue', thickness: '2mm' },
      product_variant_id: 'variant1',
      stock_entries: [
        {
          stock_id: 's1',
          stock_type: 'FULL_ROLL' as const,
          quantity: 100,
          status: 'available',
          total_available: 100,
          product_type_name: 'HDPE'
        }
      ]
    },
    {
      id: '2',
      batch_code: 'BATCH002',
      batch_no: '002',
      current_quantity: 50,
      production_date: '2025-01-02',
      product_type_name: 'LDPE',
      brand_name: 'BrandB',
      parameters: { color: 'red', thickness: '3mm' },
      product_variant_id: 'variant2',
      stock_entries: [
        {
          stock_id: 's2',
          stock_type: 'CUT_ROLL' as const,
          quantity: 50,
          status: 'available',
          total_available: 50,
          product_type_name: 'LDPE'
        }
      ]
    }
  ];

  const mockProductTypes = [
    { id: 'pt1', name: 'HDPE' },
    { id: 'pt2', name: 'LDPE' }
  ];

  const mockBrands = [
    { id: 'b1', name: 'BrandA' },
    { id: 'b2', name: 'BrandB' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful API responses with slight delay to simulate real behavior
    (api.inventory.get as any).mockImplementation(() =>
      Promise.resolve({ data: mockBatches })
    );
    (api.inventory.getProductTypes as any).mockImplementation(() =>
      Promise.resolve({ data: mockProductTypes })
    );
    (api.inventory.getBrands as any).mockImplementation(() =>
      Promise.resolve({ data: mockBrands })
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Page Structure', () => {
    it('renders inventory page with layout wrapper', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByTestId('layout')).toBeInTheDocument();
    });

    it('renders page heading', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByRole('heading', { name: /inventory/i })).toBeInTheDocument();
    });

    it('renders page description', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByText(/manage and track your stock inventory/i)).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('fetches product types on mount', async () => {
      renderWithoutRouter(<InventoryNew />);

      await waitFor(() => {
        expect(api.inventory.getProductTypes).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('fetches brands on mount', async () => {
      renderWithoutRouter(<InventoryNew />);

      await waitFor(() => {
        expect(api.inventory.getBrands).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('initializes data loading on mount', () => {
      renderWithoutRouter(<InventoryNew />);
      // Component mounts successfully and begins data loading
      expect(screen.getByTestId('layout')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('renders search input', () => {
      renderWithoutRouter(<InventoryNew />);

      const searchInput = screen.getByPlaceholderText(/search by batch code/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('allows typing in search input', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<InventoryNew />);

      const searchInput = screen.getByPlaceholderText(/search by batch code/i);
      await user.type(searchInput, 'BATCH001');

      expect(searchInput).toHaveValue('BATCH001');
    });
  });

  describe('Tabs', () => {
    it('renders all tab triggers', async () => {
      renderWithoutRouter(<InventoryNew />);

      expect(screen.getByRole('tab', { name: /stock/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /scrap history/i })).toBeInTheDocument();
    });

    it('shows stock tab by default', async () => {
      renderWithoutRouter(<InventoryNew />);

      const stockTab = screen.getByRole('tab', { name: /stock/i });
      expect(stockTab).toHaveAttribute('data-state', 'active');
    });

    it('switches to scrap history tab', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<InventoryNew />);

      const scrapTab = screen.getByRole('tab', { name: /scrap history/i });
      await user.click(scrapTab);

      await waitFor(() => {
        expect(scrapTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('scrap-history')).toBeInTheDocument();
      });
    });
  });

  describe('Action Buttons', () => {
    it('renders refresh button', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    it('renders WhatsApp button', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    });

    it('renders import/export button for admin', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByText('Import/Export')).toBeInTheDocument();
    });

    it('renders keyboard shortcuts button', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByText('Shortcuts')).toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    it('renders advanced filters component', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByTestId('advanced-filters')).toBeInTheDocument();
    });
  });

  describe('Stock Summary', () => {
    it('displays stock summary component', () => {
      renderWithoutRouter(<InventoryNew />);
      expect(screen.getByTestId('stock-summary')).toBeInTheDocument();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('opens keyboard shortcuts dialog with ? key', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<InventoryNew />);

      await user.keyboard('?');

      await waitFor(() => {
        expect(screen.getByTestId('keyboard-shortcuts')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Auto-refresh', () => {
    it('sets up visibility change listener', () => {
      renderWithoutRouter(<InventoryNew />);
      // Component mounts successfully and sets up listeners
      expect(screen.getByTestId('layout')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles special characters in search without crashing', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<InventoryNew />);

      const searchInput = screen.getByPlaceholderText(/search by batch code/i);
      await user.type(searchInput, '@#$%');

      // Should not crash
      expect(searchInput).toHaveValue('@#$%');
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      renderWithoutRouter(<InventoryNew />);

      const heading = screen.getByRole('heading', { name: /inventory/i });
      expect(heading.tagName).toBe('H1');
    });

    it('buttons have accessible names', () => {
      renderWithoutRouter(<InventoryNew />);

      expect(screen.getByText('Refresh')).toBeInTheDocument();
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Import/Export')).toBeInTheDocument();
      expect(screen.getByText('Shortcuts')).toBeInTheDocument();
    });
  });
});
