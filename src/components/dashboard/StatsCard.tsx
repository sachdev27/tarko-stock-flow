import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  color: string;
  bgColor: string;
  onClick?: () => void;
}

// Animated counter hook
const useAnimatedCounter = (endValue: number, duration: number = 1000) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof endValue !== 'number' || isNaN(endValue)) {
      setCount(0);
      return;
    }

    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeOutQuart * endValue));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [endValue, duration]);

  return count;
};

export const StatsCard = ({ title, value, icon: Icon, description, color, bgColor, onClick }: StatsCardProps) => {
  const numericValue = typeof value === 'number' ? value : parseInt(String(value)) || 0;
  const animatedValue = useAnimatedCounter(numericValue);
  const displayValue = typeof value === 'number' ? animatedValue.toLocaleString() : value;

  return (
    <Card
      className={`
        relative overflow-hidden
        backdrop-blur-sm bg-card/80
        border border-border/50
        hover:border-primary/30
        hover:shadow-xl hover:shadow-primary/5
        transition-all duration-300 ease-out
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
        group
      `}
      onClick={onClick}
    >
      {/* Gradient overlay */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${bgColor} blur-3xl`} />

      <CardHeader className="relative flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </CardTitle>
        <div className={`
          p-2.5 rounded-xl ${bgColor}
          group-hover:scale-110 group-hover:shadow-lg
          transition-all duration-300 ease-out
        `}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardHeader>

      <CardContent className="relative">
        <div className="text-3xl sm:text-4xl font-bold tracking-tight">
          {displayValue}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 flex items-center gap-1">
            {description}
          </p>
        )}

        {/* Decorative gradient line */}
        <div className={`
          absolute bottom-0 left-0 right-0 h-0.5
          bg-gradient-to-r from-transparent ${bgColor.replace('bg-', 'via-')} to-transparent
          opacity-0 group-hover:opacity-100 transition-opacity duration-500
        `} />
      </CardContent>
    </Card>
  );
};
