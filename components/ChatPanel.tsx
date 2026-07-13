"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, type Mood } from "./Avatar";
import { useVoice } from "@/lib/client/useVoice";
import { postChat } from "@/lib/client/api";
import type { ChatMsg } from "@/lib/llm/provider";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "mr-IN", label: "मराठी" },
  { code: "bn-IN", label: "বাংলা" },
];

const CHIPS = [
  "Review my portfolio",
  "Am I on track for retirement?",
  "Where is my money going?",
  "How can I save on tax?",
];

export function ChatPanel({
  customerId,
  customerName,
  prefill,
  onPrefillConsumed,
}: {
  customerId: string;
  customerName: string;
  prefill?: string;
  onPrefillConsumed?: () => void;
}) {
  const [language, setLanguage] = useState("en-IN");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [greeting, setGreeting] = useState("");
  const [thinking, setThinking] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const [input, setInput] = useState("");
  const [voiceOut, setVoiceOut] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const first = customerName.split(" ")[0];

  const onTranscript = useCallback((text: string) => setInput((prev) => (prev ? prev + " " : "") + text), []);
  const voice = useVoice(onTranscript);
  const { isRecording, isSpeaking, amplitude, startRecording, stopRecording, speak, stopSpeaking } = voice;

  // Reset conversation when the customer changes.
  useEffect(() => {
    setMessages([]);
    setProvider("");
    setGreeting(
      `Namaste ${first}! I'm Dhan Sarthi, your personal wealth guide. Ask me about your portfolio, your goals, or where your money goes — by text or voice.`,
    );
    stopSpeaking();
  }, [customerId, first, stopSpeaking]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || thinking) return;
      stopSpeaking();
      const next: ChatMsg[] = [...messages, { role: "user", content }];
      setMessages(next);
      setInput("");
      setThinking(true);
      try {
        const { reply, provider: p } = await postChat(customerId, next, language);
        setProvider(p);
        setMessages([...next, { role: "assistant", content: reply }]);
        if (voiceOut) void speak(reply, language);
      } catch {
        setMessages([
          ...next,
          { role: "assistant", content: "Sorry, I couldn't reach the advisor service just now. Please try again." },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking, customerId, language, voiceOut, speak, stopSpeaking],
  );

  // Consume a prefill coming from the Goal planner ("Ask Dhan Sarthi about this").
  useEffect(() => {
    if (prefill) {
      void send(prefill);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const mood: Mood = thinking ? "thinking" : isSpeaking ? "happy" : "idle";

  return (
    <div className="flex h-full flex-col">
      {/* Avatar stage */}
      <div className="flex flex-col items-center bg-gradient-to-b from-brand-light to-white px-4 pb-3 pt-5">
        <Avatar speaking={isSpeaking} amplitude={amplitude} mood={mood} size={150} />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-brand-deep">Dhan Sarthi</span>
          {provider && (
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-medium text-brand-green">
              {provider === "gemini" ? "Gemini 2.5" : provider === "sarvam" ? "Sarvam-M" : "Guided"}
            </span>
          )}
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-2 rounded-full border border-brand-light bg-white px-3 py-1 text-xs text-ink/70"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              🗣 {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="phone-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <>
            <Bubble role="assistant">{greeting}</Bubble>
            <div className="flex flex-wrap gap-2 pt-1">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  className="rounded-full border border-brand-green/30 bg-white px-3 py-1.5 text-xs font-medium text-brand-green hover:bg-brand-green/5"
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}
        {thinking && (
          <Bubble role="assistant">
            <span className="inline-flex gap-1">
              <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
            </span>
          </Bubble>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-brand-light px-3 pb-2 pt-2">
        <div className="flex items-end gap-2">
          <button
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            aria-label={isRecording ? "Stop recording" : "Speak"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              isRecording ? "animate-pulse bg-red-500 text-white" : "bg-brand-green/10 text-brand-green"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" />
            </svg>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about your money…"
            className="max-h-24 flex-1 resize-none rounded-2xl border border-brand-light bg-surface px-3 py-2 text-sm outline-none focus:border-brand-green"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green text-white disabled:opacity-40"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" />
            </svg>
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] text-ink/50">
            <input type="checkbox" checked={voiceOut} onChange={(e) => setVoiceOut(e.target.checked)} className="accent-brand-green" />
            Voice replies {isSpeaking && <button onClick={stopSpeaking} className="ml-1 text-brand-green underline">stop</button>}
          </label>
          <span className="text-[10px] text-ink/40">Educational guidance, not investment advice</span>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
      <div
        className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? "rounded-br-sm bg-brand-green text-white" : "rounded-bl-sm bg-brand-light text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-brand-green/60"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}
