import type { Metadata } from "next";
import ComandaClient from "./comanda-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blend | Comanda",
};

export default function ComandaPage() {
  return <ComandaClient />;
}
