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
    { id: "dark", label: "Midnight Zinc", icon: Moon, color: "bg-zinc-900" },
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
                    <Button variant="ghost" size="icon" className="w-9 px-0 text-zinc-400 hover:text-white hover:bg-zinc-800">
                        <Palette className="h-[1.2rem] w-[1.2rem] transition-all" />
                        <span className="sr-only">Toggle theme</span>
                    </Button>
                }
            />
            <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-white w-48">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-zinc-500 text-xs uppercase tracking-widest px-2 py-1.5">Theme System</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    {themes.map((t) => (
                        <DropdownMenuItem
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className="flex items-center justify-between cursor-pointer focus:bg-zinc-800 focus:text-white"
                        >
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${t.color}`} />
                                <span>{t.label}</span>
                            </div>
                            {theme === t.id && <Check size={14} className="text-violet-400" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
