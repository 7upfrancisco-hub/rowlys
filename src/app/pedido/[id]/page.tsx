import PedidoClient from "./pedido-client";

export default function PedidoPage({ params }: { params: { id: string } }) {
  return <PedidoClient id={params.id} />;
}
