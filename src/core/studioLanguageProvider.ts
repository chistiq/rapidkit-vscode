/** Public provider commands have no CancellationToken parameter. Release our waiter promptly;
 * a late provider result is discarded and can never authorize a subsequent mutation. */
export async function waitForStudioLanguageProvider<T>(
  action: () => PromiseLike<T>,
  signal?: AbortSignal,
  timeoutMs = 30_000
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Language provider request was cancelled.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal?.aborted) {
          throw new Error('Language provider request was cancelled.');
        }
        return action();
      }),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error('Language provider request was cancelled.'));
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Language provider did not respond within its timeout. Use focused source inspection or another available tool.'
              )
            ),
          timeoutMs
        );
        if (signal?.aborted) {
          abort();
        }
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) {
      signal?.removeEventListener('abort', abort);
    }
  }
}
