import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

interface DiagnosticInfo {
  isSecureContext: boolean;
  protocol: string;
  hasGetUserMedia: boolean;
  hasMediaDevices: boolean;
  userAgent: string;
  permissions?: {
    microphone: PermissionState | "unsupported";
  };
}

export function AudioRecordingDiagnostic() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkDiagnostics = async () => {
      const info: DiagnosticInfo = {
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol,
        hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        hasMediaDevices: !!navigator.mediaDevices,
        userAgent: navigator.userAgent,
      };

      // Check microphone permission if available
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const micPermission = await navigator.permissions.query({ name: "microphone" as PermissionName });
          info.permissions = {
            microphone: micPermission.state,
          };
        } catch (err) {
          info.permissions = {
            microphone: "unsupported",
          };
        }
      }

      setDiagnostics(info);
      setLoading(false);
    };

    checkDiagnostics();
  }, []);

  if (loading || !diagnostics) {
    return (
      <Card className="col-span-12 lg:col-span-5 md:col-span-3">
        <CardHeader>
          <CardTitle>Diagnostik Audio</CardTitle>
          <CardDescription>Memeriksa kompatibilitas perekaman audio...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const StatusIcon = ({ status }: { status: boolean }) => {
    return status ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  const allChecksPass =
    diagnostics.isSecureContext &&
    diagnostics.protocol === "https:" &&
    diagnostics.hasGetUserMedia &&
    diagnostics.hasMediaDevices;

  return (
    <Card className="col-span-12 lg:col-span-5 md:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Diagnostik Audio
          {allChecksPass ? (
            <Badge variant="default" className="bg-green-500">
              Siap
            </Badge>
          ) : (
            <Badge variant="destructive">Ada Masalah</Badge>
          )}
        </CardTitle>
        <CardDescription>Status kompatibilitas perekaman audio</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Secure Context Check */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={diagnostics.isSecureContext} />
            <span className="text-sm font-medium">Secure Context</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {diagnostics.isSecureContext ? "Ya" : "Tidak"}
          </span>
        </div>

        {/* Protocol Check */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={diagnostics.protocol === "https:"} />
            <span className="text-sm font-medium">HTTPS Enabled</span>
          </div>
          <span className="text-sm text-muted-foreground">{diagnostics.protocol}</span>
        </div>

        {/* getUserMedia Check */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={diagnostics.hasGetUserMedia} />
            <span className="text-sm font-medium">getUserMedia API</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {diagnostics.hasGetUserMedia ? "Tersedia" : "Tidak Tersedia"}
          </span>
        </div>

        {/* MediaDevices Check */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={diagnostics.hasMediaDevices} />
            <span className="text-sm font-medium">MediaDevices API</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {diagnostics.hasMediaDevices ? "Tersedia" : "Tidak Tersedia"}
          </span>
        </div>

        {/* Microphone Permission */}
        {diagnostics.permissions && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {diagnostics.permissions.microphone === "granted" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : diagnostics.permissions.microphone === "denied" ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              <span className="text-sm font-medium">Izin Mikrofon</span>
            </div>
            <span className="text-sm text-muted-foreground capitalize">
              {diagnostics.permissions.microphone === "granted"
                ? "Diizinkan"
                : diagnostics.permissions.microphone === "denied"
                  ? "Ditolak"
                  : diagnostics.permissions.microphone === "prompt"
                    ? "Belum Diizinkan"
                    : "Tidak Diketahui"}
            </span>
          </div>
        )}

        {/* Warning Messages */}
        {!diagnostics.isSecureContext && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
            <div className="flex gap-2">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-900 dark:text-red-200">
                  Koneksi Tidak Aman
                </p>
                <p className="text-red-700 dark:text-red-300 mt-1">
                  Browser membutuhkan koneksi HTTPS untuk mengakses mikrofon. Pastikan Anda
                  mengakses aplikasi melalui <code className="bg-red-100 dark:bg-red-900 px-1 rounded">https://</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {diagnostics.protocol !== "https:" && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 border border-yellow-200 dark:border-yellow-800">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-900 dark:text-yellow-200">
                  Protokol HTTP Terdeteksi
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                  Anda menggunakan {diagnostics.protocol}. Untuk perekaman audio, gunakan HTTPS.
                </p>
              </div>
            </div>
          </div>
        )}

        {!diagnostics.hasGetUserMedia && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
            <div className="flex gap-2">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-900 dark:text-red-200">
                  API Perekaman Tidak Tersedia
                </p>
                <p className="text-red-700 dark:text-red-300 mt-1">
                  Browser Anda tidak mendukung perekaman audio. Gunakan browser modern seperti Chrome,
                  Firefox, atau Edge versi terbaru.
                </p>
              </div>
            </div>
          </div>
        )}

        {diagnostics.permissions?.microphone === "denied" && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
            <div className="flex gap-2">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-900 dark:text-red-200">
                  Izin Mikrofon Ditolak
                </p>
                <p className="text-red-700 dark:text-red-300 mt-1">
                  Anda perlu mengizinkan akses mikrofon di pengaturan browser. Klik ikon gembok/info
                  di address bar dan ubah pengaturan mikrofon.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Browser Info */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Browser:</span>{" "}
            {diagnostics.userAgent.split(" ").slice(-2).join(" ")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
