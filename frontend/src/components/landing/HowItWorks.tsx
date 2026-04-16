import { KeyRound, LineChart, Zap } from 'lucide-react';

const steps = [
  {
    icon: <KeyRound className="w-8 h-8" />,
    title: "1. Connect",
    description: "Add your AWS or GCP accounts securely via AWS Systems Manager Parameter Store credentials."
  },
  {
    icon: <LineChart className="w-8 h-8" />,
    title: "2. Monitor",
    description: "Our backend automatically fetches and aggregates your daily cost data across all platforms."
  },
  {
    icon: <Zap className="w-8 h-8" />,
    title: "3. Optimize",
    description: "Receive anomaly alerts, track budgets, and use the Janitor tool to delete wasted resources."
  }
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">How CloudGazer Works</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get setup in minutes and start saving on your cloud bills today.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-[45px] left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-transparent via-border to-transparent" />
          
          {steps.map((step, idx) => (
            <div key={idx} className="relative flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-background border-4 border-secondary flex items-center justify-center text-primary shadow-xl mb-6 relative z-10">
                {step.icon}
              </div>
              <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-xs">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
