import { useSyncExternalStore } from "react";
let revision = 0;
const subscribers = new Set<() => void>();
export function invalidateGeometry() {
  revision++;
  subscribers.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};
export function useGeometry() {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0,
  );
}
