import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Activity, ArrowDownCircle, ArrowUpCircle, Eye, RefreshCw, TrendingUp, ChevronDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ledger as ledgerAPI } from '@/lib/api-typed';
import type * as API from '@/types';
import { SearchableCombobox } from '@/components/dispatch/SearchableCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface LedgerVariantOption {
  productVariantId: API.UUID;
  productTypeName: string;
  brandName: string;
  parameters: Record<string, unknown>;
}

interface ProductLedgerTabProps {
  variants: LedgerVariantOption[];
}

interface DateRangeState {
  startDate: string;
  endDate: string;
}

const chartColors = {
  balance: '#2563eb',
  produced: '#16a34a',
  dispatched: '#dc2626',
  returned: '#7c3aed',
  scrapped: '#ea580c',
};

const formatNumber = (value: number | string | undefined | null) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const inferBaseUnit = (productTypeName?: string) => {
  const label = (productTypeName || '').toLowerCase();
  return label.includes('hdpe') ? 'm' : 'pcs';
};

const dispatchUnitByItemType = (itemType: string) => {
  switch ((itemType || '').toUpperCase()) {
    case 'FULL_ROLL':
    case 'CUT_ROLL':
      return 'roll';
    case 'BUNDLE':
      return 'bundle';
    case 'SPARE_PIECES':
    case 'CUT_PIECE':
      return 'pcs';
    default:
      return 'unit';
  }
};

const pluralizeUnit = (unit: string, value: number) => {
  if (unit === 'm') return 'm';
  return Math.abs(value) === 1 ? unit : `${unit}s`;
};

const formatWithUnit = (value: number | string | undefined | null, unit: string) => {
  const n = Number(value || 0);
  return `${formatNumber(n)} ${pluralizeUnit(unit, n)}`;
};

const LENGTH_SCALES = [
  { unit: 'm', factor: 1 },
  { unit: 'km', factor: 1000 },
  { unit: 'Mm', factor: 1_000_000 },
];

const formatAdaptiveWithUnit = (
  value: number | string | undefined | null,
  unit: string,
  options?: { showBaseForScaled?: boolean }
) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return `0 ${unit}`;

  if (unit !== 'm') {
    return formatWithUnit(n, unit);
  }

  const abs = Math.abs(n);
  let selected = LENGTH_SCALES[0];
  for (const scale of LENGTH_SCALES) {
    if (abs >= scale.factor) {
      selected = scale;
    }
  }

  const scaledValue = n / selected.factor;
  const scaledText = `${formatNumber(scaledValue)} ${selected.unit}`;

  if (selected.unit !== 'm' && options?.showBaseForScaled) {
    return `${scaledText} (${formatNumber(n)} m)`;
  }

  return scaledText;
};

const getRangeDefaults = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
};

const toRangeISO = (date: string, endOfDay = false) => {
  if (!date) return undefined;
  const suffix = endOfDay ? 'T23:59:59' : 'T00:00:00';
  return `${date}${suffix}`;
};

const paddedDomain: [(dataMin: number) => number, (dataMax: number) => number] = [
  (dataMin: number) => {
    const min = Number.isFinite(dataMin) ? dataMin : 0;
    const pad = Math.max(10, Math.abs(min) * 0.1);
    return Math.min(0, min - pad);
  },
  (dataMax: number) => {
    const max = Number.isFinite(dataMax) ? dataMax : 0;
    const pad = Math.max(10, Math.abs(max) * 0.1);
    return max + pad;
  },
];

const LEDGER_VARIANT_STORAGE_KEY = 'inventory-ledger:selected-variant-id';

const readParamValue = (parameters: Record<string, unknown>, key: string) => {
  const direct = parameters[key];
  if (direct !== undefined && direct !== null) return String(direct).trim();
  const alt = parameters[key.toLowerCase()];
  if (alt !== undefined && alt !== null) return String(alt).trim();
  return '';
};

const toNumberIfPossible = (value: string) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
};

