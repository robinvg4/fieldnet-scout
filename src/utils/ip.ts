export function getLikelySubnet(ipAddress: string | null | undefined): string | null {
  if (!ipAddress || !isIPv4(ipAddress)) return null;

  const parts = ipAddress.split(".");
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export function getUsableHostsFor24(ipAddress: string | null | undefined): string[] {
  if (!ipAddress || !isIPv4(ipAddress)) return [];

  const parts = ipAddress.split(".");
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;

  return Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
}

export function isIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255 && String(number) === part;
  });
}
