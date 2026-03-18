import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarFallbackFromFullName } from '@/lib/utils';
import { isImageUrl } from '@/lib/attachmentUtils';
import { supabase } from '@/lib/supabase';
import { ExternalLink } from 'lucide-react';

const FeedsPage = () => {
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; author: string; author_avatar_url?: string | null; attachment_url?: string | null; is_pinned?: boolean; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('announcements')
        .select('id, title, content, created_at, publish_date, expiration_date, attachment_url, is_pinned, author:employees!author_id(first_name, last_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(20);
      const filtered = (data || []).filter((a: any) => {
        const pub = a.publish_date || a.created_at?.slice(0, 10);
        if (pub && pub > today) return false;
        const exp = a.expiration_date;
        if (exp && exp < today) return false;
        return true;
      }).slice(0, 10);
      const mapped = filtered.map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
        author_avatar_url: a.author?.avatar_url ?? null,
        attachment_url: a.attachment_url ?? null,
        is_pinned: a.is_pinned ?? false,
        created_at: a.created_at,
      }));
      mapped.sort((a: any, b: any) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setAnnouncements(mapped);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Feeds</h1>
        <p className="text-gray-600 text-sm mt-1">Recent activity and updates</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-4">Loading...</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={a.author_avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getAvatarFallbackFromFullName(a.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-black">{a.title}</p>
                    <p className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-600">{a.content}</p>
                {a.attachment_url && (
                  isImageUrl(a.attachment_url) ? (
                    <div className="mt-3">
                      <img src={a.attachment_url} alt="Attachment" className="max-w-full max-h-64 rounded-lg border object-contain" />
                    </div>
                  ) : (
                    <a
                      href={a.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View attachment
                    </a>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeedsPage;
