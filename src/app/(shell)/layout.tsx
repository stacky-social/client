import Shell from "./Shell";

export default function ShellLayout({
  children,
  aside, // parallel route slot
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
}) {
  return <Shell aside={aside}>{children}</Shell>;
}