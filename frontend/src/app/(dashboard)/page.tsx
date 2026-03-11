"use client";

import { useEffect, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Cloud, DollarSign, TrendingUp, RefreshCcw, Calendar, BarChart3, ArrowDownRight, ArrowUpRight, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/contexts/CurrencyContext";
import { CurrencyToggle } from "@/components/layout/CurrencyToggle";
import { SimpleDataTable } from "./SimpleDataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type ReportRow = { period: string; provider: string; total_usd: number };
type ChartPoint = { date: string; aws: number; gcp: number };
type ResourceRow = { account_name: string; provider: string; resource_name: string; total_usd: number };
type HistoricalRow = { period: string; total_usd: number };
type ForecastRow = { provider: string; total_so_far: number; projected_total: number; budget: number };

function buildChartData(rows: ReportRow[]): ChartPoint[] {
    const map: Record<string, ChartPoint> = {};
    for (const row of rows) {
        const d = row.period.slice(0, 10);
        if (!map[d]) map[d] = { date: d, aws: 0, gcp: 0 };
        if (row.provider === "aws") map[d].aws += row.total_usd;
        if (row.provider === "gcp") map[d].gcp += row.total_usd;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export default function DashboardPage() {
    const { format, convert, symbol, exchangeRate } = useCurrency();
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [comparison, setComparison] = useState<{ provider: string; current_total: number; prev_total: number }[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
    const [resources, setResources] = useState<ResourceRow[]>([]);
    const [historical, setHistorical] = useState<HistoricalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState("30d");
    const [granularity, setGranularity] = useState("day");
    const [accounts, setAccounts] = useState<{ id: string; account_name: string; provider: string }[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("all");
    const [selectedProvider, setSelectedProvider] = useState<string>("all");

    const fetchData = () => {
        setLoading(true);
        const params = `range=${timeframe}&granularity=${granularity}&account_id=${selectedAccount === "all" ? "" : selectedAccount}&provider=${selectedProvider === "all" ? "" : selectedProvider}`;
        Promise.all([
            fetch(`${API_BASE}/api/reports/advanced?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/resources?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/historical?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/comparison?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/forecasting?${params}`).then(r => r.json())
        ])
            .then(([rData, resData, hData, cData, fData]) => {
                setRows(rData.reports ?? []);
                setResources(resData.resources ?? []);
                setHistorical(hData.historical ?? []);
                setComparison(cData.comparison ?? []);
                setForecasts(fData.forecasting ?? []);
            })
            .catch(() => {
                setRows([]);
                setResources([]);
                setHistorical([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
    }, [timeframe, granularity, selectedAccount, selectedProvider]);

    useEffect(() => {
        fetch(`${API_BASE}/api/accounts`)
            .then(r => r.json())
            .then(data => setAccounts(data.accounts ?? []))
            .catch(() => setAccounts([]));
    }, []);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/cron/fetch`, { method: "POST" });
            if (res.ok) {
                toast.success("Data synchronized successfully!");
                fetchData();
            } else {
                toast.error("Failed to sync data.");
                setLoading(false);
            }
        } catch {
            toast.error("Error connecting to backend.");
            setLoading(false);
        }
    };

    const chartData = buildChartData(rows);

    const totalAWS = rows
        .filter((r) => r.provider === "aws")
        .reduce((s, r) => s + r.total_usd, 0);

    const totalGCP = rows
        .filter((r) => r.provider === "gcp")
        .reduce((s, r) => s + r.total_usd, 0);

    const totalAll = totalAWS + totalGCP;

    // Calculate MoM
    const prevTotalAll = comparison.reduce((s, c) => s + c.prev_total, 0);
    const momChange = prevTotalAll > 0 ? ((totalAll - prevTotalAll) / prevTotalAll) * 100 : 0;

    // Forecasting Analytics
    const projectedTotalAll = forecasts.reduce((s, f) => s + f.projected_total, 0);
    const totalBudgetAll = forecasts.reduce((s, f) => s + f.budget, 0);
    const budgetUsagePercent = totalBudgetAll > 0 ? (projectedTotalAll / totalBudgetAll) * 100 : 0;

    let warningStatus = "On Track";
    let warningColor = "text-emerald-400";
    let warningBg = "bg-emerald-400/10";
    if (budgetUsagePercent > 100) {
        warningStatus = "Over Budget";
        warningColor = "text-destructive";
        warningBg = "bg-destructive/10";
    } else if (budgetUsagePercent > 80) {
        warningStatus = "At Risk";
        warningColor = "text-orange-400";
        warningBg = "bg-orange-400/10";
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Overview</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {timeframe === "today" ? "Cloud costs for today" : 
                         timeframe === "last_year" ? `Cloud costs for ${new Date().getFullYear() - 1}` :
                         timeframe === "2y_ago" ? `Cloud costs for ${new Date().getFullYear() - 2}` :
                         timeframe === "365d" ? "Cloud costs for this year" : 
                         `Cloud costs for the last ${timeframe.replace('d', ' days')}`}
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                        <TrendingUp size={14} className="text-primary" />
                        <span>1 USD = Rp {exchangeRate.toLocaleString("id-ID")}</span>
                    </div>
                    <div className="w-[1px] h-3 bg-border" />
                    <CurrencyToggle />
                </div>
                <div className="flex items-center gap-3">
                    <Select value={selectedProvider} onValueChange={(val) => {
                        setSelectedProvider(val ?? "all");
                        setSelectedAccount("all"); // Reset account when provider changes
                    }}>
                        <SelectTrigger className="w-[140px] bg-card border-border">
                            <SelectValue placeholder="All Providers" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all">All Providers</SelectItem>
                            <SelectItem value="aws">AWS</SelectItem>
                            <SelectItem value="gcp">GCP</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={selectedAccount} onValueChange={(val) => setSelectedAccount(val ?? "all")}>
                        <SelectTrigger className="w-[180px] bg-card border-border">
                            <SelectValue placeholder="All Accounts" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all">All Accounts</SelectItem>
                            {accounts
                                .filter(a => selectedProvider === "all" || a.provider === selectedProvider)
                                .map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.account_name}
                                    </SelectItem>
                                ))
                            }
                        </SelectContent>
                    </Select>

                    <Select value={`${timeframe}-${granularity}`} onValueChange={(val) => {
                        if (!val) return;
                        const [t, g] = val.split("-");
                        setTimeframe(t);
                        setGranularity(g);
                    }}>
                        <SelectTrigger className="w-[140px] bg-card border-border">
                            <SelectValue placeholder="Timeframe" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="today-day">Today</SelectItem>
                            <SelectItem value="7d-day">This Week</SelectItem>
                            <SelectItem value="30d-day">This Month</SelectItem>
                            <SelectItem value="90d-month">Last 3 Months</SelectItem>
                            <SelectItem value="180d-month">Last 6 Months</SelectItem>
                            <SelectItem value="365d-month">This Year</SelectItem>
                            <SelectItem value="last_year-month">Last Year</SelectItem>
                            <SelectItem value="2y_ago-month">2 Years Ago</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-border hover:bg-muted"
                        onClick={handleRefresh}
                        disabled={loading}
                    >
                        <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                        Sync Data
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${(timeframe === "30d") ? "lg:grid-cols-4" : "lg:grid-cols-2"} gap-4`}>
                <SummaryCard
                    title={timeframe === "today" ? "Today's Cost" : 
                           timeframe === "last_year" ? `Total Cost (${new Date().getFullYear() - 1})` :
                           timeframe === "2y_ago" ? `Total Cost (${new Date().getFullYear() - 2})` :
                           timeframe === "365d" ? "This Year's Cost" : "Total Cost"}
                    value={format(totalAll)}
                    icon={<DollarSign size={18} className="text-primary" />}
                    color="primary"
                />

                {(timeframe === "30d") && (
                    <>
                        <SummaryCard
                            title="MoM Change"
                            value={`${momChange >= 0 ? "+" : ""}${momChange.toFixed(1)}%`}
                            icon={<TrendingUp size={18} className={momChange > 0 ? "text-destructive" : "text-emerald-400"} />}
                            color={momChange > 0 ? "destructive" : "emerald"}
                            subtitle={`vs ${format(prevTotalAll)} last month`}
                        />
                        <SummaryCard
                            title={`Forecasted ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date())} Total`}
                            value={format(projectedTotalAll)}
                            icon={<RefreshCcw size={18} className="text-blue-400" />}
                            color="blue"
                            subtitle="Projected end of month"
                            footer={totalBudgetAll > 0 && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <Badge variant="outline" className={`text-[10px] font-bold uppercase ${warningBg} ${warningColor} border-none`}>
                                            {warningStatus}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground font-semibold">
                                            Budget: {format(totalBudgetAll)}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${budgetUsagePercent > 100 ? "bg-destructive" : budgetUsagePercent > 80 ? "bg-orange-400" : "bg-primary"}`}
                                            style={{ width: `${Math.min(100, budgetUsagePercent)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        />
                    </>
                )}

                <SummaryCard
                    title={granularity === "day" ? (timeframe === "today" ? "Burn Status" : "Daily Burn Rate") : "Monthly Burn Rate"}
                    value={timeframe === "today" ? "Stable" : 
                        granularity === "day" 
                        ? format(totalAll / (parseInt(timeframe) || 1))
                        : format(totalAll / 12)
                    }
                    icon={<TrendingUp size={18} className="text-orange-400" />}
                    color="orange"
                    subtitle={granularity === "day" ? "Avg per day" : "Avg per month"}
                />
            </div>

            {/* Main Chart */}
            <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                        <TrendingUp size={18} className="text-primary" />
                        Cost Trend ({symbol})
                    </CardTitle>
                    <CardDescription>Daily cost breakdown by provider</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorAws" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorGcp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#64748b" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                />
                                <YAxis 
                                    stroke="#64748b" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => `${symbol}${convert(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "12px", border: "1px solid #334155" }}
                                    itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                                    labelStyle={{ color: "#94a3b8", marginBottom: "4px", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}
                                    formatter={(val: number) => [format(val), ""]}
                                />
                                <Area type="monotone" dataKey="aws" name="AWS" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorAws)" />
                                <Area type="monotone" dataKey="gcp" name="GCP" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorGcp)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Bottom Section: Resource Breakdown & Historical */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Resources Table */}
                <Card className="lg:col-span-2 bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                            <Layers size={18} className="text-primary" />
                            Top Expense Resources
                        </CardTitle>
                        <CardDescription>Most expensive services for selected period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleDataTable
                            data={resources}
                            searchKeys={["resource_name", "account_name", "provider"]}
                            searchPlaceholder="Search resources or accounts..."
                            columns={[
                                {
                                    header: "Resource / Service",
                                    accessorKey: (row) => (
                                        <div className="font-medium text-foreground py-1">
                                            {row.resource_name}
                                            <Badge variant="outline" className="ml-2 text-[10px] py-0 border-border text-muted-foreground uppercase">
                                                {row.provider}
                                            </Badge>
                                        </div>
                                    ),
                                    className: "w-[45%]"
                                },
                                {
                                    header: "Account",
                                    accessorKey: "account_name",
                                    className: "text-muted-foreground"
                                },
                                {
                                    header: "Cost (USD)",
                                    accessorKey: (row) => (
                                        <div className="text-right text-foreground font-mono font-semibold">
                                            {format(row.total_usd)}
                                        </div>
                                    ),
                                    align: "right"
                                }
                            ]}
                        />
                    </CardContent>
                </Card>

                {/* Historical Comparison */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                            <BarChart3 size={18} className="text-primary" />
                            Historical Trend
                        </CardTitle>
                        <CardDescription>Complete historical comparison</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleDataTable
                            data={historical}
                            searchKeys={["period"]}
                            searchPlaceholder="Search dates..."
                            emptyMessage="No historical data found"
                            columns={[
                                {
                                    header: "Period",
                                    accessorKey: (row) => (
                                        <div className="text-muted-foreground font-medium py-1">
                                            {new Date(row.period).toLocaleDateString('en-US', {
                                                month: granularity === 'month' ? 'long' : 'short',
                                                year: granularity === 'month' ? 'numeric' : undefined,
                                                day: granularity === 'day' ? 'numeric' : undefined
                                            })}
                                        </div>
                                    )
                                },
                                {
                                    header: "Cost (USD)",
                                    accessorKey: (row) => (
                                        <div className="text-right text-foreground font-bold font-mono">
                                            {format(row.total_usd)}
                                        </div>
                                    ),
                                    align: "right"
                                }
                            ]}
                        />
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}

function SummaryCard({
    title,
    value,
    icon,
    color,
    subtitle,
    footer, // Added footer for budget visualization
}: {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: "orange" | "blue" | "primary" | "destructive" | "emerald";
    subtitle?: string;
    footer?: React.ReactNode;
}) {
    const ring: Record<string, string> = {
        orange: "ring-orange-500/20 bg-orange-500/10",
        blue: "ring-blue-500/20 bg-blue-500/10",
        primary: "ring-primary/20 bg-primary/10",
        destructive: "ring-destructive/20 bg-destructive/10",
        emerald: "ring-emerald-500/20 bg-emerald-500/10",
    };
    return (
        <Card className="bg-card border-border shadow-sm group hover:shadow-md transition-all duration-300">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{title}</p>
                        <p className="text-2xl font-bold text-foreground mt-1 tracking-tight">{value}</p>
                        {subtitle && <p className="text-[10px] text-muted-foreground mt-1 font-medium">{subtitle}</p>}
                    </div>
                    <div className={`p-3 rounded-xl ring-1 ${ring[color]} transition-transform duration-300 group-hover:scale-110`}>
                        {icon}
                    </div>
                </div>
                {footer && <div className="mt-4 pt-4 border-t border-border/50">{footer}</div>}
            </CardContent>
        </Card>
    );
}
