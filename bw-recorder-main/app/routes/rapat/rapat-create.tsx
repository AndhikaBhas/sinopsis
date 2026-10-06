import { useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useSearchParams,
} from "react-router";
import { z } from "zod";
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";
import { upsertRapat } from "~/models/rapat.server";
import { RapatForm } from "./rapat-form";

const schema = z.object({
  id: z.number().optional(),
  judul: z.string({ message: "Kolom judul harus diisi" }),
  tempat_rapat: z.string({ message: "Kolom tempat rapat harus diisi" }),
  tanggal: z.string({ message: "Kolom tanggal harus diisi" }),
  action: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  // Require permission to create rapat
  await requirePermission(user, "rapat.create");

  return { user };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  // Require permission to create rapat
  await requirePermission(user, "rapat.create");

  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema });

  if (submission.status !== "success") {
    return submission.reply();
  }

  const { judul, tempat_rapat, tanggal, action: actionType } = submission.value;
  const url = new URL(request.url);

  const myId = url.searchParams.get("id") ? Number.parseInt(url.searchParams.get("id")!) : null;

  // Convert date from DD-MM-YYYY to YYYY-MM-DD format and add time for valid DateTime
  const convertDateToISO = (dateStr: string): string => {
    const [day, month, year] = dateStr.split("-");
    return `${year}-${month}-${day}T00:00:00.000Z`;
  };

  const tanggalISO = convertDateToISO(tanggal);

  let data;
  if (actionType === "start") {
    // First click: Create new rapat with status 1 (ongoing)
    // Pass 0 (non-existent ID) to force create
    data = await upsertRapat(0, judul, tempat_rapat, 1, tanggalISO);

    // Redirect to same page with rapat ID and started flag
    // Also include form data in URL to preserve state
    url.searchParams.set("id", data.id.toString());
    url.searchParams.set("started", "true");
    url.searchParams.set("judul", judul);
    url.searchParams.set("tempat_rapat", tempat_rapat);
    url.searchParams.set("tanggal", tanggal);
    return redirect(url.toString());
  } else if (actionType === "finish" && myId) {
    // Second click: Update existing rapat with status 2 (finished)
    // Pass the existing ID for update
    await upsertRapat(myId, judul, tempat_rapat, 2, tanggalISO);

    // Redirect to /rapat route (list page)
    return redirect("/rapat");
  }

  if (!data) {
    return submission.reply({
      formErrors: ["Data belum berhasil disimpan"],
    });
  }

  // Default behavior: redirect back
  const currentUrl = request.headers.get("Referer") ?? "/";
  const backUrl = currentUrl.split("/").slice(0, -1).join("/");
  return redirect(backUrl);
}

export default function RapatCreate() {
  const lastResult = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  // Get state from search params
  const rapatIdParam = searchParams.get("id");
  const isStarted = searchParams.get("started") === "true";
  const isFinished = searchParams.get("finished") === "true";

  // Get form values from URL params (preserved after redirect)
  const judulFromUrl = searchParams.get("judul");
  const tempatRapatFromUrl = searchParams.get("tempat_rapat");
  const tanggalFromUrl = searchParams.get("tanggal");

  // Get today's date in DD-MM-YYYY format
  const today = (() => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  })();

  // Determine default values for form
  let defaultValue;
  let rapatData;
  if (rapatIdParam) {
    const rapatId = Number.parseInt(rapatIdParam);
    defaultValue = {
      id: rapatId,
      // Restore form values from URL if available
      judul: judulFromUrl || undefined,
      tempat_rapat: tempatRapatFromUrl || undefined,
      tanggal: tanggalFromUrl || today,
    };
    rapatData = { id: rapatId };
  } else {
    // Set default value for new form
    defaultValue = {
      tanggal: today,
    };
  }

  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(schema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    shouldRevalidate: "onInput",
    defaultNoValidate: false,
    defaultValue,
  });

  return <RapatForm form={form} fields={fields} rapatData={rapatData} isStarted={isStarted} isFinished={isFinished} />;
}
