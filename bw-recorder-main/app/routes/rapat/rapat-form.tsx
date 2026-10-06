import { getFormProps } from "@conform-to/react";
import { Calendar } from "lucide-react";
import { Form } from "react-router";

import { AudioRecorderButton } from "~/components/audio-recorder-button";
import { AudioRecordingDiagnostic } from "~/components/audio-recording-diagnostic";
import { Field } from "~/components/conform/Field";
import { InputConform } from "~/components/conform/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";

export function RapatForm({
  form,
  fields,
  rapatData,
  isStarted,
  isFinished,
}: {
  readonly form: any;
  readonly fields: any;
  readonly rapatData?: any;
  readonly isStarted?: boolean;
  readonly isFinished?: boolean;
}) {
  let buttonLabel = "Mulai Rapat";
  if (isFinished) {
    buttonLabel = "Rapat Selesai";
  } else if (isStarted) {
    buttonLabel = "Selesai Rapat";
  }

  const actionValue = isStarted ? "finish" : "start";

  const handleButtonClick = () => {
    // This function will be called by the AudioRecorderButton
    const formElement = document.querySelector("form") as HTMLFormElement;
    if (formElement) {
      const formData = new FormData(formElement);
      const judul = formData.get("judul") as string;
      const tempat_rapat = formData.get("tempat_rapat") as string;
      const tanggal = formData.get("tanggal") as string;

      // For "start" action, validate form fields
      if (!isStarted) {
        // Basic validation check
        if (!judul || !tempat_rapat || !tanggal) {
          // Return false to prevent recording
          return false;
        }
      }

      // For both "start" and "finish" actions, submit the form
      formElement.requestSubmit();
      return true;
    }
    return false;
  };

  return (
    <div className="grid grid-cols-12 gap-2">
      <Card className="col-span-12 lg:col-span-7 md:col-span-9 sm:col-span-9">
        <CardHeader>
          <CardTitle>Buat Rekaman Rapat</CardTitle>
          <CardDescription>
            Isi detail rapat dan mulai rekaman. Setelah rapat selesai, klik "Selesai Rapat".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)}>
            <InputConform meta={fields.id} type="hidden" />
            <input type="hidden" name="action" value={actionValue} />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <Field className="md:col-span-10">
                <Label htmlFor={fields.judul.id}>Judul</Label>
                <InputConform meta={fields.judul} type="text" />
                {fields.judul.errors && <div className="text-red-500 text-sm mt-1">{fields.judul.errors}</div>}
              </Field>
            </div>
            <div className="flex flex-col md:flex-row gap-4">
              <Field className="flex-1">
                <Label htmlFor={fields.tempat_rapat.id}>Tempat</Label>
                <InputConform meta={fields.tempat_rapat} type="text" />
                {fields.tempat_rapat.errors && (
                  <div className="text-red-500 text-sm mt-1">{fields.tempat_rapat.errors}</div>
                )}
              </Field>
              <Field className="w-full md:w-[180px]">
                <Label htmlFor={fields.tanggal.id}>Tanggal</Label>
                <div className="relative">
                  <InputConform
                    meta={fields.tanggal}
                    type="text"
                    placeholder="DD-MM-YYYY"
                    pattern="\d{2}-\d{2}-\d{4}"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  />
                  <input
                    type="date"
                    id="hidden-date-picker-form"
                    className="absolute opacity-0 pointer-events-none"
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      if (dateValue) {
                        const [year, month, day] = dateValue.split("-");
                        const formattedDate = `${day}-${month}-${year}`;
                        const textInput = document.querySelector(
                          `input[name="${fields.tanggal.name}"]`
                        ) as HTMLInputElement;
                        if (textInput) {
                          textInput.value = formattedDate;
                          textInput.dispatchEvent(new Event("input", { bubbles: true }));
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const dateInput = document.getElementById("hidden-date-picker-form") as HTMLInputElement;
                      if (dateInput) {
                        dateInput.showPicker?.();
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    <Calendar className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                {fields.tanggal.errors && <div className="text-red-500 text-sm mt-1">{fields.tanggal.errors}</div>}
              </Field>
            </div>
            <div className="max-w-[300px] w-full space-y-6 px-4 mx-auto">
              <div className="flex justify-center">
                <AudioRecorderButton
                  mode="form-submit"
                  submitLabel={buttonLabel}
                  disabled={isFinished}
                  onFormSubmit={handleButtonClick}
                  rapatId={rapatData?.id ? String(rapatData.id) : undefined}
                  autoStart={isStarted && !!rapatData?.id}
                  onRecordingComplete={(success, fileName) => {
                    // Recording completion handled silently
                  }}
                />
              </div>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* Audio Recording Diagnostic Panel */}
      <AudioRecordingDiagnostic />
    </div>
  );
}
