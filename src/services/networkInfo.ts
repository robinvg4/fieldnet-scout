import * as Network from "expo-network";

export type CurrentNetworkInfo = {
  ipAddress: string | null;
  isConnected: boolean | null;
  type: string | null;
};

export async function getCurrentNetworkInfo(): Promise<CurrentNetworkInfo> {
  const networkState = await Network.getNetworkStateAsync();
  const ipAddress = await Network.getIpAddressAsync();

  return {
    ipAddress,
    isConnected: networkState.isConnected ?? null,
    type: networkState.type ?? null,
  };
}
