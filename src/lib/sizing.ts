import type { SizingResult } from "@/types/trade";

export function sizePosition(args: {
  accountSize: number;
  allowedLossPct: number;
  entry: number;
  stop: number;
}): SizingResult {
  const { accountSize, allowedLossPct, entry, stop } = args;
  const maxLoss = accountSize * (allowedLossPct / 100);
  const riskPerUnit = Math.abs(entry - stop);

  if (accountSize <= 0 || allowedLossPct <= 0)
    return {
      maxLoss: 0,
      riskPerUnit: 0,
      quantity: 0,
      positionSize: 0,
      valid: false,
      reason: "계좌 크기와 허용 손실률을 0보다 크게 입력하세요.",
    };
  if (riskPerUnit === 0 || !Number.isFinite(riskPerUnit))
    return {
      maxLoss,
      riskPerUnit: 0,
      quantity: 0,
      positionSize: 0,
      valid: false,
      reason: "진입가와 손절가가 같습니다.",
    };

  const rawQty = maxLoss / riskPerUnit;
  // 소수 4자리까지 허용 (암호화폐는 분할 가능)
  const quantity = Math.floor(rawQty * 1e4) / 1e4;
  const positionSize = quantity * entry;

  return { maxLoss, riskPerUnit, quantity, positionSize, valid: quantity > 0 };
}
