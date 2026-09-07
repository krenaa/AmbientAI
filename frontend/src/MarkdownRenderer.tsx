import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Terminal, AlertTriangle, Info } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  return (
    <div className="markdown-body space-y-3.5 text-sm md:text-[15px] leading-relaxed text-zinc-100 font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 mt-5 mb-2.5 pb-1.5 border-b border-zinc-800/80">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base md:text-lg font-bold tracking-tight text-emerald-300 mt-4 mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400/50" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm md:text-base font-semibold text-teal-200 mt-3.5 mb-1.5">
              {children}
            </h3>
          ),
          p: ({ children }) => {
            const strChildren = String(children);
            // Check if this paragraph is an alert or delivery note
            if (
              strChildren.includes("⚠️") ||
              strChildren.toLowerCase().includes("email delivery note") ||
              strChildren.toLowerCase().includes("warning") ||
              strChildren.toLowerCase().includes("caution")
            ) {
              return (
                <div className="my-3 flex items-start space-x-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent p-4 text-xs md:text-sm text-amber-200 shadow-md shadow-amber-500/5">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                  <div className="leading-relaxed font-medium">{children}</div>
                </div>
              );
            }
            if (
              strChildren.toLowerCase().includes("note:") ||
              strChildren.toLowerCase().includes("info:")
            ) {
              return (
                <div className="my-3 flex items-start space-x-3 rounded-xl border border-sky-500/40 bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-transparent p-4 text-xs md:text-sm text-sky-200 shadow-md shadow-sky-500/5">
                  <Info className="h-5 w-5 shrink-0 text-sky-400 mt-0.5" />
                  <div className="leading-relaxed">{children}</div>
                </div>
              );
            }
            return <p className="my-2.5 leading-relaxed text-zinc-100">{children}</p>;
          },
          strong: ({ children }) => (
            <strong className="font-bold text-emerald-200 bg-emerald-500/20 px-1.5 py-0.5 rounded-md border border-emerald-500/35 shadow-sm">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-teal-300 font-medium">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 space-y-2 pl-5 list-disc marker:text-emerald-400 text-zinc-100">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 space-y-2 pl-5 list-decimal marker:text-teal-400 marker:font-bold text-zinc-100">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-emerald-400 bg-gradient-to-r from-emerald-500/10 to-transparent pl-4 py-2.5 rounded-r-xl text-zinc-300 italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isMultiline = String(children).includes("\n") || match;

            if (isMultiline) {
              const codeIdx = Math.abs(codeString.length * 31);
              return (
                <div className="my-3.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-xl shadow-black/40">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-4 py-1.5 text-xs text-zinc-400">
                    <div className="flex items-center space-x-2 font-mono text-[11px] text-teal-400">
                      <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{match ? match[1].toUpperCase() : "CODE"}</span>
                    </div>
                    <button
                      onClick={() => handleCopyCode(codeString, codeIdx)}
                      className="flex items-center space-x-1.5 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition"
                    >
                      {copiedCodeIdx === codeIdx ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-xs text-emerald-300 leading-relaxed scrollbar-thin">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            }

            return (
              <code
                className="rounded-md border border-teal-500/30 bg-zinc-900/90 px-1.5 py-0.5 font-mono text-xs text-teal-300 shadow-inner font-semibold"
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/80 shadow-lg">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-emerald-300 font-bold uppercase tracking-wider text-[11px]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-zinc-900/40 transition">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="p-3 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="p-3 leading-relaxed">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-400 hover:text-teal-300 underline underline-offset-2 transition"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
