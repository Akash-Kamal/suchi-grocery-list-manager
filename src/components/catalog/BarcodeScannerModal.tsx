import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Camera,
  X,
  Flashlight,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Search,
  Plus,
  RefreshCw,
  Keyboard,
  Layers,
  Globe,
  WifiOff,
  Package,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { lookupCatalogItemByBarcode, normalizeBarcode, buildBarcodeLookupMap } from '../../utils/barcodeLookup';
import { lookupOnlineProductByBarcode, type OnlineBarcodeProduct } from '../../services/barcodeProductLookup';
import { getDefaultQuantity } from '../../utils/catalogQuantity';
import { normalizeItemName } from '../../utils/catalogItemIdentity';
import { runCameraDiagnostics } from '../../utils/cameraDiagnostics';
import type { CatalogItem, Category, ListItem } from '../../types/database';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogItems: CatalogItem[];
  categories?: Category[];
  currentItems?: ListItem[];
  onItemResolved: (catalogItem: CatalogItem) => void;
  onCustomItemRequested?: (scannedText: string) => void;
  onSearchRequested?: (query: string) => void;
  onOnlineProductAddToList?: (product: OnlineBarcodeProduct) => void;
  onOnlineProductAddToCatalog?: (product: OnlineBarcodeProduct) => Promise<void> | void;
  onOnlineProductAddToListAndCatalog?: (product: OnlineBarcodeProduct) => Promise<void> | void;
}

type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'processing'
  | 'looking_up_online'
  | 'found'
  | 'online_product_found'
  | 'not_found'
  | 'qr_detected'
  | 'manual_entry'
  | 'permission_denied'
  | 'camera_unavailable'
  | 'offline'
  | 'network_error'
  | 'error';

const SCAN_ELEMENT_ID = 'soochi-barcode-scanner-reader';

