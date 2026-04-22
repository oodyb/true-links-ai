// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { Header } from '@/components/chat/Header';

export default function FidicChat() {
  // tracks the currently selected chat, user input, and message history
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [history, setHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // manage pending network requests and coordinate layout references
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  // retrieve previously saved conversations from local storage on load
  useEffect(() => {
    const savedHistory = localStorage.getItem('truelinks_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("failed to parse history", e);
      }
    }
  }, []);

  // clears the current conversation view to start a fresh thread
  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setMessages([]);
    setChatTitle('');
    setInput('');
    setActiveChatId(null);
  };

  // switches the active view to a selected conversation from history
  const handleSelectChat = (chat: any) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setMessages(chat.messages || []);
    setChatTitle(chat.title || '');
    setActiveChatId(chat.id);
  };

  // deletes a specific chat from history and updates persistent storage
  const handleDeleteChat = (id: number) => {
    const newHistory = history.filter(chat => chat.id !== id);
    setHistory(newHistory);
    localStorage.setItem('truelinks_history', JSON.stringify(newHistory));

    // reset the interface if the user deletes the chat they are currently viewing
    if (activeChatId === id) {
      handleNewChat();
    }
  };

  // manages the submission of user queries and integration of ai responses
  const handleFormSubmit = async () => {
    if (!input.trim() || isLoading) return;

    // stop any ongoing requests before initiating a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // immediately display the user's message in the ui
    const userMessage = { id: Date.now(), role: "user", text: input };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      // transmit the conversation thread to the backend chat handler
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (res.status === 429) {
        throw new Error("rate limit reached. please wait a moment before trying again.");
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `server error (${res.status}). please try again.`);
      }

      const data = await res.json();

      if (!data?.text) {
        throw new Error("please try again later.");
      }

      // construct the assistant's response object with necessary metadata
      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: data.text,
        citations: data.citations || [],
        isNew: true
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      // remove animation flags before persisting data to history
      const historyMessages = finalMessages.map(msg => ({ ...msg, isNew: false }));

      let updatedHistory = [...history];

      // check if this is the start of a new thread to initialize history data
      if (!activeChatId) {
        const newId = Date.now();
        const finalTitle = data.chatTitle || input.substring(0, 30);
        setActiveChatId(newId);
        setChatTitle(finalTitle);
        const newChatEntry = {
          id: newId,
          title: finalTitle,
          preview: data.text.substring(0, 60) + "...",
          messages: historyMessages
        };
        updatedHistory = [newChatEntry, ...history];
      } else {
        // update existing chat entry with the latest interaction
        updatedHistory = history.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              preview: data.text.substring(0, 60) + "...",
              messages: historyMessages
            };
          }
          return chat;
        });
      }

      // save the updated history to local storage
      setHistory(updatedHistory);
      localStorage.setItem('truelinks_history', JSON.stringify(updatedHistory));
      setMessages(finalMessages);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('fetch aborted');
      } else {
        console.error("submission error:", err);

        const errorMessage = {
          id: Date.now() + 2,
          role: "assistant",
          text: `${"an unexpected error occurred. please try again later."}`,
          citations: [],
          isNew: false
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      // reset loading states once the request life cycle is complete
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <main className="flex h-screen bg-white text-black font-sans overflow-hidden relative">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        history={history}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        activeChatId={activeChatId}
        excludeRef={inputAreaRef}
        onDeleteChat={handleDeleteChat}
      />

      {/* primary container for chat flow and navigation controls */}
      <div className="relative flex h-full flex-1 flex-col transition-all duration-300 ease-in-out">
        <Header
          isSidebarOpen={isSidebarOpen}
          onMenuClick={() => setIsSidebarOpen(true)}
          chatTitle={chatTitle}
        />

        <ChatInterface
          messages={messages}
          input={input}
          setInput={setInput}
          handleFormSubmit={handleFormSubmit}
          isLoading={isLoading}
          inputAreaRef={inputAreaRef}
        />
      </div>
    </main>
  );
}