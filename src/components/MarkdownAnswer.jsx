import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components = {
  a({ href, children }) {
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  // Model-provided image URLs must not trigger automatic external requests.
  img({ alt }) {
    return (
      <span className="markdown-image-label">
        [이미지: {alt || "설명 없음"}]
      </span>
    );
  },
  table({ children }) {
    return (
      <div
        className="markdown-table"
        tabIndex={0}
        role="region"
        aria-label="답변 표"
      >
        <table>{children}</table>
      </div>
    );
  },
  pre({ children }) {
    return <pre tabIndex={0}>{children}</pre>;
  },
};

export default function MarkdownAnswer({ children }) {
  return (
    <div className="markdown-answer">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </Markdown>
    </div>
  );
}
