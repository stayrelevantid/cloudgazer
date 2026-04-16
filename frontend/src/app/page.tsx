import { auth } from "@clerk/nextjs/server";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "CloudGazer — Multi-Cloud Cost Monitoring Dashboard",
  description: "Monitor AWS & GCP costs, detect anomalies, track budgets, and clean up idle resources — all in one open-source dashboard.",
  keywords: ["cloud cost", "AWS", "GCP", "cost monitoring", "cloud optimization"],
  openGraph: {
    title: "CloudGazer — See Every Cloud Dollar",
    description: "Multi-cloud cost monitoring for AWS & GCP",
    images: ["/images/dashboard-main.webp"],
  },
};

import { LandingPage } from "@/components/landing/LandingPage";
import { DashboardContent } from "./(dashboard)/DashboardContent";
import DashboardLayout from "./(dashboard)/layout";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    return (
      <DashboardLayout>
        <DashboardContent />
      </DashboardLayout>
    );
  }

  return <LandingPage />;
}
