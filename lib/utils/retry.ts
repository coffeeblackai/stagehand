interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: Error) => boolean;
}

export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: Error;
  let delay = options.initialDelayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (
        attempt === options.maxRetries ||
        (options.shouldRetry && !options.shouldRetry(error))
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, options.maxDelayMs);
    }
  }

  throw lastError;
}
