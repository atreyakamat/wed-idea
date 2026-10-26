export type OrderWindow = {
  status: "draft" | "live" | "closed" | "archived";
  orders_open_at: string | null;
  orders_close_at: string | null;
};

/**
 * Guests can order prints only while the event is live and the current time
 * is inside the window the couple agreed to (for example 9 am–5 pm).
 */
export function isOrderWindowOpen(event: OrderWindow, now: Date = new Date()): boolean {
  if (event.status !== "live") return false;
  if (!event.orders_open_at || !event.orders_close_at) return false;
  const opens = new Date(event.orders_open_at).getTime();
  const closes = new Date(event.orders_close_at).getTime();
  const t = now.getTime();
  return t >= opens && t < closes;
}
