import { Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

const ComingSoon = ({ title, description, icon: Icon = Rocket }: ComingSoonProps) => (
  <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
      <Icon className="h-8 w-8 text-primary" />
    </div>
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <p className="text-sm text-muted-foreground mt-2 max-w-sm">
      {description || 'This module is currently under development. Stay tuned for updates!'}
    </p>
    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>
      <span className="text-xs font-medium text-primary">Coming Soon</span>
    </div>
  </div>
);

export default ComingSoon;
