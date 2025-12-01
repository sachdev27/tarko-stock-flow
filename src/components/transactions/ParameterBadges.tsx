// Parameter badges component
import { Badge } from '@/components/ui/badge';

interface ParameterBadgesProps {
  parameters?: Record<string, string | undefined>;
}

export const ParameterBadges = ({ parameters }: ParameterBadgesProps) => {
  if (!parameters || Object.keys(parameters).length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {parameters.OD && (
        <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900">
          OD: {parameters.OD}
        </Badge>
      )}
      {parameters.PN && (
        <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900">
          PN: {parameters.PN}
        </Badge>
      )}
      {parameters.PE && (
        <Badge variant="secondary" className="text-xs bg-purple-100 dark:bg-purple-900">
          PE: {parameters.PE}
        </Badge>
      )}
      {parameters.Type && (
        <Badge variant="secondary" className="text-xs bg-orange-100 dark:bg-orange-900">
          Type: {parameters.Type}
        </Badge>
      )}
    </div>
  );
};
