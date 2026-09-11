import MenuClient from "./menu-client";
import StorefrontTheme from "@/components/StorefrontTheme";

export const dynamic = "force-dynamic";

export default function MenuPage() {
  return (
    <StorefrontTheme>
      <MenuClient />
    </StorefrontTheme>
  );
}
