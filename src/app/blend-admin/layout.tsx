import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blend | Super-admin",
};

export default function BlendAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
