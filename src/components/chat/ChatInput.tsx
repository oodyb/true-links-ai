// src/components/chat/ChatInput.tsx
import { Send } from 'lucide-react';
import {
  useRef,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
  variant?: 'landing' | 'sticky';
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = 'How can I help?',
  variant = 'landing',
}: ChatInputProps) {
  const isSticky = variant === 'sticky';
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // dynamically adjust the height of the input field based on the amount of text
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // ensure the element expands up to its defined max height constraints
    el.style.height = `${Math.min(el.scrollHeight, el.clientHeight || el.scrollHeight)}px`;
  }, [value]);

  // validation to prevent empty submissions or concurrent requests
  const canSubmit = value.trim().length > 0 && !isLoading;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  };

  // allow users to submit by pressing enter while permitting new lines with shift enter
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!canSubmit) return;
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative ${isSticky ? 'mx-auto max-w-3xl' : 'w-full max-w-2xl'}`}
    >
      <div
        className={`w-full bg-white border border-black/10 shadow-xl transition-all flex items-end gap-2 focus-within:border-black/30 ${isSticky
          ? 'rounded-2xl px-5 py-3'
          : 'rounded-3xl px-4 pl-6 py-4'
          }`}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={`flex-1 bg-transparent outline-none resize-none overflow-y-auto block text-black no-scrollbar disabled:opacity-50 ${isSticky ? 'max-h-60' : 'max-h-80 text-lg'
            }`}
          style={{
            lineHeight: '1.5',
            paddingTop: isSticky ? '8px' : '12px',
            paddingBottom: isSticky ? '8px' : '12px',
          }}
        />

        {/* action button for triggering the message transmission */}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send message"
          className={`shrink-0 text-black transition-all hover:bg-black/15 disabled:opacity-30 mb-1 ${isSticky ? 'rounded-xl p-2' : 'rounded-2xl p-2.5'
            }`}
        >
          <Send size={isSticky ? 22 : 24} />
        </button>
      </div>
    </form>
  );
}