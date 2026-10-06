import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useAutoUpdate } from "~/hooks/use-auto-update";
import { useRevalidateOnFocus } from "~/hooks/use-revalidate-on-focus";
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";
import {
  deleteRapat,
  getAllRapat,
  getDiarisasiById,
  getDiarisasiTranscriptById,
  getRingkasanById,
  getTranscriptById,
} from "~/models/rapat.server";
import { getActiveJobs, getUploadJobById } from "~/models/upload_job.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  // if (!user) {
  //   throw redirect("/login");
  // }

  // Require permission to view rapat list
  // await requirePermission(user, "rapat.view.all");

  const url = new URL(request.url);
  const uploadJobId = url.searchParams.get("uploadJobId");
  const page = Number.parseInt(url.searchParams.get("page") || "1");
  const pageSize = Number.parseInt(url.searchParams.get("pageSize") || "10");

  const { data: rapatList, pagination } = await getAllRapat(page, pageSize);

  let uploadJob = null;

  // Check for specific upload job from URL parameter
  if (uploadJobId) {
    uploadJob = await getUploadJobById(uploadJobId);
  }

  // If no specific job ID, check for any active upload jobs
  if (!uploadJob) {
    const activeJobs = await getActiveJobs(1);

    if (activeJobs.length > 0) {
      uploadJob = activeJobs[0];
    }
  }

  return {
    rapatList: rapatList.map((rapat: any) => ({
      id: rapat.id,
      judul: rapat.judul,
      tempat_rapat: rapat.tempat_rapat,
      tanggal: rapat.tanggal,
      status_rapat: rapat.status_rapat,
      status_transkrip: rapat.status_transkrip,
      status_diarisasi: rapat.status_diarisasi,
      status_diarisasi_transkrip: rapat.status_diarisasi_transkrip,
      status_ringkasan: rapat.status_ringkasan,
    })),
    pagination,
    uploadJob,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    // Require permission to delete rapat
    await requirePermission(user, "rapat.delete.all");

    const id = Number.parseInt(formData.get("id") as string);
    await deleteRapat(id);
    return { success: true, message: "Rapat deleted successfully" };
  }

  if (intent === "getTranscript") {
    // Require permission to view rapat
    await requirePermission(user, "rapat.view.all");

    const id = Number.parseInt(formData.get("id") as string);
    const rapat = await getTranscriptById(id);
    return { success: true, transcript: rapat?.transkrip, judul: rapat?.judul };
  }

  if (intent === "getDiarisasi") {
    // Require permission to view rapat
    await requirePermission(user, "rapat.view.all");

    const id = Number.parseInt(formData.get("id") as string);
    const rapat = await getDiarisasiById(id);
    return { success: true, diarisasi: rapat?.diarisasi, judul: rapat?.judul };
  }

  if (intent === "getDiarisasiTranscript") {
    // Require permission to view rapat
    await requirePermission(user, "rapat.view.all");

    const id = Number.parseInt(formData.get("id") as string);
    const rapat = await getDiarisasiTranscriptById(id);
    return {
      success: true,
      diarisasi_transkrip: rapat?.diarisasi_transkrip,
      judul: rapat?.judul,
    };
  }

  if (intent === "getRingkasan") {
    // Require permission to view rapat
    await requirePermission(user, "rapat.view.all");

    const id = Number.parseInt(formData.get("id") as string);
    const rapat = await getRingkasanById(id);

    // Extract only the 'summary' part from ringkasan
    let summaryOnly = rapat?.ringkasan;
    if (summaryOnly) {
      const parsed = typeof summaryOnly === "string" ? JSON.parse(summaryOnly) : summaryOnly;
      if (parsed && typeof parsed === "object" && "summary" in parsed) {
        summaryOnly = parsed.summary;
      }
    }

    return { success: true, ringkasan: summaryOnly, judul: rapat?.judul };
  }

  return { success: false, message: "Invalid intent" };
}

