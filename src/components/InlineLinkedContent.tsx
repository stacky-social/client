import React from 'react';
import { splitInlineLinks } from '../utils/inlineLinks.mjs';

function linkedText(value: string, keyPrefix: string): React.ReactNode[] {
  return splitInlineLinks(value).map((token, index) => token.type === 'text' ? token.value : (
    <a
      key={`${keyPrefix}-${index}`}
      className="inline-content-link"
      data-inline-content-link
      href={token.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      {token.label}
    </a>
  ));
}

function linkifyNode(node: React.ReactNode, keyPrefix: string): React.ReactNode {
  if (typeof node === 'string') return linkedText(node, keyPrefix);
  if (typeof node === 'number' || node == null || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map((child, index) => linkifyNode(child, `${keyPrefix}-${index}`));
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (node.type === 'a' || node.props.children == null) return node;
  return React.cloneElement(node, undefined, linkifyNode(node.props.children, `${keyPrefix}-child`));
}

export default function InlineLinkedContent({ children }: { children: React.ReactNode }) {
  return <>{linkifyNode(children, 'inline-link')}</>;
}
