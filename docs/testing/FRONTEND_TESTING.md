# Frontend Testing Guide

This guide covers the testing infrastructure and test suites for the Tarko Inventory Management frontend application.

## Testing Stack

- **Testing Framework**: Vitest
- **Testing Library**: @testing-library/react
- **Browser Environment**: jsdom
- **User Interactions**: @testing-library/user-event
- **Assertion Library**: @testing-library/jest-dom

## Installation

Install the required testing dependencies:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui
```

Or with yarn:

```bash
yarn add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui
```

Or with bun:

```bash
bun add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui
```

## Project Structure

```
src/
├── __tests__/              # Test files
│   ├── App.test.tsx
│   ├── components/         # Component tests
│   │   └── ProtectedRoute.test.tsx
│   └── pages/              # Page tests
│       ├── Auth.test.tsx
│       └── Dashboard.test.tsx
├── test/                   # Test utilities
│   ├── setup.ts           # Global test setup
│   └── test-utils.tsx     # Custom render function
└── ...
```

## Configuration Files

### `vitest.config.ts`

Main Vitest configuration with:
- React plugin for JSX support
- jsdom environment for browser API simulation
- Global test utilities (describe, it, expect)
- Coverage configuration
- Path aliases (@/ → ./src)

### `src/test/setup.ts`

Global test setup including:
- @testing-library/jest-dom matchers
- Automatic cleanup after each test
- Browser API mocks:
  - `window.matchMedia` - Responsive design testing
  - `IntersectionObserver` - Scroll/visibility testing
  - `ResizeObserver` - Size-responsive testing

### `src/test/test-utils.tsx`

Custom render function that wraps components with:
- `QueryClientProvider` - TanStack Query context
- `BrowserRouter` - React Router navigation

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run tests with UI
npm test -- --ui

# Run specific test file
npm test Auth.test.tsx

# Run tests matching pattern
npm test -- --grep="Dashboard"
```

## Writing Tests

### Basic Component Test

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Testing with User Interactions

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import LoginForm from '../LoginForm';

describe('LoginForm', () => {
  it('submits form with user input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    
    render(<LoginForm onSubmit={handleSubmit} />);
    
    await user.type(screen.getByLabelText(/username/i), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(handleSubmit).toHaveBeenCalledWith({
      username: 'testuser',
      password: 'password123'
    });
  });
});
```

### Mocking Dependencies

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import MyComponent from '../MyComponent';
import { api } from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', () => ({
  api: {
    fetchData: vi.fn()
  }
}));

describe('MyComponent', () => {
  it('fetches and displays data', async () => {
    (api.fetchData as any).mockResolvedValue({ data: 'test' });
    
    render(<MyComponent />);
    
    await waitFor(() => {
      expect(screen.getByText('test')).toBeInTheDocument();
    });
  });
});
```

### Testing with Auth Context

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedComponent from '../ProtectedComponent';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

describe('ProtectedComponent', () => {
  it('shows content when authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'test' },
      loading: false
    });
    
    render(<ProtectedComponent />);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
  
  it('redirects when not authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: false
    });
    
    render(<ProtectedComponent />);
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
```

## Test Coverage

Current test coverage:

### Components
- ✅ App.tsx - Routing and provider setup
- ✅ ProtectedRoute.tsx - Authentication and authorization (60+ tests)
  - Authentication checks
  - Admin authorization
  - User authorization
  - Loading states
  - Error messages
  - Edge cases

### Pages
- ✅ Auth.tsx - Login form (50+ tests)
  - Form rendering
  - Input validation
  - Form submission
  - Success/error handling
  - Navigation
  - Loading states
  
- ✅ Dashboard.tsx - Main dashboard (45+ tests)
  - Data fetching
  - Stat cards
  - Component sections
  - User interactions
  - Auto-refresh
  - Error handling
  - Responsive layout

### To Be Implemented
- ⏳ Production.tsx
- ⏳ Inventory.tsx
- ⏳ Dispatch.tsx
- ⏳ Return.tsx
- ⏳ Reports.tsx
- ⏳ Admin.tsx
- ⏳ Layout.tsx
- ⏳ Dashboard components (StatsCard, QuickActions, etc.)
- ⏳ Custom hooks
- ⏳ Utility functions

## Best Practices

1. **Use Semantic Queries**: Prefer queries that reflect how users interact with the UI
   - `getByRole`, `getByLabelText`, `getByPlaceholderText`
   - Avoid `getByTestId` unless necessary

2. **Test Behavior, Not Implementation**: Focus on what the user sees and does
   - Don't test internal state or methods
   - Test the component's behavior and output

3. **Use User-Event for Interactions**: Simulates real user behavior better than fireEvent
   ```tsx
   const user = userEvent.setup();
   await user.click(button);
   await user.type(input, 'text');
   ```

4. **Wait for Async Updates**: Use `waitFor` for async operations
   ```tsx
   await waitFor(() => {
     expect(screen.getByText('Loaded')).toBeInTheDocument();
   });
   ```

5. **Mock External Dependencies**: Mock API calls, external libraries, and complex dependencies
   ```tsx
   vi.mock('@/lib/api', () => ({
     api: { fetchData: vi.fn() }
   }));
   ```

6. **Clean Up**: Tests are automatically cleaned up after each test via `afterEach(cleanup)`

7. **Descriptive Test Names**: Use clear, descriptive test names
   ```tsx
   it('shows error toast when login fails', () => { ... });
   // Better than: it('handles error', () => { ... });
   ```

## Debugging Tests

### View Rendered HTML
```tsx
const { debug } = render(<MyComponent />);
debug(); // Prints rendered HTML to console
```

### View Specific Element
```tsx
debug(screen.getByRole('button'));
```

### Use screen.logTestingPlaygroundURL()
```tsx
render(<MyComponent />);
screen.logTestingPlaygroundURL();
// Opens Testing Playground with current DOM
```

## Common Issues

### "Unable to find element"
- Use `screen.debug()` to see what's actually rendered
- Check if element is in a loading state
- Use `findBy` queries for async elements
- Verify the query selector is correct

### "Not wrapped in act(...)"
- Use `waitFor` for async updates
- Ensure all state updates are awaited
- Use `user-event` instead of `fireEvent`

### Mock not working
- Ensure mock is called before component import
- Use `vi.clearAllMocks()` in `beforeEach`
- Check mock function is called with correct arguments

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Testing Library Queries Cheatsheet](https://testing-library.com/docs/queries/about)

## Contributing

When adding new components or features:

1. Create corresponding test file in `__tests__/` directory
2. Follow existing test patterns and naming conventions
3. Aim for >80% code coverage
4. Test both happy paths and error cases
5. Include edge cases and boundary conditions
6. Update this README if adding new testing patterns

## NPM Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run"
  }
}
```
