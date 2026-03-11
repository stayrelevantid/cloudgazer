"use client"

import * as React from "react"
import { Moon, Sun, Palette, Check } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const themes = [
    { id: "light", label: "Light", icon: Sun, color: "bg-white" },
    { id: "dark", label: "Midnight", icon: Moon, color: "bg-slate-950" },
    { id: "tangerine", label: "Tangerine", icon: Palette, color: "bg-orange-500" },
    { id: "brutalist", label: "Brutalist", icon: Palette, color: "bg-black border border-white" },
    { id: "midnight", label: "Deep Midnight", icon: Moon, color: "bg-blue-950" },
]

export function ThemeToggle() {
    const { setTheme, theme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button variant="ghost" size="icon" className="w-9 px-0 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Palette className="h-[1.2rem] w-[1.2rem] transition-all" />
                        <span className="sr-only">Toggle theme</span>
                    </Button>
                }
            />
            <DropdownMenuContent align="end" className="bg-card border-border text-foreground w-48">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-widest px-2 py-1.5">Theme System</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border" />
                    {themes.map((t) => (
                        <DropdownMenuItem
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className="flex items-center justify-between cursor-pointer focus:bg-muted focus:text-foreground"
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${t.color}`} />
                                <span className={theme === t.id ? "font-medium" : ""}>{t.label}</span>
                            </div>
                            {theme === t.id && <Check size={14} className="text-primary" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