export default function RapatIndex() {
  const { rapatList, pagination, uploadJob } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher();

  // Helper function to format Date to DD-MM-YYYY
  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "-";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  };
  const transcriptFetcher = useFetcher<any>();
  const diarisasiFetcher = useFetcher<any>();
  const diarisasiTranscriptFetcher = useFetcher<any>();
  const ringkasanFetcher = useFetcher<any>();
  const [manualRefreshTime, setManualRefreshTime] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<{
    id: number;
    judul: string;
    data: any;
  } | null>(null);
  const [selectedDiarisasi, setSelectedDiarisasi] = useState<{
    id: number;
    judul: string;
    data: any;
  } | null>(null);
  const [selectedDiarisasiTranscript, setSelectedDiarisasiTranscript] = useState<{
    id: number;
    judul: string;
    data: any;
  } | null>(null);
  const [selectedRingkasan, setSelectedRingkasan] = useState<{
    id: number;
    judul: string;
    data: any;
  } | null>(null);
  const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
  const [isDiarisasiModalOpen, setIsDiarisasiModalOpen] = useState(false);
  const [isDiarisasiTranscriptModalOpen, setIsDiarisasiTranscriptModalOpen] = useState(false);
  const [isRingkasanModalOpen, setIsRingkasanModalOpen] = useState(false);
  const [dismissedUploadJobId, setDismissedUploadJobId] = useState<string | null>(null);

  useRevalidateOnFocus({ enabled: true });

  // Auto-revalidate when there's an active upload job
  useEffect(() => {
    if (uploadJob && uploadJob.status !== "completed" && uploadJob.status !== "failed") {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 1000); // Poll every 1 second for smoother progress updates

      return () => clearInterval(interval);
    }
  }, [uploadJob, revalidator]);

  const handleRefresh = () => {
    revalidator.revalidate();
    setManualRefreshTime(new Date().toISOString());
  };

  const handleDelete = (id: number) => {
    if (confirm("Apakah Anda yakin ingin menghapus rapat ini?")) {
      fetcher.submit({ intent: "delete", id: id.toString() }, { method: "post" });
    }
  };

  const handleDismissUploadNotification = () => {
    if (uploadJob) {
      setDismissedUploadJobId(uploadJob.id);
    }
  };

  // Check if upload notification should be shown
  const shouldShowUploadNotification = uploadJob && uploadJob.id !== dismissedUploadJobId;

  const handleViewTranscript = (id: number, judul: string) => {
    setIsTranscriptModalOpen(true);
    setSelectedTranscript({ id: 0, judul, data: null }); // Set judul immediately
    transcriptFetcher.submit({ intent: "getTranscript", id: id.toString() }, { method: "post" });
  };

  const handleViewDiarisasi = (id: number, judul: string) => {
    setIsDiarisasiModalOpen(true);
    setSelectedDiarisasi({ id: 0, judul, data: null }); // Set judul immediately
    diarisasiFetcher.submit({ intent: "getDiarisasi", id: id.toString() }, { method: "post" });
  };

  const handleViewDiarisasiTranscript = (id: number, judul: string) => {
    setIsDiarisasiTranscriptModalOpen(true);
    setSelectedDiarisasiTranscript({ id: 0, judul, data: null }); // Set judul immediately
    diarisasiTranscriptFetcher.submit({ intent: "getDiarisasiTranscript", id: id.toString() }, { method: "post" });
  };

  const handleViewRingkasan = (id: number, judul: string) => {
    setIsRingkasanModalOpen(true);
    setSelectedRingkasan({ id: 0, judul, data: null }); // Set judul immediately
    ringkasanFetcher.submit({ intent: "getRingkasan", id: id.toString() }, { method: "post" });
  };

  // Update selectedTranscript when transcriptFetcher returns data
  useEffect(() => {
    if (transcriptFetcher.data?.success && transcriptFetcher.state === "idle") {
      setSelectedTranscript({
        id: 0,
        judul: transcriptFetcher.data.judul || "",
        data: transcriptFetcher.data.transcript,
      });
    }
  }, [transcriptFetcher.data, transcriptFetcher.state]);

  // Update selectedDiarisasi when diarisasiFetcher returns data
  useEffect(() => {
    if (diarisasiFetcher.data?.success && diarisasiFetcher.state === "idle") {
      setSelectedDiarisasi({
        id: 0,
        judul: diarisasiFetcher.data.judul || "",
        data: diarisasiFetcher.data.diarisasi,
      });
    }
  }, [diarisasiFetcher.data, diarisasiFetcher.state]);

  // Update selectedDiarisasiTranscript when diarisasiTranscriptFetcher returns data
  useEffect(() => {
    if (diarisasiTranscriptFetcher.data?.success && diarisasiTranscriptFetcher.state === "idle") {
      setSelectedDiarisasiTranscript({
        id: 0,
        judul: diarisasiTranscriptFetcher.data.judul || "",
        data: diarisasiTranscriptFetcher.data.diarisasi_transkrip,
      });
    }
  }, [diarisasiTranscriptFetcher.data, diarisasiTranscriptFetcher.state]);

  // Update selectedRingkasan when ringkasanFetcher returns data
  useEffect(() => {
    if (ringkasanFetcher.data?.success && ringkasanFetcher.state === "idle") {
      setSelectedRingkasan({
        id: 0,
        judul: ringkasanFetcher.data.judul || "",
        data: ringkasanFetcher.data.ringkasan,
      });
    }
  }, [ringkasanFetcher.data, ringkasanFetcher.state]);

  // Set up auto-update with polling
  const { mode, lastUpdate } = useAutoUpdate({
    enabled: true,
    interval: 60000, // 60 second polling interval (reduced frequency)
  });

  // Helper function to get status display
  const getStatusDisplay = () => {
    switch (mode) {
      case "polling":
        return {
          dot: "bg-blue-500",
          text: "Auto-refresh",
          description: "Updates every 60s",
        };
      case "disabled":
      default:
        return {
          dot: "bg-gray-500",
          text: "Disabled",
          description: "No updates",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  const formatTranscript = (transcript: any): string => {
    if (!transcript) return "";

    // If transcript is already a string, return as is
    if (typeof transcript === "string") {
      return transcript;
    }

    // If transcript is a JSON object, try to format it
    try {
      // Handle array of transcript segments
      if (Array.isArray(transcript)) {
        return transcript
          .map((item, index) => {
            // Look for start, end, and text fields directly (no formatting needed)
            const start = item.start;
            const end = item.end;
            const text = item.text;
            const speaker = item.speaker;
            const confidence = item.confidence;

            // Format for diarisasi_transkrip (has speaker, start, end, text)
            if (speaker && start && end && text) {
              return `[${start} - ${end}] ${speaker}: ${text}`;
            }

            // Format for regular transkrip (has start, end, text)
            if (start && end && text) {
              return `[${start} - ${end}] ${text}`;
            }

            // Format for diarisasi (has speaker, start, end, confidence)
            if (speaker && start && end && confidence !== undefined) {
              return `[${start} - ${end}] ${speaker} (confidence: ${confidence})`;
            }

            // Fallback for other field names if needed
            const startTime = item.start_time ?? item.timestamp_start ?? item.begin;
            const endTime = item.end_time ?? item.timestamp_end ?? item.finish;
            const content = item.content ?? item.transcript ?? item.speech;

            if (startTime && endTime && content) {
              return `[${startTime} - ${endTime}] ${content}`;
            }

            // If no valid structure found, return text or stringify
            return text || content || JSON.stringify(item);
          })
          .join("\n");
      }

      // If it's an object with segments or content
      if (typeof transcript === "object") {
        // Check for common object structures
        if (transcript.segments && Array.isArray(transcript.segments)) {
          return formatTranscript(transcript.segments);
        }
        if (transcript.content) {
          return transcript.content;
        }
        if (transcript.text) {
          return transcript.text;
        }
        // Check if it has start, end, and text directly
        if (transcript.start && transcript.end && transcript.text) {
          return `[${transcript.start} - ${transcript.end}] ${transcript.text}`;
        }
      }

      // If it's an object, stringify it for now
      return JSON.stringify(transcript, null, 2);
    } catch {
      return JSON.stringify(transcript, null, 2);
    }
  };

  return (
    <div className="container mx-auto p-2">
      {/* Upload Progress Notification */}
      {shouldShowUploadNotification &&
        uploadJob &&
        uploadJob.status !== "completed" &&
        uploadJob.status !== "failed" && (
          <Card className="!py-0 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-2">
              <div className="flex items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 dark:text-blue-100">Sedang memproses upload...</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {uploadJob.file_name} - {uploadJob.progress}%
                  </p>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadJob.progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {shouldShowUploadNotification && uploadJob?.status === "completed" && (
        <Card className="!py-0 mb-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="rounded-full h-8 w-8 bg-green-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-green-900 dark:text-green-100">Upload berhasil!</p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {uploadJob.file_name} telah berhasil diproses
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissUploadNotification}
                className="text-green-700 hover:text-green-900 dark:text-green-300 dark:hover:text-green-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {shouldShowUploadNotification && uploadJob?.status === "failed" && (
        <Card className="mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="rounded-full h-8 w-8 bg-red-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-red-900 dark:text-red-100">Upload gagal</p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {uploadJob.error_message || "Terjadi kesalahan saat memproses file"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissUploadNotification}
                className="text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Daftar Rapat</h1>
        <div className="flex items-center space-x-3">
          {/* Auto-update Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${statusDisplay.dot}`} />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-700">{statusDisplay.text}</span>
              <span className="text-xs text-gray-500">{statusDisplay.description}</span>
            </div>
            {(lastUpdate || manualRefreshTime) && (
              <div className="text-xs text-gray-500 ml-2">
                <div>Updated:</div>
                <div>{new Date(manualRefreshTime || lastUpdate!).toLocaleTimeString()}</div>
              </div>
            )}
          </div>
          {/* Manual Refresh Button */}
          <button
            onClick={handleRefresh}
            className="ml-2 p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-200 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer"
            title="Refresh data"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Semua Rapat</h2>
        </CardHeader>
        <CardContent>
          {rapatList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Belum ada rapat yang dibuat.</p>
              <Button asChild className="mt-4">
                <Link to="/rapat/create">Buat Rapat Pertama</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-center p-2 font-semibold w-[50px] min-w-[50px]">ID</th>
                    <th className="text-left p-2 font-semibold min-w-[150px] max-w-[150px]">Judul Rapat</th>
                    {/* <th className="text-left p-3 font-semibold w-[130px] min-w-[130px]">
                      Tempat Rapat
                    </th> */}
                    <th className="text-center p-2 font-semibold w-[100px] min-w-[100px]">Tanggal</th>
                    <th className="text-center p-2 font-semibold w-[90px] min-w-[70px]">Status</th>
                    <th className="text-center p-2 font-semibold w-[90px] min-w-28">Raw Data</th>
                    <th className="hidden text-center p-2 font-semibold w-[90px] min-w-[70px]">Diarisasi</th>
                    <th className="text-center p-2 font-semibold w-[90px] min-w-[70px]">Transkrip</th>
                    <th className="text-center p-2 font-semibold w-[90px] min-w-[70px]">Ringkasan</th>
                    <th className="text-center p-3 font-semibold w-[70px] min-w-[60px]">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rapatList.map((rapat) => {
                    return (
                      <tr key={rapat.id} className="border-b hover:bg-slate-50/10">
                        <td className="p-2">{rapat.id}</td>
                        <td className="p-2 font-medium truncate" title={rapat.judul}>
                          {rapat.judul}
                        </td>
                        {/* <td className="p-3 truncate" title={rapat.tempat_rapat}>
                          {rapat.tempat_rapat}
                        </td> */}
                        <td className="p-2 text-center text-sm">{formatDate(rapat.tanggal)}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                              rapat.status_rapat === 0
                                ? "border-gray-500 text-gray-500"
                                : rapat.status_rapat === 1
                                  ? "border-blue-500 text-blue-500"
                                  : "border-green-500 text-green-500"
                            }`}
                          >
                            {rapat.status_rapat === 0
                              ? "Belum Mulai"
                              : rapat.status_rapat === 1
                                ? "Sedang Berlangsung"
                                : "Selesai"}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {rapat.status_transkrip === 1 ? (
                            <button
                              onClick={() => handleViewTranscript(rapat.id, rapat.judul)}
                              disabled={
                                transcriptFetcher.state === "submitting" || transcriptFetcher.state === "loading"
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-green-500 text-green-500 hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {transcriptFetcher.state === "submitting" || transcriptFetcher.state === "loading" ? (
                                <>
                                  <svg
                                    className="animate-spin h-3 w-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  <span>Memuat...</span>
                                </>
                              ) : (
                                "Lihat"
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-500 text-yellow-500">
                              Diproses...
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center hidden">
                          {rapat.status_diarisasi === 1 ? (
                            <button
                              onClick={() => handleViewDiarisasi(rapat.id, rapat.judul)}
                              disabled={diarisasiFetcher.state === "submitting" || diarisasiFetcher.state === "loading"}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-green-500 text-green-500 hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {diarisasiFetcher.state === "submitting" || diarisasiFetcher.state === "loading" ? (
                                <>
                                  <svg
                                    className="animate-spin h-3 w-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  <span>Memuat...</span>
                                </>
                              ) : (
                                "Lihat"
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-500 text-yellow-500">
                              Diproses...
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {rapat.status_diarisasi_transkrip === 1 ? (
                            <button
                              onClick={() => handleViewDiarisasiTranscript(rapat.id, rapat.judul)}
                              disabled={
                                diarisasiTranscriptFetcher.state === "submitting" ||
                                diarisasiTranscriptFetcher.state === "loading"
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-green-500 text-green-500 hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {diarisasiTranscriptFetcher.state === "submitting" ||
                              diarisasiTranscriptFetcher.state === "loading" ? (
                                <>
                                  <svg
                                    className="animate-spin h-3 w-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  <span>Memuat...</span>
                                </>
                              ) : (
                                "Lihat"
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-500 text-yellow-500">
                              Diproses...
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {rapat.status_ringkasan === 1 ? (
                            <button
                              onClick={() => handleViewRingkasan(rapat.id, rapat.judul)}
                              disabled={ringkasanFetcher.state === "submitting" || ringkasanFetcher.state === "loading"}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-green-500 text-green-500 hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {ringkasanFetcher.state === "submitting" || ringkasanFetcher.state === "loading" ? (
                                <>
                                  <svg
                                    className="animate-spin h-3 w-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  <span>Memuat...</span>
                                </>
                              ) : (
                                "Lihat"
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-yellow-500 text-yellow-500">
                              Diproses...
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Link to={`/rapat/view/${rapat.id}`} prefetch="intent">
                              <Button variant="outline" size="sm" title="Lihat detail rapat">
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              </Button>
                            </Link>
                            <Button
                              onClick={() => handleDelete(rapat.id)}
                              variant="destructive"
                              size="sm"
                              disabled={fetcher.state === "submitting"}
                              title="Hapus rapat"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {rapatList.length > 0 && pagination.totalPages > 1 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} of {pagination.totalItems}{" "}
            entries
          </div>

          <div className="flex items-center gap-3">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="pageSize" className="text-xs text-muted-foreground whitespace-nowrap">
                Show:
              </label>
              <select
                id="pageSize"
                value={pagination.pageSize}
                onChange={(e) => {
                  const url = new URL(globalThis.location.href);
                  url.searchParams.set("pageSize", e.target.value);
                  url.searchParams.set("page", "1");
                  globalThis.location.href = url.toString();
                }}
                className="h-8 px-2 text-xs border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1">
              {/* First page */}
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={pagination.currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <Link to={`?page=1&pageSize=${pagination.pageSize}`}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {/* Previous page */}
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={pagination.currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <Link to={`?page=${pagination.currentPage - 1}&pageSize=${pagination.pageSize}`}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {/* Page numbers */}
              <div className="flex gap-1">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    // Show first page, last page, current page, and pages around current
                    return page === 1 || page === pagination.totalPages || Math.abs(page - pagination.currentPage) <= 1;
                  })
                  .map((page, index, array) => {
                    // Add ellipsis if there's a gap
                    const prevPage = array[index - 1];
                    const showEllipsis = prevPage && page - prevPage > 1;

                    return (
                      <>
                        {showEllipsis && (
                          <span key={`ellipsis-${page}`} className="flex h-8 w-8 items-center justify-center text-xs">
                            ...
                          </span>
                        )}
                        <Button
                          key={page}
                          asChild
                          variant={page === pagination.currentPage ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Link to={`?page=${page}&pageSize=${pagination.pageSize}`}>{page}</Link>
                        </Button>
                      </>
                    );
                  })}
              </div>

              {/* Next page */}
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={pagination.currentPage === pagination.totalPages}
                className="h-8 w-8 p-0"
              >
                <Link to={`?page=${pagination.currentPage + 1}&pageSize=${pagination.pageSize}`}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>

              {/* Last page */}
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={pagination.currentPage === pagination.totalPages}
                className="h-8 w-8 p-0"
              >
                <Link to={`?page=${pagination.totalPages}&pageSize=${pagination.pageSize}`}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {rapatList.length > 0 && (
        <div className="mt-6 text-sm text-gray-500 text-center">Total: {pagination.totalItems} rapat</div>
      )}

      {/* Transcript Modal */}
      <Dialog open={isTranscriptModalOpen} onOpenChange={setIsTranscriptModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] w-[90vw] border border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-xl">Transkrip Rapat - {selectedTranscript?.judul || ""}</DialogTitle>
          </DialogHeader>
          <div className="mt-6 max-h-[65vh] overflow-y-auto">
            <div className="rounded-lg p-4">
              {(() => {
                if (transcriptFetcher.state === "submitting" || transcriptFetcher.state === "loading") {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200"></div>
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent absolute top-0 left-0"></div>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-base font-medium text-gray-700">Memuat transkrip...</p>
                        <p className="text-sm text-gray-500">Mohon tunggu sebentar</p>
                      </div>
                    </div>
                  );
                } else if (selectedTranscript?.data) {
                  return (
                    <pre className="whitespace-pre-wrap text-sm leading-7 font-mono">
                      {formatTranscript(selectedTranscript.data)}
                    </pre>
                  );
                } else {
                  return (
                    <div className="text-center py-12 text-gray-500 space-y-2">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <p className="text-base font-medium">Transkrip tidak tersedia</p>
                      <p className="text-sm">Data transkrip belum dapat dimuat</p>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diarisasi Modal */}
      <Dialog open={isDiarisasiModalOpen} onOpenChange={setIsDiarisasiModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] w-[90vw] border border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-xl">Diarisasi Rapat - {selectedDiarisasi?.judul || ""}</DialogTitle>
          </DialogHeader>
          <div className="mt-6 max-h-[65vh] overflow-y-auto">
            <div className="rounded-lg p-4">
              {diarisasiFetcher.state === "submitting" || diarisasiFetcher.state === "loading" ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200"></div>
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent absolute top-0 left-0"></div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-base font-medium text-gray-700">Memuat diarisasi...</p>
                    <p className="text-sm text-gray-500">Mohon tunggu sebentar</p>
                  </div>
                </div>
              ) : selectedDiarisasi?.data ? (
                <pre className="whitespace-pre-wrap text-sm leading-7 font-mono">
                  {formatTranscript(selectedDiarisasi.data)}
                </pre>
              ) : (
                <div className="text-center py-12 text-gray-500 space-y-2">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-base font-medium">Diarisasi tidak tersedia</p>
                  <p className="text-sm">Data diarisasi belum dapat dimuat</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diarisasi Transkrip Modal */}
      <Dialog open={isDiarisasiTranscriptModalOpen} onOpenChange={setIsDiarisasiTranscriptModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] w-[90vw] border border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Diarisasi Transkrip Rapat - {selectedDiarisasiTranscript?.judul || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-6 max-h-[65vh] overflow-y-auto">
            <div className="rounded-lg p-4">
              {diarisasiTranscriptFetcher.state === "submitting" || diarisasiTranscriptFetcher.state === "loading" ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200"></div>
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent absolute top-0 left-0"></div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-base font-medium text-gray-700">Memuat diarisasi transkrip...</p>
                    <p className="text-sm text-gray-500">Mohon tunggu sebentar</p>
                  </div>
                </div>
              ) : selectedDiarisasiTranscript?.data ? (
                <pre className="whitespace-pre-wrap text-sm leading-7 font-mono">
                  {formatTranscript(selectedDiarisasiTranscript.data)}
                </pre>
              ) : (
                <div className="text-center py-12 text-gray-500 space-y-2">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-base font-medium">Diarisasi transkrip tidak tersedia</p>
                  <p className="text-sm">Data diarisasi transkrip belum dapat dimuat</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ringkasan Modal */}
      <Dialog open={isRingkasanModalOpen} onOpenChange={setIsRingkasanModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] w-[90vw] border border-orange-500/50">
          <DialogHeader>
            <DialogTitle className="text-xl">Ringkasan Rapat - {selectedRingkasan?.judul || ""}</DialogTitle>
          </DialogHeader>
          <div className="mt-6 max-h-[65vh] overflow-y-auto">
            <div className="rounded-lg p-4">
              {ringkasanFetcher.state === "submitting" || ringkasanFetcher.state === "loading" ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200"></div>
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent absolute top-0 left-0"></div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-base font-medium text-gray-700">Memuat ringkasan...</p>
                    <p className="text-sm text-gray-500">Mohon tunggu sebentar</p>
                  </div>
                </div>
              ) : selectedRingkasan?.data ? (
                <div className="text-sm leading-7 whitespace-pre-wrap">{selectedRingkasan.data}</div>
              ) : (
                <div className="text-center py-12 text-gray-500 space-y-2">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-base font-medium">Ringkasan tidak tersedia</p>
                  <p className="text-sm">Data ringkasan belum dapat dimuat</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
