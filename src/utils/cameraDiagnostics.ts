/**
 * Development & diagnostic helper for camera permissions and document environment.
 * Does not expose sensitive user data or tokens.
 */
export interface CameraDiagnosticReport {
  isTopLevel: boolean;
  origin: string;
  hasServiceWorkerController: boolean;
  hasMediaDevices: boolean;
  featurePolicyCameraAllowed: boolean | null;
  permissionState?: string;
}

export async function runCameraDiagnostics(): Promise<CameraDiagnosticReport> {
  const isTopLevel = typeof window !== 'undefined' ? window.top === window.self : true;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const hasServiceWorkerController =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? Boolean(navigator.serviceWorker.controller)
      : false;
  const hasMediaDevices =
    typeof navigator !== 'undefined' && 'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function';

  let featurePolicyCameraAllowed: boolean | null = null;
  if (typeof document !== 'undefined') {
    const docWithFeaturePolicy = document as Document & {
      featurePolicy?: { allowsFeature: (feature: string) => boolean };
      permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
    };

    if (docWithFeaturePolicy.permissionsPolicy && typeof docWithFeaturePolicy.permissionsPolicy.allowsFeature === 'function') {
      featurePolicyCameraAllowed = docWithFeaturePolicy.permissionsPolicy.allowsFeature('camera');
    } else if (docWithFeaturePolicy.featurePolicy && typeof docWithFeaturePolicy.featurePolicy.allowsFeature === 'function') {
      featurePolicyCameraAllowed = docWithFeaturePolicy.featurePolicy.allowsFeature('camera');
    }
  }

  let permissionState: string | undefined;
  if (typeof navigator !== 'undefined' && 'permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      permissionState = status.state;
    } catch {
      // Some browsers don't support camera in permissions.query
      permissionState = 'unsupported_query';
    }
  }

  const report: CameraDiagnosticReport = {
    isTopLevel,
    origin,
    hasServiceWorkerController,
    hasMediaDevices,
    featurePolicyCameraAllowed,
    permissionState,
  };

  console.info('[SOOCHI Camera Diagnostics]', report);
  return report;
}
