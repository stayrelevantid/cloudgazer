"use client"

import Link from "next/link"
import { Menu, LayoutDashboard, Cloud, BellRing } from "lucide-react"
import { UserButton } from "@clerk/nextjs"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { ThemeToggle } from "./ThemeToggle"
import { cn } from "@/lib/utils"

const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Accounts", href: "/accounts", icon: Cloud },
    { label: "Alerts", href: "/alerts", icon: BellRing },
]

export function Navbar() {
    const pathname = usePathname()

    return (
        <header className="fixed top-0 left-0 right-0 h-16 border-b border-border bg-background/80 backdrop-blur-md z-40 lg:hidden flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
                <Sheet>
                    <SheetTrigger
                        render={
                            <Button variant="ghost" size="icon" className="text-muted-foreground w-10">
                                <Menu size={24} />
                            </Button>
                        }
                    />
                    <SheetContent side="left" className="bg-background border-r border-border p-0 w-72">
                        <SheetHeader className="p-6 border-b border-border text-left">
                            <SheetTitle className="text-xl font-bold tracking-tight">
                                ☁️ CloudGazer
                            </SheetTitle>
                        </SheetHeader>
                        <div className="flex flex-col gap-1 p-4">
                            {navItems.map(({ label, href, icon: Icon }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className={cn(
                                        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-muted",
                                        pathname === href
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground"
                                    )}
                                >
                                    <Icon size={20} />
                                    {label}
                                </Link>
                            ))}
                        </div>
                        <div className="mt-auto p-4 border-t border-border flex items-center gap-3">
                            <UserButton />
                            <span className="text-sm font-medium">My Account</span>
                        </div>
                    </SheetContent>
                </Sheet>
                <span className="font-bold text-lg">CloudGazer</span>
            </div>

            <div className="flex items-center gap-2">
                <ThemeToggle />
                <UserButton />
            </div>
        </header>
    )
}
