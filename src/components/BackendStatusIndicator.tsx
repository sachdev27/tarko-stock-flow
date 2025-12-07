import { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const BackendStatusIndicator = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          setIsConnected(data.status === 'healthy');
        } else {
          setIsConnected(false);
        }
        setLastChecked(new Date());
      } catch (error) {
        console.error('Backend health check failed:', error);
        setIsConnected(false);
        setLastChecked(new Date());
      }
    };

    // Check immediately on mount
    checkConnection();

    // Then check every 10 seconds
    const interval = setInterval(checkConnection, 10000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center space-x-2 cursor-pointer">
          <div
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              isConnected
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
            }`}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <div className="text-xs space-y-1">
          <div className="font-medium">
            Backend: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="text-muted-foreground">
            Last checked: {formatTime(lastChecked)}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
