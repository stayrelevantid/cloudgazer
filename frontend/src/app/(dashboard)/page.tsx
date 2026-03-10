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
import { Cloud, DollarSign, TrendingUp, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type ReportRow = { date: string; provider: string; total_usd: number };
type ChartPoint = { date: string; aws: number; gcp: number };

function buildChartData(rows: ReportRow[]): ChartPoint[] {
    const map: Record<string, ChartPoint> = {};
    for (const row of rows) {
        const d = row.date.slice(0, 10);
        if (!map[d]) map[d] = { date: d, aws: 0, gcp: 0 };
        if (row.provider === "aws") map[d].aws += row.total_usd;
        if (row.provider === "gcp") map[d].gcp += row.total_usd;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export default function DashboardPage() {
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        setLoading(true);
        fetch(`${API_BASE}/api/reports?days=30`)
            .then((r) => r.json())
            .then((data) => setRows(data.reports ?? []))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
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
        } catch (err) {
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

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Overview</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Cloud costs for the last 30 days
                    </p>
                </div>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                    title="Total AWS Cost"
                    value={`$${totalAWS.toFixed(2)}`}
                    icon={<Cloud size={18} className="text-orange-400" />}
                    color="orange"
                />
                <SummaryCard
                    title="Total GCP Cost"
                    value={`$${totalGCP.toFixed(2)}`}
                    icon={<Cloud size={18} className="text-blue-400" />}
                    color="blue"
                />
                <SummaryCard
                    title="Combined Total"
                    value={`$${totalAll.toFixed(2)}`}
                    icon={<DollarSign size={18} className="text-primary" />}
                    color="primary"
                />
            </div>

            {/* Area Chart */}
            <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-foreground flex items-center gap-2">
                        <TrendingUp size={18} className="text-primary" />
                        Cost Trend (30 days)
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-sm bg-orange-500" />
                            AWS
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                            GCP
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                            Loading...
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                            No cost data yet. Run a fetch to populate the chart.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="aws" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gcp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                                    tickFormatter={(v) => v.slice(5)}
                                />
                                <YAxis
                                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                                    tickFormatter={(v) => `$${v}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "var(--popover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                        color: "var(--popover-foreground)",
                                    }}
                                    formatter={(val: number) => [`$${val.toFixed(2)}`]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="aws"
                                    name="AWS"
                                    stroke="#f97316"
                                    fill="url(#aws)"
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="gcp"
                                    name="GCP"
                                    stroke="#3b82f6"
                                    fill="url(#gcp)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
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
}: {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: "orange" | "blue" | "primary";
}) {
    const ring: Record<string, string> = {
        orange: "ring-orange-500/20 bg-orange-500/10",
        blue: "ring-blue-500/20 bg-blue-500/10",
        primary: "ring-primary/20 bg-primary/10",
    };
    return (
        <Card className="bg-card border-border shadow-sm">
            <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                    </div>
                    <div className={`p-3 rounded-xl ring-1 ${ring[color]}`}>{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}