const ProductLedgerTab = ({ variants }: ProductLedgerTabProps) => {
  const [selectedVariantId, setSelectedVariantId] = useState<API.UUID>(() => {
    if (typeof window === 'undefined') return '';
    return (window.localStorage.getItem(LEDGER_VARIANT_STORAGE_KEY) || '') as API.UUID;
  });
  const [granularity, setGranularity] = useState<API.LedgerGranularity>('day');
  const [events, setEvents] = useState<API.ProductLedgerEvent[]>([]);
  const [timeseries, setTimeseries] = useState<API.ProductLedgerTimeseriesPoint[]>([]);
  const [summary, setSummary] = useState<API.ProductLedgerEventsResponse['summary'] | null>(null);
  const [currentStock, setCurrentStock] = useState<API.ProductLedgerCurrentStockResponse | null>(null);
  const [baseUnit, setBaseUnit] = useState<'m' | 'pcs'>('m');
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRangeState>(getRangeDefaults);
  const [selectedEvent, setSelectedEvent] = useState<API.ProductLedgerEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [eventDetails, setEventDetails] = useState<API.ProductLedgerEventDetailsResponse | null>(null);
  const [eventDetailsCache, setEventDetailsCache] = useState<Record<string, API.ProductLedgerEventDetailsResponse>>({});
  const [dispatchDestinationsExpanded, setDispatchDestinationsExpanded] = useState(false);

  const variantComboboxOptions = useMemo(() => {
    return variants
      .map((variant) => ({
        id: variant.productVariantId,
        productTypeName: variant.productTypeName,
        brandName: variant.brandName,
        parameters: variant.parameters,
      }))
      .sort((a, b) => {
        const typeCmp = a.productTypeName.localeCompare(b.productTypeName, undefined, { sensitivity: 'base' });
        if (typeCmp !== 0) return typeCmp;

        const brandCmp = a.brandName.localeCompare(b.brandName, undefined, { sensitivity: 'base' });
        if (brandCmp !== 0) return brandCmp;

        const aOd = readParamValue(a.parameters, 'OD');
        const bOd = readParamValue(b.parameters, 'OD');
        const odNumCmp = toNumberIfPossible(aOd) - toNumberIfPossible(bOd);
        if (odNumCmp !== 0 && Number.isFinite(odNumCmp)) return odNumCmp;
        const odCmp = aOd.localeCompare(bOd, undefined, { sensitivity: 'base' });
        if (odCmp !== 0) return odCmp;

        const aPn = readParamValue(a.parameters, 'PN');
        const bPn = readParamValue(b.parameters, 'PN');
        const pnNumCmp = toNumberIfPossible(aPn) - toNumberIfPossible(bPn);
        if (pnNumCmp !== 0 && Number.isFinite(pnNumCmp)) return pnNumCmp;
        const pnCmp = aPn.localeCompare(bPn, undefined, { sensitivity: 'base' });
        if (pnCmp !== 0) return pnCmp;

        const aPe = readParamValue(a.parameters, 'PE');
        const bPe = readParamValue(b.parameters, 'PE');
        const peNumCmp = toNumberIfPossible(aPe) - toNumberIfPossible(bPe);
        if (peNumCmp !== 0 && Number.isFinite(peNumCmp)) return peNumCmp;
        return aPe.localeCompare(bPe, undefined, { sensitivity: 'base' });
      });
  }, [variants]);

  useEffect(() => {
    if (variants.length === 0) {
      setSelectedVariantId('');
      return;
    }

    const exists = variants.some((v) => v.productVariantId === selectedVariantId);
    if (!exists) {
      const fallbackId = variantComboboxOptions[0]?.id || variants[0].productVariantId;
      setSelectedVariantId(fallbackId as API.UUID);
    }
  }, [variants, variantComboboxOptions, selectedVariantId]);

  useEffect(() => {
    if (!selectedVariantId || typeof window === 'undefined') return;
    window.localStorage.setItem(LEDGER_VARIANT_STORAGE_KEY, selectedVariantId);
  }, [selectedVariantId]);

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.productVariantId === selectedVariantId),
    [variants, selectedVariantId]
  );

  const chartData = useMemo(
    () =>
      (timeseries || []).map((point) => ({
        ...point,
        total_in: Number(point.total_in || 0),
        total_out: Number(point.total_out || 0),
        net_change: Number(point.net_change || 0),
        produced: Number(point.produced || 0),
        dispatched: Number(point.dispatched || 0),
        returned: Number(point.returned || 0),
        scrapped: Number(point.scrapped || 0),
        transformed_out: Number(point.transformed_out || 0),
        running_balance: Number(point.running_balance || 0),
      })),
    [timeseries]
  );

  const formatVariantLabel = (option: { id: string; productTypeName: string; brandName: string; parameters: Record<string, unknown> }) => {
    return `${option.productTypeName} | ${option.brandName} | ${Object.entries(option.parameters)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(', ')}`;
  };

  const getEventSummaryText = (event: API.ProductLedgerEvent) => {
    const meta = (event.meta || {}) as Record<string, unknown>;
    const eventType = (event.event_type || '').toUpperCase();

    const asText = (value: unknown) => (value === null || value === undefined ? '' : String(value));
    const itemType = asText(meta.item_type);
    const customerName = asText(meta.customer_name);
    const invoiceNo = asText(meta.invoice_number);
    const noteText = asText(event.notes);
    const mixedProducts = Boolean(meta.mixed_products);

    const shortParts: string[] = [];

    if (eventType.includes('DISPATCH')) {
      const dispatchUnit = dispatchUnitByItemType(itemType);
      const dispatchQty = Number(meta.piece_count || meta.quantity || event.quantity_out || 0);
      shortParts.push(`Dispatched ${formatWithUnit(dispatchQty, dispatchUnit)}`);
      if (mixedProducts) shortParts.push('Mixed dispatch');
      const totalLength = Number(meta.length_meters_total || meta.length_meters || 0);
      if (totalLength) shortParts.push(`length=${formatNumber(totalLength)} m`);
      if (customerName) shortParts.push(`Customer: ${customerName}`);
      if (invoiceNo) shortParts.push(`Invoice: ${invoiceNo}`);
    } else if (eventType.includes('PRODUCTION')) {
      shortParts.push(`Produced ${formatAdaptiveWithUnit(event.quantity_in, inferBaseUnit(selectedVariant?.productTypeName), { showBaseForScaled: true })}`);
    } else if (eventType.includes('CUT_ROLL')) {
      const fromStockType = asText(meta.from_stock_type);
      const toStockType = asText(meta.to_stock_type);
      shortParts.push(`Cut roll: +${formatNumber(event.quantity_in)} (${toStockType || 'to'}) / -${formatNumber(event.quantity_out)} (${fromStockType || 'from'})`);
    } else if (eventType.includes('SPLIT_BUNDLE')) {
      shortParts.push(`Split bundle: +${formatNumber(event.quantity_in)} / -${formatNumber(event.quantity_out)}`);
    } else if (eventType.includes('COMBINE_SPARES')) {
      shortParts.push(`Combined spares: +${formatNumber(event.quantity_in)} / -${formatNumber(event.quantity_out)}`);
    } else if (eventType.includes('RETURN')) {
      const returnUnit = itemType ? dispatchUnitByItemType(itemType) : inferBaseUnit(selectedVariant?.productTypeName);
      shortParts.push(`Returned ${formatWithUnit(event.quantity_in, returnUnit)}`);
      if (customerName) shortParts.push(`From: ${customerName}`);
    } else if (eventType.includes('SCRAP')) {
      const scrapUnit = itemType ? dispatchUnitByItemType(itemType) : inferBaseUnit(selectedVariant?.productTypeName);
      shortParts.push(`Scrapped ${formatWithUnit(event.quantity_out, scrapUnit)}`);
      const reason = asText(meta.reason);
      if (reason) shortParts.push(`Reason: ${reason}`);
    }

    if (noteText) {
      shortParts.push(noteText.length > 80 ? `${noteText.slice(0, 80)}...` : noteText);
    }

    if (shortParts.length === 0) {
      return event.source_table || '-';
    }

    return shortParts.join(' | ');
  };

  const getEventDisplayValues = (event: API.ProductLedgerEvent) => {
    const meta = (event.meta || {}) as Record<string, unknown>;
    const eventType = (event.event_type || '').toUpperCase();
    const baseUnit = inferBaseUnit(selectedVariant?.productTypeName);
    const itemType = String(meta.item_type || meta.stock_type || '');

    let inUnit = baseUnit;
    let outUnit = baseUnit;

    if (eventType.includes('DISPATCH') || eventType.includes('RETURN') || eventType.includes('SCRAP')) {
      const itemUnit = itemType ? dispatchUnitByItemType(itemType) : baseUnit;
      inUnit = itemUnit;
      outUnit = itemUnit;
    } else if (eventType.includes('CUT_ROLL') || eventType.includes('SPLIT_BUNDLE') || eventType.includes('COMBINE_SPARES')) {
      const fromType = String(meta.from_stock_type || '').toUpperCase();
      const toType = String(meta.to_stock_type || '').toUpperCase();
      const mapStockUnit = (stockType: string) => {
        if (stockType === 'FULL_ROLL' || stockType === 'CUT_ROLL') return 'roll';
        if (stockType === 'BUNDLE') return 'bundle';
        if (stockType === 'SPARE') return 'pcs';
        return 'unit';
      };
      inUnit = mapStockUnit(toType);
      outUnit = mapStockUnit(fromType);
    }

    const inText = Number(event.quantity_in || 0) > 0 ? formatAdaptiveWithUnit(event.quantity_in, inUnit, { showBaseForScaled: true }) : '-';
    const outText = Number(event.quantity_out || 0) > 0 ? formatAdaptiveWithUnit(event.quantity_out, outUnit, { showBaseForScaled: true }) : '-';

    const changeValue = Number(event.signed_change || 0);
    let changeText = '-';
    if (changeValue > 0 && Number(event.quantity_out || 0) > 0 && inUnit !== outUnit) {
      changeText = `+${formatAdaptiveWithUnit(event.quantity_in, inUnit, { showBaseForScaled: true })} / -${formatAdaptiveWithUnit(event.quantity_out, outUnit, { showBaseForScaled: true })}`;
    } else if (changeValue > 0) {
      changeText = `+${formatAdaptiveWithUnit(changeValue, inUnit, { showBaseForScaled: true })}`;
    } else if (changeValue < 0) {
      changeText = `-${formatAdaptiveWithUnit(Math.abs(changeValue), outUnit, { showBaseForScaled: true })}`;
    }

    const baseChange = Number(event.base_signed_change || 0);
    const baseAbs = Math.abs(baseChange);
    const baseText = baseAbs > 0 ? `${baseChange > 0 ? '+' : '-'}${formatAdaptiveWithUnit(baseAbs, baseUnit, { showBaseForScaled: true })}` : '-';

    let outWithBase = outText;
    let changeWithBase = changeText;

    if (eventType.includes('DISPATCH') || eventType.includes('RETURN') || eventType.includes('SCRAP')) {
      if (baseAbs > 0) {
        outWithBase = outText === '-' ? '-' : `${outText} (${formatAdaptiveWithUnit(baseAbs, baseUnit, { showBaseForScaled: true })})`;
        changeWithBase = changeText === '-' ? baseText : `${changeText} (${baseText})`;
      }
    }

    return { inText, outText: outWithBase, changeText: changeWithBase, baseText };
  };

  const dispatchDestinations = useMemo(() => {
    const destinationMap = new Map<string, {
      name: string;
      eventCount: number;
      references: string[];
      totalRolls: number;
      totalPieces: number;
      totalLengthMeters: number;
      firstDispatchAt?: string;
      lastDispatchAt?: string;
    }>();

    events.forEach((event) => {
      const eventType = (event.event_type || '').toUpperCase();
      if (!eventType.includes('DISPATCH')) return;

      const meta = (event.meta || {}) as Record<string, unknown>;
      const name = String(meta.customer_name || 'Unknown customer');
      const itemType = String(meta.item_type || '').toUpperCase();
      const qty = Number(meta.quantity || 0);
      const pieceCount = Number(meta.piece_count || 0);
      const lengthMeters = Number(meta.length_meters_total || meta.length_meters || 0);

      const current = destinationMap.get(name) || {
        name,
        eventCount: 0,
        references: [],
        totalRolls: 0,
        totalPieces: 0,
        totalLengthMeters: 0,
      };
      current.eventCount += 1;
      current.totalLengthMeters += Number.isFinite(lengthMeters) ? lengthMeters : 0;

      if (itemType === 'FULL_ROLL' || itemType === 'CUT_ROLL') {
        current.totalRolls += Number.isFinite(qty) ? qty : 0;
      } else if (itemType === 'SPARE_PIECES' || itemType === 'CUT_PIECE') {
        current.totalPieces += Number.isFinite(pieceCount || qty) ? (pieceCount || qty) : 0;
      }

      if (!current.firstDispatchAt || new Date(event.event_time) < new Date(current.firstDispatchAt)) {
        current.firstDispatchAt = event.event_time;
      }
      if (!current.lastDispatchAt || new Date(event.event_time) > new Date(current.lastDispatchAt)) {
        current.lastDispatchAt = event.event_time;
      }

      const reference = String(event.reference_no || event.source_id || '').trim();
      if (reference && !current.references.includes(reference)) {
        current.references.push(reference);
      }

      destinationMap.set(name, current);
    });

    return Array.from(destinationMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 8);
  }, [events]);

  const openEventDetails = async (event: API.ProductLedgerEvent) => {
    const cacheKey = `${event.source_table}:${event.source_id}`;
    setSelectedEvent(event);
    setDetailsOpen(true);
    setEventDetails(null);

    if (!event.source_table || !event.source_id) {
      setEventDetails(null);
      return;
    }

    if (eventDetailsCache[cacheKey]) {
      setEventDetails(eventDetailsCache[cacheKey]);
      return;
    }

    setDetailsLoading(true);
    try {
      const details = await ledgerAPI.getEventDetails(event.source_table, event.source_id);
      setEventDetails(details);
      setEventDetailsCache((prev) => ({ ...prev, [cacheKey]: details }));
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      setEventDetails(null);
      toast.error('Failed to load ledger event details', {
        description: err.response?.data?.error || err.message || 'Unknown error',
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const fetchLedger = async (rangeOverride?: DateRangeState) => {
    if (!selectedVariantId) return;

    try {
      setLoading(true);
      const effectiveRange = rangeOverride || range;
      const startDate = toRangeISO(effectiveRange.startDate, false);
      const endDate = toRangeISO(effectiveRange.endDate, true);

      const [eventsResponse, timeseriesResponse, currentStockResponse] = await Promise.all([
        ledgerAPI.getProductEvents(selectedVariantId, {
          start_date: startDate,
          end_date: endDate,
          limit: 300,
        }),
        ledgerAPI.getProductTimeseries(selectedVariantId, {
          start_date: startDate,
          end_date: endDate,
          granularity,
        }),
        ledgerAPI.getCurrentStock(selectedVariantId),
      ]);

      setEvents(eventsResponse.events || []);
      setSummary(eventsResponse.summary || null);
      setBaseUnit(eventsResponse.base_unit === 'pcs' ? 'pcs' : 'm');
      setTimeseries(timeseriesResponse.points || []);
      setCurrentStock(currentStockResponse || null);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error('Failed to load product ledger', {
        description: err.response?.data?.error || err.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const drillDownToDate = async (bucketTime: string) => {
    const parsed = new Date(bucketTime);
    if (Number.isNaN(parsed.getTime())) return;

    const day = format(parsed, 'yyyy-MM-dd');
    const sameDayRange: DateRangeState = {
      startDate: day,
      endDate: day,
    };

    setRange(sameDayRange);
    await fetchLedger(sameDayRange);
    toast.info(`Showing ledger for ${format(parsed, 'dd MMM yyyy')}`);
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantId, granularity]);

  if (variants.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12 text-center text-muted-foreground">
          No product variants found for current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Activity className="h-4 w-4" />
            Product Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1 xl:col-span-2">
              <Label>Product Variant</Label>
              <SearchableCombobox
                value={selectedVariantId}
                onChange={(value) => setSelectedVariantId(value as API.UUID)}
                options={variantComboboxOptions}
                placeholder="Search product variant (product, brand, OD, PN, PE, UUID)..."
                displayFormat={formatVariantLabel}
                searchFields={['id', 'productTypeName', 'brandName']}
                filterFn={(item, search) => {
                  const searchLower = search.toLowerCase().trim();
                  if (!searchLower) return true;

                  const rawTokens = searchLower.split(',').map((token) => token.trim()).filter(Boolean);
                  const parameters = item.parameters || {};
                  const od = String(parameters.OD ?? parameters.od ?? '').toLowerCase();
                  const pn = String(parameters.PN ?? parameters.pn ?? '').toLowerCase();
                  const pe = String(parameters.PE ?? parameters.pe ?? '').toLowerCase();

                  const paramText = Object.entries(item.parameters || {})
                    .map(([k, v]) => `${k}:${String(v)}`)
                    .join(' ')
                    .toLowerCase();

                  if (searchLower.includes(',') && rawTokens.length > 0) {
                    const [tokenOd, tokenPn, tokenPe, ...rest] = rawTokens;
                    if (tokenOd && !od.includes(tokenOd)) return false;
                    if (tokenPn && !pn.includes(tokenPn)) return false;
                    if (tokenPe && !pe.includes(tokenPe)) return false;

                    if (rest.length > 0) {
                      const fullText = `${item.id} ${item.productTypeName} ${item.brandName} ${paramText}`.toLowerCase();
                      return rest.every((token) => fullText.includes(token));
                    }

                    return true;
                  }

                  return (
                    item.id.toLowerCase().includes(searchLower) ||
                    item.productTypeName.toLowerCase().includes(searchLower) ||
                    item.brandName.toLowerCase().includes(searchLower) ||
                    paramText.includes(searchLower)
                  );
                }}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Start Date</Label>
                <button
                  type="button"
                  onClick={() => setRange((prev) => ({ ...prev, startDate: '' }))}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  From beginning
                </button>
              </div>
              <Input
                type="date"
                value={range.startDate}
                onChange={(e) => setRange((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <div className="text-[11px] text-muted-foreground">Suggestion: keep this empty to load ledger from the beginning.</div>
            </div>

            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={range.endDate}
                onChange={(e) => setRange((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Granularity</Label>
              <Select value={granularity} onValueChange={(value) => setGranularity(value as API.LedgerGranularity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Hourly</SelectItem>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { void fetchLedger(); }} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Apply
              </Button>
            </div>
          </div>

          {selectedVariant && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Showing ledger for <span className="font-medium text-foreground">{selectedVariant.productTypeName}</span>
              {' '}| {selectedVariant.brandName} | {Object.entries(selectedVariant.parameters)
                .map(([k, v]) => `${k}:${String(v)}`)
                .join(', ')}
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Opening ({baseUnit})</div>
                <div className="text-lg font-semibold">{formatAdaptiveWithUnit(summary.opening_balance, baseUnit, { showBaseForScaled: true })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Inflow ({baseUnit})</div>
                <div className="text-lg font-semibold text-emerald-600">+{formatAdaptiveWithUnit(summary.total_in, baseUnit, { showBaseForScaled: true })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Outflow ({baseUnit})</div>
                <div className="text-lg font-semibold text-red-600">-{formatAdaptiveWithUnit(summary.total_out, baseUnit, { showBaseForScaled: true })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Net ({baseUnit})</div>
                <div className="text-lg font-semibold">{formatAdaptiveWithUnit(summary.net_change, baseUnit, { showBaseForScaled: true })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Closing ({baseUnit})</div>
                <div className="text-lg font-semibold">{formatAdaptiveWithUnit(summary.closing_balance, baseUnit, { showBaseForScaled: true })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Events</div>
                <div className="text-lg font-semibold">{summary.event_count}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-3 text-xs text-muted-foreground">
              Reconciliation: {formatAdaptiveWithUnit(summary.opening_balance, baseUnit, { showBaseForScaled: true })} + {formatAdaptiveWithUnit(summary.total_in, baseUnit, { showBaseForScaled: true })} - {formatAdaptiveWithUnit(summary.total_out, baseUnit, { showBaseForScaled: true })} = {formatAdaptiveWithUnit(summary.closing_balance, baseUnit, { showBaseForScaled: true })}
            </CardContent>
          </Card>
        </div>
      )}

      {currentStock && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current Inventory Snapshot (Now)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">{(currentStock.base_unit || baseUnit) === 'm' ? 'Current Length' : 'Current Qty'}</div>
                <div className="text-sm font-semibold">{formatAdaptiveWithUnit(currentStock.total_quantity, currentStock.base_unit || baseUnit, { showBaseForScaled: true })}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">Full Roll</div>
                <div className="text-sm font-semibold">{formatNumber(currentStock.stock_counts.full_roll_count)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">Cut Roll</div>
                <div className="text-sm font-semibold">{formatNumber(currentStock.stock_counts.cut_roll_count)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">Bundle</div>
                <div className="text-sm font-semibold">{formatNumber(currentStock.stock_counts.bundle_count)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">Spare</div>
                <div className="text-sm font-semibold">{formatNumber(currentStock.stock_counts.spare_count)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[11px] text-muted-foreground">Cut Pieces</div>
                <div className="text-sm font-semibold">{formatNumber(currentStock.stock_counts.cut_piece_count)}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Ledger summary is date-range based. Snapshot shows live stock as of {format(new Date(currentStock.as_of), 'dd MMM yyyy HH:mm')}. {(currentStock.base_unit || baseUnit) === 'm' ? 'Length is derived from current stock composition (rolls/cut pieces).' : 'Quantity is derived from current stock composition.'}
            </div>

            {summary ? (() => {
              const liveUnit = currentStock.base_unit || baseUnit;
              const ledgerClosing = Number(summary.closing_balance || 0);
              const liveNow = Number(currentStock.total_quantity || 0);
              const gap = liveNow - ledgerClosing;
              const gapAbs = Math.abs(gap);

              return (
                <div className="mt-2 rounded border bg-muted/20 p-2 text-[11px]">
                  <span className="text-muted-foreground">Ledger closing vs live now: </span>
                  <span className="font-medium">{formatAdaptiveWithUnit(ledgerClosing, liveUnit, { showBaseForScaled: true })}</span>
                  <span className="text-muted-foreground"> vs </span>
                  <span className="font-medium">{formatAdaptiveWithUnit(liveNow, liveUnit, { showBaseForScaled: true })}</span>
                  <span className="text-muted-foreground"> (gap: </span>
                  <span className={`font-medium ${gap > 0 ? 'text-emerald-600' : gap < 0 ? 'text-red-600' : ''}`}>
                    {gap > 0 ? '+' : gap < 0 ? '-' : ''}{formatAdaptiveWithUnit(gapAbs, liveUnit, { showBaseForScaled: true })}
                  </span>
                  <span className="text-muted-foreground">)</span>
                </div>
              );
            })() : null}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Running Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket_time" tickFormatter={(value) => format(new Date(value), 'dd MMM')} interval="preserveStartEnd" />
                  <YAxis width={72} domain={paddedDomain} allowDataOverflow={false} tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatNumber(value), name]}
                    labelFormatter={(value) => format(new Date(value), 'dd MMM yyyy HH:mm')}
                  />
                  <Line type="linear" dataKey="running_balance" stroke={chartColors.balance} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produced / Dispatched / Returned / Scrapped</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-[11px] text-muted-foreground">Tip: click any bar/date bucket to filter ledger to that specific day.</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 16, bottom: 8 }}
                  onClick={(state) => {
                    const activeLabel = state?.activeLabel;
                    if (typeof activeLabel === 'string' && activeLabel.trim()) {
                      void drillDownToDate(activeLabel);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket_time" tickFormatter={(value) => format(new Date(value), 'dd MMM')} interval="preserveStartEnd" />
                  <YAxis width={72} domain={paddedDomain} allowDataOverflow={false} tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatNumber(value), name]}
                    labelFormatter={(value) => format(new Date(value), 'dd MMM yyyy HH:mm')}
                  />
                  <Bar dataKey="produced" fill={chartColors.produced} />
                  <Bar dataKey="dispatched" fill={chartColors.dispatched} />
                  <Bar dataKey="returned" fill={chartColors.returned} />
                  <Bar dataKey="scrapped" fill={chartColors.scrapped} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setDispatchDestinationsExpanded(!dispatchDestinationsExpanded)}>
          <CardTitle className="text-sm flex items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${dispatchDestinationsExpanded ? 'rotate-0' : '-rotate-90'}`}
            />
            Dispatch Destinations (Compact)
          </CardTitle>
        </CardHeader>
        {dispatchDestinationsExpanded && (
          <CardContent>
            {dispatchDestinations.length === 0 ? (
              <div className="text-sm text-muted-foreground">No dispatches in selected range.</div>
            ) : (
              <div className="space-y-1.5">
                {dispatchDestinations.map((destination) => (
                  <div key={destination.name} className="rounded-md border px-2.5 py-2">
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-6 md:items-center">
                      <div className="font-medium md:col-span-2 truncate" title={destination.name}>{destination.name}</div>
                      <div className="text-xs text-muted-foreground">{destination.eventCount} dispatches</div>
                      <div className="text-xs text-muted-foreground">{formatNumber(destination.totalRolls)} rolls</div>
                      <div className="text-xs text-muted-foreground">{formatNumber(destination.totalLengthMeters)} m</div>
                      <div className="text-xs text-muted-foreground">
                        {destination.lastDispatchAt ? format(new Date(destination.lastDispatchAt), 'dd MMM HH:mm') : '-'}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1" title={destination.references.join(', ')}>
                      {destination.references.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ledger Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-xs text-muted-foreground">
            Values are shown in their stored units per event type (for example, production in meters and dispatch in rolls/pieces/bundles).
          </div>
          {events.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No ledger events found for this range.</div>
          ) : (
            <div className="overflow-auto max-h-[520px] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">In (stored)</TableHead>
                    <TableHead className="text-right">Out (stored)</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="text-right">More</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const change = Number(event.signed_change || 0);
                    const positive = change > 0;
                    const negative = change < 0;
                    const displayValues = getEventDisplayValues(event);

                    return (
                      <TableRow
                        key={event.event_id}
                        className="cursor-pointer"
                        onClick={() => {
                          void openEventDetails(event);
                        }}
                      >
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(event.event_time), 'dd MMM yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.event_type}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate" title={event.reference_no || event.source_id}>
                          {event.reference_no || event.source_id}
                        </TableCell>
                        <TableCell className="max-w-[360px] truncate" title={getEventSummaryText(event)}>
                          {getEventSummaryText(event)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600">{displayValues.inText}</TableCell>
                        <TableCell className="text-right text-red-600">{displayValues.outText}</TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center gap-1 ${positive ? 'text-emerald-600' : negative ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {positive ? <ArrowUpCircle className="h-3.5 w-3.5" /> : null}
                            {negative ? <ArrowDownCircle className="h-3.5 w-3.5" /> : null}
                            {displayValues.changeText}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatAdaptiveWithUnit(event.balance_after, baseUnit, { showBaseForScaled: true })}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={event.actor_name || '-'}>
                          {event.actor_name || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openEventDetails(event);
                            }}
                            className="h-8 px-2"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedEvent(null);
            setEventDetails(null);
          }
        }}
      >
        <DialogContent className="w-full max-h-[90vh] overflow-y-auto sm:max-h-[85vh] sm:max-w-2xl mx-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg truncate">Ledger Event Details</DialogTitle>
          </DialogHeader>

          {selectedEvent && (() => {
            const meta = (selectedEvent.meta || {}) as Record<string, unknown>;
            const eventType = (selectedEvent.event_type || '').toUpperCase();
            const displayValues = getEventDisplayValues(selectedEvent);
            const lazyDetails = (eventDetails?.details || {}) as Record<string, unknown>;
            const parameters = (lazyDetails.parameters || (lazyDetails.product as Record<string, unknown> | undefined)?.parameters || {}) as Record<string, unknown>;
            const items = Array.isArray(lazyDetails.items) ? (lazyDetails.items as Record<string, unknown>[]) : [];
            const stockEntries = Array.isArray(lazyDetails.stock_entries) ? (lazyDetails.stock_entries as Record<string, unknown>[]) : [];
            const cutPieces = Array.isArray(lazyDetails.cut_pieces) ? (lazyDetails.cut_pieces as Record<string, unknown>[]) : [];

            return (
              <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Time</div>
                    <div className="font-medium truncate">{format(new Date(selectedEvent.event_time), 'dd MMM yyyy HH:mm:ss')}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Event</div>
                    <div className="font-medium truncate">{selectedEvent.event_type}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Reference</div>
                    <div className="font-medium break-all text-xs sm:text-sm">{selectedEvent.reference_no || selectedEvent.source_id}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Actor</div>
                    <div className="font-medium truncate">{selectedEvent.actor_name || '-'}</div>
                  </div>
                </div>

                <div className="rounded-md border p-2 sm:p-3">
                  <div className="text-xs text-muted-foreground mb-1">Stored movement</div>
                  <div className="space-y-1 text-xs sm:text-sm">
                    <div className="flex justify-between gap-2">
                      <span>In:</span>
                      <span className="font-medium text-emerald-600 text-right">{displayValues.inText}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Out:</span>
                      <span className="font-medium text-red-600 text-right">{displayValues.outText}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Change:</span>
                      <span className="font-medium text-right">{displayValues.changeText}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Base change ({baseUnit}):</span>
                      <span className="font-medium text-right">{displayValues.baseText}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Balance after:</span>
                      <span className="font-medium text-right">{formatAdaptiveWithUnit(selectedEvent.balance_after, baseUnit, { showBaseForScaled: true })}</span>
                    </div>
                  </div>
                </div>

                {detailsLoading ? (
                  <div className="rounded-md border p-2 sm:p-3 text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    Loading detailed information...
                  </div>
                ) : null}

                {!detailsLoading && Object.keys(lazyDetails).length > 0 ? (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-2">Detailed specification</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs sm:text-sm">
                      <div className="min-w-0">
                        <span className="text-muted-foreground">Product type:</span>
                        <div className="font-medium truncate">{String(lazyDetails.product_type_name || (lazyDetails.product as Record<string, unknown> | undefined)?.product_type_name || '-')}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-muted-foreground">Brand:</span>
                        <div className="font-medium truncate">{String(lazyDetails.brand_name || (lazyDetails.product as Record<string, unknown> | undefined)?.brand_name || '-')}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-muted-foreground">Batch code:</span>
                        <div className="font-medium truncate">{String(lazyDetails.batch_code || (lazyDetails.batch as Record<string, unknown> | undefined)?.batch_code || selectedEvent.batch_code || '-')}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-muted-foreground">Created by:</span>
                        <div className="font-medium truncate">{String(lazyDetails.created_by || '-')}</div>
                      </div>
                    </div>
                    {Object.keys(parameters).length > 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground overflow-x-auto">
                        <div className="whitespace-nowrap">{Object.entries(parameters).map(([key, value]) => `${key}:${String(value)}`).join(' | ')}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {eventType.includes('DISPATCH') && (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-2">Dispatch info</div>
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Dispatched to:</span>
                        <span className="font-medium truncate">{String(lazyDetails.customer_name || meta.customer_name || 'Unknown customer')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Item type:</span>
                        <span className="font-medium">{String(meta.item_type || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Invoice:</span>
                        <span className="font-medium truncate">{String(lazyDetails.invoice_number || meta.invoice_number || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="font-medium">{String(lazyDetails.status || meta.dispatch_status || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Transport:</span>
                        <span className="font-medium truncate">{String(lazyDetails.transport_name || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Vehicle:</span>
                        <span className="font-medium truncate">{String(lazyDetails.vehicle_number || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Driver:</span>
                        <span className="font-medium truncate">{String(lazyDetails.driver_name || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Bill To:</span>
                        <span className="font-medium truncate">{String(lazyDetails.bill_to_name || '-')}</span>
                      </div>
                      {meta.mixed_products ? <div className="text-amber-600 font-medium text-xs">Mixed dispatch (multiple product variants)</div> : null}
                    </div>
                    {items.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-muted-foreground">Dispatch items</div>
                        {(() => {
                          const selectedDispatchItemId = String(meta.dispatch_item_id || '').trim();
                          const isMatch = (item: Record<string, unknown>) => (
                            selectedDispatchItemId
                              ? String(item.id || '').trim() === selectedDispatchItemId
                              : (
                                  String(item.item_type || '').toUpperCase() === String(meta.item_type || '').toUpperCase() &&
                                  Number(item.quantity || 0) === Number(meta.quantity || 0) &&
                                  Number(item.length_meters || 0) === Number(meta.length_meters || 0)
                                )
                          );

                          const matchedItems = items.filter(isMatch);
                          const otherItems = items.filter((item) => !isMatch(item));

                          const renderItem = (item: Record<string, unknown>, key: string, highlight = false) => (
                            <div key={key} className={`rounded border p-2 text-xs sm:text-sm ${highlight ? 'border-emerald-500 bg-emerald-50/40' : ''}`}>
                              <div className="font-medium text-sm">{String(item.item_type || 'Item')}</div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <div>Qty: <span className="font-medium">{formatNumber(Number(item.quantity || 0))}</span></div>
                                <div>Length: <span className="font-medium">{item.length_meters ? `${formatNumber(Number(item.length_meters))} m` : '-'}</span></div>
                                <div>Pieces: <span className="font-medium">{formatNumber(Number(item.piece_count || 0))}</span></div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <div>Bundle size: <span className="font-medium">{formatNumber(Number(item.bundle_size || 0))}</span></div>
                                <div>Per bundle: <span className="font-medium">{formatNumber(Number(item.pieces_per_bundle || 0))}</span></div>
                                <div>Piece length: <span className="font-medium">{item.piece_length_meters ? `${formatNumber(Number(item.piece_length_meters))} m` : '-'}</span></div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                <div className="truncate">Type: <span className="font-medium">{String(item.product_type_name || '-')}</span></div>
                                <div className="truncate">Brand: <span className="font-medium">{String(item.brand_name || '-')}</span></div>
                                <div className="text-xs break-words">Params: <span className="font-medium">{Object.entries((item.parameters || {}) as Record<string, unknown>).map(([k, v]) => `${k}:${String(v)}`).join(', ') || '-'}</span></div>
                              </div>
                            </div>
                          );

                          return (
                            <div className="space-y-2">
                              {matchedItems.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="text-[11px] font-medium text-emerald-700">This ledger row corresponds to:</div>
                                  {matchedItems.map((item, idx) => renderItem(item, `${selectedEvent.event_id}-dispatch-match-${idx}`, true))}
                                </div>
                              ) : null}

                              {otherItems.length > 0 ? (
                                <details className="rounded border p-2">
                                  <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                    Other items in same dispatch ({otherItems.length})
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {otherItems.map((item, idx) => renderItem(item, `${selectedEvent.event_id}-dispatch-other-${idx}`))}
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                )}

                {eventType.includes('PRODUCTION') && (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-2">Production info</div>
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Produced quantity:</span>
                        <span className="font-medium">{displayValues.inText}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Batch code:</span>
                        <span className="font-medium truncate">{String(lazyDetails.batch_code || (lazyDetails.batch as Record<string, unknown> | undefined)?.batch_code || selectedEvent.batch_code || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">Transaction date:</span>
                        <span className="font-medium">{String(lazyDetails.transaction_date || meta.transaction_date || '-')}</span>
                      </div>
                    </div>
                    {stockEntries.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-muted-foreground">Produced rolls / pieces breakdown</div>
                        {stockEntries.map((entry, idx) => (
                          <div key={`${selectedEvent.event_id}-stock-entry-${idx}`} className="rounded border p-2 text-xs sm:text-sm">
                            <div className="font-medium text-sm">{String(entry.stock_type || 'Stock')}</div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <div>Qty: <span className="font-medium">{formatNumber(Number(entry.quantity || 0))}</span></div>
                              <div>Length/unit: <span className="font-medium">{entry.length_per_unit ? `${formatNumber(Number(entry.length_per_unit))} m` : '-'}</span></div>
                              {entry.total_cut_length ? (
                                <div>Total cut: <span className="font-medium">{formatAdaptiveWithUnit(Number(entry.total_cut_length || 0), 'm', { showBaseForScaled: true })}</span></div>
                              ) : null}
                              <div>Per bundle: <span className="font-medium">{formatNumber(Number(entry.pieces_per_bundle || 0))}</span></div>
                              <div>Piece length: <span className="font-medium">{entry.piece_length_meters ? `${formatNumber(Number(entry.piece_length_meters))} m` : '-'}</span></div>
                            </div>
                            {Array.isArray(entry.cut_piece_lengths) && entry.cut_piece_lengths.length > 0 ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                <div>Cut pieces:</div>
                                <div className="break-words">{(entry.cut_piece_lengths as unknown[])
                                  .map((len) => `${formatNumber(Number(len || 0))} m`)
                                  .join(', ')}</div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {eventType.includes('CUT_ROLL') && (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-2">Cut roll info</div>
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">From stock:</span>
                        <span className="font-medium truncate">{String(lazyDetails.from_stock_type || meta.from_stock_type || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">To stock:</span>
                        <span className="font-medium truncate">{String(lazyDetails.to_stock_type || meta.to_stock_type || '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">From qty:</span>
                        <span className="font-medium">{String(lazyDetails.from_quantity ?? meta.from_quantity ?? '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">To qty:</span>
                        <span className="font-medium">{String(lazyDetails.to_quantity ?? meta.to_quantity ?? '-')}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">From length:</span>
                        <span className="font-medium">{lazyDetails.from_length ? `${formatNumber(Number(lazyDetails.from_length))} m` : meta.from_length ? `${formatNumber(Number(meta.from_length))} m` : '-'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:gap-2">
                        <span className="text-muted-foreground">To length:</span>
                        <span className="font-medium">{lazyDetails.to_length ? `${formatNumber(Number(lazyDetails.to_length))} m` : meta.to_length ? `${formatNumber(Number(meta.to_length))} m` : '-'}</span>
                      </div>
                    </div>
                    {cutPieces.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-muted-foreground">Generated cut pieces ({cutPieces.length})</div>
                        <details className="rounded border p-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">Show pieces</summary>
                          <div className="mt-2 space-y-1">
                            {cutPieces.map((piece, idx) => (
                              <div key={`${selectedEvent.event_id}-cut-piece-${idx}`} className="text-xs text-muted-foreground flex justify-between gap-2">
                                <span>Piece #{idx + 1}</span>
                                <span className="font-medium">{piece.length_meters ? `${formatNumber(Number(piece.length_meters))} m` : '-'}</span>
                                <span className="font-medium">{String(piece.status || '-')}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    ) : null}
                  </div>
                )}

                {eventType.includes('SCRAP') && items.length > 0 ? (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-2">Scrap details</div>
                    <div className="space-y-2 text-xs sm:text-sm">
                      {items.map((item, idx) => (
                        <div key={`${selectedEvent.event_id}-scrap-item-${idx}`} className="rounded border p-2">
                          <div className="font-medium text-sm">{String(item.stock_type || item.item_type || 'Scrap item')}</div>
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            <div>Qty scrapped: <span className="font-medium">{formatNumber(Number(item.quantity_scrapped || item.quantity || 0))}</span></div>
                            <div>Length/unit: <span className="font-medium">{item.length_per_unit ? `${formatNumber(Number(item.length_per_unit))} m` : '-'}</span></div>
                            <div>Per bundle: <span className="font-medium">{formatNumber(Number(item.pieces_per_bundle || 0))}</span></div>
                            <div>Piece length: <span className="font-medium">{item.piece_length_meters ? `${formatNumber(Number(item.piece_length_meters))} m` : '-'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedEvent.notes ? (
                  <div className="rounded-md border p-2 sm:p-3">
                    <div className="text-xs text-muted-foreground mb-1">Notes</div>
                    <div className="text-xs sm:text-sm break-words">{selectedEvent.notes}</div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductLedgerTab;
