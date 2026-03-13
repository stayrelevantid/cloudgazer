"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Cloud, DollarSign, TrendingUp, RefreshCcw, BarChart3, Layers, Download, Box, LayoutGrid, FileSpreadsheet, FileText, ChevronDown, Tag as TagIcon, Filter } from "lucide-react";
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type ReportRow = { period: string; group_name: string; total_usd: number };
type ChartPoint = { date: string; [key: string]: string | number };
type ResourceRow = { account_name: string; provider: string; service_name: string; resource_name: string; tag_name: string; total_usd: number };
type ServiceRow = { account_name: string; provider: string; service_name: string; total_usd: number };
type ComparisonData = { service: string; provider: string; current_total: number; prev_total: number; delta: number; delta_percent: number };
type HistoricalRow = { period: string; total_usd: number };
type ForecastRow = { provider: string; total_so_far: number; projected_total: number; budget: number };

function buildChartData(rows: ReportRow[]): { data: ChartPoint[], series: string[] } {
    const map: Record<string, ChartPoint> = {};
    const seriesSet = new Set<string>();
    
    for (const row of rows) {
        const d = row.period.slice(0, 10);
        if (!map[d]) map[d] = { date: d };
        const label = row.group_name || "Unknown";
        map[d][label] = ((map[d][label] as number) || 0) + row.total_usd;
        seriesSet.add(label);
    }
    const data = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return { data, series: Array.from(seriesSet) };
}

