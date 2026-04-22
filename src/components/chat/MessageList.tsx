// src/components/chat/MessageList.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink } from 'lucide-react';

export interface Citation {
  clause: string;
  title: string;
  preview: string;
  page: number | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  isNew?: boolean;
}

// renders an interactive link for document citations with a hover preview
function CitationLink({ data }: { data: Citation }) {
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [tooltipSide, setTooltipSide] = useState<'left' | 'center' | 'right'>('center');

  // adjust tooltip position to stay within the viewport boundaries
  const handleMouseEnter = useCallback(() => {
    if (triggerRef.current) {
      const { left, right } = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      if (left < 160) setTooltipSide('right');
      else if (right > vw - 160) setTooltipSide('left');
      else setTooltipSide('center');
    }
    setIsHovered(true);
  }, []);

  // opens the pdf at the specific page with a text search fragment
  const handleClick = useCallback(() => {
    if (!data) return;
    const page = data.page ?? 1;
    window.open(`/data/cons1_bc.pdf#page=${page}`, '_blank');
  }, [data]);


  // formats the raw clause identifier for user display, appends page for non-numeric references
  const getDisplayName = (val: string, page?: number | null) => {
    if (/^\d+\.\d+/.test(val)) return `Sub-Clause ${val}`;
    if (/^\d+$/.test(val)) return `Clause ${val}`;
    return page ? `${val} (p.${page})` : val;
  };

  const displayName = getDisplayName(data.clause, data.page);

  // calculate tailwind classes for tooltip alignment
  const tooltipAlign =
    tooltipSide === 'right'
      ? 'left-0 -translate-x-0'
      : tooltipSide === 'left'
        ? 'right-0 translate-x-0'
        : 'left-1/2 -translate-x-1/2';

  const arrowAlign =
    tooltipSide === 'right'
      ? 'left-4'
      : tooltipSide === 'left'
        ? 'right-4'
        : 'left-1/2 -translate-x-1/2';

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <span className="text-[14px] cursor-pointer border-b border-black/30 hover:border-black hover:bg-black/5 transition-all inline-flex items-center gap-1 font-bold mx-0.5 px-0.5 rounded">
        [{displayName}]
        <ExternalLink size={10} className="opacity-40" />
      </span>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className={`absolute bottom-full mb-3 w-72 z-50 pointer-events-none ${tooltipAlign}`}
          >
            <div className="bg-white/95 backdrop-blur-md border border-black/10 shadow-2xl rounded-xl p-3 text-[13px] leading-snug text-black">
              <div className="flex items-center justify-between mb-2 border-b border-black/5 pb-2">
                <div className="flex items-center gap-2">
                  <div className="bg-black text-white px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    {displayName.toUpperCase().includes('CLAUSE') ? 'FIDIC' : 'SOURCE'}
                  </div>
                  <span className="font-bold truncate max-w-[7.5rem] opacity-70">{data.title}</span>
                </div>
                {data.page && (
                  <span className="text-[10px] text-black/40 font-bold uppercase">Page {data.page}</span>
                )}
              </div>
              <p className="text-black/60 italic leading-relaxed mb-2">"{data.preview}..."</p>
              <div className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
                <ExternalLink size={10} /> Click to view full document
              </div>
              <div className={`absolute -bottom-1 w-2 h-2 bg-white border-r border-b border-black/10 rotate-45 ${arrowAlign}`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface FormattedTextProps {
  text: string;
  citations?: Citation[];
  showFooter?: boolean;
}

// parses plain text into structured paragraphs and injects citation components
function FormattedText({ text, citations, showFooter = true }: FormattedTextProps) {
  // break text into paragraphs based on double newlines or sentence endings
  const paragraphs = text
    .split(/(?<=\D\.)\s+(?=[A-Z])|\n\n+/)
    .filter(Boolean);

  // scans individual paragraphs for bracketed citation markers to replace with links
  const renderParagraph = (paraText: string, paraIndex: number) => {
    if (!citations || citations.length === 0) return paraText;

    // create an array of strings to look for based on actual data, look for both the raw clause ID and common variations
    const searchTerms = citations.flatMap(c => [
      `[${c.clause}]`,
      `[Clause ${c.clause}]`,
      `[Sub-Clause ${c.clause}]`
    ]);

    // escape special characters and join with "|"
    const escapedTerms = searchTerms
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    const dynamicRegex = new RegExp(`(${escapedTerms})`, 'gi');
    const parts = paraText.split(dynamicRegex);

    return parts.map((part, i) => {
      // normalize the found 'part' by removing brackets and labels. turns "[sub-clause 14.1]" into "14.1"
      const normalizedPart = part
        .toLowerCase()
        .replace(/[\[\]]/g, '') // remove brackets
        .replace(/^(sub-)?clause\s+/i, '') // remove "clause " or "sub-clause "
        .trim();

      // find the citation where the id matches exactly
      const matchingCitation = citations.find(c => {
        // strip "clause " or "sub-Clause " from the data object for the comparison
        const normalizedDataClause = c.clause
          .toLowerCase()
          .replace(/^(sub-)?clause\s+/i, '')
          .trim();

        return normalizedDataClause === normalizedPart;
      });

      if (matchingCitation) {
        return <CitationLink key={`${paraIndex}-${i}`} data={matchingCitation} />;
      }

      return part;
    });
  };

  return (
    <>
      {paragraphs.map((para, i) => (
        <div key={`p-${i}`} className={i > 0 ? "mt-4" : ""}>
          {renderParagraph(para, i)}
        </div>
      ))}

      {/* display a dedicated summary of sources at the end of the message */}
      {showFooter && citations && citations.length > 0 && (
        <div className="mt-6 pt-2 border-t border-black/5 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-700">
          <span className="text-[10px] uppercase tracking-widest font-bold opacity-30 w-full mb-1">
            Source Reference
          </span>
          {citations.map((cite, i) => (
            <CitationLink key={`footer-${i}`} data={cite} />
          ))}
        </div>
      )}
    </>
  );
}

// visual identity for the assistant, includes a pulsing state for processing
function AiIcon({ isThinking = false }: { isThinking?: boolean }) {
  return (
    <div className="w-8 h-8 flex items-center justify-center mr-3 mt-1 shrink-0 relative">
      <div className="w-4 h-4 rounded-full bg-black z-10" />
      {isThinking && (
        <>
          <div className="absolute inset-0 rounded-full bg-black/15 animate-ping opacity-75" style={{ animationDuration: '1.2s' }} />
          <div className="absolute inset-0 rounded-full bg-black/10 animate-ping opacity-50" style={{ animationDuration: '1.8s' }} />
        </>
      )}
    </div>
  );
}

interface TypewriterProps {
  text: string;
  citations?: Citation[];
  speed?: number;
  onComplete?: () => void;
}

// simulates a streaming text effect for new assistant responses
function Typewriter({ text, citations, speed = 8, onComplete }: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isDone, setIsDone] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let i = 0;
    setDisplayedText('');
    setIsDone(false);

    const timer = setInterval(() => {
      i++;
      if (i <= text.length) {
        setDisplayedText(text.slice(0, i));
      } else {
        clearInterval(timer);
        setIsDone(true);
        onCompleteRef.current?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <FormattedText text={displayedText} citations={citations} showFooter={isDone} />;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onMessageAnimationComplete?: (id: string) => void;
}

// manages the display and automated scrolling of the conversation history
export function MessageList({ messages, isLoading, onMessageAnimationComplete }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [typingComplete, setTypingComplete] = useState<Record<string, boolean>>({});

  // maintain focus on the latest content when new messages or loading states occur
  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount, isLoading]);

  return (
    <div className="max-w-4xl mx-auto w-full pt-32 pb-44 px-4 sm:px-6 space-y-8">
      {messages.map((m) => {
        const isUser = m.role === 'user';
        const shouldAnimate = !isUser && m.isNew === true && !typingComplete[m.id];

        return (
          <div
            key={m.id}
            className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            {!isUser && <AiIcon isThinking={false} />}

            <div className={`max-w-[90%] sm:max-w-[75%] rounded-2xl text-base sm:text-lg leading-relaxed ${isUser
              ? 'bg-black/5 text-black rounded-tr-none px-5 py-3'
              : 'text-black font-medium px-5 py-1'
              }`}>
              {shouldAnimate ? (
                <Typewriter
                  text={m.text}
                  citations={m.citations}
                  onComplete={() => {
                    setTypingComplete((prev) => ({ ...prev, [m.id]: true }));
                    onMessageAnimationComplete?.(m.id);
                  }}
                />
              ) : (
                <FormattedText text={m.text} citations={m.citations} />
              )}
            </div>
          </div>
        );
      })}

      {/* loading indicator while the server generates a response */}
      {isLoading && (
        <div className="flex w-full justify-start items-center">
          <AiIcon isThinking={true} />
          <div className="px-1 py-3 mt-1 rounded-2xl text-black/40 font-medium tracking-tight">
            TrueLinks is thinking...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}