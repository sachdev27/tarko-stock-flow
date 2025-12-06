import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupConfig } from '@/lib/api-typed';
import type * as API from '@/types';
import { toast } from 'sonner';

// Cloud Credentials
export const useCloudCredentials = () => {
  return useQuery({
    queryKey: ['cloud-credentials'],
    queryFn: async () => {
      const response = await backupConfig.getCloudCredentials();
      return response.data;
    },
  });
};

export const useAddCloudCredential = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => backupConfig.addCloudCredential(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-credentials'] });
      toast.success('Cloud credentials added successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add credentials');
    },
  });
};

export const useUpdateCloudCredential = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      backupConfig.updateCloudCredential(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-credentials'] });
      toast.success('Cloud credentials updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update credentials');
    },
  });
};

export const useDeleteCloudCredential = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupConfig.deleteCloudCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-credentials'] });
      toast.success('Cloud credentials deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete credentials');
    },
  });
};

// Retention Policies
export const useRetentionPolicies = () => {
  return useQuery({
    queryKey: ['retention-policies'],
    queryFn: async () => {
      const response = await backupConfig.getRetentionPolicies();
      return response.data;
    },
  });
};

export const useUpdateRetentionPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      backupConfig.updateRetentionPolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-policies'] });
      toast.success('Retention policy updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update policy');
    },
  });
};

// Archive Buckets
export const useArchiveBuckets = () => {
  return useQuery({
    queryKey: ['archive-buckets'],
    queryFn: async () => {
      const response = await backupConfig.getArchiveBuckets();
      return response.data;
    },
  });
};

export const useAddArchiveBucket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => backupConfig.addArchiveBucket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive-buckets'] });
      toast.success('Archive bucket added successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add archive bucket');
    },
  });
};

// Archived Backups
export const useArchivedBackups = () => {
  return useQuery({
    queryKey: ['archived-backups'],
    queryFn: async () => {
      const response = await backupConfig.getArchivedBackups();
      return response.data;
    },
  });
};

export const useArchiveBackup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bucketId, data }: { bucketId: string; data: any }) =>
      backupConfig.archiveBackup(bucketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archived-backups'] });
      toast.success('Backup archived successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to archive backup');
    },
  });
};

// Deletion Log
export const useDeletionLog = (limit = 100) => {
  return useQuery({
    queryKey: ['deletion-log', limit],
    queryFn: async () => {
      const response = await backupConfig.getDeletionLog(limit);
      return response.data;
    },
  });
};
