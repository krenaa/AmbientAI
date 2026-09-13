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
    <div className="markdown-body space-y-3 text-sm leading-relaxed text-zinc-200 font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-semibold text-white tracking-tight mt-4 mb-2 pb-1.5 border-b border-zinc-800">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight mt-3 mb-1.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 inline-block" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-medium text-zinc-200 mt-2.5 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => {
            const strChildren = String(children);
            if (
              strChildren.includes("⚠️") ||
              strChildren.toLowerCase().includes("warning") ||
              strChildren.toLowerCase().includes("caution")
            ) {
              return (
                <div className="my-2.5 flex items-start space-x-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="leading-relaxed font-medium">{children}</div>
                </div>
              );
            }
            if (
              strChildren.toLowerCase().includes("note:") ||
              strChildren.toLowerCase().includes("info:")
            ) {
              return (
                <div className="my-2.5 flex items-start space-x-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
                  <Info className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
                  <div className="leading-relaxed">{children}</div>
                </div>
              );
            }
            return <p className="my-2 text-sm leading-relaxed text-zinc-200">{children}</p>;
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-300">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2 space-y-1.5 pl-5 list-disc marker:text-cyan-400 text-sm text-zinc-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1.5 pl-5 list-decimal marker:text-cyan-400 text-sm text-zinc-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5 text-sm">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-2 border-cyan-500/60 bg-zinc-900/60 pl-3.5 py-1.5 rounded-r-lg text-zinc-400 italic text-sm">
              {children}
            </blockquote>
          ),
          hr: () => (
            <div className="my-3.5 h-px w-full bg-zinc-800" />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isMultiline = String(children).includes("\n") || match;

            if (isMultiline) {
              const codeIdx = Math.abs(codeString.length * 31);
              return (
                <div className="my-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-md">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-3.5 py-1.5 text-xs text-zinc-400">
                    <div className="flex items-center space-x-2 font-mono text-[11px] text-cyan-400">
                      <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                      <span>{match ? match[1].toUpperCase() : "CODE"}</span>
                    </div>
                    <button
                      onClick={() => handleCopyCode(codeString, codeIdx)}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                      title="Copy code"
                    >
                      {copiedCodeIdx === codeIdx ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-3.5 font-mono text-xs text-zinc-200 leading-relaxed scrollbar-thin">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            }

            return (
              <code
                className="rounded-md border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-xs text-cyan-300 font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-zinc-800/90 bg-zinc-950/60 shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-200 font-semibold text-[11px] uppercase tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-zinc-900/40 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-zinc-200">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 leading-relaxed text-zinc-300">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
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
