import type { Metadata } from "next";
import AdminHeader from "@/components/AdminHeader";

export const metadata: Metadata = {
  title: "Blend | Panel",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
