"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { networks, projectId, wagmiAdapter } from "@/lib/wallet";

createAppKit({
  adapters: [wagmiAdapter], networks, defaultNetwork: networks[0], projectId: projectId || "unset",
  metadata: { name: "Kally", description: "AI benchmark prediction markets on GenLayer", url: "https://frontend-nu-dun-93.vercel.app", icons: ["https://frontend-nu-dun-93.vercel.app/kally-logo.png"] },
  features: { analytics: false, email: false, socials: [] },
});

export default function KallyWalletProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <WagmiProvider config={wagmiAdapter.wagmiConfig}><QueryClientProvider client={client}>{children}</QueryClientProvider></WagmiProvider>;
}
