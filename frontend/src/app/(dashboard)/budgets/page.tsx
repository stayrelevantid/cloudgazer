"use client";

import { useEffect, useState } from "react";
import { Plus, Wallet, Trash2, AlertCircle, Percent, Pencil } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Budget = {
    id: string;
    account_id: string;
    account_name: string;
    provider: string;
    amount: number;
    current_spend: number;
    is_active: boolean;
};

type Account = {
    id: string;
    account_name: string;
    provider: string;
};

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);

    const [selectedAccount, setSelectedAccount] = useState("");
    const [amount, setAmount] = useState("");
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [bRes, aRes] = await Promise.all([
                fetch(`${API_BASE}/api/budgets`),
                fetch(`${API_BASE}/api/accounts`)
            ]);
            const bData = await bRes.json();
            const aData = await aRes.json();
            setBudgets(bData.budgets ?? []);
            setAccounts(aData.accounts ?? []);
        } catch {
            toast.error("Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveBudget = async () => {
        if (!selectedAccount || !amount) {
            toast.error("Please fill all fields");
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/budgets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    account_id: selectedAccount,
                    amount: parseFloat(amount)
                })
            });

            if (res.ok) {
                setAmount("");
                setSelectedAccount("");
                setIsOpen(false);
                setEditingBudget(null);
                fetchData();
                toast.success(editingBudget ? "Budget updated successfully!" : "Budget saved successfully!");
            } else {
                toast.error("Failed to save budget");
            }
        } catch {
            toast.error("Error connecting to server");
        }
    };

    const handleEditClick = (budget: Budget) => {
        setEditingBudget(budget);
        setSelectedAccount(budget.account_id);
        setAmount(budget.amount.toString());
        setIsOpen(true);
    };

    const handleDeleteBudget = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/budgets?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchData();
                toast.success("Budget removed");
            } else {
                toast.error("Failed to remove budget");
            }
        } catch {
            toast.error("Error deleting budget");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Budget Management</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track monthly spending against your defined limits
                    </p>
                </div>
                <Dialog open={isOpen} onOpenChange={(open) => {
                    setIsOpen(open);
                    if (!open) {
                        setEditingBudget(null);
                        setSelectedAccount("");
                        setAmount("");
                    }
                }}>
                    <DialogTrigger>
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                            <Plus size={16} />
                            Set Budget
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Set Monthly Budget</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Define a monthly spending limit for a cloud account.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="account" className="text-muted-foreground">Cloud Account</Label>
                                <Select 
                                    value={selectedAccount} 
                                    onValueChange={(val) => setSelectedAccount(val ?? "")}
                                    disabled={!!editingBudget}
                                >
                                    <SelectTrigger id="account" className="bg-background border-border">
                                        <SelectValue placeholder="Select account" />
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
                                <Label htmlFor="amount" className="text-muted-foreground">Monthly Limit (USD)</Label>
                                <Input 
                                    id="amount" 
                                    type="number" 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    placeholder="e.g. 500" 
                                    className="bg-background border-border" 
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" onClick={handleSaveBudget} className="bg-primary hover:bg-primary/90 text-primary-foreground w-full">
                                {editingBudget ? "Update Budget" : "Save Budget"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2].map(i => (
                        <Card key={i} className="animate-pulse bg-card border-border h-40" />
                    ))}
                </div>
            ) : budgets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center flex flex-col items-center gap-4 text-muted-foreground">
                    <Wallet size={48} className="opacity-20" />
                    <div>
                        <p className="font-medium text-foreground">No budgets set</p>
                        <p className="text-sm">Connect accounts and set monthly limits to track spending.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {budgets.map((b) => {
                        const percent = b.amount > 0 ? (b.current_spend / b.amount) * 100 : 0;
                        const isOver = percent >= 100;
                        const isWarning = percent >= 80;

                        return (
                            <Card key={b.id} className="bg-card border-border overflow-hidden relative group">
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-lg text-foreground">{b.account_name}</h3>
                                                <Badge variant="outline" className={b.provider === 'aws' ? 'border-orange-500/30 text-orange-400' : 'border-blue-500/30 text-blue-400'}>
                                                    {b.provider.toUpperCase()}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">Monthly Spending Track</p>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-muted-foreground hover:text-primary"
                                                onClick={() => handleEditClick(b)}
                                            >
                                                <Pencil size={16} />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDeleteBudget(b.id)}
                                            >
                                                <Trash2 size={16} />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-1">
                                                <p className="text-2xl font-bold text-foreground">
                                                    ${b.current_spend.toFixed(2)}
                                                    <span className="text-sm font-normal text-muted-foreground ml-1">
                                                        / ${b.amount.toFixed(0)}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className={`flex items-center gap-1 font-medium ${isOver ? 'text-destructive' : isWarning ? 'text-orange-400' : 'text-primary'}`}>
                                                <Percent size={14} />
                                                {percent.toFixed(1)}%
                                            </div>
                                        </div>

                                        <Progress 
                                            value={Math.min(percent, 100)} 
                                            className={isOver ? 'bg-destructive/20' : isWarning ? 'bg-orange-500/20' : ''} 
                                        />

                                        {isOver && (
                                            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-lg">
                                                <AlertCircle size={14} />
                                                Budget limit exceeded
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
