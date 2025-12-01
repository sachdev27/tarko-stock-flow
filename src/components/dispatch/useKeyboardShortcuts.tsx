import { useEffect } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export const useKeyboardShortcuts = ({ shortcuts, enabled = true }: UseKeyboardShortcutsProps) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      shortcuts.forEach((shortcut) => {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [shortcuts, enabled]);
};

export const KeyboardShortcutsHelp = ({ shortcuts }: { shortcuts: KeyboardShortcut[] }) => {
  const formatShortcut = (shortcut: KeyboardShortcut) => {
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    parts.push(shortcut.key.toUpperCase());
    return parts.join('+');
  };

  return (
    <div className="text-sm text-gray-600 flex flex-wrap gap-2">
      <span className="font-medium">Shortcuts:</span>
      {shortcuts.map((shortcut, idx) => (
        <span key={idx} className="inline-flex items-center gap-1">
          <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
            {formatShortcut(shortcut)}
          </kbd>
          <span className="text-xs">{shortcut.description}</span>
          {idx < shortcuts.length - 1 && <span className="text-gray-400">•</span>}
        </span>
      ))}
    </div>
  );
};
