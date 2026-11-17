import { useCallback, useEffect, useRef, useState } from 'react';

export type SwStatus = 'unsupported' | 'registering' | 'active' | 'error';

export function useServiceWorker() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swStatus, setSwStatus] = useState<SwStatus>(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? 'registering'
      : 'unsupported'
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [cacheVersion, setCacheVersion] = useState<string | null>(null);
  const [cachedAssetCount, setCachedAssetCount] = useState<number | null>(null);
  const [lastCheckNote, setLastCheckNote] = useState<string | null>(null);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);

  const queryVersion = useCallback((worker: ServiceWorker | null | undefined) => {
    if (!worker) return;
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (evt) => {
        if (evt.data && evt.data.type === 'SW_VERSION') {
          setCacheVersion(evt.data.version ?? null);
          setCachedAssetCount(evt.data.assetCount ?? null);
        }
      };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      // Ignore postMessage failures
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setSwStatus('unsupported');
      return;
    }

    let cancelled = false;
    const hadController = Boolean(navigator.serviceWorker.controller);

    const handleControllerChange = () => {
      if (!hadController || reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SW_VERSION') {
        setCacheVersion(event.data.version ?? null);
        setCachedAssetCount(event.data.assetCount ?? null);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleSwMessage);

    (async () => {
      try {
        // Strictly relative path for GitHub Pages subpath compatibility
        const reg = await navigator.serviceWorker.register('./sw.js', {
          scope: './',
          updateViaCache: 'none',
        });
        if (cancelled) return;

        registrationRef.current = reg;
        setSwStatus('active');

        if (reg.waiting) {
          setUpdateAvailable(true);
        }

        const activeWorker = reg.active || navigator.serviceWorker.controller;
        if (activeWorker) {
          queryVersion(activeWorker);
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
                setLastCheckNote('New version downloaded and ready to apply.');
              } else {
                setSwStatus('active');
                queryVersion(reg.active || installing);
                setLastCheckNote('Offline cache ready.');
              }
            }
          });
        });
      } catch {
        if (!cancelled) {
          setSwStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [queryVersion]);

  const applyUpdate = useCallback(() => {
    const reg = registrationRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!isOnline) {
      setLastCheckNote('Currently offline — using cached app bundle.');
      return;
    }
    const reg = registrationRef.current;
    if (!reg) {
      setLastCheckNote('Service Worker unavailable in this browser context.');
      return;
    }

    setCheckingUpdate(true);
    setLastCheckNote(null);
    try {
      await reg.update();
      if (reg.waiting) {
        setUpdateAvailable(true);
        setLastCheckNote('Update ready — tap Apply Update to reload.');
      } else {
        queryVersion(reg.active || navigator.serviceWorker.controller);
        setLastCheckNote('Cache is up to date.');
      }
    } catch {
      setLastCheckNote('Could not reach update server — offline cache remains active.');
    } finally {
      setCheckingUpdate(false);
    }
  }, [isOnline, queryVersion]);

  return {
    isOnline,
    swStatus,
    updateAvailable,
    checkingUpdate,
    cacheVersion,
    cachedAssetCount,
    lastCheckNote,
    checkForUpdate,
    applyUpdate,
  };
}
