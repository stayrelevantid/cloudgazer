import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Cloud, Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function LandingNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <Cloud className="h-8 w-8 text-primary" />
              <span className="font-bold text-xl tracking-tight">CloudGazer</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link href="#features" className="text-secondary-foreground hover:text-primary transition-colors">Features</Link>
            <Link href="#how-it-works" className="text-secondary-foreground hover:text-primary transition-colors">How it Works</Link>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link href="/sign-in">
                <Button variant="outline" className="font-medium">Sign In</Button>
              </Link>
              <Link href="/sign-in">
                <Button className="font-medium">Get Started</Button>
              </Link>
            </div>
          </div>

          <div className="md:hidden flex items-center space-x-4">
            <ThemeToggle />
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
