"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Currency = "USD" | "IDR";

interface CurrencyContextType {
    currency: Currency;
    setCurrency: (currency: Currency) => void;
    convert: (amount: number) => number;
    format: (amount: number) => string;
    symbol: string;
    exchangeRate: number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const DEFAULT_RATE = 15700;

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
    const [currency, setCurrencyState] = useState<Currency>("USD");
    const [exchangeRate, setExchangeRate] = useState(DEFAULT_RATE);

    useEffect(() => {
        const saved = localStorage.getItem("app_currency") as Currency;
        if (saved && (saved === "USD" || saved === "IDR")) {
            setCurrencyState(saved);
        }

        // Fetch latest rate from Frankfurter API
        fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR")
            .then(res => res.json())
            .then(data => {
                if (data?.rates?.IDR) {
                    setExchangeRate(data.rates.IDR);
                }
            })
            .catch(err => console.error("Failed to fetch exchange rate:", err));
    }, []);

    const setCurrency = (c: Currency) => {
        setCurrencyState(c);
        localStorage.setItem("app_currency", c);
    };

    const convert = (amount: number) => {
        if (currency === "USD") return amount;
        return amount * exchangeRate;
    };

    const format = (amount: number) => {
        const converted = convert(amount);
        if (currency === "USD") {
            return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 2,
            }).format(converted);
        } else {
            return new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
            }).format(converted).replace("IDR", "Rp");
        }
    };

    const symbol = currency === "USD" ? "$" : "Rp";

    // Prevent hydration mismatch by only providing context after mount
    const value = {
        currency,
        setCurrency,
        convert,
        format,
        symbol,
        exchangeRate
    };

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error("useCurrency must be used within a CurrencyProvider");
    }
    return context;
}
