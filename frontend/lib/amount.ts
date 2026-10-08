export function parseGen(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error("Enter a valid GEN amount with at most 18 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 10n ** 18n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
  if (amount <= 0n || amount > (1n << 256n) - 1n) throw new Error("Enter a GEN amount greater than zero and within the contract limit.");
  return amount;
}

export function formatGen(value: bigint | number | string): string {
  const wei = BigInt(value || 0);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % (10n ** 18n)).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return whole.toLocaleString() + (fraction ? `.${fraction}` : "");
}
