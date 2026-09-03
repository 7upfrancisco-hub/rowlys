import { Suspense } from "react";
import PedidosClient from "./pedidos-client";

export default function PedidosPage() {
  return (
    <Suspense fallback={null}>
      <PedidosClient />
    </Suspense>
  );
}
