/** Every app route fills the content pane rather than sitting in a centred column. */
export function ComposerFrame({ children }: { children: React.ReactNode }) {
  return <div className="page-frame">{children}</div>;
}
