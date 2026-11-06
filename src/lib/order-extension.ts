import type { Order } from "./types";

/** Keep an explicit injection end in step with its extended duration. */
export function withExtendedDays(order: Order, days: number): Order {
  if (order.type === "injection" && order.end && order.days) return { ...order, days, end: { ...order.end, day: order.end.day + days - order.days } };
  return { ...order, days } as Order;
}
