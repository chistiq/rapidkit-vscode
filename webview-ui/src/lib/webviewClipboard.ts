export function copyTextWithBrowserFallback(text: string): void {
  void navigator.clipboard?.writeText(text);
}
