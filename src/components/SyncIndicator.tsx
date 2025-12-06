import React, { useState } from 'react';
import { useSyncStatus, useTriggerSync } from '@/hooks/useSync';
import { SyncStatusConfig } from '@/lib/sync-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Cloud, CloudOff, RefreshCw, Settings, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const SyncIndicator = () => {
  const { data: status, isLoading } = useSyncStatus(5000); // Refresh every 5 seconds
  const triggerSync = useTriggerSync();
  const navigate = useNavigate();
  const [syncingIds, setSyncingIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tarko_syncing');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Helper to persist syncing ids
  const persistSyncing = (ids: string[]) => {
    try {
      localStorage.setItem('tarko_syncing', JSON.stringify(ids));
    } catch {}
  };

  // Clear syncing ids when server reports status no longer running
  React.useEffect(() => {
    if (!status || !status.configs) return;

    const stillRunning = new Set<string>();
    status.configs.forEach((c) => {
      if (c.last_sync_status === 'running') stillRunning.add(c.id);
    });

    // Keep only ids that are still running according to server
    const next = (syncingIds || []).filter((id) => stillRunning.has(id));
    if (next.length !== (syncingIds || []).length) {
      setSyncingIds(next);
      persistSyncing(next);
    }
  }, [status, syncingIds]);

  if (isLoading || !status) return null;

  const hasConfigs = status.configs && status.configs.length > 0;
  const allSynced = status.all_synced;
  const anyAutoSync = status.any_auto_sync_enabled;

  // Determine icon and color based on status
  const getStatusIcon = () => {
    if (!hasConfigs) {
      return <CloudOff className="h-4 w-4 text-muted-foreground" />;
    }

    if (syncingIds && syncingIds.length > 0) {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }

    if (allSynced) {
      return <Cloud className="h-4 w-4 text-green-500" />;
    }

    return <Cloud className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusBadge = () => {
    if (!hasConfigs) return null;

    if (syncingIds && syncingIds.length > 0) {
      return (
        <Badge variant="outline" className="ml-2 text-xs">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Syncing
        </Badge>
      );
    }

    if (allSynced) {
      return (
        <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Synced
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="ml-2 text-xs text-yellow-600 border-yellow-600">
        Pending
      </Badge>
    );
  };

  const handleSync = async (configId: string) => {
    // mark as syncing and persist
    const next = Array.from(new Set([...(syncingIds || []), configId]));
    setSyncingIds(next);
    persistSyncing(next);

    try {
      await triggerSync.mutateAsync(configId);
    } catch (err) {
      // Leave entry for status polling to clear when failed
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {getStatusIcon()}
          {getStatusBadge()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Sync Status</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/sync-settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!hasConfigs ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            <CloudOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sync configured</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate('/admin/sync-settings')}
              className="mt-2"
            >
              Configure Sync
            </Button>
          </div>
        ) : (
          <>
            {anyAutoSync && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="h-3 w-3" />
                  <span>Auto-sync enabled</span>
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto">
              {status.configs.map((config: SyncStatusConfig) => (
                <DropdownMenuItem
                  key={config.id}
                  className="flex items-start gap-2 py-3"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{config.name}</span>
                      {config.is_synced ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-yellow-500" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {config.sync_type.toUpperCase()}
                        </Badge>
                        {config.auto_sync_enabled && (
                          <Badge variant="outline" className="text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                      {config.last_sync_at ? (
                        <span>
                          Last: {formatDistanceToNow(new Date(config.last_sync_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span>Never synced</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={syncingIds.includes(config.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSync(config.id);
                    }}
                  >
                    {syncingIds.includes(config.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuItem>
              ))}
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/admin/sync-settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Manage Sync Settings
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
