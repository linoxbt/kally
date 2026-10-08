import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";
export const studioDev = defineChain({
  id: 61997,
  caipNetworkId: "eip155:61997",
  chainNamespace: "eip155",
  name: "GenLayer Studio Dev",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://studio-dev.genlayer.com/api"] } },
  testnet: true,
});
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [studioDev];
export const wagmiAdapter = new WagmiAdapter({ networks, projectId: projectId || "unset", ssr: true });
