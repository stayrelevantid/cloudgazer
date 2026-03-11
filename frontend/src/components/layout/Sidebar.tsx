"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { LayoutDashboard, Cloud, BellRing, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./ThemeToggle";

const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Accounts", href: "/accounts", icon: Cloud },
    { label: "Alerts", href: "/alerts", icon: BellRing },
    { label: "Janitor", href: "/janitor", icon: Sparkles },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-sidebar border-r border-border px-4 py-6 z-50">
            {/* Logo */}
            <div className="mb-10 px-3 flex items-center justify-between">
                <span className="text-xl font-bold tracking-tight text-foreground">
                    ☁️ CloudGazer
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-1.5 flex-1">
                {navItems.map(({ label, href, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                                active
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon size={18} className={cn(active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                            {label}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="flex flex-col gap-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between px-2">
                    <UserButton />
                    <ThemeToggle />
                </div>
                <div className="px-2 pb-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cloud Monitoring v1.0</p>
                </div>
            </div>
        </aside>
    );
}
