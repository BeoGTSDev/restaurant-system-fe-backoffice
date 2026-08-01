export type TimedKitchenItem = {
  status: string; createdAt: string; updatedAt: string; prepMinutes?: number;
  firedAt?: string; cookingAt?: string; pickupAt?: string; servedAt?: string;
};

export const calculateProgressPercent = (item: TimedKitchenItem, now = Date.now()) => {
  if (!item.cookingAt) return 0;
  return Math.min(100, Math.max(0, now - new Date(item.cookingAt).getTime()) / ((item.prepMinutes || 10) * 60000) * 100);
};

export const calculateProgressTone = (item: TimedKitchenItem, now = Date.now()) => {
  const progress = calculateProgressPercent(item, now);
  return progress >= 90 ? "danger" : progress >= 70 ? "warning" : "safe";
};

export const calculateRemainingSeconds = (item: TimedKitchenItem, now = Date.now()) => {
  if (!item.cookingAt) return (item.prepMinutes || 10) * 60;
  return Math.ceil(((item.prepMinutes || 10) * 60000 - (now - new Date(item.cookingAt).getTime())) / 1000);
};

export const formatCountdown = (item: TimedKitchenItem, now = Date.now()) => {
  const remaining = calculateRemainingSeconds(item, now);
  const absolute = Math.abs(remaining);
  const minutes = Math.floor(absolute / 60).toString().padStart(2, "0");
  const seconds = (absolute % 60).toString().padStart(2, "0");
  return `${remaining < 0 ? "-" : ""}${minutes}:${seconds}`;
};

export const formatStatusChangedAt = (item: TimedKitchenItem) => {
  const value = item.status === "Fired" ? item.firedAt
    : item.status === "Cooking" ? item.cookingAt
    : ["Pickup", "Ready"].includes(item.status) ? item.pickupAt
    : item.status === "Served" ? item.servedAt
    : item.status === "Pending" ? item.createdAt
    : item.updatedAt;
  return value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
};

export const cleanKitchenItemNote = (note?: string) => String(note || "")
  .split(/[·Â]+/)
  .map(value => value.trim())
  .filter(value => value && !/^dietary alert:/i.test(value) && !/^allergy:/i.test(value))
  .join(" / ");
