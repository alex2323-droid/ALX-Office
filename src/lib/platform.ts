export function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof cap?.isNativePlatform === 'function') {
    try {
      return cap.isNativePlatform();
    } catch {
      // Ignore bridge inspection errors
    }
  }
  return window.location.protocol === 'capacitor:';
}
