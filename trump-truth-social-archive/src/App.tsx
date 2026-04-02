import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  RefreshCw, 
  ExternalLink, 
  MessageSquare, 
  Repeat2, 
  Heart, 
  Calendar,
  Search,
  TrendingUp,
  Clock,
  User,
  Languages,
  FileText,
  Image as ImageIcon,
  Film
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/src/lib/utils";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface TruthPost {
  id: string;
  created_at: string;
  content: string;
  reblogs_count: number;
  favourites_count: number;
  replies_count: number;
  url: string;
  account: {
    username: string;
    display_name: string;
    avatar: string;
  };
  media_attachments?: Array<{
    type: string;
    url: string;
    preview_url: string;
  }>;
}

function PostSummary({ content }: { content: string }) {
  const [summary, setSummary] = useState<{ en: string; zh: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const generateSummary = async () => {
    if (summary || loading) return;
    setLoading(true);
    try {
      // Remove HTML tags from content for better summary
      const plainText = content.replace(/<[^>]*>?/gm, '');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Please provide a concise bilingual summary (English and Traditional Chinese) for the following post content. 
        Format the output as a JSON object with keys "en" and "zh".
        Content: ${plainText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              en: { type: Type.STRING },
              zh: { type: Type.STRING }
            },
            required: ["en", "zh"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      setSummary(result);
    } catch (err) {
      console.error("Summary generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateSummary();
  }, [content]);

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-gray-50 border border-dashed border-[#141414]/20 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-4 p-4 bg-[#141414] text-[#E4E3E0] border border-[#141414]">
      <div className="flex items-center gap-2 mb-3 opacity-50">
        <Languages size={14} />
        <span className="text-[10px] uppercase tracking-widest font-mono">AI Bilingual Summary</span>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs leading-relaxed font-sans">{summary.en}</p>
        </div>
        <div className="pt-3 border-t border-[#E4E3E0]/20">
          <p className="text-xs leading-relaxed font-sans">{summary.zh}</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [posts, setPosts] = useState<TruthPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/truth-social");
      if (!response.ok) throw new Error("Failed to fetch data");
      const data = await response.json();
      // The CNN JSON seems to be an array of posts or an object containing them
      // Based on typical Truth Social API exports, it's usually an array
      setPosts(Array.isArray(data) ? data : data.posts || []);
      setError(null);
    } catch (err) {
      setError("無法取得資料，請稍後再試。");
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // Auto refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const filteredPosts = useMemo(() => {
    const now = new Date();
    return posts
      .filter(post => {
        const postDate = new Date(post.created_at);
        // Filter for last 24 hours
        const isRecent = now.getTime() - postDate.getTime() <= 24 * 60 * 60 * 1000;
        const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase());
        return isRecent && matchesSearch;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [posts, searchTerm]);

  const stats = {
    total: posts.length,
    recent: filteredPosts.length,
    avgLikes: Math.round(posts.reduce((acc, p) => acc + (p.favourites_count || 0), 0) / (posts.length || 1))
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#E4E3E0]/80 backdrop-blur-md border-b border-[#141414] px-4 py-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] rounded-full flex items-center justify-center text-[#E4E3E0]">
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 className="font-serif italic text-2xl leading-none">Truth Archive</h1>
              <p className="text-[10px] uppercase tracking-widest opacity-50 font-mono mt-1">Donald J. Trump • Real-time Feed</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
              <input 
                type="text"
                placeholder="搜尋貼文內容..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/50 border border-[#141414]/20 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-[#141414] transition-colors"
              />
            </div>
            <button 
              onClick={fetchData}
              disabled={isRefreshing}
              className="p-2 rounded-full border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all disabled:opacity-50"
            >
              <RefreshCw size={20} className={cn(isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: "資料庫總量", value: stats.total, icon: MessageSquare },
            { label: "近 24 小時貼文", value: stats.recent, icon: Clock },
            { label: "平均喜愛", value: stats.avgLikes.toLocaleString(), icon: Heart },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-[#141414] p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="font-serif italic text-sm opacity-50">{stat.label}</span>
                <stat.icon size={16} className="opacity-30" />
              </div>
              <div className="text-4xl font-mono mt-4 tracking-tighter">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Feed */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-30">
              <RefreshCw size={40} className="animate-spin mb-4" />
              <p className="font-mono text-xs uppercase tracking-widest">正在同步資料庫...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 p-8 text-center text-red-600 rounded-lg">
              <p>{error}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredPosts.map((post) => (
                <motion.article 
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-[#141414] overflow-hidden group hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-[#141414] overflow-hidden bg-gray-100">
                          <img 
                            src={post.account?.avatar || "https://picsum.photos/seed/trump/100/100"} 
                            alt="Avatar" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="font-bold text-sm">{post.account?.display_name || "Donald J. Trump"}</div>
                          <div className="text-[10px] font-mono opacity-50">@{post.account?.username || "realDonaldTrump"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono opacity-50">
                        <Calendar size={12} />
                        {format(new Date(post.created_at), "yyyy/MM/dd HH:mm")}
                      </div>
                    </div>

                    <div 
                      className="text-lg leading-relaxed mb-6 whitespace-pre-wrap break-words border-l-4 border-[#141414] pl-4 py-1"
                      dangerouslySetInnerHTML={{ __html: post.content }}
                    />

                    <PostSummary content={post.content} />

                    {post.media_attachments && post.media_attachments.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-[#141414]/10 space-y-2">
                        <div className="text-[10px] uppercase tracking-widest opacity-50 font-mono mb-2">媒體附件 (Media Links)</div>
                        {post.media_attachments.map((media, idx) => (
                          <a 
                            key={idx} 
                            href={media.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-blue-600 hover:underline group/link"
                          >
                            {media.type === 'image' ? <ImageIcon size={14} /> : <Film size={14} />}
                            <span className="truncate max-w-xs">{media.url}</span>
                            <ExternalLink size={10} className="opacity-0 group-hover/link:opacity-100 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="pt-6 border-t border-[#141414]/10 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 group/stat cursor-default">
                          <MessageSquare size={16} className="group-hover/stat:text-blue-500 transition-colors" />
                          <span className="text-xs font-mono">{post.replies_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-2 group/stat cursor-default">
                          <Repeat2 size={16} className="group-hover/stat:text-green-500 transition-colors" />
                          <span className="text-xs font-mono">{post.reblogs_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-2 group/stat cursor-default">
                          <Heart size={16} className="group-hover/stat:text-red-500 transition-colors" />
                          <span className="text-xs font-mono">{post.favourites_count || 0}</span>
                        </div>
                      </div>
                      
                      <a 
                        href={post.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest hover:underline"
                      >
                        原始連結 <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          )}
          
          {!loading && filteredPosts.length === 0 && (
            <div className="text-center py-20 border border-dashed border-[#141414]/30 rounded-xl">
              <p className="font-serif italic opacity-50">找不到符合搜尋條件的貼文</p>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-[#141414] mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 opacity-50 text-[10px] font-mono uppercase tracking-widest">
          <p>© 2026 TRUMP TRUTH ARCHIVE • AI POWERED BILINGUAL SUMMARY</p>
          <p>篩選條件: 近 24 小時 • 自動更新: 5 分鐘</p>
        </div>
      </footer>
    </div>
  );
}
