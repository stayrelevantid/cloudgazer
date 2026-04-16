import { LandingNavbar } from "./LandingNavbar";
import { HeroSection } from "./HeroSection";
import { DashboardPreview } from "./DashboardPreview";
import { FeaturesSection } from "./FeaturesSection";
import { HowItWorks } from "./HowItWorks";
import { Footer } from "./Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
      <LandingNavbar />
      <main className="flex-1">
        <HeroSection />
        <DashboardPreview />
        <FeaturesSection />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
