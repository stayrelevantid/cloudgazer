import Sidebar from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { CurrencyProvider } from "@/contexts/CurrencyContext";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <CurrencyProvider>
            <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
                <Navbar />
                <Sidebar />
                <main className="flex-1 overflow-auto pt-20 lg:pt-8 p-4 lg:p-8">
                    <div className="max-w-7xl mx-auto space-y-8">
                        {children}
                    </div>
                </main>
            </div>
        </CurrencyProvider>
    );
}
