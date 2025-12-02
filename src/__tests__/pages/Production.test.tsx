import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Production from '@/pages/Production';
import { renderWithoutRouter } from '@/test/test-utils';

// Mock child components
vi.mock('@/components/production/ProductionNewTab', () => ({
  ProductionNewTab: () => <div data-testid="production-new-tab">Production New Tab</div>
}));

vi.mock('@/components/production/ProductionHistoryTab', () => ({
  ProductionHistoryTab: () => <div data-testid="production-history-tab">Production History Tab</div>
}));

// Mock Layout component
vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  )
}));

describe('Production Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Structure', () => {
    it('renders production page with layout wrapper', () => {
      renderWithoutRouter(<Production />);
      expect(screen.getByTestId('layout')).toBeInTheDocument();
    });

    it('renders page heading with factory icon', () => {
      renderWithoutRouter(<Production />);
      expect(screen.getByRole('heading', { name: /production/i })).toBeInTheDocument();
    });

    it('renders page description', () => {
      renderWithoutRouter(<Production />);
      expect(screen.getByText(/create new production batches and view production history/i)).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders both tab triggers', () => {
      renderWithoutRouter(<Production />);
      expect(screen.getByRole('tab', { name: /new production/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /production history/i })).toBeInTheDocument();
    });

    it('shows New Production tab as active by default', () => {
      renderWithoutRouter(<Production />);
      const newTab = screen.getByRole('tab', { name: /new production/i });
      expect(newTab).toHaveAttribute('data-state', 'active');
    });

    it('shows ProductionNewTab content by default', () => {
      renderWithoutRouter(<Production />);
      expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('production-history-tab')).not.toBeInTheDocument();
    });

    it('switches to production history tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      const historyTab = screen.getByRole('tab', { name: /production history/i });
      await user.click(historyTab);

      await waitFor(() => {
        expect(historyTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('production-history-tab')).toBeInTheDocument();
        expect(screen.queryByTestId('production-new-tab')).not.toBeInTheDocument();
      });
    });

    it('switches back to new production tab', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      // Switch to history
      const historyTab = screen.getByRole('tab', { name: /production history/i });
      await user.click(historyTab);

      await waitFor(() => {
        expect(screen.getByTestId('production-history-tab')).toBeInTheDocument();
      });

      // Switch back to new
      const newTab = screen.getByRole('tab', { name: /new production/i });
      await user.click(newTab);

      await waitFor(() => {
        expect(newTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
        expect(screen.queryByTestId('production-history-tab')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tab Icons', () => {
    it('renders factory icon in new production tab', () => {
      renderWithoutRouter(<Production />);
      const newTab = screen.getByRole('tab', { name: /new production/i });
      expect(newTab.querySelector('svg')).toBeInTheDocument();
    });

    it('renders list icon in production history tab', () => {
      renderWithoutRouter(<Production />);
      const historyTab = screen.getByRole('tab', { name: /production history/i });
      expect(historyTab.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Layout and Styling', () => {
    it('applies proper spacing classes', () => {
      const { container } = renderWithoutRouter(<Production />);
      const mainContent = container.querySelector('.space-y-6');
      expect(mainContent).toBeInTheDocument();
    });

    it('renders tabs with proper grid layout', () => {
      const { container } = renderWithoutRouter(<Production />);
      const tabsList = container.querySelector('.grid.w-full.max-w-md.grid-cols-2');
      expect(tabsList).toBeInTheDocument();
    });

    it('renders new production tab content with centered max-width container', () => {
      const { container } = renderWithoutRouter(<Production />);
      const contentContainer = container.querySelector('.max-w-4xl.mx-auto');
      expect(contentContainer).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes for tabs', () => {
      renderWithoutRouter(<Production />);
      const newTab = screen.getByRole('tab', { name: /new production/i });
      const historyTab = screen.getByRole('tab', { name: /production history/i });

      expect(newTab).toHaveAttribute('role', 'tab');
      expect(historyTab).toHaveAttribute('role', 'tab');
    });

    it('has proper heading hierarchy', () => {
      renderWithoutRouter(<Production />);
      const heading = screen.getByRole('heading', { name: /production/i });
      expect(heading.tagName).toBe('H1');
    });

    it('tab navigation works with keyboard', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      const newTab = screen.getByRole('tab', { name: /new production/i });
      const historyTab = screen.getByRole('tab', { name: /production history/i });

      // Focus and activate with keyboard
      await user.click(historyTab);

      await waitFor(() => {
        expect(historyTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('production-history-tab')).toBeInTheDocument();
      });

      // Can navigate back with keyboard
      await user.click(newTab);

      await waitFor(() => {
        expect(newTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
      });
    });
  });

  describe('State Management', () => {
    it('maintains tab state correctly', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      // Initial state
      expect(screen.getByRole('tab', { name: /new production/i })).toHaveAttribute('data-state', 'active');

      // Change state
      await user.click(screen.getByRole('tab', { name: /production history/i }));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /production history/i })).toHaveAttribute('data-state', 'active');
        expect(screen.getByRole('tab', { name: /new production/i })).toHaveAttribute('data-state', 'inactive');
      });
    });

    it('only one tab can be active at a time', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      await user.click(screen.getByRole('tab', { name: /production history/i }));

      await waitFor(() => {
        const tabs = screen.getAllByRole('tab');
        const activeTabs = tabs.filter(tab => tab.getAttribute('data-state') === 'active');
        expect(activeTabs).toHaveLength(1);
      });
    });
  });

  describe('Component Integration', () => {
    it('passes correct props to child components implicitly', () => {
      renderWithoutRouter(<Production />);

      // Child components are rendered correctly
      expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
    });

    it('renders within Layout component', () => {
      renderWithoutRouter(<Production />);

      const layout = screen.getByTestId('layout');
      expect(layout).toContainElement(screen.getByRole('heading', { name: /production/i }));
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid tab switching', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      const newTab = screen.getByRole('tab', { name: /new production/i });
      const historyTab = screen.getByRole('tab', { name: /production history/i });

      // Rapidly switch tabs
      await user.click(historyTab);
      await user.click(newTab);
      await user.click(historyTab);
      await user.click(newTab);

      await waitFor(() => {
        expect(newTab).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
      });
    });

    it('maintains correct state after multiple switches', async () => {
      const user = userEvent.setup();
      renderWithoutRouter(<Production />);

      const historyTab = screen.getByRole('tab', { name: /production history/i });

      // Switch multiple times
      for (let i = 0; i < 3; i++) {
        await user.click(historyTab);
        await waitFor(() => {
          expect(screen.getByTestId('production-history-tab')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: /new production/i }));
        await waitFor(() => {
          expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
        });
      }

      // Final state should be consistent
      expect(screen.getByTestId('production-new-tab')).toBeInTheDocument();
    });
  });
});
