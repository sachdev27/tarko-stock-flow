import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sync, SyncConfig, SyncConfigResponse, SyncHistoryItem, SyncStatus } from '@/lib/sync-api';
import { toast } from 'sonner';

export const useSyncStatus = (refetchInterval?: number) => {
  return useQuery<SyncStatus>({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const response = await sync.getStatus();
      return response.data;
    },
    refetchInterval: refetchInterval || 5000, // Refresh every 5 seconds by default
  });
};

export const useSyncConfigs = () => {
  return useQuery<SyncConfigResponse[]>({
    queryKey: ['sync-configs'],
    queryFn: async () => {
      const response = await sync.getConfigs();
      return response.data;
    },
  });
};

export const useCreateSyncConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SyncConfig) => sync.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      toast.success('Sync configuration created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create sync configuration');
    },
  });
};

export const useUpdateSyncConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SyncConfig> }) => sync.updateConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      toast.success('Sync configuration updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update sync configuration');
    },
  });
};

export const useDeleteSyncConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sync.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      toast.success('Sync configuration deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete sync configuration');
    },
  });
};

export const useTestSyncConfig = () => {
  return useMutation({
    mutationFn: (id: string) => sync.testConfig(id),
    onSuccess: (response) => {
      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Connection test failed');
    },
  });
};

export const useTriggerSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configId: string) => sync.triggerSync(configId),
    onSuccess: (response) => {
      if (response.data.success) {
        toast.success(`Sync completed: ${response.data.files_synced} files synced`);
      } else {
        toast.error(`Sync failed: ${response.data.error}`);
      }
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to trigger sync');
    },
  });
};

export const useSyncHistory = (params?: { limit?: number; config_id?: string }) => {
  return useQuery<SyncHistoryItem[]>({
    queryKey: ['sync-history', params],
    queryFn: async () => {
      const response = await sync.getHistory(params);
      return response.data;
    },
  });
};
