import { Card, CardContent } from "~/components/ui/card";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Sinopsis" },
    { name: "description", content: "Sistem Notulen Otomatis" },
  ];
}

export default function Home() {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-center ">
          <div className="flex flex-col items-center gap-16">
            <header className="flex flex-col items-center gap-9">
              <h1 className="text-2xl font-bold text-center">
                Selamat Datang di Sinopsis
              </h1>
              <p className="text-muted-foreground text-center max-w-md">
                Kelola rapat Anda dengan mudah melalui perekaman otomatis,
                transkripsi, identifikasi pembicara, dan pembuatan ringkasan
                secara otomatis.
                <br />
                Klik tombol <b>Rekam Rapat</b> untuk memulai perekaman rapat
                Anda.
              </p>
            </header>
            {/* <div className="max-w-[300px] w-full space-y-6 px-4">
        <div className="flex justify-center">
        <AudioRecorderButton
          onRecordingComplete={(success, fileName) => {
          // Recording completion handled silently
          }}
        />
        </div>
      </div> */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
