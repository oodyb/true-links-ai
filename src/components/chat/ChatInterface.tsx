// src/components/chat/ChatInterface.tsx
import { MessageList, type Message } from './MessageList';
import { ChatInput } from './ChatInput';

interface ChatInterfaceProps {
  messages: Message[];
  input: string;
  setInput: (val: string) => void;
  handleFormSubmit: () => void;
  isLoading: boolean;
  inputAreaRef: React.RefObject<HTMLDivElement | null>;
  onMessageAnimationComplete?: (id: string) => void;
}

export function ChatInterface({
  messages,
  input,
  setInput,
  handleFormSubmit,
  isLoading,
  inputAreaRef,
  onMessageAnimationComplete,
}: ChatInterfaceProps) {
  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col relative h-full bg-white">
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          // initial view displayed when the conversation history is empty
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter mb-4 text-black">
              TrueLinks AI
            </h1>
            <p className="text-black/50 text-lg sm:text-xl font-medium mb-6 tracking-tight">
              Legal intelligence for the FIDIC framework.
            </p>
            <div className="w-full max-w-2xl" ref={inputAreaRef}>
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleFormSubmit}
                isLoading={isLoading}
                variant="landing"
              />
            </div>
          </div>
        ) : (
          // active conversation layout with message history and scrolling support
          <div className="flex flex-col h-full">
            <MessageList
              messages={messages}
              isLoading={isLoading}
              onMessageAnimationComplete={onMessageAnimationComplete}
            />
            {/* prevent the bottom-most message from being obscured by the input bar */}
            <div className="h-16 shrink-0" />
          </div>
        )}
      </div>

      {/* fixed input bar that appears once a conversation has started */}
      {hasMessages && (
        <div
          ref={inputAreaRef}
          className="absolute bottom-0 inset-x-0 z-10 pb-12 px-4 bg-gradient-to-t from-white via-white to-transparent"
        >
          <div className="max-w-4xl mx-auto">
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleFormSubmit}
              isLoading={isLoading}
              variant="sticky"
              placeholder="Ask a follow-up..."
            />
          </div>
        </div>
      )}
    </div>
  );
}