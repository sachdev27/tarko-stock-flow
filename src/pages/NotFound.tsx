import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft, Package } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Animated 404 */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl opacity-30">
            <div className="w-full h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
          </div>
          <h1 className="relative text-9xl md:text-[12rem] font-black bg-gradient-to-br from-primary via-blue-600 to-purple-600 bg-clip-text text-transparent animate-pulse">
            404
          </h1>
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
            <div className="relative bg-primary/10 p-6 rounded-full">
              <Package className="h-16 w-16 text-primary animate-bounce" />
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Page Not Found
          </h2>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Looks like this page took an unexpected detour. The route you're looking for doesn't exist in our inventory.
          </p>
          <p className="text-sm text-muted-foreground font-mono bg-muted/50 px-4 py-2 rounded-md inline-block">
            {location.pathname}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button
            size="lg"
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full sm:w-auto gap-2"
          >
            <ArrowLeft className="h-5 w-5" />
            Go Back
          </Button>
          <Button
            size="lg"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto gap-2"
          >
            <Home className="h-5 w-5" />
            Go to Dashboard
          </Button>
        </div>

        {/* Quick Links */}
        <div className="pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-4">Quick Links:</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/inventory')}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              Inventory
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/production')}
            >
              Production
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dispatch')}
            >
              Dispatch
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/reports')}
            >
              Reports
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
