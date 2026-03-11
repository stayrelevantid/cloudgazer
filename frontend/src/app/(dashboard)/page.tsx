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
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [comparison, setComparison] = useState<{ provider: string; current_total: number; prev_total: number }[]>([]);
    const [forecasts, setForecasts] = useState<{ provider: string; total_so_far: number; projected_total: number }[]>([]);
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

    // Forecasting Total
    const projectedTotalAll = forecasts.reduce((s, f) => s + f.projected_total, 0);

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
                    value={`$${totalAll.toFixed(2)}`}
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
                            subtitle={`vs $${prevTotalAll.toFixed(2)} last month`}
                        />
                        <SummaryCard
                            title={`Forecasted ${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date())} Total`}
                            value={`$${projectedTotalAll.toFixed(2)}`}
                            icon={<RefreshCcw size={18} className="text-blue-400" />}
                            color="blue"
                            subtitle="Projected end of month"
                        />
                    </>
                )}

                <SummaryCard
                    title={granularity === "day" ? (timeframe === "today" ? "Burn Status" : "Daily Burn Rate") : "Monthly Burn Rate"}
                    value={timeframe === "today" ? "Stable" : 
                        granularity === "day" 
                        ? `$${(totalAll / (parseInt(timeframe) || 1)).toFixed(2)}` 
                        : `$${(totalAll / 12).toFixed(2)}`
                    }
                    icon={<TrendingUp size={18} className="text-orange-400" />}
                    color="orange"
                    subtitle={granularity === "day" ? "Avg per day" : "Avg per month"}
                />
            </div>

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
                                            ${row.total_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                                            ${row.total_usd.toFixed(2)}
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
}: {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: "orange" | "blue" | "primary" | "destructive" | "emerald";
    subtitle?: string;
}) {
    const ring: Record<string, string> = {
        orange: "ring-orange-500/20 bg-orange-500/10",
        blue: "ring-blue-500/20 bg-blue-500/10",
        primary: "ring-primary/20 bg-primary/10",
        destructive: "ring-destructive/20 bg-destructive/10",
        emerald: "ring-emerald-500/20 bg-emerald-500/10",
    };
    return (
        <Card className="bg-card border-border shadow-sm">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                        {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
                    </div>
                    <div className={`p-3 rounded-xl ring-1 ${ring[color]}`}>{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}
