"use client";

import { useEffect, useState } from "react";
import { Plus, BellRing, Trash2, Send, AlertTriangle } from "lucide-react";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Account = {
    id: string;
    account_name: string;
    provider: string;
};

type AlertConfig = {
    id: string;
    account_id: string;
    account_name: string;
    provider: string;
    channel: string;
    webhook_url: string;
    weekly_threshold: number;
    is_active: boolean;
};

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<AlertConfig[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [selectedAccount, setSelectedAccount] = useState("");
    const [channel, setChannel] = useState("slack");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [threshold, setThreshold] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [testLoading, setTestLoading] = useState<string | null>(null);

    // Confirmation State
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState<{
        type: "test" | "delete";
        chan?: string;
        url?: string;
        id?: string;
        account_name?: string;
    } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [alRes, acRes] = await Promise.all([
                fetch(`${API_BASE}/api/alerts`),
                fetch(`${API_BASE}/api/accounts`),
            ]);
            const alData = await alRes.json();
            const acData = await acRes.json();
            setAlerts(alData.alerts ?? []);
            setAccounts(acData.accounts ?? []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveAlert = async () => {
        if (!selectedAccount || !channel || !threshold || !webhookUrl) {
            toast.error("Please fill all fields");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/alerts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: selectedAccount,
                    channel,
                    webhook_url: webhookUrl,
                    weekly_threshold: parseFloat(threshold),
                }),
            });

            if (res.ok) {
                setWebhookUrl("");
                setThreshold("");
                setIsOpen(false);
                fetchData();
                toast.success("Alert configuration saved!");
            } else {
                toast.error("Failed to save alert");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error submitting alert");
        }
    };

    const handleDeleteAlert = async (accountId: string) => {
        const al = alerts.find(a => a.account_id === accountId);
        setConfirmData({
            type: "delete",
            id: accountId,
            account_name: al?.account_name || "this account"
        });
        setIsConfirmOpen(true);
    };

    const handleTestWebhook = async (chan: string, url: string, id: string = "manual") => {
        if (!url) {
            toast.error("Please provide a webhook URL first");
            return;
        }

        setConfirmData({ type: "test", chan, url, id });
        setIsConfirmOpen(true);
    };

    const executeAction = async () => {
        if (!confirmData) return;
        const { type, id, chan, url } = confirmData;

        setIsConfirmOpen(false);

        if (type === "delete" && id) {
            try {
                const res = await fetch(`${API_BASE}/api/alerts?account_id=${id}`, { method: "DELETE" });
                if (res.ok) {
                    fetchData();
                    toast.success("Alert configuration deleted");
                } else {
                    toast.error("Failed to delete alert");
                }
            } catch {
                toast.error("Error deleting alert");
            }
        } else if (type === "test" && chan && url) {
            setTestLoading(id || "manual");
            try {
                const res = await fetch(`${API_BASE}/api/alerts/test`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channel: chan, webhook_url: url }),
                });
                if (res.ok) {
                    toast.success("Test notification sent successfully!");
                } else {
                    const err = await res.json();
                    toast.error(`Failed to send test: ${err.error}`);
                }
            } catch {
                toast.error("Error connecting to backend");
            } finally {
                setTestLoading(null);
            }
        }
        setConfirmData(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Alert Configs</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Set up warnings when spend threshold is exceeded
                    </p>
                </div>

                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger render={<Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                        <Plus size={16} />
                        Add Alert
                    </Button>} />
                    <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Configure Alert</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Receive notifications when weekly cost exceeds limit.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="account" className="text-muted-foreground">Cloud Account</Label>
                                <Select value={selectedAccount} onValueChange={(val) => setSelectedAccount(val || "")}>
                                    <SelectTrigger id="account" className="bg-background border-border focus:ring-primary">
                                        <SelectValue placeholder="Select an account" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id}>
                                                {acc.account_name} ({acc.provider.toUpperCase()})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="channel" className="text-muted-foreground">Notification Channel</Label>
                                <Select value={channel} onValueChange={(val) => setChannel(val || "")}>
                                    <SelectTrigger id="channel" className="bg-background border-border focus:ring-primary">
                                        <SelectValue placeholder="Select channel" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="slack">Slack Webhook</SelectItem>
                                        <SelectItem value="telegram">Telegram Bot</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="webhook" className="text-muted-foreground">Webhook URL</Label>
                                <Input
                                    id="webhook"
                                    value={webhookUrl}
                                    onChange={e => setWebhookUrl(e.target.value)}
                                    placeholder="https://hooks.slack.com/..."
                                    className="bg-background border-border focus-visible:ring-primary text-sm"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="limit" className="text-muted-foreground">Weekly Threshold (USD)</Label>
                                <Input
                                    id="limit"
                                    type="number"
                                    step="0.01"
                                    value={threshold}
                                    onChange={e => setThreshold(e.target.value)}
                                    placeholder="10.50"
                                    className="bg-background border-border focus-visible:ring-primary"
                                />
                            </div>
                        </div>
                        <DialogFooter className="flex flex-col sm:flex-row gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-border text-muted-foreground hover:bg-muted"
                                onClick={() => handleTestWebhook(channel, webhookUrl, "dialog")}
                                disabled={testLoading === "dialog"}
                            >
                                {testLoading === "dialog" ? "Testing..." : "Test Webhook"}
                            </Button>
                            <Button type="button" onClick={handleSaveAlert} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full">
                                Save Configuration
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground">Account Name</TableHead>
                                <TableHead className="text-muted-foreground">Weekly Limit (USD)</TableHead>
                                <TableHead className="text-muted-foreground">Channel</TableHead>
                                <TableHead className="text-muted-foreground">Status</TableHead>
                                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                                        Loading alerts...
                                    </TableCell>
                                </TableRow>
                            ) : alerts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-16">
                                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                            <BellRing size={36} className="text-muted-foreground/40" />
                                            <p className="text-sm">No alert configurations defined.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                alerts.map((al) => (
                                    <TableRow key={al.id} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-medium text-foreground">
                                            {al.account_name}
                                            <span className="text-muted-foreground text-xs ml-2 uppercase">({al.provider})</span>
                                        </TableCell>
                                        <TableCell className="text-primary font-mono">
                                            ${al.weekly_threshold.toFixed(2)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="border-border text-muted-foreground capitalize">
                                                {al.channel}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    al.is_active
                                                        ? "border-green-500/50 text-green-400"
                                                        : "border-border text-muted-foreground"
                                                }
                                            >
                                                {al.is_active ? "Active" : "Disabled"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                onClick={() => handleTestWebhook(al.channel, al.webhook_url, al.id)}
                                                disabled={testLoading === al.id}
                                            >
                                                <Send size={16} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={() => handleDeleteAlert(al.account_id)}>
                                                <Trash2 size={16} />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Custom Premium Confirmation Dialog */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] p-6">
                    <DialogHeader className="items-center text-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${confirmData?.type === "delete" ? "bg-destructive/10" : "bg-primary/20"
                            }`}>
                            {confirmData?.type === "delete" ? (
                                <AlertTriangle className="text-destructive" size={24} />
                            ) : (
                                <Send className="text-primary" size={24} />
                            )}
                        </div>
                        <DialogTitle className="text-xl text-center">
                            {confirmData?.type === "delete" ? "Delete Alert Config?" : "Send Test Notification?"}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-2 text-center">
                            {confirmData?.type === "delete" ? (
                                <>Are you sure you want to delete the alert configuration for <b>{confirmData?.account_name}</b>? This action cannot be undone context.</>
                            ) : (
                                <>This will send a test message to your <b>{confirmData?.chan}</b> webhook to verify the integration.</>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="grid grid-cols-2 gap-3 mt-6">
                        <Button
                            variant="outline"
                            className="border-border hover:bg-muted text-muted-foreground"
                            onClick={() => {
                                setIsConfirmOpen(false);
                                setConfirmData(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            className={`${confirmData?.type === "delete"
                                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                : "bg-primary hover:bg-primary/90 text-primary-foreground"
                                }`}
                            onClick={executeAction}
                        >
                            {confirmData?.type === "delete" ? "Delete Mapping" : "Send Now"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
