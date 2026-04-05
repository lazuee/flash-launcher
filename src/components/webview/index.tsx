import spinnerImage from "@assets/img/spinner-light.svg";
import { IconSphereOff } from "@tabler/icons-react";
import type { WebviewTag } from "electron";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const SOCIAL_DOMAINS = [
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "discord.com",
  "discord.gg",
  "reddit.com",
  "linkedin.com",
];

const isSocialDomain = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return SOCIAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
};

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  accent: string;
  createdAt: number;
}

// network error codes from Chromium (Chrome 87 / Electron 11.5.0 compatible)
// https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h
const NETWORK_ERROR_CODES = new Set([
  -2, // ERR_FAILED
  -3, // ERR_ABORTED (navigation cancelled, ignore this)
  -6, // ERR_FILE_NOT_FOUND
  -7, // ERR_TIMED_OUT
  -15, // ERR_SOCKET_NOT_CONNECTED
  -21, // ERR_NETWORK_CHANGED
  -100, // ERR_CONNECTION_CLOSED
  -101, // ERR_CONNECTION_RESET
  -102, // ERR_CONNECTION_REFUSED
  -103, // ERR_CONNECTION_ABORTED
  -104, // ERR_CONNECTION_FAILED
  -105, // ERR_NAME_NOT_RESOLVED
  -106, // ERR_INTERNET_DISCONNECTED
  -109, // ERR_ADDRESS_UNREACHABLE
  -118, // ERR_CONNECTION_TIMED_OUT
  -130, // ERR_PROXY_CONNECTION_FAILED
  -137, // ERR_NAME_RESOLUTION_FAILED
  -324, // ERR_EMPTY_RESPONSE
]);

// errors to ignore (not network related)
const IGNORED_ERROR_CODES = new Set([
  -3, // ERR_ABORTED - navigation was cancelled (clicking link while loading)
]);

export const Webview = ({
  id,
  url,
  isActive,
  onTitleUpdate,
  onUrlChanged,
  onClose,
}: {
  id?: string;
  url: string;
  isActive?: boolean;
  onTitleUpdate: (id: string, title: string) => void;
  onUrlChanged: (id: string, url: string) => void;
  onClose?: (id: string) => void;
}) => {
  const webviewId = id || `webview-${Date.now()}`;
  const webviewActive = isActive === undefined ? true : isActive;
  const webviewRef = useRef<WebviewTag>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [_isDomReady, setIsDomReady] = useState(false);
  const [networkError, setNetworkError] = useState<{
    code: number;
    description: string;
  } | null>(null);

  const reloadWebview = useCallback(() => {
    const webview = webviewRef.current;
    if (webview?.reload) {
      setNetworkError(null);
      setIsLoading(true);
      webview.reload();
    }
  }, []);


  // auto-retry when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      if (networkError) {
        reloadWebview();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [networkError, reloadWebview]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // skip setting up webview if it's a social domain (will be closed)
    if (isSocialDomain(url)) return;

    const handleTitleUpdated = (e: any) => {
      onTitleUpdate(webviewId, e.title);
    };

    // URL change handler (main frame navigation complete)
    const handleDidNavigate = (e: any) => {
      onUrlChanged(webviewId, e.url);
      setNetworkError(null);
    };

    // In-page navigation (hash changes, pushState, etc.)
    const handleDidNavigateInPage = (e: any) => {
      if (e.isMainFrame) {
        onUrlChanged(webviewId, e.url);
      }
    };

    const handleDidStartLoading = () => {
      setIsLoading(true);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
    };

    const handleDomReady = () => {
      setIsDomReady(true);
      setIsLoading(false);
    };

    const handleDidFailLoad = (e: any) => {
      const { errorCode, errorDescription, isMainFrame, validatedURL } = e;

      // only handle main frame errors
      if (!isMainFrame) return;

      // ignore aborted navigations (user clicked another link)
      if (IGNORED_ERROR_CODES.has(errorCode)) return;

      // check if it's a network-related error
      if (NETWORK_ERROR_CODES.has(errorCode)) {
        console.warn(
          `[Webview] Network error ${errorCode}: ${errorDescription} for ${validatedURL}`,
        );
        setNetworkError({
          code: errorCode,
          description: errorDescription || "Network error",
        });
      }

      setIsLoading(false);
    };

    // close tab when navigating to social media domains (external link handled by main process)
    const handleWillNavigate = (e: any) => {
      const url = e.url;
      if (isSocialDomain(url)) {
        onClose?.(webviewId);
      }
    };

    webview.addEventListener("will-navigate", handleWillNavigate);
    webview.addEventListener("page-title-updated", handleTitleUpdated);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);
    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-fail-load", handleDidFailLoad);

    return () => {
      webview.removeEventListener("will-navigate", handleWillNavigate);
      webview.removeEventListener("page-title-updated", handleTitleUpdated);
      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener(
        "did-navigate-in-page",
        handleDidNavigateInPage,
      );
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
    };
  }, [webviewId, url, onTitleUpdate, onUrlChanged, onClose]);

  const showLoadingOverlay = webviewActive && isLoading && !networkError;
  const showOfflineOverlay = webviewActive && networkError !== null;

  return (
    <div
      className={`relative w-full h-full ${webviewActive ? "z-40 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"}`}
    >
      <AnimatePresence mode="wait">
        {showLoadingOverlay && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-app-primary"
          >
            <div className="w-8 h-8 pr-0.5 flex items-center justify-center">
              <motion.img
                src={spinnerImage}
                alt="loading"
                className="w-6 h-6"
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Number.POSITIVE_INFINITY,
                  duration: 1.5,
                  ease: "linear",
                }}
              />
            </div>
            <p className="mt-4 text-sm text-app-text-primary/60">Loading...</p>
          </motion.div>
        )}

        {showOfflineOverlay && (
          <motion.div
            key="offline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-app-primary"
          >
            <div>
              <IconSphereOff
                size={48}
                className="text-app-text-primary"
              />
            </div>
            <h2 className="mt-4 text-lg font-medium text-app-text-primary">
              {networkError?.code === -106
                ? "No internet"
                : "Can't reach this page"}
            </h2>
            <p className="mt-1 text-sm text-app-text-primary/60">
              {networkError?.code === -106
                ? "Check your connection and try again"
                : networkError?.code === -105
                  ? "The server's DNS address could not be found"
                  : networkError?.code === -102
                    ? "The connection was refused"
                    : networkError?.code === -118
                      ? "The connection timed out"
                      : "Something went wrong"}
            </p>
            <button
              type="button"
              onClick={reloadWebview}
              className="mt-6 px-6 py-2 text-app-text-primary text-sm font-semibold rounded-full transition-colors hover:opacity-90"
            >
              Retry
            </button>
            {networkError?.code === -106 && (
              <p className="mt-4 text-xs text-app-text-primary/40">
                Will reconnect automatically when online
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <webview
        ref={webviewRef}
        {...({
          src: url,
          style: { width: "100%", height: "100%" },
          plugins: "true",
          allowpopups: "true",
          partition: "persist:flash-launcher",
        } as any)}
      />
    </div>
  );
};