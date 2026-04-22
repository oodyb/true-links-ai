// src/components/chat/Header.tsx
'use client';

import { Menu } from 'lucide-react';

interface HeaderProps {
  isSidebarOpen: boolean;
  onMenuClick: () => void;
  chatTitle?: string;
}

export function Header({ isSidebarOpen, onMenuClick, chatTitle }: HeaderProps) {
  return (
    // container with a gradient fade to blur background content as it scrolls under
    <div className="absolute top-0 inset-x-0 h-36 z-40 pointer-events-none bg-gradient-to-b from-white via-white via-50% to-transparent">

      {/* sidebar toggle and external links grouped on the left */}
      <div
        className="absolute top-6 left-6 flex flex-row items-center gap-2 pointer-events-auto transition-opacity duration-300"
        style={{
          opacity: isSidebarOpen ? 0 : 1,
          pointerEvents: isSidebarOpen ? 'none' : 'auto',
        }}
      >
        <button
          onClick={onMenuClick}
          aria-label="Open sidebar"
          className="p-3 bg-white rounded-xl hover:bg-black/15 transition-all cursor-pointer"
        >
          <Menu size={20} />
        </button>
        <a
          href="https://truelinks.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 px-4 bg-white rounded-xl hover:bg-black/15 transition-all flex items-center justify-center text-sm font-bold"
        >
          About
        </a>
      </div>

      {/* displays the current conversation title centered in the viewport */}
      {chatTitle && (
        <div className="absolute top-9 left-1/2 -translate-x-1/2 max-w-[50%] sm:max-w-xs md:max-w-fit text-center">
          <h2 className="text-[16px] font-bold text-black/85 uppercase tracking-[0.2em] truncate animate-in fade-in slide-in-from-top-1 duration-700">
            {chatTitle}
          </h2>
        </div>
      )}

      {/* authentication access points grouped on the right */}
      <div
        className="absolute top-6 right-6 flex flex-row gap-3 pointer-events-auto transition-opacity duration-300"
        style={{
          opacity: isSidebarOpen ? 0 : 1,
          pointerEvents: isSidebarOpen ? 'none' : 'auto',
        }}
      >
        <button className="px-5 py-2.5 bg-white rounded-xl text-sm font-bold hover:bg-black/15 transition-all">
          Login
        </button>
        <button className="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-black/70 transition-all shadow-md">
          Sign Up
        </button>
      </div>
    </div>
  );
}