import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Github } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-grid-slate-100/[0.04] bg-[size:20px_20px]" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center space-x-2 bg-secondary/50 backdrop-blur-sm px-4 py-2 rounded-full mb-8 border">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium">✨ Open Source & Free to Use</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
          See Every Cloud Dollar.<br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
            Cut What You Don&apos;t Need.
          </span>
        </h1>
        
        <p className="max-w-2xl mx-auto text-xl text-muted-foreground mb-12">
          Multi-cloud cost monitoring for AWS & GCP. Get anomaly alerts, track budgets, and clean up idle resources inside one unified dashboard.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/sign-in">
            <Button size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/25 group">
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <a href="https://github.com/stayrelevantid/cloudgazer" target="_blank" rel="noreferrer">
            <Button size="lg" variant="outline" className="h-14 px-8 text-base">
              <Github className="mr-2 h-4 w-4" />
              View on GitHub
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
