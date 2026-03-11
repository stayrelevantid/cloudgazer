"use client";

import { useCurrency } from "@/contexts/CurrencyContext";
import { Button } from "@/components/ui/button";
import { DollarSign, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export function CurrencyToggle({ className }: { className?: string }) {
    const { currency, setCurrency } = useCurrency();

    return (
        <div className={cn("flex items-center bg-muted/50 p-1 rounded-xl border border-border/50", className)}>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrency("USD")}
                className={cn(
                    "h-8 gap-2 rounded-lg transition-all px-3",
                    currency === "USD" 
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" 
                        : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
            >
                <DollarSign size={14} />
                <span className="text-xs font-bold font-mono">USD</span>
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrency("IDR")}
                className={cn(
                    "h-8 gap-2 rounded-lg transition-all px-3",
                    currency === "IDR" 
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" 
                        : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
            >
                <Coins size={14} />
                <span className="text-xs font-bold font-mono">IDR</span>
            </Button>
        </div>
    );
}
