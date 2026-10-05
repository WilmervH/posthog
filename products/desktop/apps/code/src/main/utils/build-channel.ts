const TEST_CHANNEL = "test";

function buildChannel(): string | undefined {
  return (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_POSTHOG_BUILD_CHANNEL;
}

export function isTestChannelBuild(): boolean {
  return buildChannel() === TEST_CHANNEL;
}

// Patched: allow custom cloud in all builds (for self-hosted use).
export function isCustomCloudBuild(): boolean {
  return true;
}
