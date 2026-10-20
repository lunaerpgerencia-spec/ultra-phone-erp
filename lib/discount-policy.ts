export type DiscountPolicyInput = {
  discountCents: number;
  baseCents: number;
  maxPercent: number;
  role: string;
  reason: string;
};

export type DiscountPolicyResult = {
  ok: boolean;
  requiresApproval: boolean;
  percent: number;
  message?: string;
};

export function discountPercent(discountCents: number, baseCents: number): number {
  if (!Number.isFinite(discountCents) || !Number.isFinite(baseCents) || baseCents <= 0 || discountCents <= 0) return 0;
  return (discountCents / baseCents) * 100;
}

export function canApproveDiscount(role: string): boolean {
  return role === 'admin' || role === 'gerente';
}

export function validateDiscountPolicy(input: DiscountPolicyInput): DiscountPolicyResult {
  const { discountCents, baseCents, maxPercent, role } = input;
  const reason = input.reason.trim().replaceAll(']]', '');
  if (!Number.isFinite(discountCents) || discountCents < 0) {
    return { ok: false, requiresApproval: false, percent: 0, message: 'Informe um desconto válido.' };
  }
  if (discountCents === 0) return { ok: true, requiresApproval: false, percent: 0 };
  if (!Number.isFinite(baseCents) || baseCents <= 0) {
    return { ok: false, requiresApproval: false, percent: 0, message: 'Selecione ao menos um aparelho antes de aplicar desconto.' };
  }
  const percent = discountPercent(discountCents, baseCents);
  const requiresApproval = percent > maxPercent + 0.000001;
  if (!requiresApproval) return { ok: true, requiresApproval: false, percent };
  if (!canApproveDiscount(role)) {
    return {
      ok: false,
      requiresApproval: true,
      percent,
      message: `Desconto de ${percent.toFixed(2)}% excede o limite automático de ${maxPercent.toFixed(2)}%. Solicite autorização à administração.`,
    };
  }
  if (reason.length < 5) {
    return {
      ok: false,
      requiresApproval: true,
      percent,
      message: 'Informe uma justificativa com pelo menos 5 caracteres para autorizar o desconto.',
    };
  }
  if (reason.length > 500) {
    return { ok: false, requiresApproval: true, percent, message: 'A justificativa deve ter no máximo 500 caracteres.' };
  }
  return { ok: true, requiresApproval: true, percent };
}