export default function DashboardPage() {
    const { format, convert, symbol, exchangeRate } = useCurrency();
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [comparison, setComparison] = useState<ComparisonData[]>([]);
    const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
    const [resources, setResources] = useState<ResourceRow[]>([]);
    const [services, setServices] = useState<ServiceRow[]>([]);
    const [historical, setHistorical] = useState<HistoricalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState("30d");
    const [granularity, setGranularity] = useState("day");
    const [accounts, setAccounts] = useState<{ id: string; account_name: string; provider: string }[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("all");
    const [selectedProvider, setSelectedProvider] = useState<string>("all");
    const [groupBy, setGroupBy] = useState<string>("all");
    const [tags, setTags] = useState<string[]>([]);
    const [selectedTag, setSelectedTag] = useState<string>("all");

    const fetchData = useCallback(() => {
        setLoading(true);
        const params = `range=${timeframe}&granularity=${granularity}&account_id=${selectedAccount === "all" ? "" : selectedAccount}&provider=${selectedProvider === "all" ? "" : selectedProvider}&group_by=${groupBy}&tag=${selectedTag}`;
        Promise.all([
            fetch(`${API_BASE}/api/reports/advanced?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/resources?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/services?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/historical?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/comparison?${params}`).then(r => r.json()),
            fetch(`${API_BASE}/api/reports/forecasting?${params}`).then(r => r.json())
        ])
            .then(([rData, resData, sData, hData, cData, fData]) => {
                setRows(rData.reports ?? []);
                setResources(resData.resources ?? []);
                setServices(sData.services ?? []);
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
    }, [timeframe, granularity, selectedAccount, selectedProvider, groupBy, selectedTag]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetch(`${API_BASE}/api/accounts`)
            .then(r => r.json())
            .then(data => setAccounts(data.accounts ?? []))
            .catch(() => setAccounts([]));

        fetch(`${API_BASE}/api/tags`)
            .then(r => r.json())
            .then(data => setTags(data.tags ?? []))
            .catch(() => setTags([]));
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

    const { data: chartData, series } = buildChartData(rows);
    const totalAll = rows.reduce((s, r) => s + r.total_usd, 0);

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

    const handleExportServicesCSV = () => {
        if (!services.length) {
            toast.error("No service data to export");
            return;
        }
        const headers = ["Provider", "Service", "Cost (USD)"];
        const rows = services.map(s => [
            s.provider,
            s.service_name,
            s.total_usd.toFixed(2)
        ]);
        
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const accountName = selectedAccount === "all" ? "All Accounts" : accounts.find(a => a.id === selectedAccount)?.account_name || selectedAccount;
        const tagParam = selectedTag !== "all" ? `&tag=${selectedTag}` : "";
        link.setAttribute("download", `services_export_${timeframe}_${accountName}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportServicesPDF = () => {
        if (!services.length) {
            toast.error("No service data to export");
            return;
        }
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Service Cost Summary", 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        const accountName = selectedAccount === "all" ? "All Accounts" : accounts.find(a => a.id === selectedAccount)?.account_name || selectedAccount;
        doc.text(`Filters - Range: ${timeframe}, Account: ${accountName}, Provider: ${selectedProvider}`, 14, 35);

        const tableData = services.map(s => [
            s.provider,
            s.service_name,
            `${symbol}${convert(s.total_usd).toLocaleString()}`
        ]);

        autoTable(doc, {
            startY: 45,
            head: [['Provider', 'Service', `Cost (${symbol})`]],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
        });

        const tagSuffix = selectedTag !== "all" ? `_${selectedTag}` : "";
        doc.save(`services_report_${timeframe}${tagSuffix}.pdf`);
    };

    const handleExportResourcesCSV = () => {
        if (!resources.length) {
            toast.error("No resource data to export");
            return;
        }
        const headers = ["Service", "Resource Name", "Tag", "Cost (USD)"];
        const rows = resources.map(r => [
            r.service_name,
            r.resource_name,
            r.tag_name,
            r.total_usd.toFixed(2)
        ]);
        
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const accountName = selectedAccount === "all" ? "All Accounts" : accounts.find(a => a.id === selectedAccount)?.account_name || selectedAccount;
        const tagParam = selectedTag !== "all" ? `&tag=${selectedTag}` : "";
        link.setAttribute("download", `resources_export_${timeframe}_${accountName}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportResourcesPDF = () => {
        if (!resources.length) {
            toast.error("No resource data to export");
            return;
        }
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Resource Cost Breakdown", 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        const accountName = selectedAccount === "all" ? "All Accounts" : accounts.find(a => a.id === selectedAccount)?.account_name || selectedAccount;
        doc.text(`Filters - Range: ${timeframe}, Account: ${accountName}, Provider: ${selectedProvider}`, 14, 35);

        const tableData = resources.map(r => [
            r.service_name,
            r.resource_name,
            r.tag_name,
            `${symbol}${convert(r.total_usd).toLocaleString()}`
        ]);

        autoTable(doc, {
            startY: 45,
            head: [['Service', 'Resource Name', 'Tag', `Cost (${symbol})`]],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
        });

        const tagSuffix = selectedTag !== "all" ? `_${selectedTag}` : "";
        doc.save(`resources_report_${timeframe}${tagSuffix}.pdf`);
    };



    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-6">
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

                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                                <TrendingUp size={14} className="text-primary" />
                                <span>1 USD = Rp {exchangeRate.toLocaleString("id-ID")}</span>
                            </div>
                            <div className="w-[1px] h-3 bg-border" />
                            <CurrencyToggle />
                        </div>
                        
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 border-border hover:bg-muted font-medium"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                            <span>Sync Data</span>
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-card/50 p-3 rounded-xl border border-border/50 backdrop-blur-sm">
                    <Select value={selectedProvider} onValueChange={(val) => {
                        setSelectedProvider(val ?? "all");
                        setSelectedAccount("all");
                    }}>
                        <SelectTrigger className="w-[140px] bg-background border-border">
                            <SelectValue placeholder="All Providers" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all">All Providers</SelectItem>
                            <SelectItem value="aws">AWS</SelectItem>
                            <SelectItem value="gcp">GCP</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={selectedAccount} onValueChange={(val) => setSelectedAccount(val ?? "all")}>
                        <SelectTrigger className="w-[180px] bg-background border-border">
                            <SelectValue>
                                {selectedAccount === "all" ? "All Accounts" : accounts.find(a => a.id === selectedAccount)?.account_name}
                            </SelectValue>
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

                    <div className="w-[1px] h-6 bg-border mx-1 hidden sm:block" />

                    <Select value={`${timeframe}-${granularity}`} onValueChange={(val) => {
                        if (!val) return;
                        const [t, g] = val.split("-");
                        setTimeframe(t);
                        setGranularity(g);
                    }}>
                        <SelectTrigger className="w-[140px] bg-background border-border">
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
                                {series.map((s, i) => (
                                    <Area 
                                        key={s}
                                        type="monotone" 
                                        dataKey={s} 
                                        name={s} 
                                        stroke={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"][i % 6]} 
                                        strokeWidth={2} 
                                        fillOpacity={0.1} 
                                        fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"][i % 6]} 
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Bottom Section: Resource & Service Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden flex flex-col shadow-sm">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Box className="text-primary" size={20} />
                                Service Breakdown
                            </CardTitle>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                            <Download size={16} />
                                        </Button>
                                    }
                                />
                                <DropdownMenuContent align="end" className="bg-card border-border">
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>Export Service Data</DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-border" />
                                        <DropdownMenuItem onClick={handleExportServicesCSV} className="cursor-pointer hover:bg-muted">
                                            <FileSpreadsheet size={16} className="mr-2 text-emerald-500" />
                                            Export to CSV
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleExportServicesPDF} className="cursor-pointer hover:bg-muted">
                                            <FileText size={16} className="mr-2 text-rose-500" />
                                            Export to PDF
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <CardDescription>Detailed service-level MoM analysis</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 flex-1">
                        <SimpleDataTable
                            data={comparison}
                            emptyMessage="No service data found"
                            searchKeys={["service", "provider"]}
                            searchPlaceholder="Search services..."
                            columns={[
                                {
                                    header: "Service",
                                    accessorKey: (row) => (
                                        <div className="font-medium text-foreground py-1">
                                            {row.service}
                                            <Badge variant="outline" className="ml-2 text-[10px] py-0 border-border text-muted-foreground uppercase">
                                                {row.provider}
                                            </Badge>
                                        </div>
                                    ),
                                    className: "w-[30%]"
                                },
                                {
                                    header: `Last Month (${symbol})`,
                                    accessorKey: (row) => (
                                        <div className="text-muted-foreground font-mono">
                                            {format(row.prev_total)}
                                        </div>
                                    ),
                                    align: "right"
                                },
                                {
                                    header: `This Month (${symbol})`,
                                    accessorKey: (row) => (
                                        <div className="text-foreground font-bold font-mono">
                                            {format(row.current_total)}
                                        </div>
                                    ),
                                    align: "right"
                                },
                                {
                                    header: "Change (%)",
                                    accessorKey: (row) => (
                                        <div className={`text-right font-semibold flex items-center justify-end gap-1 ${row.delta > 0 ? "text-destructive" : row.delta < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                            {row.delta > 0 ? "+" : ""}{row.delta_percent.toFixed(1)}%
                                        </div>
                                    ),
                                    align: "right"
                                }
                            ]}
                        />
                    </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden flex flex-col shadow-sm">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <LayoutGrid className="text-primary" size={20} />
                                Resource Breakdown
                            </CardTitle>
                            <div className="flex items-center gap-3">
                                <Select value={groupBy} onValueChange={(val) => setGroupBy(val ?? "all")}>
                                    <SelectTrigger className="w-[130px] h-8 bg-background border-border text-xs">
                                        <Layers size={12} className="mr-2 text-primary" />
                                        <SelectValue placeholder="Group By" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="all">All (Total)</SelectItem>
                                        <SelectItem value="tag" className="text-xs">Group by Tag</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={selectedTag} onValueChange={(val) => setSelectedTag(val ?? "all")}>
                                    <SelectTrigger className="w-[140px] h-8 bg-background border-border text-xs px-2">
                                        <TagIcon size={12} className="mr-2 text-primary" />
                                        <SelectValue placeholder="All Tags" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border">
                                        <SelectItem value="all">All Tags</SelectItem>
                                        {tags.map(t => (
                                            <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        render={
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                <Download size={16} />
                                            </Button>
                                        }
                                    />
                                    <DropdownMenuContent align="end" className="bg-card border-border">
                                        <DropdownMenuGroup>
                                            <DropdownMenuLabel>Export Resource Data</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-border" />
                                            <DropdownMenuItem onClick={handleExportResourcesCSV} className="cursor-pointer hover:bg-muted">
                                                <FileSpreadsheet size={16} className="mr-2 text-emerald-500" />
                                                Export to CSV
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleExportResourcesPDF} className="cursor-pointer hover:bg-muted">
                                                <FileText size={16} className="mr-2 text-rose-500" />
                                                Export to PDF
                                            </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                        <CardDescription>Individual resource expenditure</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 flex-1">
                        <SimpleDataTable
                            data={resources.map(r => ({ ...r, unique_id: `${r.account_name}-${r.service_name}-${r.resource_name}-${r.tag_name}` }))}
                            emptyMessage="No resource data found"
                            searchKeys={["resource_name", "service_name", "tag_name"]}
                            searchPlaceholder="Search resources or tags..."
                            columns={[
                                {
                                    header: "Service",
                                    accessorKey: (row) => (
                                        <div className="flex flex-col">
                                            <span className="font-medium text-foreground text-xs">{row.service_name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]" title={row.resource_name}>
                                                {row.resource_name}
                                            </span>
                                        </div>
                                    ),
                                    className: "w-[40%]"
                                },
                                {
                                    header: "Tag",
                                    accessorKey: (row) => (
                                        <div className="flex items-center min-w-0">
                                            {row.tag_name !== "untagged" ? (
                                                <Badge variant="secondary" className="text-[9px] py-0 bg-primary/10 text-primary border-none max-w-full truncate">
                                                    {row.tag_name}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground/30 italic text-[9px]">none</span>
                                            )}
                                        </div>
                                    ),
                                    className: "w-[30%]"
                                },
                                {
                                    header: "Cost (USD)",
                                    accessorKey: (row) => (
                                        <div className="text-right text-foreground font-mono font-semibold">
                                            {format(row.total_usd)}
                                        </div>
                                    ),
                                    align: "right",
                                    className: "w-[30%]"
                                }
                            ]}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Historical Trend */}
            <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                        <BarChart3 size={18} className="text-primary" />
                        Historical Comparison
                    </CardTitle>
                    <CardDescription>Previous month-by-month expenditure</CardDescription>
                </CardHeader>
                <CardContent>
                    <SimpleDataTable
                        data={historical}
                        searchKeys={["period"]}
                        searchPlaceholder="Search periods..."
                        emptyMessage="No historical data found"
                        columns={[
                            {
                                header: "Period",
                                accessorKey: (row) => (
                                    <div className="text-muted-foreground font-medium py-1 capitalize">
                                        {new Date(row.period).toLocaleDateString('en-US', {
                                            month: granularity === 'month' ? 'long' : 'short',
                                            year: granularity === 'month' ? 'numeric' : undefined,
                                            day: granularity === 'day' ? 'numeric' : undefined
                                        })}
                                    </div>
                                ),
                                className: "w-[50%]"
                            },
                            {
                                header: "Cost (USD)",
                                accessorKey: (row) => (
                                    <div className="text-right text-foreground font-bold font-mono">
                                        {format(row.total_usd)}
                                    </div>
                                ),
                                align: "right",
                                className: "w-[50%]"
                            }
                        ]}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function SummaryCard({
    title,
    value,
    icon,
    color,
    subtitle,
    footer,
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
