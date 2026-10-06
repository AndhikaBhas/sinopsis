import { ArrowLeft, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import remarkGfm from "remark-gfm";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { getRapatById } from "~/models/rapat.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number.parseInt(params.id as string);

  if (Number.isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const rapat = await getRapatById(id);

  if (!rapat) {
    throw new Response("Rapat not found", { status: 404 });
  }

  // Extract summary from ringkasan if it exists
  let summary = null;
  if (rapat.ringkasan) {
    try {
      const parsed = typeof rapat.ringkasan === "string" ? JSON.parse(rapat.ringkasan) : rapat.ringkasan;

      if (parsed && typeof parsed === "object" && "summary" in parsed) {
        summary = parsed.summary;
      } else {
        // If no 'summary' field, use the whole ringkasan
        summary = rapat.ringkasan;
      }
    } catch (error) {
      // If parsing fails, use the original data
      console.error("Failed to parse ringkasan:", error);
      summary = rapat.ringkasan;
    }
    // If we have a string, normalize double-encoded newlines ("\\n") to actual newlines ("\n").
    // Also normalize Windows CRLF sequences if double-encoded.
    if (typeof summary === "string") {
      // Convert \r\n -> \n, and then literal "\\n" to actual newline characters.
      summary = summary.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
    }
  }

  return {
    rapat: {
      id: rapat.id,
      judul: rapat.judul,
      tempat_rapat: rapat.tempat_rapat,
      tanggal: rapat.tanggal,
      ringkasan: summary,
    },
  };
}

export default function RapatView() {
  const { rapat } = useLoaderData<typeof loader>();

  // Helper function to format Date to DD-MM-YYYY
  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "-";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  };

  return (
    <div className="container mx-auto p-2">
      {/* Back Button and Download Button */}
      <div className="mb-6 flex gap-2 items-center justify-between">
        <Link to="/rapat" prefetch="intent">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Daftar Rapat
          </Button>
        </Link>
        <form method="post" action={`/rapat/download/${rapat.id}`}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="gap-1 h-7 text-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary/90 dark:hover:text-primary-foreground"
          >
            <Download className="w-3 h-3" />
            Download .docx
          </Button>
        </form>
      </div>

      {/* Rapat Details Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3 text-center border px-2 py-4" colSpan={2}>
                  <img src="/danantara.png" alt="Danantara Logo" className="h-16 mx-auto object-contain dark:hidden" />
                  <img
                    src="/danantara-dark.png"
                    alt="Danantara Logo"
                    className="h-16 mx-auto object-contain hidden dark:block"
                  />
                </TableHead>
                <TableHead className="w-1/3 text-center border" colSpan={2}>
                  <h1 className="text-2xl font-bold">RISALAH RAPAT</h1>
                </TableHead>
                <TableHead className="w-1/3 text-center border px-2 py-4" colSpan={2}>
                  <img src="/pal.png" alt="PAL Logo" className="h-16 mx-auto object-contain" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Row 2: Agenda and Nomor */}
              <TableRow>
                <TableCell className="border align-top" colSpan={3}>
                  <p className="font-semibold">Agenda:</p>
                  <p>{rapat.judul}</p>
                </TableCell>
                <TableCell className="border align-top py-0" colSpan={3}>
                  <Table>
                    <TableRow>
                      <TableCell className="p-1 font-semibold w-28">Nomor</TableCell>
                      <TableCell className="p-1 w-4">:</TableCell>
                      <TableCell className="p-1">{rapat.id}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="p-1 font-semibold">Hari, Tanggal</TableCell>
                      <TableCell className="p-1 w-4">:</TableCell>
                      <TableCell className="p-1">
                        {rapat.tanggal
                          ? new Date(rapat.tanggal).toLocaleDateString("id-ID", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "-"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="p-1 font-semibold">Pukul</TableCell>
                      <TableCell className="p-1 w-4">:</TableCell>
                      <TableCell className="p-1"></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="p-1 font-semibold">Tempat</TableCell>
                      <TableCell className="p-1 w-4">:</TableCell>
                      <TableCell className="p-1">{formatDate(rapat.tanggal)}</TableCell>
                    </TableRow>
                  </Table>
                </TableCell>
              </TableRow>

              {/* Row 3: Kepada Yth. and Peserta Rapat */}
              <TableRow>
                <TableCell className="border" colSpan={3}>
                  <div className="font-semibold">Kepada Yth.</div>
                </TableCell>
                <TableCell className="border" colSpan={3}>
                  <div className="font-semibold">Peserta Rapat</div>
                </TableCell>
              </TableRow>

              {/* Row 4: Summary */}
              <TableRow>
                <TableCell className="border" colSpan={6}>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-1">Ringkasan</h3>
                    {rapat.ringkasan ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Add explicit heading renderers so Markdown headings (##, ###) render
                            // correctly and with compact spacing.
                            h1: ({ node, ...props }) => <h1 className="text-lg font-semibold mt-0 mb-0" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-base font-semibold mt-0 mb-0" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-0 mb-0" {...props} />,
                            p: ({ node, ...props }) => <p className="mb-1" {...props} />,
                            br: () => <br />,
                            ol: ({ node, ...props }) => (
                              <ol className="list-decimal list-outside ml-6 mt-0 mb-1" {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul className="list-disc list-outside ml-6 mt-0 mb-1" {...props} />
                            ),
                            li: ({ node, ...props }) => <li className="pl-1 mb-0" {...props} />,
                          }}
                        >
                          {typeof rapat.ringkasan === "string"
                            ? rapat.ringkasan
                            : JSON.stringify(rapat.ringkasan, null, 2)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <svg
                          className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3"
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
                        <p className="text-muted-foreground italic">Ringkasan belum tersedia</p>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <br />
          <div className="p-4">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="border p-2">Dibuat Oleh:</TableCell>
                  <TableCell className="border p-2">Diperiksa Oleh:</TableCell>
                  <TableCell className="border p-2">Disetujui Oleh:</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="border p-2">PT PAL Indonesia</TableCell>
                  <TableCell className="border p-2">PT PAL Indonesia</TableCell>
                  <TableCell className="border p-2">PT PAL Indonesia</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="border p-2 text-muted-foreground italic">Jabatan</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Jabatan</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Jabatan</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="border p-2 text-muted-foreground italic">Tanda Tangan</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Tanda Tangan</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Tanda Tangan</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="border p-2 text-muted-foreground italic">Nama</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Nama</TableCell>
                  <TableCell className="border p-2 text-muted-foreground italic">Nama</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
