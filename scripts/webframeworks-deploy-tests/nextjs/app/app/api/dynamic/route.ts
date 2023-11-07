import { headers } from 'next/headers';

export async function GET() {
    const _ = headers();
    return new Response(JSON.stringify([1, 2, 3]), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "custom-header": "custom-value-2",
      },
    });
  }
  