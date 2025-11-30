import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilterX } from 'lucide-react';
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

  const clearFilters = () => {
    setAuditUserFilter('');
    setAuditActionFilter('');
    setAuditSearchTerm('');
    setAuditTimePreset('all');
    setAuditStartDate('');
    setAuditEndDate('');
  };

  const hasActiveFilters = auditUserFilter || auditActionFilter || auditSearchTerm || auditTimePreset !== 'all';

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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">Filters</h3>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs"
              >
                <FilterX className="h-3 w-3 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
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
                  <SelectItem value="PRODUCTION">Production</SelectItem>
                  <SelectItem value="DISPATCH">Dispatch</SelectItem>
                  <SelectItem value="RETURN">Return</SelectItem>
                  <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                  <SelectItem value="SPLIT_BUNDLE">Split Bundle</SelectItem>
                  <SelectItem value="COMBINE_SPARES">Combine Spares</SelectItem>
                  <SelectItem value="EDIT_ROLL">Edit Roll</SelectItem>
                  <SelectItem value="DELETE_BATCH">Delete Batch</SelectItem>
                  <SelectItem value="CREATE_USER">Create User</SelectItem>
                  <SelectItem value="UPDATE_USER">Update User</SelectItem>
                  <SelectItem value="DELETE_USER">Delete User</SelectItem>
                  <SelectItem value="USER_LOGIN">User Login</SelectItem>
                  <SelectItem value="SNAPSHOT_CREATE">Snapshot Create</SelectItem>
                  <SelectItem value="ROLLBACK">Rollback</SelectItem>
                  <SelectItem value="DATABASE_RESET">Database Reset</SelectItem>
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
                {/* Header Row - WHO & WHEN */}
                <div className="flex items-start justify-between mb-3 pb-3 border-b">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-primary">
                        {log.user_name || log.user_username || 'Unknown User'}
                      </span>
                      {log.user_email && (
                        <span className="text-xs text-muted-foreground">
                          ({log.user_email})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={
                          log.action_type === 'DISPATCH' ? 'destructive' :
                          log.action_type === 'RETURN' ? 'default' :
                          log.action_type === 'CREATE_BATCH' || log.action_type === 'PRODUCTION' ? 'default' :
                          log.action_type === 'CUT_ROLL' || log.action_type === 'SPLIT_BUNDLE' ? 'secondary' :
                          log.action_type === 'USER_LOGIN' ? 'outline' :
                          log.action_type === 'DATABASE_RESET' || log.action_type === 'DELETE_BATCH' ? 'destructive' :
                          log.action_type === 'REVERT_INVENTORY_TRANSACTION' || log.action_type === 'ROLLBACK' ? 'destructive' :
                          'outline'
                        }
                        className="text-xs font-medium"
                      >
                        {log.action_type.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {log.entity_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-foreground whitespace-nowrap">
                      {(() => {
                        const date = new Date(log.created_at);
                        return date.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        });
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {(() => {
                        const date = new Date(log.created_at);
                        return date.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* WHAT - Description */}
                <div className="text-sm mb-3 font-medium">
                  {log.description}
                </div>

                {/* HOW MUCH - Detailed Information Grid */}
                <div className="space-y-2">
                  {/* Primary Metrics - Always Visible */}
                  {(log.quantity_change || log.customer_name || log.batch_code || log.invoice_no ||
                    (log.after_data && typeof log.after_data === 'object')) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {/* Quantity Change - Highlighted */}
                      {log.quantity_change && (
                        <div className="p-2 bg-primary/10 rounded border border-primary/20">
                          <div className="text-muted-foreground text-[10px] uppercase">Quantity</div>
                          <div className="font-bold text-primary">
                            {log.quantity_change > 0 ? '+' : ''}
                            {parseFloat(log.quantity_change).toFixed(2)} m
                          </div>
                        </div>
                      )}

                      {/* Customer Name */}
                      {log.customer_name && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Customer</div>
                          <div className="font-medium">{log.customer_name}</div>
                        </div>
                      )}

                      {/* Invoice Number */}
                      {log.invoice_no && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Invoice</div>
                          <div className="font-medium">{log.invoice_no}</div>
                        </div>
                      )}

                      {/* Batch Code */}
                      {log.batch_code && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Batch</div>
                          <div className="font-medium">{log.batch_code}</div>
                        </div>
                      )}

                      {/* Batch Code */}
                      {log.batch_code && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Batch</div>
                          <div className="font-medium">{log.batch_code}</div>
                        </div>
                      )}

                      {/* Parse after_data for additional details */}
                      {log.after_data && typeof log.after_data === 'object' && (() => {
                        const afterData = typeof log.after_data === 'string'
                          ? JSON.parse(log.after_data)
                          : log.after_data;

                        return (
                          <>
                            {afterData.dispatch_number && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground text-[10px] uppercase">Dispatch #</div>
                                <div className="font-medium">{afterData.dispatch_number}</div>
                              </div>
                            )}
                            {afterData.total_items && (
                              <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                                <div className="text-muted-foreground text-[10px] uppercase">Total Items</div>
                                <div className="font-bold text-blue-600">{afterData.total_items}</div>
                              </div>
                            )}
                            {afterData.item_count && (
                              <div className="p-2 bg-background rounded border">
                                <div className="text-muted-foreground text-[10px] uppercase">Item Count</div>
                                <div className="font-medium">{afterData.item_count}</div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Secondary Details */}
                  {(rollSnapshot?.weight_kg || rollSnapshot?.product_type || rollSnapshot?.brand ||
                    (log.roll_length || log.roll_initial_length) ||
                    (rollSnapshot?.parameters && Object.keys(rollSnapshot.parameters).length > 0)) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {/* Weight (from roll snapshot) */}
                      {rollSnapshot?.weight_kg && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Weight</div>
                          <div className="font-medium">
                            {parseFloat(rollSnapshot.weight_kg).toFixed(2)} kg
                          </div>
                        </div>
                      )}

                      {/* Roll Length */}
                      {(log.action_type === 'CUT_ROLL' && log.quantity_change) ? (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Cut Length</div>
                          <div className="font-medium">
                            {Math.abs(parseFloat(log.quantity_change)).toFixed(2)} m
                          </div>
                        </div>
                      ) : (log.roll_length || log.roll_initial_length) ? (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Roll Length</div>
                          <div className="font-medium">
                            {parseFloat(log.roll_length || log.roll_initial_length).toFixed(2)} m
                          </div>
                        </div>
                      ) : null}

                      {/* Product Info from snapshot */}
                      {rollSnapshot?.product_type && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Product</div>
                          <div className="font-medium">{rollSnapshot.product_type}</div>
                        </div>
                      )}

                      {/* Brand from snapshot */}
                      {rollSnapshot?.brand && (
                        <div className="p-2 bg-background rounded border">
                          <div className="text-muted-foreground text-[10px] uppercase">Brand</div>
                          <div className="font-medium">{rollSnapshot.brand}</div>
                        </div>
                      )}

                      {/* Parameters from snapshot */}
                      {rollSnapshot?.parameters && Object.keys(rollSnapshot.parameters).length > 0 && (
                        <div className="p-2 bg-background rounded border col-span-2">
                          <div className="text-muted-foreground text-[10px] uppercase mb-1">Parameters</div>
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
                  )}
                </div>
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground space-y-2">
                <p className="text-lg font-medium">No audit logs found</p>
                {hasActiveFilters && (
                  <p className="text-sm">Try adjusting your filters or <button onClick={clearFilters} className="text-primary hover:underline">clear all filters</button></p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AuditLogsTab;
