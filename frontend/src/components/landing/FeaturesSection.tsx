import { BarChart3, BellRing, Wallet, Trash2, History, RotateCw } from 'lucide-react';

const features = [
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Multi-Cloud Dashboard",
    description: "Monitor AWS & GCP costs in a single, unified view. No more jumping between different cloud consoles."
  },
  {
    icon: <BellRing className="w-6 h-6" />,
    title: "Smart Alerts",
    description: "Instantly detect cost anomalies and threshold breaches with automated Slack notifications."
  },
  {
    icon: <Wallet className="w-6 h-6" />,
    title: "Budget Tracking",
    description: "Set monthly budgets per account and receive alerts at 50%, 80%, and 100% milestones."
  },
  {
    icon: <Trash2 className="w-6 h-6" />,
    title: "Resource Janitor",
    description: "Identify and clean up idle resources like unattached volumes and obsolete snapshots to cut waste."
  },
  {
    icon: <History className="w-6 h-6" />,
    title: "Historical Reports",
    description: "Track spending trends over time with comprehensive year-over-year and month-over-month comparisons."
  },
  {
    icon: <RotateCw className="w-6 h-6" />,
    title: "Daily Auto-Sync",
    description: "Automated cost fetching via GitHub Actions cron, keeping your dashboard permanently up to date."
  }
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Everything you need to optimize cloud spend</h2>
          <p className="text-xl text-muted-foreground">
            CloudGazer is built with exactly the features you need to get visibility and control over your AWS and GCP bills.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="bg-card p-8 rounded-2xl border transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
