import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AuditLogsTabProps {
  auditLogs: any[];
  users: any[];
}

const AuditLogsTab: React.FC<AuditLogsTabProps> = ({ auditLogs, users }) => {
  const [auditUserFilter, setAuditUserFilter] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditSearchTerm, setAuditSearchTerm] = useState<string>('');
  const [auditTimePreset, setAuditTimePreset] = useState<string>('all');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');

  const filteredLogs = auditLogs.filter(log => {
    // User filter
    if (auditUserFilter && auditUserFilter !== 'all' && log.user_id !== auditUserFilter) {
      return false;
    }

    // Action filter
    if (auditActionFilter && auditActionFilter !== 'all' && log.action_type !== auditActionFilter) {
      return false;
    }

    // Time filter
    const logDate = new Date(log.created_at);
    const now = new Date();

    if (auditTimePreset === 'today') {
      const todayStart = new Date(now.setHours(0, 0, 0, 0));
      if (logDate < todayStart) return false;
    } else if (auditTimePreset === 'yesterday') {
      const yesterdayStart = new Date(now.setHours(0, 0, 0, 0));
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
      if (logDate < yesterdayStart || logDate >= yesterdayEnd) return false;
    } else if (auditTimePreset === 'last7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (logDate < sevenDaysAgo) return false;
    } else if (auditTimePreset === 'last30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (logDate < thirtyDaysAgo) return false;
    } else if (auditTimePreset === 'thisMonth') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      if (logDate < monthStart) return false;
    } else if (auditTimePreset === 'lastMonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      if (logDate < lastMonthStart || logDate >= lastMonthEnd) return false;
    } else if (auditTimePreset === 'custom') {
      if (auditStartDate && logDate < new Date(auditStartDate)) return false;
      if (auditEndDate && logDate > new Date(auditEndDate)) return false;
    }

    // Search filter
    if (auditSearchTerm) {
      const searchLower = auditSearchTerm.toLowerCase();
      const searchableText = [
        log.description,
        log.user_name,
        log.customer_name,
        log.batch_code,
        log.invoice_no,
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchableText.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Audit Logs</CardTitle>
            <CardDescription>System activity and change history</CardDescription>
          </div>
          <Badge variant="secondary" className="text-sm">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'log' : 'logs'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Row 1: User, Action, Search */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Filter by User</Label>
              <Select value={auditUserFilter} onValueChange={setAuditUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Filter by Action</Label>
              <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE_BATCH">Create Batch</SelectItem>
                  <SelectItem value="DISPATCH">Dispatch</SelectItem>
                  <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                  <SelectItem value="EDIT_ROLL">Edit Roll</SelectItem>
                  <SelectItem value="DELETE_BATCH">Delete Batch</SelectItem>
                  <SelectItem value="USER_LOGIN">User Login</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search logs..."
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Time Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Time Period</Label>
              <Select
                value={auditTimePreset}
                onValueChange={(value) => {
                  setAuditTimePreset(value);
                  if (value !== 'custom') {
                    setAuditStartDate('');
                    setAuditEndDate('');
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 Days</SelectItem>
                  <SelectItem value="last30days">Last 30 Days</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {auditTimePreset === 'custom' && (
              <>
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={auditStartDate}
                    onChange={(e) => setAuditStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="datetime-local"
                    value={auditEndDate}
                    onChange={(e) => setAuditEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Audit Logs List */}
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            // Parse roll snapshot for weight info
            let rollSnapshot: any = null;
            if (log.roll_snapshot) {
              try {
                rollSnapshot = typeof log.roll_snapshot === 'string'
                  ? JSON.parse(log.roll_snapshot)
                  : log.roll_snapshot;
              } catch (e) {
                // Ignore parse errors
              }
            }

            return (
              <div
                key={log.id}
                className="p-4 bg-secondary/20 rounded-lg border hover:border-primary/50 transition-colors"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={
                        log.action_type === 'DISPATCH' ? 'destructive' :
                        log.action_type === 'CREATE_BATCH' ? 'default' :
                        log.action_type === 'CUT_ROLL' ? 'secondary' :
                        'outline'
                      }
                      className="text-xs"
                    >
                      {log.action_type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {log.entity_type}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {(() => {
                      const date = new Date(log.created_at);
                      return `${date.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })} ${date.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}`;
                    })()}
                  </span>
                </div>

                {/* User Info */}
                <div className="mb-2">
                  <span className="text-sm font-semibold text-primary">
                    {log.user_name || log.user_username || 'Unknown User'}
                  </span>
                  {log.user_email && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({log.user_email})
                    </span>
                  )}
                </div>

                {/* Description */}
                <div className="text-sm mb-2">
                  {log.description}
                </div>

                {/* Detailed Information Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                  {/* Customer Name */}
                  {log.customer_name && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Customer</div>
                      <div className="font-medium">{log.customer_name}</div>
                    </div>
                  )}

                  {/* Invoice Number */}
                  {log.invoice_no && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Invoice</div>
                      <div className="font-medium">{log.invoice_no}</div>
                    </div>
                  )}

                  {/* Batch Code */}
                  {log.batch_code && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Batch</div>
                      <div className="font-medium">{log.batch_code}</div>
                    </div>
                  )}

                  {/* Quantity */}
                  {log.quantity_change && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Quantity</div>
                      <div className="font-medium">
                        {log.quantity_change > 0 ? '+' : ''}
                        {parseFloat(log.quantity_change).toFixed(2)} m
                      </div>
                    </div>
                  )}

                  {/* Weight (from roll snapshot) */}
                  {rollSnapshot?.weight_kg && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Weight</div>
                      <div className="font-medium">
                        {parseFloat(rollSnapshot.weight_kg).toFixed(2)} kg
                      </div>
                    </div>
                  )}

                  {/* Roll Length */}
                  {(log.action_type === 'CUT_ROLL' && log.quantity_change) ? (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Cut Length</div>
                      <div className="font-medium">
                        {Math.abs(parseFloat(log.quantity_change)).toFixed(2)} m
                      </div>
                    </div>
                  ) : (log.roll_length || log.roll_initial_length) ? (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Roll Length</div>
                      <div className="font-medium">
                        {parseFloat(log.roll_length || log.roll_initial_length).toFixed(2)} m
                      </div>
                    </div>
                  ) : null}

                  {/* Product Info from snapshot */}
                  {rollSnapshot?.product_type && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Product</div>
                      <div className="font-medium">{rollSnapshot.product_type}</div>
                    </div>
                  )}

                  {/* Brand from snapshot */}
                  {rollSnapshot?.brand && (
                    <div className="p-2 bg-background rounded border">
                      <div className="text-muted-foreground">Brand</div>
                      <div className="font-medium">{rollSnapshot.brand}</div>
                    </div>
                  )}

                  {/* Parameters from snapshot */}
                  {rollSnapshot?.parameters && Object.keys(rollSnapshot.parameters).length > 0 && (
                    <div className="p-2 bg-background rounded border col-span-2">
                      <div className="text-muted-foreground mb-1">Parameters</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(rollSnapshot.parameters).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {key}: {String(value)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No audit logs found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AuditLogsTab;
