import { LiveCarelApp } from "@/components/LiveCarelApp";
import { CarelTestnetProvider } from "@/components/testnet/Strk20Testnet";

export default function Page() {
  return (
    <CarelTestnetProvider>
      <LiveCarelApp />
    </CarelTestnetProvider>
  );
}
