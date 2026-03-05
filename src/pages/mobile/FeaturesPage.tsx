import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { navDropdowns } from '@/lib/navConfig';
import { cn } from '@/lib/utils';

const FeaturesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Features</h1>
        <p className="text-gray-600 text-sm mt-1">All features from the top navigation</p>
      </div>

      <div className="space-y-6">
        {navDropdowns.map((section) => (
          <Card key={section.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path + item.label}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'flex items-center gap-3 w-full p-3 rounded-lg text-left transition-colors hover:bg-gray-50 border border-transparent hover:border-gray-200'
                    )}
                  >
                    <div className={cn('shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', item.iconBg || 'bg-gray-100')}>
                      <Icon className={cn('h-4 w-4', item.iconColor || 'text-gray-600')} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-black">{item.label}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500">{item.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FeaturesPage;
