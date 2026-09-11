import CheckoutClient from "./checkout-client";
import StorefrontTheme from "@/components/StorefrontTheme";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <StorefrontTheme>
      <CheckoutClient />
    </StorefrontTheme>
  );
}
