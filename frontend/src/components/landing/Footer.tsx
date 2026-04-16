import { Cloud, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-secondary/20 border-t py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center space-x-2">
          <Cloud className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">CloudGazer</span>
        </div>
        
        <p className="text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} CloudGazer. Open Source and Free to Use.
        </p>

        <div className="flex space-x-4">
          <a href="https://github.com/stayrelevantid/cloudgazer" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
            <span className="sr-only">GitHub</span>
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
