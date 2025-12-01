import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';

interface ComboboxOption {
  id: string;
  [key: string]: any;
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  onCreateNew?: (searchTerm: string) => Promise<ComboboxOption | void>;
  displayFormat?: (item: ComboboxOption) => string;
  searchFields?: string[];
  filterFn?: (item: ComboboxOption, search: string) => boolean;
  disabled?: boolean;
  className?: string;
}

export const SearchableCombobox = ({
  value,
  onChange,
  options,
  placeholder = 'Search or create...',
  onCreateNew,
  displayFormat = (item) => item.name || '',
  searchFields,
  filterFn = (item, search) => {
    const searchLower = search.toLowerCase();

    // If searchFields provided, search across those fields
    if (searchFields && searchFields.length > 0) {
      return searchFields.some(field => {
        const value = item[field];
        return value && String(value).toLowerCase().includes(searchLower);
      });
    }

    // Default: search in display format
    const display = displayFormat(item).toLowerCase();
    return display.includes(searchLower);
  },
  disabled = false,
  className = ''
}: SearchableComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(item => filterFn(item, search));
  const selectedItem = options.find(item => item.id === value);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length, search]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex].id);
      }
    } else if (e.key === 'Tab' && search && filteredOptions.length === 0 && onCreateNew) {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  const handleCreate = async () => {
    if (onCreateNew && search) {
      const newItem = await onCreateNew(search);
      setSearch('');
      setOpen(false);

      // If the creation returned a new item, select it
      if (newItem && newItem.id) {
        onChange(newItem.id);

        // Move focus to next input (simulate Tab behavior)
        setTimeout(() => {
          const currentInput = inputRef.current;
          if (!currentInput) return;

          // Get all focusable elements in the document
          const focusableElements = document.querySelectorAll(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
          );

          const focusableArray = Array.from(focusableElements) as HTMLElement[];
          const currentIndex = focusableArray.indexOf(currentInput);

          // Find next focusable element
          if (currentIndex !== -1 && currentIndex < focusableArray.length - 1) {
            const nextElement = focusableArray[currentIndex + 1];
            nextElement.focus();
          }
        }, 100); // Small delay to ensure state updates
      }
    }
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={open ? search : (selectedItem ? displayFormat(selectedItem) : '')}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setSearch(''); // Clear search to show all options
              setOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        <Search className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>

      {open && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((item, index) => (
              <div
                key={item.id}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  index === highlightedIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                } ${item.id === value ? 'text-blue-600 font-medium' : ''}`}
                onClick={() => handleSelect(item.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {displayFormat(item)}
              </div>
            ))
          ) : search && onCreateNew ? (
            <div
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-blue-600 flex items-center gap-2 transition-colors"
              onClick={handleCreate}
            >
              <Plus className="h-4 w-4" />
              <span>Create "{search}" (or press Tab)</span>
            </div>
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              {search ? 'No results found' : 'No options available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
