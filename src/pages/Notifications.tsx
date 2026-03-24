import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/hooks/useNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const Notifications = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications(currentUser?.id);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const list = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications),
    [filter, notifications]
  );

  const formatNotificationTime = (iso: string) => {
    const created = new Date(iso).getTime();
    const now = Date.now();
    const diffMins = Math.max(1, Math.floor((now - created) / 60000));
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  const getAvatarFallback = (type: string) => {
    if (type === 'leave') return 'LV';
    if (type === 'business_trip') return 'BT';
    if (type === 'overtime') return 'OT';
    if (type === 'survey') return 'SV';
    if (type === 'announcement') return 'AN';
    if (type === 'policy') return 'PL';
    return 'NT';
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View all your in-app notifications.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllAsRead()}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4 mr-2" />
          Mark all as read
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notification Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading notifications...</p>
          ) : list.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-10 w-10 mx-auto text-muted-foreground/60 mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
              </p>
            </div>
          ) : (
            list.map((n) => (
              <button
                key={n.id}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                  !n.is_read ? 'bg-primary/5 border-primary/20 hover:bg-primary/10' : 'hover:bg-muted/50'
                )}
                onClick={() => {
                  if (!n.is_read) markAsRead(n.id);
                  if (n.action_url) navigate(n.action_url);
                }}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarFallback className="text-[10px]">{getAvatarFallback(n.type)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-1">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-primary mt-1">{formatNotificationTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary mt-1" />}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Notifications;
