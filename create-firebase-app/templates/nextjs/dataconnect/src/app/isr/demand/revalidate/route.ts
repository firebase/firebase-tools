import { revalidatePath } from "next/cache";

export function POST() {
  revalidatePath("/isr/demand");

  return new Response(null, { status: 200 });
}
