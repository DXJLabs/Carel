import { CarelApp } from "@/components/CarelApp";
import { CarelTestnetProvider } from "@/components/testnet/Strk20Testnet";

export default function Page() {
  return (
    <CarelTestnetProvider>
      <CarelApp />
    </CarelTestnetProvider>
  );
}
