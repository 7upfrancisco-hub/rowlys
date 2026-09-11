import PedidoClient from "./pedido-client";
import StorefrontTheme from "@/components/StorefrontTheme";

export const dynamic = "force-dynamic";

export default function PedidoPage({ params }: { params: { id: string } }) {
  return (
    <StorefrontTheme>
      <PedidoClient id={params.id} />
    </StorefrontTheme>
  );
}
