# Self-Hosted ("Custom" Region) Desktop App Patch

## Context & Purpose

By default, the PostHog Desktop app (`@posthog/code`) restricts the **Custom** server selection region to **development mode** (`pnpm dev`) or builds created on the **test build channel** (`VITE_POSTHOG_BUILD_CHANNEL="test"`). Production/stable release builds hide the Custom option and only allow connecting to US Cloud or EU Cloud.

This patch unlocks the **Custom** (self-hosted) region in **standard stable builds** so you can connect directly to your own self-hosted PostHog instance using the standard `posthog-code://callback` deep link scheme without running in dev/test mode.

---

## The 3 Files Modified

Whenever upstream code is pulled or merged, check and ensure the following 3 modifications are preserved:

### 1. Main Process: Enable Custom Cloud Store

- **File**: `products/desktop/apps/code/src/main/utils/build-channel.ts`
- **Why**: `ElectronCustomCloudStore` calls `isCustomCloudBuild()` before reading or saving custom instance settings to `settings.json`. If this returns `false`, settings are discarded as `null`.
- **Change**: Make `isCustomCloudBuild()` unconditionally return `true`.

```diff
-// A release build has no way to edit a custom target, so it must not read or
-// write one either.
+// Patched: allow custom cloud in all builds (for self-hosted use).
 export function isCustomCloudBuild(): boolean {
-  return process.env.POSTHOG_CODE_IS_DEV === "true" || isTestChannelBuild();
+  return true;
 }
```

---

### 2. Vite Build Config: Bake Custom Cloud Feature Flag into Renderer

- **File**: `products/desktop/apps/code/vite.shared.mts`
- **Why**: `apps/code/src/renderer/desktop-services.ts` reads `import.meta.env.VITE_POSTHOG_CUSTOM_CLOUD_BUILD === "true"` to declare host capability `customCloud: true`. Vite injects this string at compile time.
- **Change**: Make `createCustomCloudDefine()` always define `VITE_POSTHOG_CUSTOM_CLOUD_BUILD` as `"true"`.

```diff
-// The main process decides custom-cloud availability at runtime from
-// app.isPackaged and the build channel. The renderer cannot see either, so
-// both vite configs bake the same answer here. A packaged build forced into
-// dev mode (FORCE_DEV_MODE) must NOT offer Custom, because its store still
-// refuses to hold a target.
+// Patched: always enable custom cloud in the renderer (for self-hosted use).
 export function createCustomCloudDefine(
-  isDevServer: boolean,
+  _isDevServer: boolean,
 ): Record<string, string> {
   return {
-    "import.meta.env.VITE_POSTHOG_CUSTOM_CLOUD_BUILD": JSON.stringify(
-      String(isDevServer || process.env.VITE_POSTHOG_BUILD_CHANNEL === "test"),
-    ),
+    "import.meta.env.VITE_POSTHOG_CUSTOM_CLOUD_BUILD": JSON.stringify("true"),
   };
 }
```

---

### 3. UI Component: Decouple Custom Region from Dev Region

- **File**: `products/desktop/packages/ui/src/features/auth/OAuthControls.tsx`
- **Why**: Originally, `includeCustomRegion` was defined as `includeDevRegion && hostHoldsCustomCloud`. In stable/packaged builds, `includeDevRegion` defaults to `false`, which forced `includeCustomRegion` to `false` even when the host supported it (`hostHoldsCustomCloud === true`).
- **Change**: Decouple `includeCustomRegion` from `includeDevRegion`. Let it default directly to `hostHoldsCustomCloud` (or an explicit prop).

```diff
 interface OAuthControlsProps {
   onAuthInitiated?: (region: CloudRegion) => void;
   /** Defaults to the dev build, where development targets are available. */
   includeDevRegion?: boolean;
+  /** Custom needs a host that can hold the target. Defaults to host capability. */
+  includeCustomRegion?: boolean;
 }
 
 export function OAuthControls({
   onAuthInitiated,
   includeDevRegion = import.meta.env.DEV ||
     import.meta.env.VITE_POSTHOG_BUILD_CHANNEL === "test",
+  includeCustomRegion: includeCustomRegionProp,
 }: OAuthControlsProps = {}) {
   const { customCloud: hostHoldsCustomCloud } = useHostCapabilities();
-  const includeCustomRegion = includeDevRegion && hostHoldsCustomCloud;
+  const includeCustomRegion = includeCustomRegionProp ?? hostHoldsCustomCloud;
```

---

## Instructions for a Coding Agent After Upstream Changes

When rebasing or pulling upstream commits:

1. **Verify if the patch was overwritten**:
   ```bash
   git diff upstream/master...HEAD products/desktop/apps/code/src/main/utils/build-channel.ts products/desktop/apps/code/vite.shared.mts products/desktop/packages/ui/src/features/auth/OAuthControls.tsx
   ```

2. **Re-apply the 3 changes** listed above if any of them were reverted.

3. **Validate TypeScript & Build**:
   ```bash
   cd products/desktop
   pnpm --filter @posthog/ui typecheck
   pnpm run build:deps
   cd apps/code
   SKIP_NOTARIZE=1 pnpm run package
   ```

4. **Verify the built bundle**:
   Confirm that `"your own instance"` is present in the packaged app:
   ```bash
   grep -q "your own instance" out/mac-arm64/PostHog.app/Contents/Resources/app.asar && echo "OK: Custom region included"
   ```
