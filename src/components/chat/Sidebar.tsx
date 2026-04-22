// src/components/chat/Sidebar.tsx
import { Search, Plus, LogIn, UserPlus, ListCollapse, MessageSquare, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

export interface ChatHistoryItem {
  id: number;
  title: string;
  preview: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  history: ChatHistoryItem[];
  onSelectChat: (chat: ChatHistoryItem) => void;
  onDeleteChat: (id: number) => void;
  onNewChat: () => void;
  activeChatId: number | null;
  excludeRef: React.RefObject<HTMLDivElement | null>;
}

export function Sidebar({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  history,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  activeChatId,
  excludeRef,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  // monitor for clicks outside the sidebar to trigger closing
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const clickedInsideSidebar = sidebarRef.current?.contains(target);
      const clickedExcluded = excludeRef.current?.contains(target);
      // ignore clicks that occur within the sidebar or specifically excluded elements
      if (!clickedInsideSidebar && !clickedExcluded) onClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, excludeRef]);

  // filter chat history based on the user's search input
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredHistory = trimmedQuery
    ? history.filter((chat) => chat.title.toLowerCase().includes(trimmedQuery))
    : history;

  return (
    <aside
      ref={sidebarRef}
      aria-hidden={!isOpen}
      // handle sidebar transitions and width based on open state
      className={`h-full bg-white border-r border-black/10 flex shrink-0 z-50 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'w-72' : 'w-0 border-none'
        }`}
    >
      <div className="w-72 flex flex-col h-full p-4 space-y-4">
        {/* navigation header and collapse control */}
        <div className="flex items-center justify-between">
          <span className="font-bold tracking-tighter text-black text-lg">TrueLinks AI</span>
          <button
            onClick={onClose}
            aria-label="Collapse sidebar"
            className="p-2 hover:bg-black/15 rounded-xl transition-colors"
          >
            <ListCollapse size={18} />
          </button>
        </div>

        {/* chat history search input */}
        <div className="relative">
          <Search className="absolute left-3 top-3 text-black/40" size={16} />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/5 border border-transparent rounded-xl py-2 pl-10 pr-4 text-sm focus:bg-white focus:border-black/25 outline-none transition-all text-black"
          />
        </div>

        {/* creation button for starting a fresh conversation */}
        <div className="pt-2">
          <button
            onClick={onNewChat}
            className={`w-full flex items-center gap-3 p-3 text-sm font-medium rounded-xl transition-all ${activeChatId === null ? 'bg-black/10 text-black' : 'hover:bg-black/5'
              }`}
          >
            <Plus size={16} /> New Chat
          </button>
        </div>

        {/* scrollable container for chat session items */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 py-4 space-y-1">
          <h3 className="text-[10px] font-bold text-black/30 uppercase tracking-widest px-3 mb-2">
            {trimmedQuery ? 'Matching Intelligence' : 'Recent Intelligence'}
          </h3>

          <div className="flex flex-col gap-1">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredHistory.map((chat) => {
                const isActive = activeChatId === chat.id;
                return (
                  <motion.div
                    key={chat.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 180, damping: 28, mass: 1 },
                      opacity: { duration: 0.2 },
                    }}
                    onClick={() => onSelectChat(chat)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectChat(chat)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group relative cursor-pointer ${isActive ? 'bg-black/10' : 'hover:bg-black/5'
                      }`}
                  >
                    <MessageSquare
                      size={16}
                      className={`shrink-0 transition-colors ${isActive ? 'text-black' : 'text-black/20 group-hover:text-black/50'
                        }`}
                    />
                    <div className="flex-1 truncate pr-6">
                      <p className={`text-[12px] font-semibold truncate ${isActive ? 'text-black' : 'text-black/80'}`}>
                        {chat.title}
                      </p>
                      <p className={`text-[10px] font-normal truncate ${isActive ? 'text-black' : 'text-black/80'}`}>
                        {chat.preview}
                      </p>
                    </div>

                    {/* interactive deletion button visible on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      aria-label={`Delete chat: ${chat.title}`}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-200 text-black/20"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* fallback display for empty search results or history */}
            {filteredHistory.length === 0 && (
              <div className="py-8 text-center px-4">
                <p className="text-xs text-black/30 font-medium italic">
                  {trimmedQuery ? `No chats matching "${searchQuery}"` : 'No history available'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* authentication access points at the bottom of the sidebar */}
        <div className="mt-auto pt-4 border-t border-black/5 space-y-2">
          <button className="w-full flex items-center gap-3 p-3 text-sm font-medium text-black hover:bg-black/15 rounded-xl transition-all">
            <LogIn size={16} /> Login
          </button>
          <button className="w-full flex items-center gap-3 p-3 text-sm font-medium text-white bg-black hover:bg-black/70 rounded-xl transition-all shadow-md">
            <UserPlus size={16} /> Sign Up
          </button>
        </div>
      </div>
    </aside>
  );
}