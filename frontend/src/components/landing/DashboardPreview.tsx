import Image from "next/image";

export function DashboardPreview() {
  return (
    <section className="relative pb-24 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="relative rounded-2xl md:rounded-[2rem] border border-border/50 bg-background/50 p-2 md:p-4 shadow-2xl backdrop-blur-sm overflow-hidden ring-1 ring-white/10 mx-auto transform hover:scale-[1.01] transition-transform duration-500">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
        <div className="rounded-xl overflow-hidden bg-muted flex items-center justify-center aspect-[16/9] relative">
          <Image 
            src="/images/dashboard-main.webp" 
            alt="CloudGazer Dashboard Preview" 
            layout="fill"
            objectFit="cover"
            priority
          />
          {/* Fallback pattern if image is not generated yet */}
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-secondary/80 backdrop-blur-sm -z-10">
            [Dashboard Preview Image Placeholder]
          </div>
        </div>
      </div>
    </section>
  );
}
