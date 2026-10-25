import { SupermarketPage } from "@/pages/Supermarket";
import { MercadonaAutoCart } from "@/components/MercadonaAutoCart";

export default function MercadonaPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-3xl mx-auto">
        <MercadonaAutoCart />
      </div>
      <SupermarketPage supermarketId="mercadona" />
    </div>
  );
}
