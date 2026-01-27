"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  filename?: string;
}

/**
 * Simple Markdown viewer with copy/download functionality
 * Renders basic markdown (headers, bold, lists) as styled HTML
 */
export function MarkdownViewer({ content, filename = "security-report.md" }: MarkdownViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Simple markdown to HTML conversion
  const renderMarkdown = (md: string): string => {
    const html = md
      // Escape HTML
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headers
      .replace(/^### (.*$)/gim, '<h4 class="text-md font-semibold mt-4 mb-2">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3 text-primary">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Unordered lists
      .replace(/^\s*-\s+(.*)$/gim, '<li class="ml-4 list-disc">$1</li>')
      // Ordered lists
      .replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal">$2</li>')
      // Wrap consecutive list items
      .replace(/(<li class="ml-4 list-disc">.*<\/li>\n?)+/g, (match) => `<ul class="my-2 space-y-1">${match}</ul>`)
      .replace(/(<li class="ml-4 list-decimal">.*<\/li>\n?)+/g, (match) => `<ol class="my-2 space-y-1">${match}</ol>`)
      // Paragraphs (lines not already wrapped)
      .replace(/^(?!<[hulo])(.*[^\n])$/gim, '<p class="my-2">$1</p>')
      // Clean up empty paragraphs
      .replace(/<p class="my-2"><\/p>/g, "")
      // Line breaks
      .replace(/\n\n/g, '<div class="my-4"></div>');

    return html;
  };

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>

      {/* Rendered content */}
      <div
        className="prose prose-sm dark:prose-invert max-w-none p-4 bg-muted/50 rounded-lg border overflow-y-auto max-h-[60vh]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}
