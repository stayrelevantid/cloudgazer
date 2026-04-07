"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/config";
import { Plus, Cloud, Trash2, AlertTriangle, History, Loader2 } from "lucide-react";
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


type Account = {
    id: string;
    user_id: string;
    provider: "aws" | "gcp";
    account_name: string;
    aws_ssm_path: string;
    is_active: boolean;
};

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);

    const [provider, setProvider] = useState("aws");
    const [accountName, setAccountName] = useState("");
    const [ssmPath, setSsmPath] = useState("");

    // Confirmation State
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isMigrateOpen, setIsMigrateOpen] = useState(false);
    const [monthsBack, setMonthsBack] = useState("6");
    const [migrating, setMigrating] = useState<string | null>(null);
    const [confirmData, setConfirmData] = useState<{
        id: string;
        account_name: string;
    } | null>(null);

    const fetchData = () => {
        setLoading(true);
        fetch(`${API_BASE}/api/accounts`)
            .then((r) => r.json())
            .then((d) => setAccounts(d.accounts ?? []))
            .catch(() => setAccounts([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveAccount = async () => {
        if (!accountName || !ssmPath) {
            toast.error("Please fill all fields");
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/accounts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: provider,
                    account_name: accountName,
                    aws_ssm_path: ssmPath
                })
            });

            if (res.ok) {
                setAccountName("");
                setSsmPath("");
                setIsOpen(false);
                fetchData();
                toast.success("Account added successfully!");
            } else {
                toast.error("Failed to insert account");
            }
        } catch {
            toast.error("Error saving account");
        }
    };

    const handleDeleteAccount = async (id: string) => {
        const acc = accounts.find(a => a.id === id);
        setConfirmData({
            id,
            account_name: acc?.account_name || "this account"
        });
        setIsConfirmOpen(true);
    };

    const executeAction = async () => {
        if (!confirmData) return;
        const { id } = confirmData;
        setIsConfirmOpen(false);

        try {
            const res = await fetch(`${API_BASE}/api/accounts?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchData();
                toast.success("Account deleted successfully");
            } else {
                toast.error("Failed to delete account");
            }
        } catch {
            toast.error("Error deleting account");
        }
        setConfirmData(null);
    };

    const handleMigrate = async () => {
        if (!confirmData) return;
        const { id } = confirmData;
        setIsMigrateOpen(false);
        setMigrating(id);

        try {
            const res = await fetch(`${API_BASE}/api/accounts/migrate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: id,
                    months_back: parseInt(monthsBack)
                })
            });

            if (res.ok) {
                toast.success("Historical migration started in background.");
            } else {
                toast.error("Failed to start migration");
            }
        } catch {
            toast.error("Error connecting to migration API");
        } finally {
            setMigrating(null);
            setConfirmData(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Cloud Accounts</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage connected AWS and GCP accounts
                    </p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger render={
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                            <Plus size={16} />
                            Add Account
                        </Button>
                    } />
                    <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Add Cloud Account</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Connect a new AWS or GCP account to start tracking costs.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="provider" className="text-muted-foreground">Provider</Label>
                                <Select value={provider} onValueChange={(val) => setProvider(val || "")}>
                                    <SelectTrigger id="provider" className="bg-background border-border focus:ring-primary">
                                        <SelectValue placeholder="Select provider" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        <SelectItem value="aws">AWS</SelectItem>
                                        <SelectItem value="gcp">Google Cloud</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-muted-foreground">
                                    {provider === "aws" ? "Account Name (Alias)" : "GCP Billing Account ID"}
                                </Label>
                                <Input 
                                    id="name" 
                                    value={accountName} 
                                    onChange={e => setAccountName(e.target.value)} 
                                    placeholder={provider === "aws" ? "e.g. Zenith-Production" : "e.g. 012345-6789AB-CDEF01"} 
                                    className="bg-background border-border focus-visible:ring-primary" 
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="ssm" className="text-muted-foreground">AWS SSM Path</Label>
                                <Input id="ssm" value={ssmPath} onChange={e => setSsmPath(e.target.value)} placeholder="/zenvault/..." className="bg-background border-border focus-visible:ring-primary font-mono text-sm" />
                                <p className="text-xs text-muted-foreground mt-1">Path where credential (Role ARN / SA JSON) is stored securely.</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" onClick={handleSaveAccount} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full">Save Account</Button>
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
                                <TableHead className="text-muted-foreground">Provider</TableHead>
                                <TableHead className="text-muted-foreground">SSM Path</TableHead>
                                <TableHead className="text-muted-foreground">Status</TableHead>
                                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                                        Loading accounts...
                                    </TableCell>
                                </TableRow>
                            ) : accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-16">
                                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                            <Cloud size={36} className="text-muted-foreground/40" />
                                            <p className="text-sm">No cloud accounts connected yet.</p>
                                            <p className="text-xs">Click &quot;+ Add Account&quot; to get started.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                accounts.map((acc) => (
                                    <TableRow key={acc.id} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-medium text-foreground">
                                            {acc.account_name}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    acc.provider === "aws"
                                                        ? "border-orange-500/50 text-orange-400"
                                                        : "border-blue-500/50 text-blue-400"
                                                }
                                            >
                                                {acc.provider.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {acc.aws_ssm_path || "—"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    acc.is_active
                                                        ? "border-green-500/50 text-green-400"
                                                        : "border-border text-muted-foreground"
                                                }
                                            >
                                                {acc.is_active ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right flex items-center justify-end gap-2 text-muted-foreground">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                                                onClick={() => {
                                                    setConfirmData({ id: acc.id, account_name: acc.account_name });
                                                    setIsMigrateOpen(true);
                                                }}
                                                disabled={migrating === acc.id}
                                            >
                                                {migrating === acc.id ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
                                                <span className="hidden sm:inline">Migrate</span>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={() => handleDeleteAccount(acc.id)}>
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

            {/* Custom Premium Deletion Confirmation */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] p-6">
                    <DialogHeader className="items-center text-center">
                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <AlertTriangle className="text-destructive" size={24} />
                        </div>
                        <DialogTitle className="text-xl">Delete Cloud Account?</DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-2 text-center">
                            Are you sure you want to disconnect <b>{confirmData?.account_name}</b>?
                            All associated cost reports and alert configurations will also be removed.
                            This action cannot be undone.
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
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            onClick={executeAction}
                        >
                            Delete Account
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Historical Migration Dialog */}
            <Dialog open={isMigrateOpen} onOpenChange={setIsMigrateOpen}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] p-6">
                    <DialogHeader className="items-center text-center">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <History className="text-primary" size={24} />
                        </div>
                        <DialogTitle className="text-xl">Migrate Historical Data</DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-2 text-center">
                            Fetch past cost data for <b>{confirmData?.account_name}</b>. 
                            This will sync your historical trends up to 12 months back.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-6 grid gap-2">
                        <Label className="text-muted-foreground mb-1 font-medium">Duration (Months)</Label>
                        <Select value={monthsBack} onValueChange={(val) => setMonthsBack(val ?? "6")}>
                            <SelectTrigger className="bg-background border-border">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                <SelectItem value="1">Last Month</SelectItem>
                                <SelectItem value="3">Last 3 Months</SelectItem>
                                <SelectItem value="6">Last 6 Months</SelectItem>
                                <SelectItem value="12">Last 12 Months</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                            * Historical sync may take several minutes to complete in the background.
                        </p>
                    </div>

                    <DialogFooter className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            className="border-border hover:bg-muted text-muted-foreground"
                            onClick={() => {
                                setIsMigrateOpen(false);
                                setConfirmData(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            onClick={handleMigrate}
                        >
                            Start Migration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
