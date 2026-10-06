import prisma from "prisma/client.server";

export async function createRapatChunk(
  rapatId: number,
  urutanChunk: number,
  lokasiFileAudio: string,
  namaFileAudio: string
) {
  return await prisma.rapat_chunk.create({
    data: {
      urutan_chunk: urutanChunk,
      lokasi_file_audio: lokasiFileAudio,
      nama_file_audio: namaFileAudio,
      rapat_id: rapatId,
    },
  });
}
