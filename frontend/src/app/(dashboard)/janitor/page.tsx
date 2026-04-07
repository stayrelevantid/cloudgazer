"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { Trash2, ShieldAlert, Cpu, Globe, RefreshCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


type Resource = {
    id: string;
    type: string;
    name: string;
    launch_time?: string;
    cost_monthly?: number;
    console_url?: string;
};

type JanitorResult = {
    account_name: string;
    provider: string;
    resources: Resource[];
};

export default function JanitorPage() {
    const [results, setResults] = useState<JanitorResult[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/janitor`);
            const data = await res.json();
            setResults(data.janitor ?? []);
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch janitor suggestions");
        } finally {
            setLoading(false);
        }
    };

    const handleRelease = (id: string) => {
        // Mock release action
        toast.success(`Resource ${id} scheduled for deletion`);
        // Remove from local state for better UX
        setResults(prev => prev.map(acc => ({
            ...acc,
            resources: acc.resources.filter(r => r.id !== id)
        })).filter(acc => acc.resources.length > 0));
    };

    useEffect(() => {
        fetchData();
    }, []);

    const totalResources = results.reduce((acc, curr) => acc + curr.resources.length, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Janitor Suggestions</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Identify and clean up idle or unattached cloud resources
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={fetchData}
                    disabled={loading}
                    className="gap-2 border-border text-muted-foreground hover:bg-muted"
                >
                    <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
                    Refresh
                </Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="bg-card border-border animate-pulse">
                            <CardHeader className="h-24 bg-muted/20" />
                            <CardContent className="h-32" />
                        </Card>
                    ))}
                </div>
            ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                    <ShieldAlert size={48} className="mb-4 opacity-20" />
                    <h3 className="text-lg font-medium">Your cloud is squeaky clean!</h3>
                    <p className="text-sm">No idle or unattached resources found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-full text-primary">
                                    <Trash2 size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Summary</h3>
                                    <p className="text-sm text-muted-foreground">
                                        We found <b>{totalResources}</b> idle resources across <b>{results.length}</b> accounts.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {results.map((res, idx) => (
                        <div key={idx} className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="uppercase border-primary/50 text-primary">
                                    {res.provider}
                                </Badge>
                                <h2 className="text-lg font-semibold text-foreground">{res.account_name}</h2>
                            </div>

                            <div className="rounded-xl border border-border bg-card overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-border hover:bg-transparent">
                                            <TableHead className="text-muted-foreground">Type</TableHead>
                                            <TableHead className="text-muted-foreground">Resource ID / Name</TableHead>
                                            <TableHead className="text-muted-foreground">Status</TableHead>
                                            <TableHead className="text-muted-foreground text-right font-medium">Potential Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {res.resources.map((item) => (
                                            <TableRow key={item.id} className="border-border hover:bg-muted/50 transition-colors">
                                                <TableCell className="w-24">
                                                    <div className="flex items-center gap-2 text-foreground font-medium">
                                                        {(item.type === "EBS" || item.type === "GCE Disk") ? (
                                                            <Cpu size={16} className={item.type === "EBS" ? "text-orange-400" : "text-blue-400"} />
                                                        ) : (
                                                            <Globe size={16} className={item.type === "EIP" ? "text-blue-400" : "text-emerald-400"} />
                                                        )}
                                                        {item.type}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-sm text-foreground">{item.id}</span>
                                                        {item.name && <span className="text-xs text-muted-foreground">{item.name}</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                                        Unused
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-primary hover:bg-primary/10 hover:text-primary gap-1"
                                                        onClick={() => {
                                                            if (item.console_url) {
                                                                window.open(item.console_url, "_blank");
                                                            } else {
                                                                toast.info("Console URL not available for this resource");
                                                            }
                                                        }}
                                                    >
                                                        <ExternalLink size={14} />
                                                        Manage in Console
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
