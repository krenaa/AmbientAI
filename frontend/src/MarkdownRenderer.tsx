import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Terminal, AlertTriangle, Info, Lightbulb, Sparkles } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

const renderWithLineBreaks = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === "string") {
    if (!/<br\s*\/?>/i.test(children)) return children;
    const parts = children.split(/<br\s*\/?>/gi);
    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && <br className="my-0.5" />}
        {part}
      </React.Fragment>
    ));
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => (
      <React.Fragment key={idx}>{renderWithLineBreaks(child)}</React.Fragment>
    ));
  }
  return children;
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  return (
    <div className="markdown-body space-y-3.5 text-sm leading-relaxed text-[#261912] font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold text-[#1C120C] tracking-tight mt-5 mb-2 pb-2 border-b border-[#D5C4B0] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F2765E] shrink-0" />
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-[#1C120C] tracking-tight mt-4 mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#183E6C] inline-block shrink-0" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold text-[#1C120C] mt-3 mb-1.5 flex items-center gap-1.5">
              <span>{children}</span>
            </h3>
          ),
          p: ({ children }) => {
            const strChildren = String(children);
            const lower = strChildren.toLowerCase();

            if (
              strChildren.includes("⚠️") ||
              lower.includes("warning:") ||
              lower.includes("caution:")
            ) {
              return (
                <div className="my-3 flex items-start space-x-2.5 rounded-xl border border-[#B84328]/35 bg-[#B84328]/10 p-3 text-xs text-[#8C2E16] shadow-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#B84328] mt-0.5" />
                  <div className="leading-relaxed font-semibold">{renderWithLineBreaks(children)}</div>
                </div>
              );
            }
            if (
              lower.includes("tip:") ||
              lower.includes("tip -") ||
              lower.includes("hint:")
            ) {
              return (
                <div className="my-3 flex items-start space-x-2.5 rounded-xl border border-[#8C6D23]/35 bg-[#FAF1D6] p-3 text-xs text-[#5D4610] shadow-xs">
                  <Lightbulb className="h-4 w-4 shrink-0 text-[#8C6D23] mt-0.5" />
                  <div className="leading-relaxed font-medium">{renderWithLineBreaks(children)}</div>
                </div>
              );
            }
            if (
              lower.includes("note:") ||
              lower.includes("info:") ||
              lower.includes("key insight:")
            ) {
              return (
                <div className="my-3 flex items-start space-x-2.5 rounded-xl border border-[#183E6C]/30 bg-[#E8EFF7] p-3 text-xs text-[#102B4F] shadow-xs">
                  <Info className="h-4 w-4 shrink-0 text-[#183E6C] mt-0.5" />
                  <div className="leading-relaxed font-medium">{renderWithLineBreaks(children)}</div>
                </div>
              );
            }
            return <p className="my-2 text-sm leading-relaxed text-[#261912]">{renderWithLineBreaks(children)}</p>;
          },
          strong: ({ children }) => (
            <strong className="font-bold text-[#1C120C]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#36241B]">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-2.5 space-y-1.5 pl-5 list-disc marker:text-[#183E6C] text-sm text-[#261912]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 space-y-1.5 pl-5 list-decimal marker:text-[#183E6C] text-sm text-[#261912]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1 text-sm text-[#261912]">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-[#183E6C] bg-[#EFE3D3]/70 pl-4 py-2 rounded-r-xl text-[#36241B] text-sm shadow-xs">
              {children}
            </blockquote>
          ),
          hr: () => (
            <div className="my-4 h-px w-full bg-[#D5C4B0]" />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isMultiline = String(children).includes("\n") || match;

            if (isMultiline) {
              const codeIdx = Math.abs(codeString.length * 31);
              return (
                <div className="my-3.5 overflow-hidden rounded-xl border border-[#3A261D] bg-[#231812] shadow-md">
                  <div className="flex items-center justify-between border-b border-[#3A261D] bg-[#2D1F17] px-3.5 py-1.5 text-xs text-[#D8C5AE]">
                    <div className="flex items-center space-x-2 font-mono text-[11px] text-[#F5B09E]">
                      <Terminal className="h-3.5 w-3.5 text-[#F2765E]" />
                      <span>{match ? match[1].toUpperCase() : "CODE"}</span>
                    </div>
                    <button
                      onClick={() => handleCopyCode(codeString, codeIdx)}
                      className="p-1 rounded-md text-[#D8C5AE] hover:text-white hover:bg-[#3A261D] transition cursor-pointer"
                      title="Copy code"
                    >
                      {copiedCodeIdx === codeIdx ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-xs text-[#FAF5E8] leading-relaxed scrollbar-thin">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            }

            return (
              <code
                className="rounded-md border border-[#183E6C]/25 bg-[#183E6C]/8 px-1.5 py-0.5 font-mono text-[12px] text-[#14355E] font-semibold tracking-tight shadow-xs inline-block my-0.5"
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-[#D5C4B0] bg-[#FAF5E8] shadow-xs max-w-full">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b-2 border-[#D5C4B0] bg-[#EBE0D0] text-[#1C120C] font-bold text-[11px] uppercase tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#E6D7C5] text-[#261912]">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#F3E8DA]/80 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 font-bold text-[#1C120C] tracking-wide whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 leading-relaxed text-[#261912] font-medium align-top">
              {renderWithLineBreaks(children)}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#183E6C] hover:text-[#102B4F] underline underline-offset-2 transition-colors"
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
