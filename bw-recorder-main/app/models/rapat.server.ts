import prisma from "../../prisma/client.server";

export async function getAllRapat(page: number = 1, pageSize: number = 10) {
  try {
    const offset = (page - 1) * pageSize;

    const [data, totalCount] = (await Promise.all([
      prisma.$queryRaw`
        SELECT 
          id,
          judul,
          tempat_rapat,
          status_rapat,
          tanggal,
          CASE
            WHEN transkrip IS NOT NULL AND transkrip <> '{}' AND transkrip <> '[]' THEN 1
            ELSE 0
          END AS status_transkrip,
          CASE
            WHEN diarisasi IS NOT NULL AND diarisasi <> '{}' AND diarisasi <> '[]' THEN 1
            ELSE 0
          END AS status_diarisasi,
          CASE
            WHEN diarisasi_transkrip IS NOT NULL AND diarisasi_transkrip <> '{}'
                  AND diarisasi_transkrip <> '[]' THEN 1
            ELSE 0
          END AS status_diarisasi_transkrip,
          CASE
            WHEN ringkasan IS NOT NULL AND ringkasan <> '{}' AND ringkasan <> '[]' THEN 1
            ELSE 0
          END AS status_ringkasan
        FROM rapat
        ORDER BY id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      prisma.$queryRaw`SELECT COUNT(*) as count FROM rapat`,
    ])) as [any[], any[]];

    const total = Number(totalCount[0]?.count || 0);

    return {
      data,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (err) {
    console.error("getAllRapat DB error:", err);
    return {
      data: [],
      pagination: {
        currentPage: 1,
        pageSize,
        totalItems: 0,
        totalPages: 0,
      },
    };
  }
}

export async function getRapatById(id: number) {
  const rapat = await prisma.rapat.findUnique({
    where: { id },
  });
  return rapat;
}

export async function upsertRapat(
  id: number,
  judul: string,
  tempat_rapat?: string,
  status_rapat: number = 0,
  tanggal?: string
) {
  try {
    const rapat = await prisma.rapat.upsert({
      where: { id }, // unique check by primary key
      update: {
        judul,
        tempat_rapat,
        status_rapat,
        tanggal,
      },
      create: {
        judul,
        tempat_rapat,
        status_rapat,
        tanggal,
      },
    });

    // Clear cache since data changed
    return rapat;
  } catch (error) {
    console.error("❌ Database error in upsertRapat:", error);
    throw error;
  }
}

export async function deleteRapat(id: number) {
  try {
    const rapat = await prisma.rapat.delete({
      where: { id },
    });

    // Clear cache since data changed
    return rapat;
  } catch (error) {
    console.error("❌ Database error in deleteRapat:", error);
    throw error;
  }
}

export async function getTranscriptById(id: number) {
  try {
    const rapat = await prisma.rapat.findUnique({
      where: { id },
      select: {
        id: true,
        judul: true,
        transkrip: true,
      },
    });
    return rapat;
  } catch (error) {
    console.error("❌ Database error in getTranscriptById:", error);
    throw error;
  }
}

export async function getDiarisasiById(id: number) {
  try {
    const rapat = await prisma.rapat.findUnique({
      where: { id },
      select: {
        id: true,
        judul: true,
        diarisasi: true,
      },
    });
    return rapat;
  } catch (error) {
    console.error("❌ Database error in getDiarisasiById:", error);
    throw error;
  }
}

export async function getDiarisasiTranscriptById(id: number) {
  try {
    const rapat = await prisma.rapat.findUnique({
      where: { id },
      select: {
        id: true,
        judul: true,
        diarisasi_transkrip: true,
      },
    });
    return rapat;
  } catch (error) {
    console.error("❌ Database error in getDiarisasiTranscriptById:", error);
    throw error;
  }
}

export async function getRingkasanById(id: number) {
  try {
    const rapat = await prisma.rapat.findUnique({
      where: { id },
      select: {
        id: true,
        judul: true,
        ringkasan: true,
      },
    });
    return rapat;
  } catch (error) {
    console.error("❌ Database error in getRingkasanById:", error);
    throw error;
  }
}
