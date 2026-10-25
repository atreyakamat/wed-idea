// Mirrors the event_statements view so the app can preview a bill (for
// example while an order is being placed) with the same rules.

export type BillableOrder = {
  status: string;
  courier_charge_paise: number;
  items: { copies: number; unit_price_paise: number }[];
};

export type Statement = {
  orderCount: number;
  copies: number;
  printsPaise: number;
  courierPaise: number;
  totalPaise: number;
};

export function computeStatement(orders: readonly BillableOrder[]): Statement {
  const active = orders.filter((o) => o.status !== "cancelled");
  let copies = 0;
  let printsPaise = 0;
  let courierPaise = 0;

  for (const order of active) {
    courierPaise += order.courier_charge_paise;
    for (const item of order.items) {
      copies += item.copies;
      printsPaise += item.copies * item.unit_price_paise;
    }
  }

  return {
    orderCount: active.length,
    copies,
    printsPaise,
    courierPaise,
    totalPaise: printsPaise + courierPaise,
  };
}

/** Remaining budget, or null when the couple set no cap. Never below 0. */
export function remainingBudgetPaise(
  statement: Statement,
  budgetCapPaise: number | null,
): number | null {
  if (budgetCapPaise === null) return null;
  return Math.max(0, budgetCapPaise - statement.totalPaise);
}