// Supported barcode formats for camera detection
const SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  catalogItems,
  categories = [],
  currentItems = [],
  onItemResolved,
  onCustomItemRequested,
  onSearchRequested,
  onOnlineProductAddToList,
  onOnlineProductAddToCatalog,
  onOnlineProductAddToListAndCatalog,
}) => {
  const [status, setStatus] = useState<ScannerStatus>(isOpen ? 'starting' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [matchedItem, setMatchedItem] = useState<CatalogItem | null>(null);
  const [onlineProduct, setOnlineProduct] = useState<OnlineBarcodeProduct | null>(null);
  const [manualInput, setManualInput] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [hasTorchSupport, setHasTorchSupport] = useState<boolean>(false);
  const [isActionInProgress, setIsActionInProgress] = useState<boolean>(false);

  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingScanRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const barcodeMapRef = useRef<Map<string, CatalogItem>>(new Map());

  // Store latest callbacks in refs to prevent useEffect re-runs
  const callbacksRef = useRef({
    catalogItems,
    onItemResolved,
    onCustomItemRequested,
    onSearchRequested,
    onOnlineProductAddToList,
    onOnlineProductAddToCatalog,
    onOnlineProductAddToListAndCatalog,
  });

  useEffect(() => {
    callbacksRef.current = {
      catalogItems,
      onItemResolved,
      onCustomItemRequested,
      onSearchRequested,
      onOnlineProductAddToList,
      onOnlineProductAddToCatalog,
      onOnlineProductAddToListAndCatalog,
    };
    barcodeMapRef.current = buildBarcodeLookupMap(catalogItems);
  }, [
    catalogItems,
    onItemResolved,
    onCustomItemRequested,
    onSearchRequested,
    onOnlineProductAddToList,
    onOnlineProductAddToCatalog,
    onOnlineProductAddToListAndCatalog,
  ]);

  // Stop camera tracks cleanly
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('[SOOCHI Scanner] Stop warning:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  }, []);

  // Process a decoded barcode or QR value
  const handleDecodedCode = useCallback(
    async (decodedText: string) => {
      if (isProcessingScanRef.current) return;
      isProcessingScanRef.current = true;

      const normalized = normalizeBarcode(decodedText);
      console.info('[SOOCHI Scanner] Decoded code:', normalized);
      setScannedCode(normalized);

      // Provide single haptic feedback if supported
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(50);
        } catch {
          // Ignore unsupported vibration
        }
      }

      // Stop camera preview immediately after scan
      await stopScanner();

      // Show brief processing indicator
      setStatus('processing');

      // 1. Local O(1) exact catalog lookup first
      const item = lookupCatalogItemByBarcode(normalized, callbacksRef.current.catalogItems, barcodeMapRef.current);

      if (item) {
        console.info('[SOOCHI Scanner] Local match found:', item.name);
        setMatchedItem(item);
        setStatus('found');
        return;
      }

      // If it looks like arbitrary QR with non-numeric text/URL, show QR state immediately
      const isArbitraryQR = /[a-zA-Z/:.?&=]/.test(normalized) && !/^\d+$/.test(normalized);
      if (isArbitraryQR) {
        console.info('[SOOCHI Scanner] Arbitrary QR payload detected');
        setStatus('qr_detected');
        return;
      }

      // 2. Check offline status before online attempt
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        console.info('[SOOCHI Scanner] Client offline, skipping online lookup');
        setStatus('offline');
        return;
      }

      // 3. Fall back to online product lookup (Open Food Facts)
      setStatus('looking_up_online');
      try {
        console.info('[SOOCHI Scanner] Querying online Open Food Facts for barcode:', normalized);
        const onlineProd = await lookupOnlineProductByBarcode(normalized);
        if (onlineProd) {
          console.info('[SOOCHI Scanner] Online product resolved:', onlineProd.productName);
          setOnlineProduct(onlineProd);
          setStatus('online_product_found');
        } else {
          console.info('[SOOCHI Scanner] Product not found online or locally');
          setStatus('not_found');
        }
      } catch (err) {
        console.warn('[SOOCHI Scanner] Online barcode lookup failed:', err);
        setStatus('network_error');
      }
    },
    [stopScanner]
  );

  // Poll for the scanner DOM container to be mounted and attached to document
  const waitForContainer = async (timeoutMs = 8000): Promise<boolean> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (
        scannerContainerRef.current &&
        document.body.contains(scannerContainerRef.current) &&
        document.getElementById(SCAN_ELEMENT_ID)
      ) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return false;
  };

  // Start live camera stream with intelligent multi-platform fallback (Android Chrome + macOS Chrome/Safari)
  const startScanner = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    setStatus('starting');
    setErrorMessage('');
    setScannedCode('');
    setMatchedItem(null);
    setOnlineProduct(null);
    setIsActionInProgress(false);
    isProcessingScanRef.current = false;
    setIsTorchOn(false);

    try {
      runCameraDiagnostics().catch(console.warn);

      // 1. Wait for container to be firmly committed to DOM
      const isReady = await waitForContainer(8000);
      if (!isReady) {
        console.warn('[SOOCHI Scanner] Viewfinder DOM container timed out');
        setStatus('error');
        setErrorMessage('Camera initialization timed out. You can enter the barcode manually.');
        return;
      }

      // 2. Check getUserMedia support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('[SOOCHI Scanner] getUserMedia is not supported in this browser environment');
        setStatus('camera_unavailable');
        setErrorMessage('Camera access is not supported by this browser. You can still enter the barcode manually.');
        return;
      }

      await stopScanner();

      const html5QrCode = new Html5Qrcode(SCAN_ELEMENT_ID, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.max(Math.floor(minEdge * 0.72), 180);
          return { width: edge, height: edge };
        },
        aspectRatio: 1.0,
      };

      console.info('[SOOCHI Scanner] Requesting camera stream...');

      let started = false;

      // 1. Try environment / rear camera first (ideal for Android/iOS)
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            handleDecodedCode(decodedText);
          },
          () => {
            // Frame scanned without code — normal
          }
        );
        started = true;
        console.info('[SOOCHI Scanner] Camera started successfully with facingMode: environment');
      } catch (envErr) {
        console.info('[SOOCHI Scanner] facingMode: environment failed, checking available cameras:', envErr);
      }

      // 2. Fallback to available camera device ID or user camera (macOS Chrome/Safari, laptops without rear cameras)
      if (!started) {
        try {
          const cameras = await Html5Qrcode.getCameras();
          console.info(`[SOOCHI Scanner] Found ${cameras.length} available camera device(s):`, cameras.map((c) => c.label || c.id));

          if (cameras.length > 0) {
            // Prefer rear camera if present in label, otherwise use primary camera
            const backCamera = cameras.find((c) => /back|rear|environment/i.test(c.label));
            const selectedCameraId = backCamera ? backCamera.id : cameras[0].id;

            await html5QrCode.start(
              selectedCameraId,
              config,
              (decodedText) => {
                handleDecodedCode(decodedText);
              },
              () => {
                // Frame scanned without code
              }
            );
            started = true;
            console.info('[SOOCHI Scanner] Camera started with device ID fallback:', selectedCameraId);
          } else {
            // Try user facing mode as final fallback
            await html5QrCode.start(
              { facingMode: 'user' },
              config,
              (decodedText) => {
                handleDecodedCode(decodedText);
              },
              () => {}
            );
            started = true;
            console.info('[SOOCHI Scanner] Camera started with facingMode: user');
          }
        } catch (fallbackErr) {
          console.error('[SOOCHI Scanner] Camera fallback acquisition failed:', fallbackErr);
          throw fallbackErr;
        }
      }

      setStatus('scanning');

      // Check if torch is supported
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorchSupport(true);
        } else {
          setHasTorchSupport(false);
        }
      } catch {
        setHasTorchSupport(false);
      }
    } catch (err: unknown) {
      console.error('[SOOCHI Scanner] Camera startup error:', err);
      const errMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

      if (errMsg.includes('notallowed') || errMsg.includes('permission') || errMsg.includes('denied')) {
        setStatus('permission_denied');
        setErrorMessage('Camera permission was denied. You can allow camera access in browser settings or enter the barcode manually.');
      } else if (errMsg.includes('notfound') || errMsg.includes('devices') || errMsg.includes('no camera') || errMsg.includes('overconstrained')) {
        setStatus('camera_unavailable');
        setErrorMessage('No compatible camera was detected on this device. You can enter the barcode manually.');
      } else {
        setStatus('error');
        setErrorMessage('Camera initialization failed. You can enter the barcode manually.');
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [handleDecodedCode, stopScanner]);

  // Start scanner when modal opens, stop when modal closes
  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
      setStatus('idle');
      isProcessingScanRef.current = false;
      isStartingRef.current = false;
    }
    return () => {
      stopScanner();
      isStartingRef.current = false;
    };
  }, [isOpen, startScanner, stopScanner]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Toggle torch / flash
  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorchSupport) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('[SOOCHI Scanner] Torch toggle failed:', err);
    }
  };

  // Handle manual barcode submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInput.trim();
    if (!clean) return;
    handleDecodedCode(clean);
  };

  // Add locally matched item through existing pipeline
  const handleConfirmAddMatched = () => {
    if (matchedItem) {
      callbacksRef.current.onItemResolved(matchedItem);
      onClose();
    }
  };

  // Online product actions
  const handleOnlineAddToList = () => {
    if (!onlineProduct || isActionInProgress) return;
    setIsActionInProgress(true);
    if (callbacksRef.current.onOnlineProductAddToList) {
      callbacksRef.current.onOnlineProductAddToList(onlineProduct);
    }
    onClose();
  };

  const handleOnlineAddToCatalog = async () => {
    if (!onlineProduct || isActionInProgress) return;
    setIsActionInProgress(true);
    if (callbacksRef.current.onOnlineProductAddToCatalog) {
      await callbacksRef.current.onOnlineProductAddToCatalog(onlineProduct);
    }
    onClose();
  };

  const handleOnlineAddToListAndCatalog = async () => {
    if (!onlineProduct || isActionInProgress) return;
    setIsActionInProgress(true);
    if (callbacksRef.current.onOnlineProductAddToListAndCatalog) {
      await callbacksRef.current.onOnlineProductAddToListAndCatalog(onlineProduct);
    }
    onClose();
  };

  // Actions for unknown barcode
  const handleAddAsCustom = () => {
    if (callbacksRef.current.onCustomItemRequested) {
      callbacksRef.current.onCustomItemRequested(scannedCode);
    }
    onClose();
  };

  const handleSearchCatalog = () => {
    if (callbacksRef.current.onSearchRequested) {
      callbacksRef.current.onSearchRequested(scannedCode);
    }
    onClose();
  };

  // Check if matched item already exists in current list
  const existingItemInList = matchedItem
    ? currentItems.find(
        (i) =>
          (i.catalogItemId && i.catalogItemId === matchedItem.id) ||
          (i.itemNameSnapshot && normalizeItemName(i.itemNameSnapshot) === normalizeItemName(matchedItem.name))
      )
    : undefined;

  const categoryName = matchedItem
    ? categories.find((c) => c.id === matchedItem.categoryId)?.name || 'Kitchen & Staples'
    : '';

  const defaultQty = matchedItem ? getDefaultQuantity(matchedItem.defaultUnit) : 1;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-gray-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 id="scanner-modal-title" className="text-base font-black text-gray-900 dark:text-white leading-tight">
                Scan Product
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                Point your camera at a barcode or QR code
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {hasTorchSupport && status === 'scanning' && (
              <button
                type="button"
                onClick={handleToggleTorch}
                aria-label={isTorchOn ? 'Turn off flash' : 'Turn on flash'}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  isTorchOn
                    ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close scanner"
              className="p-2.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Live Camera Viewfinder (Scanning or Starting) */}
          {(status === 'scanning' || status === 'starting') && (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square flex items-center justify-center border border-gray-800 shadow-inner">
              <div
                ref={scannerContainerRef}
                id={SCAN_ELEMENT_ID}
                className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
              />

              {/* Scanning Target Frame Overlay */}
              {status === 'scanning' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 sm:p-8">
                  <div className="w-52 h-52 sm:w-60 sm:h-60 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                </div>
              )}

              {status === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <p className="text-xs font-semibold">Starting camera...</p>
                </div>
              )}
            </div>
          )}

          {/* Looking Up Online State */}
          {(status === 'processing' || status === 'looking_up_online') && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3" aria-live="polite">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-slate-200">
                  {status === 'looking_up_online' ? 'Looking up product online...' : 'Looking up product...'}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono mt-0.5">
                  Barcode: {scannedCode}
                </p>
              </div>
            </div>
          )}

          {/* Local Product Found State */}
          {status === 'found' && matchedItem && (
            <div
              className="bg-emerald-50/80 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center space-y-3.5 animate-fade-in"
              aria-live="polite"
            >
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <div className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/70 px-2.5 py-0.5 rounded-full mb-1">
                  <Layers className="w-3 h-3" />
                  <span>{categoryName}</span>
                </div>

                <h3 className="text-lg font-black text-gray-900 dark:text-white mt-1 leading-snug">
                  {matchedItem.name}
                </h3>

                <div className="flex items-center justify-center space-x-2 text-xs text-gray-600 dark:text-slate-300 mt-1 font-medium">
                  <span>Unit: <strong className="text-gray-900 dark:text-white">{matchedItem.defaultUnit}</strong></span>
                  <span>·</span>
                  <span>Qty: <strong className="text-gray-900 dark:text-white">{defaultQty} {matchedItem.defaultUnit}</strong></span>
                </div>

                <p className="text-[11px] text-gray-400 dark:text-slate-500 font-mono mt-1">
                  Code: {scannedCode}
                </p>

                {existingItemInList && (
                  <div className="mt-2.5 inline-block bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-xl">
                    Already in your list ({existingItemInList.quantity} {existingItemInList.unit})
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={startScanner}
                  className="px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all cursor-pointer min-h-[44px]"
                >
                  Scan Another
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddMatched}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer min-h-[44px]"
                >
                  {existingItemInList ? '+ Add another quantity' : '+ Add to List'}
                </button>
              </div>
            </div>
          )}

          {/* Online Product Found State (STEP 14) */}
          {status === 'online_product_found' && onlineProduct && (
            <div
              className="bg-emerald-50/70 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 sm:p-5 text-center space-y-3.5 animate-fade-in"
              aria-live="polite"
            >
              {/* Product Image or Icon */}
              {onlineProduct.imageUrl ? (
                <div className="w-20 h-20 mx-auto rounded-2xl bg-white dark:bg-slate-800 p-1 border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden flex items-center justify-center">
                  <img
                    src={onlineProduct.imageUrl}
                    alt={onlineProduct.productName}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain rounded-xl"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Package className="w-6 h-6" />
                </div>
              )}

              <div>
                <div className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/70 px-2.5 py-0.5 rounded-full mb-1">
                  <Globe className="w-3 h-3" />
                  <span>{onlineProduct.categoryName}</span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white mt-1 leading-snug">
                  {onlineProduct.productName}
                </h3>

                {onlineProduct.brand && (
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {onlineProduct.brand}
                  </p>
                )}

                <div className="flex items-center justify-center space-x-2 text-xs text-gray-600 dark:text-slate-300 mt-1 font-medium">
                  <span>Unit: <strong className="text-gray-900 dark:text-white">{onlineProduct.unit}</strong></span>
                  <span>·</span>
                  <span>Qty: <strong className="text-gray-900 dark:text-white">{onlineProduct.quantity} {onlineProduct.unit}</strong></span>
                </div>

                <p className="text-[11px] text-gray-400 dark:text-slate-500 font-mono mt-1">
                  Barcode: {onlineProduct.barcode} · Source: {onlineProduct.source}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleOnlineAddToListAndCatalog}
                  disabled={isActionInProgress}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer min-h-[44px]"
                >
                  + Add to List & Catalog
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleOnlineAddToList}
                    disabled={isActionInProgress}
                    className="py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all cursor-pointer min-h-[44px]"
                  >
                    + Add to List
                  </button>
                  <button
                    type="button"
                    onClick={handleOnlineAddToCatalog}
                    disabled={isActionInProgress}
                    className="py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-bold text-xs rounded-xl hover:bg-emerald-50/50 dark:hover:bg-slate-700 transition-all cursor-pointer min-h-[44px]"
                  >
                    Save to Catalog
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={startScanner}
                    className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[36px] py-1"
                  >
                    Scan Another
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Offline Warning State */}
          {status === 'offline' && (
            <div
              className="bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-center space-y-3 animate-fade-in"
              aria-live="polite"
            >
              <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <WifiOff className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-amber-950 dark:text-amber-100">
                  You're Offline
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 font-mono mt-0.5">
                  Barcode: {scannedCode}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-2">
                  This product is not in your local catalog. Online product lookup requires an active internet connection.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddAsCustom}
                  className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Item</span>
                </button>
                <button
                  type="button"
                  onClick={handleSearchCatalog}
                  className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Search className="w-4 h-4" />
                  <span>Search Catalog</span>
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={startScanner}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[36px] py-1"
                >
                  Scan Again
                </button>
              </div>
            </div>
          )}

          {/* Product Not Found State (After Local + Online Lookup) */}
          {(status === 'not_found' || status === 'network_error') && (
            <div
              className="bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-center space-y-3 animate-fade-in"
              aria-live="polite"
            >
              <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-amber-950 dark:text-amber-100">
                  {status === 'network_error' ? "Couldn't reach product database" : 'Product not found'}
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 font-mono mt-0.5">
                  Barcode: {scannedCode}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-2">
                  {status === 'network_error'
                    ? 'Could not connect to the online product database right now. You can add it as a custom item:'
                    : 'This barcode was not found locally or in the online open database. Choose how you would like to add it:'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddAsCustom}
                  className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Item</span>
                </button>
                <button
                  type="button"
                  onClick={handleSearchCatalog}
                  className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Search className="w-4 h-4" />
                  <span>Search Catalog</span>
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={startScanner}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[36px] py-1"
                >
                  Scan Again
                </button>
              </div>
            </div>
          )}

          {/* QR Code Detected State */}
          {status === 'qr_detected' && (
            <div
              className="bg-slate-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-2xl p-5 text-center space-y-3 animate-fade-in"
              aria-live="polite"
            >
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <QrCode className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  QR Code Detected
                </h3>
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 text-xs font-mono text-gray-700 dark:text-slate-300 break-all max-h-24 overflow-y-auto mt-2">
                  {scannedCode}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddAsCustom}
                  className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add as Custom Item</span>
                </button>
                <button
                  type="button"
                  onClick={handleSearchCatalog}
                  className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[44px]"
                >
                  <Search className="w-4 h-4" />
                  <span>Search in Catalog</span>
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={startScanner}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[36px] py-1"
                >
                  Scan Again
                </button>
              </div>
            </div>
          )}

          {/* Camera Permission / Error States */}
          {(status === 'permission_denied' || status === 'camera_unavailable' || status === 'error') && (
            <div
              className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-center space-y-3 animate-fade-in"
              aria-live="assertive"
            >
              <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  Camera access is unavailable
                </h3>
                <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 leading-relaxed">
                  You can still enter the barcode manually.
                </p>
                {errorMessage && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                    {errorMessage}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatus('manual_entry')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer min-h-[44px]"
                >
                  Enter Barcode Manually
                </button>
                <button
                  type="button"
                  onClick={startScanner}
                  className="w-full sm:w-auto px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer min-h-[44px]"
                >
                  Try Camera Again
                </button>
              </div>
            </div>
          )}

          {/* Manual Barcode Entry Form */}
          {status === 'manual_entry' && (
            <form
              onSubmit={handleManualSubmit}
              className="bg-gray-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-3.5 animate-fade-in"
            >
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-900 dark:text-white">
                <Keyboard className="w-4 h-4 text-emerald-600" />
                <label htmlFor="manual-barcode-input">Enter barcode manually</label>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                Type or paste the numeric code below the product barcode:
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  id="manual-barcode-input"
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. 8901234567890"
                  autoFocus
                  aria-label="Enter barcode manually"
                  className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs min-h-[44px]"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer min-h-[44px] whitespace-nowrap"
                >
                  Search Barcode
                </button>
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={startScanner}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[36px] py-1"
                >
                  ← Back to Camera Scanner
                </button>
              </div>
            </form>
          )}

          {/* Bottom Switch to Manual Entry when Scanning */}
          {status === 'scanning' && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={async () => {
                  await stopScanner();
                  setStatus('manual_entry');
                }}
                className="text-xs font-bold text-gray-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 inline-flex items-center space-x-1.5 cursor-pointer min-h-[44px] px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Keyboard className="w-4 h-4" />
                <span>Enter Barcode Manually</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
