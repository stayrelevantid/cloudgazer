"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { API_BASE } from "@/lib/config";
import { 
    BarChart3, 
    ArrowUpRight, 
    ArrowDownRight, 
    TrendingUp, 
    Target,
    Layers,
    Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrency } from "@/contexts/CurrencyContext";
import { CurrencyToggle } from "@/components/layout/CurrencyToggle";
import { SimpleDataTable } from "../SimpleDataTable";
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Legend
} from "recharts";


interface ComparisonData {
    service: string;
    provider: string;
    current_total: number;
    prev_total: number;
    delta: number;
    delta_percent: number;
}

export default function ComparisonPage() {
    const { getToken } = useAuth();
    const { format, convert, symbol, exchangeRate } = useCurrency();
    const [data, setData] = useState<ComparisonData[]>([]);
    const [accounts, setAccounts] = useState<{ id: string; account_name: string; provider: string }[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("all");
    const [selectedProvider, setSelectedProvider] = useState<string>("all");

    const fetchData = useCallback(async () => {
        try {
            const token = await getToken();
            const headers = { "Authorization": `Bearer ${token}` };
            const params = new URLSearchParams();
            if (selectedAccount !== "all") params.append("account_id", selectedAccount);
            if (selectedProvider !== "all") params.append("provider", selectedProvider);

            const res = await fetch(`${API_BASE}/api/reports/comparison?${params.toString()}`, { headers });
            const json = await res.json();
            setData(json.comparison ?? []);
        } catch (error) {
            console.error("Failed to fetch comparison:", error);
        }
    }, [selectedAccount, selectedProvider, getToken]);

    useEffect(() => {
        const loadAccounts = async () => {
            const token = await getToken();
            const headers = { "Authorization": `Bearer ${token}` };
            fetch(`${API_BASE}/api/accounts`, { headers })
                .then(r => r.json())
                .then(d => setAccounts(d.accounts ?? []))
                .catch(() => setAccounts([]));
        };
        loadAccounts();
    }, [getToken]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalCurrent = data.reduce((acc, curr) => acc + curr.current_total, 0);
    const totalPrev = data.reduce((acc, curr) => acc + curr.prev_total, 0);
    const overallDelta = totalCurrent - totalPrev;
    const overallDeltaPercent = totalPrev === 0 ? 0 : (overallDelta / totalPrev) * 100;

    // Chart data (Top 5 services)
    const chartData = data.slice(0, 5).map(item => ({
        name: item.service,
        current: item.current_total,
        previous: item.prev_total,
    }));

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Cost Comparison</h1>
                    <p className="text-muted-foreground mt-1">
                        Month-over-Month (MoM) analysis and service breakdown
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-4 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                            <TrendingUp size={14} className="text-primary" />
                            <span>1 USD = Rp {exchangeRate?.toLocaleString("id-ID") ?? "15.700"}</span>
                        </div>
                        <div className="w-[1px] h-3 bg-border" />
                        <CurrencyToggle />
                    </div>
                    <Select value={selectedProvider} onValueChange={(val) => {
                        setSelectedProvider(val ?? "all");
                        setSelectedAccount("all");
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
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Current Month</span>
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Target className="w-4 h-4 text-primary" />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {format(totalCurrent)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Total spend so far this month</p>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Previous Month</span>
                            <div className="p-2 bg-blue-400/10 rounded-lg">
                                <Activity className="w-4 h-4 text-blue-400" />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {format(totalPrev)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Total spend for the full previous month</p>
                    </CardContent>
                </Card>

                <Card className="bg-card border-border overflow-hidden">
                    <div className={`h-1 w-full ${overallDelta > 0 ? "bg-destructive" : "bg-emerald-400"}`} />
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">MoM Change</span>
                            <div className={`p-2 rounded-lg ${overallDelta > 0 ? "bg-destructive/10" : "bg-emerald-400/10"}`}>
                                <TrendingUp className={`w-4 h-4 ${overallDelta > 0 ? "text-destructive" : "text-emerald-400"}`} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <div className={`text-2xl font-bold ${overallDelta > 0 ? "text-destructive" : "text-emerald-400"}`}>
                                {overallDelta >= 0 ? "+" : "-"}{format(Math.abs(overallDelta))}
                            </div>
                            <div className={`text-sm font-semibold flex items-center ${overallDelta > 0 ? "text-destructive" : "text-emerald-400"}`}>
                                ({overallDeltaPercent >= 0 ? "+" : ""}{overallDeltaPercent.toFixed(1)}%)
                                {overallDelta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Difference vs previous month</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Visual Chart */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                            <BarChart3 size={18} className="text-primary" />
                            Service Comparison (Top 5)
                        </CardTitle>
                        <CardDescription>Current vs Previous month by service</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[350px] pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="name" 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <YAxis 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    tickFormatter={(val) => `${symbol}${convert(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'hsl(var(--card))', 
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '8px',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    formatter={(val: number) => [format(val), ""]}
                                />
                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="current" name="This Month" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="previous" name="Last Month" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Delta Table */}
                <Card className="bg-card border-border">
                    <CardHeader>
                        <CardTitle className="text-foreground flex items-center gap-2">
                            <Layers size={18} className="text-primary" />
                            Service Breakdown
                        </CardTitle>
                        <CardDescription>Detailed service-level MoM analysis</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SimpleDataTable
                            data={data}
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
                                    className: "w-[35%]"
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
                                            {row.delta > 0 ? <ArrowUpRight size={14} /> : row.delta < 0 ? <ArrowDownRight size={14} /> : null}
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
